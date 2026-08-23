/**
 * On-device ASR core (NVIDIA Nemotron via sherpa-onnx) — study-method.
 *
 * Copiado de quiet-que (electron/main/services/localStt/asrEngineCore.ts) e
 * SIMPLIFICADO: de DUAS sessões de streaming concorrentes (mic + áudio do
 * sistema) para UMA SESSÃO por vez com UM ÚNICO `OnlineRecognizer` e UM stream
 * (o study-method só tem o microfone do renderer). Sem single-flight (só há
 * uma sessão), sem slot cache multi-sessão — o recognizer é cacheado num único
 * slot depois que a sessão fecha (re-abrir o mic não recarrega 683 MB) e é
 * liberado pelo idle-unload.
 *
 * Regra de ouro do idle: o unload de 5 min NUNCA dispara com uma sessão aberta
 * — liberar o recognizer com um stream aberto apontando para ele segfaulta o
 * sherpa (use-after-free nativo).
 *
 * Runs inside the ASR utility process (asrEngine.process.ts). sherpa-onnx-node
 * é addon nativo N-API, lazy-imported para só carregar quando o engine é
 * realmente usado.
 *
 * @module electron/main/services/localStt/asrEngineCore
 */

import * as os from 'os';
import * as path from 'path';
import { STT_TARGET_SAMPLE_RATE } from './sttModels.constants';
import type { WireStreamOptions } from './protocol';

/**
 * Convert a VAD speech segment (start offset + length, in samples) to a
 * millisecond range relative to the audio start. Pure + exported so the
 * timestamp math is unit-tested without the native sherpa addon.
 */
export function vadChunkRangeMs(
  startSample: number,
  sampleCount: number,
  sampleRate: number,
): { startMs: number; endMs: number } {
  const rate = sampleRate > 0 ? sampleRate : STT_TARGET_SAMPLE_RATE;
  const startMs = Math.max(0, Math.round((startSample / rate) * 1000));
  const endMs = Math.max(startMs, Math.round(((startSample + sampleCount) / rate) * 1000));
  return { startMs, endMs };
}

/* -------------------------------------------------------------------------- *
 * Minimal sherpa-onnx-node surface we use (the package ships no typings).
 * -------------------------------------------------------------------------- */
interface SherpaStream {
  acceptWaveform(req: { sampleRate: number; samples: Float32Array }): void;
  inputFinished?(): void;
  setOption?(opt: { key: string; value: string }): void;
  free?(): void;
}
interface OnlineRecognizer {
  createStream(): SherpaStream;
  isReady(stream: SherpaStream): boolean;
  decode(stream: SherpaStream): void;
  getResult(stream: SherpaStream): { text: string };
  free?(): void;
}
interface SherpaModule {
  OnlineRecognizer: new (config: unknown) => OnlineRecognizer;
}

/** Unload the model after this much idle time to give the RAM back. */
export const IDLE_UNLOAD_MS = 5 * 60 * 1000;

/**
 * A live session: one open OnlineRecognizer stream fed live PCM frames.
 * UMA sessão por vez (o study-method só tem o mic do renderer).
 */
interface StreamSession {
  sessionId: string;
  modelId: string;
  rec: OnlineRecognizer;
  stream: SherpaStream;
  /** Ordered chunk queue — keeps frames in order. */
  serial: Promise<unknown>;
  /** Last emitted cumulative transcript (dedupe identical partials). */
  lastText: string;
  /** Partial-emit callback wired by the host (→ STREAM_PARTIAL). */
  emit: (text: string) => void;
  /** Sticky error from a chunk decode/cancel; surfaced at stopStream. */
  error: Error | null;
}

/** Cached recognizer of the session slot (survives session end; released by idle). */
interface RecognizerSlot {
  modelId: string;
  rec: OnlineRecognizer;
}

export class AsrEngineCore {
  private sherpa: SherpaModule | null = null;
  /** The live streaming session (at most one). */
  private session: StreamSession | null = null;
  /** Cached recognizer slot (one, released by idle). */
  private slot: RecognizerSlot | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  private async getSherpa(): Promise<SherpaModule> {
    if (this.sherpa) return this.sherpa;
    const mod = (await import('sherpa-onnx-node')) as unknown as
      | SherpaModule
      | { default: SherpaModule };
    this.sherpa = (mod as { default?: SherpaModule }).default ?? (mod as SherpaModule);
    return this.sherpa;
  }

  /** Serializes load/session-open/unload so concurrent calls don't race. */
  private run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private numThreads(): number {
    return Math.max(2, Math.min(4, Math.floor(os.cpus().length / 2)));
  }

  /** The sherpa config for the Nemotron streaming model. */
  private buildRecognizerConfig(opts: WireStreamOptions): unknown {
    const dir = opts.modelDir;
    const f = opts.modelFiles;
    return {
      featConfig: { sampleRate: STT_TARGET_SAMPLE_RATE, featureDim: 80 },
      modelConfig: {
        transducer: {
          encoder: path.join(dir, f.encoder),
          decoder: path.join(dir, f.decoder),
          joiner: path.join(dir, f.joiner),
        },
        tokens: path.join(dir, f.tokens),
        numThreads: this.numThreads(),
        provider: 'cpu',
        debug: 0,
      },
      decodingMethod: 'greedy_search',
      enableEndpoint: 0,
    };
  }

  /** Get (or create) the single slot recognizer; a different model replaces it. */
  private async ensureSlotRecognizer(opts: WireStreamOptions): Promise<OnlineRecognizer> {
    if (this.slot && this.slot.modelId === opts.modelId) return this.slot.rec;
    if (this.slot) this.disposeSlot();

    const sherpa = await this.getSherpa();
    const t0 = Date.now();
    const rec = new sherpa.OnlineRecognizer(this.buildRecognizerConfig(opts));
    this.slot = { modelId: opts.modelId, rec };
    console.log(
      `[LocalSTT] loaded ${opts.modelId} (threads=${this.numThreads()}) in ${Date.now() - t0}ms`,
    );
    return rec;
  }

  /* -------------------------------------------------------------------------- *
   * Live streaming session (the mic). ONE session at a time.
   * -------------------------------------------------------------------------- */

  /** Open a session: the slot recognizer (cached) + a fresh stream. */
  async startStream(
    sessionId: string,
    opts: WireStreamOptions,
    emit: (text: string) => void,
  ): Promise<void> {
    if (opts.mode !== 'streaming') throw new Error('LOCAL_STT_NOT_STREAMING');
    if (this.session) throw new Error('LOCAL_STT_SESSION_BUSY');
    await this.run(async () => {
      const rec = await this.ensureSlotRecognizer(opts);
      // Hold the recognizer for the whole session — the idle timer must NOT
      // fire and free it under an open stream (that segfaults sherpa).
      this.clearIdleTimer();
      const stream = rec.createStream();
      if (opts.language && opts.language !== 'auto' && typeof stream.setOption === 'function') {
        try {
          stream.setOption({ key: 'language', value: opts.language });
        } catch {
          /* older binding without per-stream language — model auto-detects */
        }
      }
      this.session = {
        sessionId,
        modelId: opts.modelId,
        rec,
        stream,
        serial: Promise.resolve(),
        lastText: '',
        emit,
        error: null,
      };
    });
  }

  /** Feed one live PCM frame (16 kHz mono); emits a cumulative partial on change. */
  pushChunk(sessionId: string, samples: Float32Array): void {
    const session = this.session;
    if (!session || session.sessionId !== sessionId || session.error) return;
    // Serial chain: ordered, and OFF the global queue so a live frame never
    // waits behind a session open. The decode is synchronous, so it can't
    // interleave with other work mid-decode (JS single-threaded).
    session.serial = session.serial
      .then(() => {
        if (session.error) return;
        session.stream.acceptWaveform({ sampleRate: STT_TARGET_SAMPLE_RATE, samples });
        while (session.rec.isReady(session.stream)) session.rec.decode(session.stream);
        const text = session.rec.getResult(session.stream).text; // CUMULATIVE
        if (text !== session.lastText) {
          session.lastText = text;
          session.emit(text);
        }
      })
      .catch((err: unknown) => {
        session.error = err instanceof Error ? err : new Error(String(err));
        console.error('[LocalSTT] stream chunk decode failed:', session.error);
      });
  }

  /** Flush + finalize a session, returning the final transcript. */
  async stopStream(sessionId: string): Promise<string> {
    const session = this.session;
    if (!session || session.sessionId !== sessionId) return '';
    try {
      await session.serial; // drain queued frames first
      if (session.error) throw session.error;
      // Tail padding flushes the last partial through the encoder lookahead.
      const tail = new Float32Array(Math.round(STT_TARGET_SAMPLE_RATE * 0.5));
      session.stream.acceptWaveform({ sampleRate: STT_TARGET_SAMPLE_RATE, samples: tail });
      session.stream.inputFinished?.();
      while (session.rec.isReady(session.stream)) session.rec.decode(session.stream);
      return session.rec.getResult(session.stream).text.trim();
    } finally {
      this.disposeSession();
      this.touchIdleTimer();
    }
  }

  /** Abandon a session without a final transcript. */
  cancelStream(sessionId: string): void {
    const session = this.session;
    if (!session || session.sessionId !== sessionId) return;
    // Marca o erro ANTES do free(): a cadeia session.serial pode ter passos
    // enfileirados que chamariam acceptWaveform no stream nativo JÁ LIBERADO.
    session.error = new Error('LOCAL_STT_SESSION_CANCELLED');
    this.disposeSession();
    this.touchIdleTimer();
  }

  /** Frees the stream (the slot recognizer stays cached for a fast re-open). */
  private disposeSession(): void {
    if (!this.session) return;
    const stream = this.session.stream;
    this.session = null;
    try {
      stream.free?.();
    } catch {
      /* native finalizer reclaims it */
    }
  }

  private disposeSlot(): void {
    if (!this.slot) return;
    const rec = this.slot.rec;
    this.slot = null;
    try {
      rec.free?.();
    } catch {
      /* native finalizer reclaims it */
    }
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private touchIdleTimer(): void {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      // Don't unload out from under an open session — freeing a recognizer a
      // live stream points at segfaults sherpa.
      if (!this.session) void this.unload();
    }, IDLE_UNLOAD_MS);
    this.idleTimer.unref?.();
  }

  /** Release the cached recognizer. Refuses while a session is live. */
  async unload(): Promise<void> {
    // Never free a recognizer while a live stream points at it.
    if (this.session) return;
    await this.run(async () => {
      this.disposeSlot();
    });
  }

  /** Model id of the open session (or cached slot); null when unloaded. */
  getActiveModelId(): string | null {
    if (this.session) return this.session.modelId;
    if (this.slot) return this.slot.modelId;
    return null;
  }
}