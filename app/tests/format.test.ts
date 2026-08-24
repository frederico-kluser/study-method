/**
 * tests/format.test.ts — formatadores puros da UI (sem jsdom).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatBytes,
  formatSpeedBps,
  formatModelLabel,
  formatPercent,
} from '../src/lib/format';

describe('formatBytes', () => {
  it('zero e inválidos -> 0 B', () => {
    assert.equal(formatBytes(0), '0 B');
    assert.equal(formatBytes(-5), '0 B');
    assert.equal(formatBytes(Number.NaN), '0 B');
    assert.equal(formatBytes(Number.POSITIVE_INFINITY), '0 B');
  });
  it('bytes, KB, MB, GB', () => {
    assert.equal(formatBytes(512), '512 B');
    assert.equal(formatBytes(1536), '1.50 KB');
    assert.equal(formatBytes(2.5e6), '2.38 MB');
    assert.equal(formatBytes(3.2e9), '2.98 GB');
  });
  it('valores ≥100 na mesma unidade não mostram casas', () => {
    assert.equal(formatBytes(100), '100 B');
  });
});

describe('formatSpeedBps', () => {
  it('sufixo /s', () => {
    assert.equal(formatSpeedBps(0), '0 B/s');
    assert.equal(formatSpeedBps(2.5e6), '2.38 MB/s');
  });
});

describe('formatModelLabel', () => {
  it('usa label + quant', () => {
    assert.equal(
      formatModelLabel({ id: 'm1', label: 'Llama 3.2', quant: 'Q4_K_M' }),
      'Llama 3.2 · Q4_K_M',
    );
  });
  it('cai para id quando sem label; ignora quant vazia', () => {
    assert.equal(formatModelLabel({ id: 'm2' }), 'm2');
    assert.equal(formatModelLabel({ id: 'm2', label: '' }), 'm2');
    assert.equal(formatModelLabel({ id: 'm3', label: 'Nome', quant: '  ' }), 'Nome');
  });
});

describe('formatPercent', () => {
  it('clampa a [0,100] e arredonda', () => {
    assert.equal(formatPercent(-3), 0);
    assert.equal(formatPercent(150), 100);
    assert.equal(formatPercent(42.4), 42);
    assert.equal(formatPercent(Number.NaN), 0);
  });
});