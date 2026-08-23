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
  /** Qualquer outro 4xx (ex.: 400 invalid_request_error — modelo/param inválido). */
  BAD_REQUEST: 'DEEPSEEK_BAD_REQUEST',
  /** 5xx com corpo parseável (mensagem de error.message). */
  SERVER_ERROR: 'DEEPSEEK_SERVER_ERROR',
  /** fetch falhou / timeout / corpo ilegível. */
  NETWORK: 'DEEPSEEK_NETWORK',
  /** 2xx mas choices[0].message.content vazio (resposta sem conteúdo utilizável). */
  EMPTY_CONTENT: 'DEEPSEEK_EMPTY_CONTENT',
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

/**
 * Resultado do parse do `choices[0].message` de uma resposta 2xx.
 * `content` é a string não-vazia utilizável. Quando faltam content/choices,
 * `reasoningContent` indica se o modelo devolveu APENAS raciocínio (content
 * vazio + reasoning_content presente) — informação que o chamador usa para dar
 * um erro claro em vez de engolir em silêncio.
 */
export interface ChoiceParseResult {
  content?: string;
  reasoningContent?: string;
}

/**
 * Função PURA de extração de `choices[0].message.content` (testada sem rede).
 * - content não-vazio ⇒ devolve { content }.
 * - content vazio/ausente mas `reasoning_content` presente ⇒ devolve
 *   { reasoningContent } (sem fabricar um content falso — o reasoning é o
 *   raciocínio interno do modelo, NÃO conteúdo de aula).
 * - content e reasoning ausentes/choices vazio ⇒ devolve {}.
 */
export function parseChoiceResult(body: unknown): ChoiceParseResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {};
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return {};
  const first = choices[0];
  if (!first || typeof first !== 'object') return {};
  const message = (first as { message?: unknown }).message;
  if (!message || typeof message !== 'object') return {};

  const content = (message as { content?: unknown }).content;
  if (typeof content === 'string' && content.trim().length > 0) {
    return { content: content.trim() };
  }

  const reasoningContent = (message as { reasoning_content?: unknown }).reasoning_content;
  if (typeof reasoningContent === 'string' && reasoningContent.trim().length > 0) {
    return { reasoningContent };
  }

  return {};
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
    if (typeof err.message === 'string' && err.message.trim()) return err.message;
  }
  if (typeof obj.message === 'string' && obj.message.trim()) return obj.message;
  return undefined;
}

/**
 * Renderiza um fragmento SANITIZADO do corpo para mensagens de erro: vira JSON
 * compacto da chave/valor citada, com o valor truncado a `maxLen` e com qualquer
 * ocorrência da apiKey substituída por '***'. NUNCA expõe a chave nem dados
 * sensíveis. Devolve o campo alvo (`choices[0]`, `error.message`, etc.) ou o
 * corpo inteiro se `field` não existir.
 */
function renderSanitizedBodyFragment(payload: unknown, apiKey: string, field?: string): string {
  let target: unknown = payload;
  if (field) {
    let node: unknown = payload;
    for (const part of field.split('.')) {
      if (
        node &&
        typeof node === 'object' &&
        !Array.isArray(node) &&
        typeof (node as Record<string, unknown>)[part] !== 'undefined'
      ) {
        node = (node as Record<string, unknown>)[part];
        target = node;
      } else {
        target = undefined;
        break;
      }
    }
  }
  let text: string;
  try {
    text = JSON.stringify(target);
  } catch {
    text = String(target);
  }
  if (!text || text.length === 0) text = String(target);
  if (text.length > 160) text = text.slice(0, 160) + '…';
  if (apiKey) text = text.split(apiKey).join('***');
  return text;
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

    const model = req.model ?? DEEPSEEK_MODEL.id; // SEMPRE o literal 'deepseek-v4-flash'.
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
    // Demais 4xx (400 invalid_request_error, 404, 422, …). Antigamente cairiam
    // no caminho de "sucesso" e virariam o enganoso "sem choices[0].message.content".
    // Ex.: /chat/completions com modelo inválido responde HTTP 400 com
    // error.message citando os ids suportados. Trata AGORA, com mensagem clara
    // e fragmento sanitizado do corpo (nunca a chave).
    if (response.status >= 400 && response.status < 500) {
      let message = `DeepSeek: erro de requisição (HTTP ${response.status}).`;
      let fragment: string | undefined;
      try {
        const parsed: unknown = await response.json();
        const apiMessage = extractErrorText(parsed);
        if (apiMessage) {
          message = `DeepSeek: ${apiMessage} (HTTP ${response.status}).`;
          fragment = apiMessage;
        } else {
          message = `DeepSeek: requisição rejeitada (HTTP ${response.status}) com corpo não-parseável.`;
        }
      } catch {
        // corpo ilegível — mantém a mensagem padrão.
      }
      if (fragment) {
        message += ` Corpo do erro (sanitizado): ${renderSanitizedBodyFragment(
          { error: { message: fragment } },
          apiKey
        )}.`;
      }
      throw new DeepSeekError(DEEPSEEK_ERROR_CODES.BAD_REQUEST, message, { status: response.status });
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
    const parsedChoice = parseChoiceResult(body);
    if (!parsedChoice.content) {
      // content não-vazio é a única via de entrega utilizável. Se o modelo
      // devolveu apenas reasoning_content, o problema é do prompt/serviço (o
      // reasoning não é conteúdo de aula) — erro EXPLÍCITO, nunca silencioso.
      if (parsedChoice.reasoningContent) {
        throw new DeepSeekError(
          DEEPSEEK_ERROR_CODES.EMPTY_CONTENT,
          'DeepSeek: resposta com content vazio (o modelo devolveu apenas reasoning_content, sem conteúdo de aula).'
        );
      }
      throw new DeepSeekError(
        DEEPSEEK_ERROR_CODES.EMPTY_CONTENT,
        'DeepSeek: resposta sem choices[0].message.content não-vazio. ' +
          `Corpo (sanitizado): ${renderSanitizedBodyFragment(body, apiKey, 'choices')}.`
      );
    }
    const content = parsedChoice.content;

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