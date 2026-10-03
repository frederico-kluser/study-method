/**
 * src/features/onboarding/logic/spotlightGeometry.ts
 *
 * GEOMETRIA PURA do spotlight do overlay de onboarding — o "cálculo do
 * spotlight/reposicionamento" que vivia solto no corpo do `OnboardingOverlay`
 * (797 linhas) e agora mora aqui, testável por node:test sem jsdom.
 *
 * É a continuação da extração modelada por `stepTargetPresence.ts` /
 * `onboardingSignals.ts`: funções PURAS, com o DOM reduzido a uma forma
 * mínima (`TargetDocumentLike`) que os testes substituem por um objeto falso.
 * Nada de React, nada de efeitos, nada de CSS — só retângulos.
 *
 * O que aqui está (e onde era usado no overlay):
 *   - `resolveTargetElement` / `resolveStepTargetElement` — que alvo o passo
 *     ilumina (alternativo ANTES do primário; índice 0/-1/n) — era
 *     `findTargetElement`, chamado em 3 efeitos;
 *   - `spotlightRectFromBounds` — bounding rect → rect do spotlight (com a
 *     folga `SPOTLIGHT_PADDING` e o clamp à margem) — era `toSpotlightRect`;
 *   - `spotlightMaskSegments` — os 4 segmentos da máscara à volta do recorte
 *     (ou a máscara cheia sem alvo) — era o `useMemo` `maskSegments`;
 *   - `rectCenterInSpotlight` / `shouldBlockOutsideInteraction` — a decisão de
 *     bloquear interação FORA do spotlight (reforço das máscaras) — era o
 *     `blockInteraction` do listener global de capture;
 *   - `panelOverlapsSpotlight` — o painel pisou o alvo? (desliga os ponteiros
 *     do painel mantendo os botões vivos) — era o `useMemo`
 *     `panelOverlapsSpotlight`;
 *   - `viewportSizesEqual` / `spotlightRectsEqual` — as comparações por valor
 *     que evitam re-render por quadro no loop de RAF.
 *
 * O reposicionamento do PAINEL já é puro em
 * `../utils/onboardingPositioning.utils.ts` (`calculatePanelPosition`); este
 * módulo não o duplica — o overlay continua a chamá-lo de lá.
 *
 * COMPORTAMENTO PRESERVADO AO PIXEL: cada função reproduz exatamente a
 * aritmética que vivia no componente (incluindo o clamp assimétrico de
 * `spotlightRectFromBounds` — quando o alvo encosta ao topo/esquerda, o
 * retângulo cresce para baixo/direita em vez de deslocar; e o bloqueio que
 * NÃO existe enquanto não há spotlight). Os testes em
 * `tests/onboardingSpotlightGeometry.test.ts` congelam isso.
 */

import { rectsOverlap } from '../utils/onboardingPositioning.utils';

/** Rect do spotlight (top/left do canto superior esquerdo + tamanho). */
export interface SpotlightRect {
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

/** Um segmento da máscara que envolve o recorte do spotlight. */
export interface SpotlightMaskSegment {
  key: 'top' | 'left' | 'right' | 'bottom' | 'full';
  style: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
}

/**
 * Forma mínima de documento para resolver o alvo de um passo (o mesmo
 * espírito do `SignalDocumentLike` de `onboardingSignals.ts`): os testes
 * injetam um objeto falso, o overlay injeta `document`.
 */
export interface TargetDocumentLike {
  querySelector(selector: string): unknown;
  querySelectorAll(selector: string): ArrayLike<unknown>;
}

/** Forma mínima de alvo medível (o `getBoundingClientRect` do DOM). */
export interface MeasurableTarget {
  getBoundingClientRect(): SpotlightRect;
}

/** Seletor do passo com as regras de índice que o overlay aplica. */
export interface StepTargetSelection {
  targetSelector: string;
  alternateTargetSelector?: string;
  targetSelectorIndex?: number;
}

/** Folga do spotlight à volta do alvo (px) — era a constante do overlay. */
export const SPOTLIGHT_PADDING = 10;

/** Raio do recorte do spotlight (px) — era a constante do overlay. */
export const SPOTLIGHT_RADIUS = 12;

/* ─── Resolução do alvo ───────────────────────────────────────────────────── */

/**
 * Resolve o alvo de um seletor: sem índice (ou índice 0) é o PRIMEIRO match;
 * `-1` é o ÚLTIMO; outro índice é o match n-ésimo (fora do intervalo → null).
 * Seletor vazio/omisso → null (nada a iluminar).
 */
export function resolveTargetElement<T>(
  doc: TargetDocumentLike,
  selector?: string,
  index?: number,
): T | null {
  if (!selector) return null;
  if (index !== undefined && index !== 0) {
    const all = doc.querySelectorAll(selector);
    if (all.length === 0) return null;
    const picked = index === -1 ? all[all.length - 1] : all[index];
    return (picked ?? null) as T | null;
  }
  return (doc.querySelector(selector) ?? null) as T | null;
}

/**
 * O alvo que o passo ilumina AGORA: o ALTERNATIVO primeiro (o overlay tenta-o
 * antes do primário — ex.: modal/panel por cima do alvo base) e o primário
 * como fallback, com as regras de índice do `targetSelectorIndex`.
 */
export function resolveStepTargetElement<T>(
  doc: TargetDocumentLike,
  step: StepTargetSelection,
): T | null {
  return (
    resolveTargetElement<T>(doc, step.alternateTargetSelector) ??
    resolveTargetElement<T>(doc, step.targetSelector, step.targetSelectorIndex)
  );
}

/* ─── Geometria do spotlight ──────────────────────────────────────────────── */

/**
 * Bounding rect do alvo → rect do spotlight, com folga `padding` em toda a
 * volta e clamp do canto superior esquerdo a 0. Comportamento PRESERVADO do
 * overlay: o clamp é assimétrico (largura/altura mantêm a folga toda), então
 * um alvo encostado ao topo ganha 10px extra em baixo — é o desenho atual,
 * congelado aqui de propósito.
 *
 * Alvo invisível (largura/altura ≤ 0) → null: sem alvo não há spotlight.
 */
export function spotlightRectFromBounds(
  bounds: SpotlightRect,
  padding: number = SPOTLIGHT_PADDING,
): SpotlightRect | null {
  if (bounds.width <= 0 || bounds.height <= 0) return null;
  return {
    top: Math.max(0, bounds.top - padding),
    left: Math.max(0, bounds.left - padding),
    width: bounds.width + padding * 2,
    height: bounds.height + padding * 2,
  };
}

/** Igualdade por valor de dois viewports (evita re-render por quadro). */
export function viewportSizesEqual(a: ViewportSize, b: ViewportSize): boolean {
  return a.width === b.width && a.height === b.height;
}

/** Igualdade por valor de dois rects de spotlight (null == null). */
export function spotlightRectsEqual(
  a: SpotlightRect | null,
  b: SpotlightRect | null,
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;
}

/**
 * Os segmentos da máscara que bloqueiam a interação FORA do recorte:
 * 4 retângulos (topo/esquerda/direita/baixo) à volta do spotlight. Sem
 * spotlight, a máscara é UMA peça cheia (nada é revelado).
 */
export function spotlightMaskSegments(
  spotlight: SpotlightRect | null,
  viewport: ViewportSize,
): SpotlightMaskSegment[] {
  if (!spotlight) {
    return [
      {
        key: 'full',
        style: { top: 0, left: 0, width: viewport.width, height: viewport.height },
      },
    ];
  }
  const bottomTop = spotlight.top + spotlight.height;
  const rightLeft = spotlight.left + spotlight.width;
  const rightWidth = Math.max(0, viewport.width - rightLeft);
  const bottomHeight = Math.max(0, viewport.height - bottomTop);
  return [
    {
      key: 'top',
      style: { top: 0, left: 0, width: viewport.width, height: Math.max(0, spotlight.top) },
    },
    {
      key: 'left',
      style: {
        top: spotlight.top,
        left: 0,
        width: Math.max(0, spotlight.left),
        height: spotlight.height,
      },
    },
    {
      key: 'right',
      style: { top: spotlight.top, left: rightLeft, width: rightWidth, height: spotlight.height },
    },
    {
      key: 'bottom',
      style: { top: bottomTop, left: 0, width: viewport.width, height: bottomHeight },
    },
  ];
}

/* ─── Bloqueio de interação fora do spotlight ─────────────────────────────── */

/** O centro de `rect` cai dentro do spotlight? */
export function rectCenterInSpotlight(spotlight: SpotlightRect, rect: SpotlightRect): boolean {
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  return (
    centerX >= spotlight.left &&
    centerX <= spotlight.left + spotlight.width &&
    centerY >= spotlight.top &&
    centerY <= spotlight.top + spotlight.height
  );
}

/**
 * A interação sobre `targetRect` deve ser BLOQUEADA? (o reforço do listener de
 * capture por cima das máscaras). Regras preservadas do overlay:
 *   - sem spotlight, nada é bloqueado (a entrada ainda não pousou);
 *   - alvo dentro dos painéis do overlay (instruções / confirmação) passa;
 *   - alvo cujo centro cai no recorte passa (é a ação que o passo ensina);
 *   - todo o resto é bloqueado.
 */
export function shouldBlockOutsideInteraction(args: {
  spotlight: SpotlightRect | null;
  targetRect: SpotlightRect;
  insidePanel: boolean;
  insideConfirm: boolean;
}): boolean {
  const { spotlight, targetRect, insidePanel, insideConfirm } = args;
  if (!spotlight) return false;
  if (insidePanel || insideConfirm) return false;
  return !rectCenterInSpotlight(spotlight, targetRect);
}

/* ─── Painel × spotlight ──────────────────────────────────────────────────── */

/**
 * O painel de instruções sobrepõe-se ao spotlight? (sem spotlight → false).
 * É o sinal que o overlay usa para desligar os ponteiros do painel e manter o
 * alvo revelado clicável. A colisão em si é a do contrato de posicionamento
 * (`rectsOverlap` de `onboardingPositioning.utils`, margem 0) — aqui só se
 * acrescenta a regra "sem alvo, não há sobreposição".
 */
export function panelOverlapsSpotlight(
  panel: SpotlightRect,
  spotlight: SpotlightRect | null,
): boolean {
  if (!spotlight) return false;
  return rectsOverlap(panel, spotlight, 0);
}