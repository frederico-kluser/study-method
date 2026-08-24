/**
 * tests/hardware.test.ts — detecção de hardware + heurística de backend.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { detectHardware, pickBackend } from '../electron/main/services/embeddedLlm/hardware';
import type { SysteminfoLike } from '../electron/main/services/embeddedLlm/hardware';

const MEM_DEFAULTS = { total: 16 * 1024 ** 3 };

function makeSi(over: {
  total?: number;
  manufacturer?: string;
  brand?: string;
  controllers?: Array<{ vendor: string; model: string; vram: number | null; vramDynamic: boolean }>;
}): SysteminfoLike {
  const controllers = over.controllers ?? [];
  return {
    mem: async () => ({ total: over.total ?? MEM_DEFAULTS.total }),
    cpu: async () => ({ manufacturer: over.manufacturer ?? 'Intel', brand: over.brand ?? 'Core i7' }),
    graphics: async () => ({ controllers }),
  };
}

describe('pickBackend (heurística pura)', () => {
  it('darwin + arm64 → Metal', () => {
    assert.equal(pickBackend({ vramGb: null }, 'darwin', 'arm64'), 'Metal');
    assert.equal(pickBackend({ vramGb: 0 }, 'darwin', 'arm64'), 'Metal');
  });

  it('GPU NVIDIA + VRAM >= 4 → CUDA', () => {
    assert.equal(pickBackend({ vramGb: 8, gpuVendor: 'NVIDIA Corporation' }, 'linux', 'x64'), 'CUDA');
  });

  it('GPU não-NVIDIA + VRAM >= 4 → Vulkan', () => {
    assert.equal(pickBackend({ vramGb: 8, gpuVendor: 'AMD' }, 'linux', 'x64'), 'Vulkan');
    assert.equal(pickBackend({ vramGb: 8, gpuVendor: 'Intel' }, 'win32', 'x64'), 'Vulkan');
  });

  it('VRAM < 4 ou ausente (não-Apple) → CPU', () => {
    assert.equal(pickBackend({ vramGb: 2 }, 'linux', 'x64'), 'CPU');
    assert.equal(pickBackend({ vramGb: null }, 'linux', 'x64'), 'CPU');
    assert.equal(pickBackend({ vramGb: 0 }, 'win32', 'x64'), 'CPU');
  });
});

describe('detectHardware (si fake)', () => {
  it('mapeia total/CPU e VRAM discreta > 0', async () => {
    const si = makeSi({
      total: 16 * 1024 ** 3,
      manufacturer: 'Intel',
      brand: 'Core i7-13700',
      controllers: [
        { vendor: 'Intel', model: 'Iris Xe', vram: null, vramDynamic: true },
        { vendor: 'NVIDIA', model: 'RTX 3060 Laptop GPU', vram: 6144, vramDynamic: false },
      ],
    });
    const hw = await detectHardware({ si, platform: 'linux', arch: 'x64' });
    assert.equal(hw.ramGb, 16);
    assert.equal(hw.vramGb, 6); // 6144 MB / 1024 = 6
    assert.equal(hw.cpuModel, 'Intel Core i7-13700');
    assert.equal(hw.backend, 'CUDA');
  });

  it('GPU integrada (vramDynamic/vram null) → vramGb null e backend CPU', async () => {
    const si = makeSi({
      total: 8 * 1024 ** 3,
      controllers: [{ vendor: 'Intel', model: 'UHD Graphics', vram: null, vramDynamic: true }],
    });
    const hw = await detectHardware({ si, platform: 'linux', arch: 'x64' });
    assert.equal(hw.vramGb, null);
    assert.equal(hw.backend, 'CPU');
  });

  it('Apple Silicon → backend Metal independente da GPU listada', async () => {
    const si = makeSi({ total: 32 * 1024 ** 3, controllers: [] });
    const hw = await detectHardware({ si, platform: 'darwin', arch: 'arm64' });
    assert.equal(hw.backend, 'Metal');
    assert.equal(hw.ramGb, 32);
  });

  it('ignora Microsoft Basic Display Adapter', async () => {
    const si = makeSi({
      total: 16 * 1024 ** 3,
      controllers: [
        { vendor: 'Microsoft', model: 'Microsoft Basic Display Adapter', vram: 128, vramDynamic: false },
      ],
    });
    const hw = await detectHardware({ si, platform: 'linux', arch: 'x64' });
    assert.equal(hw.vramGb, null);
    assert.equal(hw.backend, 'CPU');
  });
});