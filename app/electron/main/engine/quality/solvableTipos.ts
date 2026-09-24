/**
 * app/electron/main/engine/quality/solvableTipos.ts — constantes da etapa,
 * erro ESTRUTURADO fail-closed e o contrato completo do aluno simulado (J3).
 *
 * A prosa normativa (o contexto do aluno, pass^k, a primeira construção que
 * faltou, o JS-only) vive na fachada `solvable.ts`. Refatoração L04: arquivo
 * ≤500 linhas e toda função com CC≤8, sem mudança de comportamento observável.
 */

import { exigirAdaptadorJavascript } from '../extract';
import { DEFAULT_ADAPTER_ID, type LanguageId } from '../lang/registry';
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
  /**
   * ADITIVO (onda 5): a linguagem do desafio. Default: o adaptador default.
   * Qualquer outra LANÇA — ver "JAVASCRIPT-ONLY" no cabeçalho.
   */
  language?: LanguageId;
}

/** GUARDA de linguagem das duas entradas públicas da medição. */
export function exigirJs(fn: string, language: LanguageId = DEFAULT_ADAPTER_ID): void {
  exigirAdaptadorJavascript(
    `engine/quality/solvable.ts (${fn})`,
    'o prompt do aluno pede um módulo ESM (solution.mjs com export) e a tentativa é medida por extractAtoms, que é do AST do TypeScript',
    language,
  );
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

/** Uma resposta que NÃO é tentativa (bloqueio ou resposta inválida). */
export type RespostaSemTentativa = Exclude<RespostaDoAluno, { tipo: 'tentativa' }>;

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

/** O que o prompt do aluno recebe — enunciado + starter + orçamento, nada mais. */
export interface DadosDoPromptDoAluno {
  enunciado: string;
  starter: string;
  orcamento: readonly string[];
}
