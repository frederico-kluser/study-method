/**
 * tests/audioResample.test.ts — resamplagem do microfone p/ STT local (onda 8).
 *
 * Cobre `downsampleTo16k` (mono: 48000→16000, 44100→16000 e passthrough) e
 * `concatFloat32`. Funções puras — sem DOM, sem jsdom, sem GPU.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  STREAMING_STT_SAMPLE_RATE,
  downsampleTo16k,
  concatFloat32,
} from '../src/shared/utils/audioResample.utils';

describe('downsampleTo16k (emenda do microfone p/ STT)', () => {
  it('passthrough quando já está a 16 kHz (cópia independente)', () => {
    const input = new Float32Array([0, 0.5, -0.5, 1]);
    const out = downsampleTo16k(input, STREAMING_STT_SAMPLE_RATE);
    assert.deepEqual(out, input);
    assert.notEqual(out, input); // é uma cópia, não a mesma ref
  });

  it('vazio → vazio', () => {
    assert.equal(downsampleTo16k(new Float32Array(0), 48000).length, 0);
  });

  it('48000 → 16000 (razão 3:1) mantém ~1/3 dos samples', () => {
    const input = new Float32Array(4800); // 0.1 s @ 48k
    for (let i = 0; i < input.length; i++) {
      input[i] = Math.sin((i / 48000) * 2 * Math.PI * 440);
    }
    const out = downsampleTo16k(input, 48000);
    assert.equal(out.length, 1600); // 4800 / 3
    // Primeiro sample preservado (interpolação linear em índice 0).
    assert.ok(Math.abs(out[0] - input[0]) < 1e-6, 'índice 0 preservado');
  });

  it('44100 → 16000 (razão ~2.756)', () => {
    const input = new Float32Array(4410);
    for (let i = 0; i < input.length; i++) input[i] = i % 2 === 0 ? 0.25 : -0.25;
    const out = downsampleTo16k(input, 44100);
    assert.equal(out.length, Math.floor(4410 / (44100 / 16000))); // 1600
  });

  it('up-sampling de taxa baixa (8 kHz → 16 kHz) cresce', () => {
    const input = new Float32Array(800); // 0.1 s @ 8k
    const out = downsampleTo16k(input, 8000);
    assert.ok(out.length > input.length, 'deve crescer quando sobe taxa');
  });
});

describe('concatFloat32', () => {
  it('concatena frames em um buffer único na ordem', () => {
    const a = new Float32Array([1, 2]);
    const b = new Float32Array([3, 4, 5]);
    const out = concatFloat32([a, b]);
    assert.deepEqual(out, new Float32Array([1, 2, 3, 4, 5]));
  });

  it('um único frame → o próprio frame', () => {
    const a = new Float32Array([7]);
    assert.equal(concatFloat32([a]), a);
  });
});