/**
 * tests/composerMinWidth.test.ts — o PISO do campo do composer cabe na pior
 * coluna que o app suporta E PERSISTE (a razão do split é gravada em disco).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O DEFEITO QUE ESTE ARQUIVO TRAVA (achado de revisão adversarial)
 * ══════════════════════════════════════════════════════════════════════════
 * A onda 1 deixou a linha do composer como
 *
 *     [mic 44px] [campo flexível, minWidth: 240] [Avançar, nowrap]
 *
 * — um PISO RÍGIDO de ~435px de linha. Mas a coluna da aula chega a ~331px
 * numa configuração SUPORTADA e PERSISTIDA:
 *
 *   janela   `minWidth: 900`          (electron/main/index.ts, createWindow)
 *   − rail   104                      (components/shell/NavigationRail.tsx, RAIL_WIDTH)
 *   = 796    container do split
 *   − 6      divider                  (lib/splitRatio.ts, SHELL_SPLIT_CONSTRAINTS.dividerPx)
 *   × 0.5    maxRatio PERSISTIDO      (lib/splitRatio.ts, SHELL_SPLIT_CONSTRAINTS.maxRatio)
 *   = 395    main
 *   − 64     padding do tabpanel md   (App.tsx, `p: { xs: 2, sm: 3, md: 4 }`;
 *                                     breakpoint md default do MUI = 900px —
 *                                     a própria janela mínima)
 *   = 331    coluna da aula na pior hipótese
 *
 * Com o piso de 240, a linha pedia 44 + 16 + ~135 + 240 ≈ 435px: estoura a
 * coluna em TODAS as faixas de padding do tabpanel (xs 363 / sm 347 / md 331)
 * — scrollbar horizontal ou botão cortado, contrariando o contrato do App
 * ("as views são flexíveis e nenhum conteúdo trunca", SC 1.4.12). O conserto:
 * o piso do campo desceu para 128px (44 + 16 + ~135 + 128 = 323 ≤ 331, folga
 * de 8) e o Stack da linha ganhou `flexWrap: 'wrap'` como cinto-e-suspensório.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * COMO SE PROVA ISSO SEM jsdom
 * ══════════════════════════════════════════════════════════════════════════
 * A técnica é a dos precedentes tests/lessonActionRow.test.ts e
 * tests/lessonChatLayout.test.ts: `react-dom/server` com o TEMA e o i18n
 * REAIS, lendo o CSS que o emotion emite nas folhas `<style>` do SSR. SSR não
 * calcula cascata e não mede tinta de texto; por isso a CONTA da largura da
 * linha é uma asserção NUMÉRICA com aritmética explícita, onde cada parcela é
 * ou MEDIDA no CSS emitido (mic, gaps, piso do campo) ou é o min-content
 * DOCUMENTADO do botão "Avançar" — constante com as partes DECLARADAS
 * (nowrap, padding) verificadas no CSS emitido, pois a tinta do rótulo não é
 * mensurável sem layout de navegador.
 *
 * Reprodução: `bash tools/t.sh tests/composerMinWidth.test.ts`
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

/* ═══════════════════════════════════════════════════════════════════════════
 * Ferramentas de medição do CSS que o emotion emite no SSR
 * (mesma técnica dos precedentes lessonChatLayout / lessonActionRow)
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Todas as regras `<seletor>{<corpo>}` das folhas embutidas no HTML do SSR. */
function rulesOf(html: string): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  for (const sheet of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    for (const rule of sheet[1].matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      out.push({ selector: rule[1].trim(), body: rule[2].trim() });
    }
  }
  return out;
}

/**
 * A TAG DE ABERTURA do elemento que carrega `marker` no HTML — primeira
 * ocorrência numa tag de elemento com classe do emotion (descarta folhas
 * `<style>` e embrulhos `class=""` sem classe emitida).
 */
function tagOfElementWith(html: string, marker: string): string {
  let at = html.indexOf(marker);
  while (at !== -1) {
    const open = html.lastIndexOf('<', at);
    const tag = html.slice(open, html.indexOf('>', at) + 1);
    const cls = /class="([^"]*)"/.exec(tag);
    const emotion = cls?.[1].split(/\s+/).find((c) => c.startsWith('css-'));
    if (!tag.startsWith('<style') && emotion !== undefined) return tag;
    at = html.indexOf(marker, at + 1);
  }
  assert.fail(`nenhum elemento com ${marker} e classe do emotion foi renderizado`);
}

/** A classe do emotion aplicada ao elemento que carrega `marker`. */
function classOfElementWith(html: string, marker: string): string {
  const cls = /class="([^"]*)"/.exec(tagOfElementWith(html, marker));
  return (cls?.[1].split(/\s+/).find((c) => c.startsWith('css-')) ?? '') as string;
}

/** O corpo da regra da classe (todas as declarações, concatenadas). */
function cssOfClass(html: string, cls: string): string {
  return rulesOf(html)
    .filter((r) => r.selector === `.${cls}`)
    .map((r) => r.body)
    .join(';');
}

/* ═══════════════════════════════════════════════════════════════════════════
 * O composer REAL, com o tema e o i18n REAIS
 * ═══════════════════════════════════════════════════════════════════════════ */

interface ComposerProps {
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onMicToggle: () => void;
  micTranscribing: boolean;
  disabled: boolean;
  showAdvance: boolean;
  advanceLocked: boolean;
  advanceDisabled: boolean;
  onAdvance: () => void;
  advanceTooltip: string;
}

let LessonComposer: ComponentType<ComposerProps>;

const BASE: ComposerProps = {
  draft: '',
  onDraftChange: () => {},
  onSend: () => {},
  onMicToggle: () => {},
  micTranscribing: false,
  disabled: false,
  // O avanço EM CENA é a pior hipótese da linha — é ele que define o piso.
  showAdvance: true,
  advanceLocked: false,
  advanceDisabled: false,
  onAdvance: () => {},
  advanceTooltip: '',
};

function renderComposer(props: Partial<ComposerProps> = {}): string {
  return renderToStaticMarkup(
    createElement(
      ThemeProvider,
      { theme },
      createElement(LessonComposer, { ...BASE, ...props }),
    ),
  );
}

const MIC = `aria-label="${ptBR.lesson.micStart}"`;
const AVANCAR_TXT = `${ptBR.lesson.advanceButton}</button>`;

/**
 * A classe do emotion do botão "Avançar" (com o span do startIcon na frente:
 * o `<` mais próximo do rótulo é um `</span>`, por isso lastIndexOf('<button')).
 */
function classOfAdvance(html: string): string {
  const at = html.indexOf(AVANCAR_TXT);
  assert.notEqual(at, -1, 'o botão "Avançar" deveria estar renderizado');
  const open = html.lastIndexOf('<button', at);
  assert.notEqual(open, -1, 'nenhum <button> contém o rótulo do avanço');
  const cls = /class="([^"]*)"/.exec(html.slice(open, html.indexOf('>', open) + 1));
  return (cls?.[1].split(/\s+/).find((c) => c.startsWith('css-')) ?? '') as string;
}

before(async () => {
  process.env.I18NEXT_NO_SUPPORT_NOTICE = '1';
  await i18next.use(initReactI18next).init({
    lng: 'pt-BR',
    // MESMA opção de interpolação da produção (src/i18n/index.ts) — o
    // precedente lessonChatLayout provou que o default do i18next diverge
    // do produto e mede strings que o app nunca emite.
    interpolation: { escapeValue: false },
    resources: { 'pt-BR': { translation: ptBR } },
  });
  const mod = (await import(
    new URL('../src/views/LessonView/LessonView.tsx', import.meta.url).href
  )) as { LessonComposer: typeof LessonComposer };
  LessonComposer = mod.LessonComposer;
});

/* ═══════════════════════════════════════════════════════════════════════════
 * BLOCO 1 — o piso do campo, medido no CSS emitido
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('1. o piso do campo do composer cabe na pior coluna', () => {
  it('o CSS emitido do campo declara min-width: 128px (≤ o teto de 136 da conta)', () => {
    const html = renderComposer();
    // O `sx` do TextField desce no root do FormControl (é ele o item da linha).
    const css = cssOfClass(html, classOfElementWith(html, 'MuiFormControl-root'));
    assert.match(css, /min-width:\s*128px/, `CSS emitido do campo: ${css}`);
    // O teto que a pior coluna deixa para o piso: 331 − 44 (mic) − 16 (gaps)
    // − ~135 (min-content do Avançar) = 136. O piso escolhido, 128, deixa
    // folga de 8px (o bloco 3 faz a conta inteira).
    const tetoDoPiso = 331 - 44 - 16 - 135;
    assert.ok(
      128 <= tetoDoPiso,
      `o piso 128 precisa caber no teto ${tetoDoPiso} da pior coluna`,
    );
    // O piso vence o `min-width: 0` que o FormControl base declara — mesmo
    // critério do precedente lessonChatLayout: declaração POSTERIOR no mesmo
    // corpo de regra.
    assert.ok(
      css.lastIndexOf('min-width:128px') > css.indexOf('min-width:0'),
      'o piso 128 vence o min-width:0 do FormControl (declaração posterior no MESMO corpo)',
    );
  });

  it('o piso antigo de 240 não sobrou em lugar nenhum do CSS emitido', () => {
    const html = renderComposer();
    for (const rule of rulesOf(html)) {
      assert.doesNotMatch(
        rule.body,
        /min-width:\s*240px/,
        `a regra .${rule.selector} ainda carrega o piso que estoura a pior coluna`,
      );
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * BLOCO 2 — a linha cede antes de truncar
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('2. o Stack da linha do composer quebra em vez de truncar', () => {
  it('o CSS emitido da linha declara flex-wrap: wrap', () => {
    const html = renderComposer();
    // O Stack é a RAIZ do composer: o MuiStack-root desta renderização é ele.
    const stackTag = tagOfElementWith(html, 'MuiStack-root');
    const cls = /class="([^"]*)"/.exec(stackTag)?.[1].split(/\s+/);
    assert.ok(cls, `o Stack renderizou sem classes: ${stackTag}`);
    const emotion = cls.find((c) => c.startsWith('css-'));
    assert.ok(emotion, `o Stack não tem classe do emotion: ${stackTag}`);
    const css = cssOfClass(html, emotion as string);
    assert.match(
      css,
      /flex-wrap:\s*wrap/,
      `CSS emitido do Stack da linha: ${css} — sem isso, se a linha não couber ` +
        'o conteúdo trunca em vez de quebrar para baixo',
    );
    // E o espaçamento continua sendo gap (useFlexGap), medido aqui: é a
    // parcela de 16px da conta do bloco 3. O tema resolve spacing via
    // variável CSS — o VALOR 8px é cobrado na própria folha do SSR.
    assert.match(css, /gap:\s*var\(--mui-spacing\)/, `CSS emitido do Stack da linha: ${css}`);
    assert.ok(
      rulesOf(html).some((r) => /--mui-spacing:\s*8px/.test(r.body)),
      'a folha do SSR define --mui-spacing: 8px — é daqui que saem os 8px de cada gap',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * BLOCO 3 — a CONTA: o piso da linha inteira cabe na pior coluna
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('3. a CONTA do piso da linha na pior coluna documentada', () => {
  /** `minWidth: 900` da BrowserWindow (app/electron/main/index.ts). */
  const WINDOW_MIN_PX = 900;
  /** `RAIL_WIDTH = 104` (app/src/components/shell/NavigationRail.tsx). */
  const RAIL_PX = 104;
  /** `SHELL_SPLIT_CONSTRAINTS.dividerPx = 6` (app/src/lib/splitRatio.ts). */
  const DIVIDER_PX = 6;
  /** `SHELL_SPLIT_CONSTRAINTS.maxRatio = 0.5` — e a razão é PERSISTIDA. */
  const SPLIT_MAX_RATIO = 0.5;
  /** Padding do tabpanel no md (App.tsx `p: { md: 4 }` → 4 × 8px) de CADA lado. */
  const TAB_PANEL_PADDING_MD_PX = 32;

  // Configuração da pior hipótese: janela 900, rail 104, split 0.5,
  // padding md 32×2 (comentário-cabeçalho traz o arquivo:linha de cada uma).
  const PIOR_COLUNA_PX =
    (WINDOW_MIN_PX - RAIL_PX - DIVIDER_PX) * SPLIT_MAX_RATIO - TAB_PANEL_PADDING_MD_PX * 2;

  it('a pior coluna é 331px — a configuração suportada e persistida do achado', () => {
    assert.equal(
      PIOR_COLUNA_PX,
      331,
      '(900 − 104 − 6) × 0.5 − 32 × 2 = 331 — se este número mudou, a conta do ' +
        'piso abaixo precisa ser refeita junto (o comentário do `sx` do campo ' +
        'em LessonView.tsx documenta a mesma aritmética)',
    );
  });

  it('44 (mic) + 16 (gaps) + 135 (min-content do Avançar) + 128 (piso) = 323 ≤ 331', () => {
    const html = renderComposer();

    // Parcela 1 — MIC 44px: MEDIDA no CSS emitido do IconButton do mic.
    const micCss = cssOfClass(html, classOfElementWith(html, MIC));
    assert.match(micCss, /width:\s*44px/, `CSS emitido do mic: ${micCss}`);
    const MIC_PX = 44;

    // Parcela 2 — GAPS 2 × 8px: MEDIDA no CSS emitido do Stack (spacing 1).
    // O tema resolve spacing via variável CSS; o valor 8px é cobrado na
    // própria folha do SSR (mesma técnica do bloco 2).
    const stackTag = tagOfElementWith(html, 'MuiStack-root');
    const stackCls = /class="([^"]*)"/
      .exec(stackTag)?.[1].split(/\s+/)
      .find((c) => c.startsWith('css-')) as string;
    const stackCss = cssOfClass(html, stackCls);
    assert.match(stackCss, /gap:\s*var\(--mui-spacing\)/, `CSS emitido do Stack: ${stackCss}`);
    assert.ok(
      rulesOf(html).some((r) => /--mui-spacing:\s*8px/.test(r.body)),
      'a folha do SSR define --mui-spacing: 8px — é daqui que saem os 8px de cada gap',
    );
    const GAPS_PX = 8 * 2;

    // Parcela 3 — MIN-CONTENT do botão "Avançar" ≈ 135px, CONSTANTE
    // DOCUMENTADA: SSR não mede tinta de texto. O que é mensurável sem
    // navegador — as partes DECLARADAS que compõem o min-content — é cobrado
    // no CSS emitido: nowrap (o rótulo não quebra) e o padding lateral de
    // `px: 3` = 24px de cada lado.
    const BUTTON_MIN_CONTENT_PX = 135;
    const btnCss = cssOfClass(html, classOfAdvance(html));
    assert.match(
      btnCss,
      /white-space:\s*nowrap/,
      `CSS emitido do Avançar: ${btnCss} — o nowrap É o que faz o min-content do botão ` +
        'ser o piso da linha (não mexer nele sem refazer a conta)',
    );
    // O padding lateral de `px: 3` é emitido via variável de spacing
    // (3 × 8px = 24 de cada lado — o valor 8px já está ancorado acima).
    assert.match(
      btnCss,
      /padding-left:\s*calc\(3 \* var\(--mui-spacing\)\)/,
      `CSS emitido do Avançar: ${btnCss}`,
    );
    assert.match(
      btnCss,
      /padding-right:\s*calc\(3 \* var\(--mui-spacing\)\)/,
      `CSS emitido do Avançar: ${btnCss}`,
    );
    // O piso declarado do próprio botão também é cobaia da constante: o
    // min-content dele NUNCA é menor que este min-width.
    assert.match(btnCss, /min-width:\s*64px/, `CSS emitido do Avançar: ${btnCss}`);
    assert.ok(
      BUTTON_MIN_CONTENT_PX >= 64,
      'a constante documentada cobre o min-width declarado do botão',
    );

    // Parcela 4 — PISO do campo 128px: MEDIDA no CSS emitido (bloco 1).
    const fieldCss = cssOfClass(html, classOfElementWith(html, 'MuiFormControl-root'));
    assert.match(fieldCss, /min-width:\s*128px/, `CSS emitido do campo: ${fieldCss}`);
    const FIELD_FLOOR_PX = 128;

    // A ARITMÉTICA EXPLÍCITA: o piso da linha inteira contra a pior coluna.
    const pisoDaLinha = MIC_PX + GAPS_PX + BUTTON_MIN_CONTENT_PX + FIELD_FLOOR_PX;
    assert.equal(
      pisoDaLinha,
      323,
      '44 + 16 + 135 + 128 = 323 — o piso rígido da linha [mic][campo][Avançar]',
    );
    assert.ok(
      pisoDaLinha <= PIOR_COLUNA_PX,
      `o piso da linha (${pisoDaLinha}px) cabe na pior coluna (${PIOR_COLUNA_PX}px) — ` +
        `folga de ${PIOR_COLUNA_PX - pisoDaLinha}px. Configuração: janela 900 − rail 104 = 796 ` +
        'de split; usable 790 × 0.5 (persistido) = 395 de main; padding md 32×2 → coluna 331.',
    );
  });
});
