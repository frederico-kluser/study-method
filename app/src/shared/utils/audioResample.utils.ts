/**
 * Renderer-side live audio resampling for streaming STT.
 *
 * The mic is captured via Web Audio at the AudioContext's native rate (usually
 * 48000, sometimes 44100). The local STT stream engine wants 16 kHz mono PCM
 * frames. This does a cheap per-frame linear-interpolation resample — a
 * one-shot batch resampler (OfflineAudioContext) allocates a context per call
 * and is unsuitable for the live path.
 *
 * Copiado de quiet-que (src/shared/utils/audioResample.utils.ts) para o
 * study-method (onda 8 — voz).
 *
 * @module shared/utils/audioResample.utils
 */

export const STREAMING_STT_SAMPLE_RATE = 16000;

/**
 * Resample mono Float32 PCM from `inputRate` to 16 kHz via linear interpolation.
 * Returns a copy at 16 kHz (a plain copy when already at 16 kHz). Handles both
 * down- (48000→16000, exact 3:1) and up-sampling (rare, e.g. 8 kHz devices).
 */
export function downsampleTo16k(input: Float32Array, inputRate: number): Float32Array {
  const target = STREAMING_STT_SAMPLE_RATE;
  if (inputRate === target || input.length === 0) return input.slice();

  const ratio = inputRate / target;
  const outLength = Math.max(1, Math.floor(input.length / ratio));
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = input[idx];
    const b = idx + 1 < input.length ? input[idx + 1] : a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

/** Concatenate Float32 frames into one buffer (e.g. coalescing a backlog). */
export function concatFloat32(frames: Float32Array[]): Float32Array {
  if (frames.length === 1) return frames[0];
  let total = 0;
  for (const f of frames) total += f.length;
  const out = new Float32Array(total);
  let offset = 0;
  for (const f of frames) {
    out.set(f, offset);
    offset += f.length;
  }
  return out;
}