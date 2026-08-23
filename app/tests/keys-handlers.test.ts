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
}

function installFakeElectron(): FakeIpcMain {
  const fake: FakeIpcMain = {
    handlers: new Map(),
    handle(channel, fn) {
      this.handlers.set(channel, fn);
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

/**
 * Mock do fetch GLOBAL, usado pelos validadores quando o handler os chama sem
 * `fetchImpl` injetado. Roteia por URL: /models → lista de modelos; buscas
 * Brave → resultado vazio. Permite controlar o status por URL via `statuses`.
 */
function mockGlobalFetch(opts?: { statuses?: Record<string, number> }): void {
  const statuses = opts?.statuses ?? {};
  fetchMock?.mock.restore();
  fetchMock = mock.method(globalThis, 'fetch', async (url: unknown) => {
    const u = String(url);
    if (u.includes('/models')) {
      return fakeResponse(statuses[u] ?? 200, { data: [{ id: 'deepseek-v4-flash' }] });
    }
    if (u.includes('/res/v1/web/search')) {
      return fakeResponse(statuses[u] ?? 200, { web: { results: [] } });
    }
    return fakeResponse(500, { error: { message: 'unknown url' } });
  });
}

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

test('registerKeysHandlers registra exatamente os 4 canais do contrato KEYS_CHANNELS', () => {
  const store = makeFakeStore();
  const ipc = beforeEachRegister(store);
  const channels = [...ipc.handlers.keys()].sort();
  assert.deepEqual(
    channels,
    Object.values(KEYS_CHANNELS).sort(),
    'os channels registrados devem casar exatamente o contrato',
  );
});

test('keys:validate-deepseek → valida a chave do store e grava deepseekValidated/modelAvailable', async () => {
  mockGlobalFetch();
  const store = makeFakeStore({
    apiKeys: { deepseek: 'sk-deepseek' },
  });
  const ipc = beforeEachRegister(store);

  const handler = ipc.handlers.get(KEYS_CHANNELS.VALIDATE_DEEPSEEK)!;
  const result = (await handler()) as {
    isValid: boolean;
    provider: string;
    modelAvailable?: boolean;
    errorMessage?: string;
  };

  assert.equal(result.provider, 'deepseek');
  assert.equal(result.isValid, true);
  assert.equal(result.modelAvailable, true);
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

test('keys:set-key → grava a chave no store e retorna { ok: true }', async () => {
  const store = makeFakeStore({});
  const ipc = beforeEachRegister(store);

  const handler = ipc.handlers.get(KEYS_CHANNELS.SET_KEY)!;
  const result = (await handler(undefined as never, 'deepseek', 'nova-chave')) as { ok: boolean };

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(store.setApiKeyCalls, [['deepseek', 'nova-chave']]);
});

test('keys:set-key com apiKey undefined → grava vazio (apaga)', async () => {
  const store = makeFakeStore({ apiKeys: { brave: 'old' } });
  const ipc = beforeEachRegister(store);

  const handler = ipc.handlers.get(KEYS_CHANNELS.SET_KEY)!;
  const result = (await handler(undefined as never, 'brave', undefined as never)) as { ok: boolean };

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(store.setApiKeyCalls, [['brave', '']]);
});