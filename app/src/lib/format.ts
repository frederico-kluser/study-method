/**
 * src/lib/format.ts — formatadores puros da UI (sem React, sem window, sem DOM).
 *
 * Funções puras extraídas das views para serem testáveis via node:test sem
 * jsdom. Cada entrada documenta a unidade/formato de saída.
 */

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/**
 * Formata um número de bytes em uma string legível com a unidade mais próxima.
 * Ex.: formatBytes(0) → '0 B'; formatBytes(1536) → '1.50 KB'.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const fixed = value >= 100 ? value.toFixed(0) : value.toFixed(2);
  return `${fixed} ${BYTE_UNITS[unitIndex]}`;
}

/**
 * Formata uma taxa de transferência em bytes/segundo.
 * Ex.: formatSpeedBps(0) → '0 B/s'; formatSpeedBps(2.5e6) → '2.38 MB/s'.
 */
export function formatSpeedBps(speedBps: number): string {
  if (!Number.isFinite(speedBps) || speedBps <= 0) return '0 B/s';
  return `${formatBytes(speedBps)}/s`;
}

/**
 * Rótulo curto de um modelo local para exibir num card.
 * Prefere `label`; sem ele monta `quant` + id.
 */
export function formatModelLabel(model: {
  label?: string;
  quant?: string;
  id: string;
}): string {
  const base = model.label && model.label.trim() ? model.label.trim() : model.id;
  if (model.quant && model.quant.trim()) return `${base} · ${model.quant}`;
  return base;
}

/** Percentual de download clampado a [0, 100], sem casas decimais. */
export function formatPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  return Math.max(0, Math.min(100, Math.round(percent)));
}