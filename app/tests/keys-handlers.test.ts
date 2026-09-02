/**
 * tests/keys-handlers.test.ts — handlers IPC de chaves (onda1-pi).
 *
 * `registerKeysHandlers` importa `electron` LAZY via `require('electron')`.
 * Os testes interceptam esse require em `Module._load` e injetam um `ipcMain`
 * fake que retém os handlers por canal — de modo que nenhum teste toca o
 * runtime real do Electron. O store é fake (DI via `getStore`).
 *
 * Canais cobertos (contrato KEYS_CHANNELS):
 *   keys:validate-deepseek, keys:validate-brave, keys:get-status, keys:set-key
 *
 * MIGRAÇÃO OPENROUTER: os NOMES (canal, campos do KeysStatus) continuam os
 * antigos, mas o comportamento mudou — a validade vem de
 * `GET https://openrouter.ai/api/v1/key`, a leitura da chave do LLM é do slot
 * 'openrouter' com FALLBACK para o legado 'deepseek', e a gravação vai SEMPRE
 * para 'openrouter' (apagando o legado no mesmo passo).
 */
import { Module } from 'node:module';
import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';

import { KEYS_CHANNELS } from '../shared/ipc-contract';
import type { SettingsStore } from '../electron/main/services/settingsStore';

/** Response fake mínimo do fetch global. */
function fakeResponse(status: number, body: unknown = {}): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

let fetchMock: ReturnType<typeof mock.method> | undefined;

/** ipcMain fake que retém (canal → handler). */
type HandlerFn = (...args: unknown[]) => Promise<unknown>;
interface FakeIpcMain {
  handlers: Map<string, HandlerFn>;
  handle(channel: string, fn: HandlerFn): void;
  removeHandler(channel: string): void;
}

function installFakeElectron(): FakeIpcMain {
  const fake: FakeIpcMain = {
    handlers: new Map(),
    handle(channel, fn) {
      this.handlers.set(channel, fn);
    },
    removeHandler(channel) {
      this.handlers.delete(channel);
    },
  };
  return fake;
}

/** Store fake com spy de chamadas e valores por chave. */
function makeFakeStore(initial: {
  apiKeys?: Record<string, string>;
  values?: Record<string, unknown>;
} = {}): SettingsStore & {
  setValueCalls: Array<[string, unknown]>;
  setApiKeyCalls: Array<[string, string]>;
} {
  const apiKeys: Record<string, string> = { ...(initial.apiKeys ?? {}) };
  const values: Record<string, unknown> = { ...(initial.values ?? {}) };
  const calls = {
    setValueCalls: [] as Array<[string, unknown]>,
    setApiKeyCalls: [] as Array<[string, string]>,
  };
  return {
    ...calls,
    getApiKey: async (provider: string) => apiKeys[provider] ?? '',
    setApiKey: async (provider: string, key: string) => {
      calls.setApiKeyCalls.push([provider, key]);
      if (key) apiKeys[provider] = key;
      else delete apiKeys[provider];
    },
    getValue: async <T>(key: string) => values[key] as T | undefined,
    setValue: async (key: string, value: unknown) => {
      calls.setValueCalls.push([key, value]);
      values[key] = value;
    },
  } as unknown as SettingsStore & {
    setValueCalls: Array<[string, unknown]>;
    setApiKeyCalls: Array<[string, string]>;
  };
}

/** Captura o require('electron') do módulo-alvo e devolve o ipcMain fake. */
function captureElectron(): FakeIpcMain {
  const fake = installFakeElectron();
  origLoad = (Module as any)._load as (...a: unknown[]) => unknown;
  (Module as any)._load = function (request: string, ...args: unknown[]) {
    if (request === 'electron') return { ipcMain: fake };
    return (origLoad as any).apply(this, [request, ...args]);
  };
  return fake;
}

/** Model id alvo do contrato congelado (shared/llm/constants.ts). */
const TARGET_MODEL = 'z-ai/glm-5.3-flash';

/**
 * Mock do fetch GLOBAL, usado pelos validadores quando o handler os chama sem
 * `fetchImpl` injetado. Roteia por URL: /key → validade da chave do OpenRouter
 * (a ÚNICA que decide isValid); /models → catálogo (complemento de
 * `modelAvailable`); buscas Brave → resultado vazio. Permite controlar o status
 * por URL via `statuses`.
 *
 * Registra o cabeçalho Authorization/X-Subscription-Token de cada chamada em
 * `fetchHeaders` para os testes provarem QUAL chave foi realmente validada.
 */
function mockGlobalFetch(opts?: { statuses?: Record<string, number> }): void {
  const statuses = opts?.statuses ?? {};
  fetchMock?.mock.restore();
  fetchHeaders.length = 0;
  fetchMock = mock.method(globalThis, 'fetch', async (url: unknown, init?: { headers?: Record<string, string> | Headers }) => {
    const u = String(url);
    const headers = init?.headers ?? {};
    const getHeader = (name: string): string | undefined => {
      if (headers instanceof Headers) return headers.get(name) ?? undefined;
      const rec = headers as Record<string, string>;
      return rec[name] ?? rec[name.toLowerCase()];
    };
    fetchHeaders.push({
      url: u,
      authorization: getHeader('Authorization'),
      subscriptionToken: getHeader('X-Subscription-Token'),
    });
    if (u.includes('/models')) {
      return fakeResponse(statuses[u] ?? 200, { data: [{ id: TARGET_MODEL }] });
    }
    if (u.endsWith('/key')) {
      return fakeResponse(statuses[u] ?? 200, { data: { label: 'e2e', is_free_tier: false } });
    }
    if (u.includes('/res/v1/web/search')) {
      return fakeResponse(statuses[u] ?? 200, { web: { results: [] } });
    }
    return fakeResponse(500, { error: { message: 'unknown url' } });
  });
}

/** Cabeçalhos Authorization/X-Subscription-Token do ÚLTIMO mockGlobalFetch. */
const fetchHeaders: Array<{ url: string; authorization?: string; subscriptionToken?: string }> = [];

let captured: FakeIpcMain | null = null;
let origLoad: ((...a: unknown[]) => unknown) | null = null;

function beforeEachRegister(store: SettingsStore) {
  captured = captureElectron();
  // import dinâmico a cada teste para re-executar o registerKeysHandlers().
  const { registerKeysHandlers } = require('../electron/main/ipc/keys-handlers') as {
    registerKeysHandlers: (deps?: { getStore?: () => Promise<SettingsStore> }) => void;
  };
  registerKeysHandlers({ getStore: async () => store });
  return captured;
}

afterEach(() => {
  // Restaura o require('electron') interceptado e o fetch global mockado.
  if (origLoad) {
    (Module as any)._load = origLoad;
    origLoad = null;
  }
  fetchMock?.mock.restore();
  fetchMock = undefined;
  captured = null;
});

test('registerKeysHandlers registra os 4 canais keys:* que ELE possui (aditivo da onda 6)', () => {
  const store = makeFakeStore();
  const ipc = beforeEachRegister(store);
  const channels = [...ipc.handlers.keys()].sort();
  // Onda 6 (startup gate): KEYS_CHANNELS ganhou STARTUP_STATUS aditivo, mas
  // esse canal é registrado por registerStartupHandlers (registrador separado),
  // NÃO por registerKeysHandlers. Aqui conferimos exatamente os 4 donos dele.
  const owned = Object.values(KEYS_CHANNELS).filter((c) => c !== KEYS_CHANNELS.STARTUP_STATUS).sort();
  assert.deepEqual(
    channels,
    owned,
    'os channels registrados por registerKeysHandlers devem casar os candeos keys:* (exceto startup-status)',
  );
});

test('keys:validate-deepseek → valida a chave do store e grava deepseekValidated/modelAvailable', async () => {
  mockGlobalFetch();
  const store = makeFakeStore({
    apiKeys: { openrouter: 'sk-or-v1-store' },
  });
  const ipc = beforeEachRegister(store);

  const handler = ipc.handlers.get(KEYS_CHANNELS.VALIDATE_DEEPSEEK)!;
  const result = (await handler()) as {
    isValid: boolean;
    provider: string;
    modelAvailable?: boolean;
    errorMessage?: string;
  };

  assert.equal(result.provider, 'openrouter');
  assert.equal(result.isValid, true);
  assert.equal(result.modelAvailable, true);
  // A URL de VALIDADE é a autenticada — nunca o catálogo público.
  assert.equal(fetchHeaders[0].url, 'https://openrouter.ai/api/v1/key');
  // Modelo encontra o id alvo na lista fake da API => deepseekValidated true.
  const setDeep = store.setValueCalls.find(([k]) => k === 'deepseekValidated');
  assert.deepEqual(setDeep, ['deepseekValidated', true]);
  const setModel = store.setValueCalls.find(([k]) => k === 'modelAvailable');
  assert.deepEqual(setModel, ['modelAvailable', true]);
});

test('keys:validate-deepseek com chave ausente → grava deepseekValidated false e modelo false', async () => {
  mockGlobalFetch();
  const store = makeFakeStore({});
  const ipc = beforeEachRegister(store);

  const handler = ipc.handlers.get(KEYS_CHANNELS.VALIDATE_DEEPSEEK)!;
  const result = (await handler()) as { isValid: boolean; errorMessage?: string };

  assert.equal(result.isValid, false);
  assert.equal(result.errorMessage, 'API key is empty');
  assert.deepEqual(store.setValueCalls.find(([k]) => k === 'deepseekValidated'), [
    'deepseekValidated',
    false,
  ]);
});

test('keys:validate-brave → valida a chave do store e grava braveValidated', async () => {
  mockGlobalFetch();
  const store = makeFakeStore({ apiKeys: { brave: 'brave-key' } });
  const ipc = beforeEachRegister(store);

  const handler = ipc.handlers.get(KEYS_CHANNELS.VALIDATE_BRAVE)!;
  const result = (await handler()) as { isValid: boolean; provider: string };

  assert.equal(result.isValid, true);
  assert.equal(result.provider, 'brave');
  assert.deepEqual(store.setValueCalls.find(([k]) => k === 'braveValidated'), [
    'braveValidated',
    true,
  ]);
});

test('keys:validate-brave com chave ausente → braveValidated false', async () => {
  mockGlobalFetch();
  const store = makeFakeStore({});
  const ipc = beforeEachRegister(store);

  const handler = ipc.handlers.get(KEYS_CHANNELS.VALIDATE_BRAVE)!;
  const result = (await handler()) as { isValid: boolean };

  assert.equal(result.isValid, false);
  assert.deepEqual(store.setValueCalls.find(([k]) => k === 'braveValidated'), [
    'braveValidated',
    false,
  ]);
});

// ─── keys:validate-* aceitam uma chave digitada no invoke (onda3-ui-wiring) ───

test('keys:validate-deepseek com chave digitada → valida ESSA chave sem salvar a chave', async () => {
  mockGlobalFetch();
  // Store SEM chave deepseek: nada a cair de fallback — a digitada é a única fonte.
  const store = makeFakeStore({});
  const ipc = beforeEachRegister(store);

  const handler = ipc.handlers.get(KEYS_CHANNELS.VALIDATE_DEEPSEEK)!;
  const result = (await handler(undefined as never, 'sk-digitada')) as {
    isValid: boolean;
    modelAvailable?: boolean;
  };

  assert.equal(result.isValid, true);
  assert.equal(result.modelAvailable, true);
  // O fetch fake registra o Authorization da chave DIGITADA.
  const auth = fetchHeaders.find((h) => h.url.endsWith('/key'))?.authorization;
  assert.equal(auth, 'Bearer sk-digitada');
  // O flag de validação é gravado; a CHAVE em si NÃO (sem setApiKey).
  assert.deepEqual(store.setValueCalls.find(([k]) => k === 'deepseekValidated'), [
    'deepseekValidated',
    true,
  ]);
  assert.equal(store.setApiKeyCalls.length, 0, 'chave digitada NÃO deve ser salva');
});

test('keys:validate-deepseek sem chave digitada → não ENVIA Authorization (sem store)', async () => {
  mockGlobalFetch();
  const store = makeFakeStore({});
  const ipc = beforeEachRegister(store);

  const handler = ipc.handlers.get(KEYS_CHANNELS.VALIDATE_DEEPSEEK)!;
  const result = (await handler(undefined as never, '')) as { isValid: boolean; errorMessage?: string };

  assert.equal(result.isValid, false);
  assert.equal(result.errorMessage, 'API key is empty');
  assert.equal(fetchHeaders.length, 0, 'chave vazia não dispara rede');
  assert.deepEqual(store.setValueCalls.find(([k]) => k === 'deepseekValidated'), [
    'deepseekValidated',
    false,
  ]);
  assert.equal(store.setApiKeyCalls.length, 0);
});

test('keys:validate-deepseek sem chave digitada → fallback para a chave do store (slot openrouter)', async () => {
  mockGlobalFetch();
  const store = makeFakeStore({ apiKeys: { openrouter: 'sk-or-v1-store' } });
  const ipc = beforeEachRegister(store);

  const handler = ipc.handlers.get(KEYS_CHANNELS.VALIDATE_DEEPSEEK)!;
  const result = (await handler(undefined as never, undefined)) as { isValid: boolean };

  assert.equal(result.isValid, true);
  // O fetch registra o Authorization da chave do STORE (fallback).
  const auth = fetchHeaders.find((h) => h.url.endsWith('/key'))?.authorization;
  assert.equal(auth, 'Bearer sk-or-v1-store');
});

// ─── Migração do slot da chave do LLM (deepseek → openrouter) ────────────────

test('keys:validate-deepseek → LÊ o slot LEGADO deepseek quando o novo está vazio (não desloga ninguém)', async () => {
  mockGlobalFetch();
  // Perfil de quem já usava o app ANTES da migração: só o slot antigo no disco.
  const store = makeFakeStore({ apiKeys: { deepseek: 'sk-legado' } });
  const ipc = beforeEachRegister(store);

  const handler = ipc.handlers.get(KEYS_CHANNELS.VALIDATE_DEEPSEEK)!;
  const result = (await handler(undefined as never, undefined)) as { isValid: boolean };

  assert.equal(result.isValid, true);
  const auth = fetchHeaders.find((h) => h.url.endsWith('/key'))?.authorization;
  assert.equal(auth, 'Bearer sk-legado', 'a chave antiga continua valendo pelo fallback');
});

test('keys:validate-deepseek → o slot NOVO tem PRECEDÊNCIA sobre o legado', async () => {
  mockGlobalFetch();
  const store = makeFakeStore({ apiKeys: { openrouter: 'sk-or-v1-nova', deepseek: 'sk-legado' } });
  const ipc = beforeEachRegister(store);

  const handler = ipc.handlers.get(KEYS_CHANNELS.VALIDATE_DEEPSEEK)!;
  await handler(undefined as never, undefined);

  const auth = fetchHeaders.find((h) => h.url.endsWith('/key'))?.authorization;
  assert.equal(auth, 'Bearer sk-or-v1-nova');
});

test('keys:get-status → chave só no slot LEGADO ainda conta como configurada', async () => {
  const store = makeFakeStore({ apiKeys: { deepseek: 'sk-legado', brave: 'bk' } });
  const ipc = beforeEachRegister(store);

  const status = (await ipc.handlers.get(KEYS_CHANNELS.GET_STATUS)!()) as Record<string, boolean>;
  assert.equal(status.deepseekConfigured, true);
  assert.equal(status.braveConfigured, true);
});

test('keys:validate-brave com chave digitada → valida ESSA chave (X-Subscription-Token) sem salvar', async () => {
  mockGlobalFetch();
  const store = makeFakeStore({});
  const ipc = beforeEachRegister(store);

  const handler = ipc.handlers.get(KEYS_CHANNELS.VALIDATE_BRAVE)!;
  const result = (await handler(undefined as never, 'brave-digitada')) as { isValid: boolean };

  assert.equal(result.isValid, true);
  const token = fetchHeaders.find((h) => h.url.includes('/res/v1/web/search'))?.subscriptionToken;
  assert.equal(token, 'brave-digitada');
  assert.deepEqual(store.setValueCalls.find(([k]) => k === 'braveValidated'), [
    'braveValidated',
    true,
  ]);
  assert.equal(store.setApiKeyCalls.length, 0);
});

test('keys:validate-brave com chave em branco → valida a do store (fallback)', async () => {
  mockGlobalFetch();
  const store = makeFakeStore({ apiKeys: { brave: 'brave-store' } });
  const ipc = beforeEachRegister(store);

  const handler = ipc.handlers.get(KEYS_CHANNELS.VALIDATE_BRAVE)!;
  const result = (await handler(undefined as never, '   ')) as { isValid: boolean };

  assert.equal(result.isValid, true);
  const token = fetchHeaders.find((h) => h.url.includes('/res/v1/web/search'))?.subscriptionToken;
  assert.equal(token, 'brave-store');
});

test('keys:get-status → monta KeysStatus a partir do store', async () => {
  const store = makeFakeStore({
    apiKeys: { deepseek: 'sk-d', brave: 'bk' },
    values: { deepseekValidated: true, braveValidated: false },
  });
  const ipc = beforeEachRegister(store);

  const handler = ipc.handlers.get(KEYS_CHANNELS.GET_STATUS)!;
  const status = (await handler()) as {
    deepseekConfigured: boolean;
    braveConfigured: boolean;
    deepseekValidated: boolean;
    braveValidated: boolean;
  };

  assert.deepEqual(status, {
    deepseekConfigured: true,
    braveConfigured: true,
    deepseekValidated: true,
    braveValidated: false,
  });
});

test('keys:get-status com nada configurado → tudo false', async () => {
  const store = makeFakeStore({});
  const ipc = beforeEachRegister(store);

  const handler = ipc.handlers.get(KEYS_CHANNELS.GET_STATUS)!;
  const status = (await handler()) as Record<string, boolean>;

  assert.deepEqual(status, {
    deepseekConfigured: false,
    braveConfigured: false,
    deepseekValidated: false,
    braveValidated: false,
  });
});

test('keys:set-key com o nome LEGADO deepseek → grava no slot openrouter e APAGA o legado', async () => {
  // O renderer de hoje ainda manda 'deepseek' (a renomeação é a ONDA 2): o
  // apelido é aceito, mas a gravação migra o slot sozinha.
  const store = makeFakeStore({ apiKeys: { deepseek: 'antiga' } });
  const ipc = beforeEachRegister(store);

  const handler = ipc.handlers.get(KEYS_CHANNELS.SET_KEY)!;
  const result = (await handler(undefined as never, 'deepseek', 'nova-chave')) as { ok: boolean };

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(store.setApiKeyCalls, [
    ['openrouter', 'nova-chave'],
    ['deepseek', ''],
  ]);
});

test('keys:set-key com o nome NOVO openrouter → mesmo slot, legado apagado', async () => {
  const store = makeFakeStore({ apiKeys: { deepseek: 'antiga' } });
  const ipc = beforeEachRegister(store);

  const handler = ipc.handlers.get(KEYS_CHANNELS.SET_KEY)!;
  await handler(undefined as never, 'openrouter', 'sk-or-v1-nova');

  assert.deepEqual(store.setApiKeyCalls, [
    ['openrouter', 'sk-or-v1-nova'],
    ['deepseek', ''],
  ]);
});

test('keys:set-key da chave do LLM com valor vazio → limpa os DOIS slots (apagar apaga mesmo)', async () => {
  // Sem apagar o legado, o fallback de leitura ressuscitaria a chave antiga.
  const store = makeFakeStore({ apiKeys: { openrouter: 'nova', deepseek: 'antiga' } });
  const ipc = beforeEachRegister(store);

  await ipc.handlers.get(KEYS_CHANNELS.SET_KEY)!(undefined as never, 'deepseek', '');
  assert.deepEqual(store.setApiKeyCalls, [
    ['openrouter', ''],
    ['deepseek', ''],
  ]);

  const status = (await ipc.handlers.get(KEYS_CHANNELS.GET_STATUS)!()) as Record<string, boolean>;
  assert.equal(status.deepseekConfigured, false, 'nenhum slot pode sobreviver ao apagar');
});

test('keys:set-key com apiKey undefined → grava vazio (apaga)', async () => {
  const store = makeFakeStore({ apiKeys: { brave: 'old' } });
  const ipc = beforeEachRegister(store);

  const handler = ipc.handlers.get(KEYS_CHANNELS.SET_KEY)!;
  const result = (await handler(undefined as never, 'brave', undefined as never)) as { ok: boolean };

  assert.deepEqual(result, { ok: true });
  // 'brave' NÃO é a chave do LLM: continua no próprio slot, sem migração.
  assert.deepEqual(store.setApiKeyCalls, [['brave', '']]);
});