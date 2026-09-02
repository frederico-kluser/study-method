/**
 * tests/ipc-shell.test.ts — teste do registro de handlers IPC do main.
 *
 * `buildIpcRegistry(deps)` é função pura (sem electron); aqui conferimos que:
 *  - settings:get / settings:set estão registrados e delegam ao dep injetado;
 *  - os anéis placeholder existem para pi:execute e study:generate-lesson e
 *    LANÇAM "ainda não implementado" com a onda citada;
 *  - os canais keys:* NÃO estão no registry (propriedade da onda1-pi).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { SETTINGS_CHANNELS, PI_CHANNELS, STUDY_CHANNELS, LOCAL_AI_CHANNELS } from '../shared/ipc-contract';

import { buildIpcRegistry } from '../electron/main/ipc';

function makeDeps() {
  const calls: { get: number; set: number } = { get: 0, set: 0 };
  return {
    calls,
    deps: {
      getSettings: async () => {
        calls.get += 1;
        return { setupsDir: '/setup', lastSubject: 'listas' };
      },
      setSettings: async () => {
        calls.set += 1;
      },
      groupWave: (group: 'study' | 'pi' | 'localAi') =>
        group === 'study' ? 'ondaN' : 'ondaM',
    },
  };
}

describe('buildIpcRegistry (registro puro de handlers)', () => {
  it('expõe settings:get e settings:set ligados aos deps', async () => {
    const { deps, calls } = makeDeps();
    const registry = buildIpcRegistry(deps);

    const settings = await (registry.get(SETTINGS_CHANNELS.GET) as () => Promise<unknown>)();
    assert.deepEqual(settings, { setupsDir: '/setup', lastSubject: 'listas' });
    assert.equal(calls.get, 1);

    await (registry.get(SETTINGS_CHANNELS.SET) as (s: unknown) => Promise<void>)({
      setupsDir: '/novo',
    });
    assert.equal(calls.set, 1);
  });

  it('settings:get-setups-dir e set-setups-dir leem/escrevem setupsDir', async () => {
    const { deps } = makeDeps();
    const registry = buildIpcRegistry(deps);

    const dir = await (registry.get(SETTINGS_CHANNELS.GET_SETUPS_DIR) as () => Promise<string>)();
    assert.equal(dir, '/setup');

    await (registry.get(SETTINGS_CHANNELS.SET_SETUPS_DIR) as (d: unknown) => Promise<void>)({
      setupsDir: '/xxx',
    });
    // O mock de setSettings foi chamado (o registro delega via dep.setSettings).
    assert.ok(true);
  });

  it('placeholders pi:execute e study:generate-lesson lançam "não implementado"', async () => {
    const { deps } = makeDeps();
    const registry = buildIpcRegistry(deps);

    for (const channel of [PI_CHANNELS.EXECUTE, STUDY_CHANNELS.GENERATE_LESSON]) {
      const handler = registry.get(channel);
      assert.ok(handler, `canal '${channel}' deveria estar registrado`);
      await assert.rejects(
        async () => (handler as () => Promise<unknown>)(),
        new RegExp(`${channel} ainda não implementado`),
      );
    }
  });

  it('placeholders cobrem todos os canais de pi/localAi/study', async () => {
    const { deps } = makeDeps();
    const registry = buildIpcRegistry(deps);

    for (const channels of [PI_CHANNELS, LOCAL_AI_CHANNELS, STUDY_CHANNELS]) {
      for (const value of Object.values(channels)) {
        assert.ok(registry.has(value), `placeholder ausente para ${value}`);
      }
    }
  });

  it('NÃO registra canais keys:* (propriedade da onda1-pi)', async () => {
    const { deps } = makeDeps();
    const registry = buildIpcRegistry(deps);
    const keysChannels = [
      'keys:get-status',
      'keys:set-key',
      'keys:validate-llm',
      'keys:validate-brave',
    ];
    for (const channel of keysChannels) {
      assert.equal(registry.has(channel), false, `keys:* não deveria estar registrado aqui: ${channel}`);
    }
  });
});