/**
 * electron/main/ipc/localTts-handlers.ts — handlers IPC do TTS local (Piper via
 * binário externo).
 *
 * Canais (onda 8): `localTts:list`, `localTts:download` (com progresso por
 * PUSH `localTts:download-progress`), `localTts:cancel-download`,
 * `localTts:delete`, `localTts:generate`, `localTts:cancel-generate`,
 * `localTts:get-preference`, `localTts:set-preference`.
 *
 * Envelope `{ success, data?, error? }` em todos os handlers. `generate`
 * devolve `{ audioBase64, format:'wav', sampleRate }` para o renderer montar
 * num `<audio>`.
 *
 * @module electron/main/ipc/localTts-handlers
 */

import type {
  TtsDownloadProgressPayload,
  TtsGenerateRequest,
  TtsGenerateResult,
  TtsModelInfo,
  LocalTtsPreference,
} from '@shared/ipc-contract';
import { TTS_CHANNELS } from '@shared/ipc-contract';
import {
  getCatalogWithStatus,
  downloadModel,
  cancelDownload,
  deleteModel,
} from '../services/localTts/ttsModelStore';
import { pocketTts } from '../services/localTts/PocketTtsService';
import { safeHandleMap, type IpcMainHandleLike, type IpcHandlerFn } from './safeHandle';
import type { SettingsStore } from '../services/settingsStore';
import { getSettingsStore } from '../services/settingsStore';

export interface TtsIpcResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

const ok = <T>(data: T): TtsIpcResult<T> => ({ success: true, data });
const fail = (error: unknown): TtsIpcResult<never> => {
  const message = error instanceof Error ? error.message : String(error);
  return { success: false, error: message };
};

/** Chave do settingsStore onde a preferência do TTS local é persistida. */
const TTS_PREFERENCE_KEY = 'localTtsPreference';

/** Getter default do SettingsStore (lazy/DI). Nunca chamado pelos testes. */
async function defaultGetStore(): Promise<SettingsStore> {
  return getSettingsStore();
}

/** Push `localTts:download-progress` (throttled) para todas as janelas. */
let broadcastFn: ((p: TtsDownloadProgressPayload) => void) | null = null;

function toModelId(raw: unknown): string | null {
  if (typeof raw === 'string' && raw.length >= 1 && raw.length <= 128) return raw;
  return null;
}

/** Test seam: injeta o broadcaster (estrutura fica fora do teste). */
export function __setTtsBroadcast(fn: ((p: TtsDownloadProgressPayload) => void) | null): void {
  broadcastFn = fn;
}

/** Compõe o status do catálogo + installado para a UI. */
async function toTtsModelInfo(): Promise<TtsModelInfo[]> {
  const catalog = await getCatalogWithStatus();
  return catalog.map((entry) => ({
    id: entry.id,
    language: entry.language,
    label: entry.label,
    embedded: entry.embedded,
    installed: entry.installed,
    sampleRate: entry.sampleRate,
    totalSizeBytes: entry.totalSizeBytes,
  }));
}

function broadcastTtsProgress(payload: TtsDownloadProgressPayload): void {
  if (broadcastFn) {
    broadcastFn(payload);
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { BrowserWindow } = require('electron') as typeof import('electron');
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(TTS_CHANNELS.DOWNLOAD_PROGRESS, payload);
    }
  } catch {
    /* no renderer yet */
  }
}

/**
 * Monta o mapa canal→handler do TTS local (PURA, testável sem electron).
 * `generate` injetável para DI nos testes (engines fake).
 */
export function buildLocalTtsHandlers(deps: {
  generate?: typeof pocketTts.generate;
  cancel?: typeof pocketTts.cancel;
  /** Getter do SettingsStore (lazy/DI). Default: getSettingsStore(). */
  getStore?: () => Promise<SettingsStore>;
} = {}): Map<string, IpcHandlerFn> {
  const map: Map<string, IpcHandlerFn> = new Map();
  const generate = deps.generate ?? pocketTts.generate.bind(pocketTts);
  const cancel = deps.cancel ?? pocketTts.cancel.bind(pocketTts);
  const getStore = deps.getStore ?? defaultGetStore;

  map.set(TTS_CHANNELS.LIST, async (): Promise<TtsIpcResult<TtsModelInfo[]>> => {
    try {
      return ok(await toTtsModelInfo());
    } catch (error) {
      return fail(error);
    }
  });

  map.set(
    TTS_CHANNELS.DOWNLOAD,
    async (_event, modelId: unknown): Promise<TtsIpcResult<{ modelId: string }>> => {
      const id = toModelId(modelId);
      if (!id) return fail(new Error('LOCAL_TTS_MODEL_INVALID_ID'));
      try {
        await downloadModel(id, (p) => {
          broadcastTtsProgress({
            modelId: p.modelId,
            progress: p.pct,
            downloadedBytes: p.downloaded,
            totalBytes: p.total,
          });
        });
        return ok({ modelId: id });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.startsWith('DOWNLOAD_CANCELLED')) {
          return fail(new Error('LOCAL_TTS_DOWNLOAD_CANCELLED'));
        }
        return fail(error);
      }
    },
  );

  map.set(
    TTS_CHANNELS.CANCEL_DOWNLOAD,
    async (_event, modelId: unknown): Promise<TtsIpcResult<{ cancelled: boolean }>> => {
      const id = toModelId(modelId);
      if (!id) return fail(new Error('LOCAL_TTS_MODEL_INVALID_ID'));
      try {
        const cancelled = cancelDownload(id);
        return ok({ cancelled });
      } catch (error) {
        return fail(error);
      }
    },
  );

  map.set(
    TTS_CHANNELS.DELETE,
    async (_event, modelId: unknown): Promise<TtsIpcResult<{ deleted: boolean }>> => {
      const id = toModelId(modelId);
      if (!id) return fail(new Error('LOCAL_TTS_MODEL_INVALID_ID'));
      try {
        await deleteModel(id);
        return ok({ deleted: true });
      } catch (error) {
        return fail(error);
      }
    },
  );

  map.set(
    TTS_CHANNELS.GENERATE,
    async (_event, rawReq: unknown): Promise<TtsIpcResult<TtsGenerateResult>> => {
      const req = (rawReq ?? {}) as Partial<TtsGenerateRequest>;
      if (!req.requestId || !req.modelId || !req.text) {
        return fail(new Error('LOCAL_TTS_INVALID_REQUEST'));
      }
      if (req.provider && req.provider !== 'local') {
        return fail(new Error(`LOCAL_TTS_UNSUPPORTED_PROVIDER:${req.provider}`));
      }
      try {
        const res = await generate({
          requestId: req.requestId,
          modelId: req.modelId,
          text: req.text,
          sid: 0,
          speed: req.speed,
        });
        return ok({
          audioBase64: res.wavBase64,
          format: 'wav',
          sampleRate: res.sampleRate,
        });
      } catch (error) {
        return fail(error);
      }
    },
  );

  map.set(
    TTS_CHANNELS.CANCEL_GENERATE,
    async (_event, requestId: unknown): Promise<TtsIpcResult<void>> => {
      if (typeof requestId === 'string') {
        cancel(requestId);
      }
      return ok(undefined);
    },
  );

  map.set(
    TTS_CHANNELS.GET_PREFERENCE,
    async (): Promise<TtsIpcResult<LocalTtsPreference>> => {
      try {
        const store = await getStore();
        const pref = await store.getValue<LocalTtsPreference>(TTS_PREFERENCE_KEY);
        return ok(pref ?? {});
      } catch (error) {
        return fail(error);
      }
    },
  );

  map.set(
    TTS_CHANNELS.SET_PREFERENCE,
    async (_event, raw: unknown): Promise<TtsIpcResult<void>> => {
      const pref = (raw ?? {}) as Partial<LocalTtsPreference>;
      try {
        const store = await getStore();
        const current: LocalTtsPreference =
          (await store.getValue<LocalTtsPreference>(TTS_PREFERENCE_KEY)) ?? {};
        const next: LocalTtsPreference = { ...current };
        if (pref.modelId !== undefined && typeof pref.modelId === 'string') {
          next.modelId = pref.modelId;
        }
        if (pref.defaultVoiceId !== undefined && typeof pref.defaultVoiceId === 'string') {
          next.defaultVoiceId = pref.defaultVoiceId;
        }
        if (pref.speed !== undefined && typeof pref.speed === 'number') {
          next.speed = pref.speed;
        }
        await store.setValue(TTS_PREFERENCE_KEY, next);
        return ok(undefined);
      } catch (error) {
        return fail(error);
      }
    },
  );

  return map;
}

/**
 * Registra os handlers no ipcMain real (lazy) via safeHandle. Chamado pelo
 * bootstrap do main (index.ts).
 */
export function registerLocalTtsHandlers(deps: {
  generate?: typeof pocketTts.generate;
  cancel?: typeof pocketTts.cancel;
  getStore?: () => Promise<SettingsStore>;
} = {}): void {
  const map = buildLocalTtsHandlers(deps);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ipcMain } = require('electron') as typeof import('electron');
  safeHandleMap(ipcMain as IpcMainHandleLike, map);
}