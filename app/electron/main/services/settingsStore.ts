/**
 * electron/main/services/settingsStore.ts — armazenamento persistente de settings.
 *
 * PREP de onda 1 (compartilhado): usado por apiKeyValidator/keys-handlers
 * (onda1-pi) e pelos handlers settings:* (onda1-scaffold). DI-friendly — o módulo
 * 'electron' é importado LAZY dentro de getSettingsStore(); os testes usam
 * createSettingsStore() com fakes e nunca tocam o runtime do Electron.
 *
 * Chaves de API ficam cifradas com safeStorage (isEncryptionAvailable) num
 * arquivo JSON sob userData; quando a criptografia não está disponível (Linux
 * sem keyring), cai para texto puro com a flag `encryption:false` registrada.
 */

import { promises as fsp } from 'node:fs';
import * as path from 'node:path';
import type { AppSettings } from '@shared/ipc-contract';

export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export interface SettingsStoreDeps {
  safeStorage: SafeStorageLike;
  userDataPath: string;
  /** nome do arquivo de settings (default 'settings.json') */
  fileName?: string;
  /** fetch lento de fs para testes */
  fs?: typeof fsp;
}

export interface SettingsShape {
  apiKeys: Record<string, string>;
  values: AppSettings & Record<string, unknown>;
  encryption: boolean;
}

const DEFAULT_SETTINGS: SettingsShape = {
  apiKeys: {},
  values: {},
  encryption: false,
};

export function createSettingsStore(deps: SettingsStoreDeps) {
  const fsImpl = deps.fs ?? fsp;
  const filePath = path.join(deps.userDataPath, deps.fileName ?? 'settings.json');

  async function ensureDir(): Promise<void> {
    await fsImpl.mkdir(deps.userDataPath, { recursive: true });
  }

  async function read(): Promise<SettingsShape> {
    try {
      const raw = await fsImpl.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<SettingsShape>;
      return {
        apiKeys: parsed.apiKeys ?? {},
        values: (parsed.values ?? {}) as SettingsShape['values'],
        encryption: parsed.encryption ?? false,
      };
    } catch {
      return { ...DEFAULT_SETTINGS, apiKeys: {}, values: {} };
    }
  }

  async function write(shape: SettingsShape): Promise<void> {
    await ensureDir();
    await fsImpl.writeFile(filePath, JSON.stringify(shape, null, 2), 'utf8');
  }

  return {
    /** Se a criptografia está disponível neste SO (decide encrypt/plain). */
    isEncryptionAvailable(): boolean {
      return deps.safeStorage.isEncryptionAvailable();
    },

    /** Guarda uma chave de API cifrada (ou pura quando sem keyring). */
    async setApiKey(provider: string, key: string): Promise<void> {
      if (!key) {
        await this.deleteApiKey(provider);
        return;
      }
      const shape = await read();
      if (deps.safeStorage.isEncryptionAvailable()) {
        shape.apiKeys[provider] = deps.safeStorage.encryptString(key).toString('base64');
        shape.encryption = true;
      } else {
        shape.apiKeys[provider] = key;
        shape.encryption = false;
      }
      await write(shape);
    },

    /** Lê e decifra uma chave de API (ou '' quando ausente). */
    async getApiKey(provider: string): Promise<string> {
      const shape = await read();
      const stored = shape.apiKeys[provider];
      if (!stored) return '';
      try {
        // A flag `encryption` gravada no arquivo decide o FORMATO da chave
        // (base64-cifrado vs texto puro). A disponibilidade ATUAL do safeStorage
        // pode divergir daquela de quando a chave foi gravada (ex.: keyring
        // travou no meio); usar só `shape.encryption` garante decodificar o que
        // de fato está no disco em vez de vazar o ciphertext como chave em claro.
        if (shape.encryption) {
          return deps.safeStorage.decryptString(Buffer.from(stored, 'base64'));
        }
        return stored;
      } catch {
        return '';
      }
    },

    async deleteApiKey(provider: string): Promise<void> {
      const shape = await read();
      delete shape.apiKeys[provider];
      await write(shape);
    },

    /** Providers com chave configurada hoje. */
    async getConfiguredProviders(): Promise<string[]> {
      const shape = await read();
      return Object.keys(shape.apiKeys).filter((k) => shape.apiKeys[k]);
    },

    async getValue<T>(key: string): Promise<T | undefined> {
      const shape = await read();
      return (shape.values as Record<string, unknown>)[key] as T | undefined;
    },

    async setValue(key: string, value: unknown): Promise<void> {
      const shape = await read();
      shape.values = { ...shape.values, [key]: value };
      await write(shape);
    },

    /** Caminho do arquivo de settings (para diagnóstico/README). */
    get filePath(): string {
      return filePath;
    },
  };
}

export type SettingsStore = ReturnType<typeof createSettingsStore>;

let _singleton: SettingsStore | null = null;

/** Singleton com electron real — import lazy; NUNCA chamado por testes. */
export async function getSettingsStore(): Promise<SettingsStore> {
  if (_singleton) return _singleton;
  const { app, safeStorage } = await import('electron');
  _singleton = createSettingsStore({
    safeStorage,
    userDataPath: app.getPath('userData'),
  });
  return _singleton;
}

export function __resetSettingsStoreSingleton(): void {
  _singleton = null;
}