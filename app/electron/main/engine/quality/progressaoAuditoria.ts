/**
 * app/electron/main/engine/quality/progressaoAuditoria.ts — o ORQUESTRADOR da
 * bateria A13–A16: guarda JS-only, pré-computação de Demo(i)/Cum(i) e a
 * composição regra-a-regra por aula.
 *
 * A prosa normativa vive na fachada `progressao.ts`. Refatoração L04: arquivo
 * ≤500 linhas e toda função com CC≤8, sem mudança de comportamento observável.
 */

import type { AtomKey } from '../atomKeys';
import { exigirAdaptadorJavascript } from '../extract';
import {
  DEFAULT_ADAPTER_ID,
  type LanguageId,
} from '../lang/registry';
import type { BudgetSource } from '../budget';
import type {
  ProgressaoLessonInput,
  ProgressaoOptions,
  ProgressaoResult,
  ProgressaoViolation,
} from './progressaoTipos';
import { type DemoDaAula, demoDaAula } from './progressaoDemo';
import {
  type AulaEmMedicao,
  calcularNovos,
  checarA13d,
  checarA14a,
  checarA14aDeclared,
  checarDesafio,
  medirDesafio,
} from './progressaoRegras';
import { checarA15a, checarA15b, checarA16 } from './progressaoRegrasAvanco';

/** O estado pré-computado da bateria (Demo/Cum/primeira demonstração). */
export interface EstadoDaBateria {
  adapterId: LanguageId;
  demos: DemoDaAula[];
  cumulativo: Set<AtomKey>[];
  primeiraDemonstracao: Map<AtomKey, string>;
  mode: BudgetSource;
}

/** As opções já normalizadas (defaults aplicados). */
interface OpcoesNormalizadas {
  tetoNovos: number;
  tetoIntroduces: number;
  minimoReuso: number;
  predecessorImediato: boolean;
}

function normalizarOpcoes(options: ProgressaoOptions): OpcoesNormalizadas {
  return {
    tetoNovos: options.tetoNovos ?? 4,
    tetoIntroduces: options.tetoIntroducesProductive ?? 2,
    minimoReuso: options.minimoReuso ?? 1,
    predecessorImediato: options.predecessorImediato ?? false,
  };
}

/** A pré-computação: Demo(i), Cum(i) e a primeira demonstração da trilha. */
export function preComputarEstado(
  aulas: readonly ProgressaoLessonInput[],
  adapterId: LanguageId,
  mode: BudgetSource,
): EstadoDaBateria {
  const demos = aulas.map((a) => demoDaAula(a.theory, adapterId));
  const cumulativo: Set<AtomKey>[] = aulas.map(() => new Set<AtomKey>());
  {
    const acumulado = new Set<AtomKey>();
    aulas.forEach((a, i) => {
      cumulativo[i] = new Set(acumulado);
      for (const k of demos[i].chaves) acumulado.add(k);
    });
  }
  const primeiraDemonstracao = new Map<AtomKey, string>();
  aulas.forEach((a, i) => {
    for (const k of demos[i].chaves) {
      if (!primeiraDemonstracao.has(k)) primeiraDemonstracao.set(k, a.ref);
    }
  });
  return { adapterId, demos, cumulativo, primeiraDemonstracao, mode };
}

/** O `introduces` da aula no modo declared (e o conjunto das chaves dele). */
function declaradasDaAula(
  aula: ProgressaoLessonInput,
  mode: BudgetSource,
): { declarada: { productive?: AtomKey[]; receptive?: AtomKey[] } | null; chavesDeclaradas: Set<AtomKey> } {
  const declarada = mode === 'declared' ? (aula.declared ?? null) : null;
  const chavesDeclaradas = new Set<AtomKey>([
    ...(declarada?.productive ?? []),
    ...(declarada?.receptive ?? []),
  ]);
  return { declarada, chavesDeclaradas };
}

/** Mede UMA aula, regra a regra, na ordem em que a bateria reprova. */
export function medirAula(
  aula: ProgressaoLessonInput,
  i: number,
  estado: EstadoDaBateria,
  opcoes: OpcoesNormalizadas,
): { violations: ProgressaoViolation[]; novos: number } {
  const demo = estado.demos[i].chaves;
  const cum = estado.cumulativo[i];
  const { declarada, chavesDeclaradas } = declaradasDaAula(aula, estado.mode);
  const novo = calcularNovos(demo, cum, chavesDeclaradas);
  const ctx: AulaEmMedicao = {
    aula,
    index: i,
    adapterId: estado.adapterId,
    demo,
    cum,
    primeiraDemonstracao: estado.primeiraDemonstracao,
    declarada,
    chavesDeclaradas,
    novo,
  };

  const violations: ProgressaoViolation[] = [];

  // ── A14a — teto por aula ───────────────────────────────────────────────
  violations.push(...checarA14a(ctx, opcoes.tetoNovos));

  // ── A14a (declared) — introduces.productive > 2 (a A7/I2 no conteúdo real) ──
  violations.push(...checarA14aDeclared(ctx, opcoes.tetoIntroduces));

  // ── A13d — declarar não é demonstrar (só declared) ─────────────────────
  violations.push(...checarA13d(ctx));

  // ── por desafio (A13a/A13b/A13c/A14b) ─────────────────────────────────
  for (const desafio of aula.challenges) {
    violations.push(...checarDesafio(ctx, desafio, medirDesafio(desafio, estado.adapterId)));
  }

  // ── A15a — degrau INTRA-aula (com ≥ 2 desafios) ────────────────────────
  violations.push(...checarA15a(aula, demo, cum, estado.adapterId));

  // ── A15b — arco INTEr-aula (i ≥ 1; a aula 1 é o axioma) ────────────────
  violations.push(
    ...checarA15b(
      aula,
      i,
      estado.demos,
      cum,
      estado.adapterId,
      opcoes.predecessorImediato,
      opcoes.minimoReuso,
    ),
  );

  // ── A16 — primeira atividade resolvível com a seção inicial ────────────
  violations.push(
    ...checarA16(
      aula,
      i,
      estado.demos,
      cum,
      estado.adapterId,
      estado.primeiraDemonstracao,
    ),
  );

  return { violations, novos: novo.size };
}

/**
 * Audita uma sequência de aulas (ordem pedagógica) contra a bateria A13–A16.
 *
 * PURO: mesma entrada, mesma saída. Não abre arquivo, não vai à rede, não
 * chama LLM. Devolve as violações no formato do `audit.ts` (que as mescla) e o
 * `Novo(i)` por aula (para o placar e para o A14b).
 */
export function auditarProgressao(aulas: ProgressaoLessonInput[], options: ProgressaoOptions = {}): ProgressaoResult {
  const opcoes = normalizarOpcoes(options);
  const mode: BudgetSource = options.mode ?? (aulas.some((a) => a.declared) ? 'declared' : 'inferred');
  // GUARDA EXPLÍCITA (onda 5): esta bateria é JAVASCRIPT-ONLY por DUAS razões
  // que não se resolvem trocando o parser — `H13`/`AX` são tabelas de chaves do
  // AST do TypeScript e do runner `node:test`, e os spans mecânicos S13
  // (`spansMecanicos`) são calculados com `ts.createSourceFile`. Rodá-la numa
  // trilha de outra linguagem não daria erro: daria um veredito ERRADO E
  // SILENCIOSO (tudo "não demonstrado", todo desafio reprovado). Falha alto.
  const adapterId = exigirAdaptadorJavascript(
    'engine/quality/progressao.ts (bateria A13–A16)',
    'H13/AX são chaves do AST do TypeScript e do runner node:test, e os spans mecânicos S13 são calculados com ts.createSourceFile',
    options.adapterId ?? DEFAULT_ADAPTER_ID,
  ).id;

  const estado = preComputarEstado(aulas, adapterId, mode);
  const violations: ProgressaoViolation[] = [];
  const novosPorAula = new Map<string, number>();

  aulas.forEach((aula, i) => {
    const medido = medirAula(aula, i, estado, opcoes);
    novosPorAula.set(aula.ref, medido.novos);
    violations.push(...medido.violations);
  });

  return { violations, novosPorAula };
}
