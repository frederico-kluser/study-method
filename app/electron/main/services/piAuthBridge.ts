/**
 * electron/main/services/piAuthBridge.ts — liga o armazenamento de chaves da
 * app (SettingsStore) ao sistema de auth do Pi SDK, com fallback para env.
 *
 * Não importa 'electron' diretamente: recebe um getter de SettingsStore
 * (DI-friendly). O singleton de runtime usa getSettingsStore() (lazy), de
 * forma que os testes injetam um store fake sem tocar no Electron.
 *
 * PROVIDER ATUAL: 'openrouter' (chave em OPENROUTER_API_KEY / slot 'openrouter').
 */

import type { SettingsStore } from './settingsStore';
import { getSettingsStore } from './settingsStore';
import {
  LEGACY_LLM_ENV_KEY,
  LEGACY_LLM_PROVIDER_KEY,
  OPENROUTER_ENV_KEY,
} from '@shared/llm/constants';
import { OPENROUTER_PI_PROVIDER } from '@shared/piAgent/constants';

export interface PiAuthBridgeDeps {
  /** Getter do SettingsStore (lazy). O singleton de runtime usa getSettingsStore. */
  getStore: () => Promise<SettingsStore>;
}

export interface PiAuthBridge {
  /**
   * Lê a chave do store; se ausente, faz fallback para a env var do provider.
   * Apenas 'openrouter' tem env definida hoje (OPENROUTER_API_KEY).
   */
  getApiKey(provider: string): Promise<string>;
  /** Env vars a injetar no processo para o provider (autorização do SDK). */
  getEnvVars(provider: string): Promise<Record<string, string>>;
  /** Providers com chave configurada (store OU env). */
  getConfiguredProviders(): Promise<string[]>;
}

/**
 * env var CANÔNICA por provider pi (só o que a app usa). É a var que
 * `getEnvVars` DEVOLVE — o fallback legado abaixo só serve para LER.
 */
const PROVIDER_ENV: Record<string, string> = {
  [OPENROUTER_PI_PROVIDER]: OPENROUTER_ENV_KEY,
};

/**
 * Onde o fallback de LEITURA legado se aplica: só ao provider 'openrouter' (é
 * ele que herdou a chave do provedor antigo). Os literais moram no contrato
 * (`@shared/llm/constants`), junto com a explicação de por que sobrevivem;
 * aqui eles só são LIDOS — a chave gravada e a env injetada são só as novas.
 */
const LEGACY_STORE_SLOTS: Record<string, readonly string[]> = {
  [OPENROUTER_PI_PROVIDER]: [LEGACY_LLM_PROVIDER_KEY],
};
const LEGACY_ENV_VARS: Record<string, readonly string[]> = {
  [OPENROUTER_PI_PROVIDER]: [LEGACY_LLM_ENV_KEY],
};

/** Slots do settingsStore a consultar, na ordem: o do provider e os legados. */
function storeSlotsFor(provider: string): string[] {
  return [provider, ...(LEGACY_STORE_SLOTS[provider] ?? [])];
}

/** Env vars a consultar, na ordem: a canônica do provider e as legadas. */
function envVarsFor(provider: string): string[] {
  const canonical = PROVIDER_ENV[provider];
  return [...(canonical ? [canonical] : []), ...(LEGACY_ENV_VARS[provider] ?? [])];
}

export function createPiAuthBridge(deps: PiAuthBridgeDeps): PiAuthBridge {
  async function getApiKey(provider: string): Promise<string> {
    if (provider === 'local') return '';
    try {
      const store = await deps.getStore();
      for (const slot of storeSlotsFor(provider)) {
        const stored = await store.getApiKey(slot);
        if (stored) return stored;
      }
    } catch (error) {
      console.warn(`[PiAuthBridge] Failed to read key from store for ${provider}:`, error);
    }
    for (const envVar of envVarsFor(provider)) {
      const fromEnv = process.env[envVar];
      if (fromEnv) return fromEnv;
    }
    return '';
  }

  async function getEnvVars(provider: string): Promise<Record<string, string>> {
    // Sempre devolvemos a var CANÔNICA (OPENROUTER_API_KEY), mesmo quando a
    // chave veio de um lugar legado: o SDK só conhece o nome novo.
    const envVar = PROVIDER_ENV[provider];
    if (!envVar) return {};
    const key = await getApiKey(provider);
    return key ? { [envVar]: key } : {};
  }

  async function getConfiguredProviders(): Promise<string[]> {
    const configured: string[] = [];
    for (const provider of Object.keys(PROVIDER_ENV)) {
      if (await getApiKey(provider)) configured.push(provider);
    }
    return configured;
  }

  return { getApiKey, getEnvVars, getConfiguredProviders };
}

let _singleton: PiAuthBridge | null = null;

/** Singleton de runtime com o SettingsStore real (lazy; não usado por testes). */
export async function getPiAuthBridge(): Promise<PiAuthBridge> {
  if (_singleton) return _singleton;
  _singleton = createPiAuthBridge({ getStore: getSettingsStore });
  return _singleton;
}

export function __resetPiAuthBridgeSingleton(): void {
  _singleton = null;
}
