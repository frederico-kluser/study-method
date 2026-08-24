/**
 * tests/piAuthBridge.test.ts — DI do PiAuthBridge: settingsStore fake + fallback env.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPiAuthBridge, __resetPiAuthBridgeSingleton } from '../electron/main/services/piAuthBridge';
import type { SettingsStore } from '../electron/main/services/settingsStore';

/** Stores fake: só o que o bridge usa (getApiKey). */
function fakeStore(keys: Record<string, string>): SettingsStore {
  return {
    getApiKey: async (provider: string) => keys[provider] ?? '',
  } as unknown as SettingsStore;
}

function make(keys: Record<string, string>) {
  return createPiAuthBridge({ getStore: async () => fakeStore(keys) });
}

test('getApiKey: lê do store quando há chave', async () => {
  const bridge = make({ deepseek: 'sk-store' });
  assert.equal(await bridge.getApiKey('deepseek'), 'sk-store');
});

test('getApiKey: fallback para env quando store vazio', async () => {
  const prev = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'sk-env';
  try {
    const bridge = make({});
    assert.equal(await bridge.getApiKey('deepseek'), 'sk-env');
  } finally {
    if (prev === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = prev;
  }
});

test('getApiKey: store tem prioridade sobre env', async () => {
  const prev = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'sk-env';
  try {
    const bridge = make({ deepseek: 'sk-store' });
    assert.equal(await bridge.getApiKey('deepseek'), 'sk-store');
  } finally {
    if (prev === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = prev;
  }
});

test('getApiKey: provider sem env retorna ""', async () => {
  const bridge = make({});
  assert.equal(await bridge.getApiKey('anthropic'), '');
});

test('getEnvVars: DeepSeek com chave → { DEEPSEEK_API_KEY: key }', async () => {
  const bridge = make({ deepseek: 'sk-x' });
  assert.deepEqual(await bridge.getEnvVars('deepseek'), { DEEPSEEK_API_KEY: 'sk-x' });
});

test('getEnvVars: sem chave → {}', async () => {
  const bridge = make({});
  assert.deepEqual(await bridge.getEnvVars('deepseek'), {});
});

test('getEnvVars: provider sem envvar → {}', async () => {
  const bridge = make({});
  assert.deepEqual(await bridge.getEnvVars('mistral'), {});
});

test('getConfiguredProviders: lista providers com chave (store + env)', async () => {
  const prev = process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  try {
    const bridge = make({ deepseek: 'sk-x' });
    assert.deepEqual(await bridge.getConfiguredProviders(), ['deepseek']);
  } finally {
    if (prev !== undefined) process.env.DEEPSEEK_API_KEY = prev;
  }
});

test('getConfiguredProviders: nenhum configurado → []', async () => {
  const prev = process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  try {
    const bridge = make({});
    assert.deepEqual(await bridge.getConfiguredProviders(), []);
  } finally {
    if (prev !== undefined) process.env.DEEPSEEK_API_KEY = prev;
  }
});

test('singleton reset existe (evita estado entre testes)', () => {
  __resetPiAuthBridgeSingleton();
  assert.ok(typeof __resetPiAuthBridgeSingleton === 'function');
});

test('getApiKey: provider "local" retorna "" sem consultar store nem env', async () => {
  const bridge = make({ deepseek: 'sk-x' });
  assert.equal(await bridge.getApiKey('local'), '');
});

test('getApiKey: store lanca exception → fallback silencioso para env', async () => {
  const prev = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'sk-fallback';
  try {
    const bridge = createPiAuthBridge({
      getStore: async () => {
        throw new Error('store exploded');
      },
    });
    assert.equal(await bridge.getApiKey('deepseek'), 'sk-fallback');
  } finally {
    if (prev === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = prev;
  }
});

test('getApiKey: store fallha mas sem env → ""', async () => {
  const prev = process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  try {
    const bridge = createPiAuthBridge({
      getStore: async () => {
        throw new Error('store exploded');
      },
    });
    assert.equal(await bridge.getApiKey('deepseek'), '');
  } finally {
    if (prev !== undefined) process.env.DEEPSEEK_API_KEY = prev;
  }
});

test('getConfiguredProviders: descobre provider configurado via env', async () => {
  const prev = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'sk-env-only';
  try {
    const bridge = make({});
    assert.deepEqual(await bridge.getConfiguredProviders(), ['deepseek']);
  } finally {
    if (prev === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = prev;
  }
});

test('getEnvVars: usa a chave de env quando o store está vazio', async () => {
  const prev = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'sk-env-vars';
  try {
    const bridge = make({});
    assert.deepEqual(await bridge.getEnvVars('deepseek'), { DEEPSEEK_API_KEY: 'sk-env-vars' });
  } finally {
    if (prev === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = prev;
  }
});