/**
 * electron/main/services/embeddedLlm/hardware.ts — detecção de hardware.
 *
 * Combina systeminformation (RAM/CPU/GPU) com uma heurística de backend do
 * node-llama-cpp. `detectHardware` é DI-friendly: `si` pode ser injetado nos
 * testes (a função pura `pickBackend` é testada isoladamente).
 *
 * Nota sobre o shape do systeminformation: `mem.total` vem em bytes;
 * `graphics.controllers[].vram` vem em MB (null para GPUs integradas/partilhadas
 * com `vramDynamic: true`). O campo usado aqui é `vram` (o typings real não tem
 * `vramTotal`).
 */
import type { HardwareInfo } from '@shared/ipc-contract';

/** Shape mínimo do systeminformation usado por esta detecção. */
export type SysteminfoLike = {
  mem(): Promise<{ total: number }>;
  cpu(): Promise<{ manufacturer: string; brand: string }>;
  graphics(): Promise<{ controllers: Array<{ vendor: string; model: string; vram: number | null; vramDynamic: boolean }> }>;
};

/** Backend que o node-llama-cpp usará (heurística, nome compatível com a UI). */
export type LlmBackend = 'Metal' | 'CUDA' | 'Vulkan' | 'CPU';

/**
 * Heurística pura e testável de escolha de backend, a partir do hardware já
 * detectado + platform/arch:
 *  - darwin + arm64 → 'Metal' (Apple Silicon com memória unificada).
 *  - senão, se houver VRAM útil ≥ 4 GB → 'CUDA' se o GPU for NVIDIA, senão
 *    'Vulkan'.
 *  - senão → 'CPU'.
 */
export function pickBackend(
  hw: Pick<HardwareInfo, 'vramGb'> & { gpuVendor?: string },
  platform: string,
  arch: string,
): LlmBackend {
  if (platform === 'darwin' && arch === 'arm64') return 'Metal';
  const vram = hw.vramGb ?? 0;
  if (vram >= 4) {
    const vendor = (hw.gpuVendor ?? '').toLowerCase();
    return vendor.includes('nvidia') ? 'CUDA' : 'Vulkan';
  }
  return 'CPU';
}

/** Detecta o hardware e escolhe o backend. `si` opcional para testes. */
export async function detectHardware(deps?: {
  si?: SysteminfoLike;
  platform?: string;
  arch?: string;
}): Promise<HardwareInfo> {
  const platform = deps?.platform ?? process.platform;
  const arch = deps?.arch ?? process.arch;

  // systeminformation é carregado sob demanda; default é o real.
  let mem: { total: number };
  let cpu: { manufacturer: string; brand: string };
  let graphics: { controllers: Array<{ vendor: string; model: string; vram: number | null; vramDynamic: boolean }> };
  if (deps?.si) {
    [mem, cpu, graphics] = await Promise.all([
      deps.si.mem(),
      deps.si.cpu(),
      deps.si.graphics(),
    ]);
  } else {
    const si = (await import('systeminformation')).default ?? (await import('systeminformation'));
    [mem, cpu, graphics] = await Promise.all([si.mem(), si.cpu(), si.graphics()]);
  }

  const ramGb = mem.total / 1024 ** 3;

  // Primeiro controlador de GPU discreto com VRAM útil (> 0).
  let vramGb: number | null = null;
  let gpuVendor: string | undefined;
  for (const c of graphics.controllers ?? []) {
    if (!c.vendor || /microsoft basic display/i.test(c.model ?? '')) continue;
    if (c.vram && c.vram > 0 && !c.vramDynamic) {
      vramGb = c.vram / 1024;
      gpuVendor = c.vendor;
      break;
    }
    // GPUs integradas (vramDynamic/null) são ignoradas — seguimos procurando
    // uma discreta. Se NENHUMA existir, `vramGb` permanece null.
  }

  const backend = pickBackend({ vramGb, gpuVendor }, platform, arch);

  return {
    backend,
    ramGb: Math.round(ramGb * 10) / 10,
    vramGb: vramGb !== null ? Math.round(vramGb * 10) / 10 : null,
    cpuModel: `${cpu.manufacturer} ${cpu.brand}`.trim(),
  };
}