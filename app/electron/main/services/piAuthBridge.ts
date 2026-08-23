/**
 * electron/main/services/piAuthBridge.ts — liga o armazenamento de chaves da
 * app (SettingsStore) ao sistema de auth do Pi SDK, com fallback para env.
 *
 * Não importa 'electron' diretamente: recebe um getter de SettingsStore
 * (DI-friendly). O singleton de runtime usa getSettingsStore() (lazy), de
 * forma que os testes injetam um store fake sem tocar no Electron.
 */

import type { SettingsStore } from './settingsStore';
import { DEEPSEEK_ENV_KEY, DEEPSEEK_PI_PROVIDER } from '@shared/piAgent/constants';

export interface PiAuthBridgeDeps {
  /** Getter do SettingsStore (lazy). O singleton de runtime usa getSettingsStore. */
  getStore: () => Promise<SettingsStore>;
}

export interface PiAuthBridge {
  /**
   * Lê a chave do store; se ausente, faz fallback para a env var do provider.
   * Apenas 'deepseek' tem env definida hoje (DEEPSEEK_API_KEY).
   */
  getApiKey(provider: string): Promise<string>;
  /** Env vars a injetar no processo para o provider (autorização do SDK). */
  getEnvVars(provider: string): Promise<Record<string, string>>;
  /** Providers com chave configurada (store OU env). */
  getConfiguredProviders(): Promise<string[]>;
}

/** env var por provider pi (só o que a app usa). */
const PROVIDER_ENV: Record<string, string> = {
  [DEEPSEEK_PI_PROVIDER]: DEEPSEEK_ENV_KEY,
};

export function createPiAuthBridge(deps: PiAuthBridgeDeps): PiAuthBridge {
  async function getApiKey(provider: string): Promise<string> {
    if (provider === 'local') return '';
    try {
      const store = await deps.getStore();
      const stored = await store.getApiKey(provider);
      if (stored) return stored;
    } catch (error) {
      console.warn(`[PiAuthBridge] Failed to read key from store for ${provider}:`, error);
    }
    const envVar = PROVIDER_ENV[provider];
    if (envVar) return process.env[envVar] || '';
    return '';
  }

  async function getEnvVars(provider: string): Promise<Record<string, string>> {
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
  const { getSettingsStore } = await import('./settingsStore');
  _singleton = createPiAuthBridge({ getStore: getSettingsStore });
  return _singleton;
}

export function __resetPiAuthBridgeSingleton(): void {
  _singleton = null;
}