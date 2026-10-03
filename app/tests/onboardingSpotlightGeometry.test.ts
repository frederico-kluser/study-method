/**
 * tests/onboardingSpotlightGeometry.test.ts — a GEOMETRIA PURA do spotlight do
 * OnboardingOverlay (`src/features/onboarding/logic/spotlightGeometry.ts`).
 *
 * O overlay mede alvos `[data-onboarding-*]` com `getBoundingClientRect`,
 * recorta a máscara à volta do spotlight, bloqueia interação fora do recorte e
 * decide quando o painel pisou o alvo. Tudo isso vivia no corpo do componente
 * (React + efeitos) e agora é função pura — este arquivo congela o
 * COMPORTAMENTO AO PIXEL, incluindo as decisões menos óbvias:
 *
 *   1. RESOLUÇÃO DE ALVO — alternativo ANTES do primário; índice 0 = primeiro,
 *      -1 = último, n = n-ésimo; seletor vazio/fora do intervalo = null.
 *   2. RECT DO SPOTLIGHT — folga de 10px à volta, clamp assimétrico do canto
 *      superior esquerdo (alvo encostado ao topo ganha a folga em baixo — é o
 *      desenho atual, não um bug a "consertar" aqui); alvo invisível (0×0)
 *      devolve null.
 *   3. MÁSCARA — 4 segmentos (topo/esquerda/direita/baixo) com o recorte no
 *      meio; sem alvo, UMA máscara cheia.
 *   4. BLOQUEIO DE INTERAÇÃO — sem alvo nada é bloqueado; painéis do overlay
 *      passam; centro dentro do recorte passa; o resto é bloqueado.
 *   5. PAINEL × SPOTLIGHT — sobreposição com margem 0 (regra do
 *      `rectsOverlap` do contrato de posicionamento); sem alvo não há
 *      sobreposição.
 *   6. IGUALDADES POR VALOR — as comparações que evitam re-render por quadro
 *      no loop de RAF (null == null, e diferença em qualquer campo reprova).
 *
 * Sem jsdom (node:test + tsx): o "DOM" é um objeto falso com a forma mínima
 * `TargetDocumentLike`/`MeasurableTarget` — o mesmo padrão de
 * `tests/stepTargetPresence.test.ts` / `tests/onboardingSignals.test.ts`.
 *
 * Reprodução: `cd app && bash tools/t.sh tests/onboardingSpotlightGeometry.test.ts`
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  panelOverlapsSpotlight,
  rectCenterInSpotlight,
  resolveStepTargetElement,
  resolveTargetElement,
  shouldBlockOutsideInteraction,
  spotlightMaskSegments,
  spotlightRectFromBounds,
  spotlightRectsEqual,
  viewportSizesEqual,
  SPOTLIGHT_PADDING,
  SPOTLIGHT_RADIUS,
  type SpotlightRect,
  type TargetDocumentLike,
} from '../src/features/onboarding/logic/spotlightGeometry';

/* ─── Fakes mínimos (a forma que o módulo exige) ──────────────────────────── */

interface FakeTarget {
  getBoundingClientRect(): SpotlightRect;
}

function target(rect: SpotlightRect): FakeTarget {
  return { getBoundingClientRect: () => rect };
}

function fakeDoc(matches: Record<string, FakeTarget[]>): TargetDocumentLike {
  return {
    querySelector: (selector: string) => matches[selector]?.[0] ?? null,
    querySelectorAll: (selector: string) => matches[selector] ?? [],
  };
}

/* ─── 1. Resolução de alvo ────────────────────────────────────────────────── */

describe('resolveTargetElement', () => {
  const first = target({ top: 0, left: 0, width: 10, height: 10 });
  const second = target({ top: 20, left: 0, width: 10, height: 10 });
  const third = target({ top: 40, left: 0, width: 10, height: 10 });
  const doc = fakeDoc({ '[data-onboarding-target="nav-tabs"]': [first, second, third] });

  it('seletor vazio/omisso → null (nada a iluminar)', () => {
    assert.equal(resolveTargetElement(doc, undefined), null);
    assert.equal(resolveTargetElement(doc, ''), null);
  });

  it('sem índice (ou índice 0) é o PRIMEIRO match', () => {
    assert.equal(resolveTargetElement(doc, '[data-onboarding-target="nav-tabs"]'), first);
    assert.equal(resolveTargetElement(doc, '[data-onboarding-target="nav-tabs"]', 0), first);
  });

  it('índice -1 é o ÚLTIMO match', () => {
    assert.equal(resolveTargetElement(doc, '[data-onboarding-target="nav-tabs"]', -1), third);
  });

  it('índice n é o match n-ésimo; fora do intervalo → null', () => {
    assert.equal(resolveTargetElement(doc, '[data-onboarding-target="nav-tabs"]', 1), second);
    assert.equal(resolveTargetElement(doc, '[data-onboarding-target="nav-tabs"]', 9), null);
  });

  it('seletor sem matches → null (inclusive para -1)', () => {
    assert.equal(resolveTargetElement(doc, '[data-onboarding-target="inexistente"]'), null);
    assert.equal(resolveTargetElement(doc, '[data-onboarding-target="inexistente"]', -1), null);
  });
});

describe('resolveStepTargetElement', () => {
  const alt = target({ top: 0, left: 0, width: 8, height: 8 });
  const primary = target({ top: 99, left: 0, width: 8, height: 8 });

  it('o ALTERNATIVO é tentado ANTES do primário', () => {
    const doc = fakeDoc({
      '[data-onboarding-target="challenge-editor"]': [primary],
      '[data-onboarding-target="nav-tabs"]': [alt],
    });
    const step = {
      targetSelector: '[data-onboarding-target="challenge-editor"]',
      alternateTargetSelector: '[data-onboarding-target="nav-tabs"]',
    };
    assert.equal(resolveStepTargetElement(doc, step), alt);
  });

  it('alternativo ausente → cai no primário (com as regras de índice)', () => {
    const doc = fakeDoc({ '[data-onboarding-target="nav-tabs"]': [alt, primary] });
    const step = {
      targetSelector: '[data-onboarding-target="nav-tabs"]',
      alternateTargetSelector: '[data-onboarding-target="modal"]',
      targetSelectorIndex: -1,
    };
    assert.equal(resolveStepTargetElement(doc, step), primary);
  });

  it('sem alternativo definido → primário direto', () => {
    const doc = fakeDoc({ '[data-onboarding-target="nav-tabs"]': [alt] });
    const step = { targetSelector: '[data-onboarding-target="nav-tabs"]' };
    assert.equal(resolveStepTargetElement(doc, step), alt);
  });
});

/* ─── 2. Rect do spotlight ────────────────────────────────────────────────── */

describe('spotlightRectFromBounds', () => {
  it('aplica a folga em toda a volta (SPOTLIGHT_PADDING = 10)', () => {
    assert.equal(SPOTLIGHT_PADDING, 10);
    assert.deepEqual(
      spotlightRectFromBounds({ top: 100, left: 50, width: 20, height: 30 }),
      { top: 90, left: 40, width: 40, height: 50 },
    );
  });

  it('clampa o canto superior esquerdo a 0 e mantém a folga total (comportamento do overlay)', () => {
    // Alvo em (0,0): o rect NÃO desloca — cresce para baixo/direita.
    assert.deepEqual(
      spotlightRectFromBounds({ top: 2, left: 1, width: 20, height: 30 }),
      { top: 0, left: 0, width: 40, height: 50 },
    );
  });

  it('alvo invisível (largura/altura ≤ 0) → null: sem alvo não há spotlight', () => {
    assert.equal(spotlightRectFromBounds({ top: 0, left: 0, width: 0, height: 10 }), null);
    assert.equal(spotlightRectFromBounds({ top: 0, left: 0, width: 10, height: 0 }), null);
    assert.equal(spotlightRectFromBounds({ top: 0, left: 0, width: -5, height: 10 }), null);
  });

  it('aceita folga explícita (a constante é só o default)', () => {
    assert.deepEqual(
      spotlightRectFromBounds({ top: 10, left: 10, width: 10, height: 10 }, 0),
      { top: 10, left: 10, width: 10, height: 10 },
    );
  });
});

/* ─── 3. Máscara ──────────────────────────────────────────────────────────── */

describe('spotlightMaskSegments', () => {
  it('sem spotlight → UMA máscara cheia sobre o viewport todo', () => {
    assert.deepEqual(spotlightMaskSegments(null, { width: 800, height: 600 }), [
      { key: 'full', style: { top: 0, left: 0, width: 800, height: 600 } },
    ]);
  });

  it('com spotlight → 4 segmentos com o recorte no meio', () => {
    const spotlight = { top: 100, left: 200, width: 50, height: 60 };
    const segments = spotlightMaskSegments(spotlight, { width: 800, height: 600 });
    assert.deepEqual(
      segments.map((s) => s.key),
      ['top', 'left', 'right', 'bottom'],
    );
    assert.deepEqual(segments[0]?.style, { top: 0, left: 0, width: 800, height: 100 });
    assert.deepEqual(segments[1]?.style, { top: 100, left: 0, width: 200, height: 60 });
    assert.deepEqual(segments[2]?.style, { top: 100, left: 250, width: 550, height: 60 });
    assert.deepEqual(segments[3]?.style, { top: 160, left: 0, width: 800, height: 440 });
  });

  it('spotlight colado à origem: segmentos de topo/esquerda têm altura/largura 0 (nunca negativos)', () => {
    const segments = spotlightMaskSegments(
      { top: 0, left: 0, width: 50, height: 60 },
      { width: 800, height: 600 },
    );
    assert.deepEqual(segments[0]?.style.height, 0);
    assert.deepEqual(segments[1]?.style.width, 0);
  });

  it('spotlight maior que o viewport nunca produz largura/altura negativas', () => {
    const segments = spotlightMaskSegments(
      { top: 100, left: 780, width: 200, height: 60 },
      { width: 800, height: 600 },
    );
    assert.deepEqual(segments[2]?.style.width, 0);
  });
});

/* ─── 4. Bloqueio de interação ────────────────────────────────────────────── */

describe('shouldBlockOutsideInteraction / rectCenterInSpotlight', () => {
  const spotlight = { top: 100, left: 100, width: 100, height: 100 };

  it('sem spotlight NADA é bloqueado (a entrada ainda não pousou)', () => {
    assert.equal(
      shouldBlockOutsideInteraction({
        spotlight: null,
        targetRect: { top: 0, left: 0, width: 10, height: 10 },
        insidePanel: false,
        insideConfirm: false,
      }),
      false,
    );
  });

  it('alvo dentro dos painéis do overlay (instruções ou confirmação) passa', () => {
    for (const flags of [
      { insidePanel: true, insideConfirm: false },
      { insidePanel: false, insideConfirm: true },
    ]) {
      assert.equal(
        shouldBlockOutsideInteraction({
          spotlight,
          targetRect: { top: 0, left: 0, width: 10, height: 10 },
          ...flags,
        }),
        false,
      );
    }
  });

  it('centro dentro do recorte passa (é a ação que o passo ensina)', () => {
    // Centro em (150,150) — dentro de [100..200]×[100..200].
    assert.equal(
      rectCenterInSpotlight(spotlight, { top: 145, left: 145, width: 10, height: 10 }),
      true,
    );
    assert.equal(
      shouldBlockOutsideInteraction({
        spotlight,
        targetRect: { top: 145, left: 145, width: 10, height: 10 },
        insidePanel: false,
        insideConfirm: false,
      }),
      false,
    );
  });

  it('centro fora do recorte é BLOQUEADO (clique com centro fora, mesmo com borda dentro)', () => {
    assert.equal(
      shouldBlockOutsideInteraction({
        spotlight,
        targetRect: { top: 190, left: 190, width: 200, height: 200 },
        insidePanel: false,
        insideConfirm: false,
      }),
      true,
    );
    assert.equal(
      shouldBlockOutsideInteraction({
        spotlight,
        targetRect: { top: 0, left: 0, width: 10, height: 10 },
        insidePanel: false,
        insideConfirm: false,
      }),
      true,
    );
  });

  it('fronteiras do recorte contam como dentro (>= e <=)', () => {
    // Centro exatamente no canto (100,100).
    assert.equal(
      rectCenterInSpotlight(spotlight, { top: 99, left: 99, width: 2, height: 2 }),
      true,
    );
  });
});

/* ─── 5. Painel × spotlight ───────────────────────────────────────────────── */

describe('panelOverlapsSpotlight', () => {
  it('sem spotlight → false (nada para sobrepor)', () => {
    assert.equal(
      panelOverlapsSpotlight({ top: 0, left: 0, width: 420, height: 320 }, null),
      false,
    );
  });

  it('painel por cima do alvo → true; separados → false (margem 0)', () => {
    const spotlight = { top: 100, left: 100, width: 100, height: 100 };
    assert.equal(
      panelOverlapsSpotlight({ top: 150, left: 150, width: 420, height: 320 }, spotlight),
      true,
    );
    assert.equal(
      panelOverlapsSpotlight({ top: 300, left: 300, width: 420, height: 320 }, spotlight),
      false,
    );
    // Encostado exatamente (borda a borda) NÃO conta como sobreposição.
    assert.equal(
      panelOverlapsSpotlight({ top: 100, left: 200, width: 420, height: 320 }, spotlight),
      false,
    );
  });
});

/* ─── 6. Igualdades por valor ─────────────────────────────────────────────── */

describe('viewportSizesEqual / spotlightRectsEqual', () => {
  it('viewports iguais/diferentes', () => {
    assert.equal(viewportSizesEqual({ width: 800, height: 600 }, { width: 800, height: 600 }), true);
    assert.equal(viewportSizesEqual({ width: 800, height: 600 }, { width: 801, height: 600 }), false);
    assert.equal(viewportSizesEqual({ width: 800, height: 600 }, { width: 800, height: 599 }), false);
  });

  it('spotlights: null == null, null != rect, e qualquer campo divergente reprova', () => {
    const base = { top: 1, left: 2, width: 3, height: 4 };
    assert.equal(spotlightRectsEqual(null, null), true);
    assert.equal(spotlightRectsEqual(base, null), false);
    assert.equal(spotlightRectsEqual(null, base), false);
    assert.equal(spotlightRectsEqual(base, { ...base }), true);
    assert.equal(spotlightRectsEqual(base, { ...base, top: 9 }), false);
    assert.equal(spotlightRectsEqual(base, { ...base, left: 9 }), false);
    assert.equal(spotlightRectsEqual(base, { ...base, width: 9 }), false);
    assert.equal(spotlightRectsEqual(base, { ...base, height: 9 }), false);
  });
});

/* ─── Constantes do spotlight congeladas ──────────────────────────────────── */

describe('constantes', () => {
  it('SPOTLIGHT_RADIUS continua 12 (o raio do recorte do CSS module)', () => {
    assert.equal(SPOTLIGHT_RADIUS, 12);
  });
});
