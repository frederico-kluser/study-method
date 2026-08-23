/**
 * electron/main/ipc/stt-handlers.ts — handlers IPC da SESSÃO de streaming do
 * STT local.
 *
 * Copiado de quiet-que (electron/main/ipc/stt-handlers.ts) e ADAPTADO ao
 * study-method: removida TODA a parte cloud/AssemblyAI (insights engine,
 * training engine, segment ids cloud, localTurnCutter). O produto é
 * streaming-only, UMA sessão por vez. Envelope `{ success, data?, error? }`.
 *
 * Canais:
 *  - `stt:stream-start`  → abre UMA sessão de streaming no engine local
 *    (resolvendo o hint de língua por locale); o partial é PUSH no
 *    `stt:stream-partial`.
 *  - `stt:stream-chunk`  → alimenta um frame PCM 16 kHz mono
 *    (Float32Array ≤ 48000 amostras).
 *  - `stt:stream-stop`   → finaliza a sessão e devolve o texto final.
 *  - `stt:stream-cancel` → abandona a sessão.
 *
 * Partials são CUMULATIVOS (replace, nunca append) e chegam no evento
 * `stt:stream-partial` endereçado ao sender (o estudo tem uma janela hoje).
 *
 * @module electron/main/ipc/stt-handlers
 */

import type { SttPartialPayload, SttStreamChunk, SttStreamStartRequest } from '@shared/ipc-contract';
import { STT_CHANNELS } from '@shared/ipc-contract';
import { asrProxy } from '../services/localStt/AsrProxyService';
import {
  getLocalSttStore,
  sttLanguageHint,
  getSttModelById,
} from '../services/localStt/sttLocalService';
import { safeHandleMap, type IpcMainHandleLike, type IpcHandlerFn } from './safeHandle';
import type { WireStreamOptions } from '../services/localStt/protocol';

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

/** O id de sessão fixo do microfone — o study-method tem UMA sessão. */
const MIC_SESSION_ID = 'mic';

function toStreamStart(req: SttStreamStartRequest): SttStreamStartRequest | null {
  const norm = req as Partial<SttStreamStartRequest>;
  if (!norm || typeof norm !== 'object') return null;
  const sessionId =
    typeof norm.sessionId === 'string' && norm.sessionId.length >= 2 ? norm.sessionId : MIC_SESSION_ID;
  const locale = typeof norm.locale === 'string' ? norm.locale : 'pt-BR';
  return { sessionId, locale };
}

function isValidChunk(chunk: SttStreamChunk): chunk is SttStreamChunk {
  return (
    !!(chunk && typeof chunk === 'object') &&
    typeof chunk.sessionId === 'string' &&
    chunk.samples instanceof Float32Array &&
    chunk.samples.length > 0 &&
    chunk.samples.length <= 48000
  );
}

/** Constrói as WireStreamOptions a partir do request, com o modelo embutido. */
async function resolveWireStreamOptions(
  req: SttStreamStartRequest,
): Promise<WireStreamOptions | null> {
  const store = getLocalSttStore();
  // Único modelo do catálogo desta onda (streaming Nemotron).
  const modelId = 'nemotron-3.5-asr-streaming-0.6b-560ms-int8';
  const entry = getSttModelById(modelId);
  if (!entry) return null;
  const modelDir = await store.getModelDirForLoad(modelId);
  if (!modelDir) return null;
  return {
    modelId,
    modelDir,
    mode: entry.mode,
    modelFiles: entry.modelFiles,
    language: sttLanguageHint(req.locale),
  };
}

/** O mínimo do evento de invoke que os handlers usam (para emitir partias). */
export interface SttInvokeEvent {
  sender: { isDestroyed?: () => boolean; send: (ch: string, ...a: unknown[]) => void };
}

/** Handler IPC de streaming STT: `(event, ...args) => Promise<unknown>`. */
export type SttStreamHandler = (
  event: SttInvokeEvent,
  ...args: unknown[]
) => Promise<unknown>;

/**
 * Monta o mapa canal→handler da sessão de streaming (PURA, testável sem
 * electron). `proxy` e `resolveModelDir` são injetáveis para DI nos testes
 * (`resolveModelDir` default resolve o modelo embutido via store).
 */
export function buildSttStreamHandlers(
  proxy: typeof asrProxy = asrProxy,
  resolveModelDir: (req: SttStreamStartRequest) => Promise<WireStreamOptions | null> = resolveWireStreamOptions,
): Map<string, SttStreamHandler> {
  const map: Map<string, SttStreamHandler> = new Map();

  map.set(
    STT_CHANNELS.STREAM_START,
    async (
      event: SttInvokeEvent,
      raw: unknown,
    ): Promise<SttIpcResult<{ sessionId: string }>> => {
      const req = toStreamStart(raw as SttStreamStartRequest);
      if (!req) return fail(new Error('LOCAL_STT_INVALID_REQUEST'));
      try {
        const opts = await resolveModelDir(req);
        if (!opts) {
          return fail(new Error('LOCAL_STT_MODEL_NOT_INSTALLED'));
        }
        await proxy.startStream(req.sessionId, opts, (text) => {
          const payload: SttPartialPayload = { sessionId: req.sessionId, text, isFinal: false };
          if (!event.sender.isDestroyed?.()) {
            event.sender.send(STT_CHANNELS.STREAM_PARTIAL, payload);
          }
        });
        return ok({ sessionId: req.sessionId });
      } catch (error) {
        // Reaper básico: se o renderer cair, a sessão morre (útil para o dev).
        return fail(error);
      }
    },
  );

  map.set(
    STT_CHANNELS.STREAM_CHUNK,
    async (_event, raw: unknown): Promise<SttIpcResult<void>> => {
      const chunk = raw as SttStreamChunk;
      if (!isValidChunk(chunk)) return fail(new Error('LOCAL_STT_INVALID_FRAME'));
      try {
        proxy.pushChunk(chunk.sessionId, chunk.samples);
        return ok(undefined);
      } catch (error) {
        return fail(error);
      }
    },
  );

  map.set(
    STT_CHANNELS.STREAM_STOP,
    async (
      event: SttInvokeEvent,
      raw: unknown,
    ): Promise<SttIpcResult<{ text: string; segmentId?: string }>> => {
      const sessionId =
        raw && typeof raw === 'object' && typeof (raw as { sessionId?: unknown }).sessionId === 'string'
          ? (raw as { sessionId: string }).sessionId
          : MIC_SESSION_ID;
      try {
        const text = await proxy.stopStream(sessionId);
        // Emite o const final no `stt:stream-partial` (quem assina vê o texto
        // fechar), e devolve o texto no retorno do invoke para o hook.
        if (!event.sender.isDestroyed?.()) {
          const payload: SttPartialPayload = { sessionId, text, isFinal: true };
          event.sender.send(STT_CHANNELS.STREAM_PARTIAL, payload);
        }
        return ok({ text });
      } catch (error) {
        return fail(error);
      }
    },
  );

  map.set(
    STT_CHANNELS.STREAM_CANCEL,
    async (_event, raw: unknown): Promise<SttIpcResult<void>> => {
      const sessionId =
        raw && typeof raw === 'object' && typeof (raw as { sessionId?: unknown }).sessionId === 'string'
          ? (raw as { sessionId: string }).sessionId
          : MIC_SESSION_ID;
      try {
        proxy.cancelStream(sessionId);
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
export function registerSttHandlers(deps: { proxy?: typeof asrProxy } = {}): void {
  const handlers = buildSttStreamHandlers(deps.proxy);
  const map = new Map<string, IpcHandlerFn>();
  for (const [channel, handler] of handlers) {
    map.set(
      channel,
      ((...args: unknown[]) =>
        handler(args[0] as SttInvokeEvent, ...args.slice(1)) as Promise<unknown>),
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ipcMain } = require('electron') as typeof import('electron');
  safeHandleMap(ipcMain as IpcMainHandleLike, map);
}