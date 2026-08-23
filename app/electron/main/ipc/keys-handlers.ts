/**
 * electron/main/ipc/keys-handlers.ts — handlers IPC de chaves de API.
 *
 * Canais (contrato congelado em shared/ipc-contract.ts, KEYS_CHANNELS):
 * - keys:validate-deepseek → validateDeepseekKey com a chave do store; grava
 *   settings values deepseekValidated/modelAvailable.
 * - keys:validate-brave     → validateBraveKey idem (braveValidated).
 * - keys:get-status          → lê o store e monta um KeysStatus.
 * - keys:set-key             → grava a chave no store.
 *
 * `electron` (ipcMain) é importado LAZY dentro do register para os testes não
 * tocarem o runtime do Electron. O index da onda1-scaffold chama
 * registerKeysHandlers() — ver handoff.
 */

import type { KeysStatus, ValidationResult } from '@shared/ipc-contract';
import { KEYS_CHANNELS } from '@shared/ipc-contract';
import type { SettingsStore } from '../services/settingsStore';
import type { DeepSeekValidationResult } from '../services/apiKeyValidator';
import { validateBraveKey, validateDeepseekKey } from '../services/apiKeyValidator';

export interface RegisterKeysHandlersDeps {
  /** Getter do SettingsStore (lazy/DI). Default: getSettingsStore(). */
  getStore?: () => Promise<SettingsStore>;
}

async function defaultGetStore(): Promise<SettingsStore> {
  const { getSettingsStore } = await import('../services/settingsStore');
  return getSettingsStore();
}

/** Normaliza a ValidationResult para os campos gravados no store (boolean). */
function toBooleanFlag(result: ValidationResult): boolean {
  return result.isValid === true;
}

export function registerKeysHandlers(deps: RegisterKeysHandlersDeps = {}): void {
  const getStore = deps.getStore ?? defaultGetStore;

  // ipcMain importado LAZY (testes não importam electron).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ipcMain } = require('electron') as typeof import('electron');

  ipcMain.handle(KEYS_CHANNELS.VALIDATE_DEEPSEEK, async (): Promise<DeepSeekValidationResult> => {
    const store = await getStore();
    const apiKey = await store.getApiKey('deepseek');
    const result = await validateDeepseekKey(apiKey);
    await store.setValue('deepseekValidated', toBooleanFlag(result));
    if (typeof result.modelAvailable === 'boolean') {
      await store.setValue('modelAvailable', result.modelAvailable);
    }
    return result;
  });

  ipcMain.handle(KEYS_CHANNELS.VALIDATE_BRAVE, async (): Promise<ValidationResult> => {
    const store = await getStore();
    const apiKey = await store.getApiKey('brave');
    const result = await validateBraveKey(apiKey);
    await store.setValue('braveValidated', toBooleanFlag(result));
    return result;
  });

  ipcMain.handle(KEYS_CHANNELS.GET_STATUS, async (): Promise<KeysStatus> => {
    const store = await getStore();
    const [deepseekKey, braveKey] = await Promise.all([
      store.getApiKey('deepseek'),
      store.getApiKey('brave'),
    ]);
    const [deepseekValidated, braveValidated] = await Promise.all([
      store.getValue<boolean>('deepseekValidated'),
      store.getValue<boolean>('braveValidated'),
    ]);
    return {
      deepseekConfigured: !!deepseekKey,
      braveConfigured: !!braveKey,
      deepseekValidated: deepseekValidated === true,
      braveValidated: braveValidated === true,
    };
  });

  ipcMain.handle(
    KEYS_CHANNELS.SET_KEY,
    async (_event, provider: string, apiKey: string): Promise<{ ok: boolean }> => {
      const store = await getStore();
      await store.setApiKey(provider, apiKey ?? '');
      return { ok: true };
    }
  );
}