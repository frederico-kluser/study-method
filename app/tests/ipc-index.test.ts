/**
 * tests/ipc-index.test.ts — funções puras exportadas por electron/main/ipc/index.ts
 * além do buildIpcRegistry (já coberto por ipc-shell.test.ts).
 *
 * Cobre: makeNotImplementedHandler, registerNotYetImplemented, readAppSettings e
 * writeAppSettings — todas DI-friendly, sem tocar electron. As funções que usam
 * electron de verdade (registerIpcHandlers, defaultGroupWave, storeToSettingsDeps)
 * não são testáveis fora do runtime e ficam documentadas no handoff.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  makeNotImplementedHandler,
  readAppSettings,
  registerNotYetImplemented,
  writeAppSettings,
} from '../electron/main/ipc';
import type { IpcRegistry } from '../electron/main/ipc';
import type { SettingsStore } from '../electron/main/services/settingsStore';

test('makeNotImplementedHandler lança "ainda não implementado" com o canal e a onda', async () => {
  const handler = makeNotImplementedHandler('pi:execute', 'onda 5');
  await assert.rejects(
    async () => (handler as () => Promise<unknown>)(),
    /pi:execute ainda não implementado — chega na onda 5/,
  );
});

test('registerNotYetImplemented registra o placeholder no registry', async () => {
  const registry: IpcRegistry = new Map();
  registerNotYetImplemented(registry, 'study:get-setups', 'onda de estudo');
  assert.equal(registry.size, 1);
  const handler = registry.get('study:get-setups')!;
  await assert.rejects(async () => (handler as () => Promise<unknown>)(), /onda de estudo/);
});

/** Store fake com mapa de valores, para readAppSettings/writeAppSettings. */
function makeStore(initial: Record<string, unknown> = {}): SettingsStore & {
  writes: Array<[string, unknown]>;
} {
  const values: Record<string, unknown> = { ...initial };
  const writes: Array<[string, unknown]> = [];
  return {
    writes,
    getValue: async <T>(key: string) => values[key] as T | undefined,
    setValue: async (key: string, value: unknown) => {
      writes.push([key, value]);
      values[key] = value;
    },
  } as unknown as SettingsStore & { writes: Array<[string, unknown]> };
}

test('readAppSettings: lê apenas as chaves definidas no store', async () => {
  const store = makeStore({
    setupsDir: '/setups',
    lastSubject: 'listas',
    defaultModelProvider: 'deepseek',
    defaultModelId: 'deepseek-v4-flash',
    // chaves fora do subconjunto AppSettings são ignoradas
    someOtherValue: 'x',
  });
  const settings = await readAppSettings(store);
  assert.deepEqual(settings, {
    setupsDir: '/setups',
    lastSubject: 'listas',
    defaultModelProvider: 'deepseek',
    defaultModelId: 'deepseek-v4-flash',
  });
});

test('readAppSettings: chaves ausentes ficam fora do resultado', async () => {
  const store = makeStore({
    setupsDir: '/setups',
  });
  const settings = await readAppSettings(store);
  assert.deepEqual(settings, { setupsDir: '/setups' });
  assert.equal('lastSubject' in settings, false);
});

test('readAppSettings: store vazio → objeto vazio', async () => {
  const settings = await readAppSettings(makeStore());
  assert.deepEqual(settings, {});
});

test('writeAppSettings: persiste somente as chaves definidas', async () => {
  const store = makeStore();
  await writeAppSettings(store, {
    setupsDir: '/a',
    defaultModelProvider: 'local',
  });
  assert.deepEqual(store.writes, [
    ['setupsDir', '/a'],
    ['defaultModelProvider', 'local'],
  ]);
});

test('writeAppSettings: escreve todas as 4 chaves quando definidas', async () => {
  const store = makeStore();
  await writeAppSettings(store, {
    setupsDir: '1',
    lastSubject: '2',
    defaultModelProvider: 'deepseek',
    defaultModelId: '3',
  });
  assert.deepEqual(store.writes, [
    ['setupsDir', '1'],
    ['lastSubject', '2'],
    ['defaultModelProvider', 'deepseek'],
    ['defaultModelId', '3'],
  ]);
});

test('writeAppSettings: {} não grava nada', async () => {
  const store = makeStore();
  await writeAppSettings(store, {});
  assert.deepEqual(store.writes, []);
});

// ─── ADAÇÃO ONDA 6 (i18n): persistência do idioma via settings ───────────────

test('readAppSettings: lê a chave language quando o store a tem', async () => {
  const store = makeStore({ language: 'en' });
  const settings = await readAppSettings(store);
  assert.equal(settings.language, 'en');
});

test('writeAppSettings: persiste language quando definida', async () => {
  const store = makeStore();
  await writeAppSettings(store, { language: 'en' });
  assert.deepEqual(store.writes, [['language', 'en']]);
});

test('round-trip: settings:set({language}) → settings:get devolve language (persistência do i18n)', async () => {
  // Espelha o caminho real do LanguageSwitcher: setValue → getValue num mesmo store.
  const store = makeStore();
  await writeAppSettings(store, { language: 'en' });
  const persisted = await readAppSettings(store);
  assert.equal(persisted.language, 'en');

  // Parcial / outras chaves não sobrescrevem language já salva.
  await writeAppSettings(store, { lastSubject: 'listas' });
  const after = await readAppSettings(store);
  assert.equal(after.language, 'en');
  assert.equal(after.lastSubject, 'listas');
});