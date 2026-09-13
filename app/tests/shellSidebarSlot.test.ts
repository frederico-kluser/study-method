/**
 * tests/shellSidebarSlot.test.ts — o SLOT DA VIEW ATIVA no sidebar do shell
 * (onda1-sidebar-slot; complemento de tests/shellSidebar.test.ts).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O QUE ESTE ARQUIVO PROVA (e o que ele NÃO consegue provar)
 * ══════════════════════════════════════════════════════════════════════════
 * Mesma técnica da casa (node:test SEM jsdom; SSR com react-dom/server +
 * guardas de FONTE por regex no .tsx). Sem DOM não há commit, e sem commit o
 * callback ref do slot nunca roda: o teletransporte do portal para dentro da
 * coluna (e o esvaziamento ao trocar de aba) é coberto pelos specs e2e da
 * aula (a LessonView publica o cabeçalho dela no slot):
 * tests/e2e/e2e-lesson.spec.ts (o h1 no slot e fora do `main`, o slot vazio
 * fora da aula, o h1 trocando com a aula) e
 * tests/e2e/e2e-sidebar-aula-spacing.spec.ts (o cabeçalho no slot com a
 * coluna no piso de 180px). O que dá para provar AQUI é:
 *
 *   BLOCO 1 — O PORTAL É SSR-SAFE. `ShellSidebarPortal` sem slot devolve ''
 *     e NÃO lança (o renderizador de servidor não suporta portais — chamar
 *     `createPortal` ali derrubaria o render); o resto da view renderiza
 *     normalmente em volta dele; o hook lê o valor do Provider (fiação do
 *     contexto) e cai em `null` sem Provider.
 *
 *   BLOCO 2 — O SLOT NO SESSIONFRAME RENDERIZADO. O contêiner com
 *     SHELL_SIDEBAR_SLOT_ID nasce VAZIO, entre o título do app e o poço
 *     `role="status"` — FORA do poço (região viva + a semeadura do
 *     e2e-spacing em `status.querySelectorAll('span')[1]`) — e o CSS emitido
 *     tem `:empty` → `display:none` (vazio, ele sai do fluxo e do `gap`: as
 *     outras abas ficam idênticas). O resto do quadro continua: `<header>`
 *     (banner) único, `role="status"`, título do app, alvos de onboarding.
 *
 *   BLOCO 3 — GUARDAS DE FONTE. App.tsx guarda o nó do slot em ESTADO, o
 *     Provider envolve o SessionFrame E o `main` (dentro do contêiner medido
 *     do split) e passa `slotRef`; o SessionFrame declara a prop e liga o
 *     ref ao contêiner; o módulo do slot exporta o contrato congelado.
 *
 * Reprodução: `bash tools/t.sh tests/shellSidebarSlot.test.ts`
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createElement, type ComponentType, type Context, type ReactNode } from 'react';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { ThemeProvider } from '@mui/material/styles';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import { theme } from '../src/theme';
import ptBR from '../src/i18n/locales/pt-BR/translation.json';
import en from '../src/i18n/locales/en/translation.json';

// ATENÇÃO ao padrão da casa: módulos .tsx são importados DINAMICAMENTE por URL
// (o tsconfig de tests/ não liga `jsx` — ver tests/shellSidebar.test.ts).
const SLOT_MODULE = new URL('../src/components/shell/ShellSidebarSlot.tsx', import.meta.url).href;
const SESSION_FRAME_MODULE = new URL('../src/components/shell/SessionFrame.tsx', import.meta.url).href;

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_PATH = resolve(HERE, '../src/App.tsx');
const SESSION_FRAME_PATH = resolve(HERE, '../src/components/shell/SessionFrame.tsx');
const SLOT_PATH = resolve(HERE, '../src/components/shell/ShellSidebarSlot.tsx');

/** Fonte sem comentários — só o código que realmente roda. */
function codeOf(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Todos os pares `<seletor>{<corpo>}` das folhas embutidas no HTML do SSR. */
function cssRulesOf(html: string): Array<{ selector: string; body: string }> {
  const out: Array<{ selector: string; body: string }> = [];
  for (const sheet of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    for (const rule of sheet[1].matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      out.push({ selector: rule[1].trim(), body: rule[2].trim() });
    }
  }
  return out;
}

/** O HTML sem as folhas `<style>` do emotion — só a marcação. */
function markupOf(html: string): string {
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
}

/** O contrato do módulo do slot (tipos locais: o módulo é .tsx). */
interface SlotModule {
  SHELL_SIDEBAR_SLOT_ID: string;
  ShellSidebarSlotContext: Context<HTMLElement | null>;
  useShellSidebarSlot: () => HTMLElement | null;
  ShellSidebarPortal: ComponentType<{ children: ReactNode }>;
}
let slot: SlotModule;

type SessionFrameProps = {
  basisPx: number;
  animateBasis: boolean;
  slotRef: (el: HTMLElement | null) => void;
};
let SessionFrame: ComponentType<SessionFrameProps>;

function renderFrame(): string {
  return renderToStaticMarkup(
    createElement(
      ThemeProvider,
      { theme },
      createElement(SessionFrame, { basisPx: 240, animateBasis: false, slotRef: () => {} }),
    ),
  );
}

before(async () => {
  process.env.I18NEXT_NO_SUPPORT_NOTICE = '1';
  await i18next.use(initReactI18next).init({
    lng: 'pt-BR',
    // A MESMA opção de interpolação da produção (src/i18n/index.ts).
    interpolation: { escapeValue: false },
    resources: { 'pt-BR': { translation: ptBR }, en: { translation: en } },
  });
  slot = (await import(SLOT_MODULE)) as SlotModule;
  const frame = (await import(SESSION_FRAME_MODULE)) as { default: ComponentType<SessionFrameProps> };
  SessionFrame = frame.default;
});

/* ═════════════════════ BLOCO 1 — O PORTAL É SSR-SAFE ════════════════════ */

describe('1. ShellSidebarPortal / useShellSidebarSlot — SSR-safe e fiação do contexto', () => {
  it('o id do slot é a constante congelada do contrato', () => {
    assert.equal(slot.SHELL_SIDEBAR_SLOT_ID, 'shell-sidebar-view-slot');
  });

  it('sem slot (sem Provider): renderToString devolve "" e NÃO lança', () => {
    let html: string | undefined;
    assert.doesNotThrow(() => {
      html = renderToString(
        createElement(slot.ShellSidebarPortal, null, createElement('div', null, 'conteúdo da coluna')),
      );
    });
    assert.equal(html, '');
  });

  it('Provider com null (o primeiro render do shell): também "" e sem lançar', () => {
    const html = renderToString(
      createElement(
        slot.ShellSidebarSlotContext.Provider,
        { value: null },
        createElement(slot.ShellSidebarPortal, null, createElement('section', null, 'aula')),
      ),
    );
    assert.equal(html, '');
    assert.equal(
      renderToStaticMarkup(createElement(slot.ShellSidebarPortal, null, 'x')),
      '',
      'renderToStaticMarkup idem',
    );
  });

  it('a view em volta do portal renderiza normalmente — só o que foi para a coluna some', () => {
    const html = renderToStaticMarkup(
      createElement(
        'div',
        null,
        createElement('p', null, 'chat da aula'),
        createElement(slot.ShellSidebarPortal, null, createElement('h1', null, 'título na coluna')),
      ),
    );
    assert.equal(html, '<div><p>chat da aula</p></div>');
  });

  it('o hook lê o nó publicado pelo Provider (e cai em null sem Provider)', () => {
    const seen: Array<HTMLElement | null> = [];
    function Probe(): null {
      seen.push(slot.useShellSidebarSlot());
      return null;
    }
    // Um "nó" de mentira basta: o hook só repassa o valor do contexto (quem o
    // entrega ao createPortal é o cliente, onde o nó é real).
    const fakeNode = { nodeType: 1, id: slot.SHELL_SIDEBAR_SLOT_ID } as unknown as HTMLElement;
    renderToStaticMarkup(createElement(Probe));
    renderToStaticMarkup(
      createElement(slot.ShellSidebarSlotContext.Provider, { value: fakeNode }, createElement(Probe)),
    );
    assert.equal(seen[0], null, 'fora do shell não há slot');
    assert.equal(seen[1], fakeNode, 'dentro do Provider o hook devolve o nó do shell');
  });
});

/* ═══════════════ BLOCO 2 — O SLOT NO SESSIONFRAME RENDERIZADO ═══════════ */

describe('2. SessionFrame renderizado: o slot vazio, fora do poço, some quando vazio', () => {
  it('o contêiner-slot existe com o id do contrato e nasce VAZIO', () => {
    const markup = markupOf(renderFrame());
    const tag = new RegExp(`<div\\b[^>]*\\bid="${slot.SHELL_SIDEBAR_SLOT_ID}"[^>]*></div>`);
    assert.match(markup, tag, 'o slot é um <div> vazio (nada publicado no SSR)');
    assert.equal(markup.split(`id="${slot.SHELL_SIDEBAR_SLOT_ID}"`).length - 1, 1, 'um slot só');
  });

  it('ordem: título do app → slot → poço role="status" (o slot fica FORA do poço)', () => {
    const markup = markupOf(renderFrame());
    const title = markup.indexOf('data-onboarding-target="app-title"');
    const slotAt = markup.indexOf(`id="${slot.SHELL_SIDEBAR_SLOT_ID}"`);
    const statusOpen = markup.lastIndexOf('<', markup.indexOf('role="status"'));
    assert.ok(title !== -1 && slotAt !== -1 && statusOpen !== -1);
    assert.ok(title < slotAt, 'o slot vem DEPOIS do título do app');
    assert.ok(slotAt < statusOpen, 'o slot vem ANTES do poço — e portanto fora dele');
    // O poço segue com EXATAMENTE os spans dos dois campos (rótulo+valor ×2):
    // é o que a semeadura do e2e-spacing (`spans[1]` = valor do assunto) lê.
    // Do `<div role="status">` até a TAG que abre o alvo do tema (o poço e o
    // wrapper dos controles ficam no meio; o wrapper não tem span).
    const controlsAt = markup.lastIndexOf('<', markup.indexOf('data-onboarding-target="theme-toggle"'));
    const statusHtml = markup.slice(statusOpen, controlsAt);
    assert.ok(!statusHtml.includes(slot.SHELL_SIDEBAR_SLOT_ID), 'nada do slot dentro do poço');
    assert.equal((statusHtml.match(/<span\b/g) ?? []).length, 4, 'o poço tem só rótulo+valor dos 2 campos');
  });

  it('o CSS emitido tira o slot VAZIO do layout (`:empty` → display:none)', () => {
    const html = renderFrame();
    const markup = markupOf(html);
    const tag = new RegExp(`<div\\b[^>]*class="([^"]*)"[^>]*\\bid="${slot.SHELL_SIDEBAR_SLOT_ID}"`).exec(markup);
    const cls = tag?.[1].split(/\s+/).find((c) => c.startsWith('css-'));
    assert.ok(cls, 'o slot tem classe do emotion');
    const empty = cssRulesOf(html).find((r) => r.selector === `.${cls}:empty`);
    assert.ok(empty, `regra .${cls}:empty existe`);
    assert.match(empty.body, /display:none/, 'vazio, o slot não ocupa espaço nem gap');
    // Com conteúdo, é uma coluna flex que deixa o conteúdo encolher.
    const base = cssRulesOf(html).filter((r) => r.selector === `.${cls}`).map((r) => r.body).join(';');
    assert.match(base, /display:flex/);
    assert.match(base, /flex-direction:column/);
    assert.match(base, /min-width:0/);
    assert.match(base, /gap:/);
  });

  it('o resto do quadro continua: um <header> (banner) só, role=status, título e alvos', () => {
    const html = renderFrame();
    assert.equal((html.match(/<header\b/g) ?? []).length, 1, 'um único banner');
    assert.match(html, /role="status"/);
    assert.match(html, /aria-live="polite"/);
    assert.match(html, /data-session-last-activity=/);
    assert.ok(html.includes(ptBR.app.title), 'título do app');
    for (const target of ['app-title', 'theme-toggle', 'language-switcher']) {
      assert.match(html, new RegExp(`data-onboarding-target="${target}"`), `alvo ausente: ${target}`);
    }
  });
});

/* ═══════════════════════ BLOCO 3 — GUARDAS DE FONTE ═════════════════════ */

describe('3. guardas de fonte — a fiação slot ⟷ contexto ⟷ view', () => {
  const APP = codeOf(readFileSync(APP_PATH, 'utf8'));
  const FRAME = codeOf(readFileSync(SESSION_FRAME_PATH, 'utf8'));
  const SLOT = codeOf(readFileSync(SLOT_PATH, 'utf8'));

  it('App.tsx guarda o nó do slot em ESTADO (não ref: o Provider precisa re-renderizar)', () => {
    assert.match(
      APP,
      /const \[sidebarSlotEl, setSidebarSlotEl\] = useState<HTMLElement \| null>\(null\);/,
    );
    assert.match(APP, /import \{ ShellSidebarSlotContext \} from '\.\/components\/shell\/ShellSidebarSlot';/);
  });

  it('o Provider envolve o SessionFrame E o main, e passa slotRef ao SessionFrame', () => {
    const open = APP.indexOf('<ShellSidebarSlotContext.Provider value={sidebarSlotEl}>');
    const close = APP.indexOf('</ShellSidebarSlotContext.Provider>');
    const frame = APP.indexOf('<SessionFrame');
    const main = APP.indexOf('component="main"');
    const view = APP.indexOf('<View onNavigate={setActive} />');
    assert.ok(open !== -1 && close !== -1, 'Provider do slot ausente');
    assert.ok(open < frame && frame < close, 'o SessionFrame fica DENTRO do Provider');
    assert.ok(open < main && view < close, 'o main (e a view ativa) ficam DENTRO do Provider');
    assert.equal(APP.split('<ShellSidebarSlotContext.Provider').length - 1, 1, 'um Provider só');
    assert.match(APP, /slotRef=\{setSidebarSlotEl\}/);
  });

  it('o Provider mora DENTRO do contêiner medido do split (a geometria não muda)', () => {
    const ref = APP.indexOf('ref={containerRef}');
    const rail = APP.indexOf('<NavigationRail');
    const open = APP.indexOf('<ShellSidebarSlotContext.Provider');
    assert.ok(rail < ref && ref < open, 'rail fora; Provider dentro do contêiner do split');
  });

  it('SessionFrame declara slotRef como callback ref e o liga ao contêiner com o id do contrato', () => {
    assert.match(FRAME, /readonly slotRef: \(el: HTMLElement \| null\) => void;/);
    assert.match(FRAME, /import \{ SHELL_SIDEBAR_SLOT_ID \} from '\.\/ShellSidebarSlot';/);
    assert.match(FRAME, /id=\{SHELL_SIDEBAR_SLOT_ID\}/);
    assert.match(FRAME, /ref=\{slotRef\}/);
    assert.match(FRAME, /'&:empty': \{ display: 'none' \}/);
  });

  it('SessionFrame: título → slot → poço na FONTE (o slot fora do role="status")', () => {
    const title = FRAME.indexOf('data-onboarding-target="app-title"');
    const slotAt = FRAME.indexOf('id={SHELL_SIDEBAR_SLOT_ID}');
    const status = FRAME.indexOf('role="status"');
    assert.ok(title !== -1 && slotAt !== -1 && status !== -1);
    assert.ok(title < slotAt && slotAt < status);
  });

  it('o módulo do slot exporta o contrato congelado e só cria o portal COM slot', () => {
    assert.match(SLOT, /export const SHELL_SIDEBAR_SLOT_ID = 'shell-sidebar-view-slot';/);
    assert.match(SLOT, /export const ShellSidebarSlotContext = createContext<HTMLElement \| null>\(null\);/);
    assert.match(SLOT, /export function useShellSidebarSlot\(\): HTMLElement \| null/);
    assert.match(
      SLOT,
      /export function ShellSidebarPortal\(\{ children \}: \{ children: ReactNode \}\): ReactElement \| null/,
    );
    const guard = SLOT.indexOf('if (slot === null) return null;');
    const portal = SLOT.indexOf('createPortal(children, slot)');
    assert.ok(guard !== -1 && portal !== -1 && guard < portal, 'sem slot, nada de createPortal (SSR-safe)');
  });
});
