/**
 * tests/main-wiring.test.ts — regressão do WIRING dos handlers IPC do bootstrap.
 *
 * buildMainSetup(deps) é a função PURA que o entry real usa em whenReady. A onda
 * 3-ui-wiring estendeu MainSetupDeps para 5 registradores (ipc→keys→localAi→pi→study);
 * aqui asseguramos que registerKeys continua registrado junto de registerIpc e
 * que a assinatura nova aceita os 5 dependências. A ORDEM COMPLETA dos 5 é
 * provada em tests/study-wiring.test.ts (item (a)).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildMainSetup, emitToAll } from '../electron/main/main-setup';
import { registerKeysHandlers } from '../electron/main/ipc/keys-handlers';

function makeDeps(called: string[]) {
  return {
    registerIpc: async () => {
      called.push('registerIpc');
    },
    registerKeys: () => {
      called.push('registerKeys');
    },
    registerLocalAi: async () => {
      called.push('registerLocalAi');
    },
    registerPi: async () => {
      called.push('registerPi');
    },
    registerStudy: async () => {
      called.push('registerStudy');
    },
  };
}

describe('buildMainSetup (wiring do bootstrap IPC)', () => {
  it('aceita os 5 dependências e chama registerKeys junto com registerIpc', async () => {
    const called: string[] = [];
    await buildMainSetup(makeDeps(called));

    // registerKeys é chamado logo após registerIpc (antes dos específicos).
    assert.ok(called.includes('registerIpc'));
    assert.ok(called.includes('registerKeys'));
    assert.equal(called[1], 'registerKeys', 'registerKeys deve vir em segundo lugar (após registerIpc)');
  });

  it('registerIpc resolve antes de registerKeys (espera registerIpc)', async () => {
    let entry: string = 'none';
    await buildMainSetup({
      registerIpc: async () => {
        entry = entry === 'keys' ? 'ipc-depois-de-keys' : 'ipc';
      },
      registerKeys: () => {
        entry = entry === 'ipc' ? 'keys-apos-ipc' : 'keys-antes-ipc';
      },
      registerLocalAi: async () => {},
      registerPi: async () => {},
      registerStudy: async () => {},
    });
    assert.equal(entry, 'keys-apos-ipc');
  });

  it('registerKeysHandlers continua uma função exportada (âncora do módulo real)', () => {
    assert.equal(typeof registerKeysHandlers, 'function');
  });
});

describe('emitToAll', () => {
  it('envia o evento quando o webContents está vivo', () => {
    const sent: string[] = [];
    const wc = { isDestroyed: () => false, send: (c: string, ...a: unknown[]) => sent.push(`${c}:${JSON.stringify(a)}`) };
    emitToAll(wc, 'study:lesson-progress', { phase: 'research' });
    assert.equal(sent.length, 1);
    assert.equal(sent[0], 'study:lesson-progress:[{"phase":"research"}]');
  });

  it('não envia quando webContents é undefined ou destruído', () => {
    const sent: string[] = [];
    emitToAll(undefined, 'x', 'v');
    assert.equal(sent.length, 0);

    const dead = { isDestroyed: () => true, send: (c: string, ...a: unknown[]) => sent.push(c) };
    emitToAll(dead, 'x', 'v');
    assert.equal(sent.length, 0);
  });
});