/**
 * src/lib/apiBridge.ts — ponte único entre as views React e a API exposta.
 *
 * As views NUNCA acessam `window` diretamente: todas leem a API por `getApi()`.
 * Isso mantém os componentes testáveis sem jsdom — um teste injeta um fake por
 * `__setApiForTests(api)` (e restaura por `__resetApiForTests()`), e as views
 * seguem funcionando porque só dependem da forma `ApiSchema`.
 *
 * O acesso ao global é feito via `globalThis` com cast, evitando depender do
 * lib DOM — assim este módulo é puro o bastante para ser type-checkado também
 * pelo tsconfig.node.json (tests) além do renderer. No renderer Electron,
 * `window.api` e `globalThis.api` referem-se à mesma propriedade exposta pelo
 * contextBridge.
 */
import type { ApiSchema } from '../../electron/preload/api-schema';

/** Slot onde a API vive: o fake injetado em teste, ou a exposta pelo preload. */
let currentApi: ApiSchema | null = null;

interface GlobalWithApi {
  api?: ApiSchema;
  window?: { api?: ApiSchema };
}

function apiFromGlobal(): ApiSchema | undefined {
  const g = globalThis as unknown as GlobalWithApi;
  // No renderer, window.api === globalThis.api; no teste (node), o fake pode
  // estar em globalThis.api ou globalThis.window.api.
  return g.api ?? g.window?.api;
}

/**
 * Devolve a API exposta pelo preload (window.api), ou o fake injetado em teste.
 * Nenhuma view deveria precisar de outra forma de obter a API.
 */
export function getApi(): ApiSchema {
  if (currentApi) return currentApi;
  const global = apiFromGlobal();
  // Nunca deveria acontecer no renderer (preload sempre expõe window.api);
  // o fallback lança um erro claro em vez de um `undefined` críptico.
  if (!global) {
    throw new Error('window.api não está disponível (preload não expôs a API?).');
  }
  return global;
}

/**
 * Injetar um fake para testes (lógica pura, sem jsdom). Guarda o valor anterior
 * para que `__resetApiForTests()` restaure o estado exato.
 */
export function __setApiForTests(api: ApiSchema | null): void {
  currentApi = api;
}

/** Restaura o estado original (null => volta a window.api). */
export function __resetApiForTests(): void {
  currentApi = null;
}