/**
 * tests/a11yStyles.test.ts — o SR-ONLY canónico, medido no CSS que o SSR
 * EMITE (sem jsdom).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O QUE ESTE ARQUIVO PROVA
 * ══════════════════════════════════════════════════════════════════════════
 * `src/lib/a11yStyles.ts` (`SR_ONLY_SX`) aposentou as cinco cópias de
 * "texto só para leitores de tela" — QUATRO delas com bug latente (auditoria
 * de layout §5): `width: 1` aplicado via `sx` passa pelo `sizingTransform` do
 * `@mui/system` e vira 100%; `m: -1` vira `theme.spacing(-1)` = -8px. A
 * caixa "invisível" nascia 100% × 100% do contentor, a cobrir texto (a régua
 * F104 do e2e acusou texto-sobre-texto numa delas).
 *
 *   BLOCO 1 — O OBJETO: medidas de sr-only são SEMPRE string de px (o número
 *     é unidade do tema — é exatamente isso que cria o bug), com pointerEvents
 *     desligado (a caixa fantasma não rouba cliques).
 *   BLOCO 2 — O CSS EMITIDO: `renderToStaticMarkup` + extração das regras do
 *     emotion (a técnica da casa, ver tests/lessonSidebarHeader.test.ts) — o
 *     `width`/`height` saem 1px (NUNCA 100%), `margin` -1px (NUNCA -8px), e o
 *     clip/overflow/border/white-space fecham o escondimento sem remover do
 *     árvore de acessibilidade.
 *   BLOCO 3 — EM COMPONENTE REAL: o `ActionButton` ocupado anuncia
 *     "A processar…" com o MESMO estilo (prova de que o token chega ao DOM de
 *     um primitivo, não só de um Box de teste) e o rótulo visível continua lá.
 *
 * Reprodução: `bash tools/t.sh tests/a11yStyles.test.ts`
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemeProvider } from '@mui/material/styles';
import Box from '@mui/material/Box';
import { I18nextProvider } from 'react-i18next';

import { theme } from '../src/theme';
import { SR_ONLY_SX } from '../src/lib/a11yStyles';
import { createAppI18n } from '../src/i18n/index';

// Padrão da casa para componente .tsx: import DINÂMICO por URL (o tsconfig de
// tests/ não liga `jsx` — ver tests/lessonSidebarHeader.test.ts).
const ACTION_BUTTON_MODULE = new URL('../src/components/ui/ActionButton.tsx', import.meta.url)
  .href;

interface ActionButtonPropsLocal {
  readonly loading?: boolean;
  readonly children?: string;
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

/** O HTML sem as folhas `<style>` — só a marcação. */
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

/** A classe do emotion (`css-*`) da tag de abertura. */
function emotionClassOfTag(tag: string): string {
  const emotion = /class="([^"]*)"/.exec(tag)?.[1].split(/\s+/).find((c) => c.startsWith('css-'));
  assert.ok(emotion, `tag sem classe do emotion: ${tag}`);
  return emotion;
}

/** O corpo da regra base do emotion para `cls`, como mapa declaração→valor. */
function declOf(html: string, cls: string): Map<string, string> {
  const regra = cssRulesOf(html).find((r) => r.selector === `.${cls}`);
  assert.ok(regra, `sem regra do emotion para .${cls}`);
  const mapa = new Map<string, string>();
  for (const decl of regra.body.split(';')) {
    const dois = decl.indexOf(':');
    if (dois === -1) continue;
    mapa.set(decl.slice(0, dois).trim(), decl.slice(dois + 1).trim());
  }
  return mapa;
}

describe('a11yStyles — BLOCO 1: o objeto SR_ONLY_SX', () => {
  it('medidas absolutas são STRING de px (número em sx é unidade do tema — é o bug §5)', () => {
    assert.equal(SR_ONLY_SX.width, '1px');
    assert.equal(SR_ONLY_SX.height, '1px');
    assert.equal(SR_ONLY_SX.margin, '-1px');
    // O bug das 4 cópias: width: 1 (número) → 100%. A forma correta é string.
    assert.notEqual(SR_ONLY_SX.width as unknown as number, 1);
  });

  it('fecha o escondimento: overflow + clip + nowrap + border 0, e não rouba cliques', () => {
    assert.equal(SR_ONLY_SX.position, 'absolute');
    assert.equal(SR_ONLY_SX.padding, 0);
    assert.equal(SR_ONLY_SX.overflow, 'hidden');
    assert.equal(SR_ONLY_SX.clip, 'rect(0 0 0 0)');
    assert.equal(SR_ONLY_SX.whiteSpace, 'nowrap');
    assert.equal(SR_ONLY_SX.border, 0);
    assert.equal(SR_ONLY_SX.pointerEvents, 'none');
  });
});

describe('a11yStyles — BLOCO 2: o CSS EMITIDO pelo SSR', () => {
  let html = '';
  let decls = new Map<string, string>();

  before(() => {
    html = renderToStaticMarkup(
      createElement(
        ThemeProvider,
        { theme },
        createElement(Box, {
          sx: SR_ONLY_SX,
          children: 'dica para leitor de tela',
        }),
      ),
    );
    decls = declOf(html, emotionClassOfTag(openTagWith(html, 'dica para leitor de tela')));
  });

  it('width/height saem 1px — NUNCA 100% (o bug das quatro cópias)', () => {
    assert.equal(decls.get('width'), '1px');
    assert.equal(decls.get('height'), '1px');
    assert.ok(![...decls.values()].includes('100%'), `saiu 100% no sr-only: ${[...decls]}`);
  });

  it('margin sai -1px — NUNCA o spacing(-1) = -8px do m: -1', () => {
    assert.equal(decls.get('margin'), '-1px');
    assert.ok(![...decls.values()].includes('-8px'), `saiu -8px no sr-only: ${[...decls]}`);
  });

  it('o resto do escondimento chega igual: absolute, overflow hidden, clip, nowrap, border 0, pointer-events none', () => {
    assert.equal(decls.get('position'), 'absolute');
    assert.equal(decls.get('overflow'), 'hidden');
    assert.equal(decls.get('clip'), 'rect(0 0 0 0)');
    assert.equal(decls.get('white-space'), 'nowrap');
    assert.ok(
      decls.get('border') === '0' || /^0px(\s|$)/.test(decls.get('border') ?? ''),
      `border devia sair 0, veio: ${decls.get('border')}`,
    );
    assert.equal(decls.get('pointer-events'), 'none');
    // padding: 0 (o número é unidade do tema = 0px — igual nos dois casos).
    assert.ok(decls.get('padding') === '0' || decls.get('padding') === '0px');
  });

  it('o texto continua NO DOM (sr-only, não display:none — o leitor de tela lê)', () => {
    assert.ok(markupOf(html).includes('dica para leitor de tela'));
  });
});

describe('a11yStyles — BLOCO 3: o token num primitivo real (ActionButton ocupado)', () => {
  let html = '';

  before(async () => {
    const mod = (await import(ACTION_BUTTON_MODULE)) as {
      ActionButton: ComponentType<ActionButtonPropsLocal>;
    };
    const i18n = await createAppI18n('pt-BR');
    html = renderToStaticMarkup(
      createElement(
        I18nextProvider,
        { i18n },
        createElement(
          ThemeProvider,
          { theme },
          createElement(
            mod.ActionButton,
            { loading: true },
            'Tentar de novo',
          ),
        ),
      ),
    );
  });

  it('o anúncio sr-only "A processar…" existe e usa o MESMO estilo escondido', () => {
    const markup = markupOf(html);
    assert.ok(markup.includes('A processar…'), `sem o anúncio sr-only no markup: ${markup.slice(0, 400)}`);
    const decls = declOf(html, emotionClassOfTag(openTagWith(html, 'A processar…')));
    assert.equal(decls.get('width'), '1px');
    assert.equal(decls.get('height'), '1px');
    assert.equal(decls.get('overflow'), 'hidden');
  });

  it('o rótulo VISÍVEL continua lá durante o loading (nome acessível nunca some)', () => {
    assert.ok(markupOf(html).includes('Tentar de novo'));
  });
});
