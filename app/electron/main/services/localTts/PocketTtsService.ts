/**
 * On-device TTS engine — **out-of-process** (GPL isolation, Option A) —
 * study-method.
 *
 * Copiado de ondokai (electron/main/services/localTts/PocketTtsService.ts) e
 * ADAPTADO: env override `STUDY_METHOD_TTS_ENGINE_BIN`, catálogo de
 * `src/shared/constants/ttsModels.constants.ts`.
 *
 * The shipped voice engine is **Piper** (sherpa-onnx VITS, pt-BR + English).
 * Piper phonemizes via **espeak-ng, which is GPLv3**. To keep the proprietary
 * study-method processes free of GPL code, this service does NOT load the
 * sherpa-onnx TTS library in-process. Instead it invokes the upstream
 * **`sherpa-onnx-offline-tts` command-line executable** (which contains espeak)
 * in a **separate process** via `child_process.execFile`, and reads back the
 * WAV it writes. The boundary is arm's-length (CLI args + a file on disk).
 * See resources/licenses/*.md for the GPL thread.
 *
 * Everything ships inside the installer (no runtime download): the engine
 * binary, the Piper model files, and the espeak-ng phoneme data. The output is
 * a WAV at the model's native rate (Piper medium = 22.05 kHz, mono).
 *
 * @module electron/main/services/localTts/PocketTtsService
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { execFile, type ChildProcess } from 'child_process';
import {
  TTS_SPEED_DEFAULT,
  getTtsModelById,
} from '../../../../src/shared/constants/ttsModels.constants';
import { getModelDirForLoad } from './ttsModelStore';
import {
  getTtsEngineBinaryPath,
  isTtsEngineAvailable,
  getEspeakNgDataDir,
  isEspeakNgDataAvailable,
} from './ttsEnginePaths';

export interface LocalTtsGenerateOptions {
  /** Caller-unique id so the renderer can cancel this request. */
  requestId: string;
  modelId: string;
  text: string;
  /** Built-in speaker id (Piper single-speaker = 0). */
  sid?: number;
  speed?: number;
}

export interface LocalTtsGenerateResult {
  wavBase64: string;
  sampleRate: number;
  numSamples: number;
  latencyMs: number;
}

/** Per-call worst-case wall clock: a floor + a per-character allowance, capped. */
function timeoutForText(textLength: number): number {
  return Math.min(300_000, 20_000 + textLength * 40);
}

/** sherpa-onnx's per-call `speed` maps to VITS `length_scale = 1 / speed`. */
function lengthScaleForSpeed(speed: number | undefined): number {
  const s = speed && speed > 0 ? speed : TTS_SPEED_DEFAULT;
  return 1 / s;
}

/** Minimal, robust WAV chunk reader (sample rate + sample count for metadata). */
function readWavInfo(buf: Buffer): { sampleRate: number; numSamples: number } {
  let sampleRate = 22050;
  let bitsPerSample = 16;
  let channels = 1;
  let dataBytes = 0;
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ' && off + 24 <= buf.length) {
      channels = buf.readUInt16LE(off + 10) || 1;
      sampleRate = buf.readUInt32LE(off + 12) || sampleRate;
      bitsPerSample = buf.readUInt16LE(off + 22) || bitsPerSample;
    } else if (id === 'data') {
      dataBytes = size;
    }
    off += 8 + size + (size % 2);
  }
  const bytesPerSample = Math.max(1, Math.floor(bitsPerSample / 8));
  const numSamples = dataBytes > 0 ? Math.floor(dataBytes / (bytesPerSample * channels)) : 0;
  return { sampleRate, numSamples };
}

class LocalTtsEngine {
  /** Serializes generate calls so a weak CPU never runs two engine processes. */
  private queue: Promise<unknown> = Promise.resolve();
  private cancelledRequests = new Set<string>();
  /** Live child processes by requestId, so cancel() can kill them. */
  private children = new Map<string, ChildProcess>();
  private tmpSeq = 0;

  /** Runs work serialized behind the engine queue. */
  private run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private tmpWavPath(requestId: string): string {
    const safe = requestId.replace(/[^a-zA-Z0-9_-]/g, '');
    return path.join(os.tmpdir(), `study-method-tts-${process.pid}-${safe}-${++this.tmpSeq}.wav`);
  }

  /** Invoke the separate engine binary; resolves when it writes the output wav. */
  private spawnEngine(
    requestId: string,
    args: string[],
    timeoutMs: number,
  ): Promise<void> {
    const bin = getTtsEngineBinaryPath();
    return new Promise<void>((resolve, reject) => {
      // execFile (NOT a shell) — text and paths are argv entries, so there is no
      // shell-injection surface.
      const child = execFile(
        bin,
        args,
        { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
        (err, _stdout, stderr) => {
          this.children.delete(requestId);
          if (err) {
            const killed = (err as { killed?: boolean }).killed === true;
            if (this.cancelledRequests.has(requestId) || killed) {
              reject(new Error(`TTS_GENERATION_CANCELLED:${requestId}`));
              return;
            }
            const detail = String(stderr || err.message).slice(0, 500).replace(/\s+/g, ' ');
            reject(new Error(`LOCAL_TTS_ENGINE_FAILED:${detail}`));
            return;
          }
          resolve();
        },
      );
      this.children.set(requestId, child);
    });
  }

  /**
   * Generate speech for `text` with the given Piper model + speaker id, by
   * invoking the separate engine process. Returns a WAV (base64) at the model's
   * native rate. Cancellation kills the engine child if one is running.
   */
  async generate(opts: LocalTtsGenerateOptions): Promise<LocalTtsGenerateResult> {
    try {
      return await this.run(async () => {
        if (this.cancelledRequests.has(opts.requestId)) {
          throw new Error(`TTS_GENERATION_CANCELLED:${opts.requestId}`);
        }

        const entry = getTtsModelById(opts.modelId);
        if (!entry) throw new Error(`LOCAL_TTS_MODEL_NOT_INSTALLED:${opts.modelId}`);
        if (entry.family !== 'vits') {
          throw new Error(`LOCAL_TTS_ENGINE_FAMILY_UNSUPPORTED:${entry.family}`);
        }
        if (!isTtsEngineAvailable()) {
          throw new Error(`LOCAL_TTS_ENGINE_MISSING:${opts.modelId}`);
        }
        if (!isEspeakNgDataAvailable()) {
          throw new Error(`LOCAL_TTS_VOICE_DATA_MISSING:${opts.modelId}`);
        }

        const dir = await getModelDirForLoad(opts.modelId);
        if (!dir) throw new Error(`LOCAL_TTS_MODEL_NOT_INSTALLED:${opts.modelId}`);

        const outWav = this.tmpWavPath(opts.requestId);
        const args = [
          `--vits-model=${path.join(dir, 'model.onnx')}`,
          `--vits-tokens=${path.join(dir, 'tokens.txt')}`,
          `--vits-data-dir=${getEspeakNgDataDir()}`,
          `--sid=${opts.sid ?? 0}`,
          `--vits-length-scale=${lengthScaleForSpeed(opts.speed).toFixed(4)}`,
          `--num-threads=${Math.max(2, Math.min(4, Math.floor(os.cpus().length / 2)))}`,
          `--output-filename=${outWav}`,
          opts.text,
        ];

        const t0 = Date.now();
        try {
          await this.spawnEngine(opts.requestId, args, timeoutForText(opts.text.length));
          if (this.cancelledRequests.has(opts.requestId)) {
            throw new Error(`TTS_GENERATION_CANCELLED:${opts.requestId}`);
          }
          const wav = await fs.readFile(outWav);
          const { sampleRate, numSamples } = readWavInfo(wav);
          return {
            wavBase64: wav.toString('base64'),
            sampleRate: sampleRate || entry.sampleRate,
            numSamples,
            latencyMs: Date.now() - t0,
          };
        } finally {
          await fs.rm(outWav, { force: true }).catch(() => undefined);
        }
      });
    } finally {
      this.cancelledRequests.delete(opts.requestId);
    }
  }

  /** Marks a request as cancelled (queued → rejected; running → engine killed). */
  cancel(requestId: string): void {
    this.cancelledRequests.add(requestId);
    const child = this.children.get(requestId);
    if (child) {
      try {
        child.kill();
      } catch {
        /* already exited */
      }
    }
  }
}

/** App-wide singleton (the localTts IPC channel uses this). */
export const pocketTts = new LocalTtsEngine();