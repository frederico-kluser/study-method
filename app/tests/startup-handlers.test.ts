/**
 * tests/startup-handlers.test.ts — handlers do GATE DE INÍCIO (onda 6).
 *
 * Testa `classifyStartup` (puro) e `buildStartupHandlers` com STORE FAKE +
 * VALIDADORES INJETADOS (sem rede, sem electron). Cobre a regra da decisão:
 *  - sem chave configurada → blocked SEM rede;
 *  - ambas válidas → ready;
 *  - inválida (401/403) → blocked com erro;
 *  - AMBAS falham por rede → offline;
 *  - uma válida + outra rede-falhou → blocked (não offline);
 *  - registerStartupHandlers registra o canal via safeHandle (ipc fake).
 */
import { Module } from 'node:module';
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';

import { KEYS_CHANNELS, type StartupStatus } from '../shared/ipc-contract';
import type {
  DeepSeekValidationResult,
  BraveValidationResult,
} from '../electron/main/services/apiKeyValidator';
import type { SettingsStore } from '../electron/main/services/settingsStore';
import {
  classifyStartup,
  isNetworkError,
  buildStartupHandlers,
  registerStartupHandlers,
  type RegisterStartupHandlersDeps,
} from '../electron/main/ipc/startup-handlers';

function makeStartupStore(initial: { deepseek?: string; brave?: string } = {}): SettingsStore {
  const keys: Record<string, string> = { ...initial };
  return {
    getApiKey: async (provider: string) => keys[provider] ?? '',
  } as unknown as SettingsStore;
}

/** Resultado de validação sintético controlado pelo teste (tipo completo p/ DI). */
function validResult<D extends 'deepseek' | 'brave'>(provider: D): D extends 'deepseek' ? DeepSeekValidationResult : BraveValidationResult {
  return { isValid: true, provider, checkedAt: '2026-08-23T00:00:00.000Z' } as D extends 'deepseek' ? DeepSeekValidationResult : BraveValidationResult;
}
function invalidResult<D extends 'deepseek' | 'brave'>(
  provider: D,
  errorMessage: string,
): D extends 'deepseek' ? DeepSeekValidationResult : BraveValidationResult {
  return {
    isValid: false,
    provider,
    errorMessage,
    checkedAt: '2026-08-23T00:00:00.000Z',
  } as D extends 'deepseek' ? DeepSeekValidationResult : BraveValidationResult;
}

const NETWORK_ERR = 'Network error: fetch failed';

afterEach(() => {
  // Registro limpo entre testes: sem electron interceptado pendente.
});

test('classifyStartup: alguma chave não configurada → blocked SEM rede (valid:false)', () => {
  const s = classifyStartup({
    deepseekConfigured: true,
    braveConfigured: false,
    checkedAt: 'now',
  });
  assert.equal(s.phase, 'blocked');
  assert.equal(s.offline, false);
  assert.equal(s.deepseek.configured, true);
  assert.equal(s.deepseek.valid, false, 'não valida sem as duas');
  assert.equal(s.brave.configured, false);
  assert.equal(s.brave.valid, false);
});

test('classifyStartup: ambas válidas → ready', () => {
  const s = classifyStartup({
    deepseekConfigured: true,
    braveConfigured: true,
    deepseekResult: validResult('deepseek'),
    braveResult: validResult('brave'),
    checkedAt: 'now',
  });
  assert.equal(s.phase, 'ready');
  assert.equal(s.offline, false);
  assert.equal(s.deepseek.valid, true);
  assert.equal(s.brave.valid, true);
});

test('classifyStartup: DeepSeek inválida (401/403) → blocked com erro', () => {
  const s = classifyStartup({
    deepseekConfigured: true,
    braveConfigured: true,
    deepseekResult: invalidResult('deepseek', 'Invalid API key'),
    braveResult: validResult('brave'),
    checkedAt: 'now',
  });
  assert.equal(s.phase, 'blocked');
  assert.equal(s.offline, false);
  assert.equal(s.deepseek.valid, false);
  assert.equal(s.deepseek.error, 'Invalid API key');
  assert.equal(s.brave.valid, true);
});

test('classifyStartup: AMBAS falham por rede → offline (online false, valid:false)', () => {
  const s = classifyStartup({
    deepseekConfigured: true,
    braveConfigured: true,
    deepseekResult: invalidResult('deepseek', NETWORK_ERR),
    braveResult: invalidResult('brave', NETWORK_ERR),
    checkedAt: 'now',
  });
  assert.equal(s.phase, 'offline');
  assert.equal(s.offline, true);
  assert.equal(s.deepseek.valid, false);
  assert.equal(s.brave.valid, false);
  assert.match(s.deepseek.error ?? '', /Network error/);
  assert.match(s.brave.error ?? '', /Network error/);
});

test('classifyStartup: UMA rede-falhou + outra válida → blocked (NÃO offline)', () => {
  const s = classifyStartup({
    deepseekConfigured: true,
    braveConfigured: true,
    deepseekResult: invalidResult('deepseek', NETWORK_ERR),
    braveResult: validResult('brave'),
    checkedAt: 'now',
  });
  assert.equal(s.phase, 'blocked', 'offline exige AMBAS por rede');
  assert.equal(s.offline, false);
  assert.equal(s.deepseek.valid, false);
  assert.equal(s.brave.valid, true);
});

test('isNetworkError reconhece o prefixo Network error: dos validadores', () => {
  assert.equal(isNetworkError(validResult('deepseek')), false);
  assert.equal(isNetworkError(invalidResult('deepseek', NETWORK_ERR)), true);
  assert.equal(isNetworkError(invalidResult('deepseek', 'Invalid API key')), false);
  assert.equal(isNetworkError(undefined), false);
});

// ─── buildStartupHandlers com store fake + validadores injetados ─────────────

test('startup-status: sem chave configurada → phase blocked SEM chamar validadores', async () => {
  let deepseekCalls = 0;
  let braveCalls = 0;
  const handlers = buildStartupHandlers({
    getStore: async () => makeStartupStore({ deepseek: 'sk-d' }), // brave ausente
    validateDeepseek: async () => {
      deepseekCalls += 1;
      return validResult('deepseek');
    },
    validateBrave: async () => {
      braveCalls += 1;
      return validResult('brave');
    },
  });
  const status = (await handlers.get(KEYS_CHANNELS.STARTUP_STATUS)!(undefined)) as StartupStatus;
  assert.equal(status.phase, 'blocked');
  assert.equal(status.brave.configured, false);
  assert.equal(deepseekCalls, 0, 'não valida quando falta configurar');
  assert.equal(braveCalls, 0, 'não valida quando falta configurar');
});

test('startup-status: ambas configuradas e válidas → ready', async () => {
  const handlers = buildStartupHandlers({
    getStore: async () => makeStartupStore({ deepseek: 'sk-d', brave: 'bk' }),
    validateDeepseek: async (key) => (key === 'sk-d' ? validResult('deepseek') : invalidResult('deepseek', 'x')),
    validateBrave: async (key) => (key === 'bk' ? validResult('brave') : invalidResult('brave', 'x')),
  });
  const status = (await handlers.get(KEYS_CHANNELS.STARTUP_STATUS)!(undefined)) as StartupStatus;
  assert.equal(status.phase, 'ready');
  assert.equal(status.offline, false);
  assert.equal(status.deepseek.valid, true);
  assert.equal(status.brave.valid, true);
});

test('startup-status: chave inválida → blocked com erro', async () => {
  const handlers = buildStartupHandlers({
    getStore: async () => makeStartupStore({ deepseek: 'sk-d', brave: 'bk' }),
    validateDeepseek: async () => invalidResult('deepseek', 'Invalid API key'),
    validateBrave: async () => validResult('brave'),
  });
  const status = (await handlers.get(KEYS_CHANNELS.STARTUP_STATUS)!(undefined)) as StartupStatus;
  assert.equal(status.phase, 'blocked');
  assert.equal(status.deepseek.error, 'Invalid API key');
});

test('startup-status: AMBAS por rede → offline', async () => {
  const handlers = buildStartupHandlers({
    getStore: async () => makeStartupStore({ deepseek: 'sk-d', brave: 'bk' }),
    validateDeepseek: async () => invalidResult('deepseek', NETWORK_ERR),
    validateBrave: async () => invalidResult('brave', NETWORK_ERR),
  });
  const status = (await handlers.get(KEYS_CHANNELS.STARTUP_STATUS)!(undefined)) as StartupStatus;
  assert.equal(status.phase, 'offline');
  assert.equal(status.offline, true);
});

test('startup-status: rede parcial (uma valid, outra rede) → blocked', async () => {
  const handlers = buildStartupHandlers({
    getStore: async () => makeStartupStore({ deepseek: 'sk-d', brave: 'bk' }),
    validateDeepseek: async () => validResult('deepseek'),
    validateBrave: async () => invalidResult('brave', NETWORK_ERR),
  });
  const status = (await handlers.get(KEYS_CHANNELS.STARTUP_STATUS)!(undefined)) as StartupStatus;
  assert.equal(status.phase, 'blocked', 'offline exige AMBAS por rede');
  assert.equal(status.brave.valid, false);
});

test('buildStartupHandlers expõe EXATAMENTE o canal keys:startup-status', () => {
  const handlers = buildStartupHandlers({
    getStore: async () => makeStartupStore({}),
    validateDeepseek: async () => validResult('deepseek'),
    validateBrave: async () => validResult('brave'),
    timeoutMs: 0,
  });
  assert.deepEqual([...handlers.keys()], [KEYS_CHANNELS.STARTUP_STATUS]);
});

// ─── registerStartupHandlers via ipcMain fake (safeHandle, sem electron real) ─

function installFakeElectron() {
  const handlers = new Map<string, (...a: unknown[]) => unknown>();
  const fake = {
    handlers,
    removeHandler(channel: string) {
      handlers.delete(channel);
    },
    handle(channel: string, fn: (...a: unknown[]) => unknown) {
      handlers.set(channel, fn);
    },
  };
  const origLoad = (Module as any)._load as (...a: unknown[]) => unknown;
  (Module as any)._load = function (request: string, ...args: unknown[]) {
    if (request === 'electron') return { ipcMain: fake };
    return (origLoad as any).apply(this, [request, ...args]);
  };
  return fake;
}

test('registerStartupHandlers registra keys:startup-status no ipcMain (safeHandle)', async () => {
  const origLoad = (Module as any)._load as (...a: unknown[]) => unknown;
  try {
    const ipc = installFakeElectron();
    registerStartupHandlers({
      getStore: async () => makeStartupStore({ deepseek: 'sk-d', brave: 'bk' }),
      validateDeepseek: async () => validResult('deepseek'),
      validateBrave: async () => validResult('brave'),
      timeoutMs: 0,
    });
    assert.equal(ipc.handlers.get(KEYS_CHANNELS.STARTUP_STATUS) !== undefined, true);
    const status = (await ipc.handlers.get(KEYS_CHANNELS.STARTUP_STATUS)!(undefined)) as StartupStatus;
    assert.equal(status.phase, 'ready');

    // safeHandle idempotente: re-registrar não lança.
    registerStartupHandlers({
      getStore: async () => makeStartupStore({}),
      validateDeepseek: async () => validResult('deepseek'),
      validateBrave: async () => validResult('brave'),
      timeoutMs: 0,
    });
    assert.equal(ipc.handlers.size, 1);
  } finally {
    (Module as any)._load = origLoad;
  }
});

// ─── tipos de deps compilam como esperado (âncora do contrato) ───────────────
const _typeAnchor: RegisterStartupHandlersDeps = {
  getStore: async () => makeStartupStore({}),
  validateDeepseek: async () => validResult('deepseek'),
  validateBrave: async () => validResult('brave'),
  timeoutMs: 8000,
};
void _typeAnchor;