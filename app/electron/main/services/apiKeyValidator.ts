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
 * A base_url e o fetch são injetáveis via `opts` para testes — nunca usa rede
 * real fora do runtime.
 */

import type { ValidationResult } from '@shared/ipc-contract';

/**
 * Resultado da validação DeepSeek: estende ValidationResult com
 * `modelAvailable` — este campo é propriedade EXCLUSIVA deste validador (não
 * faz parte do contrato congelado), adicionado por uma interface local.
 */
export interface DeepSeekValidationResult extends ValidationResult {
  provider: 'deepseek';
  /** true quando a resposta 200 listou o modelo alvo (deepseek-v4-flash-0731). */
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
}

export interface BraveValidateOptions {
  /** fetch injetável (testes). Default: fetch global. */
  fetchImpl?: typeof fetch;
  /** base_url da Brave Search API. Default: https://api.search.brave.com */
  baseUrl?: string;
}

/** Model id alvo do contrato da onda (DeepSeek V4 Flash 0731). */
const DEEPSEEK_TARGET_MODEL = 'deepseek-v4-flash-0731';
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

  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}/models`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Network error';
    return {
      isValid: false,
      provider: 'deepseek',
      errorMessage: `Network error: ${errorMessage}`,
      checkedAt,
    };
  }

  if (response.status === 200) {
    // Modelo validado: tenta ler a lista de modelos (parse NÃO fatal).
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

  // Outro status: tenta extrair mensagem do corpo.
  let parsed: string | undefined;
  try {
    parsed = extractErrorText(await response.json());
  } catch {
    parsed = undefined;
  }
  const errorMessage = parsed || `HTTP ${response.status}: ${response.statusText}`;
  return { isValid: false, provider: 'deepseek', errorMessage, checkedAt };
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

  const url = `${baseUrl}/res/v1/web/search?q=test&count=1`;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        'X-Subscription-Token': apiKey.trim(),
        Accept: 'application/json',
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Network error';
    return {
      isValid: false,
      provider: 'brave',
      errorMessage: `Network error: ${errorMessage}`,
      checkedAt,
    };
  }

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
}