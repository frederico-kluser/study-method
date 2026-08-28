/**
 * electron/main/ipc/localAi-handlers.ts — handlers IPC do LLM local.
 *
 * Canais: detect-hardware, recommend, list, get-active, set-active (invoke);
 * download (invoke + eventos de progresso via webContents.send
 * DOWNLOAD_PROGRESS)); delete.
 *
 * CONTRATO DE SHAPE (alinha com a ApiSchema do preload, que NÃO faz unwrap):
 * cada handler devolve o valor NU tipado em sucesso — detect-hardware →
 * HardwareInfo; recommend → LocalModelInfo; list → LocalModelInfo[];
 * get-active → string | null; set-active/delete/download → {ok}; chat →
 * {text}. Erros LANÇAM Error (o ipcMain.handle converte em rejeição no
 * renderer), mesmo padrão de study:test-answer.
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
import type {
  HardwareInfo,
  DownloadProgress,
  LocalModelInfo,
  LocalAiChatRequest,
} from '@shared/ipc-contract';
import { LOCAL_AI_CHANNELS } from '@shared/ipc-contract';

import { detectHardware } from '../services/embeddedLlm/hardware';
import { recommendDefault } from '../services/embeddedLlm/recommend';
import { createModelStore, type ModelStore } from '../services/embeddedLlm/modelStore';
import { safeHandleMap, type IpcHandlerFn } from './safeHandle';
import { embeddedLlm } from '../services/embeddedLlm/EmbeddedLlmService';

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
    return embeddedLlm as unknown as LlmLike;
  });
  const detect = deps.detect ?? (() => detectHardware());

  // NOTA DE DESIGN (alinhado ao study:test-answer): o `ipcMain.handle` converte
  // um `throw` em REJEIÇÃO do invoke no renderer; o preload repassa o valor de
  // RESOLVE cru (sem unwrap de envelope). Por isso cada handler devolve o valor
  // NU tipado (HardwareInfo, LocalModelInfo, LocalModelInfo[], string|null,
  // {ok}, {text}) em sucesso — e LANÇA Error em falha, que o renderer captura
  // com try/catch (ChallengeView e LocalAiPanel já o fazem). Nada de
  // {success,data}.

  map.set(LOCAL_AI_CHANNELS.DETECT_HARDWARE, async () => {
    const hw = await detect();
    // HardwareInfo direto (sem {success,data}).
    return hw;
  });

  map.set(LOCAL_AI_CHANNELS.RECOMMEND, async () => {
    const hw = await detect();
    // LocalModelInfo direto (a UI confere `recommended`/card);
    return recommendDefault(hw);
  });

  map.set(LOCAL_AI_CHANNELS.LIST, async () => {
    const store = await getStore();
    const list = await store.list();
    const activeId = await store.getActive();
    const enriched = list.map((info) => ({ ...info, active: info.id === activeId }));
    // LocalModelInfo[] direto.
    return enriched;
  });

  map.set(LOCAL_AI_CHANNELS.DOWNLOAD, async (event, modelId) => {
    const id = String(modelId);
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
    // O retorno NU é ignorado pela UI (progresso via evento); devolve {ok}.
    return { ok: true, path: localPath };
  });

  map.set(LOCAL_AI_CHANNELS.DELETE, async (_event, modelId) => {
    const id = String(modelId);
    const store = await getStore();
    const engine = await getEngine();
    if (engine.getActive() === id) {
      await engine.unload();
    }
    await store.delete(id);
    return { ok: true };
  });

  map.set(LOCAL_AI_CHANNELS.GET_ACTIVE, async () => {
    const store = await getStore();
    // string | null (id do modelo ativo) — a ChallengeView usa como string.
    return await store.getActive();
  });

  map.set(LOCAL_AI_CHANNELS.SET_ACTIVE, async (_event, modelId) => {
    const store = await getStore();
    await store.setActive(modelId ? String(modelId) : null);
    return { ok: true };
  });

  /**
   * `localAi:chat` — inferência de bloco único (sem streaming) do modelo local.
   * Se `req.modelId` vier, usa-o; senão cai para o modelo ativo (`set-active`).
   * Em SUCESSO devolve O valor nu `LocalAiChatResult { text }` (mesmo shape de
   * ipc-contract e da ApiSchema `api.localAi.chat → {text}`). Em ERRO LANÇA
   * Error (o ipcMain.handle converte em rejeição) — o ChallengeView captura com
   * try/catch e mostra o erro com a dica de voltar ao provedor DeepSeek.
   */
  map.set(LOCAL_AI_CHANNELS.CHAT, async (_event, rawReq) => {
    const req = (rawReq ?? {}) as Partial<LocalAiChatRequest>;
    if (!req.prompt || !String(req.prompt).trim()) {
      throw new Error('Prompt vazio — nada para o modelo local avaliar.');
    }
    // Só consulta o store (modelo ATIVO) quando o modelId não veio explícito —
    // um modelId fornecido dispensa o acesso a disco/electron do store.
    let modelId: string | null = req.modelId ? String(req.modelId) : null;
    if (!modelId) {
      const store = await getStore();
      modelId = await store.getActive();
    }
    if (!modelId) {
      throw new Error(
        'Nenhum modelo local ativo. Baixe um modelo e ative-o em Configurações → LLM local,' +
          ' ou troque o provedor de feedback para DeepSeek para voltar ao avaliador remoto.',
      );
    }
    const engine = await getEngine();
    let text: string;
    try {
      ({ text } = await engine.chat({ modelId, prompt: String(req.prompt) }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const hint = msg.startsWith('LOCAL_MODEL_NOT_INSTALLED')
        ? `${msg}. Baixe e ative o modelo local em Configurações, ou troque o provedor para DeepSeek.`
        : msg;
      throw new Error(hint);
    }
    return { text };
  });

  return map;
}

/**
 * Entry real: constrói o mapa e liga cada canal ao ipcMain (lazy import de
 * electron) via safeHandle — remove QUALQUER handler prévio (ex.: o placeholder
 * de ipc/index.ts) antes de `handle`, tornando o registro idempotente com a
 * fiação da onda 3. Chamado por buildMainSetup no boot.
 */
export async function registerLocalAiHandlers(deps?: LocalAiHandlerDeps, ipc?: { removeHandler(channel: string): void; handle(channel: string, fn: (...args: unknown[]) => unknown): void }): Promise<void> {
  const handlers = buildLocalAiHandlers(deps);
  const map = new Map<string, IpcHandlerFn>();
  for (const [channel, handler] of handlers) {
    map.set(channel, ((...args: unknown[]) => handler(args[0] as InvokeEventLike, ...args.slice(1)) as Promise<unknown>));
  }
  if (ipc) {
    safeHandleMap(ipc, map);
    return;
  }
  const { ipcMain } = await (import('electron') as Promise<typeof import('electron')>);
  safeHandleMap(ipcMain, map);
}

/** Remove os handlers localAi:* de registrado (para testes/limpeza). */
export async function unregisterLocalAiHandlers(): Promise<void> {
  const { ipcMain } = await (import('electron') as Promise<typeof import('electron')>);
  for (const channel of Object.values(LOCAL_AI_CHANNELS)) {
    ipcMain.removeHandler(channel);
  }
}