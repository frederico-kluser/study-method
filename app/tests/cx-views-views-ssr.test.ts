/**
 * tests/cx-views-views-ssr.test.ts — GOLDEN MASTER do que as VIEWS DE SHELL
 * entregam à tela (`placeholders.tsx`, `RoadmapView.tsx`) e do núcleo de
 * posicionamento do `OnboardingOverlay`, para as ondas de refatoração.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O QUE ESTE ARQUIVO É
 * ══════════════════════════════════════════════════════════════════════════
 * Caracterização via `react-dom/server` — a técnica que esta base já adotou
 * para provar "o que chega à tela" sem jsdom (precedentes:
 * tests/quizOverlayRender.test.ts, tests/lessonChatLayout.test.ts). Monta os
 * componentes REAIS, com o tema REAL e os textos REAIS de pt-BR, no estado
 * inicial (sem IPC: os efeitos não rodam em SSR, então este é justamente o
 * estado VAZIO — carregando/onboarding — que a refatoração precisa preservar).
 *
 * O `OnboardingOverlay.tsx` em si NÃO é importável sob `node --import tsx`
 * (ele importa um CSS Module e o loader de CSS desta base é o do Electron):
 * o contrato observável dele que existe sem DOM é o núcleo PURO de
 * posicionamento (`onboardingPositioning.utils`), que é 100% da decisão de
 * onde o painel/spotlight caem — coberto ao final. A limitação está declarada
 * no handoff.
 *
 * Reprodução: `cd app && npm test -- tests/cx-views-views-ssr.test.ts`
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemeProvider } from '@mui/material/styles';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import { theme } from '../src/theme';
import ptBR from '../src/i18n/locales/pt-BR/translation.json';
import {
  calculatePanelPosition,
  computeOverlapArea,
  getPlacementOrder,
  getResponsiveSizeClass,
  rectsOverlap,
  scrollTargetIntoView,
  type Rect,
  type RevealableElement,
} from '../src/features/onboarding/utils/onboardingPositioning.utils';

/* ─── Os módulos .tsx chegam por import dinâmico (o idioma da casa) ───────── */

const HOME_MODULE = new URL('../src/views/placeholders.tsx', import.meta.url).href;
const ROADMAP_MODULE = new URL('../src/views/RoadmapView/RoadmapView.tsx', import.meta.url).href;

interface ViewProps {
  setupsDir?: string;
  onNavigate?: (key: string) => void;
}

let HomeView: ComponentType<ViewProps>;
let RoadmapView: ComponentType<ViewProps>;

before(async () => {
  process.env.I18NEXT_NO_SUPPORT_NOTICE = '1';
  // Os textos REAIS de pt-BR, com a MESMA interpolação da produção
  // (`escapeValue: false` — ver tests/quizOverlayRender.test.ts, que explica
  // por que o default do harness mediria uma string que o app nunca emite).
  await i18next.use(initReactI18next).init({
    lng: 'pt-BR',
    interpolation: { escapeValue: false },
    resources: { 'pt-BR': { translation: ptBR } },
  });
  const home = (await import(HOME_MODULE)) as unknown as { HomeView: ComponentType<ViewProps> };
  HomeView = home.HomeView;
  const roadmap = (await import(ROADMAP_MODULE)) as unknown as { RoadmapView: ComponentType<ViewProps> };
  RoadmapView = roadmap.RoadmapView;
});

/** O TEXTO que chega à tela: HTML sem folhas de estilo nem tags. */
function onScreen(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderView(Comp: ComponentType<ViewProps>, props: ViewProps = {}): string {
  return renderToStaticMarkup(
    createElement(ThemeProvider, { theme }, createElement(Comp, props)),
  );
}

/* ══════════════════════════════════════════════════════════════════════════
 * 1. A HOME (placeholders.tsx) — a tela inicial guiada
 * ══════════════════════════════════════════════════════════════════════════ */

describe('HomeView — estado VAZIO (onboarding), o que o recém-instalado vê', () => {
  it('renderiza com os DOIS formatos de props (sem nada; com setupsDir + onNavigate) — nunca quebra', () => {
    assert.doesNotThrow(() => renderView(HomeView));
    assert.doesNotThrow(() =>
      renderView(HomeView, { setupsDir: '/tmp/setup', onNavigate: () => {} }),
    );
  });

  it('o copy diz o que o app FAZ (título + descrição) e mostra os 3 passos numerados', () => {
    const tela = onScreen(renderView(HomeView));
    assert.ok(tela.includes(ptBR.home.title), 'o título do app está na tela');
    assert.ok(tela.includes(ptBR.home.description), 'a descrição do app está na tela');
    for (const passo of ['configureKeys', 'subject', 'learn'] as const) {
      assert.ok(
        tela.includes(ptBR.home.steps[passo].title),
        `o passo "${passo}" (título) está na tela`,
      );
      assert.ok(
        tela.includes(ptBR.home.steps[passo].description),
        `o passo "${passo}" (descrição) está na tela`,
      );
    }
  });

  // ONDA-UX-TRILHAS (decisão do dono): os chips de sugestão ("Ideias para
  // começar") saíram da UI — prometiam "digitar assunto → aula gerada", fluxo
  // que a rodada 8 retirou (o clique caía no estado vazio da Aula). O caminho
  // canónico passou a ser a TRILHA; o CTA é contextual (setup / continuar /
  // escolher trilha).
  it('SEM dados do main: card "verificando" e CTA de SETUP — sem chips de sugestão', () => {
    const tela = onScreen(renderView(HomeView));
    assert.ok(tela.includes(ptBR.home.setup.checking), 'o status do setup nasce "verificando"');
    assert.ok(tela.includes(ptBR.home.cta.setup), 'o CTA contextual é "Configurar chaves"');
    assert.equal(tela.includes(ptBR.home.cta.start), false, '"Escolher uma trilha" só com chaves prontas');
    assert.equal(tela.includes(ptBR.home.cta.continue), false, '"Continuar aula" exige uma última aula');
    assert.equal(
      tela.includes(ptBR.home.suggestions.title),
      false,
      'chips de sugestão REMOVIDOS — o caminho canónico são as trilhas',
    );
  });

  it('o diálogo de troca de matéria não existe mais (nem fechado — foi removido)', () => {
    const tela = onScreen(renderView(HomeView));
    assert.equal(tela.includes(ptBR.home.switchDialog.title), false);
    assert.equal(tela.includes(ptBR.home.switchDialog.description), false);
  });

  it('a seção de TRILHAS mostra o TÍTULO em carregamento — sem lista fantasma nem erro', () => {
    const tela = onScreen(renderView(HomeView));
    assert.ok(tela.includes(ptBR.home.tracksTitle), 'loading desenha o título + indicador (sem layout shift)');
    assert.equal(tela.includes(ptBR.home.tracksEmptyTitle), false, 'estado vazio é para depois da resposta');
    assert.equal(tela.includes(ptBR.home.tracksLoadFailed), false);
    assert.equal(tela.includes(ptBR.home.orphansNotice.replaceAll('{{n}}', '1')), false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 2. A TRILHA (RoadmapView.tsx) — o estado inicial de carga
 * ══════════════════════════════════════════════════════════════════════════ */

describe('RoadmapView — estado inicial (antes de o payload da trilha chegar)', () => {
  it('renderiza sem props e com props, sem quebrar', () => {
    assert.doesNotThrow(() => renderView(RoadmapView));
    assert.doesNotThrow(() => renderView(RoadmapView, { onNavigate: () => {}, setupsDir: '/x' }));
  });

  it('a região de anúncio do destravamento nasce MONTADA e vazia (é a MUDANÇA que o leitor de tela lê)', () => {
    const html = renderView(RoadmapView);
    assert.match(html, /role="status"/, 'a região de status existe desde o primeiro frame');
    assert.match(html, /aria-live="polite"/);
  });

  it('nada de conteúdo de trilha nem seletor na tela antes da carga (não há o que mostrar ainda)', () => {
    const tela = onScreen(renderView(RoadmapView));
    assert.equal(tela.includes(ptBR.roadmap.pickTitle), false, 'o seletor só aparece com a lista vinda do main');
    assert.equal(tela.includes(ptBR.roadmap.loadFailed), false);
    assert.equal(tela.includes(ptBR.roadmap.loadTimeout), false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 3. O ONBOARDING (OnboardingOverlay) — o núcleo puro de posicionamento
 *    (o componente importa CSS Module e não carrega sob tsx — ver o cabeçalho)
 * ══════════════════════════════════════════════════════════════════════════ */

describe('onboarding: rectsOverlap / computeOverlapArea — a colisão painel × spotlight', () => {
  const alvo: Rect = { top: 100, left: 100, width: 200, height: 50 };

  it('sobreposição detectada (com a margem de segurança expandida no alvo)', () => {
    assert.equal(rectsOverlap({ top: 90, left: 250, width: 100, height: 40 }, alvo), true);
    // fora da margem padrão (12px), mas dentro dela: a margem é o que decide.
    assert.equal(rectsOverlap({ top: 100, left: 302, width: 50, height: 40 }, alvo), true);
    assert.equal(rectsOverlap({ top: 100, left: 330, width: 50, height: 40 }, alvo), false);
  });

  it('margem explícita: 0 fecha a tolerância, grande abre', () => {
    const perto: Rect = { top: 100, left: 302, width: 50, height: 40 };
    assert.equal(rectsOverlap(perto, alvo, 0), false);
    assert.equal(rectsOverlap(perto, alvo, 30), true);
  });

  it('computeOverlapArea: 0 sem toque, exata no canto, produto no aninhamento', () => {
    assert.equal(computeOverlapArea({ top: 0, left: 0, width: 10, height: 10 }, { top: 20, left: 20, width: 5, height: 5 }), 0);
    assert.equal(computeOverlapArea({ top: 0, left: 0, width: 10, height: 10 }, { top: 5, left: 5, width: 10, height: 10 }), 25);
    assert.equal(computeOverlapArea({ top: 0, left: 0, width: 10, height: 10 }, { top: 2, left: 2, width: 3, height: 3 }), 9);
  });
});

describe('onboarding: getResponsiveSizeClass / getPlacementOrder', () => {
  it("os breakpoints devolvem os sufixos de classe do CSS Module (e '' no largo)", () => {
    assert.equal(getResponsiveSizeClass(800), 'onboarding-overlay-panel--xsmall');
    assert.equal(getResponsiveSizeClass(1023), 'onboarding-overlay-panel--xsmall');
    assert.equal(getResponsiveSizeClass(1024), 'onboarding-overlay-panel--small');
    assert.equal(getResponsiveSizeClass(1365), 'onboarding-overlay-panel--small');
    assert.equal(getResponsiveSizeClass(1366), 'onboarding-overlay-panel--medium');
    assert.equal(getResponsiveSizeClass(1919), 'onboarding-overlay-panel--medium');
    assert.equal(getResponsiveSizeClass(1920), '');
  });

  it('a ordem de placement cicla em 4 posições pelo índice do passo', () => {
    assert.deepEqual(getPlacementOrder(0), ['bottom', 'right', 'left', 'top']);
    assert.deepEqual(getPlacementOrder(1), ['right', 'bottom', 'top', 'left']);
    assert.deepEqual(getPlacementOrder(2), ['left', 'top', 'bottom', 'right']);
    assert.deepEqual(getPlacementOrder(3), ['top', 'right', 'left', 'bottom']);
    assert.deepEqual(getPlacementOrder(4), getPlacementOrder(0), 'o ciclo repete');
    assert.deepEqual(getPlacementOrder(9), getPlacementOrder(1));
  });
});

describe('onboarding: calculatePanelPosition — o painel nunca cobre o spotlight', () => {
  const viewport = { width: 1440, height: 900 };
  const spotlight: Rect = { top: 400, left: 600, width: 120, height: 40 };

  it('SEM spotlight o painel vira card CENTRAL, com leve viés para CIMA (a queixa do dono)', () => {
    const pos = calculatePanelPosition(null, 420, 320, viewport, 0);
    assert.equal(pos.compact, false);
    // centralizado na horizontal pela LARGURA EFETIVA (que o cálculo de colisão usou)…
    assert.equal(pos.left, Math.round(pos.left), 'posição inteira');
    assert.ok(Math.abs(pos.left + pos.width / 2 - viewport.width / 2) <= 1, 'centralizado na horizontal');
    assert.ok(pos.width <= 420, 'a largura efetiva nunca passa do pedido');
    // …com viés de ~8% da altura para cima do centro vertical.
    const esperadoTopo = (viewport.height - 320) / 2 - viewport.height * 0.08;
    assert.ok(Math.abs(pos.top - esperadoTopo) <= 1.5, `topo ${pos.top} longe de ${esperadoTopo}`);
  });

  it('COM spotlight: o painel escolhe um lado SEM colidir e dentro do viewport', () => {
    for (const stepIndex of [0, 1, 2, 3, 5]) {
      const pos = calculatePanelPosition(spotlight, 420, 320, viewport, stepIndex);
      const rect: Rect = { top: pos.top, left: pos.left, width: pos.width, height: pos.compact ? 320 * 0.75 : 320 };
      assert.equal(rectsOverlap(rect, spotlight, 0), false, `passo ${stepIndex}: painel sobre o alvo`);
      assert.ok(pos.left >= 0 && pos.left + rect.width <= viewport.width, `passo ${stepIndex}: saiu na horizontal`);
      assert.ok(pos.top >= 0 && pos.top + rect.height <= viewport.height, `passo ${stepIndex}: saiu na vertical`);
    }
  });

  it('janela apertada: o painel cai em modo COMPACTO em vez de cobrir o alvo', () => {
    const pequena = { width: 700, height: 600 };
    const centro: Rect = { top: 280, left: 250, width: 200, height: 40 };
    const pos = calculatePanelPosition(centro, 460, 320, pequena, 0);
    assert.equal(pos.compact, true);
    assert.equal(rectsOverlap({ top: pos.top, left: pos.left, width: pos.width, height: 320 * 0.75 }, centro, 0), false);
  });

  it('viewport minúsculo: devolve SEMPRE uma posição válida (a promessa do "melhor esforço")', () => {
    const minusculo = { width: 320, height: 240 };
    const pos = calculatePanelPosition(spotlight, 460, 320, minusculo, 2);
    assert.equal(Number.isFinite(pos.top) && Number.isFinite(pos.left), true);
    assert.ok(pos.width <= minusculo.width, 'a largura respeita o disponível');
  });
});

describe('onboarding: scrollTargetIntoView — só puxa o que está FORA da vista', () => {
  function fakeEl(rect: Rect): RevealableElement & { chamadas: unknown[] } {
    const chamadas: unknown[] = [];
    return {
      chamadas,
      getBoundingClientRect: () => rect,
      scrollIntoView: (opts?: unknown) => {
        chamadas.push(opts);
      },
    };
  }

  it('sem viewport em globalThis (o caso dos testes) é NO-OP puro', () => {
    const el = fakeEl({ top: -500, left: -500, width: 10, height: 10 });
    assert.doesNotThrow(() => scrollTargetIntoView(el));
    assert.deepEqual(el.chamadas, [], 'nada a rolar sem janela');
  });

  it('com viewport definido: visível não rola; fora da vista rola centralizando (smooth por default)', () => {
    const g = globalThis as unknown as { innerWidth?: number; innerHeight?: number };
    const larguraAntes = g.innerWidth;
    const alturaAntes = g.innerHeight;
    g.innerWidth = 1440;
    g.innerHeight = 900;
    try {
      const visivel = fakeEl({ top: 300, left: 300, width: 50, height: 50 });
      scrollTargetIntoView(visivel);
      assert.deepEqual(visivel.chamadas, [], 'já está visível: nada a fazer');

      const fora = fakeEl({ top: -400, left: 300, width: 50, height: 50 });
      scrollTargetIntoView(fora);
      assert.deepEqual(fora.chamadas, [{ block: 'center', inline: 'nearest', behavior: 'smooth' }]);

      const semSmooth = fakeEl({ top: 2000, left: 300, width: 50, height: 50 });
      scrollTargetIntoView(semSmooth, false);
      assert.deepEqual(semSmooth.chamadas, [{ block: 'center', inline: 'nearest', behavior: 'auto' }]);

      // alvo de tamanho zero é ignorado (rect desconhecido não vira scroll doido).
      const vazio = fakeEl({ top: -400, left: 0, width: 0, height: 0 });
      scrollTargetIntoView(vazio);
      assert.deepEqual(vazio.chamadas, []);
    } finally {
      g.innerWidth = larguraAntes;
      g.innerHeight = alturaAntes;
    }
  });
});
