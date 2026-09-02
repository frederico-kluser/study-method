/**
 * app/electron/main/engine/runtime/backoff.ts — política de retry/backoff do
 * transporte único de LLM (`docs/16-engine-de-trilha.md` §11: "429 é backoff,
 * nunca fallback"; §5.3: "parseie tudo e reprove"; convenção de erro do
 * `services/deepseekClient.ts`).
 *
 * A política é POR CÓDIGO de erro, não uniforme — retentar erro de bug só
 * queima token:
 *
 *   KEY_MISSING, KEY_INVALID → NUNCA retenta (aborta o run inteiro — chave é
 *     condição de config, não condição transitória; retry não muda o 401).
 *   BAD_REQUEST               → NUNCA retenta (é bug de prompt/schema;
 *     repetir a mesma chamada que o servidor rejeitou é queimar token).
 *   EMPTY_CONTENT             → retenta UMA vez (o modelo pode ter "pescado"
 *     uma resposta vazia; uma segunda tentativa é barata).
 *   RATE_LIMIT, SERVER_ERROR, NETWORK → retentam (condições transitórias).
 *     429 NUNCA vira fallback de provedor: backoff, e só backoff (A-P01-4).
 *
 * `Retry-After` É HONRADO — e isto MUDOU. A versão anterior deste cabeçalho
 * declarava backoff cego ("o cliente lê o corpo da Response e a descarta;
 * `Retry-After` não está acessível a jusante"). Não é mais verdade: o cliente
 * do OpenRouter preenche `retryAfterMs` no `DeepSeekError` a partir do header
 * `Retry-After` de um 429 (o header vem em SEGUNDOS; a conversão para ms é do
 * cliente, este módulo recebe ms). Regra deste módulo:
 *
 *   - erro COM `retryAfterMs` → o atraso é ESSE valor, limitado por
 *     `maxDelayMs` da política e SEM jitter (o servidor disse quando voltar;
 *     borrar isso com aleatoriedade é desobedecer de leve). O teto continua
 *     valendo: um `Retry-After: 600` não pode segurar a onda por 10 minutos.
 *   - erro SEM `retryAfterMs` → exponencial com jitter, exatamente como antes.
 *
 * O acesso ao campo é DEFENSIVO (`retryAfterMsFrom`, sobre `unknown`): o
 * transporte pode ser um fake de teste ou uma versão do cliente que ainda não
 * preenche o campo — ausência é o caminho exponencial, nunca uma exceção.
 *
 * Jitter: multiplica o atraso base por [1−j/2, 1+j/2] (`jitterRatio` 0..1,
 * default 0.5). Com `jitterRatio: 0` o atraso é determinístico — o caminho
 * que os testes usam para observar intervalos crescentes sem flakiness.
 */

import {
  DEEPSEEK_ERROR_CODES,
  type DeepSeekErrorCode,
} from '../../services/deepseekClient';

/** Quantas tentativas (além da primeira) cada código de erro tolera. */
export interface RetryPolicy {
  /** Nº máximo de RETENTATIVAS (0 = chama uma única vez e aborta). */
  maxRetries: number;
  /** Atraso da primeira retentativa (ms); dobra a cada tentativa. */
  baseDelayMs: number;
  /** Teto do atraso antes do jitter (ms). Vale TAMBÉM para `Retry-After`. */
  maxDelayMs: number;
}

/**
 * Política DEFAULT por código. Códigos não-retentáveis usam atraso 0 — o
 * backoff nunca chega a ser consultado para eles, mas o registro fica
 * completo para a tabela ser legível e os testes fixarem o contrato.
 */
export const DEFAULT_BACKOFF_POLICIES: Readonly<Record<DeepSeekErrorCode, RetryPolicy>> = {
  [DEEPSEEK_ERROR_CODES.KEY_MISSING]: { maxRetries: 0, baseDelayMs: 0, maxDelayMs: 0 },
  [DEEPSEEK_ERROR_CODES.KEY_INVALID]: { maxRetries: 0, baseDelayMs: 0, maxDelayMs: 0 },
  [DEEPSEEK_ERROR_CODES.BAD_REQUEST]: { maxRetries: 0, baseDelayMs: 0, maxDelayMs: 0 },
  [DEEPSEEK_ERROR_CODES.EMPTY_CONTENT]: { maxRetries: 1, baseDelayMs: 250, maxDelayMs: 2_000 },
  [DEEPSEEK_ERROR_CODES.RATE_LIMIT]: { maxRetries: 4, baseDelayMs: 1_000, maxDelayMs: 30_000 },
  [DEEPSEEK_ERROR_CODES.SERVER_ERROR]: { maxRetries: 3, baseDelayMs: 500, maxDelayMs: 15_000 },
  [DEEPSEEK_ERROR_CODES.NETWORK]: { maxRetries: 3, baseDelayMs: 500, maxDelayMs: 15_000 },
};

/** Configuração de backoff injetável (testes usam atrasos minúsculos). */
export interface BackoffConfig {
  /**
   * Overrides parciais por código — a política resultante é a default com os
   * campos aqui fornecidos substituídos (merge por campo, não por código).
   */
  policies?: Partial<Record<DeepSeekErrorCode, Partial<RetryPolicy>>>;
  /** Amplitude do jitter 0..1. 0 = determinístico (caminho dos testes). */
  jitterRatio?: number;
  /** Fonte de aleatoriedade injetável (testes). Default: Math.random. */
  random?: () => number;
}

const DEFAULT_JITTER_RATIO = 0.5;
const DEFAULT_RANDOM = Math.random;

/**
 * Lê `retryAfterMs` de um erro SEM depender do tipo — o campo é preenchido
 * pelo cliente do OpenRouter a partir do header `Retry-After` de um 429/503.
 *
 * Defensivo de propósito: erro de fake de teste, erro de versão antiga do
 * cliente e erro não-objeto passam por aqui e devolvem `undefined` (= caminho
 * exponencial). Valores inválidos (NaN, Infinity, negativo, não-número) são
 * DESCARTADOS: um header malformado nunca vira um `sleep(NaN)` silencioso.
 */
export function retryAfterMsFrom(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const raw: unknown = (error as { retryAfterMs?: unknown }).retryAfterMs;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return undefined;
  return raw;
}

/** Política final de um código: defaults mesclados com os overrides. */
export function policyFor(code: DeepSeekErrorCode, config: BackoffConfig = {}): RetryPolicy {
  const base = DEFAULT_BACKOFF_POLICIES[code];
  const override = config.policies?.[code];
  if (!override) return base;
  return {
    maxRetries: override.maxRetries ?? base.maxRetries,
    baseDelayMs: override.baseDelayMs ?? base.baseDelayMs,
    maxDelayMs: override.maxDelayMs ?? base.maxDelayMs,
  };
}

/** Quantas retentativas o código tolera sob a config dada. */
export function maxRetriesFor(code: DeepSeekErrorCode, config: BackoffConfig = {}): number {
  return policyFor(code, config).maxRetries;
}

/**
 * Atraso da `attempt`-ésima retentativa (1 = primeira retentativa).
 *
 * - COM `retryAfterMs` (o servidor disse quando voltar): `min(maxDelayMs,
 *   retryAfterMs)`, determinístico — sem exponencial e sem jitter.
 * - SEM `retryAfterMs`: `min(maxDelayMs, baseDelayMs · 2^(attempt−1)) ·
 *   jitter`. Cresce exponencialmente e nunca estoura o teto.
 */
export function backoffDelayMs(
  attempt: number,
  policy: RetryPolicy,
  config: Pick<BackoffConfig, 'jitterRatio' | 'random'> = {},
  retryAfterMs?: number,
): number {
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new RangeError(`backoffDelayMs: attempt precisa ser inteiro ≥ 1 (recebido ${attempt}).`);
  }
  if (retryAfterMs !== undefined && Number.isFinite(retryAfterMs) && retryAfterMs >= 0) {
    // O teto da política continua valendo: uma etapa não pode ser segurada
    // por um `Retry-After` arbitrariamente longo (isso é a onda inteira).
    return Math.floor(Math.min(policy.maxDelayMs, retryAfterMs));
  }
  const jitterRatio = config.jitterRatio ?? DEFAULT_JITTER_RATIO;
  const random = config.random ?? DEFAULT_RANDOM;
  const exponential = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (attempt - 1));
  if (jitterRatio <= 0) return Math.floor(exponential);
  const jitter = 1 - jitterRatio / 2 + random() * jitterRatio; // [1−j/2, 1+j/2]
  return Math.max(0, Math.floor(exponential * jitter));
}

/** Decisão de retry para um erro na `attempt`-ésima retentativa (1-based). */
export interface RetryDecision {
  retry: boolean;
  delayMs: number;
  /** Motivo legível (log/telemetria). */
  reason: string;
  /** true = o atraso veio do header `Retry-After`, não do exponencial. */
  honoredRetryAfter: boolean;
}

/**
 * Decide se `code` retenta após a `attempt`-ésima falha. `attempt` começa em
 * 1 (primeira falha). Retry acontece enquanto `attempt ≤ maxRetries` do
 * código. Códigos desconhecidos (fora do mapa do cliente) NÃO retentam —
 * fail-closed: não se classifica erro desconhecido como transitório.
 *
 * `retryAfterMs` (opcional) é o valor lido do erro por `retryAfterMsFrom`:
 * presente ⇒ manda no atraso (limitado por `maxDelayMs`); ausente ⇒
 * exponencial. Ele NÃO muda a decisão de retentar — só o QUANDO. Um código
 * não-retentável que venha com `Retry-After` continua não retentando.
 */
export function retryDecision(
  code: DeepSeekErrorCode,
  attempt: number,
  config: BackoffConfig = {},
  retryAfterMs?: number,
): RetryDecision {
  const policy = policyFor(code, config);
  if (policy.maxRetries <= 0 || attempt > policy.maxRetries) {
    const reason =
      policy.maxRetries <= 0
        ? `código ${code} nunca retenta`
        : `código ${code} esgotou o teto de ${policy.maxRetries} retentativas`;
    return { retry: false, delayMs: 0, reason, honoredRetryAfter: false };
  }
  const honoredRetryAfter =
    retryAfterMs !== undefined && Number.isFinite(retryAfterMs) && retryAfterMs >= 0;
  const delayMs = backoffDelayMs(attempt, policy, config, retryAfterMs);
  return {
    retry: true,
    delayMs,
    reason: honoredRetryAfter
      ? `retentativa ${attempt}/${policy.maxRetries} para ${code} (Retry-After ${retryAfterMs}ms, teto ${policy.maxDelayMs}ms)`
      : `retentativa ${attempt}/${policy.maxRetries} para ${code}`,
    honoredRetryAfter,
  };
}
