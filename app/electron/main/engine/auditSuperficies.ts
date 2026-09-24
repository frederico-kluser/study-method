/**
 * app/electron/main/engine/auditSuperficies.ts — as SUPERFÍCIES do desafio e a
 * ponte para as baterias A13–A16 / A17–A23. Extraído do módulo `audit.ts`
 * original na refatoração do lote L05 sem NENHUMA mudança de comportamento.
 */

import type { LoadedTrack } from '../content/trackLoader';
import type { TrackChallengeSource } from '../content/trackTypes';
import type { AtomKey } from './atomKeys';
import type { LessonBudget, TrackBudget } from './budget';
import { extractAtoms } from './extract';
import type { AchadoDaBarra } from './quality/barra';
import { auditarBarra } from './quality/barra';
import {
  auditarProgressao,
  type ProgressaoLessonInput,
  type ProgressaoResult,
} from './quality/progressao';
import { DEFAULT_ADAPTER_ID, type LanguageId } from './lang/registry';
import type { BudgetRule, Surface, Violation } from './auditTypes';

type MetricaDaBarra = ReturnType<typeof auditarBarra>['metricas'][number];

/** Campo de código opcional do challenge.json — ausente vira string vazia. */
function textoOpcional(valor: string | undefined): string {
  return valor ?? '';
}

/** Superfícies de código de um desafio, já achatando o formato multi-arquivo. */
export function challengeSurfaces(challenge: TrackChallengeSource): Array<{ surface: Surface; code: string; label: string }> {
  const out: Array<{ surface: Surface; code: string; label: string }> = [];
  if (Array.isArray(challenge.files) && challenge.files.length > 0) {
    for (const file of challenge.files) {
      out.push({ surface: 'starterCode', code: textoOpcional(file.starterCode), label: `files[${file.path}].starterCode` });
      out.push({ surface: 'solutionCode', code: textoOpcional(file.solutionCode), label: `files[${file.path}].solutionCode` });
    }
  } else {
    out.push({ surface: 'starterCode', code: textoOpcional(challenge.starterCode), label: 'starterCode' });
    out.push({ surface: 'solutionCode', code: textoOpcional(challenge.solutionCode), label: 'solutionCode' });
  }
  out.push({ surface: 'testsCode', code: textoOpcional(challenge.testsCode), label: 'testsCode' });
  return out;
}

/** O orçamento que vale para cada superfície (a assimetria do cabeçalho). */
export function allowedFor(
  surface: Surface,
  budget: LessonBudget,
): { set: ReadonlySet<AtomKey>; faixa: 'receptive' | 'productive'; rule: BudgetRule } {
  switch (surface) {
    case 'solutionCode':
      return { set: budget.saida.productive, faixa: 'productive', rule: 'A2' };
    case 'testsCode':
      return { set: budget.entrada.receptive, faixa: 'receptive', rule: 'A3' };
    case 'theory':
      return { set: budget.saida.receptive, faixa: 'receptive', rule: 'A4' };
    default:
      return { set: budget.saida.receptive, faixa: 'receptive', rule: 'A1' };
  }
}

/**
 * As chaves do starterCode de um desafio.
 *
 * O que o aluno tem de ESCREVER é o DIFF starter → solução, não o arquivo
 * inteiro. O `starterCode` já vem pronto com a assinatura (`export function
 * cumprimentar(nome) {`) e o aluno só preenche o corpo; cobrar dele o
 * `export` que ele nunca digita é violação inventada.
 *
 * Nada se perde ao subtrair: o que o starter mostra continua sendo
 * checado — pela regra A1, contra o orçamento RECEPTIVO. Muda a atribuição
 * do defeito, não a sua detecção.
 */
export function chavesDeStarter(
  superficies: ReadonlyArray<{ surface: Surface; code: string; label: string }>,
  challengeFile: string,
  adapterId: LanguageId,
): Set<AtomKey> {
  const starterKeys = new Set<AtomKey>();
  for (const s of superficies) {
    if (s.surface !== 'starterCode' || s.code.trim().length === 0) continue;
    const r = extractAtoms(s.code, { fileName: `${challengeFile}#${s.label}`, language: adapterId });
    if (r.ok) for (const key of r.keys) starterKeys.add(key);
  }
  return starterKeys;
}

/**
 * Achata a trilha carregada na entrada da bateria A13–A16. Desafios
 * MULTI-ARQUIVO viram N entradas `files` (com os próprios starter/solution);
 * o arquivo único vira uma entrada `solution.mjs`.
 */
export function entradaDeProgressao(track: LoadedTrack): ProgressaoLessonInput[] {
  const out: ProgressaoLessonInput[] = [];
  for (const mod of track.modules) {
    for (const lesson of mod.lessons) {
      const baseDir = `modules/${mod.meta.slug}/lessons/${lesson.meta.slug}`;
      const ref = `${mod.meta.slug}/${lesson.meta.slug}`;
      out.push({
        ref,
        baseDir,
        theory: lesson.meta.theory ?? [],
        declared: (lesson.meta as { introduces?: unknown }).introduces as ProgressaoLessonInput['declared'],
        challenges: lesson.challenges.map((challenge) => {
          const desafioFile = `${baseDir}/challenges/${challenge.slug}/challenge.json`;
          const files =
            Array.isArray(challenge.files) && challenge.files.length > 0
              ? challenge.files.map((f) => ({ path: f.path, starter: f.starterCode ?? '', solution: f.solutionCode ?? '' }))
              : [{ path: 'solution.mjs', starter: challenge.starterCode ?? '', solution: challenge.solutionCode ?? '' }];
          return { slug: challenge.slug, desafioFile, files, tests: challenge.testsCode ?? '' };
        }),
      });
    }
  }
  return out;
}

/**
 * A bateria A13–A16 vale para esta linguagem?
 *
 * É a MESMA pergunta que `quality/progressao.ts` responde com uma exceção
 * (`exigirAdaptadorJavascript`) — feita aqui ANTES de chamar, para que a
 * auditoria de uma trilha de outra linguagem perca a bateria em vez de perder
 * a auditoria inteira. Não afrouxa nada: a bateria continua javascript-only, e
 * chamá-la com outra linguagem continua LANÇANDO.
 */
export function bateriaDeProgressaoValePara(adapterId: LanguageId): boolean {
  return adapterId === DEFAULT_ADAPTER_ID;
}

/**
 * A BARRA A17–A23 vale para este ORÇAMENTO?
 *
 * Vale em `declared`, e NÃO vale em `inferred` — e a razão é a mesma classe de
 * razão que faz a bateria A13–A16 ser javascript-only: rodá-la no modo errado
 * não daria erro, daria VEREDITO ERRADO E SILENCIOSO. Medido em 2026-09-22:
 *
 *   1. A19 ("declarar não é demonstrar") é VAZIA por construção em `inferred`:
 *      ali o conjunto de chaves novas SAI dos blocos de teoria da própria aula
 *      (`budget.ts:253-278`), então toda chave nova está, por definição,
 *      demonstrada. A regra nunca dispararia — e quem lê o placar concluiria
 *      "toda declaração tem demonstração".
 *   2. A23 (a regra do par) é INDECLARÁVEL em `inferred`: declarar
 *      `introduces.derived` na aula faz `deriveTrackBudget` mudar o modo para
 *      `declared` (`budget.ts:225` — `anyDeclared` testa a PRESENÇA do campo
 *      `introduces`, não o seu conteúdo). Sem o colapso da regra do par,
 *      A17/A18/A21 contam chave por chave.
 *   3. E contar chave por chave reprova TUDO, sem reescrita que aprove: UMA
 *      linha de JavaScript introduz 4 construções fora do axioma estrutural —
 *      `const tipo = typeof 10;` → `decl:const`, `node:NumericLiteral`,
 *      `node:TypeOfExpression`, `op:unary:typeof` (reproduz com
 *      `extractAtoms` + `structuralAlwaysAllowed('javascript')`). O teto da
 *      aula 1 (A18) é 1: nenhuma aula 1 de trilha inferida passaria, nem a
 *      perfeita.
 *
 * As TRÊS trilhas do produto declaram `introduces` e auditam em `declared` (é o
 * que o contrato A5/A7 exige do autor), então a barra roda onde ela mede
 * conteúdo de verdade: `npm run engine -- audit python-iniciante --limite 0
 * --json` → `budgetSource: "declared"`, `totals.errosDaBarra: 0`. Quem quiser a
 * barra numa trilha sem declaração força o modo: `--modo declared`.
 */
export function barraValePara(source: TrackBudget['source']): boolean {
  return source === 'declared';
}

export function severidadeDe(v: Violation): 'erro' | 'aviso' {
  return v.severidade ?? 'erro';
}

// ─── as baterias (A13–A16 e A17–A23), rodam UMA vez sobre a trilha ───────────

/** O resultado da bateria A13–A16, com os índices que o loop por aula usa. */
export interface BateriaDeProgressao {
  bateriaRodou: boolean;
  progressao: ProgressaoResult;
  progressaoPorRef: Map<string, ReturnType<typeof auditarProgressao>['violations']>;
  desafiosProgressao: Set<string>;
}

export function rodarBateriaDeProgressao(track: LoadedTrack, budget: TrackBudget): BateriaDeProgressao {
  // ONDA 7 — ELA NÃO VALE PARA TODA LINGUAGEM, E POR ISSO É CONDICIONAL.
  // `quality/progressao.ts:432` LANÇA `EngineLinguagemError` para qualquer
  // adaptador que não seja o default (a guarda é o mesmo id que a própria
  // bateria aceita): rodada em outra linguagem daria veredito ERRADO E
  // SILENCIOSO, e até a onda 6 a chamada incondicional MATAVA a auditoria
  // inteira. Quando não vale, a bateria é PULADA e o resto audita.
  const bateriaRodou = bateriaDeProgressaoValePara(budget.adapterId);
  const progressao: ProgressaoResult = bateriaRodou
    ? auditarProgressao(entradaDeProgressao(track), {
        mode: budget.source,
        adapterId: budget.adapterId,
      })
    : { violations: [], novosPorAula: new Map<string, number>() };

  const progressaoPorRef = new Map<string, ReturnType<typeof auditarProgressao>['violations']>();
  for (const pv of progressao.violations) {
    const lista = progressaoPorRef.get(pv.ref) ?? [];
    lista.push(pv);
    progressaoPorRef.set(pv.ref, lista);
  }
  const desafiosProgressao = new Set<string>();
  for (const pv of progressao.violations) {
    if (pv.desafioFile && pv.severidade === 'erro') desafiosProgressao.add(pv.desafioFile);
  }
  return { bateriaRodou, progressao, progressaoPorRef, desafiosProgressao };
}

/** O resultado da barra A17–A23, com os índices que o loop por aula usa. */
export interface BarraDaAuditoria {
  barraRodou: boolean;
  barra: ReturnType<typeof auditarBarra> | null;
  barraPorRef: Map<string, AchadoDaBarra[]>;
  metricaDaBarraPorRef: Map<string, MetricaDaBarra>;
}

export function rodarBarra(track: LoadedTrack, budget: TrackBudget): BarraDaAuditoria {
  // SEM try/catch, de propósito: a barra re-deriva o MESMO orçamento que
  // `deriveTrackBudget` derivou com sucesso; um lançamento aqui é BUG do gate
  // (tem de ser ALTO), não indisponibilidade de ambiente. `modo: budget.source`
  // passa o modo JÁ RESOLVIDO — as duas réguas têm de medir UM orçamento.
  const barraRodou = barraValePara(budget.source);
  const barra = barraRodou ? auditarBarra(track, { modo: budget.source }) : null;
  const barraPorRef = new Map<string, AchadoDaBarra[]>();
  for (const achado of barra?.achados ?? []) {
    const lista = barraPorRef.get(achado.ref) ?? [];
    lista.push(achado);
    barraPorRef.set(achado.ref, lista);
  }
  const metricaDaBarraPorRef = new Map((barra?.metricas ?? []).map((m) => [m.ref, m]));
  return { barraRodou, barra, barraPorRef, metricaDaBarraPorRef };
}
