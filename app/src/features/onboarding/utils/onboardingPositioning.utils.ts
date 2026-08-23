/**
 * src/features/onboarding/utils/onboardingPositioning.utils.ts
 *
 * POSICIONAMENTO do painel de instruções do tutorial.
 *
 * Portado de `ondokai/.../onboardingPositioning.utils.ts` (lógica 100% pura —
 * sem React/DOM). Garante que o painel NUNCA sobreponha o alvo (spotlight),
 * mesmo em telas menores que 1920×1080, via colisão com re-posicionamento.
 *
 * Funções exportadas (testadas em tests/onboardingPositioning.test.ts):
 *   - rectsOverlap / computeOverlapArea  — colisão de retângulos;
 *   - getPlacementOrder                 — ordem de lados por índice do step;
 *   - getResponsiveSizeClass            — classe de tamanho por largura;
 *   - calculatePanelPosition            — posição ótima (clamped no viewport);
 *   - scrollTargetIntoView              — traz o alvo para a viewport.
 */

/** Bounding rectangle usado nos cálculos de colisão. */
export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Dimensões do viewport. */
export interface ViewportSize {
  width: number;
  height: number;
}

/** Resultado do cálculo da posição do painel. */
export interface PanelPosition {
  top: number;
  left: number;
  width: number;
  compact: boolean;
}

export type PanelPlacement = 'top' | 'right' | 'bottom' | 'left';

/* ─── Constantes ──────────────────────────────────────────────────── */

/** Margem de segurança default entre o painel e o spotlight (px). */
const DEFAULT_COLLISION_MARGIN_PX = 12;
/** Gap entre painel e spotlight (px). */
const PANEL_GAP_PX = 16;
/** Distância mínima do painel à borda do viewport (px). */
const PANEL_VIEWPORT_MARGIN_PX = 18;
/** Largura máxima do painel no tamanho default (px). */
const PANEL_MAX_WIDTH_PX = 460;
/** Largura máxima do painel em modo compacto (px). */
const COMPACT_MAX_WIDTH_PX = 340;
/** Largura mínima utilizável do painel (px). */
const PANEL_MIN_WIDTH_PX = 220;

/** Breakpoints responsivos. */
const BREAKPOINT_MEDIUM_PX = 1920;
const BREAKPOINT_SMALL_PX = 1366;
const BREAKPOINT_XSMALL_PX = 1024;

/* ─── Colisão ─────────────────────────────────────────────────────── */

/**
 * True se dois retângulos se sobrepõem, com margem opcional no alvo.
 */
export function rectsOverlap(
  panelRect: Rect,
  targetRect: Rect,
  margin: number = DEFAULT_COLLISION_MARGIN_PX
): boolean {
  const expandedTarget: Rect = {
    top: targetRect.top - margin,
    left: targetRect.left - margin,
    width: targetRect.width + margin * 2,
    height: targetRect.height + margin * 2,
  };

  const panelRight = panelRect.left + panelRect.width;
  const panelBottom = panelRect.top + panelRect.height;
  const targetRight = expandedTarget.left + expandedTarget.width;
  const targetBottom = expandedTarget.top + expandedTarget.height;

  return (
    panelRect.left < targetRight &&
    panelRight > expandedTarget.left &&
    panelRect.top < targetBottom &&
    panelBottom > expandedTarget.top
  );
}

/* ─── Tamanhos responsivos ────────────────────────────────────────── */

/**
 * Sufixo de classe CSS responsivo pela largura do viewport
 * (default vazio; --medium/--small/--xsmall). O overlay aplica os
 * estilos via sx/CSS module.
 */
export function getResponsiveSizeClass(viewportWidth: number): string {
  if (viewportWidth < BREAKPOINT_XSMALL_PX) {
    return 'onboarding-overlay-panel--xsmall';
  }
  if (viewportWidth < BREAKPOINT_SMALL_PX) {
    return 'onboarding-overlay-panel--small';
  }
  if (viewportWidth < BREAKPOINT_MEDIUM_PX) {
    return 'onboarding-overlay-panel--medium';
  }
  return '';
}

function getEffectiveMaxWidth(viewportWidth: number, compact: boolean): number {
  if (compact) {
    if (viewportWidth < BREAKPOINT_XSMALL_PX) return 240;
    if (viewportWidth < BREAKPOINT_SMALL_PX) return 280;
    return COMPACT_MAX_WIDTH_PX;
  }
  if (viewportWidth < BREAKPOINT_XSMALL_PX) return 280;
  if (viewportWidth < BREAKPOINT_SMALL_PX) return 340;
  if (viewportWidth < BREAKPOINT_MEDIUM_PX) return 400;
  return PANEL_MAX_WIDTH_PX;
}

function getEffectiveGap(viewportWidth: number): number {
  if (viewportWidth < BREAKPOINT_XSMALL_PX) return 6;
  if (viewportWidth < BREAKPOINT_SMALL_PX) return 10;
  if (viewportWidth < BREAKPOINT_MEDIUM_PX) return 12;
  return PANEL_GAP_PX;
}

function getEffectiveMargin(viewportWidth: number): number {
  if (viewportWidth < BREAKPOINT_XSMALL_PX) return 8;
  if (viewportWidth < BREAKPOINT_SMALL_PX) return 12;
  if (viewportWidth < BREAKPOINT_MEDIUM_PX) return 14;
  return PANEL_VIEWPORT_MARGIN_PX;
}

/* ─── Posicionamento ──────────────────────────────────────────────── */

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Ordem priorizada de lados do painel, variando por índice do step
 * (evita monotonia visual entre steps).
 */
export function getPlacementOrder(stepIndex: number): PanelPlacement[] {
  const orders: PanelPlacement[][] = [
    ['bottom', 'right', 'left', 'top'],
    ['right', 'bottom', 'top', 'left'],
    ['left', 'top', 'bottom', 'right'],
    ['top', 'right', 'left', 'bottom'],
  ];
  return orders[stepIndex % orders.length];
}

function computePlacementPosition(
  placement: PanelPlacement,
  spotlight: Rect,
  panelWidth: number,
  panelHeight: number,
  viewport: ViewportSize,
  gap: number,
  margin: number
): { top: number; left: number } {
  const centerX = spotlight.left + spotlight.width / 2;
  const centerY = spotlight.top + spotlight.height / 2;
  const maxLeft = Math.max(margin, viewport.width - panelWidth - margin);
  const maxTop = Math.max(margin, viewport.height - panelHeight - margin);

  let top: number;
  let left: number;

  switch (placement) {
    case 'bottom':
      top = spotlight.top + spotlight.height + gap;
      left = centerX - panelWidth / 2;
      break;
    case 'top':
      top = spotlight.top - panelHeight - gap;
      left = centerX - panelWidth / 2;
      break;
    case 'right':
      top = centerY - panelHeight / 2;
      left = spotlight.left + spotlight.width + gap;
      break;
    case 'left':
      top = centerY - panelHeight / 2;
      left = spotlight.left - panelWidth - gap;
      break;
  }

  top = clamp(top, margin, maxTop);
  left = clamp(left, margin, maxLeft);

  return { top, left };
}

/**
 * Calcula a posição ótima do painel de instruções.
 *
 * Estratégia:
 * 1. Tenta cada lado na ordem prioritária (tamanho normal);
 * 2. Se todos colidirem, tenta em modo COMPACTO (painel menor);
 * 3. Se ainda colidir, escolhe o lado com MENOR área de sobreposição.
 *
 * Sem spotlight: painel no canto inferior-direito.
 */
export function calculatePanelPosition(
  spotlight: Rect | null,
  panelWidth: number,
  panelHeight: number,
  viewport: ViewportSize,
  stepIndex: number
): PanelPosition {
  const margin = getEffectiveMargin(viewport.width);
  const gap = getEffectiveGap(viewport.width);
  const normalMaxWidth = getEffectiveMaxWidth(viewport.width, false);
  const compactMaxWidth = getEffectiveMaxWidth(viewport.width, true);

  const availableWidth = Math.max(PANEL_MIN_WIDTH_PX, viewport.width - margin * 2);

  if (!spotlight) {
    const w = Math.min(normalMaxWidth, availableWidth);
    const effectiveWidth = Math.min(w, panelWidth || w);
    return {
      top: clamp(viewport.height - panelHeight - margin, margin, viewport.height - margin),
      left: clamp(viewport.width - effectiveWidth - margin, margin, viewport.width - margin),
      width: w,
      compact: false,
    };
  }

  const placements = getPlacementOrder(stepIndex);
  const effectiveNormalWidth = Math.min(normalMaxWidth, availableWidth, panelWidth || normalMaxWidth);

  for (const placement of placements) {
    const pos = computePlacementPosition(
      placement, spotlight, effectiveNormalWidth, panelHeight, viewport, gap, margin
    );
    const panelRect: Rect = {
      top: pos.top,
      left: pos.left,
      width: effectiveNormalWidth,
      height: panelHeight,
    };
    if (!rectsOverlap(panelRect, spotlight)) {
      // ACHADO-4: retorna a LARGURA EFETIVA usada na checagem de colisão (não a
      // nominal) — em janela estreita `normalMaxWidth` cobriria o alvo.
      return { top: pos.top, left: pos.left, width: effectiveNormalWidth, compact: false };
    }
  }

  const compactHeight = panelHeight * 0.75;
  const effectiveCompactWidth = Math.min(compactMaxWidth, availableWidth);

  for (const placement of placements) {
    const pos = computePlacementPosition(
      placement, spotlight, effectiveCompactWidth, compactHeight, viewport, gap, margin
    );
    const panelRect: Rect = {
      top: pos.top,
      left: pos.left,
      width: effectiveCompactWidth,
      height: compactHeight,
    };
    if (!rectsOverlap(panelRect, spotlight)) {
      return { top: pos.top, left: pos.left, width: effectiveCompactWidth, compact: true };
    }
  }

  let bestPosition: PanelPosition | null = null;
  let minOverlapArea = Infinity;

  for (const placement of placements) {
    const pos = computePlacementPosition(
      placement, spotlight, effectiveCompactWidth, compactHeight, viewport, gap, margin
    );
    const panelRect: Rect = {
      top: pos.top,
      left: pos.left,
      width: effectiveCompactWidth,
      height: compactHeight,
    };
    const overlapArea = computeOverlapArea(panelRect, spotlight);
    if (overlapArea < minOverlapArea) {
      minOverlapArea = overlapArea;
      bestPosition = {
        top: pos.top,
        left: pos.left,
        width: effectiveCompactWidth,
        compact: true,
      };
    }
  }

  return bestPosition as PanelPosition;
}

/** Área de sobreposição (px²) entre dois retângulos — 0 se não sobrepõem. */
export function computeOverlapArea(a: Rect, b: Rect): number {
  const overlapLeft = Math.max(a.left, b.left);
  const overlapRight = Math.min(a.left + a.width, b.left + b.width);
  const overlapTop = Math.max(a.top, b.top);
  const overlapBottom = Math.min(a.top + a.height, b.top + b.height);

  const overlapWidth = Math.max(0, overlapRight - overlapLeft);
  const overlapHeight = Math.max(0, overlapBottom - overlapTop);

  return overlapWidth * overlapHeight;
}

/**
 * Centraliza o alvo na viewport quando ele está fora do viewport, para o
 * spotlight nunca mirar um rect desconhecido. No-op quando já visível.
 *
 * Aceita um elemento com o formato DOM mínimo (compatível com o lib ES2022 dos
 * testes; no renderer é um elemento real).
 */
export interface RevealableElement {
  getBoundingClientRect(): { top: number; left: number; width: number; height: number };
  scrollIntoView(opts?: { block?: string; inline?: string; behavior?: string }): void;
}

export function scrollTargetIntoView(el: RevealableElement, smooth = true): void {
  // `window` não existe sob o lib ES2022 dos testes; aqui lemos via globalThis.
  const g = globalThis as unknown as { innerWidth?: number; innerHeight?: number };
  const vh = g.innerHeight ?? 0;
  const vw = g.innerWidth ?? 0;
  if (vh === 0 || vw === 0) {
    return; // sem viewport (nó/teste) → no-op.
  }
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return;
  }
  const margin = 24;
  const inView =
    rect.top >= margin &&
    rect.left >= 0 &&
    rect.top + rect.height <= vh - margin &&
    rect.left + rect.width <= vw;
  if (inView) {
    return;
  }
  el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: smooth ? 'smooth' : 'auto' });
}