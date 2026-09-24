/**
 * app/electron/main/engine/runtime/callLlmTransport.ts — A FÁBRICA do transporte
 * único de LLM da engine (`createCallLlm`): semáforo, backoff por código,
 * timeout obrigatório por etapa, cache por chave sha256, usage agregado por
 * etapa e log sempre sanitizado.
 *
 * EXTRAÍDO de `runtime/callLlm.ts` na refatoração L06 (arquivo ≤500 linhas,
 * CC≤8 — a função `callLlm` de CC 35 virou um orquestrador de passos
 * nomeados; COMPORTAMENTO OBSERVÁVEL preservado: attempts/retried por código,
 * ordem dos logs, ordem cache→semáforo, mensagens byte a byte). O caminho
 * PÚBLICO continua `runtime/callLlm.ts` (fachada fina).
 *
 * O QUE ESTE MÓDULO FAZ (o contrato completo está no cabeçalho da fachada):
 *   1. SEMÁFORO de concorrência (SEM_LLM) — o slot é liberado no `finally`
 *      em TODO caminho (sucesso, erro, timeout, fail-closed de validação).
 *   2. BACKOFF por código (`backoff.ts`): 429/SERVER_ERROR/NETWORK retentam;
 *      EMPTY_CONTENT retenta UMA vez; KEY_MISSING/KEY_INVALID/BAD_REQUEST
 *      NUNCA retentam. **429 é backoff, nunca fallback (A-P01-4, §11)**.
 *   3. TIMEOUT OBRIGATÓRIO por etapa (`req.timeoutMs`): etapa travada é
 *      REJEITADA com LLM_STAGE_TIMEOUT, SEM retry.
 *   4. CACHE por chave sha256 (`llmCache.ts`) — a chave é função da ENTRADA
 *      (effort efetivo: `'max'` explícito == omissão).
 *   5. USAGE agregado POR ETAPA (`getStageUsage`/`getAllStageUsage`).
 *   6. LOG sempre sanitizado por `renderSanitizedBodyFragment` — a chave de
 *      API NUNCA aparece em log nem em erro.
 *
 * API key: resolvida UMA vez por execução e memoizada (primeira chamada
 * resolve e cacheia; resolução vazia/que lançou vira KEY_MISSING
 * determinístico nas chamadas seguintes). Keyless nunca chega à rede.
 *
 * INV-01 (grep gate do plano): o invariante é CONTRATO e está reproduzido
 * LITERALMENTE na fachada `runtime/callLlm.ts` (não se reescreve para caber em
 * refatoração). A invocação do cliente entra AQUI por dependência injetada
 * (`CallLlmTransportDeps.invocarChat`) e este núcleo NUNCA nomeia o método do
 * cliente — a referência real vive só na fachada.
 */

import { OPENROUTER_MODEL } from '@shared/llm/constants';
import {
  LLM_ERROR_CODES,
  LlmError,
  type LlmChatResponse,
  renderSanitizedBodyFragment,
} from '../../services/llmClient';
import { retryAfterMsFrom, retryDecision, type BackoffConfig } from './backoff';
import { cacheKeyFor, type CacheStore, type LlmCacheEntry, type LlmCacheKeyInput } from './llmCache';
import { createSemaphore, DEFAULT_LLM_CONCURRENCY, type Semaphore } from './semaphore';
import {
  LLM_TRANSPORT_CODES,
  defaultSleep,
  LlmStageError,
  type CallLlmTransportDeps,
  type EngineLlm,
  type LlmCallRequest,
  type LlmCallResult,
  type LlmStageErrorCode,
  type StageUsage,
} from './callLlmTypes';
import { montarClientRequest, montarKeyInput, esforcoEfetivo, validateRequest } from './callLlmRequest';

// ─── fábrica do transporte ───────────────────────────────────────────────────

export function createCallLlmTransport(deps: CallLlmTransportDeps): EngineLlm {
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

  /** Resolve a chave (memoizada) ou REJEITA KEY_MISSING antes de rede/cache. */
  async function resolverChave(etapa: string): Promise<string> {
    let key = '';
    try {
      key = await resolveKeyOnce();
    } catch (error) {
      throw stageError(
        etapa,
        LLM_ERROR_CODES.KEY_MISSING,
        'falha ao resolver a chave de API.',
        0,
        0,
        error,
      );
    }
    if (!key) {
      throw stageError(etapa, LLM_ERROR_CODES.KEY_MISSING, 'chave de API não configurada.', 0, 0);
    }
    return key;
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
  function isClientTimeout(raw: LlmError): boolean {
    return (
      raw.code === LLM_ERROR_CODES.NETWORK &&
      raw.cause instanceof Error &&
      raw.cause.name === 'AbortError'
    );
  }


  type AttemptOutcome =
    | { kind: 'done'; value: LlmChatResponse }
    | { kind: 'error'; error: unknown }
    | { kind: 'timeout' };

  /**
   * Corrida da chamada contra `ms`: se a chamada não se resolver até o
   * deadline, devolve 'timeout' (a promise subjacente fica órfã — o cliente
   * real aborta o fetch no MESMO deadline via o timeoutMs que este módulo
   * repassa a ele).
   */
  function attemptWithDeadline(promise: Promise<LlmChatResponse>, ms: number): Promise<AttemptOutcome> {
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




  /**
   * Consulta o cache ANTES do semáforo (acerto não consome slot). Falha de IO
   * do cache nunca derruba o transporte: miss silencioso (é otimização de
   * custo, não contrato de corretude). Devolve o resultado do acerto, ou
   * `undefined` para seguir ao provedor.
   */
  async function consultarCache(
    etapa: string,
    req: LlmCallRequest,
    modelId: string,
    keyInput: LlmCacheKeyInput,
    startedAt: number,
    cacheStore: CacheStore | undefined,
  ): Promise<LlmCallResult | undefined> {
    if (!cacheStore) return undefined;
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
      log(
        sanitizePayload({
          evento: 'cache-erro',
          etapa,
          detalhe: error instanceof Error ? error.message : String(error),
        }),
      );
    }
    return undefined;
  }

  /** Grava o artefato no cache (se ligado) — falha de IO vira log, nunca erro. */
  async function gravarNoCache(
    etapa: string,
    keyInput: LlmCacheKeyInput,
    response: LlmChatResponse,
    thisUsage: { promptTokens: number; completionTokens: number } | undefined,
  ): Promise<void> {
    const cacheStore: CacheStore | undefined = deps.cache;
    if (!cacheStore) return;
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

  /**
   * O erro de UMA tentativa: timeout do cliente, erro tipado (com a decisão de
   * retry/backoff — retenta após dormir) ou erro NÃO tipado (fail-closed:
   * nunca se classifica erro desconhecido como transitório). Lança nos caminhos
   * finais; volta normal só quando há retry (o sono já aconteceu aqui).
   */
  async function processarErroDeTentativa(
    etapa: string,
    req: LlmCallRequest,
    raw: unknown,
    attempt: number,
    retried: number,
  ): Promise<void> {
    if (!(raw instanceof LlmError)) {
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
    // Timeout do própriO cliente (AbortError mapeado para NETWORK) também é
    // etapa travada — mesma regra: rejeita, não retenta.
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
    // `Retry-After` do 429 (o cliente o preenche em `retryAfterMs`). Leitura
    // DEFENSIVA: fake de teste ou cliente sem o campo caem no exponencial de
    // sempre, nunca numa exceção.
    const retryAfterMs = retryAfterMsFrom(raw);
    const decision = retryDecision(raw.code, attempt, backoff, retryAfterMs);
    log(
      sanitizePayload({
        evento: decision.retry ? 'retry' : 'erro',
        etapa,
        code: raw.code,
        tentativa: attempt,
        motivo: decision.reason,
        atrasoMs: decision.delayMs,
        retryAfter: decision.honoredRetryAfter,
        detalhe: raw.message,
      }),
    );
    if (!decision.retry) {
      throw stageError(etapa, raw.code, raw.message, attempt, retried, raw);
    }
    await sleep(decision.delayMs);
  }

  /** Sucesso: usage acumulado, artefato no cache, log `ok` e o resultado. */
  async function registrarSucesso(
    etapa: string,
    keyInput: LlmCacheKeyInput,
    response: LlmChatResponse,
    attempt: number,
    startedAt: number,
  ): Promise<LlmCallResult> {
    const thisUsage = response.usage;
    const stageUsageSnapshot = bumpStageUsage(etapa, {
      promptTokens: thisUsage?.promptTokens ?? 0,
      completionTokens: thisUsage?.completionTokens ?? 0,
      llmCalls: 1,
      retries: attempt - 1,
    });
    await gravarNoCache(etapa, keyInput, response, thisUsage);
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

  /**
   * O laço de tentativas sob o slot do SEM_LLM: timeout rejeita sem retry;
   * erro tipado retenta com backoff (`retried = attempt` a cada retentativa
   * efetiva); sucesso encerra. A invocação do cliente (`invocarChat`) vem
   * injetada da fachada `callLlm.ts` (INV-01).
   */
  async function executarComRetries(
    etapa: string,
    req: LlmCallRequest,
    modelId: string,
    keyInput: LlmCacheKeyInput,
    startedAt: number,
  ): Promise<LlmCallResult> {
    let retried = 0;
    for (let attempt = 1; ; attempt += 1) {
      const outcome = await attemptWithDeadline(
        deps.invocarChat(montarClientRequest(req, modelId)),
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
        await processarErroDeTentativa(etapa, req, outcome.error, attempt, retried);
        retried = attempt;
        continue;
      }

      return registrarSucesso(etapa, keyInput, outcome.value, attempt, startedAt);
    }
  }

  async function callLlm(etapa: string, req: LlmCallRequest): Promise<LlmCallResult> {
    const startedAt = now();

    const validation = validateRequest(req);
    if (validation) {
      // Bug da etapa chamadora — BAD_REQUEST nunca retenta (política backoff).
      throw stageError(etapa, LLM_ERROR_CODES.BAD_REQUEST, validation, 0, 0);
    }

    // Chave: resolvida uma vez, memoizada. Sem chave ⇒ KEY_MISSING (aborta o
    // run — código não-retentável por política) antes de tocar rede OU cache.
    resolvedKey = await resolverChave(etapa);

    const modelId = req.modelId ?? OPENROUTER_MODEL.id;
    const effectiveEffort = esforcoEfetivo(req);

    const keyInput = montarKeyInput(req, modelId, effectiveEffort);
    const acerto = await consultarCache(etapa, req, modelId, keyInput, startedAt, deps.cache);
    if (acerto) return acerto;

    // SEM_LLM: o slot é liberado no finally — timeout nunca segura a onda.
    const release = await semaphore.acquire();
    try {
      return await executarComRetries(etapa, req, modelId, keyInput, startedAt);
    } finally {
      release();
    }
  }

  return {
    callLlm,
    getStageUsage(etapa: string): Readonly<StageUsage> | undefined {
      const usage = stageUsage.get(etapa);
      // Cópia — o chamador nunca recebe a referência mutável do acumulador
      // (Readonly<> é só tempo de compilação; a cópia protege a contabilidade).
      return usage ? { ...usage } : undefined;
    },
    getAllStageUsage(): Readonly<Record<string, StageUsage>> {
      return Object.fromEntries(stageUsage.entries());
    },
  };
}
