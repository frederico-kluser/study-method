/**
 * electron/main/ipc/stt-model-handlers.ts — handlers IPC do modelo de STT local.
 *
 * Copiado de quiet-que (electron/main/ipc/stt-model-handlers.ts) e ADAPTADO ao
 * study-method: sem ponteiro cloud, sem o boot auto-download (o modelo viaja
 * EMBUTIDO nesta onda — ver `sttLocalService`), envelope `{ success, data?,
 * error? }`, e o registrador segue a convenção do app
 * (`buildSttModelHandlers` PURA + `registerSttModelHandlers` via safeHandle).
 *
 * Canais: `stt:model-status` (PULL), `stt:model-download` (com progresso por
 * PUSH `stt:model-download-progress`), `stt:model-cancel`, `stt:model-delete`
 * e `stt:engine-status` (PUSH do status do utility process).
 *
 * SEMÂNTICA DO INVOKE DE DOWNLOAD: `stt:model-download` FICA PENDENTE até o
 * download terminar. Desfecho: instalado → `data` com `state:'installed'`;
 * cancelado → `error:'LOCAL_STT_DOWNLOAD_CANCELLED'`; falhou →
 * `LOCAL_STT_DOWNLOAD_FAILED:<detalhe>`. IDEMPOTENTE.
 *
 * @module electron/main/ipc/stt-model-handlers
 */

import type { SttModelProgressPayload, SttModelStatus } from '@shared/ipc-contract';
import { STT_CHANNELS } from '@shared/ipc-contract';
import { getLocalSttStore } from '../services/localStt/sttLocalService';
import { asrProxy } from '../services/localStt/AsrProxyService';
import { safeHandleMap, type IpcMainHandleLike, type IpcHandlerFn } from './safeHandle';

export interface SttIpcResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

const ok = <T>(data: T): SttIpcResult<T> => ({ success: true, data });
const fail = (error: unknown): SttIpcResult<never> => {
  const message = error instanceof Error ? error.message : String(error);
  return { success: false, error: message };
};

/** Push `stt:model-download-progress` (throttled) para todas as janelas. */
let broadcastFn: ((payload: SttModelProgressPayload) => void) | null = null;

/** Id do modelo do catálogo local. */
const ModelIdSchema = (raw: unknown): string | null => {
  if (typeof raw === 'string' && raw.length >= 1 && raw.length <= 128) return raw;
  return null;
};

/** Estado em voo por modelo — o PULL compõe 'downloading' a partir daqui. */
const inFlight = new Map<string, SttModelProgressPayload>();

/** Frequência máxima dos pushes de progresso. */
const PROGRESS_PUSH_INTERVAL_MS = 150;
const lastBroadcast = new Map<string, number>();

function modelStatusFromEntry(entry: {
  id: string;
  totalSizeBytes: number;
  installed: boolean;
  embedded: boolean;
}): SttModelStatus {
  const inflight = inFlight.get(entry.id);
  if (inflight) {
    return {
      modelId: entry.id,
      state: 'downloading',
      embedded: false,
      downloadedBytes: inflight.downloadedBytes,
      totalBytes: inflight.totalBytes,
      progress: inflight.progress,
    };
  }
  if (entry.installed) {
    return {
      modelId: entry.id,
      state: 'installed',
      embedded: entry.embedded,
      downloadedBytes: entry.totalSizeBytes,
      totalBytes: entry.totalSizeBytes,
      progress: 1,
    };
  }
  return {
    modelId: entry.id,
    state: 'absent',
    embedded: false,
    downloadedBytes: 0,
    totalBytes: entry.totalSizeBytes,
    progress: 0,
  };
}

async function catalogStatusList(): Promise<SttModelStatus[]> {
  const store = getLocalSttStore();
  const catalog = await store.getCatalogWithStatus();
  return catalog.map((entry) => modelStatusFromEntry(entry));
}

async function modelStatusById(modelId: string): Promise<SttModelStatus | null> {
  const store = getLocalSttStore();
  const catalog = await store.getCatalogWithStatus();
  const entry = catalog.find((m) => m.id === modelId);
  return entry ? modelStatusFromEntry(entry) : null;
}

async function downloadLocalSttModel(modelId: string): Promise<SttModelStatus> {
  const store = getLocalSttStore();
  if (inFlight.has(modelId)) {
    const status = await modelStatusById(modelId);
    return (
      status ?? {
        modelId,
        state: 'absent',
        embedded: false,
        downloadedBytes: 0,
        totalBytes: 0,
        progress: 0,
      }
    );
  }

  const catalog = await store.getCatalogWithStatus();
  const entry = catalog.find((m) => m.id === modelId);
  if (!entry) throw new Error('LOCAL_STT_MODEL_NOT_FOUND');
  if (entry.installed) return modelStatusFromEntry(entry);

  inFlight.set(modelId, {
    modelId,
    progress: 0,
    downloadedBytes: 0,
    totalBytes: entry.totalSizeBytes,
  });

  try {
    await store.downloadModel(modelId, (p) => {
      const payload: SttModelProgressPayload = {
        modelId: p.modelId,
        progress: p.pct,
        downloadedBytes: p.downloaded,
        totalBytes: p.total,
      };
      inFlight.set(modelId, payload);
      broadcastSttModelProgress(payload);
    });
    const fresh = await store.getCatalogWithStatus();
    const freshEntry = fresh.find((m) => m.id === modelId);
    inFlight.delete(modelId);
    const done: SttModelProgressPayload = {
      modelId,
      progress: 1,
      downloadedBytes: entry.totalSizeBytes,
      totalBytes: entry.totalSizeBytes,
    };
    broadcastSttModelProgress(done);
    return modelStatusFromEntry(freshEntry ?? { ...entry, installed: true });
  } catch (error) {
    inFlight.delete(modelId);
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith('DOWNLOAD_CANCELLED')) {
      throw new Error('LOCAL_STT_DOWNLOAD_CANCELLED');
    }
    throw new Error(`LOCAL_STT_DOWNLOAD_FAILED: ${message}`);
  }
}

/** Push `stt:model-download-progress` (throttled) para todas as janelas. */
export function broadcastSttModelProgress(payload: SttModelProgressPayload): void {
  if (broadcastFn) {
    broadcastFn(payload);
    return;
  }
  const now = Date.now();
  const last = lastBroadcast.get(payload.modelId) ?? 0;
  if (payload.progress < 1 && now - last < PROGRESS_PUSH_INTERVAL_MS) return;
  lastBroadcast.set(payload.modelId, now);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { BrowserWindow } = require('electron') as typeof import('electron');
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(STT_CHANNELS.MODEL_DOWNLOAD_PROGRESS, payload);
    }
  } catch {
    /* no renderer yet */
  }
}

/** Test seam: injeta o broadcaster (estrutura fica fora do teste). */
export function __setSttModelBroadcast(fn: ((p: SttModelProgressPayload) => void) | null): void {
  broadcastFn = fn;
}

/**
 * Monta o mapa canal→handler dos canais de modelo de STT (PURA, testável sem
 * electron). `getStore` é injetável para DI nos testes.
 */
export function buildSttModelHandlers(
  getStore: () => ReturnType<typeof getLocalSttStore> = getLocalSttStore,
): Map<string, IpcHandlerFn> {
  const map: Map<string, IpcHandlerFn> = new Map();

  map.set(STT_CHANNELS.MODEL_STATUS, async (): Promise<SttIpcResult<SttModelStatus[]>> => {
    try {
      return ok(await catalogStatusList());
    } catch (error) {
      return fail(error);
    }
  });

  map.set(
    STT_CHANNELS.MODEL_DOWNLOAD,
    async (_event, modelId: unknown): Promise<SttIpcResult<SttModelStatus>> => {
      const id = ModelIdSchema(modelId);
      if (!id) return fail(new Error('LOCAL_STT_MODEL_INVALID_ID'));
      try {
        return ok(await downloadLocalSttModel(id));
      } catch (error) {
        return fail(error);
      }
    },
  );

  map.set(
    STT_CHANNELS.MODEL_CANCEL,
    async (_event, modelId: unknown): Promise<SttIpcResult<{ cancelled: boolean }>> => {
      const id = ModelIdSchema(modelId);
      if (!id) return fail(new Error('LOCAL_STT_MODEL_INVALID_ID'));
      try {
        const cancelled = getStore().cancelDownload(id);
        return ok({ cancelled });
      } catch (error) {
        return fail(error);
      }
    },
  );

  map.set(
    STT_CHANNELS.MODEL_DELETE,
    async (_event, modelId: unknown): Promise<SttIpcResult<SttModelStatus>> => {
      const id = ModelIdSchema(modelId);
      if (!id) return fail(new Error('LOCAL_STT_MODEL_INVALID_ID'));
      try {
        const store = getStore();
        const catalog = await store.getCatalogWithStatus();
        const entry = catalog.find((m) => m.id === id);
        if (entry?.embedded) {
          return fail(new Error('LOCAL_STT_EMBEDDED_NOT_DELETABLE'));
        }
        if (asrProxy.hasActiveStreams) {
          return fail(new Error('LOCAL_STT_MODEL_IN_USE'));
        }
        if (inFlight.has(id)) {
          return fail(new Error('LOCAL_STT_DOWNLOAD_IN_PROGRESS'));
        }
        await store.deleteModel(id);
        const status = await modelStatusById(id);
        return ok(
          status ?? {
            modelId: id,
            state: 'absent',
            embedded: false,
            downloadedBytes: 0,
            totalBytes: 0,
            progress: 0,
          },
        );
      } catch (error) {
        return fail(error);
      }
    },
  );

  return map;
}

/**
 * Registra os handlers no ipcMain real (lazy) via safeHandle. Chamado pelo
 * bootstrap do main (index.ts), depois de buildMainSetup.
 */
export function registerSttModelHandlers(deps: {
  getStore?: () => ReturnType<typeof getLocalSttStore>;
} = {}): void {
  const map = buildSttModelHandlers(deps.getStore);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ipcMain } = require('electron') as typeof import('electron');
  safeHandleMap(ipcMain as IpcMainHandleLike, map);
}