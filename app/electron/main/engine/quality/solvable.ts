/**
 * app/electron/main/engine/quality/solvable.ts — P-19 "Solubilidade: o aluno
 * simulado" (cláusula J3 de `docs/16-engine-de-trilha.md` §9.1).
 *
 * J3 é a prova de que um desafio é JUSTO: "aluno simulado cujo contexto é
 * exatamente o orçamento, k=3, veredito por execução real. Métrica pass^k,
 * não pass-at-k. Ele reporta a primeira construção que faltou."
 *
 * O problema que esta peça resolve é o mais barato de medir e o mais caro de
 * ignorar: **uma taxa de acerto de 0% em muitas tentativas é sinal de tarefa
 * QUEBRADA, não de aluno incapaz.** Um desafio cujo orçamento não contém alguma
 * construção que a solução exige condena TODO aluno — medir isso com um aluno
 * simulado (LLM) que recebe SOMENTE o orçamento é o jeito de pegar o defeito
 * antes de entregar a trilha.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * O CONTEXTO DO ALUNO SIMULADO (a regra absurda do plano, verbatim):
 *
 *   "o contexto do aluno simulado é o orçamento e NADA além. Se ele receber
 *    conhecimento a mais, a prova não vale nada."
 *
 * O aluno recebe EXATAMENTE três coisas — nada mais, nada menos:
 *   1. o ENUNCIADO do desafio;
 *   2. o STARTER (o código inicial que ele deve completar);
 *   3. o ORÇAMENTO: a lista literal de construções de linguagem permitidas.
 *
 * O aluno NÃO recebe: a solução de referência, os testes, nem a teoria da
 * aula. Os testes são executados pelo PROVER, fora do alcance do aluno — ele
 * nunca os lê. A prova de que nada vaza é o TESTE DE STRING A-P19-4
 * (`app/tests/engineSolvable.test.ts`): o prompt montado por
 * `montarPromptDoAluno` não contém a solução de referência, nem os testes,
 * nem a teoria — e o TIPO do builder nem aceita esses campos (probe de tipo
 * no teste), tornando o vazamento impossível por construção, não só ausente
 * por acaso.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MÉTRICA — pass^k, NUNCA pass-at-k (A-P19-3):
 *
 * `medirSolubilidade` simula k tentativas INDEPENDENTES (default k=3,
 * configurável). O veredito é pass^k: TODAS as tentativas têm de passar.
 * UMA tentativa que falha entre três DERRUBA a medição — não existe "uma das
 * três acertou, então está bom". Este arquivo NÃO implementa pass-at-k em
 * lugar nenhum: a semântica de aprovação é `taxaDeAcerto === 1` (estrita),
 * e a taxa só alimenta o AVISO de tarefa quebrada. Grep gate A-P19-2: a
 * notação da métrica concorrente (pass + arrobá + k) NÃO aparece em lugar
 * nenhum do pacote — a única forma de aprovação aqui é pass^k estrito.
 *
 * RELATÓRIO DA MEDIÇÃO E O AVISO:
 * `MedicaoSolubilidade.avisoTarefaQuebrada` é true QUANDO a taxa de acerto é
 * 0% — o relatório carrega esse aviso porque 0% em k tentativas é o sinal
 * documentado de TAREFA QUEBRADA (orçamento sem uma construção que a solução
 * exige), e não de aluno incapaz. Acerto entre 0 e 1 (ex.: 2 de 3) falha o
 * pass^k sem o aviso: é sinal de flakiness, não de bloqueio estrutural.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * REPORTAR A PRIMEIRA CONSTRUÇÃO QUE FALTOU (A-P19-1, campo
 * `primeiraConstrucaoFaltante: string | null`):
 *
 *   (i)   se o aluno devolveu bloqueado/precisoDe → a primeira construção da
 *         lista dele que NÃO está no orçamento (a mais requisitada; a lista
 *         dele está em ordem de necessidade). Se TODOS os itens que ele pediu
 *         já estão no orçamento, não dá para nomear uma construção faltante
 *         (aluno confuso) → null.
 *   (ii)  se as tentativas falharam SEM bloqueio → diff determinístico:
 *         `extractAtoms(tentativa)` (engine/extract.ts, parser, zero LLM) vs
 *         orçamento; chaves fora do orçamento ordenadas por FREQUÊNCIA entre
 *         as tentativas que falharam com código (descendente) e, no desempate,
 *         por ordem alfabética → primeira. Frequência 1 × 1 com uma única
 *         tentativa falha = ordem alfabética, ainda determinística.
 *   (iii) tentativa que falhou sem código analisável (resposta inválida /
 *         sintaxe quebrada) → null: não dá para culpar uma construção que não
 *         existe no código. A medição falha do mesmo jeito (pass^k é estrito).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * FAIL-CLOSED (regra 1 do plano, §9.3):
 *
 * Falha de INFRAESTRUTURA — o transporte de LLM LANGANDO, o prover LANGANDO,
 * ou um veredito do prover com `execError` — é ERRO ESTRUTURADO da medição
 * (`SolubilidadeError` com código estável), NUNCA um veredito falso nem
 * silêncio. Tentativa que FALHOU por mérito (veredito inválido, bloqueado,
 * resposta malformada) NÃO é erro de infra: entra no relatório como tentativa
 * que não passou.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEPENDÊNCIAS E O CONTRATO COM O P-31 (engine/phases/f9Verifier.ts):
 *
 * O P-31 contratou `criarProverDeDesafio → (input) =>
 * Promise<ChallengeProofsVerdict>`. Este módulo NÃO cria o prover — recebe-o
 * pronto em `deps.prover` (o veredito é por EXECUÇÃO REAL via esse prover; nos
 * testes, prover fake). O ponto de fiação quando o P-31 aterrissar:
 *
 *   const prover = criarProverDeDesafio(/* env do harness *!/);
 *   medirSolubilidade({ llm, prover }, ctx, 3);
 *
 * `ChallengeProofsInput`/`ChallengeProofsVerdict` vêm de `engine/exec/proofs.ts`
 * (já existem; são o contrato das quatro provas). A tentativa do aluno entra
 * como `solutionCode`; `solutionFiles` da REFERÊNCIA são descartados (nunca
 * podem chegar ao prover na rodada do aluno — vazariam a solução). Desafios
 * multi-arquivo exigem extensão futura (premissa declarada no handoff).
 *
 * ORÇAMENTO: `ctx.orcamento` é a lista LITERAL de chaves permitidas que vai ao
 * prompt do aluno. A medição não interpreta faixas (receptivo/produtivo) — o
 * chamador passa a lista que define o vocabulário de escrita do aluno
 * (convenção: o orçamento PRODUTIVO da aula).
 */

import { extractAtoms } from '../extract';
import type { AtomKey } from '../atomKeys';
import type { ChallengeProofsInput, ChallengeProofsVerdict } from '../exec/proofs';
import type { EngineLlm } from '../runtime/callLlm';

// ---------------------------------------------------------------------------
// Constantes da etapa
// ---------------------------------------------------------------------------

/** Etapa do transporte de LLM (ledger/telemetria da engine). */
export const ETAPA_ALUNO_SIMULADO = 'solubilidade:aluno-simulado' as const;

/**
 * Versão da lógica da etapa — invalidação EXPLÍCITA do cache do callLlm:
 * mudou o prompt (ou a lógica de parse), bumpe AQUI.
 */
export const ALUNO_STAGE_VERSION = '1.0.0' as const;

/** Deadline da chamada do aluno simulado (uma etapa travada não segura a onda). */
export const ALUNO_TIMEOUT_MS = 60_000 as const;

/** k default do pass^k (docs §9.1 J3: k=3). */
export const DEFAULT_K = 3 as const;

// ---------------------------------------------------------------------------
// Erro estruturado da medição (fail-closed)
// ---------------------------------------------------------------------------

export const SOLUBILIDADE_CODES = {
  /** transporte de LLM lançou — a medição não pode simular ninguém. */
  LLM: 'SOLUBILIDADE_LLM_FALHOU',
  /** prover lançou OU devolveu veredito com execError — a execução real falhou. */
  PROVER: 'SOLUBILIDADE_PROVER_FALHOU',
  /** argumento inválido (k fora de [1, ∞)). */
  ARGUMENTO: 'SOLUBILIDADE_ARGUMENTO_INVALIDO',
} as const;

export type SolubilidadeCode = (typeof SOLUBILIDADE_CODES)[keyof typeof SOLUBILIDADE_CODES];

export interface SolubilidadeErrorOptions {
  code: SolubilidadeCode;
  message: string;
  etapa?: string;
  cause?: unknown;
  detail?: unknown;
}

/** Erro ESTRUTURADO da medição — nunca um veredito falso (fail-closed, §9.3). */
export class SolubilidadeError extends Error {
  readonly code: SolubilidadeCode;
  readonly etapa?: string;
  readonly detail?: unknown;
  readonly cause?: unknown;

  constructor(opts: SolubilidadeErrorOptions) {
    super(opts.message);
    this.name = 'SolubilidadeError';
    this.code = opts.code;
    if (opts.etapa !== undefined) this.etapa = opts.etapa;
    if (opts.detail !== undefined) this.detail = opts.detail;
    if (opts.cause !== undefined) this.cause = opts.cause;
  }
}

// ---------------------------------------------------------------------------
// Contratos: dependências, contexto e a saída do aluno
// ---------------------------------------------------------------------------

/** O prover (P-31): veredito por EXECUÇÃO REAL das quatro provas (proofs.ts). */
export type ProverDeDesafio = (input: ChallengeProofsInput) => Promise<ChallengeProofsVerdict>;

export interface SolubilidadeDeps {
  /** transporte único de LLM da engine (runtime/callLlm) — fake nos testes. */
  llm: Pick<EngineLlm, 'callLlm'>;
  /** veredito por execução real — injetado; nos testes, fake. */
  prover: ProverDeDesafio;
}

export interface SolubilidadeCtx {
  /**
   * chaves de construção PERMITIDAS — EXATAMENTE o orçamento. É o contexto do
   * aluno simulado e NADA além dele. A lista literal vai ao prompt.
   */
  orcamento: readonly string[];
  /** o enunciado do desafio — faz parte do prompt do aluno. */
  enunciado: string;
  /**
   * o desafio completo (starter + testes + contagem). `solutionCode` aqui é a
   * solução de REFERÊNCIA e NUNCA entra no prompt; na rodada do aluno o prover
   * recebe o código do ALUNO no lugar dele.
   */
  prova: ChallengeProofsInput;
}

/**
 * Saída do aluno simulado. O formato literal na linha de frente (o que o prompt
 * pede e o parse aceita) é:
 *
 *   {"codigo": "..."}                        — tentativa (solution.mjs completo);
 *   {"bloqueado": true, "precisoDe": [...]}  — bloqueio legítimo (construções
 *                                              que faltam ao orçamento).
 *
 * `resposta_invalida` é a saída que não é nenhum dos dois (JSON quebrado, shape
 * errado, código vazio) — a medição falha essa tentativa sem culpar construção.
 */
export type RespostaDoAluno =
  | { tipo: 'tentativa'; codigo: string }
  | { tipo: 'bloqueado'; precisoDe: string[] }
  | { tipo: 'resposta_invalida'; razao: string };

/** Uma tentativa completa: o que o aluno devolveu + como o prover a julgou. */
export interface ResultadoTentativa {
  resposta: RespostaDoAluno;
  /** passou = veredito do prover válido (só faz sentido p/ tentativa). */
  passou: boolean;
  /** presente quando a tentativa foi EXECUTADA pelo prover. */
  veredito?: ChallengeProofsVerdict;
  /** porquê curto, para o relatório (ex.: primeira prova que falhou). */
  razao?: string;
}

/** Uma tentativa da medição, com ordem — o que o relatório (P-24) consome. */
export interface TentativaMedida {
  /** 1-based. */
  ordem: number;
  tipo: RespostaDoAluno['tipo'];
  passou: boolean;
  /** presente quando tipo === 'tentativa'. */
  codigo?: string;
  /** presente quando tipo === 'bloqueado'. */
  precisoDe?: string[];
  razao?: string;
  /** presente quando houve execução real. */
  veredito?: ChallengeProofsVerdict;
}

export interface MedicaoSolubilidade {
  /**
   * pass^k (k = `tentativas`): true SOMENTE se TODAS as tentativas passaram.
   * Uma que falhe derruba — nunca pass-at-k.
   */
  passou: boolean;
  /** k planejado (default 3). */
  tentativas: number;
  /**
   * fração das tentativas que passaram (0..1). Alimenta o AVISO abaixo; a
   * aprovação é SEMPRE `taxaDeAcerto === 1` (semântica estrita do pass^k).
   */
  taxaDeAcerto: number;
  /**
   * a PRIMEIRA construção que faltou ao orçamento — ver regras no cabeçalho.
   * null quando a falha não dá para culpar uma construção (resposta inválida,
   * bloqueio que pede só o que já é permitido, ou código com sintaxe quebrada).
   */
  primeiraConstrucaoFaltante: string | null;
  /**
   * AVISO (docs §9.1 J3): taxa de acerto 0% em k tentativas é sinal de TAREFA
   * QUEBRADA (orçamento sem uma construção que a solução exige), não de aluno
   * incapaz. O relatório da medição carrega este aviso quando acerto = 0.
   */
  avisoTarefaQuebrada: boolean;
  /** as tentativas simuladas, em ordem — detalhe para o relatório (P-24). */
  tentativasRealizadas: TentativaMedida[];
}

// ---------------------------------------------------------------------------
// O prompt do aluno simulado (o contexto é o ORÇAMENTO e nada além)
// ---------------------------------------------------------------------------

export interface DadosDoPromptDoAluno {
  enunciado: string;
  starter: string;
  orcamento: readonly string[];
}

/**
 * Monta o prompt do aluno simulado com EXATAMENTE o contexto dele: enunciado +
 * starter + a lista literal do orçamento. A assinatura é a PROVA estrutural de
 * que a solução de referência, os testes e a teoria não entram: quem chama nem
 * tem onde passá-los (o teste A-P19-4 ainda verifica por string, defesa em
 * profundidade — e um probe de tipo no teste quebra se alguém adicionar campo).
 */
export function montarPromptDoAluno(dados: DadosDoPromptDoAluno): string {
  const linhasOrcamento = dados.orcamento.length > 0
    ? dados.orcamento.map((chave) => `- ${chave}`).join('\n')
    : '- (vazio)';
  return [
    'Você é o ALUNO SIMULADO de um desafio de programação. Seu contexto é EXATAMENTE o que está abaixo — nem mais, nem menos: o enunciado do desafio, o código inicial (starter) e o ORÇAMENTO (a lista literal de construções de linguagem que você pode usar). Você NÃO vê os testes do desafio: eles existem e serão executados por um verificador, fora do seu alcance.',
    '',
    'ORÇAMENTO — construções permitidas (seu ÚNICO vocabulário):',
    linhasOrcamento,
    '',
    'ENUNCIADO DO DESAFIO:',
    dados.enunciado,
    '',
    'CÓDIGO INICIAL (starter):',
    '```js',
    dados.starter,
    '```',
    '',
    'REGRAS:',
    '1. Escreva uma solução completa usando SOMENTE construções do ORÇAMENTO.',
    '2. Não escreva testes. Seu código será executado contra testes externos.',
    '3. Se alguma construção necessária para resolver NÃO estiver no ORÇAMENTO, NÃO invente: reporte bloqueio.',
    '',
    'Responda SOMENTE com JSON, sem markdown e sem comentários, em UM destes dois formatos:',
    '- {"codigo": "..."} — sua tentativa: o arquivo solution.mjs completo (um único arquivo).',
    '- {"bloqueado": true, "precisoDe": ["chave1", "chave2"]} — as construções que faltam ao ORÇAMENTO, da mais necessária para a menos.',
  ].join('\n');
}

/** Schema informativo do callLlm (identidade de cache + documentação). */
const ALUNO_SCHEMA = JSON.stringify({
  codigo: 'string — tentativa (solution.mjs completo)',
  bloqueado: 'boolean — true marca bloqueio',
  precisoDe: 'string[] — construções que faltam ao orçamento (ordem de necessidade)',
});

// ---------------------------------------------------------------------------
// Parse da resposta do aluno (fail-closed: shape inesperado = resposta inválida)
// ---------------------------------------------------------------------------

function parseRespostaDoAluno(content: string): RespostaDoAluno {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { tipo: 'resposta_invalida', razao: 'resposta não é JSON válido' };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { tipo: 'resposta_invalida', razao: 'resposta não é um objeto JSON' };
  }
  const p = parsed as Record<string, unknown>;
  if (typeof p.codigo === 'string' && p.codigo.trim().length > 0) {
    return { tipo: 'tentativa', codigo: p.codigo };
  }
  if (p.bloqueado === true) {
    if (!Array.isArray(p.precisoDe) || p.precisoDe.some((item) => typeof item !== 'string')) {
      return { tipo: 'resposta_invalida', razao: 'bloqueado sem precisoDe válido (array de strings)' };
    }
    return { tipo: 'bloqueado', precisoDe: p.precisoDe as string[] };
  }
  return { tipo: 'resposta_invalida', razao: 'formato de resposta desconhecido (esperado {"codigo": ...} ou {"bloqueado": true, "precisoDe": [...]})' };
}

// ---------------------------------------------------------------------------
// UMA tentativa do aluno simulado: prompt → LLM → (código → prover)
// ---------------------------------------------------------------------------

/**
 * Simula UMA tentativa do aluno: monta o prompt (enunciado + starter + orçamento
 * — e nada além), chama o LLM, interpreta a resposta e, quando há código, pede o
 * VEREDITO POR EXECUÇÃO REAL ao prover. Fail-closed: o transporte de LLM ou o
 * prover LANÇANDO (ou veredito com execError) vira `SolubilidadeError` — nunca
 * um veredito falso.
 */
export async function simularAluno(deps: SolubilidadeDeps, ctx: SolubilidadeCtx): Promise<ResultadoTentativa> {
  const prompt = montarPromptDoAluno({
    enunciado: ctx.enunciado,
    starter: ctx.prova.starterCode,
    orcamento: ctx.orcamento,
  });

  let content: string;
  try {
    const resultado = await deps.llm.callLlm(ETAPA_ALUNO_SIMULADO, {
      prompt,
      schema: ALUNO_SCHEMA,
      stageVersion: ALUNO_STAGE_VERSION,
      timeoutMs: ALUNO_TIMEOUT_MS,
      temperature: 0,
    });
    content = resultado.content;
  } catch (error) {
    throw new SolubilidadeError({
      code: SOLUBILIDADE_CODES.LLM,
      etapa: ETAPA_ALUNO_SIMULADO,
      message: 'o transporte de LLM falhou ao simular o aluno — a medição não pode ser concluída (fail-closed).',
      cause: error,
    });
  }

  const resposta = parseRespostaDoAluno(content);
  if (resposta.tipo !== 'tentativa') {
    const razao = resposta.tipo === 'bloqueado'
      ? 'aluno reportou bloqueio: construção necessária fora do orçamento'
      : resposta.razao;
    return { resposta, passou: false, razao };
  }

  let veredito: ChallengeProofsVerdict;
  try {
    // A tentativa do aluno é UM arquivo (solution.mjs). `solutionFiles` da
    // REFERÊNCIA são descartados de propósito: vazariam a solução para o prover.
    veredito = await deps.prover({ ...ctx.prova, solutionCode: resposta.codigo, solutionFiles: undefined });
  } catch (error) {
    throw new SolubilidadeError({
      code: SOLUBILIDADE_CODES.PROVER,
      etapa: ETAPA_ALUNO_SIMULADO,
      message: 'o prover (execução real) falhou durante a simulação do aluno.',
      cause: error,
    });
  }

  // Fail-closed: veredito com execError é FALHA DE INFRA do prover, não falha
  // do aluno — a medição não pode julgar quem não foi executado.
  if (veredito.execError !== undefined || veredito.failures.some((f) => f.proof === 'execError')) {
    throw new SolubilidadeError({
      code: SOLUBILIDADE_CODES.PROVER,
      etapa: ETAPA_ALUNO_SIMULADO,
      message: `o prover falhou por infraestrutura ao executar a tentativa: ${veredito.execError ?? 'execError'}`,
      detail: veredito.execError,
    });
  }

  const razao = veredito.valid ? undefined : (veredito.failures[0]?.reason ?? 'veredito inválido');
  return { resposta, passou: veredito.valid, veredito, razao };
}

// ---------------------------------------------------------------------------
// Diff determinístico: construções fora do orçamento, por frequência
// ---------------------------------------------------------------------------

/**
 * Chaves de `extractAtoms` fora do orçamento, agregadas sobre as tentativas que
 * falharam com código, ordenadas por FREQUÊNCIA (quantas tentativas usaram a
 * chave; decrescente) e, no desempate, por ordem ALFABÉTICA — determinístico.
 * Código que não parseia (PARSE_ERROR) contribui zero chaves: sintaxe quebrada
 * não culpa construção. A primeira do resultado é `primeiraConstrucaoFaltante`.
 */
function construcoesForaDoOrcamento(codigos: readonly string[], orcamento: ReadonlySet<string>): AtomKey[] {
  const frequencia = new Map<AtomKey, number>();
  for (const codigo of codigos) {
    const extraido = extractAtoms(codigo);
    if (!extraido.ok) continue;
    const jaContadas = new Set<AtomKey>();
    for (const chave of extraido.keys) {
      if (orcamento.has(chave) || jaContadas.has(chave)) continue;
      jaContadas.add(chave);
      frequencia.set(chave, (frequencia.get(chave) ?? 0) + 1);
    }
  }
  return [...frequencia.entries()]
    .sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([chave]) => chave);
}

/**
 * Decide `primeiraConstrucaoFaltante` a partir das tentativas realizadas
 * (regras do cabeçalho: (i) bloqueado → precisoDe; (ii) sem bloqueio → diff por
 * frequência; (iii) sem código analisável → null).
 */
function primeiraFaltante(realizadas: readonly TentativaMedida[], orcamento: ReadonlySet<string>): string | null {
  const bloqueada = realizadas.find((t) => t.tipo === 'bloqueado' && !t.passou && t.precisoDe !== undefined);
  if (bloqueada?.precisoDe !== undefined) {
    // (i) a PRIMEIRA construção da lista dele que NÃO está no orçamento (a mais
    // requisitada). Todos os itens dentro do orçamento = aluno confuso → null.
    return bloqueada.precisoDe.find((chave) => !orcamento.has(chave)) ?? null;
  }
  const codigosFalhos = realizadas
    .filter((t) => t.tipo === 'tentativa' && !t.passou && t.codigo !== undefined)
    .map((t) => t.codigo as string);
  if (codigosFalhos.length > 0) {
    // (ii) diff determinístico por frequência.
    const fora = construcoesForaDoOrcamento(codigosFalhos, orcamento);
    return fora.length > 0 ? fora[0] : null;
  }
  // (iii) só respostas inválidas / bloqueios vazios — nada a nomear.
  return null;
}

function paraTentativaMedida(ordem: number, r: ResultadoTentativa): TentativaMedida {
  const t: TentativaMedida = { ordem, tipo: r.resposta.tipo, passou: r.passou };
  if (r.resposta.tipo === 'tentativa') t.codigo = r.resposta.codigo;
  if (r.resposta.tipo === 'bloqueado') t.precisoDe = [...r.resposta.precisoDe];
  if (r.razao !== undefined) t.razao = r.razao;
  if (r.veredito !== undefined) t.veredito = r.veredito;
  return t;
}

// ---------------------------------------------------------------------------
// A medição: pass^k (k tentativas independentes, TODAS têm de passar)
// ---------------------------------------------------------------------------

/**
 * Mede a solubilidade do desafio com k tentativas INDEPENDENTES do aluno
 * simulado (default k=3; pass^k: TODAS passam — uma falha derruba; nunca
 * pass-at-k). As k tentativas SEMPRE são executadas (mesmo depois de uma falha)
 * para que a taxa de acerto e o aviso de tarefa quebrada sejam honestos: 0%
 * em k tentativas — e não 0% em meia medição abortada — é o sinal de TAREFA
 * QUEBRADA que o relatório carrega (`avisoTarefaQuebrada`).
 *
 * Fail-closed: `SolubilidadeError` (LLM/prover/argumento) atravessa a medição;
 * o chamador (relatório, P-24) trata erro estruturado, nunca veredito falso.
 */
export async function medirSolubilidade(
  deps: SolubilidadeDeps,
  ctx: SolubilidadeCtx,
  tentativas: number = DEFAULT_K,
): Promise<MedicaoSolubilidade> {
  if (!Number.isInteger(tentativas) || tentativas < 1) {
    throw new SolubilidadeError({
      code: SOLUBILIDADE_CODES.ARGUMENTO,
      message: `tentativas deve ser inteiro ≥ 1 (recebido ${tentativas}) — pass^k sem tentativas não mede nada.`,
    });
  }

  const orcamento = new Set<string>(ctx.orcamento);
  const realizadas: TentativaMedida[] = [];
  let passaram = 0;

  for (let ordem = 1; ordem <= tentativas; ordem += 1) {
    const resultado = await simularAluno(deps, ctx);
    realizadas.push(paraTentativaMedida(ordem, resultado));
    if (resultado.passou) passaram += 1;
  }

  const taxaDeAcerto = passaram / tentativas;
  return {
    passou: taxaDeAcerto === 1, // pass^k estrito — nunca pass-at-k
    tentativas,
    taxaDeAcerto,
    primeiraConstrucaoFaltante: primeiraFaltante(realizadas, orcamento),
    // 0% de acerto = sinal de tarefa QUEBRADA, não de aluno incapaz (J3).
    avisoTarefaQuebrada: taxaDeAcerto === 0,
    tentativasRealizadas: realizadas,
  };
}