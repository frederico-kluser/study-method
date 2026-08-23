/**
 * tests/onboardingPositioning.test.ts — testes PUROS do posicionamento do painel.
 *
 * Porta `onboardingPositioning.utils.test.ts` do Ondokai para node:test + tsx
 * (sem jsdom). Cobre colisão (rectsOverlap), overlap area, responsividade,
 * ordem de lados e o cálculo `calculatePanelPosition` com clamp no viewport
 * (sem sobrepor o spotlight; compact em telas pequenas; bottom-right sem alvo).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  calculatePanelPosition,
  computeOverlapArea,
  getPlacementOrder,
  getResponsiveSizeClass,
  rectsOverlap,
  type Rect,
  type ViewportSize,
} from '../src/features/onboarding/utils/onboardingPositioning.utils';

describe('rectsOverlap', () => {
  it('sobrepõe retângulos parcialmente', () => {
    const panel: Rect = { top: 100, left: 100, width: 200, height: 150 };
    const target: Rect = { top: 200, left: 150, width: 100, height: 80 };
    assert.equal(rectsOverlap(panel, target, 0), true);
  });

  it('não sobrepõe sem margem quando adjacentes', () => {
    const panel: Rect = { top: 0, left: 0, width: 200, height: 100 };
    const target: Rect = { top: 100, left: 0, width: 200, height: 100 };
    assert.equal(rectsOverlap(panel, target, 0), false);
  });

  it('a margem faz retângulos adjacentes sobreporem', () => {
    const panel: Rect = { top: 0, left: 0, width: 200, height: 100 };
    const target: Rect = { top: 100, left: 0, width: 200, height: 100 };
    assert.equal(rectsOverlap(panel, target, 12), true); // alvo expande p/ top 88
  });

  it('não sobrepõe retângulos distantes', () => {
    const panel: Rect = { top: 0, left: 0, width: 100, height: 100 };
    const target: Rect = { top: 500, left: 500, width: 100, height: 100 };
    assert.equal(rectsOverlap(panel, target, 12), false);
  });

  it('usa margem default de 12px', () => {
    const panel: Rect = { top: 0, left: 0, width: 200, height: 95 };
    const target: Rect = { top: 100, left: 0, width: 200, height: 100 };
    // Sem margem: 95 <= 100 → sem overlap; com 12px → target top 88 → overlap.
    assert.equal(rectsOverlap(panel, target), true);
  });
});

describe('computeOverlapArea', () => {
  it('devolve 0 sem sobreposição', () => {
    const a: Rect = { top: 0, left: 0, width: 100, height: 100 };
    const b: Rect = { top: 200, left: 200, width: 100, height: 100 };
    assert.equal(computeOverlapArea(a, b), 0);
  });

  it('calcula área parcial', () => {
    const a: Rect = { top: 0, left: 0, width: 100, height: 100 };
    const b: Rect = { top: 50, left: 50, width: 100, height: 100 };
    assert.equal(computeOverlapArea(a, b), 2500); // 50×50
  });

  it('área total quando um contém o outro', () => {
    const outer: Rect = { top: 0, left: 0, width: 500, height: 500 };
    const inner: Rect = { top: 100, left: 100, width: 50, height: 50 };
    assert.equal(computeOverlapArea(outer, inner), 2500);
  });
});

describe('getResponsiveSizeClass', () => {
  it('vazio para full HD e acima', () => {
    assert.equal(getResponsiveSizeClass(1920), '');
    assert.equal(getResponsiveSizeClass(2560), '');
  });
  it('medium entre 1366 e 1919', () => {
    assert.equal(getResponsiveSizeClass(1919), 'onboarding-overlay-panel--medium');
    assert.equal(getResponsiveSizeClass(1366), 'onboarding-overlay-panel--medium');
  });
  it('small entre 1024 e 1365', () => {
    assert.equal(getResponsiveSizeClass(1365), 'onboarding-overlay-panel--small');
    assert.equal(getResponsiveSizeClass(1024), 'onboarding-overlay-panel--small');
  });
  it('xsmall abaixo de 1024', () => {
    assert.equal(getResponsiveSizeClass(1023), 'onboarding-overlay-panel--xsmall');
    assert.equal(getResponsiveSizeClass(800), 'onboarding-overlay-panel--xsmall');
  });
});

describe('getPlacementOrder', () => {
  it('devolve 4 lados', () => {
    assert.equal(getPlacementOrder(0).length, 4);
  });
  it('varia com o índice do step', () => {
    assert.notDeepEqual(getPlacementOrder(0), getPlacementOrder(1));
  });
  it('cicla a cada 4 steps', () => {
    assert.deepEqual(getPlacementOrder(0), getPlacementOrder(4));
    assert.deepEqual(getPlacementOrder(1), getPlacementOrder(5));
  });
});

describe('calculatePanelPosition', () => {
  const fullHD: ViewportSize = { width: 1920, height: 1080 };
  const smallScreen: ViewportSize = { width: 1366, height: 768 };

  it('posiciona abaixo quando o alvo está no topo', () => {
    const spotlight: Rect = { top: 50, left: 400, width: 200, height: 40 };
    const pos = calculatePanelPosition(spotlight, 420, 300, fullHD, 0);
    assert.ok(pos.top >= spotlight.top + spotlight.height);
    assert.equal(pos.compact, false);
  });

  it('posiciona acima quando o alvo está embaixo', () => {
    const spotlight: Rect = { top: 900, left: 400, width: 200, height: 40 };
    const pos = calculatePanelPosition(spotlight, 420, 300, fullHD, 3); // top na frente
    assert.ok(pos.top + 300 <= spotlight.top);
    assert.equal(pos.compact, false);
  });

  it('evita colisão em viewport pequeno (1366×768)', () => {
    const spotlight: Rect = { top: 350, left: 500, width: 200, height: 40 };
    const pos = calculatePanelPosition(spotlight, 340, 250, smallScreen, 0);
    const panelRect: Rect = { top: pos.top, left: pos.left, width: pos.width, height: 250 };
    assert.equal(rectsOverlap(panelRect, spotlight, 0), false);
  });

  it('ativa modo compacto quando não cabe em tamanho normal', () => {
    const tiny: ViewportSize = { width: 600, height: 400 };
    const spotlight: Rect = { top: 100, left: 100, width: 400, height: 200 };
    const pos = calculatePanelPosition(spotlight, 400, 350, tiny, 0);
    assert.equal(pos.compact, true);
  });

  it('sem spotlight: canto inferior-direito', () => {
    const pos = calculatePanelPosition(null, 420, 300, fullHD, 0);
    assert.ok(pos.top > fullHD.height / 2);
    assert.ok(pos.left > fullHD.width / 2);
    assert.equal(pos.compact, false);
  });

  it('dá clamp dentro do viewport (nunca estoura borda)', () => {
    const spotlight: Rect = { top: -200, left: -200, width: 200, height: 40 };
    const pos = calculatePanelPosition(spotlight, 420, 300, smallScreen, 0);
    assert.ok(pos.left >= 0);
    assert.ok(pos.top >= 0);
    assert.ok(pos.top + Math.min(pos.width, 340) <= smallScreen.height, 'não estoura vertical');
  });

  it('retorna a largura EFETIVA usada na checagem (ACHADO-4: não excede o alvo)', () => {
    // panelWidth (300) < normalMaxWidth (460): a colisão usa effectiveNormalWidth
    // de 300, mas ANTES retornava width:460 (cobriria o alvo em janela estreita).
    const spotlight: Rect = { top: 50, left: 400, width: 200, height: 40 };
    const pos = calculatePanelPosition(spotlight, 300, 320, fullHD, 0);
    assert.equal(pos.width, 300, 'width deve respeitar a largura efetiva (não 460)');
    assert.equal(pos.compact, false);
    const panelRect: Rect = { top: pos.top, left: pos.left, width: pos.width, height: 320 };
    assert.equal(rectsOverlap(panelRect, spotlight, 0), false);
  });

  it('em janela estreita cabe o painel na largura efetiva (nunca > viewport)', () => {
    const narrow: ViewportSize = { width: 300, height: 400 };
    const spotlight: Rect = { top: 40, left: 30, width: 120, height: 40 };
    const pos = calculatePanelPosition(spotlight, 280, 200, narrow, 0);
    assert.ok(pos.width <= narrow.width, 'largura não pode estourar o viewport');
    // A largura retornada nunca ultrapassa a largura normal efetiva disponível.
    const margin = 8; // getEffectiveMargin(300 < 1024) → 8
    assert.ok(pos.width <= narrow.width - margin * 2, 'respeita a margem do viewport');
  });
});