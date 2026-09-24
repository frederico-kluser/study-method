/**
 * app/electron/main/engine/quality/progressaoRegras.ts — as REGRAS da bateria
 * A13–A16 por aula e por desafio (A13a/b/c/d, A14a/A14a-declared, A14b), na
 * ordem em que reprovam. A progressividade (A15a/A15b) e a primeira atividade
 * (A16) vivem em `progressaoRegrasAvanco.ts`.
 *
 * A prosa normativa (a fórmula de cada regra e as mensagens da spec) vive na
 * fachada `progressao.ts`. Refatoração L04: arquivo ≤500 linhas e toda função
 * com CC≤8, sem mudança de comportamento observável.
 */

import type { AtomKey } from '../atomKeys';
import { axisOf, humanLabel } from '../atomKeys';
import { extractAllOccurrences, type AtomOccurrence } from '../extract';
import type { LanguageId } from '../lang/registry';
import {
  AVISO13,
  H13_SET,
} from './progressaoVocab';
import type {
  CampoProgressao,
  ProgressaoDesafioInput,
  ProgressaoLessonInput,
  ProgressaoViolation,
} from './progressaoTipos';
import { estaDentro, spansMecanicosDeTeste } from './progressaoSpans';
import { construcoesDaLinha } from './progressaoDemo';

/** Demo(i) ∪ Cum(i) ∪ H13 — o que a atividade pode usar sem violar A13. */
export function demoMaisCumMaisH13(
  demo: ReadonlySet<AtomKey>,
  cum: ReadonlySet<AtomKey>,
  k: AtomKey,
): boolean {
  return demo.has(k) || cum.has(k) || H13_SET.has(k);
}

/** O recorte de uma aula que as regras consultam. */
export interface AulaEmMedicao {
  aula: ProgressaoLessonInput;
  index: number;
  /** o adaptador da trilha (quem parseia superfícies e blocos). */
  adapterId: LanguageId;
  /** Demo(i). */
  demo: ReadonlySet<AtomKey>;
  /** Cum(i). */
  cum: ReadonlySet<AtomKey>;
  /** a primeira aula que demonstra cada chave (para as mensagens). */
  primeiraDemonstracao: ReadonlyMap<AtomKey, string>;
  /** `introduces` declarado (só no modo declared). */
  declarada: { productive?: AtomKey[]; receptive?: AtomKey[] } | null;
  chavesDeclaradas: Set<AtomKey>;
  /** Novo(i) = (Demo ∪ InitDecl) \ Cum \ (AX ∪ H13) — "verdadeiramente novos". */
  novo: Set<AtomKey>;
}

/** Novo(i) = (Demo ∪ InitDecl) \ Cum \ (AX ∪ H13) — "verdadeiramente novos". */
export function calcularNovos(
  demo: ReadonlySet<AtomKey>,
  cum: ReadonlySet<AtomKey>,
  chavesDeclaradas: ReadonlySet<AtomKey>,
): Set<AtomKey> {
  const novo = new Set<AtomKey>();
  for (const k of [...demo, ...chavesDeclaradas]) {
    if (!cum.has(k) && !H13_SET.has(k)) novo.add(k);
  }
  return novo;
}

// ---------------------------------------------------------------------------
// A14a / A14a-declared / A13d — a aula inteira
// ---------------------------------------------------------------------------

function baseDeAula(
  aula: ProgressaoLessonInput,
  regra: ProgressaoViolation['regra'],
): Omit<ProgressaoViolation, 'trechoOfensor' | 'mensagem' | 'severidade'> {
  return {
    regra,
    arquivo: `${aula.baseDir}/lesson.json`,
    ref: aula.ref,
    campo: 'lesson',
    linha: 1,
    coluna: 1,
    construcao: null,
    eixo: null,
    faixa: null,
    primeiraAulaQueEnsina: null,
  };
}

/** ── A14a — teto por aula (0 ⇒ aviso; > teto ⇒ erro) ───────────────────── */
export function checarA14a(ctx: AulaEmMedicao, tetoNovos: number): ProgressaoViolation[] {
  const { aula, novo } = ctx;
  if (novo.size === 0) {
    return [
      {
        ...baseDeAula(aula, 'A14a'),
        trechoOfensor: '',
        severidade: 'aviso',
        mensagem: `\`${aula.ref}\` não introduz NENHUMA construção nova — aula sem incremento; se é aula de revisão, marque \`role\` adequado, senão falta conteúdo novo (A12)`,
      },
    ];
  }
  if (novo.size > tetoNovos) {
    return [
      {
        ...baseDeAula(aula, 'A14a'),
        trechoOfensor: [...novo].sort().join(', '),
        severidade: 'erro',
        mensagem:
          `\`${aula.ref}\` introduz ${novo.size} construções verdadeiramente novas — acima do teto de ${tetoNovos} (§3.6/A12). ` +
          `O histograma aponta penhasco: divida a aula em ${Math.ceil(novo.size / tetoNovos)} (ou reordene o grafo)`,
      },
    ];
  }
  return [];
}

/** ── A14a (declared) — introduces.productive > 2 (a A7/I2 no conteúdo real) ── */
export function checarA14aDeclared(ctx: AulaEmMedicao, tetoIntroduces: number): ProgressaoViolation[] {
  const { aula, declarada } = ctx;
  if (declarada && (declarada.productive ?? []).length > tetoIntroduces) {
    const produtivas = declarada.productive ?? [];
    return [
      {
        ...baseDeAula(aula, 'A14a'),
        trechoOfensor: produtivas.join(', '),
        severidade: 'erro',
        mensagem: `\`${aula.ref}\` declara ${produtivas.length} construções produtivas em introduces — máximo ${tetoIntroduces} (A7/I2)`,
      },
    ];
  }
  return [];
}

/** ── A13d — declarar não é demonstrar (só declared) ────────────────────── */
export function checarA13d(ctx: AulaEmMedicao): ProgressaoViolation[] {
  const { aula, demo, cum, chavesDeclaradas } = ctx;
  const out: ProgressaoViolation[] = [];
  for (const k of chavesDeclaradas) {
    if (demo.has(k) || cum.has(k)) continue;
    out.push({
      regra: 'A13d',
      arquivo: `${aula.baseDir}/lesson.json`,
      ref: aula.ref,
      campo: 'lesson',
      linha: 1,
      coluna: 1,
      construcao: k,
      eixo: axisOf(k),
      faixa: null,
      trechoOfensor: k,
      primeiraAulaQueEnsina: aula.ref, // introduzida POR DECLARAÇÃO — não é lacuna de currículo
      severidade: 'erro',
      mensagem:
        `${humanLabel(k)} está declarado em introduces de \`${aula.ref}\`, mas não aparece em NENHUM bloco de código da teoria — ` +
        'declarar não é demonstrar (A5/A13d). Escreva o exemplo ou remova da declaração',
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// A13 / A14b — por desafio (e por arquivo)
// ---------------------------------------------------------------------------

/** Escrito(i) / Lido(i) / LidoAntes(i), por arquivo — já extraídos. */
export interface DesafioMedido {
  starterKeysPorArquivo: Set<AtomKey>[];
  starterOcorrenciasPorArquivo: AtomOccurrence[][];
  solutionOcorrenciasPorArquivo: AtomOccurrence[][];
  solutionKeysPorArquivo: Set<AtomKey>[];
  linhasDoStarterPorArquivo: Set<string>[];
}

export function medirDesafio(desafio: ProgressaoDesafioInput, adapterId: LanguageId): DesafioMedido {
  const medido: DesafioMedido = {
    starterKeysPorArquivo: [],
    starterOcorrenciasPorArquivo: [],
    solutionOcorrenciasPorArquivo: [],
    solutionKeysPorArquivo: [],
    linhasDoStarterPorArquivo: [],
  };

  for (const arquivo of desafio.files) {
    const sKeys = new Set<AtomKey>();
    const rStarter = extractAllOccurrences(arquivo.starter, { language: adapterId });
    if (rStarter.ok) {
      for (const occ of rStarter.occurrences) sKeys.add(occ.key);
      medido.starterOcorrenciasPorArquivo.push(rStarter.occurrences);
    } else {
      // starter que não parseia: o AUDIT A1 já reporta; aqui nada a re-portar
      // (o trecho não emitiria átomos confiáveis).
      medido.starterOcorrenciasPorArquivo.push([]);
    }
    medido.starterKeysPorArquivo.push(sKeys);

    const rSol = extractAllOccurrences(arquivo.solution, { language: adapterId });
    if (rSol.ok) {
      medido.solutionOcorrenciasPorArquivo.push(rSol.occurrences);
      medido.solutionKeysPorArquivo.push(new Set(rSol.keys));
    } else {
      medido.solutionOcorrenciasPorArquivo.push([]);
      medido.solutionKeysPorArquivo.push(new Set());
    }

    const linhas = new Set<string>();
    for (const linha of arquivo.starter.split('\n')) linhas.add(linha.trim());
    medido.linhasDoStarterPorArquivo.push(linhas);
  }

  return medido;
}

/** A violação A13 (solution/starter/tests) com a mensagem do aviso D4 ou do erro. */
function violacaoA13De(
  aula: ProgressaoLessonInput,
  desafioFile: string,
  campo: CampoProgressao,
  faixa: 'receptive' | 'productive',
  occ: AtomOccurrence,
  aviso: boolean,
  mensagemDeErro: string,
  primeiraDemonstracao: ReadonlyMap<AtomKey, string>,
): ProgressaoViolation {
  return {
    regra: 'A13',
    arquivo: desafioFile,
    ref: aula.ref,
    campo,
    linha: occ.line,
    coluna: occ.column,
    construcao: occ.key,
    eixo: axisOf(occ.key),
    faixa,
    trechoOfensor: occ.snippet,
    primeiraAulaQueEnsina: primeiraDemonstracao.get(occ.key) ?? null,
    severidade: aviso ? 'aviso' : 'erro',
    mensagem: aviso
      ? `${humanLabel(occ.key)} (um valor/termo) aparece sem demonstração em código — se a prosa já o explica, rebaixe à vontade; caso contrário demonstre num bloco js`
      : mensagemDeErro,
    desafioFile,
  };
}

/** ── A13a — o que o aluno ESCREVE precisa estar demonstrado ─────────────── */
export function checarA13a(
  ctx: AulaEmMedicao,
  desafioFile: string,
  f: number,
  medido: DesafioMedido,
): ProgressaoViolation[] {
  const { aula, demo, cum } = ctx;
  const out: ProgressaoViolation[] = [];
  for (const occ of medido.solutionOcorrenciasPorArquivo[f]) {
    if (medido.starterKeysPorArquivo[f].has(occ.key)) continue; // o starter já expõe: Não é "escrito"
    if (demoMaisCumMaisH13(demo, cum, occ.key)) continue;
    const aviso = AVISO13.has(occ.key);
    out.push(
      violacaoA13De(
        aula,
        desafioFile,
        'solutionCode',
        'productive',
        occ,
        aviso,
        `${humanLabel(occ.key)} é exigido no desafio de \`${aula.ref}\`, mas a teoria desta aula e de TODAS as anteriores nunca mostrou ${humanLabel(occ.key)} num bloco de código — sem demonstração não há ensino (A13). Reescreva dentro do que já foi demonstrado ou mova a demonstração para cá`,
        ctx.primeiraDemonstracao,
      ),
    );
  }
  return out;
}

/** ── A13b — o que o aluno LÊ no starter precisa estar demonstrado ───────── */
export function checarA13b(
  ctx: AulaEmMedicao,
  desafioFile: string,
  f: number,
  medido: DesafioMedido,
): ProgressaoViolation[] {
  const { aula, demo, cum } = ctx;
  const out: ProgressaoViolation[] = [];
  for (const occ of medido.starterOcorrenciasPorArquivo[f]) {
    if (demoMaisCumMaisH13(demo, cum, occ.key)) continue;
    const aviso = AVISO13.has(occ.key);
    out.push(
      violacaoA13De(
        aula,
        desafioFile,
        'starterCode',
        'receptive',
        occ,
        aviso,
        `${humanLabel(occ.key)} é exposto no desafio de \`${aula.ref}\`, mas a teoria desta aula e de TODAS as anteriores nunca mostrou ${humanLabel(occ.key)} num bloco de código — sem demonstração não há ensino (A13). Reescreva dentro do que já foi demonstrado ou mova a demonstração para cá`,
        ctx.primeiraDemonstracao,
      ),
    );
  }
  return out;
}

/** ── A13c — o teste é lido ANTES da aula (spec §3.2) ─────────────────── */
export function checarA13c(
  ctx: AulaEmMedicao,
  desafio: ProgressaoDesafioInput,
  desafioFile: string,
): ProgressaoViolation[] {
  const { aula, demo, cum, adapterId } = ctx;
  const out: ProgressaoViolation[] = [];
  // Fórmula da spec (linha "A13 ENSINO-EFETIVO" do §1): átomo usado em
  // atividade (starter/tests/solution) ⊆ demonstrado em teoria (DESTA aula
  // ∪ anteriores) ∪ intro declarado ∪ axioma ∪ S13. Ou seja: para o teste
  // vale também a teoria DA MESMA aula (Demo(i)) — a L1 real demonstra
  // `resposta()` na seção 1 e o teste do próprio desafio a chama; exigir
  // só Cum(i) acusava falsamente a L1 exatamente nesse ponto (documentado
  // como "pecado nº 1 esperado" no verif/check03 Feed B — era o defeito).
  // O pecado nº 1 REAL (chamada sem NENHUMA demonstração em lugar nenhum)
  // continua sendo erro: com Demo(i) ∪ Cum(i) vazios a ocorrência viola
  // (engineProgressao.test.ts caso 1). O termo "∪ intro declarado" da
  // fórmula de prosa não vira conjunto próprio aqui: em declared o A13d
  // obriga InitDecl(i) ⊆ Demo(i) ∪ Cum(i) (declarar não é demonstrar) e em
  // inferred Init(i) = Demo(i) \ Cum(i) já está dentro de Demo(i).
  //
  // `surface: 'testsCode'` — o MESMO contrato do gate A2/A3 no audit.ts:
  // o call-site declara o que está passando e a ante-sala do testsCode
  // de C vive no PONTO ÚNICO (extract.ts, onda 3). Hoje a bateria é
  // javascript-only (exigirAdaptadorJavascript acima reprova C), então
  // a dica é inerte aqui; se um dia a bateria abrir para outra
  // linguagem, a leitura do teste já nasce normalizada. O teste de
  // audit C (tests/engineAuditC.test.ts) percorre os call-sites e
  // trava que nenhum que alimenta testsCode com language fique sem a
  // dica.
  const rTests = extractAllOccurrences(desafio.tests, { language: adapterId, surface: 'testsCode' });
  if (!rTests.ok) return out;
  const spans = spansMecanicosDeTeste(desafio.tests);
  for (const occ of rTests.occurrences) {
    if (H13_SET.has(occ.key)) continue;
    const mecanico = spans.some((s) => estaDentro(s, occ.start));
    if (mecanico) continue;
    if (demo.has(occ.key) || cum.has(occ.key)) continue; // spec §3.2: teoria DESTA aula ∪ anteriores; AX ⊆ H13 já saiu acima
    const aviso = AVISO13.has(occ.key);
    out.push(
      violacaoA13De(
        aula,
        desafioFile,
        'testsCode',
        'receptive',
        occ,
        aviso,
        `${humanLabel(occ.key)} aparece no teste de \`${aula.ref}\`, que o aluno lê ANTES da aula, e nem a teoria desta aula nem a de nenhuma aula anterior o demonstrou num exemplo de código — o aluno leu uma construção que nunca viu. Demonstre ${humanLabel(occ.key)} na teoria desta aula ou de uma aula anterior (ou remova a ocorrência do teste)`,
        ctx.primeiraDemonstracao,
      ),
    );
  }
  return out;
}

/** As chaves novas por LINHA da solução de UM arquivo (A14b). */
function acumularPorLinha(
  medido: DesafioMedido,
  f: number,
  novo: ReadonlySet<AtomKey>,
  linhasDoArquivo: readonly string[],
): Map<number, Set<AtomKey>> {
  const porLinha = new Map<number, Set<AtomKey>>();
  for (const occ of medido.solutionOcorrenciasPorArquivo[f]) {
    if (!novo.has(occ.key)) continue; // A14a excluiu H13/AX — aqui idem
    const linha = linhasDoArquivo[occ.line - 1];
    if (linha === undefined) continue;
    // linha idêntica a uma linha do starter: não é lacuna que o aluno preenche
    if (linha.trim() !== '' && medido.linhasDoStarterPorArquivo[f].has(linha.trim())) continue;
    const construcoes = porLinha.get(occ.line) ?? new Set<AtomKey>();
    construcoes.add(occ.key);
    porLinha.set(occ.line, construcoes);
  }
  return porLinha;
}

/** As violações A14b de cada linha com mais de 1 CONSTRUÇÃO nova. */
function violacoesDeLinhas(
  aula: ProgressaoLessonInput,
  desafioFile: string,
  porLinha: ReadonlyMap<number, Set<AtomKey>>,
  linhasDoArquivo: readonly string[],
): ProgressaoViolation[] {
  const out: ProgressaoViolation[] = [];
  for (const [linha, chavesCrudas] of porLinha) {
    const construcoes = construcoesDaLinha(chavesCrudas);
    if (construcoes.size <= 1) continue;
    const conteudo = linhasDoArquivo[linha - 1]?.trim() ?? '';
    const lista = [...construcoes].sort();
    out.push({
      regra: 'A14b',
      arquivo: desafioFile,
      ref: aula.ref,
      campo: 'solutionCode',
      linha,
      coluna: 1,
      construcao: null,
      eixo: null,
      faixa: 'productive',
      trechoOfensor: conteudo.slice(0, 72),
      primeiraAulaQueEnsina: null,
      severidade: 'erro',
      mensagem:
        `a linha ${linha} do solutionCode de \`${aula.ref}\` combina ${construcoes.size} construções novas (${lista.join(', ')}) — ` +
        'a lacuna única do completion problem contém no máximo 1 (exercitável, §3.6). Quebre em linhas/passos separados',
      desafioFile,
    });
  }
  return out;
}

/** ── A14b — combo de construções novas na MESMA linha da solução ────── */
export function checarA14b(
  ctx: AulaEmMedicao,
  desafioFile: string,
  f: number,
  solution: string,
  medido: DesafioMedido,
): ProgressaoViolation[] {
  const linhasDoArquivo = solution.split('\n');
  const porLinha = acumularPorLinha(medido, f, ctx.novo, linhasDoArquivo);
  return violacoesDeLinhas(ctx.aula, desafioFile, porLinha, linhasDoArquivo);
}

/** As regras por desafio, na ordem: A13a/A13b por arquivo, A13c, A14b por arquivo. */
export function checarDesafio(
  ctx: AulaEmMedicao,
  desafio: ProgressaoDesafioInput,
  medido: DesafioMedido,
): ProgressaoViolation[] {
  const out: ProgressaoViolation[] = [];
  for (let f = 0; f < desafio.files.length; f += 1) {
    out.push(...checarA13a(ctx, desafio.desafioFile, f, medido));
    out.push(...checarA13b(ctx, desafio.desafioFile, f, medido));
  }
  out.push(...checarA13c(ctx, desafio, desafio.desafioFile));
  for (let f = 0; f < desafio.files.length; f += 1) {
    out.push(...checarA14b(ctx, desafio.desafioFile, f, desafio.files[f].solution, medido));
  }
  return out;
}
