/**
 * ASR engine utility-process entry — study-method (onda 8, voz local).
 *
 * Copiado de quiet-que (electron/main/services/localStt/asrEngine.process.ts) e
 * SIMPLIFICADO: sem TRANSCRIBE de batch (o produto é streaming-only, UMA
 * sessão). O engine é forkado pelo AsrProxyService
 * (`utilityProcess.fork(out/main/asr-engine.js)`) para que um crash nativo do
 * sherpa (segfault/OOM) derrube ESTE processo em vez do app inteiro — o proxy
 * o respawna.
 *
 * Speaks the typed protocol from ./protocol over `process.parentPort`. One
 * AsrEngineCore per process. The 'message' listener is registered SYNCHRONOUSLY
 * — a packaged utility process exits as soon as its entry returns with nothing
 * pending. Deterministic exit em exceção (FATAL + exit 1); nunca desliga
 * sozinho fora do STOP.
 *
 * @module electron/main/services/localStt/asrEngine.process
 */

import { AsrEngineCore } from './asrEngineCore';
import { isAsrEngineRequest, type AsrEngineRequest, type AsrEngineResponse } from './protocol';

function toWireError(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) return { message: err.message, stack: err.stack };
  return { message: String(err) };
}

function startEngineHost(): void {
  const parentPort = process.parentPort;
  const core = new AsrEngineCore();
  const devMode = process.argv.includes('--study-method-dev');

  const send = (msg: AsrEngineResponse): void => {
    try {
      parentPort.postMessage(msg);
    } catch (err) {
      console.error('[ASR-Engine] postMessage failed:', err);
    }
  };

  async function handle(msg: AsrEngineRequest): Promise<void> {
    switch (msg.type) {
      case 'STREAM_START': {
        try {
          await core.startStream(msg.sessionId, msg.opts, (text) =>
            send({ type: 'STREAM_PARTIAL', sessionId: msg.sessionId, text }),
          );
          send({ type: 'STREAM_STARTED', sessionId: msg.sessionId, ok: true });
        } catch (err) {
          send({
            type: 'STREAM_STARTED',
            sessionId: msg.sessionId,
            ok: false,
            error: toWireError(err),
          });
        }
        break;
      }

      case 'STREAM_CHUNK': {
        // Fire-and-forget: the core queues the frame on the session's serial chain.
        core.pushChunk(msg.sessionId, msg.samples);
        break;
      }

      case 'STREAM_STOP': {
        try {
          const text = await core.stopStream(msg.sessionId);
          send({ type: 'STREAM_FINAL', sessionId: msg.sessionId, ok: true, text });
        } catch (err) {
          send({
            type: 'STREAM_FINAL',
            sessionId: msg.sessionId,
            ok: false,
            error: toWireError(err),
          });
        }
        break;
      }

      case 'STREAM_CANCEL': {
        core.cancelStream(msg.sessionId);
        break;
      }

      case 'STOP': {
        try {
          await core.unload();
        } catch {
          /* dispose is best-effort on shutdown */
        }
        process.exit(0);
        break;
      }

      case '__DEBUG_CRASH': {
        if (devMode) {
          console.error('[ASR-Engine] __DEBUG_CRASH requested — exiting 99');
          process.exit(99);
        }
        break;
      }
    }
  }

  parentPort.on('message', (event) => {
    // This side receives a MessageEvent (the parent side receives raw values).
    const data = (event as { data?: unknown }).data;
    if (!isAsrEngineRequest(data)) return;
    void handle(data);
  });

  // A wedged engine is worse than a dead one: turn any escaped error into a
  // deterministic exit so the proxy's crash/respawn path takes over.
  process.on('uncaughtException', (err) => {
    console.error('[ASR-Engine] uncaught exception:', err);
    send({ type: 'FATAL', error: { message: (err as Error)?.message ?? String(err) } });
    process.exit(1);
  });

  send({ type: 'READY', pid: process.pid });
}

// Inert outside a utility process (e.g. an accidental import in tests/main).
if (process.parentPort) {
  startEngineHost();
}