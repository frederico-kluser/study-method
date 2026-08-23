/**
 * electron/main/services/deepseekClient.ts — cliente LEVE one-shot OpenAI-compatible
 * para o DeepSeek (POST {baseUrl}/chat/completions).
 *
 * É o transporte do juiz LLM do protocolo REQUEST/APPLY (docs/00-contratos.md §6):
 * one-shot, sem streaming — o contrato do juiz é uma ÚNICA chamada que devolve o
 * corpo de `items[0]`. Por isso NÃO reutiliza o PiAgentService (agente coding
 * streamado é incompatível com o contrato one-shot).
 *
 * O fetch e a baseUrl são injetáveis para testes (nunca usa rede real fora do
 * runtime). NUNCA expõe a API key em mensagens de erro.
 */

import { DEEPSEEK_MODEL } from '@shared/piAgent/constants';

/** Códigos de erro tipados do cliente DeepSeek (surface mínima e estável). */
export const DEEPSEEK_ERROR_CODES = {
  /** Nenhuma chave configurada (sem valor a enviar). */
  KEY_MISSING: 'DEEPSEEK_KEY_MISSING',
  /** 401/403 — chave inválida ou sem permissão. */
  KEY_INVALID: 'DEEPSEEK_KEY_INVALID',
  /** 429 — rate limit / quota. */
  RATE_LIMIT: 'DEEPSEEK_RATE_LIMIT',
  /** 5xx com corpo parseável (mensagem de error.message). */
  SERVER_ERROR: 'DEEPSEEK_SERVER_ERROR',
  /** fetch falhou / timeout / corpo ilegível. */
  NETWORK: 'DEEPSEEK_NETWORK',
} as const;

export type DeepSeekErrorCode = (typeof DEEPSEEK_ERROR_CODES)[keyof typeof DEEPSEEK_ERROR_CODES];

/** Erro tipado do cliente. `code` é a superfície estável consumida pelo juiz. */
export class DeepSeekError extends Error {
  readonly code: DeepSeekErrorCode;
  readonly cause?: unknown;

  constructor(code: DeepSeekErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'DeepSeekError';
    this.code = code;
    this.cause = cause;
  }
}

export interface DeepSeekChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface DeepSeekChatRequest {
  messages: DeepSeekChatMessage[];
  /** coincidência criativa — o juiz usa 0 (determinístico). */
  temperature?: number;
  maxTokens?: number;
  /** sobrescreve o model default (não use fora de teste). */
  model?: string;
  /** timeoutMs injetável — default 60_000. */
  timeoutMs?: number;
}

export interface DeepSeekChatResponse {
  content: string;
  model: string;
  usage?: { promptTokens: number; completionTokens: number };
}

export interface DeepSeekClientDeps {
  /** fetch injetável (testes). Default: fetch global. */
  fetchImpl?: typeof fetch;
  /** base da API. Default: https://api.deepseek.com (constantes da onda). */
  baseUrl?: string;
  /** Resolve a API key sob demanda. Ausente ⇒ erro KEY_MISSING quando chamado. */
  apiKey?: () => Promise<string>;
}

export interface DeepSeekClient {
  chatCompletion(req: DeepSeekChatRequest): Promise<DeepSeekChatResponse>;
}

const DEEPSEEK_DEFAULT_BASE = 'https://api.deepseek.com';
/** Default de timeout por chamada (ms). */
const DEFAULT_TIMEOUT_MS = 60_000;

/** Extrai uma mensagem legível de um corpo de erro OpenAI-compatible. */
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

/** Cria o cliente DeepSeek one-shot com transporte injetável. */
export function createDeepSeekClient(deps: DeepSeekClientDeps = {}): DeepSeekClient {
  const baseUrl = (deps.baseUrl ?? DEEPSEEK_DEFAULT_BASE).replace(/\/+$/, '');
  const fetchImpl = deps.fetchImpl ?? fetch;

  async function chatCompletion(req: DeepSeekChatRequest): Promise<DeepSeekChatResponse> {
    if (!req.messages || req.messages.length === 0) {
      throw new DeepSeekError(DEEPSEEK_ERROR_CODES.NETWORK, 'DeepSeek: sem mensagens na chamada.');
    }

    // Resolve a chave sob demanda; sem chave configurada ⇒ erro explícito sem
    // chegar à rede (nunca envia Authorization vazio).
    let apiKey = '';
    if (deps.apiKey) {
      apiKey = (await deps.apiKey()).trim();
    }
    if (!apiKey) {
      throw new DeepSeekError(
        DEEPSEEK_ERROR_CODES.KEY_MISSING,
        'DeepSeek: chave de API não configurada.'
      );
    }

    const model = req.model ?? DEEPSEEK_MODEL.id; // SEMPRE o literal 'deepseek-v4-flash-0731'.
    const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (timeoutMs > 0) {
      timer = setTimeout(() => controller.abort(), timeoutMs);
    }

    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: req.messages,
          temperature: req.temperature ?? 0,
          ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (timer) clearTimeout(timer);
      // AbortController abort ⇒ timeout; qualquer outro erro de fetch ⇒ rede.
      const isAbort = error instanceof Error && error.name === 'AbortError';
      throw new DeepSeekError(
        DEEPSEEK_ERROR_CODES.NETWORK,
        isAbort
          ? `DeepSeek: timeout após ${timeoutMs}ms.`
          : `DeepSeek: falha de rede (${error instanceof Error ? error.message : 'desconhecida'}).`,
        error
      );
    } finally {
      if (timer) clearTimeout(timer);
    }

    if (response.status === 401 || response.status === 403) {
      throw new DeepSeekError(
        DEEPSEEK_ERROR_CODES.KEY_INVALID,
        'DeepSeek: chave de API inválida ou sem permissão (HTTP ' + response.status + ').'
      );
    }
    if (response.status === 429) {
      throw new DeepSeekError(
        DEEPSEEK_ERROR_CODES.RATE_LIMIT,
        'DeepSeek: rate limit / quota excedida (HTTP 429).'
      );
    }
    if (response.status >= 500) {
      let message = `DeepSeek: erro de servidor (HTTP ${response.status}).`;
      try {
        const parsed = extractErrorText(await response.json());
        if (parsed) message = `DeepSeek: ${parsed}`;
      } catch {
        // corpo ilegível — mantém a mensagem padrão.
      }
      throw new DeepSeekError(DEEPSEEK_ERROR_CODES.SERVER_ERROR, message);
    }

    // Sucesso: 200 (ou 2xx). Falha de leitura/parse é tratada como NETWORK.
    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      throw new DeepSeekError(
        DEEPSEEK_ERROR_CODES.NETWORK,
        'DeepSeek: resposta não-JSON do servidor.',
        error
      );
    }
    const content =
      (body as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message
        ?.content;
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new DeepSeekError(
        DEEPSEEK_ERROR_CODES.NETWORK,
        'DeepSeek: resposta sem choices[0].message.content.'
      );
    }

    const rawUsage = (body as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } })
      ?.usage;
    const usage =
      rawUsage &&
      typeof rawUsage.prompt_tokens === 'number' &&
      typeof rawUsage.completion_tokens === 'number'
        ? {
            promptTokens: rawUsage.prompt_tokens,
            completionTokens: rawUsage.completion_tokens,
          }
        : undefined;

    const responseModel = (body as { model?: unknown })?.model;

    return {
      content: content.trim(),
      model: typeof responseModel === 'string' ? responseModel : model,
      ...(usage ? { usage } : {}),
    };
  }

  return { chatCompletion };
}