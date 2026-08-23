/**
 * tests/main-wiring.test.ts — regressão do WIRING dos handlers IPC do bootstrap.
 *
 * BLOCK integrado (onda reunida): registerKeysHandlers() (keys:* da onda 1)
 * NUNCA era chamado — main/index.ts só registrava registerIpcHandlers() e o
 * renderer recebia "No handler registered" em window.api.keys.*.
 *
 * buildMainSetup(deps) é a função PURA que o entry real usa em whenReady para
 * ligar registerIpc + registerKeys. Aqui provamos, sem bootar Electron:
 *  1. buildMainSetup chama registerKeys JUNTO de registerIpc (fake que registra
 *     quais callbacks rodaram), e na ordem esperada (registerIpc → registerKeys);
 *  2. (âncora no módulo real) registerKeysHandlers continua uma função exportada.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildMainSetup } from '../electron/main/main-setup';
import { registerKeysHandlers } from '../electron/main/ipc/keys-handlers';

function makeFakes() {
  const called: string[] = [];
  return {
    called,
    deps: {
      registerIpc: async () => {
        called.push('registerIpc');
      },
      registerKeys: () => {
        called.push('registerKeys');
      },
    },
  };
}

describe('buildMainSetup (wiring do bootstrap IPC)', () => {
  it('chama registerKeys junto com registerIpc', async () => {
    const { called, deps } = makeFakes();
    await buildMainSetup(deps);

    assert.deepEqual(called, ['registerIpc', 'registerKeys']);
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
    });
    assert.equal(entry, 'keys-apos-ipc');
  });

  it('registerKeysHandlers continua uma função exportada (âncora do módulo real)', () => {
    assert.equal(typeof registerKeysHandlers, 'function');
  });
});