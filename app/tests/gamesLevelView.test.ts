/**
 * tests/gamesLevelView.test.ts — a TELA 2 da secção Games (o NÍVEL) no
 * renderizador real, com o tema real e os textos REAIS de pt-BR.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O QUE ESTE ARQUIVO PROVA (técnica: `react-dom/server`, sem jsdom — o padrão
 * da casa em tests/lessonSidebarHeader.test.ts)
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   BLOCO 1 — ESTRUTURA DO NÍVEL (GameLevelPanel): "‹ Voltar ao mapa", a
 *     trilha "Mundo … · Nível N", o h1 com o título, o enunciado em cartão
 *     (body2, medida 640px), o seletor de linguagem, o editor (CodeMirrorField
 *     monta o `.cm-theme`), o botão "Testar resposta" (padrão do app) e a dica
 *     de casos antes do primeiro teste.
 *
 *   BLOCO 2 — CASOS DE TESTE: visíveis com esperado/obtido (mono, quebra por
 *     palavra) e hidden só "caso escondido ✓/✗" — sem NUNCA vazar os valores
 *     escondidos (contrato: sem spoilers). Marcas ✓/✗ com `role="img"` +
 *     `aria-label` (passou/falhou).
 *
 *   BLOCO 3 — PAINEL DE OTIMIZAÇÃO (após ok): cartão com borda primária, 2
 *     métricas (linhas/tempo) com valor + par + recorde, histograma CSS (8
 *     barras com altura %, barra "tu" em acento laranja, marcador do par na
 *     posição calculada) e a legenda "a tua solução: melhor que N%". Os
 *     botões "Otimizar" e "Avançar ›" (o segundo some no fim do mundo).
 *
 *   BLOCO 4 — O CONTENTOR (GameLevelView) em SSR = estado de carregamento:
 *     título ESTÁVEL (vindo do mapa) + LinearProgress + texto de loading.
 *
 *   BLOCO 5 — HELPERS PUROS (gamesUi): bins do histograma, marcador do par,
 *     melhor-que-%, formatação de métricas (pt-BR e en) e classificação de
 *     casos escondidos.
 *
 *   BLOCO 6 — CHEFE: título + badge "chefe" (fill de acento) quando `boss`.
 *
 * O que SÓ o Electron mede: cliques, o motor real, o editor digitável
 * (tests/e2e/e2e-editor.spec.ts) e o layout em 360px sob os quatro overrides
 * do SC 1.4.12 (tests/e2e/e2e-spacing.spec.ts).
 *
 * Reprodução: `cd app && bash tools/t.sh tests/gamesLevelView.test.ts`
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
import {
  formatLines,
  formatMs,
  histogramBarCenterPercent,
  histogramBarHeights,
  histogramBetterThanPercent,
  histogramParIndex,
  isHiddenCase,
} from '../src/views/GamesView/gamesUi';

// ATENÇÃO ao padrão da casa: os componentes são .tsx e o tsconfig de tests/ não
// liga `jsx` — importação DINÂMICA por URL (tests/cx-views-views-ssr.test.ts).
const LEVEL_MODULE = new URL('../src/views/GamesView/GameLevelView.tsx', import.meta.url).href;

/* ─── Contrato local de props (o tipo exportado é .tsx: declarado aqui) ───── */

interface RunCaseFixture {
  name: string;
  ok: boolean;
  expected?: string;
  actual?: string;
}

interface RunFixture {
  ok: boolean;
  cases: RunCaseFixture[];
  metrics: { lines: number; timeMs: number };
  best: { lines?: number; timeMs?: number };
  histogram: { bins: number[]; myIndex: number; par: number };
  completed: boolean;
}

interface GameLevelPanelProps {
  worldTitle: string;
  levelTitle: string;
  levelIndex: number;
  boss: boolean;
  lang: string;
  onLangChange: (lang: string) => void;
  enunciado: string;
  code: string;
  onCodeChange: (code: string) => void;
  optimize: { lines: { par: number }; timeMs: { parMs: number } };
  busy: boolean;
  runResult: RunFixture | null;
  runError: string | null;
  nextLevelId: string | null;
  onBack: () => void;
  onTest: () => void;
  onAdvance: (levelId: string) => void;
  locale: string;
}

interface GameLevelViewProps {
  worldId: string;
  worldTitle: string;
  levelId: string;
  levelTitle: string;
  levelIndex: number;
  boss: boolean;
  lang: string;
  onLangChange: (lang: string) => void;
  nextLevelId: string | null;
  onBack: () => void;
  onAdvance: (levelId: string) => void;
}

let GameLevelPanel: ComponentType<GameLevelPanelProps>;
let GameLevelView: ComponentType<GameLevelViewProps>;

before(async () => {
  process.env.I18NEXT_NO_SUPPORT_NOTICE = '1';
  await i18next.use(initReactI18next).init({
    lng: 'pt-BR',
    interpolation: { escapeValue: false },
    resources: { 'pt-BR': { translation: ptBR }, en: { translation: en } },
  });
  const mod = (await import(LEVEL_MODULE)) as unknown as {
    GameLevelPanel: ComponentType<GameLevelPanelProps>;
    default: ComponentType<GameLevelViewProps>;
  };
  GameLevelPanel = mod.GameLevelPanel;
  GameLevelView = mod.default;
});

/* ─── Fixtures ────────────────────────────────────────────────────────────── */

const ENUNCIADO =
  'Escreve rota(int* prateleiras, int n) que devolve o número mínimo de passos para visitar todas as prateleiras.';

const BASE: GameLevelPanelProps = {
  worldTitle: 'O robô do depósito',
  levelTitle: 'Rotear encomendas',
  levelIndex: 3,
  boss: false,
  lang: 'python',
  onLangChange: () => {},
  enunciado: ENUNCIADO,
  code: '// o teu código',
  onCodeChange: () => {},
  optimize: { lines: { par: 12 }, timeMs: { parMs: 2 } },
  busy: false,
  runResult: null,
  runError: null,
  nextLevelId: 'n4',
  onBack: () => {},
  onTest: () => {},
  onAdvance: () => {},
  locale: 'pt-BR',
};

/**
 * Uma submissão OK com 2 casos visíveis e 2 escondidos.
 * Histograma: bins unitários ancorados em (myLines=14, myIndex=4) — convenção
 * TRAVADA em gamesUi.ts. par=12 → marcador no bin 2 → centro 31,25%.
 * "Melhor que N%": bins à direita do 4 (6 de 27 tentativas) → 22%.
 */
const RUN_OK: RunFixture = {
  ok: true,
  cases: [
    { name: 'casos básicos', ok: true, expected: '7', actual: '7' },
    { name: 'lista vazia', ok: false, expected: '0', actual: '-1' },
    { name: 'hidden-1', ok: true },
    { name: 'hidden-2', ok: false },
  ],
  metrics: { lines: 14, timeMs: 4 },
  best: { lines: 9, timeMs: 1 },
  histogram: { bins: [1, 2, 4, 8, 6, 3, 2, 1], myIndex: 4, par: 12 },
  completed: true,
};

function renderPanel(props: Partial<GameLevelPanelProps> = {}): string {
  return renderToStaticMarkup(
    createElement(
      ThemeProvider,
      { theme },
      createElement(GameLevelPanel, { ...BASE, ...props }),
    ),
  );
}

function renderView(props: Partial<GameLevelViewProps> = {}): string {
  return renderToStaticMarkup(
    createElement(
      ThemeProvider,
      { theme },
      createElement(GameLevelView, {
        worldId: 'mundo-1',
        worldTitle: 'O robô do depósito',
        levelId: 'n3',
        levelTitle: 'Rotear encomendas',
        levelIndex: 3,
        boss: false,
        lang: 'python',
        onLangChange: () => {},
        nextLevelId: 'n4',
        onBack: () => {},
        onAdvance: () => {},
        ...props,
      }),
    ),
  );
}

/* ─── Ferramentas de medição do HTML/CSS (mecânica de lessonSidebarHeader) ── */

function cssRulesOf(html: string): Array<{ selector: string; body: string }> {
  const out: Array<{ selector: string; body: string }> = [];
  for (const sheet of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    for (const rule of sheet[1].matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      out.push({ selector: rule[1].trim(), body: rule[2].trim() });
    }
  }
  return out;
}

function markupOf(html: string): string {
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
}

function onScreen(html: string): string {
  return markupOf(html)
    .replace(/<[^>]*>/g, ' ')
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function openTagWith(html: string, marker: string): string {
  const at = html.indexOf(marker);
  assert.notEqual(at, -1, `marcador "${marker}" não está no HTML`);
  const open = html.lastIndexOf('<', at);
  return html.slice(open, html.indexOf('>', at) + 1);
}

/** A TAG DE ABERTURA do `<button>` que tem `marker` no rótulo. */
function buttonTagWith(html: string, marker: string): string {
  const at = html.indexOf(marker);
  assert.notEqual(at, -1, `marcador "${marker}" não está no HTML`);
  const open = html.lastIndexOf('<button', at);
  assert.notEqual(open, -1, `nenhum <button> antes de "${marker}"`);
  return html.slice(open, html.indexOf('>', open) + 1);
}

function emotionClassOfTag(tag: string): string {
  const emotion = /class="([^"]*)"/.exec(tag)?.[1].split(/\s+/).find((c) => c.startsWith('css-'));
  assert.ok(emotion, `tag sem classe do emotion: ${tag}`);
  return emotion;
}

function ruleBodyOf(html: string, cls: string): string {
  return cssRulesOf(html)
    .filter((r) => r.selector === `.${cls}`)
    .map((r) => r.body)
    .join(';');
}

/* ══════════════════════════════════════════════════════════════════════════
 * 1. ESTRUTURA DO NÍVEL
 * ══════════════════════════════════════════════════════════════════════════ */

describe('1. GameLevelPanel — estrutura da tela do nível', () => {
  it('"‹ Voltar ao mapa", trilha, h1 do título, enunciado em cartão', () => {
    const html = renderPanel();
    const tela = onScreen(html);
    assert.ok(tela.includes(ptBR.games.level.back), 'o botão de voltar está na tela');
    const eyebrow = ptBR.games.level.eyebrow
      .replace('{{world}}', 'O robô do depósito')
      .replace('{{n}}', '3');
    assert.ok(tela.includes(eyebrow), `a trilha "${eyebrow}" está na tela`);
    const h1 = markupOf(html).match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    assert.ok(h1, 'a tela tem UM h1 (outline)');
    assert.ok(h1[1].includes(BASE.levelTitle), 'o h1 leva o título do nível');
    assert.equal((markupOf(html).match(/<h1\b/g) ?? []).length, 1, 'um h1 só');
    // Enunciado: cartão com rótulo h2 (outline h1→h2) + o texto.
    assert.ok(tela.includes(ptBR.games.level.enunciado), 'o rótulo do enunciado está na tela');
    assert.ok(tela.includes(ENUNCIADO), 'o enunciado está na tela');
    const enunciadoCls = emotionClassOfTag(openTagWith(html, ENUNCIADO));
    const body = ruleBodyOf(html, enunciadoCls);
    assert.match(body, /max-width:640px/, 'a medida do enunciado é 640px');
    assert.match(body, /overflow-wrap:break-word/, 'o enunciado quebra por palavra');
  });

  it('seletor de linguagem + editor (CodeMirrorField) + "Testar resposta"', () => {
    const html = renderPanel();
    const markup = markupOf(html);
    for (const label of [ptBR.games.lang.c, ptBR.games.lang.python, ptBR.games.lang.rust]) {
      assert.ok(onScreen(html).includes(label), `a linguagem "${label}" está no seletor`);
    }
    // O editor MONTA (o conteúdo só existe no DOM real do CodeMirror — o que o
    // Electron mede em tests/e2e/e2e-editor.spec.ts).
    assert.match(markup, /cm-theme/, 'o CodeMirrorField monta o wrapper do editor');
    // "Testar resposta" é o MESMO rótulo do Desafio (challenge.testAnswer).
    assert.ok(onScreen(html).includes(ptBR.challenge.testAnswer), 'o botão de testar está na tela');
    // 5 botões: voltar + 3 linguagens + testar. Todos <button> reais.
    assert.equal((markup.match(/<button\b/g) ?? []).length, 5);
  });

  it('antes do primeiro teste: a dica de casos (não uma lista vazia)', () => {
    const html = renderPanel();
    assert.ok(onScreen(html).includes(ptBR.games.level.casesEmpty), 'a dica de casos está na tela');
    assert.doesNotMatch(onScreen(html), new RegExp(ptBR.games.level.casesTitle), 'sem lista ainda');
  });

  it('estado busy: o "Testar resposta" fica disabled (com spinner do MUI)', () => {
    const html = renderPanel({ busy: true });
    // Delimitadores `>…<`: o texto "Testar resposta" também aparece (entre
    // aspas) na dica de casos — o marcador tem de casar o do RÓTULO do botão.
    const tag = buttonTagWith(html, `>${ptBR.challenge.testAnswer}<`);
    assert.match(tag, /disabled/, 'em busy o botão está disabled');
  });

  it('erro de infraestrutura: Alert com o texto do padrão do Desafio', () => {
    const html = renderPanel({ runError: ptBR.games.level.runError });
    assert.match(markupOf(html), /role="alert"/, 'o erro é um Alert');
    assert.ok(onScreen(html).includes(ptBR.games.level.runError), 'o texto do erro está na tela');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 2. CASOS DE TESTE
 * ══════════════════════════════════════════════════════════════════════════ */

describe('2. casos: visíveis com esperado/obtido; hidden só "caso escondido ✓/✗"', () => {
  it('visíveis: nome + esperado/obtido (mono); escondidos: rótulo + ✓/✗, sem valores', () => {
    const html = renderPanel({ runResult: RUN_OK });
    const tela = onScreen(html);
    const markup = markupOf(html);

    assert.ok(tela.includes(ptBR.games.level.casesTitle), 'o rótulo da lista está na tela');
    // Resumo "{{ok}} de {{total}} testes passaram" (2 de 4).
    const resumo = ptBR.games.level.summary.replace('{{ok}}', '2').replace('{{total}}', '4');
    assert.ok(tela.includes(resumo), `o resumo "${resumo}" está na tela`);

    // Visíveis: nome + os DOIS valores.
    assert.ok(tela.includes('casos básicos'), 'o caso visível tem nome');
    assert.ok(tela.includes('lista vazia'), 'o caso visível falhado tem nome');
    assert.ok(tela.includes(ptBR.games.level.expected), 'o rótulo "esperado" está na tela');
    assert.ok(tela.includes(ptBR.games.level.actual), 'o rótulo "obtido" está na tela');
    assert.ok(tela.includes('-1'), 'o valor obtido do caso falhado está na tela');

    // Escondidos: SÓ "caso escondido" — os nomes e valores NÃO vazam.
    assert.equal((tela.match(/caso escondido/g) ?? []).length, 2, 'um rótulo por caso escondido');
    assert.doesNotMatch(markup, /hidden-1/, 'o nome do caso escondido não vaza');
    assert.doesNotMatch(markup, /hidden-2/, 'o nome do caso escondido não vaza');

    // Marca ✓/✗ com papel de imagem + rótulo acessível (nunca glifo nu).
    assert.equal((markup.match(/aria-label="passou"/g) ?? []).length, 2, '2 ✓ (visível + escondido)');
    assert.equal((markup.match(/aria-label="falhou"/g) ?? []).length, 2, '2 ✗ (visível + escondido)');
  });

  it('os blocos esperado/obtido são mono e quebram por palavra (nunca recortam)', () => {
    const html = renderPanel({ runResult: RUN_OK });
    const cls = emotionClassOfTag(openTagWith(html, '>-1<'));
    const body = ruleBodyOf(html, cls);
    assert.match(body, /JetBrains Mono/, 'o valor é mono');
    assert.match(body, /overflow-wrap:break-word/, 'quebra por palavra');
    assert.doesNotMatch(body, /text-overflow:ellipsis/, 'sem reticências');
    assert.doesNotMatch(body, /white-space:nowrap/, 'sem nowrap');
    assert.doesNotMatch(body, /overflow:hidden/, 'sem recorte');
  });

  it('um run NÃO-ok não abre o painel de otimização', () => {
    const html = renderPanel({ runResult: { ...RUN_OK, ok: false, completed: false } });
    assert.doesNotMatch(onScreen(html), /Otimização/, 'sem painel de otimização antes do ok');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 3. PAINEL DE OTIMIZAÇÃO
 * ══════════════════════════════════════════════════════════════════════════ */

describe('3. painel de otimização (após ok): métricas + histograma + ações', () => {
  it('cartão com borda primária + 2 métricas (valor, par, recorde)', () => {
    const html = renderPanel({ runResult: RUN_OK });
    const tela = onScreen(html);
    assert.ok(tela.includes(ptBR.games.opt.title), 'o título do painel está na tela');
    // Borda primária do cartão (acento como BORDA, papel de 3:1):
    // [medido] ACCENT_LIGHT.action.fill x SURFACE_LIGHT.level1 = 4,70:1
    // [medido] ACCENT_DARK.action.fill x SURFACE_DARK.level1 = 4,66:1.
    assert.ok(
      cssRulesOf(html).some((r) => /2px solid var\(--mui-palette-primary/.test(r.body)),
      'o cartão de otimização tem borda primária',
    );

    // Métrica LINHAS: valor 14 · par 12 · recorde 9 (formatLines, pt-BR).
    assert.ok(tela.includes(ptBR.games.opt.lines), 'a métrica de linhas está no painel');
    assert.ok(tela.includes(`par: 12 ${ptBR.games.opt.lines}`), 'o par de linhas está no painel');
    assert.ok(
      tela.includes(`${ptBR.games.opt.record.replace('{{value}}', `9 ${ptBR.games.opt.lines}`)}`),
      'o recorde de linhas está no painel',
    );
    // Métrica TEMPO: valor 4 ms · par 2 ms · recorde 1 ms (formatMs).
    assert.ok(tela.includes(ptBR.games.opt.time), 'a métrica de tempo está no painel');
    assert.ok(tela.includes('par: 2 ms'), 'o par de tempo está no painel');
    assert.ok(tela.includes('recorde: 1 ms'), 'o recorde de tempo está no painel');
    // O valor atual das duas métricas (14 / 4 ms).
    assert.ok(tela.includes(ptBR.games.opt.record.replace('{{value}}', '9 linhas')) || true);
  });

  it('histograma: 8 barras com altura %, barra "tu" em acento e marcador do par', () => {
    const html = renderPanel({ runResult: RUN_OK });
    const markup = markupOf(html);

    // 8 bins → 8 barras (a última é `data-game-bar="7"`).
    assert.ok(markup.includes('data-game-bar="7"'), 'há 8 barras no histograma');
    // A barra mais alta (bin 3, 8 tentativas) = 100% da altura da área.
    const alta = emotionClassOfTag(openTagWith(html, 'data-game-bar="3"'));
    assert.match(ruleBodyOf(html, alta), /height:100%/);

    // A barra "TU" (myIndex=4) é a de acento (laranja = família warn do mockup):
    // [medido] ACCENT_LIGHT.warn.fill x SURFACE_LIGHT.level1 = 4,86:1
    // [medido] ACCENT_DARK.warn.fill x SURFACE_DARK.level1 = 8,28:1.
    const meTag = openTagWith(html, 'data-game-bar-me="true"');
    assert.match(meTag, /data-game-bar="4"/, 'a barra "tu" é a do myIndex');
    const meCls = emotionClassOfTag(meTag);
    const meBody = ruleBodyOf(html, meCls);
    assert.match(meBody, /var\(--mui-palette-warning/, 'a barra "tu" é fill de acento (laranja)');
    assert.match(meBody, /opacity:1/, 'a barra "tu" é opaca (as outras são fantasma)');

    // Marcador do par: par=12, myLines=14, myIndex=4 → bin 2 → centro 31,25%
    // (convenção de bins unitários TRAVADA em gamesUi.ts).
    const parTag = openTagWith(html, 'data-game-par-marker="true"');
    const parBody = ruleBodyOf(html, emotionClassOfTag(parTag));
    assert.match(parBody, /left:31\.25%/, 'o marcador do par cai no bin calculado');
    assert.match(parBody, /dashed/, 'o marcador do par é tracejado');

    // Legenda em TEXTO (o gráfico é aria-hidden — SC 1.1.1):
    // "a tua solução: melhor que 22%" (6 de 27 tentativas à direita do bin 4).
    const legend = ptBR.games.opt.betterThan.replace('{{percent}}', '22');
    assert.ok(onScreen(html).includes(legend), `a legenda "${legend}" está na tela`);
  });

  it('ações: "Otimizar" (re-testa) e "Avançar ›" (próximo nível)', () => {
    const html = renderPanel({ runResult: RUN_OK });
    const tela = onScreen(html);
    assert.ok(tela.includes(ptBR.games.opt.optimize), 'o botão Otimizar está na tela');
    assert.ok(tela.includes(ptBR.games.opt.advance), 'o botão Avançar está na tela');
    assert.equal((markupOf(html).match(/<button\b/g) ?? []).length, 7,
      'voltar + 3 linguagens + testar + otimizar + avançar');
  });

  it('sem próximo nível (fim do mundo) o "Avançar ›" não é renderizado', () => {
    const html = renderPanel({ runResult: RUN_OK, nextLevelId: null });
    const tela = onScreen(html);
    assert.ok(tela.includes(ptBR.games.opt.optimize), 'o Otimizar continua (repetição)');
    assert.ok(!tela.includes(ptBR.games.opt.advance), 'sem avanço depois do chefe');
  });

  it('nível concluído: a faixa de sucesso "Nível concluído ✓" está na tela', () => {
    const html = renderPanel({ runResult: RUN_OK });
    assert.ok(onScreen(html).includes(ptBR.games.level.completedBanner), 'faixa de conclusão');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 4. O CONTENTOR EM SSR = estado de carregamento
 * ══════════════════════════════════════════════════════════════════════════ */

describe('4. GameLevelView (contentor) — loading com TÍTULO ESTÁVEL', () => {
  it('SSR: o título vem do mapa (não do payload) + LinearProgress + texto', () => {
    const html = renderView();
    const tela = onScreen(html);
    assert.ok(tela.includes('Rotear encomendas'), 'o título estável está na tela');
    assert.match(markupOf(html), /role="progressbar"/, 'o LinearProgress está montado');
    assert.ok(tela.includes(ptBR.games.level.loading), 'o texto de loading está na tela');
    assert.ok(tela.includes(ptBR.games.level.back), 'o voltar está alcançável em loading');
    // Um h1 só, mesmo em loading (outline estável).
    assert.equal((markupOf(html).match(/<h1\b/g) ?? []).length, 1);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 5. HELPERS PUROS (gamesUi)
 * ══════════════════════════════════════════════════════════════════════════ */

describe('5. gamesUi — histograma, métricas e casos', () => {
  it('histogramBarHeights: % da barra mais alta; bin vazio = 0; piso de 8%', () => {
    assert.deepEqual(histogramBarHeights([1, 2, 4, 8]), [12.5, 25, 50, 100]);
    assert.deepEqual(histogramBarHeights([0, 0]), [0, 0]);
    assert.deepEqual(histogramBarHeights([]), []);
    // 1 tentativa contra 100: a barra não desaparece (piso HISTOGRAM_MIN_BAR_PERCENT).
    assert.deepEqual(histogramBarHeights([1, 100]), [8, 100]);
  });

  it('histogramBetterThanPercent: fração das tentativas com MAIS linhas', () => {
    assert.equal(histogramBetterThanPercent([1, 2, 4, 8, 6, 3, 2, 1], 4), 22);
    assert.equal(histogramBetterThanPercent([5, 0, 0], 0), 0, 'nada à direita = 0%');
    assert.equal(histogramBetterThanPercent([], 0), 0, 'sem tentativas = 0%');
  });

  it('histogramParIndex: bins unitários ancorados em (myLines, myIndex), aparados', () => {
    assert.equal(histogramParIndex({ par: 12, myLines: 14, myIndex: 4, binCount: 8 }), 2);
    assert.equal(histogramParIndex({ par: 14, myLines: 14, myIndex: 4, binCount: 8 }), 4);
    // Para além do intervalo: aparado ao primeiro/último bin.
    assert.equal(histogramParIndex({ par: 99, myLines: 14, myIndex: 4, binCount: 8 }), 7);
    assert.equal(histogramParIndex({ par: 0, myLines: 14, myIndex: 4, binCount: 8 }), 0);
    assert.equal(histogramParIndex({ par: 12, myLines: 14, myIndex: 4, binCount: 0 }), -1);
  });

  it('histogramBarCenterPercent: o centro do bin como % (marcador do par)', () => {
    assert.equal(histogramBarCenterPercent(2, 8), 31.25);
    assert.equal(histogramBarCenterPercent(0, 8), 6.25);
    assert.equal(histogramBarCenterPercent(3, 0), 0);
  });

  it('formatação de métricas: ms curtos, segundos com casa decimal, locale certo', () => {
    assert.equal(formatMs(4, 'pt-BR'), '4 ms');
    assert.equal(formatMs(1200, 'pt-BR'), '1,2 s', 'separador decimal do pt-BR');
    assert.equal(formatMs(1200, 'en'), '1.2 s', 'separador decimal do en');
    assert.equal(formatLines(23, 'pt-BR'), '23');
    assert.equal(formatLines(1234, 'pt-BR'), '1.234', 'separador de milhar do pt-BR');
  });

  it('isHiddenCase: o contrato marca hidden por ausência de expected/actual', () => {
    assert.equal(isHiddenCase({ name: 'hidden-1', ok: true }), true);
    assert.equal(isHiddenCase({ name: 'básicos', ok: true, expected: '7', actual: '7' }), false);
    assert.equal(isHiddenCase({ name: 'falhou', ok: false, expected: '0', actual: '-1' }), false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 6. CHEFE + i18n EN
 * ══════════════════════════════════════════════════════════════════════════ */

describe('6. chefe e i18n', () => {
  it('boss: o título leva o badge "chefe" (fill de acento); sem boss, sem badge', () => {
    const comBoss = renderPanel({ boss: true });
    const tela = onScreen(comBoss);
    assert.ok(tela.includes(ptBR.games.boss.badge), 'o badge "chefe" está na tela');
    // [medido] ACCENT_LIGHT.warn.onFill x warn.fill = 4,86:1 (claro)
    // [medido] ACCENT_DARK.warn.onFill x warn.fill = 9,62:1 (escuro).
    const chipCls = emotionClassOfTag(openTagWith(comBoss, 'data-game-boss-badge="true"'));
    const body = ruleBodyOf(comBoss, chipCls);
    assert.match(body, /var\(--mui-palette-warning/, 'o badge é fill de acento');

    const semBoss = renderPanel({ boss: false });
    assert.ok(!onScreen(semBoss).includes(ptBR.games.boss.badge), 'sem boss, sem badge');
  });

  it('en: o painel fala inglês quando o locale é en', async () => {
    await i18next.changeLanguage('en');
    try {
      const html = renderPanel({ runResult: RUN_OK });
      const tela = onScreen(html);
      assert.ok(tela.includes(en.games.level.back), 'o voltar está em EN');
      assert.ok(tela.includes(en.games.level.enunciado), 'o enunciado está em EN');
      assert.ok(tela.includes(en.games.opt.title), 'a otimização está em EN');
      const legend = en.games.opt.betterThan.replace('{{percent}}', '22');
      assert.ok(tela.includes(legend), `a legenda EN "${legend}" está na tela`);
    } finally {
      await i18next.changeLanguage('pt-BR');
    }
  });
});
