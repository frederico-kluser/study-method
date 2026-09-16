/**
 * tests/lessonSourcesViewer.test.ts — ONDA2-FONTES: a fonte escolhida no
 * diálogo de Fontes é EMBEBIDA no tabpanel da aula.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O PEDIDO DO DONO (verbatim)
 * ══════════════════════════════════════════════════════════════════════════
 * *"quando clico em fontes, e escolho uma das fontes, quero que renderize ela
 * no 'role="tabpanel"' inteiro ali com um botao de fechar para sair do iframe,
 * e abrir de novo o modal das fontes"*.
 *
 * O que o código fazia: o item do diálogo era um `<Link target="_blank">` —
 * escolher uma fonte ABANDONAVA o app. O que ele faz agora: o item é um
 * botão; escolher fecha o diálogo e abre o `LessonSourceViewer` via portal
 * DENTRO do `role="tabpanel"` da aula (`#sm-panel-lesson`), cobrindo-o
 * inteiro, com botão "Fechar" — e fechar REABRE o diálogo.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * COMO SE PROVA ISSO SEM jsdom (padrão de tests/lessonActionRow.test.ts)
 * ══════════════════════════════════════════════════════════════════════════
 *   BLOCO 1 — A TELA, RENDERIZADA. `LessonSourceViewer` é exportado pela
 *     própria view (a view usa ESTE componente — não há cópia para teste):
 *     monta-se com o tema e o i18n REAIS e mede-se o iframe (src/title),
 *     "Fechar" com nome acessível, o link de reserva com href e o aviso de
 *     frame bloqueado.
 *   BLOCO 2 — A FIAÇÃO, ANCORADA NA FONTE. O que só um clique provaria (o
 *     handler do item, o fechar ÚNICO, o portal e o Esc) é cobrado como
 *     texto, ancorado no recorte da função.
 *   BLOCO 3 — AS ÂNCORAS FORA DA VIEW. O tabpanel do App.tsx tem de ser o
 *     ancestral `position:'relative'` do overlay, e o CSP do index.html tem
 *     de autorizar o embed (`frame-src https:`) com o motivo documentado.
 *
 * Reprodução: `bash tools/t.sh tests/lessonSourcesViewer.test.ts`
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

const HERE = dirname(fileURLToPath(import.meta.url));
const VIEW_PATH = resolve(HERE, '../src/views/LessonView/LessonView.tsx');
const VIEW_SRC = readFileSync(VIEW_PATH, 'utf8');
const VIEW_MODULE = new URL('../src/views/LessonView/LessonView.tsx', import.meta.url).href;
const APP_PATH = resolve(HERE, '../src/App.tsx');
const APP_SRC = readFileSync(APP_PATH, 'utf8');
const INDEX_PATH = resolve(HERE, '../index.html');
const INDEX_SRC = readFileSync(INDEX_PATH, 'utf8');

/** Fonte sem comentários — só o código que realmente roda. */
function codeOf(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
/** Colapso de espaços — a âncora casa em UMA linha lógica, não em uma física. */
function flat(text: string): string {
  return codeOf(text).replace(/\s+/g, ' ');
}

const VIEW = flat(VIEW_SRC);
const APP = codeOf(APP_SRC);
const INDEX = INDEX_SRC;

interface ViewerProps {
  source: { title: string; url: string; description?: string };
  onClose: () => void;
  openExternalHref: string;
}

let LessonSourceViewer: ComponentType<ViewerProps>;

const SOURCE: ViewerProps['source'] = {
  title: 'MDN — JavaScript',
  url: 'https://developer.mozilla.org/pt-BR/docs/Web/JavaScript',
  description: 'Referência oficial da linguagem.',
};

before(async () => {
  process.env.I18NEXT_NO_SUPPORT_NOTICE = '1';
  await i18next.use(initReactI18next).init({
    lng: 'pt-BR',
    // A MESMA opção de interpolação da produção (src/i18n/index.ts) — sem ela
    // o harness mede uma string que o app nunca emite (aspas viram &quot;).
    interpolation: { escapeValue: false },
    resources: { 'pt-BR': { translation: ptBR }, en: { translation: en } },
  });
  const mod = (await import(VIEW_MODULE)) as { LessonSourceViewer: typeof LessonSourceViewer };
  LessonSourceViewer = mod.LessonSourceViewer;
});

function render(props: Partial<ViewerProps> = {}): string {
  return renderToStaticMarkup(
    createElement(
      ThemeProvider,
      { theme },
      createElement(LessonSourceViewer, {
        source: SOURCE,
        onClose: () => {},
        openExternalHref: SOURCE.url,
        ...props,
      }),
    ),
  );
}

/** A tag de abertura do <iframe> renderizado (só pode haver UM). */
function iframeTag(html: string): string {
  const at = html.indexOf('<iframe');
  assert.notEqual(at, -1, 'nenhum <iframe> foi renderizado');
  return html.slice(at, html.indexOf('>', at) + 1);
}

/** A tag de abertura do elemento que CONTÉM `marker` (âncora do irmão). */
function tagOfElementWith(html: string, marker: string, tag: string): string {
  let at = html.indexOf(marker);
  while (at !== -1) {
    const open = html.lastIndexOf(`<${tag}`, at);
    if (open !== -1 && !html.slice(open, at).includes(`</${tag}>`)) {
      return html.slice(open, html.indexOf('>', open) + 1);
    }
    at = html.indexOf(marker, at + 1);
  }
  assert.fail(`nenhum <${tag}> com "${marker}" foi renderizado`);
}

/** O TEXTO visível do <button> que contém `marker` — o nome acessível dele. */
function textOfButton(html: string, marker: string): string {
  // Percorre TODAS as ocorrências: o Tooltip do MUI clona a casca com
  // `aria-label` ANTES do botão (e um rótulo pode aparecer em frase alheia) —
  // a ocorrência válida é a que mora dentro de um <button> ainda aberto.
  let at = html.indexOf(marker);
  while (at !== -1) {
    const open = html.lastIndexOf('<button', at);
    if (open !== -1 && !html.slice(open, at).includes('</button>')) {
      const end = html.indexOf('</button>', at);
      // O emotion injeta <style> DENTRO do botão (folhas do startIcon/ícone):
      // tirar os blocos inteiros antes de descascar as tags, ou o "texto"
      // viraria CSS.
      return html
        .slice(html.indexOf('>', open) + 1, end)
        .replace(/<style[\s\S]*?<\/style>/g, '')
        .replace(/<[^>]+>/g, '')
        .trim();
    }
    at = html.indexOf(marker, at + 1);
  }
  assert.fail(`nenhum <button> com "${marker}" foi renderizado`);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * BLOCO 1 — a TELA, renderizada com o tema e o i18n REAIS
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('1. LessonSourceViewer — a tela do embed', () => {
  it('o iframe aponta para a fonte escolhida, com title acessível', () => {
    const tag = iframeTag(render());
    assert.match(tag, /src="https:\/\/developer\.mozilla\.org\/pt-BR\/docs\/Web\/JavaScript"/);
    assert.match(tag, /title="MDN — JavaScript"/);
  });

  it('"Fechar" é um botão com nome acessível exatamente "Fechar"', () => {
    assert.equal(textOfButton(render(), 'Fechar'), 'Fechar');
  });

  it('o link de reserva "Abrir no navegador" abre a fonte EXTERNA (target=_blank)', () => {
    const html = render();
    const tag = tagOfElementWith(html, 'Abrir no navegador', 'a');
    assert.match(tag, /href="https:\/\/developer\.mozilla\.org\/pt-BR\/docs\/Web\/JavaScript"/);
    assert.match(tag, /target="_blank"/);
    assert.match(tag, /rel="noreferrer"/);
  });

  it('o aviso de frame bloqueado está na tela (rota de fuga anunciada)', () => {
    assert.ok(
      render().includes('proíbe ser exibido dentro do app'),
      'o aviso lesson.sourcesViewerFrameHint deve estar renderizado',
    );
  });

  it('en espelha os rótulos (Close / Open in browser) — paridade de idioma', async () => {
    await i18next.changeLanguage('en');
    try {
      const html = render();
      assert.equal(textOfButton(html, 'Close'), 'Close');
      assert.ok(html.includes('Open in browser'));
      assert.ok(html.includes('refuse to be displayed'));
    } finally {
      await i18next.changeLanguage('pt-BR');
    }
  });

  it('SEM fonte não há embed nenhum — o portal nem é montado pela view', () => {
    // A VIEW (não o componente) guarda o iframe atrás de `openSource !== null`:
    // com diálogo fechado e fonte nenhuma o tabpanel fica limpo (o e2e mede o
    // count 0 do iframe). Aqui a prova é textual, ancorada na guarda.
    assert.ok(
      VIEW.includes('openSource !== null && lessonPanel !== null ? createPortal('),
      'o overlay do visualizador deve nascer atrás da guarda openSource/lessonPanel',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * BLOCO 2 — a FIAÇÃO, ancorada na fonte da view
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('2. LessonView — a fiação do visualizador', () => {
  it('o item do diálogo é UM BOTÃO (ListItemButton) que fecha o diálogo e abre a fonte', () => {
    assert.match(VIEW, /<ListItemButton/);
    assert.ok(
      VIEW.includes('setSourcesOpen(false); setOpenSource(s);'),
      'o clique do item deve fechar o diálogo E escolher a fonte',
    );
  });

  it('o FECHAR é UM handler: limpa a fonte E reabre o diálogo de Fontes', () => {
    assert.ok(
      VIEW.includes('const closeSourceViewer = useCallback(() => { setOpenSource(null); setSourcesOpen(true);'),
      'sair do iframe tem de voltar para a lista (nunca para o nada)',
    );
    // …e o Fechar do visualizador usa exatamente esse handler.
    assert.ok(VIEW.includes('<LessonSourceViewer source={openSource} onClose={closeSourceViewer}'));
  });

  it('o onClose do DIÁLOGO continua só fechando (não reabre nada em cascata)', () => {
    assert.match(VIEW, /<Dialog open=\{sourcesOpen\} onClose=\{\(\) => setSourcesOpen\(false\)\}/);
  });

  it('o portal mora DENTRO do tabpanel da aula (navPanelId("lesson"))', () => {
    assert.ok(
      VIEW.includes("document.getElementById(navPanelId('lesson'))"),
      'o alvo do portal deve ser #sm-panel-lesson, vindo de navPanelId',
    );
    assert.match(VIEW, /createPortal\(/);
  });

  it('o overlay cobre o tabpanel INTEIRO (absolute inset:0, acima do conteúdo)', () => {
    assert.match(VIEW, /position: 'absolute',\s*inset: 0,\s*zIndex: 40,/s);
  });

  it('Esc com o visualizador aberto fecha pelo MESMO handler', () => {
    assert.match(
      VIEW,
      /if \(event\.key === 'Escape'\) closeSourceViewer\(\);/,
      'Esc é o segundo caminho do MESMO fechar',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * BLOCO 3 — as âncoras FORA da view (App.tsx e index.html)
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('3. As âncoras do tabpanel e do CSP', () => {
  it('o main role="tabpanel" do App.tsx é position:relative (âncora do overlay)', () => {
    const at = APP.indexOf('role="tabpanel"');
    assert.notEqual(at, -1, 'o App.tsx deve ter o main role="tabpanel"');
    const view = APP.indexOf('<View onNavigate', at);
    assert.notEqual(view, -1, 'o Box do tabpanel fecha no <View>');
    const box = APP.slice(at, view);
    assert.match(box, /position: 'relative'/, 'o overlay do visualizador escala até o PRIMEIRO ancestral posicionado');
  });

  it('o CSP do index.html autoriza o embed com frame-src https:', () => {
    const meta = INDEX.match(/content="([^"]*frame-src[^"]*)"/);
    assert.notEqual(meta, null, 'frame-src deve estar no content= do meta CSP');
    assert.match(meta![1], /frame-src https:/);
  });

  it('o motivo do frame-src está documentado no PRÓPRIO index.html', () => {
    assert.match(
      INDEX,
      /LessonSourceViewer|visualizador de Fontes/,
      'o comentário do CSP deve citar por que o frame-src existe',
    );
  });
});
