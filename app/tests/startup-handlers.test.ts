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
 *
 * A chave do LLM é lida do slot 'openrouter' com FALLBACK para o slot LEGADO
 * (`LEGACY_LLM_PROVIDER_KEY`) — o teste do fallback está no fim do arquivo.
 */
import { Module } from 'node:module';
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';

import { KEYS_CHANNELS, type StartupStatus } from '../shared/ipc-contract';
import type {
  LlmValidationResult,
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
import { LEGACY_LLM_PROVIDER_KEY } from '../electron/main/ipc/keys-handlers';

function makeStartupStore(
  initial: Record<string, string> = {},
): SettingsStore {
  const keys: Record<string, string> = { ...initial };
  return {
    getApiKey: async (provider: string) => keys[provider] ?? '',
  } as unknown as SettingsStore;
}

/** Resultado de validação sintético controlado pelo teste (tipo completo p/ DI). */
function validResult<D extends 'openrouter' | 'brave'>(provider: D): D extends 'openrouter' ? LlmValidationResult : BraveValidationResult {
  return { isValid: true, provider, checkedAt: '2026-08-23T00:00:00.000Z' } as D extends 'openrouter' ? LlmValidationResult : BraveValidationResult;
}
function invalidResult<D extends 'openrouter' | 'brave'>(
  provider: D,
  errorMessage: string,
): D extends 'openrouter' ? LlmValidationResult : BraveValidationResult {
  return {
    isValid: false,
    provider,
    errorMessage,
    checkedAt: '2026-08-23T00:00:00.000Z',
  } as D extends 'openrouter' ? LlmValidationResult : BraveValidationResult;
}

const NETWORK_ERR = 'Network error: fetch failed';

afterEach(() => {
  // Registro limpo entre testes: sem electron interceptado pendente.
});

test('classifyStartup: alguma chave não configurada → blocked SEM rede (valid:false)', () => {
  const s = classifyStartup({
    llmConfigured: true,
    braveConfigured: false,
    checkedAt: 'now',
  });
  assert.equal(s.phase, 'blocked');
  assert.equal(s.offline, false);
  assert.equal(s.llm.configured, true);
  assert.equal(s.llm.valid, false, 'não valida sem as duas');
  assert.equal(s.brave.configured, false);
  assert.equal(s.brave.valid, false);
});

test('classifyStartup: ambas válidas → ready', () => {
  const s = classifyStartup({
    llmConfigured: true,
    braveConfigured: true,
    llmResult: validResult('openrouter'),
    braveResult: validResult('brave'),
    checkedAt: 'now',
  });
  assert.equal(s.phase, 'ready');
  assert.equal(s.offline, false);
  assert.equal(s.llm.valid, true);
  assert.equal(s.brave.valid, true);
});

test('classifyStartup: chave do LLM inválida (401/403) → blocked com erro', () => {
  const s = classifyStartup({
    llmConfigured: true,
    braveConfigured: true,
    llmResult: invalidResult('openrouter', 'Invalid API key'),
    braveResult: validResult('brave'),
    checkedAt: 'now',
  });
  assert.equal(s.phase, 'blocked');
  assert.equal(s.offline, false);
  assert.equal(s.llm.valid, false);
  assert.equal(s.llm.error, 'Invalid API key');
  assert.equal(s.brave.valid, true);
});

test('classifyStartup: AMBAS falham por rede → offline (online false, valid:false)', () => {
  const s = classifyStartup({
    llmConfigured: true,
    braveConfigured: true,
    llmResult: invalidResult('openrouter', NETWORK_ERR),
    braveResult: invalidResult('brave', NETWORK_ERR),
    checkedAt: 'now',
  });
  assert.equal(s.phase, 'offline');
  assert.equal(s.offline, true);
  assert.equal(s.llm.valid, false);
  assert.equal(s.brave.valid, false);
  assert.match(s.llm.error ?? '', /Network error/);
  assert.match(s.brave.error ?? '', /Network error/);
});

test('classifyStartup: UMA rede-falhou + outra válida → blocked (NÃO offline)', () => {
  const s = classifyStartup({
    llmConfigured: true,
    braveConfigured: true,
    llmResult: invalidResult('openrouter', NETWORK_ERR),
    braveResult: validResult('brave'),
    checkedAt: 'now',
  });
  assert.equal(s.phase, 'blocked', 'offline exige AMBAS por rede');
  assert.equal(s.offline, false);
  assert.equal(s.llm.valid, false);
  assert.equal(s.brave.valid, true);
});

test('isNetworkError reconhece o prefixo Network error: dos validadores', () => {
  assert.equal(isNetworkError(validResult('openrouter')), false);
  assert.equal(isNetworkError(invalidResult('openrouter', NETWORK_ERR)), true);
  assert.equal(isNetworkError(invalidResult('openrouter', 'Invalid API key')), false);
  assert.equal(isNetworkError(undefined), false);
});

// ─── buildStartupHandlers com store fake + validadores injetados ─────────────

test('startup-status: sem chave configurada → phase blocked SEM chamar validadores', async () => {
  let llmCalls = 0;
  let braveCalls = 0;
  const handlers = buildStartupHandlers({
    getStore: async () => makeStartupStore({ openrouter: 'sk-or-v1-d' }), // brave ausente
    validateLlm: async () => {
      llmCalls += 1;
      return validResult('openrouter');
    },
    validateBrave: async () => {
      braveCalls += 1;
      return validResult('brave');
    },
  });
  const status = (await handlers.get(KEYS_CHANNELS.STARTUP_STATUS)!(undefined)) as StartupStatus;
  assert.equal(status.phase, 'blocked');
  assert.equal(status.brave.configured, false);
  assert.equal(llmCalls, 0, 'não valida quando falta configurar');
  assert.equal(braveCalls, 0, 'não valida quando falta configurar');
});

test('startup-status: ambas configuradas e válidas → ready', async () => {
  const handlers = buildStartupHandlers({
    getStore: async () => makeStartupStore({ openrouter: 'sk-or-v1-d', brave: 'bk' }),
    validateLlm: async (key) => (key === 'sk-or-v1-d' ? validResult('openrouter') : invalidResult('openrouter', 'x')),
    validateBrave: async (key) => (key === 'bk' ? validResult('brave') : invalidResult('brave', 'x')),
  });
  const status = (await handlers.get(KEYS_CHANNELS.STARTUP_STATUS)!(undefined)) as StartupStatus;
  assert.equal(status.phase, 'ready');
  assert.equal(status.offline, false);
  assert.equal(status.llm.valid, true);
  assert.equal(status.brave.valid, true);
});

test('startup-status: chave inválida → blocked com erro', async () => {
  const handlers = buildStartupHandlers({
    getStore: async () => makeStartupStore({ openrouter: 'sk-or-v1-d', brave: 'bk' }),
    validateLlm: async () => invalidResult('openrouter', 'Invalid API key'),
    validateBrave: async () => validResult('brave'),
  });
  const status = (await handlers.get(KEYS_CHANNELS.STARTUP_STATUS)!(undefined)) as StartupStatus;
  assert.equal(status.phase, 'blocked');
  assert.equal(status.llm.error, 'Invalid API key');
});

test('startup-status: AMBAS por rede → offline', async () => {
  const handlers = buildStartupHandlers({
    getStore: async () => makeStartupStore({ openrouter: 'sk-or-v1-d', brave: 'bk' }),
    validateLlm: async () => invalidResult('openrouter', NETWORK_ERR),
    validateBrave: async () => invalidResult('brave', NETWORK_ERR),
  });
  const status = (await handlers.get(KEYS_CHANNELS.STARTUP_STATUS)!(undefined)) as StartupStatus;
  assert.equal(status.phase, 'offline');
  assert.equal(status.offline, true);
});

test('startup-status: rede parcial (uma valid, outra rede) → blocked', async () => {
  const handlers = buildStartupHandlers({
    getStore: async () => makeStartupStore({ openrouter: 'sk-or-v1-d', brave: 'bk' }),
    validateLlm: async () => validResult('openrouter'),
    validateBrave: async () => invalidResult('brave', NETWORK_ERR),
  });
  const status = (await handlers.get(KEYS_CHANNELS.STARTUP_STATUS)!(undefined)) as StartupStatus;
  assert.equal(status.phase, 'blocked', 'offline exige AMBAS por rede');
  assert.equal(status.brave.valid, false);
});

test('buildStartupHandlers expõe EXATAMENTE o canal keys:startup-status', () => {
  const handlers = buildStartupHandlers({
    getStore: async () => makeStartupStore({}),
    validateLlm: async () => validResult('openrouter'),
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
      getStore: async () => makeStartupStore({ openrouter: 'sk-or-v1-d', brave: 'bk' }),
      validateLlm: async () => validResult('openrouter'),
      validateBrave: async () => validResult('brave'),
      timeoutMs: 0,
    });
    assert.equal(ipc.handlers.get(KEYS_CHANNELS.STARTUP_STATUS) !== undefined, true);
    const status = (await ipc.handlers.get(KEYS_CHANNELS.STARTUP_STATUS)!(undefined)) as StartupStatus;
    assert.equal(status.phase, 'ready');

    // safeHandle idempotente: re-registrar não lança.
    registerStartupHandlers({
      getStore: async () => makeStartupStore({}),
      validateLlm: async () => validResult('openrouter'),
      validateBrave: async () => validResult('brave'),
      timeoutMs: 0,
    });
    assert.equal(ipc.handlers.size, 1);
  } finally {
    (Module as any)._load = origLoad;
  }
});

// ─── slot da chave do LLM no GATE: canônico + fallback de leitura ────────────

test('startup-status: chave só no slot LEGADO → configurada e validada (fallback)', async () => {
  // Perfil de quem instalou o app antes da migração: nada em 'openrouter'.
  // O gate NÃO pode bloquear essa pessoa.
  const seen: string[] = [];
  const handlers = buildStartupHandlers({
    getStore: async () => makeStartupStore({ [LEGACY_LLM_PROVIDER_KEY]: 'sk-legado', brave: 'bk' }),
    validateLlm: async (key) => {
      seen.push(key);
      return validResult('openrouter');
    },
    validateBrave: async () => validResult('brave'),
    timeoutMs: 0,
  });
  const status = (await handlers.get(KEYS_CHANNELS.STARTUP_STATUS)!(undefined)) as StartupStatus;

  assert.equal(status.phase, 'ready');
  assert.equal(status.llm.configured, true);
  assert.deepEqual(seen, ['sk-legado'], 'a chave antiga é a que foi validada');
});

test('startup-status: slot NOVO tem precedência sobre o legado', async () => {
  const seen: string[] = [];
  const handlers = buildStartupHandlers({
    getStore: async () =>
      makeStartupStore({
        openrouter: 'sk-or-v1-nova',
        [LEGACY_LLM_PROVIDER_KEY]: 'sk-legado',
        brave: 'bk',
      }),
    validateLlm: async (key) => {
      seen.push(key);
      return validResult('openrouter');
    },
    validateBrave: async () => validResult('brave'),
    timeoutMs: 0,
  });
  await handlers.get(KEYS_CHANNELS.STARTUP_STATUS)!(undefined);
  assert.deepEqual(seen, ['sk-or-v1-nova']);
});

// ─── tipos de deps compilam como esperado (âncora do contrato) ───────────────
const _typeAnchor: RegisterStartupHandlersDeps = {
  getStore: async () => makeStartupStore({}),
  validateLlm: async () => validResult('openrouter'),
  validateBrave: async () => validResult('brave'),
  timeoutMs: 8000,
};
void _typeAnchor;