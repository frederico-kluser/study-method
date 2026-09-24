/**
 * app/electron/main/engine/runtime/callLlmTypes.ts — TIPOS e erro estruturado
 * do TRANSPORTE ÚNICO de LLM da engine de trilhas (P-01,
 * `docs/16-engine-de-trilha.md` §4.1, §11).
 *
 * EXTRAÍDO de `runtime/callLlm.ts` na refatoração L06 (arquivo ≤500 linhas,
 * CC≤8; comportamento observável preservado). O caminho PÚBLICO continua
 * `runtime/callLlm.ts` — fachada fina que reexporta daqui e de
 * `callLlmTransport.ts` (a fábrica `createCallLlm`).
 *
 * MODELO E RACIOCÍNIO: o default de modelo é `OPENROUTER_MODEL.id`
 * (`@shared/llm/constants` — contrato congelado do provedor). O esforço de
 * raciocínio é opcional por etapa (`reasoningEffort`): quando o chamador não
 * pede nada, o transporte NÃO envia o campo e o cliente aplica o máximo
 * (`'max'`, mandatório neste modelo). Quem pedir um degrau abaixo é
 * respeitado — e paga o preço na chave de cache (ver `callLlmTransport.ts`).
 *
 * Limite declarado: este pacote NÃO valida o tamanho da saída (a regra
 * "toda saída de agente cabe em 2.000 tokens; acima disso é REJEITADO, nunca
 * truncado" — §7/§4.1 — é dos consumidores de etapa, que conhecem o schema).
 * O transporte devolve o conteúdo INTACTO, sem truncar e sem reclamar.
 */

import type { OpenRouterEffort } from '@shared/llm/constants';
import type {
  LlmChatRequest,
  LlmClient,
  LlmErrorCode,
} from '../../services/llmClient';
import type { BackoffConfig } from './backoff';
import type { CacheStore } from './llmCache';
import type { Semaphore } from './semaphore';
import type { LlmChatResponse } from '../../services/llmClient';

// ─── códigos e erro estruturado do transporte ───────────────────────────────

/**
 * Códigos próprios do transporte (além dos códigos do llmClient que
 * propagam intactos). Fail-closed: indisponibilidade/atraso produzem erro
 * estruturado, nunca veredito falso nem silêncio.
 */
export const LLM_TRANSPORT_CODES = {
  /** A etapa estourou `timeoutMs` — call cancelada, etapa rejeitada. */
  STAGE_TIMEOUT: 'LLM_STAGE_TIMEOUT',
  /** Erro não tipado do transporte injetado (não classificado). */
  UNKNOWN: 'LLM_UNKNOWN',
} as const;

export type LlmTransportCode = (typeof LLM_TRANSPORT_CODES)[keyof typeof LLM_TRANSPORT_CODES];

/** Todo erro que sai deste transporte: código estável + contexto da etapa. */
export type LlmStageErrorCode = LlmErrorCode | LlmTransportCode;

export interface LlmStageErrorOptions {
  code: LlmStageErrorCode;
  etapa: string;
  message: string;
  attempts: number;
  retried: number;
  cause?: unknown;
}

/** Erro estruturado de UMA chamada de etapa — nunca um veredito falso. */
export class LlmStageError extends Error {
  readonly code: LlmStageErrorCode;
  readonly etapa: string;
  /** Tentativas totais antes do erro (1 = primeira já falhou). */
  readonly attempts: number;
  /** Retentativas efetivamente feitas (com backoff) antes do erro. */
  readonly retried: number;
  readonly cause?: unknown;

  constructor(opts: LlmStageErrorOptions) {
    super(opts.message);
    this.name = 'LlmStageError';
    this.code = opts.code;
    this.etapa = opts.etapa;
    this.attempts = opts.attempts;
    this.retried = opts.retried;
    if (opts.cause !== undefined) this.cause = opts.cause;
  }
}

// ─── requisição e resultado ──────────────────────────────────────────────────

/**
 * Requisição de UMA chamada de etapa. Obrigatórios (justificativa):
 * - `prompt`: sem mensagem não há chamada — nada a enviar.
 * - `stageVersion`: versão da lógica da etapa — é a invalidação EXPLÍCITA do
 *   cache (bumpar versão = nova identidade de artefato).
 * - `timeoutMs`: mandatório por etapa (plano: "uma etapa travada não pode
 *   segurar a onda"); tempo DEADLINE da chamada, em ms.
 * Opcionais: `system` (prompt de sistema), `schema` (schema JSON serializado,
 * parte da chave), `params` (qualquer metadado de geração — entra na chave),
 * `modelId` (default: contrato OPENROUTER_MODEL), `temperature` (default 0),
 * `maxTokens` (teto de saída informado ao provedor; o transporte nunca
 * trunca conteúdo), `reasoningEffort` (default: nenhum campo enviado — o
 * cliente aplica `'max'`).
 */
export interface LlmCallRequest {
  prompt: string;
  system?: string;
  schema?: string;
  params?: Readonly<Record<string, unknown>>;
  modelId?: string;
  stageVersion: string;
  timeoutMs: number;
  temperature?: number;
  maxTokens?: number;
  /**
   * Esforço de raciocínio da chamada. Omitido = o campo NÃO vai no body e o
   * cliente aplica o máximo (`OPENROUTER_MAX_EFFORT`). Qualquer valor entra
   * na chave de cache — ver `keyInput` em `callLlmTransport.ts`.
   */
  reasoningEffort?: OpenRouterEffort;
}

/** Uso acumulado de UMA etapa (acumulado entre chamadas do mesmo transporte). */
export interface StageUsage {
  promptTokens: number;
  completionTokens: number;
  /** Idas bem-sucedidas ao provedor (acerto de cache NÃO conta). */
  llmCalls: number;
  /** Acertos de cache (gasto de tokens zero). */
  cachedHits: number;
  /** Retentativas consumidas (todas as chamadas da etapa). */
  retries: number;
}

/** Resultado de uma chamada de etapa. */
export interface LlmCallResult {
  content: string;
  model: string;
  /** true = veio do cache (sem ida ao provedor; `usage` ausente). */
  cached: boolean;
  /** Uso DESTA chamada (undefined em acerto de cache). */
  usage?: { promptTokens: number; completionTokens: number };
  /** Acumulado da etapa APÓS esta chamada. */
  stageUsage: Readonly<StageUsage>;
  /** Tentativas até o sucesso (1 = sem retry; 0 = acerto de cache). */
  attempts: number;
  elapsedMs: number;
}

/** O transporte pronto para a engine importar: `callLlm(etapa, req)`. */
export interface EngineLlm {
  callLlm(etapa: string, req: LlmCallRequest): Promise<LlmCallResult>;
  /** Uso acumulado de uma etapa, ou undefined se nunca chamada. */
  getStageUsage(etapa: string): Readonly<StageUsage> | undefined;
  /** Uso acumulado de todas as etapas (telemetria fim de execução). */
  getAllStageUsage(): Readonly<Record<string, StageUsage>>;
}

export interface CallLlmDeps {
  /** Transporte injetado — fake nos testes; A-P01-3 (sem rede, sem chave). */
  client: LlmClient;
  /** Resolve a chave UMA vez (memoizada internamente). */
  apiKey: () => Promise<string>;
  /** SEM_LLM — quem cria o run passa o MESMO semáforo para todas as etapas. */
  semaphore?: Semaphore;
  /** Presença do store = cache LIGADO (opcional; ausente = desligado). */
  cache?: CacheStore;
  /** Overrides de backoff (testes: atrasos minúsculos, jitter 0). */
  backoff?: BackoffConfig;
  /** Logger — TODO linha passa por renderSanitizedBodyFragment. Default: no-op. */
  log?: (line: string) => void;
  /** Relógio injetável (testes). Default: Date.now. */
  now?: () => number;
  /** Sleep injetável (testes). Default: setTimeout. */
  sleep?: (ms: number) => Promise<void>;
}

/** Sleep padrão — setTimeout puro (injetável via `CallLlmDeps.sleep`). */
export const defaultSleep = (ms: number): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * A requisição que este transporte entrega ao cliente. `reasoningEffort` é o
 * campo que `services/llmClient.ts` (reescrito para o OpenRouter na
 * mesma onda) passa a aceitar em `LlmChatRequest`. Declarar aqui a
 * extensão é DELIBERADO: o transporte compila contra a versão do cliente que
 * ainda não tem o campo E contra a que já tem (a redeclaração é idêntica, e
 * um cliente antigo simplesmente ignora a propriedade extra).
 */
export interface EngineChatRequest extends LlmChatRequest {
  reasoningEffort?: OpenRouterEffort;
}

/**
 * A invocação do cliente de chat — INJETADA pela fachada `runtime/callLlm.ts`.
 * INV-01 (grep gate do plano): a referência ao método do cliente vive SÓ na
 * fachada; o núcleo (`callLlmTransport.ts`) recebe a função por este tipo e
 * nunca nomeia o método.
 */
export type ChatInvoker = (req: LlmChatRequest) => Promise<LlmChatResponse>;

/**
 * As dependências do núcleo do transporte: as `CallLlmDeps` públicas MAIS a
 * invocação do cliente já ligada pela fachada (`callLlm.ts`).
 */
export interface CallLlmTransportDeps extends CallLlmDeps {
  invocarChat: ChatInvoker;
}
