/**
 * tests/settingsStore.test.ts — testa createSettingsStore com fakes do
 * safeStorage e de filesystem (nunca toca o runtime do Electron).
 *
 * Cobre: roundtrip cifrado (encryption:true), fallback texto puro
 * (encryption:false), delete, getConfiguredProviders e persistência entre
 * instâncias (leitura do arquivo JSON no disco, na mesma userDataPath).
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createSettingsStore } from '../electron/main/services/settingsStore';
import type { SafeStorageLike } from '../electron/main/services/settingsStore';
import { mkTempDir, rmrf, readFile, fileExists } from './_helpers/fs';

/** SafeStorage fake determinístico: base64(<prefix>:<plain>), reversível. */
function makeSafeStorage(encrypted: boolean): SafeStorageLike {
  return {
    isEncryptionAvailable: () => encrypted,
    encryptString: (plain: string) => Buffer.from(`enc:${plain}`, 'utf8'),
    decryptString: (buf: Buffer) => {
      const s = buf.toString('utf8');
      if (!s.startsWith('enc:')) throw new Error('não cifrado');
      return s.slice(4);
    },
  };
}

describe('createSettingsStore', () => {
  let dir = '';

  before(async () => {
    dir = await mkTempDir();
  });
  after(async () => {
    await rmrf(dir);
  });

  it('roundtrip cifrado quando isEncryptionAvailable() = true', async () => {
    const safe = makeSafeStorage(true);
    const store = createSettingsStore({ safeStorage: safe, userDataPath: dir });
    await store.setApiKey('deepseek', 'sk-test-123');
    assert.equal(await store.getApiKey('deepseek'), 'sk-test-123');
    // No disco a chave deve estar CIFRADA (nunca o valor em claro).
    const parsed = JSON.parse(await readFile(`${dir}/settings.json`));
    assert.equal(parsed.encryption, true);
    assert.ok(parsed.apiKeys.deepseek && parsed.apiKeys.deepseek !== 'sk-test-123');
    assert.equal(
      safe.decryptString(Buffer.from(parsed.apiKeys.deepseek, 'base64')),
      'sk-test-123',
      'base64 no arquivo deveria decifrar de volta para a chave',
    );
    assert.ok(store.isEncryptionAvailable());
  });

  it('fallback texto puro com encryption:false quando não há keyring', async () => {
    const store = createSettingsStore({ safeStorage: makeSafeStorage(false), userDataPath: dir });
    await store.setApiKey('brave', 'brave-key-plain');
    assert.equal(await store.getApiKey('brave'), 'brave-key-plain');
    const parsed = JSON.parse(await readFile(`${dir}/settings.json`));
    assert.equal(parsed.encryption, false);
    assert.equal(parsed.apiKeys.brave, 'brave-key-plain');
  });

  it('persistência entre instâncias (mesma userDataPath)', async () => {
    await createSettingsStore({
      safeStorage: makeSafeStorage(true),
      userDataPath: dir,
    }).setApiKey('deepseek', 'sk-persist');

    const reloaded = createSettingsStore({
      safeStorage: makeSafeStorage(true),
      userDataPath: dir,
    });
    assert.equal(await reloaded.getApiKey('deepseek'), 'sk-persist');
  });

  it('deleteApiKey remove a chave do provider', async () => {
    const store = createSettingsStore({ safeStorage: makeSafeStorage(true), userDataPath: dir });
    await store.setApiKey('brave', 'to-delete');
    await store.deleteApiKey('brave');
    assert.equal(await store.getApiKey('brave'), '');
    const parsed = JSON.parse(await readFile(`${dir}/settings.json`));
    assert.equal(parsed.apiKeys.brave, undefined);
  });

  it('getConfiguredProviders lista só providers com chave', async () => {
    const store = createSettingsStore({ safeStorage: makeSafeStorage(false), userDataPath: dir });
    await store.setApiKey('deepseek', 'a');
    await store.setApiKey('brave', 'b');
    await store.deleteApiKey('deepseek');
    const providers = await store.getConfiguredProviders();
    assert.deepEqual(providers, ['brave']);
  });

  it('arquivo não existente devolve settings default vazias, sem erro', async () => {
    const store = createSettingsStore({
      safeStorage: makeSafeStorage(true),
      userDataPath: `${dir}/vazio-inexistente`,
    });
    assert.equal(await store.getApiKey('deepseek'), '');
    assert.deepEqual(await store.getConfiguredProviders(), []);
    assert.equal(await fileExists(`${dir}/vazio-inexistente/settings.json`), false);
  });
});