/**
 * tests/settingsStore-encryption-flip.test.ts — regressão do bug no getApiKey:
 * o predicado de decodificação usava a disponibilidade ATUAL do safeStorage
 * junto da flag `encryption`. Se a chave foi gravada CIFRADA (encryption:true)
 * e a disponibilidade cair depois (ex.: keyring trava), o branch antigo virava
 * `false && true` → caía em `return stored` e devolvia o CIPHERTEXT base64 como
 * se fosse a chave em claro.
 *
 * O formato de uma chave é decidido APENAS pela flag `encryption` gravada no
 * arquivo; a disponibilidade atual não muda o que está no disco.
 *
 * Cobre:
 *   (a) roundtrip cifrado normal (disponível=true e depois disponível=true);
 *   (b) flip de disponibilidade: grava com disponível=true, depois lê com uma
 *       SEGUNDA instância na MESMA userDataPath com safeStorage
 *       isEncryptionAvailable()=false — getApiKey DEVE decodificar porque
 *       shape.encryption === true;
 *   (c) texto puro com encryption:false continua funcionando (sem cifra).
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createSettingsStore } from '../electron/main/services/settingsStore';
import type { SafeStorageLike } from '../electron/main/services/settingsStore';
import { mkTempDir, rmrf, readFile } from './_helpers/fs';

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

describe('createSettingsStore — flip de disponibilidade do safeStorage', () => {
  let dir = '';

  before(async () => {
    dir = await mkTempDir();
  });
  after(async () => {
    await rmrf(dir);
  });

  it('(a) roundtrip cifrado normal (disponível=true)', async () => {
    const store = createSettingsStore({ safeStorage: makeSafeStorage(true), userDataPath: dir });
    await store.setApiKey('openrouter', 'sk-flip-123');
    assert.equal(await store.getApiKey('openrouter'), 'sk-flip-123');

    const parsed = JSON.parse(await readFile(`${dir}/settings.json`));
    assert.equal(parsed.encryption, true);
    assert.ok(parsed.apiKeys.openrouter && parsed.apiKeys.openrouter !== 'sk-flip-123');
  });

  it('(b) escreve cifrado com disponível=true, lê decifrado mesmo com disponível=false', async () => {
    await createSettingsStore({
      safeStorage: makeSafeStorage(true), // disponível AO GRAVAR
      userDataPath: dir,
    }).setApiKey('openrouter', 'sk-flip-secret');

    // Segunda instância, MESMA userDataPath, mas safeStorage agora INDISPONÍVEL.
    // Na ramificação, precisa ser capaz de decifrar o que a instância anterior gravou.
    const unavailable = createSettingsStore({
      safeStorage: makeSafeStorage(false), // disponibilidade caiu entre write e read
      userDataPath: dir,
    });
    assert.equal(await unavailable.getApiKey('openrouter'), 'sk-flip-secret');
  });

  it('(c) texto puro com encryption:false continua funcionando (sem cifra)', async () => {
    const store = createSettingsStore({ safeStorage: makeSafeStorage(false), userDataPath: dir });
    await store.setApiKey('brave', 'brave-flip-plain');
    assert.equal(await store.getApiKey('brave'), 'brave-flip-plain');

    const parsed = JSON.parse(await readFile(`${dir}/settings.json`));
    assert.equal(parsed.encryption, false);
    assert.equal(parsed.apiKeys.brave, 'brave-flip-plain');
  });
});