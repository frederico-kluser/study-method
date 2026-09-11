/**
 * tests/lessonCollapsibleHeader.test.ts — o CABEÇALHO COLAPSÁVEL da aula
 * (ONDA2-layout).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O QUE ESTE ARQUIVO PROVA (e o que ele NÃO consegue provar — com honestidade)
 * ══════════════════════════════════════════════════════════════════════════
 * Esta base não tem jsdom (a técnica dela é `react-dom/server` — precedentes
 * `tests/lessonChatLayout.test.ts`, `tests/quizOverlayRender.test.ts`). Sem
 * DOM não há CLIQUE: a transição por interação (mousedown no toggle e o
 * `useState` interna girar) é coberta pelos specs e2e Playwright da suíte de
 * integração — que CLICAM no toggle real. O que dá para provar AQUI, com o
 * renderizador real e o tema real, é:
 *
 *   BLOCO 1 — O ESTADO, RENDERIZADO NOS DOIS LADOS. Monta o componente real
 *     (o MESMO que a LessonView usa — não há cópia para teste) e lê o HTML
 *     emitido por `renderToStaticMarkup`:
 *       · colapsado (estado PADRÃO): `aria-expanded="false"`, aria-label de
 *         EXPANDIR, resumo AUSENTE do DOM (desmontado = fora do foco e do
 *         leitor de tela), título presente na barra, UM h1 só, progresso e
 *         pré-requisitos visíveis, botões Desafios/Fontes visíveis;
 *       · expandido: `aria-expanded="true"`, aria-label de RECOLHER, resumo
 *         presente, UM h1 só (o da barra sai quando o do corpo entra — a
 *         contagem de h1 é a prova de que não há título duplicado);
 *       · o badge de pendentes, o aria-label interpolado, o casos sem
 *         desafios / sem pré-requisitos, e o modo `en` (i18n).
 *
 *   BLOCO 2 — A LÓGICA PURA DO TOGGLE. `nextLessonHeaderOpen` é a única
 *     função "comportamental" exportada pelo componente — o a inversão de
 *     estado que o clique dispara, testada sem DOM.
 *
 *   BLOCO 3 — O ELLIPSIS DA BARRA. O título colapsado é UMA linha: o CSS que
 *     o emotion emite para o h1 da barra contém `white-space:nowrap` +
 *     `text-overflow:ellipsis` (o nome acessível continua o texto COMPLETO —
 *     ellipsis é visual).
 *
 *   BLOCO 4 — GUARDAS DE FONTE. A LessonView não pode regredir para o
 *     cabeçalho inline (duplicaria título/resumo/estado) e precisa REMONTAR
 *     o componente por aula (`key`) — é o remount que devolve o estado a
 *     COLAPSADO ao abrir/trocar de aula, como o dono pediu. E o componente
 *     não pode "inventar curva": o raio/rotação vêm de `animationTokens`
 *     (springs) e o corpo honra `prefers-reduced-motion` (useReducedMotion).
 *
 * Reprodução: `bash tools/t.sh tests/lessonCollapsibleHeader.test.ts`
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
// ATENÇÃO ao padrão: o componente é .tsx e o tsconfig do app não liga `jsx`
// para o tipo-check de tests/ — por isso a importação é DINÂMICA por URL,
// exatamente como tests/lessonChatLayout.test.ts faz com a LessonView (o
// repos não resolve módulo .tsx por import estático em teste).
const COMPONENT_MODULE = new URL(
  '../src/components/course/CollapsibleLessonHeader.tsx',
  import.meta.url,
).href;

const HERE = dirname(fileURLToPath(import.meta.url));
const VIEW_PATH = resolve(HERE, '../src/views/LessonView/LessonView.tsx');
const COMPONENT_PATH = resolve(HERE, '../src/components/course/CollapsibleLessonHeader.tsx');

/** Fonte sem comentários — só o código que realmente roda (técnica dos
 *  precedentes lessonQuizVisual / quizOverlayWiring). */
function codeOf(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Ferramentas de medição do CSS que o emotion emite no SSR
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

/** A classe do emotion aplicada ao elemento que carrega `marker` (o tag de
 *  abertura que contém `marker` e classe `css-*`). */
function emotionClassOf(html: string, marker: string): string {
  const at = html.indexOf(marker);
  assert.notEqual(at, -1, `marcador "${marker}" não está no HTML`);
  const open = html.lastIndexOf('<', at);
  const tag = html.slice(open, html.indexOf('>', at) + 1);
  const cls = /class="([^"]*)"/.exec(tag);
  const emotion = cls?.[1].split(/\s+/).find((c) => c.startsWith('css-'));
  assert.ok(emotion, `elemento com "${marker}" não tem classe do emotion: ${tag}`);
  return emotion;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Fixtures — o MESMO componente que a LessonView renderiza, com o tema real
 * ═══════════════════════════════════════════════════════════════════════════ */

/** O contrato de props do componente, declarado LOCALMENTE — o tipo exportado
 *  pelo componente é .tsx e não pode ser importado em teste (ver
 *  COMPONENT_MODULE); esta cópia é o contrato de renderização. */
interface CollapsibleLessonHeaderProps {
  title: string;
  summary: string;
  defaultOpen?: boolean;
  challengeCount: number;
  pendingChallengeCount: number;
  challengesExpanded: boolean;
  onChallengesClick: (anchor: HTMLButtonElement) => void;
  onSourcesClick: () => void;
  theoryProgress: number;
  sectionCurrent: number;
  sectionTotal: number;
  prerequisites: ReadonlyArray<{ slug: string; title: string }>;
  onPrerequisiteClick: (slug: string) => void;
}

interface HeaderPropsOverrides extends Partial<CollapsibleLessonHeaderProps> {}

/** O componente REAL, carregado no `before` (padrão da casa — ver o
 *  comentário do COMPONENT_MODULE). */
let CollapsibleLessonHeader: ComponentType<CollapsibleLessonHeaderProps>;
/** A lógica pura do toggle, carregada no `before`. */
let nextLessonHeaderOpen: (open: boolean) => boolean;

const BASE: CollapsibleLessonHeaderProps = {
  title: 'Aula E2E sobre funções',
  summary: 'Resumo da aula: funções de primeira classe no JavaScript.',
  challengeCount: 2,
  pendingChallengeCount: 1,
  challengesExpanded: false,
  onChallengesClick: () => {},
  onSourcesClick: () => {},
  theoryProgress: 42,
  sectionCurrent: 2,
  sectionTotal: 3,
  prerequisites: [{ slug: 'declaracoes', title: 'Declarações' }],
  onPrerequisiteClick: () => {},
};

function renderHeader(props: HeaderPropsOverrides = {}): string {
  return renderToStaticMarkup(
    createElement(
      ThemeProvider,
      { theme },
      createElement(CollapsibleLessonHeader, { ...BASE, ...props } as CollapsibleLessonHeaderProps),
    ),
  );
}

/** Pega a TAG DE ABERTURA do `<button>` que carrega `marker` (ex.: o aria-label
 *  do toggle ou do Desafios). */
function buttonTagWith(html: string, marker: string): string {
  const at = html.indexOf(marker);
  assert.notEqual(at, -1, `marcador "${marker}" não está no HTML`);
  const open = html.lastIndexOf('<', at);
  const tag = html.slice(open, html.indexOf('>', at) + 1);
  assert.match(tag, /^<button\b/, `esperava um <button>, veio: ${tag.slice(0, 80)}`);
  return tag;
}

const TITLE = BASE.title;
const SUMMARY = BASE.summary;
const TOGGLE_EXPAND_ARIA = ptBR.lesson.headerToggleExpand;
const TOGGLE_COLLAPSE_ARIA = ptBR.lesson.headerToggleCollapse;
const CHALLENGES_ARIA = `aria-label="${ptBR.lesson.challengesButtonAria.replace('{{pending}}', '1')}"`;

before(async () => {
  process.env.I18NEXT_NO_SUPPORT_NOTICE = '1';
  await i18next.use(initReactI18next).init({
    lng: 'pt-BR',
    // A MESMA opção de interpolação da produção (src/i18n/index.ts:
    // `interpolation: { escapeValue: false }`).
    interpolation: { escapeValue: false },
    resources: { 'pt-BR': { translation: ptBR }, en: { translation: en } },
  });
  const mod = (await import(COMPONENT_MODULE)) as {
    CollapsibleLessonHeader: typeof CollapsibleLessonHeader;
    nextLessonHeaderOpen: typeof nextLessonHeaderOpen;
  };
  CollapsibleLessonHeader = mod.CollapsibleLessonHeader;
  nextLessonHeaderOpen = mod.nextLessonHeaderOpen;
});

describe('1. estado colapsado (o padrão durante a aula) — estrutura renderizada', () => {
  it('monta COLAPSADO sem defaultOpen (aria-expanded=false + aria-label de expandir)', () => {
    const html = renderHeader();
    const toggle = buttonTagWith(html, TOGGLE_EXPAND_ARIA);
    assert.match(toggle, /aria-expanded="false"/, 'o toggle colapsado precisa de aria-expanded=false');
    assert.match(toggle, new RegExp(`aria-label="${TOGGLE_EXPAND_ARIA}"`));
  });

  it('colapsado: o RESUMO está FORA do DOM (desmontado = fora do foco e do leitor de tela)', () => {
    const html = renderHeader();
    assert.ok(!html.includes(SUMMARY), 'resumo não pode existir no HTML colapsado');
    // Os ÚNICOS botões no DOM são os da barra fixa (toggle + Desafios + Fontes)
    // — nada vindo do corpo colapsado contribui controle focável.
    const buttons = html.match(/<button\b/g) ?? [];
    assert.equal(buttons.length, 3, `esperava só os 3 botões da barra, veio: ${buttons.length}`);
  });

  it('colapsado: o TÍTULO permanece na barra, como h1 único, com o texto COMPLETO', () => {
    const html = renderHeader();
    const h1s = html.match(/<h1[\s>]/g) ?? [];
    assert.equal(h1s.length, 1, 'exatamente UM h1 em qualquer estado');
    const titleCount = html.split(TITLE).length - 1;
    assert.equal(titleCount, 1, 'o título aparece UMA vez (o ellipsis é visual — o nome acessível é completo)');
  });

  it('colapsado: progresso + contador e pré-requisitos ficam FORA do colapsável, sempre visíveis', () => {
    const html = renderHeader();
    assert.match(html, new RegExp(`aria-label="${ptBR.lesson.theoryProgress.replace('{{percent}}', '42')}"`));
    assert.ok(html.includes(ptBR.lesson.theoryCount.replace('{{current}}', '2').replace('{{total}}', '3')), 'contador Seção N de M');
    assert.ok(html.includes('Declarações'), 'chip de pré-requisito');
    assert.ok(html.includes(ptBR.lesson.prerequisitesLabel), 'rótulo de pré-requisitos');
  });

  it('colapsado: Desafios (badge de pendentes) e Fontes seguem CLICÁVEIS na barra fixa', () => {
    const html = renderHeader();
    const desafios = buttonTagWith(html, CHALLENGES_ARIA);
    assert.match(desafios, /aria-expanded="false"/, 'sem popover aberto, o botão diz false');
    assert.match(desafios, /aria-haspopup="true"/);
    assert.ok(html.includes(`>${ptBR.lesson.challengesButton}<`), 'rótulo Desafios');
    assert.ok(html.includes(`>${ptBR.lesson.sourcesButton}<`), 'rótulo Fontes');
    // badge de pendentes — a bolha do Badge é um span com a classe
    // MuiBadge-badge, com o número como texto.
    assert.match(html, /<span[^>]*MuiBadge-badge[^>]*>\s*1\s*<\/span>/, 'badge com a contagem de pendentes');
  });

  it('challengesExpanded=true reflete NO botão Desafios (e não no toggle)', () => {
    const html = renderHeader({ challengesExpanded: true });
    const desafios = buttonTagWith(html, CHALLENGES_ARIA);
    assert.match(desafios, /aria-expanded="true"/);
  });
});

describe('2. estado expandido — estrutura renderizada', () => {
  it('defaultOpen=true: aria-expanded=true + aria-label de RECOLHER + resumo presente', () => {
    const html = renderHeader({ defaultOpen: true });
    const toggle = buttonTagWith(html, TOGGLE_COLLAPSE_ARIA);
    assert.match(toggle, /aria-expanded="true"/);
    assert.match(toggle, new RegExp(`aria-label="${TOGGLE_COLLAPSE_ARIA}"`));
    assert.ok(html.includes(SUMMARY), 'resumo visível no corpo expandido');
  });

  it('expandido: UM h1 só — o da barra sai quando o do corpo entra (nada de título duplicado)', () => {
    const html = renderHeader({ defaultOpen: true });
    const h1s = html.match(/<h1[\s>]/g) ?? [];
    assert.equal(h1s.length, 1);
    // o h1 do corpo é o h5 original; o da barra (h6) não pode coexistir
    assert.ok(!html.includes('MuiTypography-h6'), 'título da BARRA não renderizado quando expandido');
    assert.ok(html.includes('MuiTypography-h5'), 'título COMPLETO do corpo presente');
  });
});

describe('3. lógica pura do toggle', () => {
  it('nextLessonHeaderOpen inverte o estado (o que o clique dispara)', () => {
    assert.equal(nextLessonHeaderOpen(false), true, 'colapsado → clique → expandido');
    assert.equal(nextLessonHeaderOpen(true), false, 'expandido → clique → colapsado');
  });
});

describe('4. o título da barra é UMA linha com ellipsis (CSS emitido)', () => {
  it('o h1 da barra tem white-space:nowrap + text-overflow:ellipsis', () => {
    const html = renderHeader();
    const h1Class = emotionClassOf(html, TITLE);
    const rules = cssRulesOf(html).filter((r) => r.selector.includes(h1Class));
    assert.ok(rules.length > 0, `regra do h1 da barra (${h1Class}) existe`);
    const body = rules.map((r) => r.body).join(';');
    assert.match(body, /white-space:nowrap/, 'noWrap do Typography');
    assert.match(body, /text-overflow:ellipsis/, 'ellipsis visual');
  });
});

describe('5. i18n — chaves novas resolvem nos DOIS idiomas', () => {
  it('en: aria-label e rótulos em inglês', async () => {
    await i18next.changeLanguage('en');
    try {
      const html = renderHeader();
      assert.ok(html.includes('aria-label="' + en.lesson.headerToggleExpand + '"'));
      assert.ok(html.includes(`>${en.lesson.challengesButton}<`));
      assert.ok(html.includes(`>${en.lesson.sourcesButton}<`));
    } finally {
      await i18next.changeLanguage('pt-BR');
    }
  });
});

describe('6. caso sem desafios / sem pré-requisitos', () => {
  it('sem desafios: botão Desafios NÃO existe; Fontes continua', () => {
    const html = renderHeader({ challengeCount: 0, pendingChallengeCount: 0 });
    assert.ok(!html.includes(ptBR.lesson.challengesButton), 'sem desafios não há botão');
    assert.ok(html.includes(`>${ptBR.lesson.sourcesButton}<`));
  });

  it('sem pré-requisitos: a linha de chips não existe', () => {
    const html = renderHeader({ prerequisites: [] });
    assert.ok(!html.includes(ptBR.lesson.prerequisitesLabel));
  });
});

describe('7. guards de FONTE — a LessonView usa o componente, não duplica o cabeçalho', () => {
  const VIEW = codeOf(readFileSync(VIEW_PATH, 'utf8'));
  const COMPONENT = codeOf(readFileSync(COMPONENT_PATH, 'utf8'));

  it('a view consome o componente novo (import + invocação)', () => {
    assert.match(VIEW, /import\s*\{[^}]*CollapsibleLessonHeader[^}]*\}\s*from\s*'\.\.\/\.\.\/components\/course\/CollapsibleLessonHeader'/);
    assert.ok(VIEW.includes('<CollapsibleLessonHeader'), 'o cabeçalho da aula é o componente');
  });

  it('a view REMONTA o componente por aula (key) — é o remount que volta a colapsado ao trocar de aula', () => {
    assert.match(
      VIEW,
      /key=\{`\$\{trackLesson\.trackSlug\}\/\$\{trackLesson\.lessonId\}`\}/,
      'key da aula no componente (sem key não há reset do estado ao abrir/trocar de aula)',
    );
  });

  it('a view NÃO tem mais o cabeçalho inline (título/resumo/pré-requisitos migraram)', () => {
    assert.ok(!VIEW.includes('variant="h5"'), 'título h5 inline saiu da view');
    // `lesson.summary` só pode aparecer UMA vez: na passagem de prop para o
    // componente (qualquer render inline duplicaria o texto na tela).
    assert.equal(VIEW.split('lesson.summary').length - 1, 1, 'resumo é SÓ via prop (sem render inline)');
    assert.ok(VIEW.includes('summary={lesson.summary}'), 'o resumo chega ao componente por prop');
    assert.ok(!VIEW.includes('prerequisitesLabel'), 'rótulo de pré-requisitos migrou');
  });

  it('o componente usa os springs do contrato (animationTokens), não curva ad-hoc', () => {
    assert.match(COMPONENT, /from\s+'\.\.\/\.\.\/lib\/animationTokens'/, 'importa o contrato de springs');
    assert.ok(COMPONENT.includes('springs.'), 'anima com os springs da casa');
    assert.ok(!COMPONENT.includes("transition={{ duration: 0.2"), 'sem curva inventada inline');
  });

  it('o corpo animado honra prefers-reduced-motion e DESMONTA ao recolher', () => {
    assert.ok(COMPONENT.includes('useReducedMotion'), 'redução de movimento respeitada (SC 2.3.3)');
    assert.ok(COMPONENT.includes('AnimatePresence'), 'corpo entra/sai com AnimatePresence');
  });
});
