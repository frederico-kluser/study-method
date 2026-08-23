/**
 * Wire protocol between the main-process ASR proxy and the STT engine utility
 * process (study-method — onda 8, voz local).
 *
 * Copiado de quiet-que (electron/main/services/localStt/protocol.ts) e ADAPTADO:
 * o produto study-method é streaming-only com UMA SESSÃO por vez. O TRANSCRIBE
 * de batch fica no fio por compatibilidade de wire, mas o engine responde
 * `LOCAL_STT_BATCH_NOT_IMPLEMENTED`; o __DEBUG_CRASH é mantido (dev-only).
 *
 * Compiled into BOTH the main bundle and the utility entry. Type-only + pure
 * guards — no `electron`, no runtime `sherpa-onnx-node` here, and every payload
 * is structured-clone-safe plain data. For the LIVE `STREAM_*` sessions the
 * audio source has already decoded to 16 kHz mono PCM, so small `Float32Array`
 * frames (~128 ms, 2048 samples) ARE sent as samples — structured-clone-safe.
 * Partials são CUMULATIVOS (replace — o store do app substitui).
 *
 * @module electron/main/services/localStt/protocol
 */

import type { SttModelMode } from './sttModels.constants';

// ── Wire options for a LIVE streaming session (main → engine) ────────────────
// The model index lives in the main process (sttModelStore needs the userData
// path), so the catalogue id is resolved to an on-disk dir before the hop.

export interface WireStreamOptions {
  modelId: string;
  /** Absolute path to the installed model dir (resolved main-side). */
  modelDir: string;
  /** Must be 'streaming' — guarded engine-side (an OnlineRecognizer is required). */
  mode: SttModelMode;
  modelFiles: { encoder: string; decoder: string; joiner: string; tokens: string };
  /** Language hint ('auto' = self-detect). */
  language?: string;
}

// ── Messages: main → engine ──────────────────────────────────────────────────

export type AsrEngineRequest =
  /** Open a live streaming session (one open OnlineRecognizer stream). */
  | { type: 'STREAM_START'; sessionId: string; opts: WireStreamOptions }
  /** Feed a live PCM frame (16 kHz mono) into an open session. */
  | { type: 'STREAM_CHUNK'; sessionId: string; samples: Float32Array }
  /** Flush + finalize a session → STREAM_FINAL. */
  | { type: 'STREAM_STOP'; sessionId: string }
  /** Abandon a session without a final transcript. */
  | { type: 'STREAM_CANCEL'; sessionId: string }
  /** Clean shutdown: dispose, exit(0). */
  | { type: 'STOP' }
  /** Crash injection (honored only when forked with `--study-method-dev`). */
  | { type: '__DEBUG_CRASH' };

// ── Messages: engine → main ──────────────────────────────────────────────────

export type AsrEngineResponse =
  | { type: 'READY'; pid: number }
  /** Streaming session opened (or failed to open). */
  | { type: 'STREAM_STARTED'; sessionId: string; ok: true }
  | { type: 'STREAM_STARTED'; sessionId: string; ok: false; error: { message: string } }
  /** Cumulative interim transcript for a session (replace, never append). */
  | { type: 'STREAM_PARTIAL'; sessionId: string; text: string }
  /** Final transcript for a session (after STREAM_STOP), or a failure. */
  | { type: 'STREAM_FINAL'; sessionId: string; ok: true; text: string }
  | { type: 'STREAM_FINAL'; sessionId: string; ok: false; error: { message: string } }
  /** Best-effort pre-exit notice; the authoritative crash signal is 'exit'. */
  | { type: 'FATAL'; error: { message: string } };

// ── Renderer-facing engine status (broadcast on `stt:engine-status`) ─────────

export type AsrEngineStatus = 'ready' | 'restarting' | 'dead';
export interface AsrEngineStatusPayload {
  status: AsrEngineStatus;
}

// ── Guards ───────────────────────────────────────────────────────────────────

const ASR_REQUEST_TYPES: ReadonlySet<string> = new Set([
  'STREAM_START',
  'STREAM_CHUNK',
  'STREAM_STOP',
  'STREAM_CANCEL',
  'STOP',
  '__DEBUG_CRASH',
]);

const ASR_RESPONSE_TYPES: ReadonlySet<string> = new Set([
  'READY',
  'STREAM_STARTED',
  'STREAM_PARTIAL',
  'STREAM_FINAL',
  'FATAL',
]);

function hasType(value: unknown): value is { type: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}

export function isAsrEngineRequest(value: unknown): value is AsrEngineRequest {
  return hasType(value) && ASR_REQUEST_TYPES.has(value.type);
}

export function isAsrEngineResponse(value: unknown): value is AsrEngineResponse {
  return hasType(value) && ASR_RESPONSE_TYPES.has(value.type);
}