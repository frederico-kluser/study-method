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
import { mkTempDir, rmrf, readFile, fileExists, writeFile } from './_helpers/fs';

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
    await store.setApiKey('openrouter', 'sk-test-123');
    assert.equal(await store.getApiKey('openrouter'), 'sk-test-123');
    // No disco a chave deve estar CIFRADA (nunca o valor em claro).
    const parsed = JSON.parse(await readFile(`${dir}/settings.json`));
    assert.equal(parsed.encryption, true);
    assert.ok(parsed.apiKeys.openrouter && parsed.apiKeys.openrouter !== 'sk-test-123');
    assert.equal(
      safe.decryptString(Buffer.from(parsed.apiKeys.openrouter, 'base64')),
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
    }).setApiKey('openrouter', 'sk-persist');

    const reloaded = createSettingsStore({
      safeStorage: makeSafeStorage(true),
      userDataPath: dir,
    });
    assert.equal(await reloaded.getApiKey('openrouter'), 'sk-persist');
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
    await store.setApiKey('openrouter', 'a');
    await store.setApiKey('brave', 'b');
    await store.deleteApiKey('openrouter');
    const providers = await store.getConfiguredProviders();
    assert.deepEqual(providers, ['brave']);
  });

  it('arquivo não existente devolve settings default vazias, sem erro', async () => {
    const store = createSettingsStore({
      safeStorage: makeSafeStorage(true),
      userDataPath: `${dir}/vazio-inexistente`,
    });
    assert.equal(await store.getApiKey('openrouter'), '');
    assert.deepEqual(await store.getConfiguredProviders(), []);
    assert.equal(await fileExists(`${dir}/vazio-inexistente/settings.json`), false);
  });

  it('setApiKey com chave vazia APAGA a chave existente do provider', async () => {
    await createSettingsStore({
      safeStorage: makeSafeStorage(false),
      userDataPath: dir,
      fileName: 'empty-del.json',
    }).setApiKey('openrouter', 'sk-to-delete');
    const store = createSettingsStore({
      safeStorage: makeSafeStorage(false),
      userDataPath: dir,
      fileName: 'empty-del.json',
    });
    await store.setApiKey('openrouter', '');
    assert.equal(await store.getApiKey('openrouter'), '');
    assert.deepEqual(await store.getConfiguredProviders(), []);
    const parsed = JSON.parse(await readFile(`${dir}/empty-del.json`));
    assert.equal(parsed.apiKeys.openrouter, undefined);
  });

  it('setValue/getValue: roundtrip e persistência entre instâncias', async () => {
    const store = createSettingsStore({
      safeStorage: makeSafeStorage(false),
      userDataPath: dir,
      fileName: 'values.json',
    });
    await store.setValue('lastSubject', 'listas encadeadas');
    await store.setValue('defaultModelProvider', 'local');
    assert.equal(await store.getValue<string>('lastSubject'), 'listas encadeadas');
    assert.equal(await store.getValue<string>('defaultModelProvider'), 'local');
    assert.equal(await store.getValue<string>('anything-not-set'), undefined);

    const reloaded = createSettingsStore({
      safeStorage: makeSafeStorage(false),
      userDataPath: dir,
      fileName: 'values.json',
    });
    assert.equal(await reloaded.getValue<string>('lastSubject'), 'listas encadeadas');
    assert.equal(await reloaded.getValue<string>('defaultModelProvider'), 'local');
  });

  it('setValue sobrescreve valor anterior do mesmo key', async () => {
    const store = createSettingsStore({
      safeStorage: makeSafeStorage(false),
      userDataPath: dir,
      fileName: 'overwrite.json',
    });
    await store.setValue('setupsDir', '/primeiro');
    await store.setValue('setupsDir', '/segundo');
    assert.equal(await store.getValue<string>('setupsDir'), '/segundo');
  });

  it('getApiKey devolve "" quando a decifração falha (dado corrompido)', async () => {
    const brokenStorage: SafeStorageLike = {
      isEncryptionAvailable: () => true,
      encryptString: () => Buffer.from('not-encrypted', 'utf8'),
      decryptString: () => {
        throw new Error('Bad encryption');
      },
    };
    const store = createSettingsStore({
      safeStorage: brokenStorage,
      userDataPath: dir,
      fileName: 'broken.json',
    });
    await store.setApiKey('openrouter', 'sk-teste');
    assert.equal(await store.getApiKey('openrouter'), '');
  });

  it('getConfiguredProviders ignora chaves vazias do json', async () => {
    await createSettingsStore({
      safeStorage: makeSafeStorage(false),
      userDataPath: dir,
      fileName: 'mixed.json',
    }).setApiKey('brave', 'real-key');
    await writeFile(
      `${dir}/mixed.json`,
      JSON.stringify({ apiKeys: { brave: '', openrouter: 'ok-key' }, values: {}, encryption: false }),
    );
    const store = createSettingsStore({
      safeStorage: makeSafeStorage(false),
      userDataPath: dir,
      fileName: 'mixed.json',
    });
    assert.deepEqual(await store.getConfiguredProviders(), ['openrouter']);
  });

  it('fileName custom é usado no caminho do arquivo', async () => {
    const store = createSettingsStore({
      safeStorage: makeSafeStorage(true),
      userDataPath: dir,
      fileName: 'custom-config.json',
    });
    assert.ok(store.filePath.endsWith('custom-config.json'));
    await store.setApiKey('openrouter', 'sk-custom');
    assert.equal(await fileExists(`${dir}/custom-config.json`), true);
  });
});