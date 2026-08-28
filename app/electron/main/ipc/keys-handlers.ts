/**
 * electron/main/ipc/keys-handlers.ts — handlers IPC de chaves de API.
 *
 * Canais (contrato congelado em shared/ipc-contract.ts, KEYS_CHANNELS):
 * - keys:validate-deepseek → validateDeepseekKey; se uma `key` (string não
 *   vazia) for passada no invoke, valida ESSA chave (SEM salvá-la no store);
 *   caso contrário valida a chave do store. Grava settings values
 *   deepseekValidated/modelAvailable.
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
import { getSettingsStore } from '../services/settingsStore';
import type { DeepSeekValidationResult } from '../services/apiKeyValidator';
import { validateBraveKey, validateDeepseekKey } from '../services/apiKeyValidator';
import { safeHandleMap, type IpcMainHandleLike, type IpcHandlerFn } from './safeHandle';

export interface RegisterKeysHandlersDeps {
  /** Getter do SettingsStore (lazy/DI). Default: getSettingsStore(). */
  getStore?: () => Promise<SettingsStore>;
}

async function defaultGetStore(): Promise<SettingsStore> {
  return getSettingsStore();
}

/** Normaliza a ValidationResult para os campos gravados no store (boolean). */
function toBooleanFlag(result: ValidationResult): boolean {
  return result.isValid === true;
}

/**
 * Monta o mapa canal→handler dos canais keys:* (PURA, não toca electron).
 * `getStore` é injetado para DI nos testes. Comportamento preservado:
 * validate-* aceitam uma chave digitada no invoke (validada SEM salvar) e
 * os flags são gravados no store.
 */
export function buildKeysHandlers(getStore: () => Promise<SettingsStore>): Map<string, IpcHandlerFn> {
  const map: Map<string, IpcHandlerFn> = new Map();

  map.set(
    KEYS_CHANNELS.VALIDATE_DEEPSEEK,
    async (_event, key?: unknown): Promise<DeepSeekValidationResult> => {
      const store = await getStore();
      const apiKey =
        typeof key === 'string' && key.trim() !== ''
          ? key.trim() // chave digitada validada SEM salvar
          : await store.getApiKey('deepseek');
      const result = await validateDeepseekKey(apiKey);
      await store.setValue('deepseekValidated', toBooleanFlag(result));
      if (typeof result.modelAvailable === 'boolean') {
        await store.setValue('modelAvailable', result.modelAvailable);
      }
      return result;
    }
  );

  map.set(
    KEYS_CHANNELS.VALIDATE_BRAVE,
    async (_event, key?: unknown): Promise<ValidationResult> => {
      const store = await getStore();
      const apiKey =
        typeof key === 'string' && key.trim() !== ''
          ? key.trim() // chave digitada validada SEM salvar
          : await store.getApiKey('brave');
      const result = await validateBraveKey(apiKey);
      await store.setValue('braveValidated', toBooleanFlag(result));
      return result;
    }
  );

  map.set(KEYS_CHANNELS.GET_STATUS, async (): Promise<KeysStatus> => {
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

  map.set(
    KEYS_CHANNELS.SET_KEY,
    async (_event, provider: unknown, apiKey: unknown): Promise<{ ok: boolean }> => {
      const store = await getStore();
      // `provider` vem do invoke (string); `apiKey` pode ser undefined p/ apagar.
      await store.setApiKey(provider as string, (apiKey as string) ?? '');
      return { ok: true };
    }
  );

  return map;
}

export function registerKeysHandlers(deps: RegisterKeysHandlersDeps = {}): void {
  const getStore = deps.getStore ?? defaultGetStore;
  const map = buildKeysHandlers(getStore);

  // ipcMain importado LAZY (testes não importam electron).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ipcMain } = require('electron') as typeof import('electron');
  // safeHandleMap: idempotente (removeHandler antes de handle).
  safeHandleMap(ipcMain as IpcMainHandleLike, map);
}