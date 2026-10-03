/**
 * tests/editorPaneView.test.ts — a VIEW pura do painel do editor
 * (`src/components/editor/EditorPaneView.tsx`) renderizada com o renderizador
 * REAL (`react-dom/server`) + tema + i18n reais — padrão da casa, ver
 * `tests/lessonSidebarHeader.test.ts` (sem jsdom: import dinâmico por URL,
 * contrato de props declarado localmente).
 *
 * O que se prova AQUI (com honestidade sobre o que o SSR NÃO consegue):
 *
 *   BLOCO 1 — ESTADOS. Vazio (prompt + Salvar desabilitado), com abas
 *     (tablist + aba ativa `aria-selected`), erro (Alert com a mensagem),
 *     ocupado ("Abrindo <path>…") — e o editor (CodeMirrorField) só com aba
 *     ativa.
 *   BLOCO 2 — ACESSIBILIDADE das abas: nome do fecho interpolado
 *     ("Fechar {{name}}"), "Alterações não salvo" em TEXTO para a AT.
 *   BLOCO 3 — REGRESSÃO DO BUG sr-only (LAYOUT-DRY-AUDIT §5): a caixa
 *     phantom do texto da AT mede `1px × 1px` com `margin: -1px` — NÃO
 *     `100%`/`-8px` (o sizingTransform do @mui/system convertia `width: 1`
 *     em percentagem e `m: -1` em spacing).
 *   BLOCO 4 — i18n nos DOIS idiomas com as chaves existentes.
 *
 * Reprodução: `bash tools/t.sh tests/editorPaneView.test.ts`
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
import en from '../src/i18n/locales/en/translation.json';

// Padrão da casa: o componente é .tsx e o tsconfig de tests/ não liga `jsx` —
// importação DINÂMICA por URL (ver tests/lessonSidebarHeader.test.ts).
const COMPONENT_MODULE = new URL(
  '../src/components/editor/EditorPaneView.tsx',
  import.meta.url,
).href;

/* ═══════════════════════════════════════════════════════════════════════════
 * Ferramentas de medição do HTML/CSS que o SSR emite
 * ═══════════════════════════════════════════════════════════════════════════ */

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

/** O HTML sem as folhas `<style>` que o emotion embute no SSR — só a marcação. */
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

/** A classe do emotion (`css-*`) do elemento que carrega `marker`. */
function emotionClassOf(html: string, marker: string): string {
  const cls = /class="([^"]*)"/.exec(openTagWith(html, marker))?.[1].split(/\s+/);
  const emotion = cls?.find((c) => c.startsWith('css-'));
  assert.ok(emotion, `elemento com "${marker}" não tem classe do emotion`);
  return emotion;
}

/**
 * O valor FINAL de uma propriedade na regra-BASE de uma classe (seletor
 * exatamente `.classe`): a última declaração vence — é o que se pinta.
 */
function finalDeclOf(html: string, cls: string, prop: string): string | undefined {
  const decls = cssRulesOf(html)
    .filter((r) => r.selector === `.${cls}`)
    .flatMap((r) => r.body.split(';'))
    .map((d) => d.trim())
    .filter((d) => d.startsWith(`${prop}:`));
  return decls.at(-1)?.slice(prop.length + 1);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Contrato de props (local — o tipo exportado vive em .tsx) + fixtures
 * ═══════════════════════════════════════════════════════════════════════════ */

interface TabFixture {
  path: string;
  name: string;
  content: string;
  dirty: boolean;
  language?: string;
}

interface EditorPaneViewProps {
  tabs: TabFixture[];
  activePath: string | null;
  error?: string;
  busyPath?: string | null;
  onSaveActive: () => void;
  onActivate: (path: string) => void;
  onClose: (path: string) => void;
  onContentChange: (value: string) => void;
}

let EditorPaneView: ComponentType<EditorPaneViewProps>;

const TAB_PY: TabFixture = {
  path: 'src/main.py',
  name: 'main.py',
  content: 'def soma(a, b):\n    return a + b\n',
  dirty: false,
  language: 'py',
};
const TAB_RS: TabFixture = {
  path: 'src/fib.rs',
  name: 'fib.rs',
  content: 'fn fib(n: u64) -> u64 { n }\n',
  dirty: true,
  language: 'rs',
};

const NOOP = {
  onSaveActive: () => {},
  onActivate: () => {},
  onClose: () => {},
  onContentChange: () => {},
};

function renderPane(props: Partial<EditorPaneViewProps> = {}): string {
  return renderToStaticMarkup(
    createElement(
      ThemeProvider,
      { theme },
      createElement(EditorPaneView, {
        tabs: [],
        activePath: null,
        ...NOOP,
        ...props,
      }),
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
  const mod = (await import(COMPONENT_MODULE)) as {
    EditorPaneView: typeof EditorPaneView;
  };
  EditorPaneView = mod.EditorPaneView;
});

/* ═══════════════════ BLOCO 1 — ESTADOS ═══════════════════ */

describe('1. estados do painel', () => {
  it('vazio: prompt de seleção, sem tablist, Salvar DESABILITADO', () => {
    const html = renderPane();
    const markup = markupOf(html);
    assert.ok(markup.includes(ptBR.editor.selectFilePrompt), 'o prompt vazio tem de aparecer');
    assert.ok(!markup.includes('role="tablist"'), 'sem abas não há tablist');
    const save = openTagWith(markup, ptBR.editor.save);
    assert.match(save, /^<button\b/);
    assert.match(save, /\bdisabled\b/, 'sem aba ativa o Salvar fica desabilitado');
  });

  it('com abas: tablist nomeada, aba ativa com aria-selected, Salvar habilitado', () => {
    const markup = markupOf(
      renderPane({ tabs: [TAB_PY, TAB_RS], activePath: TAB_PY.path }),
    );
    const tablist = openTagWith(markup, 'role="tablist"');
    assert.ok(
      tablist.includes(`aria-label="${ptBR.editor.openTabsAria}"`),
      'a tablist precisa do nome acessível',
    );
    assert.ok(markup.includes('main.py') && markup.includes('fib.rs'), 'os nomes das abas aparecem');
    const activeTabTag = openTagWith(markup, 'main.py');
    assert.ok(activeTabTag.includes('aria-selected="true"'), 'a aba ativa é aria-selected');
    const save = openTagWith(markup, ptBR.editor.save);
    assert.ok(!/\bdisabled\b/.test(save), 'com aba ativa o Salvar habilita');
  });

  it('erro: o Alert mostra a mensagem recebida por prop', () => {
    // Sem aspas duplas no texto: o SSR do React escapa `"` para `&quot;` e a
    // asserção procura o texto tal como foi passado.
    const message = 'Não consegui abrir src/main.py: Error: boom';
    const markup = markupOf(renderPane({ tabs: [TAB_PY], activePath: TAB_PY.path, error: message }));
    assert.ok(markup.includes(message), 'a mensagem de erro chega inteira ao Alert');
  });

  it('ocupado: "Abrindo <path>…" enquanto a leitura corre', () => {
    const markup = markupOf(renderPane({ busyPath: 'src/main.py' }));
    assert.ok(
      markup.includes(`${ptBR.editor.opening} src/main.py`),
      'o estado ocupado nomeia o path em curso',
    );
  });

  it('o editor (CodeMirrorField) só renderiza com aba ATIVA', () => {
    const withActive = markupOf(renderPane({ tabs: [TAB_PY], activePath: TAB_PY.path }));
    assert.ok(withActive.includes('cm-theme'), 'o CodeMirrorField monta o wrapper do editor');
    const withoutActive = markupOf(renderPane({ tabs: [TAB_PY], activePath: null }));
    assert.ok(!withoutActive.includes('cm-theme'), 'sem aba ativa não há editor');
  });
});

/* ═══════════════════ BLOCO 2 — ACESSIBILIDADE ═══════════════════ */

describe('2. acessibilidade das abas', () => {
  it('o fecho de cada aba é focável e nomeado "Fechar {{name}}"', () => {
    const markup = markupOf(renderPane({ tabs: [TAB_PY], activePath: TAB_PY.path }));
    const closeLabel = ptBR.editor.closeTabAria.replace('{{name}}', TAB_PY.name);
    const close = openTagWith(markup, closeLabel);
    assert.match(close, /^<button\b/, 'o fecho tem de ser um botão de verdade');
    assert.ok(close.includes(`aria-label="${closeLabel}"`), 'o nome acessível interpola o nome');
  });

  it('o estado "não salvo" carrega TEXTO real para a AT (não só cor)', () => {
    const markup = markupOf(renderPane({ tabs: [TAB_RS], activePath: TAB_RS.path }));
    assert.ok(markup.includes(ptBR.editor.unsaved), 'a AT anuncia "Alterações não salvas"');
  });
});

/* ═══════════════════ BLOCO 3 — REGRESSÃO sr-only (§5) ═══════════════════ */

describe('3. sr-only sem o bug da auditoria (LAYOUT-DRY-AUDIT §5)', () => {
  it('a caixa phantom mede 1px × 1px com margin -1px — nunca 100%/-8px', () => {
    const html = renderPane({ tabs: [TAB_RS], activePath: TAB_RS.path });
    const cls = emotionClassOf(html, ptBR.editor.unsaved);
    // O sizingTransform do @mui/system convertia `width: 1` em `100%` e
    // `m: -1` em `theme.spacing(-1)` = `-8px` (a caixa OCUPAVA o contentor).
    assert.equal(finalDeclOf(html, cls, 'width'), '1px');
    assert.equal(finalDeclOf(html, cls, 'height'), '1px');
    assert.equal(finalDeclOf(html, cls, 'margin'), '-1px');
  });
});

/* ═══════════════════ BLOCO 4 — i18n ═══════════════════ */

describe('4. i18n nos dois idiomas (chaves existentes)', () => {
  it('en traduz o prompt, o Salvar e o estado não-salvo', async () => {
    await i18next.changeLanguage('en');
    const markup = markupOf(renderPane({ tabs: [TAB_RS], activePath: TAB_RS.path }));
    assert.ok(markup.includes(en.editor.save), 'o botão Salvar traduz');
    assert.ok(markup.includes(en.editor.unsaved), 'o estado não-salvo traduz');
    await i18next.changeLanguage('pt-BR');
    const pt = markupOf(renderPane());
    assert.ok(pt.includes(ptBR.editor.selectFilePrompt), 'o prompt volta a pt-BR');
  });
});
