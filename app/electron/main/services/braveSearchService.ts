/**
 * electron/main/services/braveSearchService.ts — cliente do Brave Search API no
 * PROCESSO PRINCIPAL (anti-CORS). Estilo surf-research-agent-skill, porém com
 * busca REAL via Brave Search API e injeção de `fetch` para testes sem rede.
 *
 * Responsabilidades:
 *  - resolver a chave (deps.resolveApiKey → settingsStore.getApiKey('brave') →
 *    fallback env BRAVE_API_KEY);
 *  - GET {baseUrl}/res/v1/web/search com X-Subscription-Token + Accept: json;
 *  - normalizar `web.results[]` para StudyFinding (contrato de shared/ipc-contract);
 *  - mapear erros: chave ausente, 401/403 (chave inválida), 429 (rate limit),
 *    rede/5xx (mensagem parseada do corpo quando possível);
 *  - multiSearch com limite de concorrência, delay entre lotes e dedup por url.
 *
 * NUNCA toca o runtime do Electron quando `fetchImpl` é injetado — as funções
 * puras de normalização vivem aqui em cima (exportadas) e o serviço vira
 * apenas o "this deve chamar a rede, resolver chave e juntar resultados".
 */

import type { StudyFinding } from '@shared/ipc-contract';

/** Base URL padrão da Brave Search API. Endpoint: /res/v1/web/search. */
export const BRAVE_DEFAULT_BASE = 'https://api.search.brave.com';

/** Um resultado normalizado do Brave: contrato StudyFinding + extras opcionais. */
export interface BraveResult extends StudyFinding {
  /** Idade do documento (ex.: '2 years ago'), quando a API retorna. */
  age?: string | null;
  /** Registro de perfil/autor parcial, quando a API retorna. */
  profile?: {
    name?: string;
    long_name?: string | null;
    img?: string | null;
  } | null;
  /** Fonte fixa para todos os resultados deste serviço. */
  source: 'brave';
}

export interface BraveSearchDeps {
  /** fetch injetável (testes). Default: fetch global. */
  fetchImpl?: typeof fetch;
  /**
   * Provedor da chave Brave. Default: lê settingsStore.getApiKey('brave') com
   * fallback para process.env.BRAVE_API_KEY.
   */
  resolveApiKey?: () => Promise<string>;
  /** base_url da Brave Search API. Default: https://api.search.brave.com */
  baseUrl?: string;
}

export interface SearchOptions {
  /** Número de resultados pedidos à API. Default: 10. */
  count?: number;
  /** Params extras de query (ex.: { freshness: 'year', country: 'br' }). */
  extraParams?: Record<string, string | number | boolean>;
  /** Retry com backoff simples ao receber 429 (ms a esperar antes de uma tentativa). Default: undefined (sem espera). */
  delayMsOnRateLimit?: number;
}

export interface MultiSearchOptions {
  /** Máximo de buscas simultâneas. Default: 2. */
  concurrency?: number;
  /** Atraso (ms) entre lotes de `concurrency` buscas. Default: 250. */
  delayMs?: number;
  count?: number;
  extraParams?: SearchOptions['extraParams'];
  delayMsOnRateLimit?: number;
  /** ADITIVO (onda2-research-live): chamado quando UM worker começa uma query. */
  onQueryStart?: (query: string) => void;
  /**
   * ADITIVO (onda2-research-live): chamado quando UM worker termina UMA query
   * (sucesso OU erro), com métricas por query. `credits` fica undefined —
   * a Brave Search API não expõe saldo (ver ResearchProgressEvent.credits).
   */
  onQueryDone?: (info: QueryDoneInfo) => void;
}

/** Resultado de UMA query da multiSearch (callback onQueryDone). */
export interface QueryDoneInfo {
  query: string;
  ok: boolean;
  provider: 'brave';
  /** nº de resultados (hits) devolvidos pela API para esta query (sucesso). */
  hits?: number;
  latencyMs?: number;
  /** Créditos restantes — undefined no provider 'brave' (a API não expõe). */
  credits?: number;
  /** Erro mapeado pelos códigos existentes (BRAVE_KEY_MISSING/INVALID/RATE_LIMIT/SERVER_ERROR). */
  error?: { code?: string; message?: string };
}

export interface MultiSearchResult {
  /** Resultados deduplicados por url (a primeira ocorrência vence). */
  results: StudyFinding[];
  /** Erros por query — uma query falha não derruba as demais. */
  errors: Array<{ query: string; error: string; code?: string }>;
}

/**
 * Resolve a chave Brave pelo caminho PADRÃO do serviço: settingsStore
 * (getApiKey('brave')) com fallback em process.env.BRAVE_API_KEY. Devolve ''
 * quando indisponível — NUNCA lança (quem precisa do erro tipado usa o serviço).
 * Exportado para o researchPlanner checar a chave ANTES de rodar queries
 * (regra "Brave SEMPRE obrigatória") pelo MESMO caminho do serviço.
 */
export async function resolveBraveApiKey(): Promise<string> {
  try {
    // Import lazy do settingsStore para não tocar em 'electron' em testes.
    const { getSettingsStore } = await import('./settingsStore');
    const stored = await (await getSettingsStore()).getApiKey('brave');
    if (stored) return stored;
  } catch {
    // settingsStore indisponível (ex.: fora do runtime): segue para o env.
  }
  return process.env.BRAVE_API_KEY ?? '';
}

export type BraveSearchService = ReturnType<typeof createBraveSearchService>;

/**
 * Normaliza a resposta crua da Brave (`web.results[]`) para BraveResult[],
 * anexando `query` e `source:'brave'`. Entradas sem `title`/`url` são descartadas.
 */
export function normalizeBraveResults(query: string, raw: unknown): BraveResult[] {
  const payload = raw as { web?: { results?: unknown } };
  const results = Array.isArray(payload?.web?.results)
    ? (payload.web.results as Array<Record<string, unknown>>)
    : [];
  const findings: BraveResult[] = [];
  for (const item of results) {
    if (!item || typeof item !== 'object') continue;
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const url = typeof item.url === 'string' ? item.url.trim() : '';
    const description = typeof item.description === 'string' ? item.description : '';
    if (!title || !url) continue;
    const score = typeof item.score === 'number' && Number.isFinite(item.score) ? item.score : undefined;
    const age = typeof item.age === 'string' ? item.age : undefined;
    let profile: BraveResult['profile'];
    if (item.profile && typeof item.profile === 'object') {
      const p = item.profile as Record<string, unknown>;
      profile = {
        name: typeof p.name === 'string' ? p.name : undefined,
        long_name: typeof p.long_name === 'string' ? p.long_name : null,
        img: typeof p.img === 'string' ? p.img : null,
      };
    }
    const result: BraveResult = {
      query,
      title,
      url,
      description,
      source: 'brave',
    };
    if (score !== undefined) result.score = score;
    if (age !== undefined) result.age = age;
    if (profile) result.profile = profile;
    findings.push(result);
  }
  return findings;
}

/**
 * Deduplica resultados por `url` (a primeira ocorrência vence), preservando
 * a ordem original. Resultados únicos com score baixo não são removidos.
 */
export function dedupeByUrl(results: StudyFinding[]): StudyFinding[] {
  const seen = new Set<string>();
  const out: StudyFinding[] = [];
  for (const r of results) {
    if (!r.url || seen.has(r.url)) continue;
    seen.add(r.url);
    out.push(r);
  }
  return out;
}

/**
 * Ordena resultados por `score` decrescente quando score está presente (B) e
 * deixa itens sem score no fim. Estável: itens de mesma/ausência de score
 * preservam a ordem relativa original.
 */
export function sortByScoreDesc(results: StudyFinding[]): StudyFinding[] {
  return [...results].sort((a, b) => {
    const sa = typeof a.score === 'number' ? a.score : -Infinity;
    const sb = typeof b.score === 'number' ? b.score : -Infinity;
    return sb - sa;
  });
}

/** Extrai uma mensagem de erro legível de um corpo JSON de erro da Brave. */
function extractBraveErrorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const obj = payload as Record<string, unknown>;
  const message =
    typeof (obj.error as Record<string, unknown> | undefined)?.message === 'string'
      ? (obj.error as Record<string, unknown>).message
      : undefined;
  if (typeof message === 'string') return message;
  if (typeof obj.message === 'string') return obj.message;
  return undefined;
}

/**
 * Factory do serviço Brave. Tudo é passível de injeção; sem `resolveApiKey`
 * fornecido, a chave sai do settingsStore com fallback em env.
 */

/** Quantas re-tentativas após o primeiro 429 com delayEmsOnRateLimit > 0. Spec: 1 retry. */
const RATE_LIMIT_MAX_RETRIES = 1;

/**
 * Opts internos passados entre chamadas recursivas de `doSearch`, incluindo um
 * contador de tentativas (attempts = 1 na primeira chamada) que limita o retry
 * de 429 a um número EXATO de re-tentativas, evitando recursão sem teto.
 */
interface RateLimitedSearchProps {
  count: number;
  extraParams?: SearchOptions['extraParams'];
  delayMsOnRateLimit?: number;
  /** Tentativa corrente (1 = primeira chamada). Nunca deve ficar <= 0. */
  attempts: number;
}
export function createBraveSearchService(deps: BraveSearchDeps = {}): {
  testConnection(): Promise<{ ok: boolean; message: string }>;
  search(query: string, opts?: SearchOptions): Promise<BraveResult[]>;
  multiSearch(queries: string[], opts?: MultiSearchOptions): Promise<MultiSearchResult>;
} {
  const baseUrl = (deps.baseUrl ?? BRAVE_DEFAULT_BASE).replace(/\/+$/, '');
  const fetchImpl = deps.fetchImpl ?? fetch;

  const defaultResolveApiKey = deps.resolveApiKey ?? resolveBraveApiKey;

  async function resolveKey(): Promise<string> {
    const key = (await defaultResolveApiKey()).trim();
    if (!key) {
      const err = new Error(
        'Brave API key não configurada. Configure a chave Brave nas configurações ou defina a variável de ambiente BRAVE_API_KEY.',
      );
      (err as Error & { code?: string }).code = 'BRAVE_KEY_MISSING';
      throw err;
    }
    return key;
  }

  async function doSearch(
    query: string,
    key: string,
    opts: RateLimitedSearchProps,
  ): Promise<BraveResult[]> {
    const qs = new URLSearchParams();
    qs.set('q', query);
    qs.set('count', String(opts.count));
    if (opts.extraParams) {
      for (const [k, v] of Object.entries(opts.extraParams)) {
        qs.set(k, String(v));
      }
    }
    const url = `${baseUrl}/res/v1/web/search?${qs.toString()}`;

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        headers: {
          'X-Subscription-Token': key,
          Accept: 'application/json',
        },
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Erro de rede ao buscar no Brave: ${detail}`);
    }

    if (response.status === 401 || response.status === 403) {
      const err = new Error('Brave API key inválida');
      (err as Error & { code?: string }).code = 'BRAVE_KEY_INVALID';
      throw err;
    }

    if (response.status === 429) {
      const retriesLeft = RATE_LIMIT_MAX_RETRIES - (opts.attempts - 1);
      if (opts.delayMsOnRateLimit && opts.delayMsOnRateLimit > 0 && retriesLeft > 0) {
        await new Promise((r) => setTimeout(r, opts.delayMsOnRateLimit));
        return doSearch(query, key, { ...opts, attempts: opts.attempts + 1 });
      }
      const err = new Error('Rate limit atingido pela Brave Search API (429). Tente novamente em instantes.');
      (err as Error & { code?: string }).code = 'BRAVE_RATE_LIMIT';
      throw err;
    }

    if (response.status >= 500) {
      let message = '';
      try {
        message = extractBraveErrorMessage(await response.json()) ?? '';
      } catch {
        message = '';
      }
      const err = new Error(
        message || `Erro do servidor da Brave Search API (HTTP ${response.status})`,
      );
      (err as Error & { code?: string }).code = 'BRAVE_SERVER_ERROR';
      throw err;
    }

    if (!response.ok) {
      let message = '';
      try {
        message = extractBraveErrorMessage(await response.json()) ?? '';
      } catch {
        message = '';
      }
      throw new Error(message || `Falha na consulta ao Brave (HTTP ${response.status})`);
    }

    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      throw new Error('Resposta inválida da Brave Search API (JSON não parseável).');
    }
    return normalizeBraveResults(query, raw);
  }

  return {
    /** Valida a chave contra 1 resultado (cheap) sem retornar resultados. */
    async testConnection() {
      try {
        const key = await resolveKey();
        const qs = new URLSearchParams({ q: 'test', count: '1' });
        const url = `${baseUrl}/res/v1/web/search?${qs.toString()}`;
        const response = await fetchImpl(url, {
          method: 'GET',
          headers: { 'X-Subscription-Token': key, Accept: 'application/json' },
        });
        if (response.status === 401 || response.status === 403) {
          return { ok: false, message: 'Brave API key inválida' };
        }
        if (response.status === 429) {
          return { ok: false, message: 'Rate limit atingido (429). Chave válida, tente mais tarde.' };
        }
        if (!response.ok) {
          return { ok: false, message: `Falha na conexão com a Brave (HTTP ${response.status})` };
        }
        return { ok: true, message: 'Brave Search API conectada.' };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, message };
      }
    },

    async search(query, opts: SearchOptions = {}): Promise<BraveResult[]> {
      if (!query || !query.trim()) {
        throw new Error('Query de busca vazia.');
      }
      const key = await resolveKey();
      return doSearch(query.trim(), key, {
        count: opts.count ?? 10,
        extraParams: opts.extraParams,
        delayMsOnRateLimit: opts.delayMsOnRateLimit,
        attempts: 1,
      });
    },

    /**
     * Executa várias queries em paralelo com limite de concorrência e delay
     * entre lotes; agrega e deduplica por url (a primeira vence).
     */
    async multiSearch(queries, opts: MultiSearchOptions = {}): Promise<MultiSearchResult> {
      const concurrency = Math.max(1, opts.concurrency ?? 2);
      const delayMs = Math.max(0, opts.delayMs ?? 250);
      const results: StudyFinding[] = [];
      const errors: Array<{ query: string; error: string; code?: string }> = [];
      const seenUrls = new Set<string>();

      // Fila real: pool de workers com limite de concorrência + delay entre lotes.
      const uniqueQueries = Array.from(new Set(queries)).filter((q) => q && q.trim());
      let cursor = 0;

      const worker = async (): Promise<void> => {
        for (;;) {
          const idx = cursor;
          if (idx >= uniqueQueries.length) return;
          cursor += 1;
          if (idx > 0 && idx % concurrency === 0 && delayMs > 0) {
            await new Promise((r) => setTimeout(r, delayMs));
          }
          const query = uniqueQueries[idx];
          opts.onQueryStart?.(query);
          const startedAt = Date.now();
          try {
            const key = await resolveKey();
            const found = await doSearch(query.trim(), key, {
              count: opts.count ?? 10,
              extraParams: opts.extraParams,
              delayMsOnRateLimit: opts.delayMsOnRateLimit,
              attempts: 1,
            });
            for (const f of found) {
              if (!f.url || seenUrls.has(f.url)) continue;
              seenUrls.add(f.url);
              results.push(f);
            }
            opts.onQueryDone?.({
              query,
              ok: true,
              provider: 'brave',
              hits: found.length,
              latencyMs: Date.now() - startedAt,
            });
          } catch (error) {
            const code =
              (error as Error & { code?: string }).code !== undefined
                ? (error as Error & { code?: string }).code
                : undefined;
            errors.push({
              query,
              error: error instanceof Error ? error.message : String(error),
              ...(code !== undefined ? { code } : {}),
            });
            opts.onQueryDone?.({
              query,
              ok: false,
              provider: 'brave',
              latencyMs: Date.now() - startedAt,
              ...(code !== undefined
                ? { error: { code, message: error instanceof Error ? error.message : String(error) } }
                : { error: { message: error instanceof Error ? error.message : String(error) } }),
            });
          }
        }
      };

      const workers = Array.from({ length: Math.min(concurrency, Math.max(1, uniqueQueries.length)) }, worker);
      await Promise.all(workers);

      const deduped = dedupeByUrl(results);
      return { results: deduped, errors };
    },
  };
}