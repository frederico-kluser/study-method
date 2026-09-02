/**
 * tests/startup-contract.test.ts — contrato do canal keys:startup-status.
 *
 * Verifica a propagação PRELOAD-AUTOMÁTICA no padrão existente de
 * tests/ipc-contract.test.ts: como o preload deriva keys de API_GROUPS
 * (=KEYS_CHANNELS), adicionar STARTUP_STATUS ao contrato expõe
 * `window.api.keys.startupStatus` sem editar o preload manualmente; e o
 * handler main devolve EXATAMENTE a forma StartupStatus (shape).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { KEYS_CHANNELS, type StartupStatus } from '../shared/ipc-contract';
import { createExposedApi } from '../electron/preload/api-schema';
import { buildStartupHandlers } from '../electron/main/ipc/startup-handlers';
import type {
  DeepSeekValidationResult,
  BraveValidationResult,
} from '../electron/main/services/apiKeyValidator';
import type { IpcBridgeLike } from '../electron/preload/api-schema';
import type { SettingsStore } from '../electron/main/services/settingsStore';

type ApiKeys = Record<'openrouter' | 'brave', string>;
function fakeStore(initial: Partial<ApiKeys> = {}): SettingsStore {
  const keys: ApiKeys = { openrouter: '', brave: '', ...initial };
  return { getApiKey: async (p: string) => keys[p as keyof ApiKeys] ?? '' } as unknown as SettingsStore;
}

const CHK = '2026-08-23T00:00:00.000Z';
function vd(isValid: true): DeepSeekValidationResult;
function vd(isValid: false, errorMessage: string): DeepSeekValidationResult;
function vd(isValid: boolean, errorMessage?: string): DeepSeekValidationResult {
  // `provider` do resultado já é o do OpenRouter; o CAMPO `deepseek` do
  // StartupStatus é que continua com o nome legado (contrato até a ONDA 2).
  return { isValid, provider: 'openrouter', checkedAt: CHK, ...(errorMessage ? { errorMessage } : {}) };
}
function vb(isValid: true): BraveValidationResult;
function vb(isValid: false, errorMessage: string): BraveValidationResult;
function vb(isValid: boolean, errorMessage?: string): BraveValidationResult {
  return { isValid, provider: 'brave', checkedAt: CHK, ...(errorMessage ? { errorMessage } : {}) };
}

/** Canal que o preload deve passar ao transporte para startupStatus. */
function channelReached(bridge: { invoked: string[] }): boolean {
  return bridge.invoked.includes(KEYS_CHANNELS.STARTUP_STATUS);
}

describe('contrato keys:startup-status', () => {
  it('preload expõe keys.startupStatus e delega ao channel keys:startup-status', async () => {
    const invoked: string[] = [];
    const bridge: IpcBridgeLike = {
      invoke: async (channel: string) => {
        invoked.push(channel);
        return {
          phase: 'ready',
          deepseek: { configured: true, valid: true },
          brave: { configured: true, valid: true },
          offline: false,
          checkedAt: '2026-08-23T00:00:00.000Z',
        };
      },
      on: () => () => {},
    };
    const api = createExposedApi(bridge);
    const startupStatus = (api.keys as unknown as { startupStatus(): Promise<StartupStatus> }).startupStatus;
    assert.equal(typeof startupStatus, 'function', 'keys.startupStatus deveria existir (deriva de KEYS_CHANNELS)');

    const res = await startupStatus();
    assert.equal(channelReached({ invoked }), true, 'keys:startup-status deve chegar ao transporte');
    assert.equal(res.phase, 'ready');
    assert.equal(res.deepseek.valid, true);
  });

  it('buildStartupHandlers devolve a forma StartupStatus EXATA (shape)', async () => {
    const handlers = buildStartupHandlers({
      getStore: async () => fakeStore({ openrouter: 'sk-or-v1-d', brave: 'bk' }),
      validateDeepseek: async () => vd(true),
      validateBrave: async () => vb(false, 'Invalid API key'),
      timeoutMs: 0,
    });
    const status = await handlers.get(KEYS_CHANNELS.STARTUP_STATUS)!(undefined);

    assert.equal(typeof status, 'object');
    const s = status as StartupStatus;
    // phase ∈ vocabulary
    assert.ok(['checking', 'ready', 'blocked', 'offline'].includes(s.phase), s.phase);
    assert.equal(s.phase, 'blocked');
    // offline é booleano, checkedAt string ISO
    assert.equal(typeof s.offline, 'boolean');
    assert.equal(typeof s.checkedAt, 'string');
    // shape por provedor
    assert.equal(typeof s.deepseek.configured, 'boolean');
    assert.equal(typeof s.deepseek.valid, 'boolean');
    assert.equal(s.deepseek.valid, true);
    assert.equal(s.brave.configured, true);
    assert.equal(s.brave.valid, false);
    assert.equal(s.brave.error, 'Invalid API key');
  });
});