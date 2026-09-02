/**
 * tests/startupState.test.ts — testes PUROS de src/gate/startupState.ts
 * (decidir fase do gate + flags online/local). Sem React, sem electron.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { StartupStatus } from '../shared/ipc-contract';
import { applyOfflineFlags, isBlockedForSetup } from '../src/gate/startupState';

function status(partial: Partial<StartupStatus> & Pick<StartupStatus, 'phase'>): StartupStatus {
  return {
    llm: { configured: false, valid: false },
    brave: { configured: false, valid: false },
    offline: false,
    checkedAt: '2026-08-23T00:00:00.000Z',
    ...partial,
  };
}

describe('applyOfflineFlags (regra offline → online false, local true)', () => {
  it('offline=true desliga online e mantém local ligado', () => {
    const flags = applyOfflineFlags(
      // Ambas as chaves configuradas mas falharam por rede.
      status({
        phase: 'offline',
        offline: true,
        llm: { configured: true, valid: false, error: 'Network error: x' },
        brave: { configured: true, valid: false, error: 'Network error: y' },
      }),
    );
    assert.equal(flags.canUseOnline, false);
    assert.equal(flags.canUseLocal, true);
  });

  it('ready → online e local ligados', () => {
    const flags = applyOfflineFlags(
      status({ phase: 'ready', llm: { configured: true, valid: true }, brave: { configured: true, valid: true } }),
    );
    assert.equal(flags.canUseOnline, true);
    assert.equal(flags.canUseLocal, true);
  });

  it('blocked (chave inválida) NÃO desliga online nos flags (blocked é resolvido pelo gate)', () => {
    const flags = applyOfflineFlags(
      status({ phase: 'blocked', llm: { configured: true, valid: false, error: 'Invalid API key' } }),
    );
    assert.equal(flags.canUseOnline, true, 'bloqueio por chave inválida não é flag online');
    assert.equal(flags.canUseLocal, true);
  });

  it('checking (ainda validando) mantém online e local', () => {
    const flags = applyOfflineFlags(status({ phase: 'checking' }));
    assert.deepEqual(flags, { canUseOnline: true, canUseLocal: true });
  });
});

describe('isBlockedForSetup (SetupView obrigatório — a fase é a fonte autoritativa)', () => {
  it('phase blocked → true', () => {
    assert.equal(isBlockedForSetup(status({ phase: 'blocked' })), true);
  });

  it('blocked com chave não-configurada (faltou configurar) → true', () => {
    assert.equal(
      isBlockedForSetup(status({ phase: 'blocked', llm: { configured: false, valid: false } })),
      true,
    );
    assert.equal(
      isBlockedForSetup(status({ phase: 'blocked', brave: { configured: false, valid: false } })),
      true,
    );
  });

  it('blocked com chave configurada mas inválida → true', () => {
    assert.equal(
      isBlockedForSetup(status({ phase: 'blocked', llm: { configured: true, valid: false } })),
      true,
    );
  });

  it('ready (ambas configuradas e válidas) → false (não bloqueia)', () => {
    assert.equal(
      isBlockedForSetup(
        status({ phase: 'ready', llm: { configured: true, valid: true }, brave: { configured: true, valid: true } }),
      ),
      false,
    );
  });

  it('offline → false (chaves configuradas só falharam por rede: app inicia com aviso, NÃO com setup)', () => {
    assert.equal(
      isBlockedForSetup(
        status({
          phase: 'offline',
          offline: true,
          llm: { configured: true, valid: false, error: 'Network error: x' },
          brave: { configured: true, valid: false, error: 'Network error: y' },
        }),
      ),
      false,
      'offline não é um bloqueio de setup: o app inicia com aviso',
    );
  });
});