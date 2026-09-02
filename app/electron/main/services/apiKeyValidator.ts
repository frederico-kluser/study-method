/**
 * electron/main/services/apiKeyValidator.ts — validação de chaves de API no
 * MAIN PROCESS (anti-CORS): OpenRouter (LLM) e Brave (busca).
 *
 * Roda no main para evitar CORS do renderer.
 *
 * ─── A REGRA DE OURO DESTA MIGRAÇÃO ──────────────────────────────────────────
 * A validação da chave do LLM bate em `GET {baseUrl}/key` — NUNCA em
 * `GET {baseUrl}/models`. No OpenRouter `/api/v1/models` é um endpoint PÚBLICO:
 * responde 200 com o catálogo inteiro MESMO COM UMA CHAVE MORTA (ou sem chave
 * nenhuma). Validar por `/models` faria QUALQUER string passar como válida —
 * um bug de segurança, não um detalhe de implementação. Verificado na API real
 * em 2026-09-01: com uma chave revogada, `/api/v1/models` → 200 (catálogo) e
 * `/api/v1/key` → 401 `{"error":{"message":"User not found.","code":401}}`.
 * A FONTE DE VERDADE da validade é, e continua sendo, `GET /key`.
 *
 * Semântica de status do validador do LLM (preservada da versão DeepSeek):
 * - 200      → chave VÁLIDA;
 * - 401/403  → chave INVÁLIDA ("Invalid API key");
 * - 402/429  → chave VÁLIDA (402 no OpenRouter é EXATAMENTE crédito
 *              insuficiente; 429 é rate limit — nenhum dos dois é chave ruim);
 * - outro    → inválida, com a mensagem do corpo ou `HTTP n: statusText`;
 * - erro de rede/timeout → inválida com `Network error: …` (o classificador
 *              `isNetworkError` do startup-handlers reconhece o prefixo).
 *
 * `modelAvailable` é COMPLEMENTAR: vem de uma consulta separada a
 * `GET {baseUrl}/models?q=…` procurando o id EXATO de OPENROUTER_MODEL.id.
 * Essa consulta NUNCA decide validade — se falhar (rede, status ≠ 200, corpo
 * ilegível, orçamento de tempo esgotado), `modelAvailable` fica `undefined` e a
 * validação da chave segue de pé.
 *
 * NOMES LEGADOS (de propósito): `validateDeepseekKey`,
 * `DeepSeekValidationResult` e `DeepSeekValidateOptions` mantêm o nome antigo
 * porque o canal IPC (`keys:validate-deepseek`) e os campos do `KeysStatus`
 * ainda são os antigos — renomear tudo é a ONDA 2, que muda contrato + preload
 * + renderer juntos. Aqui só o COMPORTAMENTO migrou. O campo `provider` do
 * resultado, esse sim, já reporta `'openrouter'` (a union do contrato aceita).
 *
 * RODADA 10 (onda 2b — sem spinner infinito): cada validação roda sob um
 * AbortSignal de timeout (`timeoutMs`, default 8s; `0` desliga). O timeout
 * cobre o pipeline COMPLETO — fetch E leitura do corpo (`response.json()`):
 * rede que ENGOLE pacotes antes dos headers OU depois deles (body-stall —
 * headers chegam, corpo nunca chega) NUNCA segura a validação. O resultado é
 * um erro de REDE identificável — "Network error: timed out after Nms" — que
 * o classificador do startup-handlers (isNetworkError) reconhece por
 * /^Network error:/i e /timed out/i. As DUAS chamadas do OpenRouter (`/key` e
 * o probe de `/models`) dividem UM ÚNICO orçamento `timeoutMs`: o probe só
 * roda com o tempo que sobrou, para a validação inteira nunca passar do prazo
 * que o startup-handlers concede.
 *
 * A base_url, o fetch e o timeout são injetáveis via `opts` para testes —
 * nunca usa rede real fora do runtime.
 */

import type { ValidationResult } from '@shared/ipc-contract';
import { OPENROUTER_ATTRIBUTION_HEADERS, OPENROUTER_MODEL } from '@shared/llm/constants';

/**
 * Resultado da validação do LLM (OpenRouter): estende ValidationResult com
 * `modelAvailable` — este campo é propriedade EXCLUSIVA deste validador (não
 * faz parte do contrato congelado), adicionado por uma interface local.
 *
 * O NOME do tipo é legado (ver cabeçalho): a renomeação para
 * `OpenRouterValidationResult` é a ONDA 2.
 */
export interface DeepSeekValidationResult extends ValidationResult {
  provider: 'openrouter';
  /**
   * true quando o catálogo do OpenRouter listou o id EXATO de
   * OPENROUTER_MODEL.id; false quando a lista veio e NÃO o continha;
   * `undefined` quando não deu para saber (probe falhou/ficou sem tempo).
   * NUNCA decide `isValid`.
   */
  modelAvailable?: boolean;
}

export interface BraveValidationResult extends ValidationResult {
  provider: 'brave';
}

export interface DeepSeekValidateOptions {
  /** fetch injetável (testes). Default: fetch global. */
  fetchImpl?: typeof fetch;
  /** base_url da API do OpenRouter. Default: OPENROUTER_MODEL.baseUrl. */
  baseUrl?: string;
  /**
   * Timeout da validação em ms via AbortSignal (default
   * DEFAULT_VALIDATE_TIMEOUT_MS = 8000). Cobre o pipeline COMPLETO: fetch e
   * leitura do corpo (`response.json()`) — body-stall também é cortado — e é
   * o orçamento TOTAL das duas chamadas (`/key` + probe de `/models`). `0`
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

/**
 * Provider reportado no campo `provider` do resultado do LLM. A union do
 * contrato já aceita `'openrouter'` ao lado do legado `'deepseek'`.
 */
const LLM_PROVIDER = 'openrouter' as const;

/**
 * Caminho AUTENTICADO que decide a validade da chave. É o único endpoint do
 * OpenRouter que responde 401 para chave morta (ver cabeçalho).
 */
const OPENROUTER_KEY_PATH = '/key';

/** Caminho PÚBLICO do catálogo — só preenche `modelAvailable`, nunca valida. */
const OPENROUTER_MODELS_PATH = '/models';

const BRAVE_DEFAULT_BASE = 'https://api.search.brave.com';

/**
 * Termo de busca do probe de catálogo, derivado do id do modelo alvo: pega o
 * slug (depois de `author/`) e corta no primeiro caractere não-alfanumérico —
 * `z-ai/glm-5.3-flash` → `glm`. Um termo CURTO e estável evita que a busca
 * fuzzy do OpenRouter erre por causa da versão pontuada; o match final é pelo
 * id EXATO, então um termo abrangente não afrouxa nada.
 */
export function modelSearchQuery(modelId: string): string {
  const slug = modelId.includes('/') ? modelId.slice(modelId.indexOf('/') + 1) : modelId;
  const head = /^[a-z0-9]+/i.exec(slug)?.[0];
  return head && head.length > 0 ? head : slug;
}

/** Headers de toda chamada ao OpenRouter: Bearer + attribution do contrato. */
function openRouterHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    ...OPENROUTER_ATTRIBUTION_HEADERS,
  };
}

/** Extrai a mensagem de texto de um corpo de erro OpenRouter/Brave. */
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
 * Consulta COMPLEMENTAR do catálogo: `GET {baseUrl}/models?q=<termo>` e procura
 * o id EXATO de OPENROUTER_MODEL.id.
 *
 * NUNCA lança e NUNCA decide validade — devolve:
 *   - `true`  → o id exato está na lista;
 *   - `false` → veio uma lista (`data` array) e o id NÃO está nela;
 *   - `undefined` → não deu para saber (status ≠ 200, corpo sem `data` array,
 *     JSON ilegível, rede caiu ou o orçamento de tempo estourou).
 */
async function probeModelAvailable(
  baseUrl: string,
  apiKey: string,
  fetchImpl: typeof fetch,
  timeoutMs: number
): Promise<boolean | undefined> {
  const q = encodeURIComponent(modelSearchQuery(OPENROUTER_MODEL.id));
  try {
    return await withFetchTimeout(async (signal): Promise<boolean | undefined> => {
      const response = await fetchImpl(`${baseUrl}${OPENROUTER_MODELS_PATH}?q=${q}`, {
        method: 'GET',
        headers: openRouterHeaders(apiKey),
        signal,
      });
      if (response.status !== 200) return undefined;
      const body = (await response.json()) as { data?: Array<{ id?: unknown }> };
      if (!Array.isArray(body?.data)) return undefined; // shape inesperado ⇒ desconhecido
      const ids = body.data
        .map((m) => (typeof m?.id === 'string' ? m.id : undefined))
        .filter((id): id is string => typeof id === 'string');
      return ids.includes(OPENROUTER_MODEL.id);
    }, timeoutMs);
  } catch {
    // Rede/abort/JSON quebrado: o probe é complementar — engole e reporta
    // "não sei". A validade da chave já foi decidida por /key.
    return undefined;
  }
}

/**
 * Valida a chave do LLM contra `GET {baseUrl}/key` (OpenRouter).
 *
 * ATENÇÃO: NÃO troque este endpoint por `/models` — `/models` é público e
 * responde 200 para chave morta (ver cabeçalho do arquivo). Só `/key` é
 * autenticado e por isso é a única fonte de verdade da validade.
 *
 * Nome legado preservado de propósito (o canal IPC ainda é
 * `keys:validate-deepseek`; a renomeação é a ONDA 2).
 */
export async function validateDeepseekKey(
  apiKey: string,
  opts: DeepSeekValidateOptions = {}
): Promise<DeepSeekValidationResult> {
  const baseUrl = (opts.baseUrl ?? OPENROUTER_MODEL.baseUrl).replace(/\/+$/, '');
  const timeoutMs = opts.timeoutMs ?? DEFAULT_VALIDATE_TIMEOUT_MS;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const checkedAt = new Date().toISOString();
  const key = (apiKey ?? '').trim();

  if (key === '') {
    return {
      isValid: false,
      provider: LLM_PROVIDER,
      errorMessage: 'API key is empty',
      checkedAt,
    };
  }

  // O pipeline INTEIRO (fetch + leitura do corpo) roda sob o timeout: rede que
  // engole pacotes DEPOIS dos headers (body-stall em response.json()) também
  // é cortada — a rejeição vira "Network error: timed out after Nms".
  const startedAt = Date.now();
  /**
   * Status HTTP com que `/key` respondeu — só o 200 justifica gastar a segunda
   * chamada no catálogo (402/429 já dizem "válida, indisponível agora").
   */
  let keyStatus = 0;
  let keyResult: DeepSeekValidationResult;
  try {
    keyResult = await withFetchTimeout(async (signal): Promise<DeepSeekValidationResult> => {
      const response = await fetchImpl(`${baseUrl}${OPENROUTER_KEY_PATH}`, {
        method: 'GET',
        headers: openRouterHeaders(key),
        signal,
      });
      keyStatus = response.status;

      if (response.status === 200) {
        // Chave VÁLIDA. Drena o corpo (`{ data: { label, usage, limit, … } }`)
        // para liberar o socket do keep-alive; o conteúdo não é usado e um
        // parse quebrado NÃO invalida a chave — mas um corpo que nunca chega
        // (body-stall) continua coberto pelo timeout do wrapper.
        try {
          await response.json();
        } catch {
          /* corpo não-JSON: irrelevante para a validade */
        }
        return { isValid: true, provider: LLM_PROVIDER, checkedAt };
      }

      if (response.status === 401 || response.status === 403) {
        return {
          isValid: false,
          provider: LLM_PROVIDER,
          errorMessage: 'Invalid API key',
          checkedAt,
        };
      }

      if (response.status === 402 || response.status === 429) {
        // 402 no OpenRouter = crédito insuficiente; 429 = rate limit. A chave é
        // válida, só está indisponível agora — não derruba o gate de início.
        return { isValid: true, provider: LLM_PROVIDER, checkedAt };
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
      return { isValid: false, provider: LLM_PROVIDER, errorMessage, checkedAt };
    }, timeoutMs);
  } catch (error) {
    const errorMessage = describeFetchError(error, timeoutMs);
    return {
      isValid: false,
      provider: LLM_PROVIDER,
      errorMessage: `Network error: ${errorMessage}`,
      checkedAt,
    };
  }

  // Chave inválida, ou 402/429 (crédito/rate limit — o catálogo nada acrescenta
  // e a conta já está no limite): devolve sem gastar mais rede.
  if (!keyResult.isValid || keyStatus !== 200) return keyResult;

  // Probe COMPLEMENTAR do catálogo com o que SOBROU do orçamento de tempo —
  // assim a validação inteira nunca passa de `timeoutMs` (é o mesmo prazo que
  // o startup-handlers concede à chamada toda).
  const remaining = timeoutMs > 0 ? timeoutMs - (Date.now() - startedAt) : 0;
  if (timeoutMs > 0 && remaining <= 0) return keyResult; // sem tempo: modelAvailable fica indefinido

  const modelAvailable = await probeModelAvailable(baseUrl, key, fetchImpl, remaining);
  if (modelAvailable === undefined) return keyResult;
  if (modelAvailable === false) {
    return {
      isValid: true,
      provider: LLM_PROVIDER,
      modelAvailable: false,
      errorMessage: `Key válida, mas o modelo alvo (${OPENROUTER_MODEL.id}) não consta no catálogo do OpenRouter.`,
      checkedAt,
    };
  }
  return { isValid: true, provider: LLM_PROVIDER, modelAvailable: true, checkedAt };
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

  // Mesmo contrato do validador do LLM: o pipeline inteiro (fetch + corpo)
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
