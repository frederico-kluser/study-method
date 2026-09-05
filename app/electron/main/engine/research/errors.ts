/**
 * app/electron/main/engine/research/errors.ts — O ERRO ESTRUTURADO da camada de
 * pesquisa com procedência.
 *
 * O QUE ESTE ARQUIVO FAZ: define UM código estável por modo de falha desta
 * camada e a classe de erro que os carrega. Nada mais.
 *
 * O QUE ELE NÃO FAZ: não fala com processo, não fala com rede, não decide
 * política de retentativa. Quem decide é o `surfRunner.ts` (códigos de saída) e
 * o `camadas.ts` (orquestração).
 *
 * POR QUE CÓDIGO EM VEZ DE MENSAGEM: `docs/16-engine-de-trilha.md` §9.3 — "a
 * engine falha fechada. Indisponibilidade produz erro estruturado, nunca
 * veredito falso nem aprovação por omissão". Um chamador (a CLI da onda
 * seguinte) precisa distinguir "conserte a sua configuração" (SEM_CHAVE) de "a
 * busca rodou e não achou nada" (VAZIO) de "eu montei o comando errado"
 * (USO_INVALIDO) SEM parsear texto — é exatamente o motivo pelo qual o próprio
 * surf separa exit 78 de exit 1 (`src/lib/preflight.mjs`: "WHY 78: sysexits(3)
 * EX_CONFIG. It is distinct from 1").
 *
 * O MESMO FORMATO DE `F1Error` (`phases/f1Research.ts:351`): `code` estável,
 * `details` para o contexto de máquina, `etapa` para nomear onde quebrou. É
 * cópia deliberada de forma — não de código: F1 é fase da engine e pertence a
 * outro dono; esta camada é um MÓDULO isolado que a fase (ou a CLI) consome.
 */

/**
 * Códigos estáveis desta camada. Um por modo de falha REAL — nenhum genérico
 * de conveniência.
 */
export const PESQUISA_CODES = {
  /** Configuração da camada fora do contrato (detectado ANTES de qualquer trabalho). */
  CONFIG_INVALIDA: 'PESQUISA_CONFIG_INVALIDA',
  /** Contexto de trilha vazio/incompleto — sem ele o brief seria genérico. */
  CONTEXTO_INVALIDO: 'PESQUISA_CONTEXTO_INVALIDO',
  /**
   * ANTI-PADRÃO DECLARADO reintroduzido no texto do brief ("pense
   * profundamente, passo a passo" e parentes). Profundidade é PARÂMETRO
   * (`reasoning.effort`), não texto — `services/challengeContextValidator.ts:26-40`.
   */
  IMPERATIVO_DE_PROFUNDIDADE: 'PESQUISA_IMPERATIVO_DE_PROFUNDIDADE',
  /** exit 78 do surf (EX_CONFIG): sem chave Brave válida. Retentar é inútil. */
  SURF_SEM_CHAVE: 'PESQUISA_SURF_SEM_CHAVE',
  /** exit 2 do surf: comando montado errado — DEFEITO DESTE MÓDULO. */
  SURF_USO_INVALIDO: 'PESQUISA_SURF_USO_INVALIDO',
  /** exit 143 (SIGTERM) — a onda não coube no tempo. Ver a política em surfRunner.ts. */
  SURF_MORTO_POR_TIMEOUT: 'PESQUISA_SURF_MORTO_POR_TIMEOUT',
  /** Qualquer outro exit não-zero do surf (inclui o exit 1 do reportAiError). */
  SURF_FALHOU: 'PESQUISA_SURF_FALHOU',
  /** O stdout do surf não era o envelope `--json` esperado. */
  ENVELOPE_INVALIDO: 'PESQUISA_ENVELOPE_INVALIDO',
  /** O analisador de colheita (LLM) não entregou análise utilizável. */
  ANALISE_INDISPONIVEL: 'PESQUISA_ANALISE_INDISPONIVEL',
  /** O portão de qualidade REPROVOU a colheita — nada vira insumo de aula. */
  GATE_REPROVADO: 'PESQUISA_GATE_REPROVADO',
} as const;

export type PesquisaErrorCode = (typeof PESQUISA_CODES)[keyof typeof PESQUISA_CODES];

export interface PesquisaErrorOptions {
  code: PesquisaErrorCode;
  message: string;
  /** Contexto de MÁQUINA (nunca a chave de API — ela não passa por aqui). */
  details?: Record<string, unknown>;
  /** Nome da etapa/camada onde quebrou (ex.: 'camada-1', 'analise'). */
  etapa?: string;
  cause?: unknown;
}

/** Erro estruturado da camada de pesquisa — nunca um resultado falso. */
export class PesquisaError extends Error {
  readonly code: PesquisaErrorCode;
  readonly details: Record<string, unknown>;
  readonly etapa?: string;
  readonly cause?: unknown;

  constructor(opts: PesquisaErrorOptions) {
    super(opts.message);
    this.name = 'PesquisaError';
    this.code = opts.code;
    this.details = opts.details ?? {};
    if (opts.etapa !== undefined) this.etapa = opts.etapa;
    if (opts.cause !== undefined) this.cause = opts.cause;
  }
}
