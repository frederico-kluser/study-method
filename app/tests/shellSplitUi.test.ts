/**
 * tests/shellSplitUi.test.ts — A DIVISÓRIA E A COLUNA DO SHELL, RENDERIZADAS E
 * TRANCADAS NA FONTE (complemento de tests/shellSidebar.test.ts).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Mesma técnica da casa (node:test SEM jsdom; SSR com react-dom/server +
 * guardas de FONTE por regex no .tsx). Cobre o que o arquivo irmão não cobre:
 *
 *   BLOCO 1 — SPLITDIVIDER NOS CONTÊINERES-LIMITE (FQ7). O irmão testa um
 *     contêiner "normal" (1000px); aqui vão os três regimes: contêiner não
 *     medido (0), janela de colisão (366px, min == max) e o piso de px
 *     dominando (1000px ⇒ min 18 ≠ 14).
 *   BLOCO 2 — SESSIONFRAME: a animação do flex-basis obedece ao flag
 *     animateBasis (transição spatial no passo de teclado, `none` no arraste)
 *     e honra prefers-reduced-motion; a coluna é rolável e SEM truncamento
 *     (SC 1.4.12 — FQ8, provado no HTML renderizado).
 *   BLOCO 3 — GUARDAS DE FONTE DO APP.TSX que faltavam: a persistência tem
 *     UMA porta de saída e é portão trancado pelo `dragging`; o px de
 *     pré-medida; `animateBasis={!dragging}`; `aria-controls` com o painel
 *     real da aba ativa; a dica com id próprio; o ResizeObserver com
 *     cleanup; o contêiner do split envolvendo exatamente os três elementos.
 *   BLOCO 4 — GUARDAS DE FONTE FINAS DA SPLITDIVIDER (a ordem de operações que
 *     faz o arraste não escapar): capture ANTES de tudo, guarda do pointermove,
 *     preventDefault SÓ em tecla tratada, release condicional do capture,
 *     largura vinda das constraints, alvo estendido `::after`.
 *   BLOCO 5 — GUARDAS DE FONTE DA SESSIONFRAME: id do painel = constante
 *     exportada (o MESMO id que a divisória usa em aria-controls), transição
 *     ternária, coluna rolável, sem truncamento.
 *
 * Reprodução: `bash tools/t.sh tests/shellSplitUi.test.ts`
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
  DEFAULT_SHELL_SPLIT_RATIO,
  SHELL_SIDEBAR_PANE_ID,
  SHELL_SPLIT_CONSTRAINTS,
  SHELL_SPLIT_DIVIDER_ID,
  splitAriaValues,
  SPLIT_MOTION,
} from '../src/lib/splitRatio';

const SPLIT_DIVIDER_MODULE = new URL(
  '../src/components/shell/SplitDivider.tsx',
  import.meta.url,
).href;
const SESSION_FRAME_MODULE = new URL(
  '../src/components/shell/SessionFrame.tsx',
  import.meta.url,
).href;

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_PATH = resolve(HERE, '../src/App.tsx');
const SPLIT_DIVIDER_PATH = resolve(HERE, '../src/components/shell/SplitDivider.tsx');
const SESSION_FRAME_PATH = resolve(HERE, '../src/components/shell/SessionFrame.tsx');

/** Fonte sem comentários — só o código que realmente roda. */
function codeOf(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

let SplitDivider: ComponentType<SplitDividerProps>;
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
let SessionFrame: ComponentType<{ basisPx: number; animateBasis: boolean }>;

const DIVIDER_BASE: SplitDividerProps = {
  ratio: 0.3,
  containerPx: 1000,
  constraints: SHELL_SPLIT_CONSTRAINTS,
  onRatioChange: () => {},
  ariaLabel: 'Divisória',
  hint: 'Arraste, ou use as setas',
  hintId: 'shell-split-divider-hint',
  controlsIds: [SHELL_SIDEBAR_PANE_ID, 'sm-panel-home'],
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

function renderSidebar(basisPx = 240, animateBasis = false): string {
  return renderToStaticMarkup(
    createElement(
      ThemeProvider,
      { theme },
      createElement(SessionFrame, { basisPx, animateBasis }),
    ),
  );
}

before(async () => {
  process.env.I18NEXT_NO_SUPPORT_NOTICE = '1';
  await i18next.use(initReactI18next).init({
    lng: 'pt-BR',
    interpolation: { escapeValue: false },
    resources: { 'pt-BR': { translation: ptBR }, en: { translation: en } },
  });
  const divider = (await import(SPLIT_DIVIDER_MODULE)) as {
    default: ComponentType<SplitDividerProps>;
  };
  SplitDivider = divider.default;
  const frame = (await import(SESSION_FRAME_MODULE)) as {
    default: ComponentType<{ basisPx: number; animateBasis: boolean }>;
  };
  SessionFrame = frame.default;
});

/* ── BLOCO 1 — SplitDivider nos contêineres-limite (FQ7) ─────────────────── */

describe('SplitDivider nos contêineres-limite: o ARIA nunca mente', () => {
  it('contêiner NÃO medido (0): anuncia as fronteiras de RAZÃO cruas (14/50)', () => {
    const html = renderDivider({ containerPx: 0 });
    const a = splitAriaValues(DIVIDER_BASE.ratio, 0, 'vertical', SHELL_SPLIT_CONSTRAINTS);
    assert.equal(a.valueMin, Math.round(SHELL_SPLIT_CONSTRAINTS.minRatio * 100));
    assert.equal(a.valueMax, Math.round(SHELL_SPLIT_CONSTRAINTS.maxRatio * 100));
    assert.match(html, /aria-valuemin="14"/);
    assert.match(html, /aria-valuemax="50"/);
    assert.match(html, /aria-valuenow="30"/);
  });

  it('janela de colisão (366px): min == max == now == 50 — UMA única posição', () => {
    const html = renderDivider({ containerPx: 366 });
    assert.match(html, /aria-valuemin="50"/);
    assert.match(html, /aria-valuemax="50"/);
    assert.match(html, /aria-valuenow="50"/);
  });

  it('contêiner de 1000px: o min anunciado é o piso EFETIVO (18), não o cru (14)', () => {
    const html = renderDivider({ containerPx: 1000 });
    const a = splitAriaValues(
      DIVIDER_BASE.ratio,
      1000,
      'vertical',
      SHELL_SPLIT_CONSTRAINTS,
    );
    assert.equal(a.valueMin, 18);
    assert.match(html, /aria-valuemin="18"/);
    assert.ok(!html.includes('aria-valuemin="14"'), 'a fronteira CRUA não pode vazar');
  });

  it('a razão fora da faixa NUNCA vira um aria-valuenow impossível', () => {
    for (const ratio of [0, 0.01, 0.9, 1, Number.NaN]) {
      const html = renderDivider({ ratio });
      const a = splitAriaValues(ratio, 1000, 'vertical', SHELL_SPLIT_CONSTRAINTS);
      assert.ok(a.valueMin <= a.valueNow && a.valueNow <= a.valueMax, `ratio=${ratio}`);
      assert.match(html, new RegExp(`aria-valuenow="${a.valueNow}"`));
    }
  });

  it('fora do arraste NÃO há data-dragging no DOM', () => {
    const html = renderDivider();
    assert.ok(!html.includes('data-dragging'), 'data-dragging só pode aparecer durante o arraste');
  });

  it('o span da dica vive DENTRO do separator e o aria-describedby aponta para ele', () => {
    const html = renderDivider();
    const describedBy = html.match(/aria-describedby="([^"]+)"/)?.[1];
    assert.ok(describedBy, 'aria-describedby ausente');
    assert.ok(html.includes(`id="${describedBy}"`), 'o alvo do aria-describedby não está no DOM');
    assert.ok(html.includes(DIVIDER_BASE.hint as string));
  });

  it('sem hint, o separator não fica com describe órfão (idempotente com o irmão)', () => {
    const html = renderDivider({ hint: undefined });
    assert.ok(!html.includes('aria-describedby'));
  });

  it('aria-controls lista os DOIS painéis reais do shell', () => {
    const html = renderDivider();
    assert.match(
      html,
      new RegExp(`aria-controls="${SHELL_SIDEBAR_PANE_ID} sm-panel-home"`),
      'a divisória tem que controlar sidebar E main',
    );
  });
});

/* ── BLOCO 2 — SessionFrame: movimento, rolagem e não-truncamento (FQ8) ──── */

describe('SessionFrame: animação do flex-basis e coluna sem truncamento', () => {
  it('animateBasis=true: a transição usa SPLIT_MOTION (spatial, 105ms)', () => {
    const html = renderSidebar(240, true);
    assert.ok(
      html.includes(`${SPLIT_MOTION.durationMs}ms`),
      `esperava ${SPLIT_MOTION.durationMs}ms na transição do flex-basis`,
    );
    assert.ok(
      html.includes(SPLIT_MOTION.easing),
      'a curva é a spatial (cubic-bezier com overshoot)',
    );
  });

  it('animateBasis=false (DURANTE o arraste): a transição é none — a divisória não nada', () => {
    const html = renderSidebar(240, false);
    assert.ok(!html.includes(`${SPLIT_MOTION.durationMs}ms`), 'arraste não pode animar o flex-basis');
  });

  it('a coluna honra prefers-reduced-motion (transição none no media query)', () => {
    for (const animateBasis of [true, false]) {
      const html = renderSidebar(240, animateBasis);
      assert.match(html, /@media \(prefers-reduced-motion: reduce\)/);
    }
  });

  it('FQ8 — nada trunca: overflow-wrap anywhere no HTML, NENHUM nowrap/ellipsis', () => {
    const html = renderSidebar(240, false);
    assert.match(html, /overflow-wrap:anywhere/, 'os campos precisam quebrar em qualquer ponto');
    assert.ok(!html.includes('white-space:nowrap'), 'nowrap é overflow:hidden + reticências (F104)');
    assert.ok(!html.includes('text-overflow:ellipsis'));
    assert.ok(!html.includes('max-width:32ch'), 'caixa em ch não cresce com letter-spacing (SC 1.4.12)');
  });

  it('a coluna é rolável no eixo de bloco e esconde o eixo inline (FQ8)', () => {
    const html = renderSidebar(240, false);
    assert.match(html, /overflow-y:auto/, 'o crescer é em ALTURA, via rolagem');
    assert.match(html, /overflow-x:hidden/);
  });

  it('a largura passada pelo shell vai para flex-basis E width (a divisória manda)', () => {
    for (const basisPx of [180, 240, 397]) {
      const html = renderSidebar(basisPx, false);
      assert.match(html, new RegExp(`flex:0 0 ${basisPx}px`));
      assert.match(html, new RegExp(`width:${basisPx}px`));
    }
  });

  it('a MIN-WIDTH da coluna é 0: ela encolhe até o piso da divisória sem estourar o flex', () => {
    const html = renderSidebar(240, false);
    assert.match(html, /min-width:0/);
  });
});

/* ── BLOCO 3 — guardas de fonte do App.tsx ───────────────────────────────── */

describe('App.tsx: fiação da divisória no shell (guardas de fonte)', () => {
  const app = (): string => codeOf(readFileSync(APP_PATH, 'utf8'));

  it('FQ6 — o main é tabpanel com o vínculo da aba ativa (navPanelId/navTabId)', () => {
    const src = app();
    assert.match(src, /component="main"/);
    assert.match(src, /role="tabpanel"/);
    assert.match(src, /id=\{navPanelId\(active\)\}/);
    // ONDA-SEM-DESAFIO-NO-RAIL: o painel Desafio não tem tab — o vínculo
    // aria-labelledby só existe quando o painel ativo É um destino do rail.
    assert.match(src, /aria-labelledby=\{active === 'challenge' \? undefined : navTabId\(active\)\}/);
  });

  it('FQ6 — a divisória controla a sidebar E o painel da aba ativa', () => {
    const src = app();
    assert.match(
      src,
      /controlsIds=\{\[SHELL_SIDEBAR_PANE_ID, navPanelId\(active\)\]\}/,
      'aria-controls tem que listar a sidebar e o main da aba ativa',
    );
  });

  it('a persistência tem UMA porta de saída, portão-trancada pelo arraste', () => {
    const src = app();
    const effect = src.match(/useEffect\(\(\) => \{[^}]*writeShellSplitRatio[\s\S]*?\}, \[ratio, dragging\]\);/);
    assert.ok(effect, 'o efeito de persistência da razão mudou de forma');
    assert.match(effect?.[0] ?? '', /if \(dragging\) return;/, 'o arraste NÃO pode gravar');
    // E não há NENHUMA outra chamada de escrita fora desse efeito.
    const writes = src.match(/writeShellSplitRatio\(/g);
    assert.equal(writes?.length, 1, 'persistência da razão do shell tem que ter um único ponto de escrita');
  });

  it('a leitura acontece no ESTADO INICIAL (lazy) — não no primeiro efeito', () => {
    const src = app();
    assert.match(src, /useState<number>\(\(\) => readShellSplitRatio\(\)\)/);
  });

  it('o px de pré-medida existe e é usado antes da primeira medição', () => {
    const src = app();
    assert.match(src, /SIDEBAR_PREMEASURE_PX = 240/);
    assert.match(src, /containerPx > 0 \? px\.primaryPx : SIDEBAR_PREMEASURE_PX/);
  });

  it('a animação do flex-basis é desligada exatamente durante o arraste', () => {
    assert.match(app(), /animateBasis=\{!dragging\}/);
  });

  it('o ResizeObserver mede o contêiner do split e se desconecta no unmount', () => {
    const src = app();
    assert.match(src, /new ResizeObserver/);
    assert.match(src, /observer\.disconnect\(\)/);
    // O ref mora no Box do split (o que envolve sidebar+divisória+main), e a
    // medição alimenta ratioToPx com as CONSTRAINTS do shell.
    assert.match(src, /ref=\{containerRef\}/);
    assert.match(src, /ratioToPx\(ratio, containerPx, SHELL_SPLIT_CONSTRAINTS\)/);
    assert.match(src, /contentRect\.width/);
  });

  it('o contêiner do split envolve EXATAMENTE sidebar + divisória + main (rail fora)', () => {
    const src = app();
    const refIdx = src.indexOf('ref={containerRef}');
    const railIdx = src.indexOf('<NavigationRail');
    const sidebarIdx = src.indexOf('<SessionFrame');
    const dividerIdx = src.indexOf('<SplitDivider');
    const mainIdx = src.indexOf('component="main"');
    for (const [name, idx] of [['rail', railIdx], ['sidebar', sidebarIdx], ['divider', dividerIdx], ['main', mainIdx]] as const) {
      assert.ok(idx !== -1, `não achei ${name}`);
    }
    assert.ok(railIdx < refIdx, 'o rail fica FORA do contêiner medido');
    assert.ok(refIdx < sidebarIdx && sidebarIdx < dividerIdx && dividerIdx < mainIdx);
  });

  it('a dica da divisória tem id próprio estável (não recicla o id do painel)', () => {
    const src = app();
    assert.match(src, /SHELL_SPLIT_HINT_ID = 'shell-split-divider-hint'/);
    assert.match(src, /hintId=\{SHELL_SPLIT_HINT_ID\}/);
    assert.notEqual('shell-split-divider-hint', SHELL_SIDEBAR_PANE_ID);
  });

  it('o shell não importa a persistência do Desafio nem trata Enter na divisória', () => {
    const src = app();
    assert.ok(!src.includes('readSplitRatio') && !src.includes('writeSplitRatio'));
    assert.ok(!src.includes('SPLIT_RATIO_STORAGE_KEY'));
    const appDivider = codeOf(readFileSync(SPLIT_DIVIDER_PATH, 'utf8'));
    assert.ok(!/['"`]Enter['"`]/.test(appDivider), 'a divisória do shell nunca colapsa (decisão 4)');
  });

  it('o estado do arraste sobe para o App via onDragStart/onDragEnd', () => {
    const src = app();
    assert.match(src, /onDragStart=\{handleDragStart\}/);
    assert.match(src, /onDragEnd=\{handleDragEnd\}/);
    assert.match(src, /onRatioChange=\{handleRatioChange\}/);
  });
});

/* ── BLOCO 4 — guardas de fonte finas da SplitDivider ────────────────────── */

describe('SplitDivider: a ordem de operações que faz o arraste funcionar', () => {
  const divider = (): string => codeOf(readFileSync(SPLIT_DIVIDER_PATH, 'utf8'));

  it('setPointerCapture acontece ANTES de qualquer efeito do pointerdown', () => {
    const src = divider();
    const down = src.match(/const handlePointerDown = useCallback\([\s\S]*?\n  \);/);
    assert.ok(down, 'handlePointerDown não encontrado');
    const body = down[0];
    const capture = body.indexOf('setPointerCapture');
    const dragging = body.indexOf('setDragging(true)');
    const start = body.indexOf('onDragStart');
    const prevent = body.indexOf('event.preventDefault()');
    for (const [name, at] of [['setDragging', dragging], ['onDragStart', start], ['preventDefault', prevent]] as const) {
      assert.ok(at !== -1, `${name} não está no pointerdown`);
    }
    assert.ok(capture !== -1 && capture < dragging && capture < start && capture < prevent,
      'o capture TEM que vir antes — arraste rápido escapa do elemento');
  });

  it('o pointermove só produz razão com arraste ativo (nada de hover mudando layout)', () => {
    const src = divider();
    const move = src.match(/const handlePointerMove = useCallback\([\s\S]*?\n  \);/);
    assert.ok(move);
    assert.match(move[0], /if \(!origin\) return;/);
  });

  it('preventDefault SÓ acontece em tecla tratada (null ⇒ return antes)', () => {
    const src = divider();
    const key = src.match(/const handleKeyDown = useCallback\([\s\S]*?\n  \);/);
    assert.ok(key, 'handleKeyDown não encontrado');
    const guard = key[0].indexOf('if (next === null) return;');
    const prevent = key[0].indexOf('event.preventDefault()');
    assert.ok(guard !== -1 && prevent !== -1 && guard < prevent,
      'Tab/atalhos não podem ser sequestrados pela divisória');
  });

  it('o fim do arraste solta o capture CONDICIONALMENTE (evita erro de DOM)', () => {
    const src = divider();
    const end = src.match(/const endDrag = useCallback\([\s\S]*?\n  \);/);
    assert.ok(end);
    assert.match(end[0], /hasPointerCapture\(event\.pointerId\)/);
    assert.match(end[0], /releasePointerCapture\(event\.pointerId\)/);
  });

  it('só o botão principal arrasta; a largura vem das constraints (nada hard-coded)', () => {
    const src = divider();
    assert.match(src, /event\.button !== 0\)\s*return/);
    assert.match(src, /width: constraints\.dividerPx/);
    assert.ok(!/width: 6/.test(src), 'a espessura NÃO pode estar hard-coded');
    assert.match(src, /cursor: 'col-resize'/);
    assert.match(src, /touchAction: 'none'/, 'sem touch-action none o browser come o gesto');
  });

  it('a alça estendida (hover) não muda o layout — é um ::after absoluto', () => {
    const src = divider();
    assert.match(src, /'&::after':/);
    assert.match(src, /insetInline: -3/);
    assert.match(src, /position: 'relative'/);
  });

  it('o teclado usa a orientação VERTICAL e a razão/container vindos das props', () => {
    const src = divider();
    const key = src.match(/const handleKeyDown = useCallback\([\s\S]*?\n  \);/);
    assert.match(key?.[0] ?? '', /orientation: 'vertical'/);
    assert.match(key?.[0] ?? '', /nextRatioForKey\(event\.key, ratio, containerPx/);
  });
});

/* ── BLOCO 5 — guardas de fonte da SessionFrame ──────────────────────────── */

describe('SessionFrame: o painel líder usa a MESMA constante que a divisória', () => {
  const frame = (): string => codeOf(readFileSync(SESSION_FRAME_PATH, 'utf8'));

  it('o id do painel é SHELL_SIDEBAR_PANE_ID (o lado esquerdo do aria-controls)', () => {
    assert.match(frame(), /id=\{SHELL_SIDEBAR_PANE_ID\}/);
  });

  it('a base da coluna é o px recebido do App, com a transição ternária do arraste', () => {
    const src = frame();
    assert.match(src, /flex: `0 0 \$\{basisPx\}px`/);
    assert.match(src, /animateBasis\s*\?[^]*?: 'none'/, 'a transição depende do flag animateBasis');
    assert.match(src, /SPLIT_MOTION\.durationMs/);
    assert.match(src, /SPLIT_MOTION\.easing/);
  });

  it('a coluna é uma COLUNA (flexDirection column) rolável, não uma faixa horizontal', () => {
    const src = frame();
    assert.match(src, /flexDirection: 'column'/);
    assert.match(src, /overflowY: 'auto'/);
    // A fronteira de nível agora é à direita (a divisória está do outro lado).
    assert.match(src, /borderRight:/);
    assert.ok(!src.includes('borderBottom'), 'não é mais uma faixa horizontal');
  });

  it('os três alvos de onboarding continuam na FONTE (FQ9)', () => {
    const src = frame();
    for (const target of ['app-title', 'theme-toggle', 'language-switcher']) {
      assert.ok(src.includes(`data-onboarding-target="${target}"`), `alvo ausente: ${target}`);
    }
  });

  it('o quadro de estado continua role="status" com data-session-last-activity (FQ9)', () => {
    const src = frame();
    assert.match(src, /role="status"/);
    assert.match(src, /aria-live="polite"/);
    assert.match(src, /data-session-last-activity=\{session\.lastActivityAt \?\? ''\}/);
  });

  it('a ordem assunto → fase do quadro é preservada (o e2e-spacing semeia no spans[1])', () => {
    const src = frame();
    const subject = src.indexOf("t('translation:shell.session.subject')");
    const phase = src.indexOf("t('translation:shell.session.phase')");
    assert.ok(subject !== -1 && phase !== -1 && subject < phase, 'a ordem dos campos mudou');
  });

  it('o default da razão e o id da divisória batem com o que o App consome', () => {
    // O App renderiza SplitDivider com SHELL_SPLIT_DIVIDER_ID e a razão que
    // nasce de readShellSplitRatio(); o default precisa ser aplicável.
    assert.ok(
      DEFAULT_SHELL_SPLIT_RATIO >= SHELL_SPLIT_CONSTRAINTS.minRatio &&
        DEFAULT_SHELL_SPLIT_RATIO <= SHELL_SPLIT_CONSTRAINTS.maxRatio,
    );
    const src = app();
    assert.match(src, /dividerId=\{SHELL_SPLIT_DIVIDER_ID\}/);
  });

  function app(): string {
    return codeOf(readFileSync(APP_PATH, 'utf8'));
  }
});
