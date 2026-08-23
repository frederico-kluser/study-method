/**
 * tests/recommend.test.ts — recomendação determinística por hardware.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { HardwareInfo, LocalModelInfo } from '../shared/ipc-contract';
import {
  catalogAsInfo,
  recommendDefault,
  recommendWithFit,
} from '../electron/main/services/embeddedLlm/recommend';

function hw(ramGb: number, vramGb: number | null): HardwareInfo {
  return { backend: 'CPU', ramGb, vramGb, cpuModel: 'x' };
}

function ids(list: LocalModelInfo[]): string[] {
  return list.map((m) => m.id);
}

describe('recommendDefault (heurística pura)', () => {
  it('VRAM >= 6 → LFM2.5-8B-A1B Q5_K_M (recomendado)', () => {
    const rec = recommendDefault(hw(16, 8));
    assert.equal(rec.id, 'LiquidAI/LFM2.5-8B-A1B-GGUF:Q5_K_M');
    assert.equal(rec.recommended, true);
    assert.equal(rec.agentReady, true);
  });

  it('RAM >= 14 sem VRAM → LFM2.5-8B-A1B Q4_K_M (default)', () => {
    const rec = recommendDefault(hw(16, null));
    assert.equal(rec.id, 'LiquidAI/LFM2.5-8B-A1B-GGUF:Q4_K_M');
    assert.equal(rec.recommended, true);
  });

  it('RAM < 14 sem VRAM → LFM2-1.2B Q4_K_M (fallback)', () => {
    const rec = recommendDefault(hw(8, null));
    assert.equal(rec.id, 'LiquidAI/LFM2-1.2B-GGUF:Q4_K_M');
    assert.equal(rec.recommended, true);
  });

  it('sempre marca recommended:true e nunca lança', () => {
    for (const ram of [2, 4, 8, 14, 32, 64]) {
      const rec = recommendDefault(hw(ram, null));
      assert.equal(rec.recommended, true);
    }
  });
});

describe('recommendWithFit (insights opcional)', () => {
  it('sem insights comporta-se igual a recommendDefault', () => {
    const rec = recommendWithFit(hw(16, null), catalogAsInfo(hw(16, null)), undefined);
    assert.equal(rec.id, 'LiquidAI/LFM2.5-8B-A1B-GGUF:Q4_K_M');
    const rec2 = recommendWithFit(hw(8, null), catalogAsInfo(hw(8, null)), null);
    assert.equal(rec2.id, 'LiquidAI/LFM2-1.2B-GGUF:Q4_K_M');
  });

  it('pick inicial cabe → mantém', () => {
    const rec = recommendWithFit(
      hw(16, null),
      catalogAsInfo(hw(16, null)),
      { fits: (id) => id === 'LiquidAI/LFM2.5-8B-A1B-GGUF:Q4_K_M' },
    );
    assert.equal(rec.id, 'LiquidAI/LFM2.5-8B-A1B-GGUF:Q4_K_M');
  });

  it('pick inicial não cabe → desce para o menor que caiba', () => {
    const rec = recommendWithFit(
      hw(16, 8),
      catalogAsInfo(hw(16, 8)),
      { fits: (id) => !id.includes('Q5_K_M') }, // Q5 não cabe
    );
    assert.equal(rec.id, 'LiquidAI/LFM2.5-8B-A1B-GGUF:Q4_K_M');
  });

  it('nada cabe → cai no fallback 1.2B', () => {
    const rec = recommendWithFit(hw(16, null), catalogAsInfo(hw(16, null)), {
      fits: () => false,
    });
    assert.equal(rec.id, 'LiquidAI/LFM2-1.2B-GGUF:Q4_K_M');
  });
});

describe('catalogAsInfo', () => {
  it('devolve as 3 entradas com recommended do default', () => {
    const list = catalogAsInfo(hw(16, null));
    assert.equal(list.length, 3);
    const def = list.find((m) => m.id === 'LiquidAI/LFM2.5-8B-A1B-GGUF:Q4_K_M');
    assert.equal(def?.recommended, true);
    assert.equal(ids(list).sort().length, 3);
  });
});