/**
 * tests/piAuthBridge.test.ts — DI do PiAuthBridge: settingsStore fake + fallback env.
 *
 * Provider atual: 'openrouter' (slot 'openrouter' / OPENROUTER_API_KEY). O slot
 * 'deepseek' e a env DEEPSEEK_API_KEY são fallbacks TRANSITÓRIOS de leitura,
 * para quem já tinha a chave configurada antes da migração; a ONDA 2 os remove.
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

/**
 * Roda `fn` com as DUAS envs de chave sob controle (a nova e a legada).
 * `null` = ausente. Restaura sempre, mesmo em falha.
 */
async function withEnv(
  vars: { OPENROUTER_API_KEY?: string | null; DEEPSEEK_API_KEY?: string | null },
  fn: () => Promise<void>,
): Promise<void> {
  const names = ['OPENROUTER_API_KEY', 'DEEPSEEK_API_KEY'] as const;
  const previous = names.map((n) => [n, process.env[n]] as const);
  try {
    for (const name of names) {
      const value = vars[name];
      if (value === undefined || value === null) delete process.env[name];
      else process.env[name] = value;
    }
    await fn();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test('getApiKey: lê do slot "openrouter" do store quando há chave', async () => {
  await withEnv({}, async () => {
    const bridge = make({ openrouter: 'sk-or-store' });
    assert.equal(await bridge.getApiKey('openrouter'), 'sk-or-store');
  });
});

test('getApiKey: fallback para OPENROUTER_API_KEY quando o store está vazio', async () => {
  await withEnv({ OPENROUTER_API_KEY: 'sk-or-env' }, async () => {
    const bridge = make({});
    assert.equal(await bridge.getApiKey('openrouter'), 'sk-or-env');
  });
});

test('getApiKey: store tem prioridade sobre env', async () => {
  await withEnv({ OPENROUTER_API_KEY: 'sk-or-env' }, async () => {
    const bridge = make({ openrouter: 'sk-or-store' });
    assert.equal(await bridge.getApiKey('openrouter'), 'sk-or-store');
  });
});

test('getApiKey: FALLBACK LEGADO — slot "deepseek" do store atende o provider openrouter', async () => {
  await withEnv({}, async () => {
    const bridge = make({ deepseek: 'sk-legacy-store' });
    assert.equal(await bridge.getApiKey('openrouter'), 'sk-legacy-store');
  });
});

test('getApiKey: o slot "openrouter" vence o slot legado "deepseek"', async () => {
  await withEnv({}, async () => {
    const bridge = make({ openrouter: 'sk-novo', deepseek: 'sk-legacy' });
    assert.equal(await bridge.getApiKey('openrouter'), 'sk-novo');
  });
});

test('getApiKey: FALLBACK LEGADO — DEEPSEEK_API_KEY atende o provider openrouter', async () => {
  await withEnv({ DEEPSEEK_API_KEY: 'sk-legacy-env' }, async () => {
    const bridge = make({});
    assert.equal(await bridge.getApiKey('openrouter'), 'sk-legacy-env');
  });
});

test('getApiKey: OPENROUTER_API_KEY vence a env legada DEEPSEEK_API_KEY', async () => {
  await withEnv({ OPENROUTER_API_KEY: 'sk-or-env', DEEPSEEK_API_KEY: 'sk-legacy-env' }, async () => {
    const bridge = make({});
    assert.equal(await bridge.getApiKey('openrouter'), 'sk-or-env');
  });
});

test('getApiKey: qualquer slot do store vence qualquer env', async () => {
  await withEnv({ OPENROUTER_API_KEY: 'sk-or-env', DEEPSEEK_API_KEY: 'sk-legacy-env' }, async () => {
    const bridge = make({ deepseek: 'sk-legacy-store' });
    assert.equal(await bridge.getApiKey('openrouter'), 'sk-legacy-store');
  });
});

test('getApiKey: provider sem env retorna ""', async () => {
  await withEnv({ OPENROUTER_API_KEY: 'sk-or-env', DEEPSEEK_API_KEY: 'sk-legacy-env' }, async () => {
    const bridge = make({});
    assert.equal(await bridge.getApiKey('anthropic'), '');
  });
});

test('getEnvVars: OpenRouter com chave → { OPENROUTER_API_KEY: key }', async () => {
  await withEnv({}, async () => {
    const bridge = make({ openrouter: 'sk-x' });
    assert.deepEqual(await bridge.getEnvVars('openrouter'), { OPENROUTER_API_KEY: 'sk-x' });
  });
});

test('getEnvVars: injeta SEMPRE o nome novo, mesmo com a chave vinda do lugar legado', async () => {
  // O SDK só conhece OPENROUTER_API_KEY: o nome antigo não pode voltar ao fluxo.
  await withEnv({ DEEPSEEK_API_KEY: 'sk-legacy-env' }, async () => {
    const bridge = make({ deepseek: 'sk-legacy-store' });
    assert.deepEqual(await bridge.getEnvVars('openrouter'), { OPENROUTER_API_KEY: 'sk-legacy-store' });
  });
  await withEnv({ DEEPSEEK_API_KEY: 'sk-legacy-env' }, async () => {
    const bridge = make({});
    assert.deepEqual(await bridge.getEnvVars('openrouter'), { OPENROUTER_API_KEY: 'sk-legacy-env' });
  });
});

test('getEnvVars: sem chave → {}', async () => {
  await withEnv({}, async () => {
    const bridge = make({});
    assert.deepEqual(await bridge.getEnvVars('openrouter'), {});
  });
});

test('getEnvVars: provider sem envvar → {}', async () => {
  await withEnv({ OPENROUTER_API_KEY: 'sk-x' }, async () => {
    const bridge = make({});
    assert.deepEqual(await bridge.getEnvVars('mistral'), {});
    assert.deepEqual(await bridge.getEnvVars('deepseek'), {});
  });
});

test('getConfiguredProviders: lista providers com chave (store + env)', async () => {
  await withEnv({}, async () => {
    const bridge = make({ openrouter: 'sk-x' });
    assert.deepEqual(await bridge.getConfiguredProviders(), ['openrouter']);
  });
});

test('getConfiguredProviders: nenhum configurado → []', async () => {
  await withEnv({}, async () => {
    const bridge = make({});
    assert.deepEqual(await bridge.getConfiguredProviders(), []);
  });
});

test('getConfiguredProviders: descobre provider configurado via env', async () => {
  await withEnv({ OPENROUTER_API_KEY: 'sk-env-only' }, async () => {
    const bridge = make({});
    assert.deepEqual(await bridge.getConfiguredProviders(), ['openrouter']);
  });
});

test('getConfiguredProviders: a chave legada ainda configura o provider openrouter', async () => {
  await withEnv({ DEEPSEEK_API_KEY: 'sk-legacy-env' }, async () => {
    const bridge = make({});
    assert.deepEqual(await bridge.getConfiguredProviders(), ['openrouter']);
  });
});

test('singleton reset existe (evita estado entre testes)', () => {
  __resetPiAuthBridgeSingleton();
  assert.ok(typeof __resetPiAuthBridgeSingleton === 'function');
});

test('getApiKey: provider "local" retorna "" sem consultar store nem env', async () => {
  await withEnv({ OPENROUTER_API_KEY: 'sk-x' }, async () => {
    const bridge = make({ local: 'sk-x', openrouter: 'sk-x' });
    assert.equal(await bridge.getApiKey('local'), '');
  });
});

test('getApiKey: store lanca exception → fallback silencioso para env', async () => {
  await withEnv({ OPENROUTER_API_KEY: 'sk-fallback' }, async () => {
    const bridge = createPiAuthBridge({
      getStore: async () => {
        throw new Error('store exploded');
      },
    });
    assert.equal(await bridge.getApiKey('openrouter'), 'sk-fallback');
  });
});

test('getApiKey: store falha mas sem env → ""', async () => {
  await withEnv({}, async () => {
    const bridge = createPiAuthBridge({
      getStore: async () => {
        throw new Error('store exploded');
      },
    });
    assert.equal(await bridge.getApiKey('openrouter'), '');
  });
});

test('getEnvVars: usa a chave de env quando o store está vazio', async () => {
  await withEnv({ OPENROUTER_API_KEY: 'sk-env-vars' }, async () => {
    const bridge = make({});
    assert.deepEqual(await bridge.getEnvVars('openrouter'), { OPENROUTER_API_KEY: 'sk-env-vars' });
  });
});
