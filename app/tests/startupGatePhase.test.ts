/**
 * tests/startupGatePhase.test.ts — a DECISÃO de fase do gate de início e a
 * regra "as chaves carregadas já são inválidas?" (state/view split das views
 * de gate — STORY-SPEC §5).
 *
 * `resolveGatePhase` (src/gate/startupState.ts) é a máquina que o AppGateView
 * desenha: distingue o TIMEOUT do canal (nunca resolveu) da rejeição imediata,
 * o splash do setup obrigatório, e o OFFLINE (app entra com aviso) do liberado.
 * `loadedKeysInvalid` (também em src/gate/startupState.ts) decide a mensagem por ESTADO
 * do SetupView (W1: `gate.invalidKeys` só depois de veredito negativo — ou de
 * chaves que o gate JÁ trouxe inválidas).
 *
 * Reprodução: `bash tools/t.sh tests/startupGatePhase.test.ts`
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveGatePhase,
  applyOfflineFlags,
  isBlockedForSetup,
  loadedKeysInvalid,
} from '../src/gate/startupState';
import type { StartupStatus } from '@shared/ipc-contract';

const checkedAt = '2026-01-05T10:00:00.000Z';

function status(phase: StartupStatus['phase'], offline = false): StartupStatus {
  return {
    phase,
    llm: { configured: true, valid: true },
    brave: { configured: true, valid: true },
    offline,
    checkedAt,
  };
}

describe('resolveGatePhase (gate/startupState)', () => {
  it('timeout do canal é distinto da rejeição — cada um com a sua mensagem', () => {
    assert.equal(resolveGatePhase(null, 'timeout'), 'error-timeout');
    assert.equal(resolveGatePhase(null, 'rejected'), 'error-rejected');
    // Um erro de leitura ganha SEMPRE ao veredito (não se desenha conteúdo).
    assert.equal(resolveGatePhase(status('ready'), 'timeout'), 'error-timeout');
  });

  it('sem veredito (ou ainda a validar) → splash', () => {
    assert.equal(resolveGatePhase(null, null), 'splash');
    assert.equal(resolveGatePhase(status('checking'), null), 'splash');
  });

  it('blocked → setup obrigatório; offline → app com aviso; ready → livre', () => {
    assert.equal(resolveGatePhase(status('blocked'), null), 'setup');
    assert.equal(resolveGatePhase(status('offline', true), null), 'offline');
    assert.equal(resolveGatePhase(status('ready'), null), 'ready');
  });

  it('os flags de capacidade seguem o OFFLINE, não a fase', () => {
    assert.deepEqual(applyOfflineFlags(status('offline', true)), {
      canUseOnline: false,
      canUseLocal: true,
    });
    assert.deepEqual(applyOfflineFlags(status('ready')), {
      canUseOnline: true,
      canUseLocal: true,
    });
  });

  it('só o blocked exige setup (offline inicia com aviso, nunca com formulário)', () => {
    assert.equal(isBlockedForSetup(status('blocked')), true);
    assert.equal(isBlockedForSetup(status('offline', true)), false);
    assert.equal(isBlockedForSetup(status('ready')), false);
  });
});

describe('loadedKeysInvalid (gate/startupState)', () => {
  it('sem status → nada de inválido detetado (o convite é o texto)', () => {
    assert.equal(loadedKeysInvalid(null), false);
    assert.equal(loadedKeysInvalid(undefined), false);
  });

  it('chave CONFIGURADA e não validada é inválida (W1: mensagem por estado)', () => {
    const s: StartupStatus = {
      phase: 'blocked',
      llm: { configured: true, valid: false, error: 'HTTP 401' },
      brave: { configured: true, valid: true },
      offline: false,
      checkedAt,
    };
    assert.equal(loadedKeysInvalid(s), true);
  });

  it('chave simplesmente AUSENTE não é "inválida" — é falta de configuração', () => {
    const s: StartupStatus = {
      phase: 'blocked',
      llm: { configured: true, valid: true },
      brave: { configured: false, valid: false },
      offline: false,
      checkedAt,
    };
    assert.equal(loadedKeysInvalid(s), false);
  });
});
