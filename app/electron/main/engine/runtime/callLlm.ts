/**
 * app/electron/main/engine/runtime/callLlm.ts — O TRANSPORTE ÚNICO de LLM da
 * engine de trilhas (P-01, `docs/16-engine-de-trilha.md` §4.1, §11).
 *
 * Todo chamada de LLM da engine passa por `callLlm(etapa, req)`. Este módulo
 * concentra o que não existia em lugar nenhum:
 *
 *   1. SEMÁFORO de concorrência (SEM_LLM — rede; SEM_EXEC fica no semaphore.ts
 *      para os spawns de P-07).
 *   2. BACKOFF por código de erro (`backoff.ts`): 429/SERVER_ERROR/NETWORK
 *      retentam; EMPTY_CONTENT retenta UMA vez; KEY_MISSING/KEY_INVALID/
 *      BAD_REQUEST NUNCA retentam. **429 é backoff, nunca fallback de
 *      provedor (A-P01-4, §11)** — existe UM cliente, injetado, e nenhum
 *      caminho alternativo.
 *   3. TIMEOUT OBRIGATÓRIO por etapa (`req.timeoutMs`): uma etapa travada
 *      nunca segura a onda — o slot do semáforo é liberado no `finally` e a
 *      etapa travada é REJEITADA com erro estruturado (LLM_STAGE_TIMEOUT),
 *      sem retry (retentar uma etapa que pendurou é segurar o slot de novo).
 *   4. CACHE por chave sha256 (llmCache.ts), opcional por configuração
 *      (presença do store = ligado). A chave é função da ENTRADA — ver o
 *      aviso de temperature:0 no cabeçalho do llmCache.ts.
 *   5. USAGE agregado POR ETAPA: prompt/completion tokens acumulados por
 *      etapa e expostos no retorno de cada chamada e via getStageUsage.
 *   6. LOG sempre sanitizado por `renderSanitizedBodyFragment` (importado do
 *      deepseekClient) — a chave de API NUNCA aparece em log nem em erro.
 *
 * API key: resolvida UMA vez por execução e memoizada (primeira chamada
 * resolve e cacheia; resolução vazia/que lançou vira KEY_MISSING
 * determinístico nas chamadas seguintes). Keyless nunca chega à rede.
 *
 * Limite declarado: este módulo NÃO valida o tamanho da saída (a regra
 * "toda saída de agente cabe em 2.000 tokens; acima disso é REJEITADO, nunca
 * truncado" — §7/§4.1 — é dos consumidores de etapa, que conhecem o schema).
 * O transporte devolve o conteúdo INTACTO, sem truncar e sem reclamar.
 *
 * INV-01: `chatCompletion` só pode ser referenciado DENTRO deste arquivo em
 * todo `app/electron/main/engine/` — a engine inteira importa só `callLlm`
 * (grep gate do plano).
 */

import { DEEPSEEK_MODEL } from '../../../../shared/piAgent/constants';
import {
  DEEPSEEK_ERROR_CODES,
  DeepSeekError,
  type DeepSeekChatMessage,
  type DeepSeekChatResponse,
  type DeepSeekClient,
  type DeepSeekErrorCode,
  renderSanitizedBodyFragment,
} from '../../services/deepseekClient';
import { retryDecision, type BackoffConfig } from './backoff';
import { cacheKeyFor, type CacheStore, type LlmCacheEntry } from './llmCache';
import { createSemaphore, DEFAULT_LLM_CONCURRENCY, type Semaphore } from './semaphore';

// ─── códigos e erro estruturado do transporte ───────────────────────────────

/**
 * Códigos próprios do transporte (além dos códigos do deepseekClient que
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
export type LlmStageErrorCode = DeepSeekErrorCode | LlmTransportCode;

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
 * `modelId` (default: contrato DEEPSEEK_MODEL), `temperature` (default 0),
 * `maxTokens` (teto de saída informado ao provedor; o transporte nunca
 * trunca conteúdo).
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
  client: DeepSeekClient;
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

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ─── fábrica do transporte ───────────────────────────────────────────────────

export function createCallLlm(deps: CallLlmDeps): EngineLlm {
  const semaphore: Semaphore = deps.semaphore ?? createSemaphore(DEFAULT_LLM_CONCURRENCY);
  const backoff: BackoffConfig = deps.backoff ?? {};
  const log: (line: string) => void = deps.log ?? (() => {});
  const now: () => number = deps.now ?? (() => Date.now());
  const sleep: (ms: number) => Promise<void> = deps.sleep ?? defaultSleep;

  const stageUsage = new Map<string, StageUsage>();

  // Chave resolvida UMA vez por execução e memoizada. A promise é cacheada —
  // se a primeira resolução lançar, as chamadas seguintes recebem o MESMO
  // erro (KEY_MISSING determinístico), em vez de re-tentar resolver a cada
  // etapa. `resolvedKey` alimenta a sanitização do log.
  let apiKeyPromise: Promise<string> | undefined;
  let resolvedKey = '';
  function resolveKeyOnce(): Promise<string> {
    if (!apiKeyPromise) {
      apiKeyPromise = (async () => (await deps.apiKey()).trim())();
    }
    return apiKeyPromise;
  }

  function bumpStageUsage(etapa: string, delta: Partial<StageUsage>): StageUsage {
    const prev = stageUsage.get(etapa) ?? {
      promptTokens: 0,
      completionTokens: 0,
      llmCalls: 0,
      cachedHits: 0,
      retries: 0,
    };
    const next: StageUsage = {
      promptTokens: prev.promptTokens + (delta.promptTokens ?? 0),
      completionTokens: prev.completionTokens + (delta.completionTokens ?? 0),
      llmCalls: prev.llmCalls + (delta.llmCalls ?? 0),
      cachedHits: prev.cachedHits + (delta.cachedHits ?? 0),
      retries: prev.retries + (delta.retries ?? 0),
    };
    stageUsage.set(etapa, next);
    return next;
  }

  /**
   * Toda linha de log passa por `renderSanitizedBodyFragment`: a chave exata
   * e padrões `sk-...` são mascarados ANTES de qualquer truncamento. A chave
   * em log é PROIBIDO (regra do cliente, herdada pelo transporte).
   */
  function sanitizePayload(payload: unknown): string {
    return renderSanitizedBodyFragment(payload, resolvedKey);
  }

  /** Mensagem de erro também sanitizada (defesa em profundidade). */
  function safeMessage(raw: string): string {
    if (!resolvedKey) return raw;
    return renderSanitizedBodyFragment({ message: raw }, resolvedKey, 'message');
  }

  function stageError(
    etapa: string,
    code: LlmStageErrorCode,
    message: string,
    attempts: number,
    retried: number,
    cause?: unknown,
  ): LlmStageError {
    return new LlmStageError({
      code,
      etapa,
      message: safeMessage(message),
      attempts,
      retried,
      cause,
    });
  }

  /** Timeout disparado pelo próprio cliente (AbortError ⇒ NETWORK): etapa travada. */
  function isClientTimeout(raw: DeepSeekError): boolean {
    return (
      raw.code === DEEPSEEK_ERROR_CODES.NETWORK &&
      raw.cause instanceof Error &&
      raw.cause.name === 'AbortError'
    );
  }

  function validateRequest(req: LlmCallRequest): string | null {
    if (!req.prompt || req.prompt.trim().length === 0) {
      return 'prompt vazio — sem mensagem não há chamada';
    }
    if (!req.stageVersion || req.stageVersion.trim().length === 0) {
      return 'stageVersion vazio — o cache precisa de identidade de etapa';
    }
    if (!Number.isInteger(req.timeoutMs) || req.timeoutMs < 1) {
      return `timeoutMs inválido (${req.timeoutMs}) — obrigatório por etapa, inteiro ≥ 1`;
    }
    return null;
  }

  type AttemptOutcome =
    | { kind: 'done'; value: DeepSeekChatResponse }
    | { kind: 'error'; error: unknown }
    | { kind: 'timeout' };

  /**
   * Corrida da chamada contra `ms`: se a chamada não se resolver até o
   * deadline, devolve 'timeout' (a promise subjacente fica órfã — o cliente
   * real aborta o fetch no MESMO deadline via o timeoutMs que este módulo
   * repassa a ele).
   */
  function attemptWithDeadline(promise: Promise<DeepSeekChatResponse>, ms: number): Promise<AttemptOutcome> {
    return new Promise<AttemptOutcome>((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve({ kind: 'timeout' });
      }, ms);
      promise.then(
        (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({ kind: 'done', value });
        },
        (error: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({ kind: 'error', error });
        },
      );
    });
  }

  function buildMessages(req: LlmCallRequest): DeepSeekChatMessage[] {
    const messages: DeepSeekChatMessage[] = [];
    if (req.system && req.system.trim().length > 0) {
      messages.push({ role: 'system', content: req.system });
    }
    messages.push({ role: 'user', content: req.prompt });
    return messages;
  }

  async function callLlm(etapa: string, req: LlmCallRequest): Promise<LlmCallResult> {
    const startedAt = now();

    const validation = validateRequest(req);
    if (validation) {
      // Bug da etapa chamadora — BAD_REQUEST nunca retenta (política backoff).
      throw stageError(etapa, DEEPSEEK_ERROR_CODES.BAD_REQUEST, validation, 0, 0);
    }

    // Chave: resolvida uma vez, memoizada. Sem chave ⇒ KEY_MISSING (aborta o
    // run — código não-retentável por política) antes de tocar rede OU cache.
    let key = '';
    try {
      key = await resolveKeyOnce();
    } catch (error) {
      throw stageError(
        etapa,
        DEEPSEEK_ERROR_CODES.KEY_MISSING,
        'falha ao resolver a chave de API.',
        0,
        0,
        error,
      );
    }
    if (!key) {
      throw stageError(etapa, DEEPSEEK_ERROR_CODES.KEY_MISSING, 'chave de API não configurada.', 0, 0);
    }
    resolvedKey = key;

    const modelId = req.modelId ?? DEEPSEEK_MODEL.id;

    // Cache: chave = sha256(prompt + schema + params + model_id +
    // stage_version). Parâmetros de geração (temperatura/maxTokens) entram
    // via params: mesmo prompt com knobs diferentes NÃO compartilha artefato.
    const keyInput = {
      prompt: req.prompt,
      schema: req.schema,
      params: {
        ...(req.params ?? {}),
        temperature: req.temperature ?? 0,
        ...(req.maxTokens !== undefined ? { maxTokens: req.maxTokens } : {}),
      },
      modelId,
      stageVersion: req.stageVersion,
    };
    const cacheStore: CacheStore | undefined = deps.cache;

    if (cacheStore) {
      const cacheKey = cacheKeyFor(keyInput);
      try {
        const hit = (await cacheStore.get(cacheKey)) as LlmCacheEntry | undefined;
        if (hit && typeof hit.content === 'string' && hit.content.length > 0) {
          const stageUsageSnapshot = bumpStageUsage(etapa, { cachedHits: 1 });
          log(
            sanitizePayload({ evento: 'cache-hit', etapa, stageVersion: req.stageVersion, modelId }),
          );
          return {
            content: hit.content,
            model: hit.model,
            cached: true,
            stageUsage: stageUsageSnapshot,
            attempts: 0,
            elapsedMs: now() - startedAt,
          };
        }
      } catch (error) {
        // Falha de IO do cache nunca derruba o transporte: miss silencioso
        // (é otimização de custo, não contrato de corretude).
        log(
          sanitizePayload({
            evento: 'cache-erro',
            etapa,
            detalhe: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }

    // SEM_LLM: o slot é liberado no finally — timeout nunca segura a onda.
    const release = await semaphore.acquire();
    let retried = 0;
    try {
      for (let attempt = 1; ; attempt += 1) {
        const outcome = await attemptWithDeadline(
          deps.client.chatCompletion({
            messages: buildMessages(req),
            temperature: req.temperature ?? 0,
            ...(req.maxTokens !== undefined ? { maxTokens: req.maxTokens } : {}),
            model: modelId,
            timeoutMs: req.timeoutMs,
          }),
          req.timeoutMs,
        );

        if (outcome.kind === 'timeout') {
          // Etapa travada: cancela e REJEITA (sem retry — retentar pendurada
          // seguraria o slot de novo). Fail-closed, erro estruturado.
          throw stageError(
            etapa,
            LLM_TRANSPORT_CODES.STAGE_TIMEOUT,
            `etapa excedeu o teto de ${req.timeoutMs}ms e foi cancelada.`,
            attempt,
            retried,
          );
        }

        if (outcome.kind === 'error') {
          const raw: unknown = outcome.error;
          if (raw instanceof DeepSeekError) {
            // Timeout do própriO cliente (AbortError mapeado para NETWORK)
            // também é etapa travada — mesma regra: rejeita, não retenta.
            if (isClientTimeout(raw)) {
              throw stageError(
                etapa,
                LLM_TRANSPORT_CODES.STAGE_TIMEOUT,
                `etapa excedeu o teto de ${req.timeoutMs}ms e foi cancelada (abort do transporte).`,
                attempt,
                retried,
                raw,
              );
            }
            const decision = retryDecision(raw.code, attempt, backoff);
            log(
              sanitizePayload({
                evento: decision.retry ? 'retry' : 'erro',
                etapa,
                code: raw.code,
                tentativa: attempt,
                motivo: decision.reason,
                detalhe: raw.message,
              }),
            );
            if (!decision.retry) {
              throw stageError(etapa, raw.code, raw.message, attempt, retried, raw);
            }
            retried = attempt;
            await sleep(decision.delayMs);
            continue;
          }
          // Erro NÃO tipado do transporte injetado: fail-closed — não se
          // classifica erro desconhecido como transitório nem como bug de
          // prompt; expõe estruturado e não retenta.
          log(
            sanitizePayload({
              evento: 'erro',
              etapa,
              code: LLM_TRANSPORT_CODES.UNKNOWN,
              tentativa: attempt,
              detalhe: raw instanceof Error ? raw.message : String(raw),
            }),
          );
          throw stageError(
            etapa,
            LLM_TRANSPORT_CODES.UNKNOWN,
            'erro não tipado do transporte de LLM.',
            attempt,
            retried,
            raw,
          );
        }

        // Sucesso.
        const response = outcome.value;
        const thisUsage = response.usage;
        const stageUsageSnapshot = bumpStageUsage(etapa, {
          promptTokens: thisUsage?.promptTokens ?? 0,
          completionTokens: thisUsage?.completionTokens ?? 0,
          llmCalls: 1,
          retries: attempt - 1,
        });

        if (cacheStore) {
          const entry: LlmCacheEntry = {
            content: response.content,
            model: response.model,
            ...(thisUsage ? { usage: thisUsage } : {}),
            createdAt: new Date().toISOString(),
          };
          try {
            await cacheStore.set(cacheKeyFor(keyInput), entry);
          } catch (error) {
            log(
              sanitizePayload({
                evento: 'cache-erro',
                etapa,
                detalhe: error instanceof Error ? error.message : String(error),
              }),
            );
          }
        }

        log(
          sanitizePayload({
            evento: 'ok',
            etapa,
            tentativa: attempt,
            promptTokens: thisUsage?.promptTokens ?? 0,
            completionTokens: thisUsage?.completionTokens ?? 0,
          }),
        );

        return {
          content: response.content,
          model: response.model,
          cached: false,
          ...(thisUsage ? { usage: thisUsage } : {}),
          stageUsage: stageUsageSnapshot,
          attempts: attempt,
          elapsedMs: now() - startedAt,
        };
      }
    } finally {
      release();
    }
  }

  return {
    callLlm,
    getStageUsage(etapa: string): Readonly<StageUsage> | undefined {
      return stageUsage.get(etapa);
    },
    getAllStageUsage(): Readonly<Record<string, StageUsage>> {
      return Object.fromEntries(stageUsage.entries());
    },
  };
}