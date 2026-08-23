/**
 * electron/main/ipc/localAi-handlers.ts — handlers IPC do LLM local.
 *
 * Canais: detect-hardware, recommend, list, get-active, set-active (invoke);
 * download (invoke + eventos de progresso via webContents.send
 * DOWNLOAD_PROGRESS)); delete.
 *
 * Duas camadas (mesmo idioma de ipc/index.ts):
 *   1. `buildLocalAiHandlers(deps)` — função PURA: devolve `Map<canal, handler>`
 *      em que handler é `(event, ...args) => Promise<unknown>`. Não toca em
 *      electron/systeminformation/ipcMain — testes usam fakes.
 *   2. `registerLocalAiHandlers()` — entry real: importa electron lazy e liga o
 *      map ao `ipcMain.handle` (que passa o evento + args ao handler).
 *
 * O `ipc/index.ts` NÃO é editado aqui — a onda seguinte liga estes handlers ao
 * fluxo de boot.
 */
import type { HardwareInfo, DownloadProgress, LocalModelInfo } from '@shared/ipc-contract';
import { LOCAL_AI_CHANNELS } from '@shared/ipc-contract';

import { detectHardware } from '../services/embeddedLlm/hardware';
import { recommendDefault } from '../services/embeddedLlm/recommend';
import { createModelStore, type ModelStore } from '../services/embeddedLlm/modelStore';

/** Fachada do motor usada pelos handlers (delete precisa do unload). */
export interface LlmLike {
  load(modelId: string, contextSize?: number): Promise<void>;
  unload(): Promise<void>;
  chat(
    opts: { modelId: string; prompt: string },
    onDelta?: (text: string) => void,
  ): Promise<{ text: string }>;
  status(): Promise<unknown>;
  getActive(): string | null;
}

/** O mínimo do evento de invoke que os handlers usam (progresso do download). */
export interface InvokeEventLike {
  sender: { send: (channel: string, ...args: unknown[]) => void; isDestroyed?: () => boolean };
}

export interface LocalAiHandlerDeps {
  getEngine?: () => Promise<LlmLike>;
  getStore?: () => Promise<ModelStore>;
  /** Injeta a detecção de hardware (testes). */
  detect?: () => Promise<HardwareInfo>;
}

/** Handler IPC: `(event, ...args) => Promise<unknown>`. */
export type LocalAiHandler = (
  event: InvokeEventLike,
  ...args: unknown[]
) => Promise<unknown>;

export type LocalAiHandlerMap = Map<string, LocalAiHandler>;

/** Singleton do store real (lazy, usa electron.app para userData/models). */
let _storeSingleton: ModelStore | null = null;
async function defaultStore(): Promise<ModelStore> {
  if (_storeSingleton) return _storeSingleton;
  const { app } = await (import('electron') as Promise<typeof import('electron')>);
  const path = await import('node:path');
  const modelsDir = path.join(app.getPath('userData'), 'models');
  _storeSingleton = createModelStore({ modelsDir });
  return _storeSingleton;
}

/**
 * Monta o mapa canal→handler (PURA — testável sem electron/systeminformation).
 * `deps.detect` opcional permite fake nos testes; default é detectHardware real.
 */
export function buildLocalAiHandlers(deps: LocalAiHandlerDeps = {}): LocalAiHandlerMap {
  const map: LocalAiHandlerMap = new Map();
  const getStore = deps.getStore ?? defaultStore;
  const getEngine = deps.getEngine ?? (async () => {
    const { embeddedLlm } = await import('../services/embeddedLlm/EmbeddedLlmService');
    return embeddedLlm as unknown as LlmLike;
  });
  const detect = deps.detect ?? (() => detectHardware());

  map.set(LOCAL_AI_CHANNELS.DETECT_HARDWARE, async () => {
    try {
      const hw = await detect();
      return { success: true, data: hw };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  map.set(LOCAL_AI_CHANNELS.RECOMMEND, async () => {
    try {
      const hw = await detect();
      return { success: true, data: recommendDefault(hw) };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  map.set(LOCAL_AI_CHANNELS.LIST, async () => {
    try {
      const store = await getStore();
      const list = await store.list();
      const activeId = await store.getActive();
      const enriched = list.map((info) => ({ ...info, active: info.id === activeId }));
      return { success: true, data: enriched };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  map.set(LOCAL_AI_CHANNELS.DOWNLOAD, async (event, modelId) => {
    const id = String(modelId);
    try {
      const store = await getStore();
      const controller = new AbortController();
      const progress = (p: DownloadProgress): void => {
        if (!event.sender.isDestroyed?.()) {
          event.sender.send(LOCAL_AI_CHANNELS.DOWNLOAD_PROGRESS, p);
        }
      };
      const localPath = await store.download(id, {
        onProgress: progress,
        signal: controller.signal,
      });
      return { success: true, path: localPath };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith('DOWNLOAD_CANCELLED:')) {
        return { success: false, cancelled: true, error: msg };
      }
      return { success: false, error: msg };
    }
  });

  map.set(LOCAL_AI_CHANNELS.DELETE, async (_event, modelId) => {
    const id = String(modelId);
    try {
      const store = await getStore();
      const engine = await getEngine();
      if (engine.getActive() === id) {
        await engine.unload();
      }
      await store.delete(id);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  map.set(LOCAL_AI_CHANNELS.GET_ACTIVE, async () => {
    try {
      const store = await getStore();
      return { success: true, data: await store.getActive() };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  map.set(LOCAL_AI_CHANNELS.SET_ACTIVE, async (_event, modelId) => {
    try {
      const store = await getStore();
      await store.setActive(modelId ? String(modelId) : null);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  return map;
}

/**
 * Entry real: constrói o mapa e liga cada canal ao ipcMain.handle (lazy
 * import de electron). Chamado por uma onda futura no boot do app.
 */
export async function registerLocalAiHandlers(deps?: LocalAiHandlerDeps): Promise<void> {
  const { ipcMain } = await (import('electron') as Promise<typeof import('electron')>);
  const handlers = buildLocalAiHandlers(deps);
  for (const [channel, handler] of handlers) {
    ipcMain.handle(
      channel,
      (event: unknown, ...args: unknown[]) =>
        handler(event as InvokeEventLike, ...args) as Promise<unknown>,
    );
  }
}

/** Remove os handlers localAi:* de registrado (para testes/limpeza). */
export async function unregisterLocalAiHandlers(): Promise<void> {
  const { ipcMain } = await (import('electron') as Promise<typeof import('electron')>);
  for (const channel of Object.values(LOCAL_AI_CHANNELS)) {
    ipcMain.removeHandler(channel);
  }
}