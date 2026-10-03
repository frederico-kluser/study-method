/**
 * tests/gamesView.test.ts — a TELA 1 da secção Games (o MAPA do mundo) no
 * renderizador real, com o tema real e os textos REAIS de pt-BR.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O QUE ESTE ARQUIVO PROVA (técnica: `react-dom/server`, sem jsdom — o padrão
 * da casa em tests/cx-views-views-ssr.test.ts, tests/lessonSidebarHeader.test.ts)
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   BLOCO 1 — OS QUATRO ESTADOS da tela (GamesScreen): loading (LinearProgress
 *     + TÍTULO ESTÁVEL "Jogos"), erro (Alert + "Tentar de novo"), empty
 *     ("Nenhum mundo instalado ainda" + explicação) e ok (seletor de linguagem
 *     + mapa(s)).
 *
 *   BLOCO 2 — O MAPA (GamesMap) com um mundo de fixture: cabeçalho h6/h2 com
 *     title + description, a linha de nós (concluído success-fill, atual
 *     primary-fill, bloqueado muted, chefe em círculo de acento; setas CSS
 *     entre nós) e o cartão do nível atual (título, introduções em tags,
 *     recordes formatados e o botão "Jogar nível N").
 *
 *   BLOCO 3 — "QUEBRA, NUNCA RECORTA" no CSS EMITIDO pelo emotion (SC 1.4.12
 *     / F104): os textos do mapa têm `overflow-wrap:break-word`, nunca
 *     ellipsis/nowrap/overflow:hidden; o rótulo dos chips (o default do MuiChip
 *     é nowrap + ellipsis) ganha multilinha.
 *
 *   BLOCO 4 — HELPERS PUROS do mapa (gamesUi): estado dos nós, contagens,
 *     nível seguinte, chave do preview.
 *
 *   BLOCO 5 — i18n: a mesma tela em `en` (paridade real de copy).
 *
 * O que SÓ o Electron mede (fora do alcance do SSR): cliques, o motor real e o
 * layout em 360px sob os quatro overrides do SC 1.4.12
 * (tests/e2e/e2e-spacing.spec.ts). A quebra de linha depende do CSS emitido —
 * é ele que o BLOCO 3 tranca.
 *
 * Reprodução: `cd app && bash tools/t.sh tests/gamesView.test.ts`
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
  firstOpenLevelIndex,
  levelNodeState,
  nextLevelId,
  previewKey,
  worldLevelCounts,
} from '../src/views/GamesView/gamesUi';

// ATENÇÃO ao padrão da casa: os componentes são .tsx e o tsconfig de tests/ não
// liga `jsx` — a importação é DINÂMICA por URL (mesma técnica de
// tests/cx-views-views-ssr.test.ts, que explica o porquê).
const GAMES_MODULE = new URL('../src/views/GamesView/GamesView.tsx', import.meta.url).href;

/* ─── Contrato local de props (o tipo exportado é .tsx: declarado aqui) ───── */

interface LevelFixture {
  id: string;
  title: string;
  boss: boolean;
  completed: boolean;
  bestLines?: number;
  bestTimeMs?: number;
}

interface WorldFixture {
  id: string;
  title: string;
  description: string;
  levels: LevelFixture[];
}

interface PayloadFixture {
  id: string;
  title: string;
  enunciado: string;
  introduces: string[];
  starter: string;
  caseCount: number;
  hiddenCount: number;
  optimize: { lines: { par: number }; timeMs: { parMs: number } };
  boss: boolean;
}

interface GamesScreenProps {
  status: 'loading' | 'error' | 'empty' | 'ok';
  errorText: string | null;
  onRetry: () => void;
  worlds: WorldFixture[];
  lang: string;
  onLangChange: (lang: string) => void;
  previews: Record<string, PayloadFixture | undefined>;
  onPlay: (world: WorldFixture, level: LevelFixture, index: number) => void;
  locale: string;
}

interface GamesMapProps {
  world: WorldFixture;
  previews: Record<string, PayloadFixture | undefined>;
  onPlay: (level: LevelFixture, index: number) => void;
  locale: string;
}

let GamesScreen: ComponentType<GamesScreenProps>;
let GamesMap: ComponentType<GamesMapProps>;

before(async () => {
  process.env.I18NEXT_NO_SUPPORT_NOTICE = '1';
  // Os textos REAIS, com a MESMA interpolação da produção
  // (`escapeValue: false` — ver tests/quizOverlayRender.test.ts sobre o porquê).
  await i18next.use(initReactI18next).init({
    lng: 'pt-BR',
    interpolation: { escapeValue: false },
    resources: { 'pt-BR': { translation: ptBR }, en: { translation: en } },
  });
  const mod = (await import(GAMES_MODULE)) as unknown as {
    GamesScreen: ComponentType<GamesScreenProps>;
    GamesMap: ComponentType<GamesMapProps>;
  };
  GamesScreen = mod.GamesScreen;
  GamesMap = mod.GamesMap;
});

/* ─── Fixtures: um mundo pequeno e REAL (5 níveis: 2 concluídos, o 3.º atual,
 *     1 bloqueado e o chefe) ───────────────────────────────────────────────── */

const WORLD: WorldFixture = {
  id: 'mundo-1',
  title: 'O robô do depósito',
  description: 'O robô recebe encomendas e tem de as organizar pela ordem certa.',
  levels: [
    { id: 'n1', title: 'Ligar o motor', boss: false, completed: true, bestLines: 9, bestTimeMs: 1200 },
    { id: 'n2', title: 'Ler a lista', boss: false, completed: true },
    { id: 'n3', title: 'Rotear encomendas', boss: false, completed: false, bestLines: 23, bestTimeMs: 1200 },
    { id: 'n4', title: 'Desviar obstáculos', boss: false, completed: false },
    { id: 'nB', title: 'O depósito inteiro', boss: true, completed: false },
  ],
};

const PREVIEW: PayloadFixture = {
  id: 'n3',
  title: 'Rotear encomendas',
  enunciado: 'Escreve rota(...) que devolve o nº mínimo de passos.',
  introduces: ['lacos', 'arrays'],
  starter: '// o teu código',
  caseCount: 3,
  hiddenCount: 2,
  optimize: { lines: { par: 12 }, timeMs: { parMs: 2 } },
  boss: false,
};

const PREVIEWS: Record<string, PayloadFixture | undefined> = {
  [previewKey(WORLD.id, 'n3')]: PREVIEW,
};

const BASE_SCREEN: GamesScreenProps = {
  status: 'ok',
  errorText: null,
  onRetry: () => {},
  worlds: [WORLD],
  lang: 'python',
  onLangChange: () => {},
  previews: PREVIEWS,
  onPlay: () => {},
  locale: 'pt-BR',
};

function renderScreen(props: Partial<GamesScreenProps> = {}): string {
  return renderToStaticMarkup(
    createElement(
      ThemeProvider,
      { theme },
      createElement(GamesScreen, { ...BASE_SCREEN, ...props }),
    ),
  );
}

function renderMap(props: Partial<GamesMapProps> = {}): string {
  return renderToStaticMarkup(
    createElement(
      ThemeProvider,
      { theme },
      createElement(GamesMap, {
        world: WORLD,
        previews: PREVIEWS,
        onPlay: () => {},
        locale: 'pt-BR',
        ...props,
      }),
    ),
  );
}

/* ─── Ferramentas de medição do HTML/CSS que o SSR emite (mecânica copiada de
 *     tests/lessonSidebarHeader.test.ts) ──────────────────────────────────── */

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

/** O TEXTO que chega à tela: HTML sem estilos nem tags. */
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

/** A TAG DE ABERTURA do elemento que carrega `marker`. */
function openTagWith(html: string, marker: string): string {
  const at = html.indexOf(marker);
  assert.notEqual(at, -1, `marcador "${marker}" não está no HTML`);
  const open = html.lastIndexOf('<', at);
  return html.slice(open, html.indexOf('>', at) + 1);
}

/** A classe do emotion (`css-*`) de uma tag de abertura. */
function emotionClassOfTag(tag: string): string {
  const emotion = /class="([^"]*)"/.exec(tag)?.[1].split(/\s+/).find((c) => c.startsWith('css-'));
  assert.ok(emotion, `tag sem classe do emotion: ${tag}`);
  return emotion;
}

/** O corpo final da regra-BASE de uma classe (a última declaração vence). */
function ruleBodyOf(html: string, cls: string): string {
  return cssRulesOf(html)
    .filter((r) => r.selector === `.${cls}`)
    .map((r) => r.body)
    .join(';');
}

function finalDeclOf(html: string, cls: string, prop: string): string | undefined {
  return ruleBodyOf(html, cls)
    .split(';')
    .map((d) => d.trim())
    .filter((d) => d.startsWith(`${prop}:`))
    .at(-1)
    ?.slice(prop.length + 1);
}

/* ══════════════════════════════════════════════════════════════════════════
 * 1. OS QUATRO ESTADOS
 * ══════════════════════════════════════════════════════════════════════════ */

describe('1. GamesScreen — os quatro estados (título estável em todos)', () => {
  it('loading: o h1 "Jogos" está estável + LinearProgress + texto de carregamento', () => {
    const html = renderScreen({ status: 'loading' });
    const tela = onScreen(html);
    assert.ok(tela.includes(ptBR.games.title), 'o título estável da tela está no loading');
    assert.match(html, /role="progressbar"/, 'o LinearProgress está montado');
    assert.ok(tela.includes(ptBR.games.loading), 'o texto de carregamento está na tela');
    // Um h1 SÓ (outline do documento) mesmo em loading.
    assert.equal((markupOf(html).match(/<h1\b/g) ?? []).length, 1);
  });

  it('erro: Alert com a mensagem e o botão de retentativa (nunca spinner eterno)', () => {
    const html = renderScreen({ status: 'error', errorText: ptBR.games.loadError });
    const tela = onScreen(html);
    assert.match(html, /role="alert"/, 'o erro é um Alert (anunciado)');
    assert.ok(tela.includes(ptBR.games.loadError), 'a mensagem de erro está na tela');
    assert.ok(tela.includes(ptBR.common.tryAgain), 'o botão de retentativa está na tela');
    assert.ok(markupOf(html).includes('<button'), 'a retentativa é um <button> real');
  });

  it('empty: "Nenhum mundo instalado ainda" + a explicação do que fazer', () => {
    const html = renderScreen({ status: 'empty', worlds: [] });
    const tela = onScreen(html);
    assert.ok(tela.includes(ptBR.games.empty.title), 'o título do vazio está na tela');
    assert.ok(tela.includes(ptBR.games.empty.body), 'a explicação do vazio está na tela');
  });

  it('ok: seletor de linguagem C/Python/Rust (ToggleButtonGroup) + dica + mapa', () => {
    const html = renderScreen();
    const tela = onScreen(html);
    // aria-label é ATRIBUTO (o onScreen() remove tags): procurar no markup cru.
    assert.ok(
      markupOf(html).includes(`aria-label="${ptBR.games.lang.aria}"`),
      'o grupo de linguagem tem aria-label',
    );
    for (const label of [ptBR.games.lang.c, ptBR.games.lang.python, ptBR.games.lang.rust]) {
      assert.ok(tela.includes(label), `a linguagem "${label}" está no seletor`);
    }
    assert.ok(tela.includes(ptBR.games.world.langHint), 'a dica da mecânica está na tela');
    assert.ok(tela.includes(WORLD.title), 'o mapa do mundo está na tela');
    // Os botões do toggle são botões REAIS (nunca role="button" fake em span).
    assert.equal((markupOf(html).match(/<button\b/g) ?? []).length, 4, '3 linguagens + "Jogar nível"');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 2. O MAPA (cabeçalho + nós + cartão do nível atual)
 * ══════════════════════════════════════════════════════════════════════════ */

describe('2. GamesMap — cabeçalho do mundo, linha de nós e cartão do nível atual', () => {
  it('cabeçalho: h6 (escala) com componente h2, title + description + contagens', () => {
    const html = renderMap();
    const tela = onScreen(html);
    const h2 = markupOf(html).match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
    assert.ok(h2, 'o cabeçalho do mundo renderiza');
    assert.ok(h2[1].includes(WORLD.title), 'o h2 leva o título do mundo');
    assert.ok(tela.includes(WORLD.description), 'a descrição está na tela');
    // "4 níveis + 1 chefe" (plural _other/_one da casa, interpolado).
    const contagens = `${ptBR.games.world.levels_other.replace('{{count}}', '4')} + ${ptBR.games.world.bosses_one.replace('{{count}}', '1')}`;
    assert.ok(tela.includes(contagens), `as contagens "${contagens}" estão na tela`);
  });

  it('nós: 2 concluídos (success) + 1 atual (primary) + 1 bloqueado (muted) + chefe em círculo', () => {
    const html = renderMap();
    const markup = markupOf(html);
    // Estados por atributo (o nó mostra só o número; o estado vive no sr-only).
    assert.equal((markup.match(/data-game-node-state="done"/g) ?? []).length, 2);
    assert.equal((markup.match(/data-game-node-state="current"/g) ?? []).length, 1);
    // "locked" aparece DUAS vezes: o nível 4 e o chefe (também fechado).
    assert.equal((markup.match(/data-game-node-state="locked"/g) ?? []).length, 2);
    assert.equal((markup.match(/data-game-node-boss="true"/g) ?? []).length, 1);

    // Fills medidos (regra 3b: acento como PREENCHIMENTO):
    //   [medido] ACCENT_LIGHT.success.onFill x success.fill = 5,03:1 (escuro 9,78:1)
    //   [medido] ACCENT_LIGHT.action.onFill x primary.fill  = 4,70:1 (escuro 5,42:1)
    //   [medido] ACCENT_LIGHT.warn.onFill x warning.fill    = 4,86:1 (escuro 9,62:1)
    //   [medido] INK_LIGHT.secondary x SURFACE_LIGHT.level2 = 6,62:1 (escuro 7,05:1)
    const concluido = emotionClassOfTag(openTagWith(html, 'data-game-node-state="done"'));
    assert.match(ruleBodyOf(html, concluido), /--mui-palette-success-fill/,
      'nó concluído é success-fill');
    const atual = emotionClassOfTag(openTagWith(html, 'data-game-node-state="current"'));
    assert.match(ruleBodyOf(html, atual), /--mui-palette-primary-fill/,
      'nó atual é primary-fill');
    const bloqueado = emotionClassOfTag(openTagWith(html, 'data-game-node-state="locked"'));
    assert.match(ruleBodyOf(html, bloqueado), /--mui-palette-surface-level2/,
      'nó bloqueado é muted (surface.level2)');
    const boss = emotionClassOfTag(openTagWith(html, 'data-game-node-boss="true"'));
    const bossBody = ruleBodyOf(html, boss);
    // O chefe tem o ACENTO (laranja, família warn) em todos os estados, mas o
    // estado agora distingue-se visualmente (achado e2e-games.spec.ts): este
    // fixture tem o chefe BLOQUEADO → fill muted + borda TRACEJADA de warning
    // [medido] warning.fill x surface.level2 = 4,13:1 (borda não-texto, 3:1).
    // (atual = warning.fill cheio; concluído = success.fill + borda sólida.)
    assert.match(bossBody, /--mui-palette-warning-fill/, 'o chefe tem o acento (laranja)');
    assert.match(bossBody, /--mui-palette-surface-level2/, 'o chefe bloqueado é fill muted');
    assert.match(bossBody, /border:[^;]*dashed/, 'o chefe bloqueado tem a borda TRACEJADA');
    assert.match(bossBody, /border-radius:50%/, 'o chefe é CÍRCULO');
    // Nós normais: quadrado de raio 12 (SHAPE.md) — nunca círculo.
    assert.match(ruleBodyOf(html, concluido), /border-radius:12px/, 'nós são quadrados r12');

    // Etiquetas acessíveis: nome + estado (o nó mostra só o número).
    const tela = onScreen(html);
    const ariaAtual = ptBR.games.map.nodeAria
      .replace('{{n}}', '3')
      .replace('{{title}}', 'Rotear encomendas')
      .replace('{{state}}', ptBR.games.state.current);
    assert.ok(tela.includes(ariaAtual), `a etiqueta "${ariaAtual}" está no sr-only`);
    const ariaBoss = ptBR.games.map.bossAria
      .replace('{{title}}', 'O depósito inteiro')
      .replace('{{state}}', ptBR.games.state.locked);
    assert.ok(tela.includes(ariaBoss), `a etiqueta do chefe "${ariaBoss}" está no sr-only`);
  });

  it('setas CSS entre nós: uma por par adjacente (n-1), decorativas (aria-hidden)', () => {
    const html = renderMap();
    const setas = (markupOf(html).match(/aria-hidden="true"[^>]*>\s*›/g) ?? []).length;
    // 5 nós → 4 setas. O regex casa o glifo dentro do span aria-hidden.
    assert.equal(setas, WORLD.levels.length - 1, 'uma seta entre cada par de nós');
  });

  it('cartão do nível atual: título, introduções (tags), recordes e "Jogar nível 3"', () => {
    const html = renderMap();
    const tela = onScreen(html);
    const cardTitle = ptBR.games.map.cardTitle
      .replace('{{n}}', '3')
      .replace('{{title}}', 'Rotear encomendas');
    assert.ok(tela.includes(cardTitle), `o título do cartão "${cardTitle}" está na tela`);
    assert.ok(tela.includes(ptBR.games.map.introduces), 'o rótulo das introduções está na tela');
    for (const concept of PREVIEW.introduces) {
      assert.ok(tela.includes(concept), `a tag "${concept}" está no cartão`);
    }
    // Recordes do CONTRATO (GameLevelSummary.bestLines/bestTimeMs), formatados:
    // 23 linhas · 1200 ms → "1,2 s" (formatMs, locale pt-BR).
    const recLinhas = ptBR.games.map.recordLines.replace('{{value}}', '23');
    const recTempo = ptBR.games.map.recordTime.replace('{{value}}', '1,2 s');
    assert.ok(tela.includes(recLinhas), `o recorde "${recLinhas}" está no cartão`);
    assert.ok(tela.includes(recTempo), `o recorde "${recTempo}" está no cartão`);
    // O botão é um <button> real (nunca role="button" fake) e diz o nível.
    const jogar = ptBR.games.map.play.replace('{{n}}', '3');
    assert.ok(tela.includes(jogar), `o botão "${jogar}" está no cartão`);
    assert.ok(markupOf(html).includes(`<button`), 'o CTA é um <button> real');
  });

  it('o cartão segue o primeiro nível NÃO concluído (o resto está fechado)', () => {
    const mundoFeito: WorldFixture = {
      ...WORLD,
      levels: WORLD.levels.map((l) => ({ ...l, completed: true })),
    };
    const html = renderMap({ world: mundoFeito });
    const tela = onScreen(html);
    // Sem nível por abrir, o cartão mostra o ÚLTIMO (repetição continua viva).
    const cardTitle = ptBR.games.map.cardTitle
      .replace('{{n}}', '5')
      .replace('{{title}}', 'O depósito inteiro');
    assert.ok(tela.includes(cardTitle), `com o mundo completo o cartão é "${cardTitle}"`);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 3. "QUEBRA, NUNCA RECORTA" (CSS emitido pelo emotion)
 * ══════════════════════════════════════════════════════════════════════════ */

describe('3. SC 1.4.12 — os textos do mapa quebram, nunca recortam (CSS emitido)', () => {
  it('o título do cartão: overflow-wrap:break-word, sem ellipsis/nowrap/hidden', () => {
    const html = renderMap();
    const cardTitle = ptBR.games.map.cardTitle
      .replace('{{n}}', '3')
      .replace('{{title}}', 'Rotear encomendas');
    // Delimitadores `>…<` no marcador: a etiqueta sr-only do nó contém o mesmo
    // começo ("Nível 3 · Rotear encomendas · atual") e roubaria o openTagWith.
    const cls = emotionClassOfTag(openTagWith(html, `>${cardTitle}<`));
    const body = ruleBodyOf(html, cls);
    assert.doesNotMatch(body, /text-overflow:ellipsis/, 'sem reticências');
    assert.doesNotMatch(body, /white-space:nowrap/, 'sem nowrap (é ele que trunca)');
    assert.doesNotMatch(body, /overflow:hidden/, 'sem recorte por ancestral');
    assert.match(body, /white-space:normal/);
    assert.match(body, /overflow-wrap:break-word/, 'quebra quando a palavra não cabe');
  });

  it('a descrição do mundo também quebra (break-word, não anywhere)', () => {
    const html = renderMap();
    const cls = emotionClassOfTag(openTagWith(html, WORLD.description));
    const body = ruleBodyOf(html, cls);
    assert.match(body, /overflow-wrap:break-word/,
      'regra 2 da casa: anywhere esmagaria o min-content a ~1 glifo');
    assert.doesNotMatch(body, /overflow-wrap:anywhere/);
  });

  it('o rótulo dos chips (introduções) vira multilinha (o default é nowrap + ellipsis)', () => {
    const html = renderMap();
    const label = cssRulesOf(html).find((r) => /MuiChip-root \.MuiChip-label$/.test(r.selector));
    assert.ok(label, 'o override de .MuiChip-label existe');
    assert.match(label.body, /white-space:normal/);
    assert.match(label.body, /overflow-wrap:break-word/);
    assert.match(label.body, /text-overflow:clip/);
    assert.match(label.body, /overflow:visible/);
  });

  it('o botão "Jogar nível N" também quebra (rótulo nunca é input de layout)', () => {
    const html = renderMap();
    const jogar = ptBR.games.map.play.replace('{{n}}', '3');
    const cls = emotionClassOfTag(openTagWith(html, jogar));
    const body = ruleBodyOf(html, cls);
    assert.match(body, /overflow-wrap:break-word/);
    assert.doesNotMatch(body, /text-overflow:ellipsis/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 4. HELPERS PUROS DO MAPA (gamesUi)
 * ══════════════════════════════════════════════════════════════════════════ */

describe('4. gamesUi — aritmética pura do mapa', () => {
  it('firstOpenLevelIndex: o primeiro não concluído; -1 quando está tudo feito', () => {
    assert.equal(firstOpenLevelIndex(WORLD.levels), 2);
    assert.equal(firstOpenLevelIndex(WORLD.levels.map((l) => ({ ...l, completed: true }))), -1);
  });

  it('levelNodeState: concluído → done; o aberto → current; o resto → locked', () => {
    assert.equal(levelNodeState(WORLD.levels[0], 0, 2), 'done');
    assert.equal(levelNodeState(WORLD.levels[2], 2, 2), 'current');
    assert.equal(levelNodeState(WORLD.levels[3], 3, 2), 'locked');
    // Um nível não concluído ATRÁS do atual não mente: é locked.
    assert.equal(levelNodeState(WORLD.levels[3], 3, 4), 'locked');
  });

  it('worldLevelCounts separa níveis de chefes', () => {
    assert.deepEqual(worldLevelCounts(WORLD.levels), { levelCount: 4, bossCount: 1 });
  });

  it('nextLevelId: o id do nível seguinte, null no fim (depois do chefe)', () => {
    assert.equal(nextLevelId(WORLD.levels, 2), 'n4');
    assert.equal(nextLevelId(WORLD.levels, 4), null);
  });

  it('previewKey é estável e distinta por mundo+nível', () => {
    assert.equal(previewKey('mundo-1', 'n3'), 'mundo-1::n3');
    assert.notEqual(previewKey('mundo-1', 'n3'), previewKey('mundo-2', 'n3'));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 5. i18n — a mesma tela em `en`
 * ══════════════════════════════════════════════════════════════════════════ */

describe('5. i18n — copy em EN (paridade real, não chave crua)', () => {
  it('o estado vazio e o mapa falam inglês quando o locale é en', async () => {
    await i18next.changeLanguage('en');
    try {
      const vazio = onScreen(renderScreen({ status: 'empty', worlds: [] }));
      assert.ok(vazio.includes(en.games.empty.title), 'o vazio tem o título EN');
      assert.ok(vazio.includes(en.games.empty.body), 'o vazio tem a explicação EN');
      const mapa = onScreen(renderMap());
      assert.ok(mapa.includes(en.games.map.introduces), 'as tags têm rótulo EN');
      const jogar = en.games.map.play.replace('{{n}}', '3');
      assert.ok(mapa.includes(jogar), `o CTA EN "${jogar}" está no cartão`);
    } finally {
      await i18next.changeLanguage('pt-BR');
    }
  });
});
