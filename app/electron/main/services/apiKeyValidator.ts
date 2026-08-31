/**
 * electron/main/services/apiKeyValidator.ts — validação de chaves de API no
 * MAIN PROCESS (anti-CORS): DeepSeek e Brave.
 *
 * Roda no main para evitar CORS do renderer. Cada validador:
 * - 200 → chave VÁLIDA (DeepSeek ainda checa o model id alvo e reporta
 *   `modelAvailable`);
 * - 401/403 → chave INVÁLIDA ("Invalid API key");
 * - 402/429 → chave VÁLIDA (sem créditos / rate limit ≠ chave inválida);
 * - erro de rede / outro status → parseado e reportado como inválido
 *   (erroMessage com a causa).
 *
 * RODADA 10 (onda 2b — sem spinner infinito): cada validação roda sob um
 * AbortSignal de timeout (`timeoutMs`, default 8s; `0` desliga). O timeout
 * cobre o pipeline COMPLETO — fetch E leitura do corpo (`response.json()`):
 * rede que ENGOLÉ pacotes antes dos headers OU depois deles (body-stall —
 * headers chegam, corpo nunca chega) NUNCA segura a validação. O resultado é
 * um erro de REDE identificável — "Network error: timed out after Nms" — que
 * o classificador do startup-handlers (isNetworkError) reconhece por
 * /^Network error:/i e /timed out/i.
 *
 * A base_url, o fetch e o timeout são injetáveis via `opts` para testes —
 * nunca usa rede real fora do runtime.
 */

import type { ValidationResult } from '@shared/ipc-contract';

/**
 * Resultado da validação DeepSeek: estende ValidationResult com
 * `modelAvailable` — este campo é propriedade EXCLUSIVA deste validador (não
 * faz parte do contrato congelado), adicionado por uma interface local.
 */
export interface DeepSeekValidationResult extends ValidationResult {
  provider: 'deepseek';
  /** true quando a resposta 200 listou o modelo alvo (deepseek-v4-flash). */
  modelAvailable?: boolean;
}

export interface BraveValidationResult extends ValidationResult {
  provider: 'brave';
}

export interface DeepSeekValidateOptions {
  /** fetch injetável (testes). Default: fetch global. */
  fetchImpl?: typeof fetch;
  /** base_url da API DeepSeek. Default: https://api.deepseek.com */
  baseUrl?: string;
  /**
   * Timeout da validação em ms via AbortSignal (default
   * DEFAULT_VALIDATE_TIMEOUT_MS = 8000). Cobre o pipeline COMPLETO: fetch e
   * leitura do corpo (`response.json()`) — body-stall também é cortado. `0`
   * desliga o timeout (a validação pode pendurar — só para testes de caso
   * extremo).
   */
  timeoutMs?: number;
}

export interface BraveValidateOptions {
  /** fetch injetável (testes). Default: fetch global. */
  fetchImpl?: typeof fetch;
  /** base_url da Brave Search API. Default: https://api.search.brave.com */
  baseUrl?: string;
  /**
   * Timeout em ms via AbortSignal, cobrindo fetch + leitura do corpo
   * (default 8000; `0` desliga).
   */
  timeoutMs?: number;
}

/**
 * Timeout padrão de cada validação — rede pendurada nunca segura a UI (o único
 * loader REAL sem timeout do app era este fetch; ver docs/app-gui.md §2.18 "IPC com timeout").
 */
export const DEFAULT_VALIDATE_TIMEOUT_MS = 8000;

/** Model id alvo (DeepSeek V4 Flash, validado em GET /models). */
const DEEPSEEK_TARGET_MODEL = 'deepseek-v4-flash';
/** Restringe o match a ids que contenham o alvo, para aceitar `deepseek-v4-flash` */
const DEEPSEEK_MODEL_PATTERN = 'deepseek-v4-flash';

const DEEPSEEK_DEFAULT_BASE = 'https://api.deepseek.com';
const BRAVE_DEFAULT_BASE = 'https://api.search.brave.com';

/** Extrai a mensagem de texto de um corpo de erro DeepSeek/Brave. */
function extractErrorText(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const obj = payload as Record<string, unknown>;
  if (typeof obj.error === 'object' && obj.error !== null) {
    const err = obj.error as Record<string, unknown>;
    if (typeof err.message === 'string') return err.message;
  }
  if (typeof obj.message === 'string') return obj.message;
  return undefined;
}

/**
 * True quando a rejeição é um abort/timeout (AbortError ou mensagem marcada
 * com "timed out"/"aborted"). É a assinatura de rejeição do AbortSignal DESTE
 * módulo (os validadores não passam sinal externo) — nunca um parse
 * fracassado de corpo.
 */
function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || /timed out|aborted/i.test(error.message))
  );
}

/**
 * Roda `work` sob um AbortSignal de timeout que cobre o pipeline COMPLETO —
 * fetch E leitura do corpo (`response.json()`). O work recebe o sinal e deve
 * repassá-lo ao fetch; o timer só é limpo quando o WORK inteiro resolve/
 * rejeita (não quando o fetch entrega os headers).
 *
 * O wrapper CORRE o work contra o timer: no prazo, aborta o sinal (o fetch
 * real, undici, rejeita o body read pendurado — o que libera o socket) E
 * rejeita com "timed out after Nms" — mesmo que o work ignore o abort (mock
 * com json() que nunca resolve), a promessa do wrapper NUNCA fica pendurada
 * além do prazo. `timeoutMs` 0 desliga: work roda com um sinal inerte, sem
 * timer.
 *
 * W3 (throw síncrono): o work é invocado via Promise.resolve().then — um
 * throw SINCRONO do work (fetchImpl que lança na chamada) vira rejeição
 * normal e o timer é sempre limpo no settle. Nenhum caminho vaza o timer
 * segurando o processo.
 */
function withFetchTimeout<T>(work: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    // Timeout desligado: sinal inerte (nunca abortado), sem timer. O
    // Promise.resolve().then normaliza throw síncrono do work.
    return Promise.resolve().then(() => work(new AbortController().signal));
  }
  const controller = new AbortController();
  const timeoutError = new Error(`timed out after ${timeoutMs}ms`);
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      // Corta o fetch/body read em voo (undici rejeita o corpo pendurado)…
      controller.abort(timeoutError);
      // …e o wrapper NUNCA fica pendurado além do prazo, mesmo que o work
      // ignore o abort (mock com corpo que nunca resolve).
      reject(timeoutError);
    }, timeoutMs);
    Promise.resolve()
      .then(() => work(controller.signal))
      .then(
        (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        }
      );
  });
}

/**
 * Descreve a rejeição de um pipeline de validação. AbortError (ou reason
 * "timed out") só pode vir do timer DESTE módulo (os validadores não passam
 * sinal externo) → vira erro de TIMEOUT identificável; qualquer outra
 * rejeição é erro de rede bruto.
 */
function describeFetchError(error: unknown, timeoutMs: number): string {
  if (isAbortError(error)) {
    return `timed out after ${timeoutMs}ms`;
  }
  return error instanceof Error ? error.message : 'Network error';
}

/**
 * Valida uma chave DeepSeek contra GET {baseUrl}/models.
 *
 * 200 → válida; verifica a lista de modelos (campo `data[].id`) contra o model
 * alvo e preenche `modelAvailable`. Se a lista não vier ou não for parseável,
 * não falha — apenas deixa `modelAvailable` ausente/false.
 */
export async function validateDeepseekKey(
  apiKey: string,
  opts: DeepSeekValidateOptions = {}
): Promise<DeepSeekValidationResult> {
  const baseUrl = (opts.baseUrl ?? DEEPSEEK_DEFAULT_BASE).replace(/\/+$/, '');
  const timeoutMs = opts.timeoutMs ?? DEFAULT_VALIDATE_TIMEOUT_MS;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const checkedAt = new Date().toISOString();

  if (!apiKey || apiKey.trim() === '') {
    return {
      isValid: false,
      provider: 'deepseek',
      errorMessage: 'API key is empty',
      checkedAt,
    };
  }

  // O pipeline INTEIRO (fetch + leitura do corpo) roda sob o timeout: rede que
  // engole pacotes DEPOIS dos headers (body-stall em response.json()) também
  // é cortada — a rejeição vira "Network error: timed out after Nms".
  try {
    return await withFetchTimeout(async (signal): Promise<DeepSeekValidationResult> => {
      const response = await fetchImpl(`${baseUrl}/models`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey.trim()}` },
        signal,
      });

      if (response.status === 200) {
        // Modelo validado: tenta ler a lista de modelos (parse NÃO fatal —
        // um corpo pendurado aqui é cortado pelo timeout do wrapper).
        let modelAvailable: boolean | undefined;
        try {
          const body = (await response.json()) as {
            data?: Array<{ id?: unknown }>;
          };
          const ids = Array.isArray(body?.data)
            ? body.data
                .map((m) => (typeof m?.id === 'string' ? m.id : undefined))
                .filter((id): id is string => typeof id === 'string')
            : [];
          modelAvailable = ids.some(
            (id: string) => id === DEEPSEEK_TARGET_MODEL || id.includes(DEEPSEEK_MODEL_PATTERN)
          );
        } catch {
          // Corpo não-JSON ou schema inesperado: não falha, mas marca sem lista.
          modelAvailable = undefined;
        }
        if (modelAvailable === false) {
          return {
            isValid: true,
            provider: 'deepseek',
            modelAvailable: false,
            errorMessage: 'Key válida, mas o modelo alvo não consta na lista de modelos da conta.',
            checkedAt,
          };
        }
        return { isValid: true, provider: 'deepseek', modelAvailable, checkedAt };
      }

      if (response.status === 401 || response.status === 403) {
        return {
          isValid: false,
          provider: 'deepseek',
          errorMessage: 'Invalid API key',
          checkedAt,
        };
      }

      if (response.status === 402 || response.status === 429) {
        // Sem créditos (402) / rate limit (429): chave é válida, apenas indisponível agora.
        return { isValid: true, provider: 'deepseek', checkedAt };
      }

      // Outro status: tenta extrair mensagem do corpo (parse NÃO fatal — um
      // corpo pendurado aqui também é cortado pelo timeout do wrapper).
      let parsed: string | undefined;
      try {
        parsed = extractErrorText(await response.json());
      } catch {
        parsed = undefined;
      }
      const errorMessage = parsed || `HTTP ${response.status}: ${response.statusText}`;
      return { isValid: false, provider: 'deepseek', errorMessage, checkedAt };
    }, timeoutMs);
  } catch (error) {
    const errorMessage = describeFetchError(error, timeoutMs);
    return {
      isValid: false,
      provider: 'deepseek',
      errorMessage: `Network error: ${errorMessage}`,
      checkedAt,
    };
  }
}

/**
 * Valida uma chave Brave contra GET {baseUrl}/res/v1/web/search.
 *
 * 200 → válida; 401/403 → inválida; 429 → válida com nota de rate limit.
 * Sem créditos a Brave responde 401 (assinatura inválida), então o caso 402 não
 * é tratado como válido aqui.
 */
export async function validateBraveKey(
  apiKey: string,
  opts: BraveValidateOptions = {}
): Promise<BraveValidationResult> {
  const baseUrl = (opts.baseUrl ?? BRAVE_DEFAULT_BASE).replace(/\/+$/, '');
  const timeoutMs = opts.timeoutMs ?? DEFAULT_VALIDATE_TIMEOUT_MS;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const checkedAt = new Date().toISOString();

  if (!apiKey || apiKey.trim() === '') {
    return {
      isValid: false,
      provider: 'brave',
      errorMessage: 'API key is empty',
      checkedAt,
    };
  }

  // Mesmo contrato do validador DeepSeek: o pipeline inteiro (fetch + corpo)
  // sob o timeout, body-stall incluído.
  try {
    return await withFetchTimeout(async (signal): Promise<BraveValidationResult> => {
      const response = await fetchImpl(`${baseUrl}/res/v1/web/search?q=test&count=1`, {
        method: 'GET',
        headers: {
          'X-Subscription-Token': apiKey.trim(),
          Accept: 'application/json',
        },
        signal,
      });

      if (response.status === 200) {
        return { isValid: true, provider: 'brave', checkedAt };
      }

      if (response.status === 401 || response.status === 403) {
        return {
          isValid: false,
          provider: 'brave',
          errorMessage: 'Invalid API key',
          checkedAt,
        };
      }

      if (response.status === 429) {
        return {
          isValid: true,
          provider: 'brave',
          errorMessage: 'Rate limited (key válida).',
          checkedAt,
        };
      }

      let parsed: string | undefined;
      try {
        parsed = extractErrorText(await response.json());
      } catch {
        parsed = undefined;
      }
      const errorMessage = parsed || `HTTP ${response.status}: ${response.statusText}`;
      return { isValid: false, provider: 'brave', errorMessage, checkedAt };
    }, timeoutMs);
  } catch (error) {
    const errorMessage = describeFetchError(error, timeoutMs);
    return {
      isValid: false,
      provider: 'brave',
      errorMessage: `Network error: ${errorMessage}`,
      checkedAt,
    };
  }
}
