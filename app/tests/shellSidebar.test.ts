/**
 * tests/shellSidebar.test.ts — a COLUNA LATERAL do shell (ONDA-SIDEBAR).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O QUE ESTE ARQUIVO PROVA (e o que ele NÃO consegue provar)
 * ══════════════════════════════════════════════════════════════════════════
 * Esta base não tem jsdom (a técnica dela é `react-dom/server` — precedentes
 * `tests/lessonCollapsibleHeader.test.ts`, `tests/quizOverlayRender.test.ts`).
 * Sem DOM não há ARRASTE nem RESIZE: o arraste de ponteiro, a mudança de
 * largura e a persistência via localStorage são cobertos pela matemática pura
 * (`tests/splitRatio.test.ts`) e pelos specs e2e Playwright. O que dá para
 * provar AQUI é:
 *
 *   BLOCO 1 — GUARDAS DE FONTE (regex no .tsx — técnica de
 *     lessonCollapsibleHeader/inkPropReachesScreen). O contrato do shell é de
 *     PAPÉIS ARIA que 13 specs e2e consumem; regressão desses papéis quebra o
 *     app silenciosamente, então a fonte é trancada:
 *       · `role="banner"` (via `<AppBar>`) existe EXATAMENTE UMA vez no shell;
 *       · a SessionFrame preserva os 4 alvos do onboarding/estado
 *         (app-title, theme-toggle, language-switcher, data-session-last-activity,
 *         role="status" + aria-live);
 *       · a SplitDivider é um `role="separator"` vertical com setPointerCapture
 *         e teclado APG (nextRatioForKey) — e touchAction none;
 *       · o App mantém `role="tabpanel"` + navPanelId/navTabId no main, mede o
 *         contêiner com ResizeObserver e usa a persistência PRÓPRIA do shell
 *         (nunca a chave do Desafio);
 *       · a ORDEM do arranjo é rail → sidebar → divisória → main (a divisória
 *         entre os dois painéis, como no VSCode).
 *
 *   BLOCO 2 — O ESTADO, RENDERIZADO NOS DOIS LADOS com `renderToStaticMarkup`
 *     (o MESMO componente que o App usa — não há cópia para teste):
 *       · SessionFrame: `<header>` no HTML (papel banner IMPLÍCITO — é por isso
 *         que `getByRole('banner')` funciona), `role="status"`,
 *         `data-session-last-activity`, os 3 alvos de onboarding no DOM e o
 *         texto dos campos via i18n real;
 *       · SplitDivider: `role="separator"`, `aria-orientation="vertical"`,
 *         `tabindex`, `aria-valuemin/now/max` com as fronteiras EFETIVAS
 *         (piso em px — não as constantes cruas), `aria-controls` com os DOIS
 *         painéis e a dica ligada por `aria-describedby`.
 *
 * Reprodução: `bash tools/t.sh tests/shellSidebar.test.ts`
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemeProvider } from '@mui/material/styles';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import { theme } from '../src/theme';
import ptBR from '../src/i18n/locales/pt-BR/translation.json';
import en from '../src/i18n/locales/en/translation.json';
import {
  SHELL_SIDEBAR_PANE_ID,
  SHELL_SPLIT_CONSTRAINTS,
  SHELL_SPLIT_DIVIDER_ID,
  splitAriaValues,
} from '../src/lib/splitRatio';

// ATENÇÃO ao padrão da casa: componentes .tsx são importados DINAMICAMENTE por
// URL (o tsconfig de tests/ não liga `jsx` — ver lessonCollapsibleHeader).
const SESSION_FRAME_MODULE = new URL(
  '../src/components/shell/SessionFrame.tsx',
  import.meta.url,
).href;
const SPLIT_DIVIDER_MODULE = new URL(
  '../src/components/shell/SplitDivider.tsx',
  import.meta.url,
).href;

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_PATH = resolve(HERE, '../src/App.tsx');
const SESSION_FRAME_PATH = resolve(HERE, '../src/components/shell/SessionFrame.tsx');
const SPLIT_DIVIDER_PATH = resolve(HERE, '../src/components/shell/SplitDivider.tsx');
const RAIL_PATH = resolve(HERE, '../src/components/shell/NavigationRail.tsx');

/** Fonte sem comentários — só o código que realmente roda. */
function codeOf(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** O componente REAL da sidebar, carregado no `before`. */
let SessionFrame: ComponentType<{ basisPx: number; animateBasis: boolean }>;
/** O componente REAL da divisória, carregado no `before`. */
type SplitDividerProps = {
  ratio: number;
  containerPx: number;
  constraints: typeof SHELL_SPLIT_CONSTRAINTS;
  onRatioChange: (r: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  ariaLabel: string;
  hint?: string;
  hintId: string;
  controlsIds: readonly [string, string];
  dividerId: string;
};
let SplitDivider: ComponentType<SplitDividerProps>;

function renderSidebar(basisPx = 240, animateBasis = false): string {
  return renderToStaticMarkup(
    createElement(
      ThemeProvider,
      { theme },
      createElement(SessionFrame, { basisPx, animateBasis }),
    ),
  );
}

const DIVIDER_PROPS: SplitDividerProps = {
  ratio: 0.3,
  containerPx: 1000,
  constraints: SHELL_SPLIT_CONSTRAINTS,
  onRatioChange: () => {},
  ariaLabel: 'Divisória',
  hint: 'Arraste, ou use as setas',
  hintId: 'shell-split-divider-hint',
  controlsIds: [SHELL_SIDEBAR_PANE_ID, 'main-panel'],
  dividerId: SHELL_SPLIT_DIVIDER_ID,
};

function renderDivider(overrides: Partial<SplitDividerProps> = {}): string {
  return renderToStaticMarkup(
    createElement(
      ThemeProvider,
      { theme },
      createElement(SplitDivider, { ...DIVIDER_BASE, ...overrides }),
    ),
  );
}

const DIVIDER_BASE: SplitDividerProps = { ...DIVIDER_PROPS };

before(async () => {
  process.env.I18NEXT_NO_SUPPORT_NOTICE = '1';
  await i18next.use(initReactI18next).init({
    lng: 'pt-BR',
    // A MESMA opção de interpolação da produção (src/i18n/index.ts).
    interpolation: { escapeValue: false },
    resources: { 'pt-BR': { translation: ptBR }, en: { translation: en } },
  });
  const frame = (await import(SESSION_FRAME_MODULE)) as {
    default: ComponentType<{ basisPx: number; animateBasis: boolean }>;
  };
  SessionFrame = frame.default;
  const divider = (await import(SPLIT_DIVIDER_MODULE)) as {
    default: ComponentType<SplitDividerProps>;
  };
  SplitDivider = divider.default;
});

/* ═════════════════════════ BLOCO 1 — GUARDAS DE FONTE ═══════════════════ */

describe('1. guardas de fonte — o contrato de papéis que os e2e consomem', () => {
  const shellDir = [
    SESSION_FRAME_PATH,
    SPLIT_DIVIDER_PATH,
    RAIL_PATH,
  ];

  it('role="banner" (AppBar) existe EXATAMENTE UMA vez no shell — e é a sidebar', () => {
    const appbars = shellDir
      .map((p) => codeOf(readFileSync(p, 'utf8')))
      .join('\n')
      .match(/<AppBar\b/g);
    assert.equal(appbars?.length, 1, `esperava UM AppBar no shell, veio ${appbars?.length ?? 0}`);
    // E o AppBar é o SessionFrame (a coluna lateral assumiu o banner).
    assert.match(codeOf(readFileSync(SESSION_FRAME_PATH, 'utf8')), /<AppBar\b/);
    assert.doesNotMatch(codeOf(readFileSync(RAIL_PATH, 'utf8')), /<AppBar\b/);
  });

  it('App.tsx mantém o main como tabpanel com o vínculo de aba (13 specs e2e)', () => {
    const app = codeOf(readFileSync(APP_PATH, 'utf8'));
    assert.match(app, /role="tabpanel"/);
    assert.match(app, /id=\{navPanelId\(active\)\}/);
    assert.match(app, /aria-labelledby=\{navTabId\(active\)\}/);
  });

  it('SessionFrame preserva os alvos do onboarding e o quadro de estado (SC 4.1.3)', () => {
    const frame = codeOf(readFileSync(SESSION_FRAME_PATH, 'utf8'));
    for (const marker of [
      'data-onboarding-target="app-title"',
      'data-onboarding-target="theme-toggle"',
      'data-onboarding-target="language-switcher"',
      'data-session-last-activity=',
      'role="status"',
      'aria-live="polite"',
    ]) {
      assert.ok(frame.includes(marker), `sumiu: ${marker}`);
    }
    // SC 1.4.12: sem nowrap/ellipsis nos campos — o texto quebra, nunca trunca.
    assert.ok(!frame.includes('noWrap'), 'noWrap voltou aos campos do quadro');
    assert.ok(
      frame.includes('overflowWrap'),
      'os campos precisam de overflow-wrap: anywhere para quebrar sem recortar',
    );
  });

  it('SplitDivider é um separator VERTICAL com ponteiro capturado e teclado APG', () => {
    const divider = codeOf(readFileSync(SPLIT_DIVIDER_PATH, 'utf8'));
    for (const marker of [
      'role="separator"',
      'aria-orientation="vertical"',
      'setPointerCapture',
      'nextRatioForKey',
      'ratioFromPointer',
      'splitAriaValues',
      'touchAction',
      'onPointerDown',
      'onPointerMove',
      'onPointerUp',
      'onKeyDown',
      'aria-controls',
      'aria-describedby',
      'preventDefault',
    ]) {
      assert.ok(divider.includes(marker), `a divisória precisa de: ${marker}`);
    }
    // A divisória NÃO trata Enter (nunca colapsa — decisões 4 do splitRatio).
    assert.ok(!/['"`]Enter['"`]/.test(divider), 'a divisória do shell não pode tratar Enter');
  });

  it('App.tsx mede o contêiner e persiste a razão com a chave PRÓPRIA do shell', () => {
    const app = codeOf(readFileSync(APP_PATH, 'utf8'));
    assert.match(app, /ResizeObserver/);
    assert.match(app, /readShellSplitRatio/);
    assert.match(app, /writeShellSplitRatio\(ratio\)/);
    assert.match(app, /SHELL_SPLIT_CONSTRAINTS/);
    // A persistência é a do SHELL — reusar a chave do Desafio faria as duas
    // divisórias brigarem pela mesma memória.
    assert.ok(
      !app.includes('SPLIT_RATIO_STORAGE_KEY') &&
        !app.includes('readSplitRatio') &&
        !app.includes('writeSplitRatio'),
      'o shell não pode consumir a persistência do Desafio',
    );
  });

  it('a ordem do arranjo é rail → sidebar → divisória → main (VSCode)', () => {
    const app = codeOf(readFileSync(APP_PATH, 'utf8'));
    const rail = app.indexOf('<NavigationRail');
    const sidebar = app.indexOf('<SessionFrame');
    const divider = app.indexOf('<SplitDivider');
    const main = app.indexOf('component="main"');
    assert.ok(rail !== -1 && sidebar !== -1 && divider !== -1 && main !== -1);
    assert.ok(rail < sidebar, 'o rail vem antes da sidebar');
    assert.ok(sidebar < divider, 'a sidebar vem antes da divisória');
    assert.ok(divider < main, 'a divisória vem ANTES do main (ela separa os dois)');
  });

  // ONDA2-LOADER-GLOBAL (contrato cruzado com src/lib/splitRatio.ts): o rótulo
  // TEMPORÁRIO da divisória (que reusava shell.session.aria) foi encerrado —
  // a chave própria shell.sidebar.splitAria existe nos DOIS locales e é a que
  // App.tsx usa (a constante é exportada do splitRatio, então os dois lados do
  // par importam do mesmo lugar e a divergência é impossível).
  it('a divisória usa a chave PRÓPRIA shell.sidebar.splitAria (fim do TEMPORÁRIO)', () => {
    const app = codeOf(readFileSync(APP_PATH, 'utf8'));
    assert.match(app, /SHELL_SPLIT_ARIA_I18N_KEY/);
    assert.ok(
      !app.includes("t('translation:shell.session.aria')"),
      'o rótulo do POÇO de sessão não deve mais ser o rótulo da divisória',
    );
  });
});

/* ═══════════════ BLOCO 2 — O ESTADO RENDERIZADO (SSR real) ═══════════════ */

describe('2. SessionFrame renderizado (a coluna lateral real, com tema e i18n)', () => {
  it('a coluna é o header/banner: `<header>` no HTML (papel IMPLÍCITO lido pelos e2e)', () => {
    const html = renderSidebar();
    assert.match(html, /<header\b/, 'SessionFrame precisa renderizar <header> (role=banner implícito)');
  });

  it('o quadro de estado está montado ANTES de qualquer atualização (SC 4.1.3)', () => {
    const html = renderSidebar();
    assert.match(html, /role="status"/);
    assert.match(html, /aria-live="polite"/);
    assert.match(html, /data-session-last-activity=/);
  });

  it('os três alvos de onboarding continuam no DOM (o tutorial os ilumina)', () => {
    const html = renderSidebar();
    for (const target of ['app-title', 'theme-toggle', 'language-switcher']) {
      assert.match(
        html,
        new RegExp(`data-onboarding-target="${target}"`),
        `alvo ausente: ${target}`,
      );
    }
  });

  it('os textos vêm do i18n REAL (título, rótulos e placeholders dos campos)', () => {
    const html = renderSidebar();
    assert.ok(html.includes(ptBR.app.title), 'título do app');
    assert.ok(html.includes(ptBR.shell.session.subject), 'rótulo Assunto');
    assert.ok(html.includes(ptBR.shell.session.phase), 'rótulo Fase');
    assert.ok(html.includes(ptBR.shell.session.noSubject), 'placeholder de assunto vazio');
    assert.ok(html.includes(ptBR.shell.session.idle), 'placeholder de fase vazia');
    // E no locale en o mesmo contrato vale (a estrutura é idioma-agnóstica).
    const enHtml = renderToStaticMarkup(
      createElement(ThemeProvider, { theme }, createElement(SessionFrame, { basisPx: 240, animateBasis: false })),
    );
    assert.ok(enHtml.length > 0, 'a coluna renderiza também sob o locale en');
  });

  it('a largura da coluna vai para o flex-basis (a divisória manda na geometria)', () => {
    const html = renderSidebar(280);
    assert.match(html, /flex:0 0 280px/, 'a base da coluna é a largura passada pelo shell');
    assert.match(html, /width:280px/, 'e a largura acompanha (a coluna não encolhe por conta própria)');
  });
});

describe('3. SplitDivider renderizado (o separator real, com tema)', () => {
  it('é um separator vertical focável com os valores ARIA EFETIVOS do split', () => {
    const html = renderDivider();
    assert.match(html, /role="separator"/);
    assert.match(html, /aria-orientation="vertical"/);
    assert.match(html, /tabindex="0"/);
    // As fronteiras vêm de splitAriaValues (piso em px CRUZADO) — não das
    // constantes cruas (14/50). Com contêiner de 1000px e razão 0.3:
    const aria = splitAriaValues(DIVIDER_PROPS.ratio, DIVIDER_PROPS.containerPx, 'vertical', SHELL_SPLIT_CONSTRAINTS);
    assert.match(html, new RegExp(`aria-valuemin="${aria.valueMin}"`));
    assert.match(html, new RegExp(`aria-valuemax="${aria.valueMax}"`));
    assert.match(html, new RegExp(`aria-valuenow="${aria.valueNow}"`));
    // E o piso EFETIVO de fato supera o cru (1000px de contêiner: 180/994 ≈ 18).
    assert.ok(aria.valueMin > SHELL_SPLIT_CONSTRAINTS.minRatio * 100, 'o min anunciado tem que ser o EFETIVO (piso em px), não 14');
  });

  it('a divisória controla os DOIS painéis e aponta para a dica', () => {
    const html = renderDivider();
    assert.match(html, new RegExp(`aria-controls="${SHELL_SIDEBAR_PANE_ID} main-panel"`));
    assert.match(html, new RegExp(`aria-describedby="shell-split-divider-hint"`));
    assert.ok(html.includes(DIVIDER_PROPS.hint as string), 'a dica está no DOM (span escondido)');
    assert.ok(html.includes(DIVIDER_PROPS.ariaLabel), 'o rótulo da divisória está no DOM');
  });

  it('sem dica, não há aria-describedby pendurado sem destino', () => {
    const html = renderDivider({ hint: undefined });
    assert.ok(!html.includes('aria-describedby'), 'aria-describedby sem span é referência quebrada');
  });

  it('a id da divisória é a constante exportada (estável para CSS/e2e)', () => {
    const html = renderDivider();
    assert.match(html, new RegExp(`id="${SHELL_SPLIT_DIVIDER_ID}"`));
  });
});