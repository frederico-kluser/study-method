/**
 * electron/main/ipc/keys-handlers.ts — handlers IPC de chaves de API.
 *
 * Canais (contrato congelado em shared/ipc-contract.ts, KEYS_CHANNELS):
 * - keys:validate-llm → validateLlmKey (hoje bate no OpenRouter, ver
 *   services/apiKeyValidator.ts); se uma `key` (string não vazia) for passada
 *   no invoke, valida ESSA chave (SEM salvá-la no store); caso contrário valida
 *   a chave do store. Grava settings values llmValidated/modelAvailable.
 * - keys:validate-brave     → validateBraveKey idem (braveValidated).
 * - keys:get-status          → lê o store e monta um KeysStatus.
 * - keys:set-key             → grava a chave no store.
 *
 * ─── SLOT DA CHAVE DO LLM: LEITURA COM FALLBACK LEGADO ───────────────────────
 * A regra, aplicada aqui e em startup-handlers/index.ts pelos helpers
 * `readLlmApiKey`/`writeLlmApiKey`:
 *   LER   → slot canônico `'openrouter'`; se vier VAZIO, cai no slot legado
 *           gravado por versões anteriores do app;
 *   GRAVAR→ SEMPRE no slot canônico `'openrouter'`, e o slot legado é APAGADO
 *           no mesmo passo. Apagar o legado é o que faz a migração terminar e o
 *           que impede que "apagar a chave" ressuscite a antiga pelo fallback.
 * O renderer manda `'openrouter'` — não há mais apelido de entrada.
 *
 * `electron` (ipcMain) é importado LAZY dentro do register para os testes não
 * tocarem o runtime do Electron. O index da onda1-scaffold chama
 * registerKeysHandlers() — ver handoff.
 */

import type { KeysStatus, ValidationResult } from '@shared/ipc-contract';
import { KEYS_CHANNELS } from '@shared/ipc-contract';
import { LEGACY_LLM_PROVIDER_KEY, OPENROUTER_PROVIDER_KEY } from '@shared/llm/constants';
import type { SettingsStore } from '../services/settingsStore';
import { getSettingsStore } from '../services/settingsStore';
import type { LlmValidationResult } from '../services/apiKeyValidator';
import { validateBraveKey, validateLlmKey } from '../services/apiKeyValidator';
import { safeHandleMap, type IpcMainHandleLike, type IpcHandlerFn } from './safeHandle';

/**
 * Reexport do slot LEGADO do settingsStore (o literal mora no contrato, em
 * `@shared/llm/constants`, junto com a explicação de por que ele sobrevive).
 * Aqui ele é LIDO como fallback (`readLlmApiKey`) e APAGADO na escrita
 * (`writeLlmApiKey`) — nunca gravado.
 */
export { LEGACY_LLM_PROVIDER_KEY };

/** Nomes que o renderer pode mandar em `keys:set-key` para a chave do LLM. */
export function isLlmProviderName(provider: string): boolean {
  return provider === OPENROUTER_PROVIDER_KEY;
}

/**
 * Lê a chave do LLM: slot canônico (`openrouter`) e, se vazio, o slot legado.
 * É o único jeito de ler a chave do LLM no main. Ver LEGACY_LLM_PROVIDER_KEY
 * para o porquê de o fallback continuar existindo.
 */
export async function readLlmApiKey(store: Pick<SettingsStore, 'getApiKey'>): Promise<string> {
  const current = await store.getApiKey(OPENROUTER_PROVIDER_KEY);
  if (current && current.trim() !== '') return current;
  return store.getApiKey(LEGACY_LLM_PROVIDER_KEY);
}

/**
 * Grava a chave do LLM SEMPRE no slot novo e apaga o legado (setApiKey com ''
 * remove a entrada). Chave vazia ⇒ os DOIS slots ficam limpos.
 */
export async function writeLlmApiKey(
  store: Pick<SettingsStore, 'setApiKey'>,
  apiKey: string,
): Promise<void> {
  await store.setApiKey(OPENROUTER_PROVIDER_KEY, apiKey);
  await store.setApiKey(LEGACY_LLM_PROVIDER_KEY, '');
}

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
    KEYS_CHANNELS.VALIDATE_LLM,
    async (_event, key?: unknown): Promise<LlmValidationResult> => {
      const store = await getStore();
      const apiKey =
        typeof key === 'string' && key.trim() !== ''
          ? key.trim() // chave digitada validada SEM salvar
          : await readLlmApiKey(store); // openrouter → fallback do slot legado
      const result = await validateLlmKey(apiKey);
      await store.setValue('llmValidated', toBooleanFlag(result));
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
    const [llmKey, braveKey] = await Promise.all([readLlmApiKey(store), store.getApiKey('brave')]);
    const [llmValidated, braveValidated] = await Promise.all([
      store.getValue<boolean>('llmValidated'),
      store.getValue<boolean>('braveValidated'),
    ]);
    return {
      llmConfigured: !!llmKey,
      braveConfigured: !!braveKey,
      llmValidated: llmValidated === true,
      braveValidated: braveValidated === true,
    };
  });

  map.set(
    KEYS_CHANNELS.SET_KEY,
    async (_event, provider: unknown, apiKey: unknown): Promise<{ ok: boolean }> => {
      const store = await getStore();
      // `provider` vem do invoke (string); `apiKey` pode ser undefined p/ apagar.
      const name = String(provider ?? '');
      const value = (apiKey as string) ?? '';
      if (isLlmProviderName(name)) {
        // Grava no slot canônico; o slot legado é apagado no mesmo passo.
        await writeLlmApiKey(store, value);
      } else {
        await store.setApiKey(name, value);
      }
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
