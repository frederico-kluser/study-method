/**
 * electron/main/services/llmClient.ts — cliente LEVE one-shot OpenAI-compatible
 * para o OpenRouter (POST {baseUrl}/chat/completions).
 *
 * ATENÇÃO AO ENUM DE ERRO: os VALORES de `LLM_ERROR_CODES`
 * (`'LLM_KEY_MISSING'`, `'LLM_KEY_INVALID'`, `'LLM_BAD_REQUEST'`, …) são
 * comparados como STRING CRUA fora do enum em `engine/phases/f1Research.ts` e
 * `engine/fiacao/geraTrilha.ts`. Mudar um valor aqui sem mudar lá compila e
 * quebra em SILÊNCIO.
 *
 * É o transporte do juiz LLM do protocolo REQUEST/APPLY (docs/00-contratos.md §6):
 * one-shot, sem streaming — o contrato do juiz é uma ÚNICA chamada que devolve o
 * corpo de `items[0]`. Por isso NÃO reutiliza o PiAgentService (agente coding
 * streamado é incompatível com o contrato one-shot).
 *
 * O fetch e a baseUrl são injetáveis para testes (nunca usa rede real fora do
 * runtime). NUNCA expõe a API key em mensagens de erro.
 *
 * RACIOCÍNIO NO MÁXIMO: toda chamada envia `reasoning: { enabled, effort }` com
 * effort `'max'` por padrão (o topo aceito por `z-ai/glm-5.3-flash`) e
 * `provider: { require_parameters: true }` — SEM esse `require_parameters` o
 * OpenRouter pode rotear para um provider que IGNORA `reasoning` e devolver 200
 * sem raciocínio nenhum, em silêncio.
 */

import {
  LLM_KEY_MASK_PATTERN,
  OPENROUTER_ATTRIBUTION_HEADERS,
  OPENROUTER_MAX_EFFORT,
  OPENROUTER_MODEL,
  OPENROUTER_PROVIDER_POLICY,
  OPENROUTER_REASONING,
  type OpenRouterEffort,
} from '@shared/llm/constants';

/** Códigos de erro tipados do cliente de LLM (surface mínima e estável). */
export const LLM_ERROR_CODES = {
  /** Nenhuma chave configurada (sem valor a enviar). */
  KEY_MISSING: 'LLM_KEY_MISSING',
  /** 401/403 — chave inválida ou sem permissão. */
  KEY_INVALID: 'LLM_KEY_INVALID',
  /** 429 — rate limit / quota. */
  RATE_LIMIT: 'LLM_RATE_LIMIT',
  /** Qualquer outro 4xx (ex.: 400 invalid_request_error — modelo/param inválido). */
  BAD_REQUEST: 'LLM_BAD_REQUEST',
  /** 5xx com corpo parseável (mensagem de error.message). */
  SERVER_ERROR: 'LLM_SERVER_ERROR',
  /** fetch falhou / timeout / corpo ilegível. */
  NETWORK: 'LLM_NETWORK',
  /** 2xx mas choices[0].message.content vazio (resposta sem conteúdo utilizável). */
  EMPTY_CONTENT: 'LLM_EMPTY_CONTENT',
} as const;

export type LlmErrorCode = (typeof LLM_ERROR_CODES)[keyof typeof LLM_ERROR_CODES];

/**
 * Erro tipado do cliente. `code` é a superfície estável consumida pelo juiz.
 *
 * `retryAfterMs` (onda 1) carrega o header `Retry-After` da resposta quando o
 * servidor o mandou (429 e 5xx). Antes o cliente lia o corpo e DESCARTAVA a
 * Response, então `runtime/backoff.ts` só conseguia fazer backoff cego — agora o
 * atraso sugerido pelo servidor chega a jusante. Nenhum SDK honra `Retry-After`
 * sozinho; por isso o cliente lê o header à mão.
 */
export class LlmError extends Error {
  readonly code: LlmErrorCode;
  readonly cause?: unknown;
  /** Atraso sugerido pelo servidor em MILISSEGUNDOS (header `Retry-After`). */
  readonly retryAfterMs?: number;

  constructor(code: LlmErrorCode, message: string, cause?: unknown, retryAfterMs?: number) {
    super(message);
    this.name = 'LlmError';
    this.code = code;
    this.cause = cause;
    if (typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs) && retryAfterMs >= 0) {
      this.retryAfterMs = retryAfterMs;
    }
  }
}

export interface LlmChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmChatRequest {
  messages: LlmChatMessage[];
  /** coincidência criativa — o juiz usa 0 (determinístico). */
  temperature?: number;
  maxTokens?: number;
  /** sobrescreve o model default (não use fora de teste). */
  model?: string;
  /** timeoutMs injetável — default 60_000. */
  timeoutMs?: number;
  /**
   * Nível de raciocínio desta chamada. Default `OPENROUTER_MAX_EFFORT` ('max').
   * É o botão para pedir MENOS raciocínio numa chamada barata — ninguém pede
   * mais que 'max' porque 'max' já é o topo aceito por este modelo.
   */
  reasoningEffort?: OpenRouterEffort;
}

export interface LlmChatResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    /**
     * Tokens de raciocínio — vêm de `usage.completion_tokens_details.reasoning_tokens`
     * (ANINHADO; não existe `reasoning_tokens` no topo de `usage`). São cobrados
     * como token de saída.
     */
    reasoningTokens?: number;
    /** Custo da requisição em USD (`usage.cost`), quando o gateway o devolve. */
    costUsd?: number;
  };
}

export interface LlmClientDeps {
  /** fetch injetável (testes). Default: fetch global. */
  fetchImpl?: typeof fetch;
  /** base da API. Default: OPENROUTER_MODEL.baseUrl (contrato congelado). */
  baseUrl?: string;
  /** Resolve a API key sob demanda. Ausente ⇒ erro KEY_MISSING quando chamado. */
  apiKey?: () => Promise<string>;
}

export interface LlmClient {
  chatCompletion(req: LlmChatRequest): Promise<LlmChatResponse>;
}

/**
 * Resultado do parse do `choices[0].message` de uma resposta 2xx.
 * `content` é a string não-vazia utilizável. Quando faltam content/choices,
 * `reasoningContent` indica se o modelo devolveu APENAS raciocínio (content
 * vazio + raciocínio presente) — informação que o chamador usa para dar um erro
 * claro em vez de engolir em silêncio.
 */
export interface ChoiceParseResult {
  content?: string;
  reasoningContent?: string;
}

/**
 * Extrai texto legível de `message.reasoning_details` (formato OpenRouter):
 * lista de blocos `reasoning.text` / `reasoning.summary` / `reasoning.encrypted`.
 * Blocos encriptados não têm texto útil e são simplesmente ignorados.
 */
function extractReasoningDetailsText(details: unknown): string | undefined {
  if (!Array.isArray(details)) return undefined;
  const parts: string[] = [];
  for (const entry of details) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    for (const key of ['text', 'summary', 'data'] as const) {
      const value = record[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        parts.push(value.trim());
        break;
      }
    }
  }
  const joined = parts.join('\n').trim();
  return joined.length > 0 ? joined : undefined;
}

/**
 * Função PURA de extração de `choices[0].message.content` (testada sem rede).
 * - content não-vazio ⇒ devolve { content }.
 * - content vazio/ausente mas raciocínio presente ⇒ devolve { reasoningContent }
 *   (sem fabricar um content falso — o reasoning é o raciocínio interno do
 *   modelo, NÃO conteúdo de aula).
 * - content e reasoning ausentes/choices vazio ⇒ devolve {}.
 *
 * TRÊS formas de raciocínio são aceitas: `reasoning` (string) e
 * `reasoning_details` (lista) do OpenRouter, e `reasoning_content` (o campo do
 * provedor anterior) — o legado continua reconhecido de graça.
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

  const reasoning = (message as { reasoning?: unknown }).reasoning;
  if (typeof reasoning === 'string' && reasoning.trim().length > 0) {
    return { reasoningContent: reasoning };
  }

  const reasoningContent = (message as { reasoning_content?: unknown }).reasoning_content;
  if (typeof reasoningContent === 'string' && reasoningContent.trim().length > 0) {
    return { reasoningContent };
  }

  const detailsText = extractReasoningDetailsText(
    (message as { reasoning_details?: unknown }).reasoning_details
  );
  if (detailsText) return { reasoningContent: detailsText };

  return {};
}

/**
 * Base default do transporte — vem do CONTRATO (`OPENROUTER_MODEL.baseUrl`),
 * nunca de um literal local.
 */
const LLM_DEFAULT_BASE: string = OPENROUTER_MODEL.baseUrl;
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
 * Lê um header da Response tolerando fakes de teste sem `headers` (e qualquer
 * implementação que exploda ao ler). Nunca lança.
 */
function readHeader(response: Response, name: string): string | undefined {
  const headers = (response as { headers?: { get?: (n: string) => string | null } }).headers;
  if (!headers || typeof headers.get !== 'function') return undefined;
  try {
    const value = headers.get(name);
    return typeof value === 'string' ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Converte o header `Retry-After` em MILISSEGUNDOS. Aceita as DUAS formas do
 * RFC 7231: delta em segundos (`"12"`) e data HTTP (`"Wed, 21 Oct 2026 07:28:00 GMT"`).
 * Valor inválido/ausente ⇒ `undefined` (o backoff cai no exponencial dele).
 * Data no passado ⇒ 0 (pode tentar já), nunca negativo.
 */
export function parseRetryAfterMs(
  value: string | null | undefined,
  nowMs: number = Date.now()
): number | undefined {
  if (typeof value !== 'string') return undefined;
  const raw = value.trim();
  if (!raw) return undefined;

  // Forma 1 — delta-seconds (o RFC manda inteiro; decimal é tolerado).
  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const seconds = Number(raw);
    if (!Number.isFinite(seconds) || seconds < 0) return undefined;
    return Math.round(seconds * 1000);
  }

  // Forma 2 — HTTP-date.
  const at = Date.parse(raw);
  if (Number.isNaN(at)) return undefined;
  const delta = at - nowMs;
  return delta > 0 ? Math.round(delta) : 0;
}

/** Escapa meta-caracteres de regex (para compor RegExp a partir da apiKey). */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Mascara segredos em QUALQUER texto que vá para uma mensagem de erro/log:
 * a chave exata (substituição literal), o par `Bearer <chave>` e, sobretudo,
 * qualquer padrão `sk-...` via `LLM_KEY_MASK_PATTERN` do contrato — a classe
 * inclui `-`/`_`, então uma chave `sk-or-v1-<...>` do OpenRouter é mascarada
 * POR INTEIRO (a regex antiga parava no primeiro hífen e vazava o resto).
 *
 * É usada TAMBÉM na mensagem crua do gateway: um 400 pode ecoar o header
 * `Authorization` no `error.message`, e antes esse texto ia para a mensagem do
 * erro sem passar por máscara nenhuma.
 *
 * `String.replace` com regex global zera o `lastIndex`, então compartilhar o
 * padrão do contrato entre chamadas não guarda estado.
 */
function maskSecrets(text: string, apiKey: string): string {
  let out = text;
  if (apiKey) {
    out = out.split(apiKey).join('***');
    // `Bearer <chave>` (ex.: header Authorization refletido no corpo) → `Bearer ***`.
    out = out.replace(new RegExp(`(Bearer\\s+)${escapeRegExp(apiKey)}`, 'gi'), 'Bearer ***');
  }
  return out.replace(LLM_KEY_MASK_PATTERN, '***');
}

/**
 * Renderiza um fragmento SANITIZADO do corpo para mensagens de erro: vira JSON
 * compacto da chave/valor citada, com o valor truncado a `maxLen` e com qualquer
 * ocorrência da apiKey substituída por '***'. NUNCA expõe a chave nem dados
 * sensíveis. Devolve o campo alvo (`choices[0]`, `error.message`, etc.) ou o
 * corpo inteiro se `field` não existir.
 *
 * ORDEM corrigida (fix15c-review): MÁSCARA PRIMEIRO, TRUNCAMENTO DEPOIS — antes
 * a chave era truncada a 160 chars e podia ser cortada ao meio, vazando metade
 * dela. Além da substituição literal (split exato), também mascara padrões de
 * chave parcial/truncada via `LLM_KEY_MASK_PATTERN` e o par `Bearer <chave>`.
 *
 * SEGURANÇA (onda 1): o padrão VEIO PARA O CONTRATO e passou a incluir `-`/`_`.
 * A versão antiga era `/(sk-[A-Za-z0-9]{6,})/gi`, que NÃO cobre uma chave do
 * OpenRouter: `sk-or-v1-<...>` tem HÍFENS, a classe parava no primeiro deles e
 * só `sk-or` virava `***` — o resto da chave vazava para o log.
 */
export function renderSanitizedBodyFragment(payload: unknown, apiKey: string, field?: string): string {
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

  // 1) MÁSCARA: a chave exata e padrões de chave parcial somem ANTES de cortar.
  text = maskSecrets(text, apiKey);

  // 2) TRUNCA por último — nunca pode cortar uma chave ao meio.
  if (text.length > 160) text = text.slice(0, 160) + '…';
  return text;
}

/** Cria o cliente one-shot (OpenRouter) com transporte injetável. */
export function createLlmClient(deps: LlmClientDeps = {}): LlmClient {
  const baseUrl = (deps.baseUrl ?? LLM_DEFAULT_BASE).replace(/\/+$/, '');
  const fetchImpl = deps.fetchImpl ?? fetch;

  async function chatCompletion(req: LlmChatRequest): Promise<LlmChatResponse> {
    if (!req.messages || req.messages.length === 0) {
      throw new LlmError(LLM_ERROR_CODES.NETWORK, 'OpenRouter: sem mensagens na chamada.');
    }

    // Resolve a chave sob demanda; sem chave configurada ⇒ erro explícito sem
    // chegar à rede (nunca envia Authorization vazio).
    let apiKey = '';
    if (deps.apiKey) {
      apiKey = (await deps.apiKey()).trim();
    }
    if (!apiKey) {
      throw new LlmError(
        LLM_ERROR_CODES.KEY_MISSING,
        'OpenRouter: chave de API não configurada.'
      );
    }

    const model = req.model ?? OPENROUTER_MODEL.id; // SEMPRE o literal 'z-ai/glm-5.3-flash'.
    const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    // 'max' é o topo aceito por este modelo ('xhigh' seria rejeitado, 'high' é um
    // degrau abaixo). O campo só existe para pedir MENOS numa chamada barata.
    const reasoningEffort: OpenRouterEffort = req.reasoningEffort ?? OPENROUTER_MAX_EFFORT;

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
          // Attribution do OpenRouter: `HTTP-Referer` + `X-Title`
          // (`X-OpenRouter-App` NÃO existe).
          ...OPENROUTER_ATTRIBUTION_HEADERS,
        },
        body: JSON.stringify({
          model,
          messages: req.messages,
          temperature: req.temperature ?? 0,
          ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
          // Raciocínio SEMPRE ligado, no máximo por padrão.
          reasoning: { ...OPENROUTER_REASONING, effort: reasoningEffort },
          // LOAD-BEARING: `require_parameters: true` impede o roteamento para um
          // provider que ignoraria `reasoning` e responderia 200 sem pensar.
          provider: OPENROUTER_PROVIDER_POLICY,
          // Pede os contadores de custo/raciocínio no `usage` da resposta.
          usage: { include: true },
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (timer) clearTimeout(timer);
      // AbortController abort ⇒ timeout; qualquer outro erro de fetch ⇒ rede.
      const isAbort = error instanceof Error && error.name === 'AbortError';
      throw new LlmError(
        LLM_ERROR_CODES.NETWORK,
        isAbort
          ? `OpenRouter: timeout após ${timeoutMs}ms.`
          : `OpenRouter: falha de rede (${error instanceof Error ? error.message : 'desconhecida'}).`,
        error
      );
    } finally {
      if (timer) clearTimeout(timer);
    }

    if (response.status === 401 || response.status === 403) {
      throw new LlmError(
        LLM_ERROR_CODES.KEY_INVALID,
        'OpenRouter: chave de API inválida ou sem permissão (HTTP ' + response.status + ').'
      );
    }
    if (response.status === 429) {
      // `Retry-After` só existe aqui: a Response morre no fim desta função, então
      // o valor sobe no ERRO para o `runtime/backoff.ts` poder honrá-lo.
      const retryAfterMs = parseRetryAfterMs(readHeader(response, 'Retry-After'));
      let message = 'OpenRouter: rate limit / quota excedida (HTTP 429).';
      if (retryAfterMs !== undefined) message += ` Retry-After: ${retryAfterMs}ms.`;
      throw new LlmError(
        LLM_ERROR_CODES.RATE_LIMIT,
        message,
        { status: response.status },
        retryAfterMs
      );
    }
    // Demais 4xx (400 invalid_request_error, 404, 422, …). Antigamente cairiam
    // no caminho de "sucesso" e virariam o enganoso "sem choices[0].message.content".
    // Ex.: /chat/completions com modelo inválido responde HTTP 400 com
    // error.message citando os ids suportados. Trata AGORA, com mensagem clara
    // e fragmento sanitizado do corpo (nunca a chave).
    if (response.status >= 400 && response.status < 500) {
      let message = `OpenRouter: erro de requisição (HTTP ${response.status}).`;
      let fragment: string | undefined;
      try {
        const parsed: unknown = await response.json();
        const apiMessage = extractErrorText(parsed);
        if (apiMessage) {
          // A mensagem do gateway é texto de TERCEIRO: pode ecoar o header
          // Authorization. Mascara ANTES de entrar na mensagem do erro.
          message = `OpenRouter: ${maskSecrets(apiMessage, apiKey)} (HTTP ${response.status}).`;
          fragment = apiMessage;
        } else {
          message = `OpenRouter: requisição rejeitada (HTTP ${response.status}) com corpo não-parseável.`;
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
      throw new LlmError(LLM_ERROR_CODES.BAD_REQUEST, message, { status: response.status });
    }
    if (response.status >= 500) {
      // 503 ("no available provider") também pode trazer `Retry-After`.
      const retryAfterMs = parseRetryAfterMs(readHeader(response, 'Retry-After'));
      let message = `OpenRouter: erro de servidor (HTTP ${response.status}).`;
      try {
        const parsed = extractErrorText(await response.json());
        if (parsed) message = `OpenRouter: ${maskSecrets(parsed, apiKey)}`;
      } catch {
        // corpo ilegível — mantém a mensagem padrão.
      }
      throw new LlmError(
        LLM_ERROR_CODES.SERVER_ERROR,
        message,
        { status: response.status },
        retryAfterMs
      );
    }

    // Sucesso: 200 (ou 2xx). Falha de leitura/parse é tratada como NETWORK.
    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      throw new LlmError(
        LLM_ERROR_CODES.NETWORK,
        'OpenRouter: resposta não-JSON do servidor.',
        error
      );
    }
    const parsedChoice = parseChoiceResult(body);
    if (!parsedChoice.content) {
      // content não-vazio é a única via de entrega utilizável. Se o modelo
      // devolveu apenas raciocínio, o problema é do prompt/serviço (o reasoning
      // não é conteúdo de aula) — erro EXPLÍCITO, nunca silencioso.
      if (parsedChoice.reasoningContent) {
        throw new LlmError(
          LLM_ERROR_CODES.EMPTY_CONTENT,
          'OpenRouter: resposta com content vazio (o modelo devolveu apenas raciocínio — ' +
            'reasoning/reasoning_details/reasoning_content —, sem conteúdo de aula).'
        );
      }
      throw new LlmError(
        LLM_ERROR_CODES.EMPTY_CONTENT,
        'OpenRouter: resposta sem choices[0].message.content não-vazio. ' +
          `Corpo (sanitizado): ${renderSanitizedBodyFragment(body, apiKey, 'choices')}.`
      );
    }
    const content = parsedChoice.content;

    const rawUsage = (
      body as {
        usage?: {
          prompt_tokens?: unknown;
          completion_tokens?: unknown;
          completion_tokens_details?: { reasoning_tokens?: unknown };
          cost?: unknown;
        };
      }
    )?.usage;
    let usage: LlmChatResponse['usage'];
    if (
      rawUsage &&
      typeof rawUsage.prompt_tokens === 'number' &&
      typeof rawUsage.completion_tokens === 'number'
    ) {
      // `reasoning_tokens` é ANINHADO em `completion_tokens_details` — não existe
      // no topo de `usage`.
      const details = rawUsage.completion_tokens_details;
      const reasoningTokens =
        details && typeof details === 'object' && typeof details.reasoning_tokens === 'number'
          ? details.reasoning_tokens
          : undefined;
      const costUsd = typeof rawUsage.cost === 'number' ? rawUsage.cost : undefined;
      usage = {
        promptTokens: rawUsage.prompt_tokens,
        completionTokens: rawUsage.completion_tokens,
        ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
        ...(costUsd !== undefined ? { costUsd } : {}),
      };
    }

    const responseModel = (body as { model?: unknown })?.model;

    return {
      content: content.trim(),
      model: typeof responseModel === 'string' ? responseModel : model,
      ...(usage ? { usage } : {}),
    };
  }

  return { chatCompletion };
}
