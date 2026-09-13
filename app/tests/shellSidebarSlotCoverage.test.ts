/**
 * tests/shellSidebarSlotCoverage.test.ts — COMPLEMENTO de
 * tests/shellSidebarSlot.test.ts (onda1-sidebar-slot): bordas do SSR do
 * portal, variações da prop `slotRef` do SessionFrame e guardas de fonte da
 * fiação do slot em App.tsx que os arquivos-irmãos não cobrem.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O QUE ESTE ARQUIVO PROVA (e o que ele NÃO consegue provar)
 * ══════════════════════════════════════════════════════════════════════════
 * Mesma técnica da casa (node:test SEM jsdom; SSR com react-dom/server +
 * guardas de FONTE por regex no .tsx — ver tests/shellSidebarSlot.test.ts,
 * tests/shellSidebar.test.ts e tests/shellSplitUi.test.ts). ANTES de escrever
 * este arquivo, os três foram lidos por completo: tests/shellSplitUi.test.ts
 * já esgota a animação do flex-basis (animateBasis/SPLIT_MOTION/prefers-
 * reduced-motion) e o reflexo de basisPx em flex-basis/width — por isso ESTE
 * arquivo NÃO repete nada disso, e cobre só o que sobrou:
 *
 *   BLOCO 1 — POR QUE O GUARD `slot === null` É INDISPENSÁVEL (a prova
 *     COMPORTAMENTAL, não só a de fonte que o irmão já faz). CAUSA CORRETA
 *     (verificada empiricamente com uma sonda descartável antes de escrever
 *     este bloco — o guard só testa `=== null`, nunca "estamos no servidor?"):
 *     no SSR e no 1º render do cliente (antes do callback ref do SessionFrame
 *     commitar) o slot É `null` — é ESSE o caso real. Sem o guard, `
 *     createPortal(children, null)` lançaria NA HORA "Target container is not
 *     a DOM element." (a checagem de container mora dentro do próprio
 *     `createPortal` importado de 'react-dom', não no reconciliador de SSR);
 *     com o guard, `ShellSidebarPortal` só devolve `null` e o React renderiza
 *     "". A mensagem "Portals are not currently supported by the server
 *     renderer" é uma história DIFERENTE, que o guard NÃO evita: ela só
 *     aparece se o slot fosse NÃO NULO durante o SSR (mesmo um objeto fake) —
 *     e um slot não-nulo sempre cai no `createPortal` de verdade, com ou sem
 *     guard (o guard não olha para isso). Esse segundo throw só prova que o
 *     portal é recurso EXCLUSIVO do cliente — impossível na prática porque o
 *     slot só vira não-nulo pelo callback ref (`slotRef`), que o SSR nunca
 *     chama (ver BLOCO 2). Também cobre bordas de `children` (null, múltiplos
 *     filhos, Fragment) sem slot — sempre "" e nunca lança — e a identidade
 *     referencial do nó entre dois consumidores do MESMO Provider.
 *
 *   BLOCO 2 — SESSIONFRAME: BORDAS DO CONTÊINER-SLOT QUE OS IRMÃOS NÃO
 *     COBREM. `slotRef` (o callback ref) NUNCA é invocado durante
 *     `renderToStaticMarkup`/`renderToString` — a alegação central do
 *     cabeçalho do arquivo de produção ("no servidor... callback ref nunca
 *     roda"), provada aqui diretamente no componente real, não apenas
 *     documentada. E o contêiner-slot é um `<div>` neutro: sem `role` e sem
 *     `aria-*` próprios (a semântica é de quem publica, nunca do slot) — o
 *     irmão prova a ORDEM e o `:empty`, não a AUSÊNCIA de papel.
 *
 *   BLOCO 3 — APP.TSX: GUARDAS DE FONTE DA FIAÇÃO DO SLOT QUE FALTAVAM. O
 *     irmão prova que o Provider envolve SessionFrame E main; aqui fecha a
 *     lacuna: o Provider envolve TAMBÉM o SplitDivider (os três — sidebar,
 *     divisória, main — ficam do lado de dentro). E a ASSIMETRIA
 *     publicador/consumidor: o shell PUBLICA o nó (é dono do estado e do
 *     Provider) mas NUNCA o CONSOME — não importa `useShellSidebarSlot` nem
 *     `ShellSidebarPortal` —, e o CONTRATO de fiação do estado
 *     `sidebarSlotEl`: o setter (`setSidebarSlotEl`) alimenta o `slotRef` do
 *     SessionFrame e o próprio estado alimenta o `value` do Provider. (Não
 *     travamos que seja o ÚNICO `useState<HTMLElement...>` do arquivo — uma
 *     feature futura legítima com outro estado de nó DOM não pode quebrar
 *     este teste sem regressão real.)
 *
 * O que este arquivo NÃO prova (do mesmo jeito que os irmãos): o
 * teletransporte real do portal para dentro da coluna montada no DOM, e o
 * esvaziamento do slot ao trocar de aba — isso é dos specs e2e Playwright
 * quando a LessonView publicar no slot (onda 2). App.tsx em si não é
 * renderizado aqui (puxa IPC/Electron via useStartup/AppGate) — só a fonte é
 * trancada por regex, o mesmo caminho que os três irmãos já usam para ele.
 *
 * Reprodução: `bash tools/t.sh tests/shellSidebarSlotCoverage.test.ts`
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createElement, Fragment, type ComponentType, type Context, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { ThemeProvider } from '@mui/material/styles';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import { theme } from '../src/theme';
import ptBR from '../src/i18n/locales/pt-BR/translation.json';
import en from '../src/i18n/locales/en/translation.json';

// ATENÇÃO ao padrão da casa: módulos .tsx são importados DINAMICAMENTE por URL
// (o tsconfig de tests/ não liga `jsx` — ver tests/shellSidebarSlot.test.ts).
const SLOT_MODULE = new URL('../src/components/shell/ShellSidebarSlot.tsx', import.meta.url).href;
const SESSION_FRAME_MODULE = new URL('../src/components/shell/SessionFrame.tsx', import.meta.url).href;

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_PATH = resolve(HERE, '../src/App.tsx');

/** Fonte sem comentários — só o código que realmente roda. */
function codeOf(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** O HTML sem as folhas `<style>` do emotion — só a marcação. */
function markupOf(html: string): string {
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
}

/** A TAG DE ABERTURA do elemento que carrega `marker`. */
function openTagWith(html: string, marker: string): string {
  const at = html.indexOf(marker);
  assert.notEqual(at, -1, `marcador "${marker}" não está no HTML`);
  const open = html.lastIndexOf('<', at);
  return html.slice(open, html.indexOf('>', at) + 1);
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

function renderFrame(slotRef: (el: HTMLElement | null) => void = () => {}): string {
  return renderToStaticMarkup(
    createElement(
      ThemeProvider,
      { theme },
      createElement(SessionFrame, { basisPx: 240, animateBasis: false, slotRef }),
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

/* ═════ BLOCO 1 — POR QUE O GUARD `slot === null` É INDISPENSÁVEL ═════════ */

describe('1. ShellSidebarPortal — a prova COMPORTAMENTAL de por que o guard existe', () => {
  it('com um slot NÃO NULO (fake), o portal roda createPortal de verdade — o SSR desta base LANÇA porque não suporta NENHUM portal (não é o guard que evita isso: ele só olha "=== null")', () => {
    const fakeNode = { nodeType: 1 } as unknown as HTMLElement;
    assert.throws(
      () =>
        renderToStaticMarkup(
          createElement(
            slot.ShellSidebarSlotContext.Provider,
            { value: fakeNode },
            createElement(slot.ShellSidebarPortal, null, createElement('div', null, 'conteúdo da coluna')),
          ),
        ),
      /Portals are not currently supported by the server renderer/,
      'o guard "if (slot === null) return null" NÃO intercepta um slot não-nulo (fake ou ' +
        'real) — com slot não-nulo o createPortal roda com ou sem guard. Este throw só prova ' +
        'que o portal é recurso EXCLUSIVO do cliente: o SSR desta base não suporta ' +
        'createPortal com NENHUM container válido. É impossível em produção porque o slot só ' +
        'vira não-nulo pelo callback ref do SessionFrame, que o SSR nunca chama (ver BLOCO 2)',
    );
  });

  it('o mesmo lançamento (mesma causa: portal é exclusivo do cliente) acontece com renderToString (os dois pontos de entrada do SSR da casa)', () => {
    const fakeNode = { nodeType: 1 } as unknown as HTMLElement;
    assert.throws(
      () =>
        renderToString(
          createElement(
            slot.ShellSidebarSlotContext.Provider,
            { value: fakeNode },
            createElement(slot.ShellSidebarPortal, null, 'x'),
          ),
        ),
      /Portals are not currently supported by the server renderer/,
    );
  });

  it('a razão REAL do guard: createPortal(filho, null) DIRETO lança "Target container is not a DOM element" (o caso real de todo SSR); ShellSidebarPortal sem slot devolve "" — o guard em ação', () => {
    // Sem o guard, ShellSidebarPortal faria exatamente esta chamada sempre
    // que slot === null — o caso REAL de todo SSR e do 1º render do cliente,
    // antes de o callback ref do SessionFrame commitar (nunca o caso do fake
    // não-nulo dos dois testes acima). Chamamos createPortal DIRETO (a mesma
    // função que a produção importa de 'react-dom') porque, com o guard
    // presente, ShellSidebarPortal nunca chega a esse ponto quando slot é
    // null — não dá para observar "o que aconteceria sem o guard" através
    // dele.
    function DirectNullPortal() {
      return createPortal(createElement('div', null, 'conteúdo'), null as unknown as Element);
    }
    assert.throws(
      () => renderToStaticMarkup(createElement(DirectNullPortal)),
      /Target container is not a DOM element/,
      'esta é a exceção que o guard "if (slot === null) return null" evita no caso REAL ' +
        '(slot null no SSR e no 1º render do cliente) — NÃO a de "Portals are not currently ' +
        'supported", que é sobre um slot não-nulo (ver os dois testes acima)',
    );

    // Com o guard em produção, o MESMO cenário real (slot null) nunca chega
    // no createPortal: ShellSidebarPortal devolve null e o React renderiza "".
    assert.equal(
      renderToStaticMarkup(
        createElement(slot.ShellSidebarPortal, null, createElement('div', null, 'conteúdo')),
      ),
      '',
      'com o guard, slot null (o caso real) nunca aciona createPortal — "" e nunca lança',
    );
  });

  it('SEM slot (o caso real do servidor): children=null, vários filhos ou Fragment — sempre "" e nunca lança', () => {
    assert.equal(renderToStaticMarkup(createElement(slot.ShellSidebarPortal, null, null)), '');
    assert.equal(
      renderToStaticMarkup(
        createElement(
          slot.ShellSidebarPortal,
          null,
          createElement('div', null, 'a'),
          createElement('div', null, 'b'),
        ),
      ),
      '',
      'múltiplos filhos sem slot continuam sem renderizar nada',
    );
    assert.equal(
      renderToStaticMarkup(
        createElement(slot.ShellSidebarPortal, null, createElement(Fragment, null, 'a', 'b')),
      ),
      '',
      'um Fragment como único filho também não escapa do guard',
    );
  });

  it('dois consumidores no MESMO Provider leem a MESMA referência do nó (contexto compartilhado)', () => {
    const seenA: Array<HTMLElement | null> = [];
    const seenB: Array<HTMLElement | null> = [];
    function ProbeA(): null {
      seenA.push(slot.useShellSidebarSlot());
      return null;
    }
    function ProbeB(): null {
      seenB.push(slot.useShellSidebarSlot());
      return null;
    }
    const fakeNode = { nodeType: 1 } as unknown as HTMLElement;
    renderToStaticMarkup(
      createElement(
        slot.ShellSidebarSlotContext.Provider,
        { value: fakeNode },
        createElement(ProbeA),
        createElement(ProbeB),
      ),
    );
    assert.equal(seenA[0], fakeNode);
    assert.equal(seenB[0], fakeNode);
    assert.equal(seenA[0], seenB[0], 'os dois consumidores recebem a MESMA referência — não uma cópia');
  });
});

/* ═══════ BLOCO 2 — SESSIONFRAME: BORDAS DO SLOT QUE OS IRMÃOS NÃO COBREM ══ */

describe('2. SessionFrame — slotRef nunca roda no SSR; o slot fica semanticamente neutro', () => {
  it('slotRef NUNCA é chamado durante renderToStaticMarkup (a alegação central do cabeçalho do arquivo)', () => {
    let called = false;
    renderFrame(() => {
      called = true;
    });
    assert.equal(called, false, 'callback ref não roda em renderToStaticMarkup — só no commit do cliente');
  });

  it('o mesmo vale para renderToString', () => {
    let called = false;
    renderToString(
      createElement(
        ThemeProvider,
        { theme },
        createElement(SessionFrame, {
          basisPx: 240,
          animateBasis: false,
          slotRef: () => {
            called = true;
          },
        }),
      ),
    );
    assert.equal(called, false);
  });

  it('o contêiner-slot não carrega NENHUM role nem aria-* — a semântica é de quem publica, não do slot', () => {
    const markup = markupOf(renderFrame());
    const tag = openTagWith(markup, `id="${slot.SHELL_SIDEBAR_SLOT_ID}"`);
    assert.ok(!/\brole="/.test(tag), `o slot não pode ter role próprio: ${tag}`);
    assert.ok(!/\baria-[\w-]+="/.test(tag), `o slot não pode ter aria-* próprio: ${tag}`);
  });

  it('o contêiner-slot é um <div> neutro — nunca <header>/<section> (quem decide a tag é o conteúdo publicado)', () => {
    const markup = markupOf(renderFrame());
    const tag = openTagWith(markup, `id="${slot.SHELL_SIDEBAR_SLOT_ID}"`);
    assert.match(tag, /^<div\b/, `o slot tem que ser um <div>, veio: ${tag}`);
  });
});

/* ═══════ BLOCO 3 — APP.TSX: GUARDAS DE FONTE DA FIAÇÃO DO SLOT ═══════════ */

describe('3. App.tsx — guardas de fonte da fiação do slot que faltavam nos irmãos', () => {
  const APP = codeOf(readFileSync(APP_PATH, 'utf8'));

  it('o Provider do slot envolve TAMBÉM o SplitDivider (não só SessionFrame e main)', () => {
    const open = APP.indexOf('<ShellSidebarSlotContext.Provider value={sidebarSlotEl}>');
    const close = APP.indexOf('</ShellSidebarSlotContext.Provider>');
    const divider = APP.indexOf('<SplitDivider');
    assert.ok(open !== -1 && close !== -1 && divider !== -1, 'Provider/SplitDivider ausentes');
    assert.ok(open < divider && divider < close, 'a divisória tem que ficar DENTRO do Provider do slot');
  });

  it('App.tsx PUBLICA o nó mas nunca o CONSOME: sem useShellSidebarSlot nem ShellSidebarPortal', () => {
    assert.ok(!APP.includes('useShellSidebarSlot'), 'o shell não lê o próprio slot — só a view ativa lê');
    assert.ok(!APP.includes('ShellSidebarPortal'), 'o shell não publica no próprio slot');
    assert.match(
      APP,
      /import \{ ShellSidebarSlotContext \} from '\.\/components\/shell\/ShellSidebarSlot';/,
      'App.tsx importa só o Context cru, nunca o hook nem o portal',
    );
  });

  it('o estado sidebarSlotEl existe, o setter alimenta o slotRef do SessionFrame e o valor alimenta o value do Provider', () => {
    // Contrato REAL da fiação (sem travar unicidade de useState<HTMLElement...>
    // no arquivo — uma feature futura legítima com outro estado de nó DOM não
    // pode quebrar este teste sem regressão real).
    assert.match(
      APP,
      /const \[sidebarSlotEl, setSidebarSlotEl\] = useState<HTMLElement \| null>\(null\);/,
      'o estado do nó do slot tem que existir com este nome e este tipo',
    );
    assert.match(
      APP,
      /slotRef=\{setSidebarSlotEl\}/,
      'o setter do estado tem que alimentar o slotRef do SessionFrame',
    );
    assert.match(
      APP,
      /<ShellSidebarSlotContext\.Provider value=\{sidebarSlotEl\}>/,
      'o valor do estado tem que alimentar o value do Provider do slot',
    );
  });
});
