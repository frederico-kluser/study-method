/**
 * Minimal WAV (RIFF/PCM16) encode + header parsing for the local TTS engine —
 * study-method.
 *
 * Copiado de ondokai (electron/main/services/localTts/wavEncode.ts).
 *
 * @module electron/main/services/localTts/wavEncode
 */

/** The 44-byte RIFF/WAVE header for mono PCM16 data of `dataBytes` bytes. */
export function wavPcm16Header(dataBytes: number, sampleRate: number): Buffer {
  const buf = Buffer.alloc(44);

  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8, 'ascii');

  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate (mono * 2 bytes)
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample

  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);
  return buf;
}

/** Encode mono Float32 samples ([-1, 1]) as a 16-bit PCM wav Buffer. */
export function encodeWavPcm16(samples: Float32Array, sampleRate: number): Buffer {
  const dataBytes = samples.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  wavPcm16Header(dataBytes, sampleRate).copy(buf, 0);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff), 44 + i * 2);
  }
  return buf;
}