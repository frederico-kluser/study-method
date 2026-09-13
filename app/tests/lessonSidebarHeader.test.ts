/**
 * tests/lessonSidebarHeader.test.ts — o CABEÇALHO DA AULA na COLUNA do sidebar
 * do shell (onda1-sidebar-slot).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O QUE ESTE ARQUIVO PROVA (e o que ele NÃO consegue provar — com honestidade)
 * ══════════════════════════════════════════════════════════════════════════
 * Esta base não tem jsdom (a técnica dela é `react-dom/server` — precedentes
 * `tests/lessonCollapsibleHeader.test.ts`, `tests/shellSidebar.test.ts`). Sem
 * DOM não há CLIQUE nem LAYOUT: o popover ancorado no botão, a quebra real de
 * linha a 180px e a publicação por portal no slot do shell são cobertos pelos
 * specs e2e Playwright quando a LessonView ligar o componente (onda 2). O que
 * dá para provar AQUI, com o renderizador real e o tema real, é:
 *
 *   BLOCO 1 — ESTRUTURA E LANDMARKS. A raiz é `<section aria-labelledby>`
 *     apontando para o id do h1 — e NENHUM `<header>` no HTML: o slot mora
 *     dentro do AppBar (fora do `main`), onde um `<header>` viraria um SEGUNDO
 *     banner e quebraria os `getByRole('banner')` dos e2e. UM h1 só, com o
 *     título completo; resumo, progresso e pré-requisitos presentes.
 *
 *   BLOCO 2 — "QUEBRA, NUNCA RECORTA" NO CSS EMITIDO. O título NÃO tem
 *     `white-space:nowrap` nem `text-overflow:ellipsis` (o que a barra
 *     colapsada antiga tinha — tests/lessonCollapsibleHeader.test.ts, bloco 4,
 *     prova o oposto lá); tem `overflow-wrap:anywhere`. Os chips de
 *     pré-requisito ganham o rótulo multilinha (o default do MuiChip é nowrap
 *     + ellipsis).
 *
 *   BLOCO 3 — AÇÕES. "Desafios" com badge de pendentes, aria-label
 *     interpolado, `aria-haspopup` e `aria-expanded` refletindo
 *     `challengesExpanded`; "Fontes" presente; os NOMES ACESSÍVEIS são os
 *     mesmos que os e2e procuram. E a fronteira de nível (regra 3b): o rótulo
 *     dos botões termina em TINTA (`text.primary`), nunca em `accentText`.
 *
 *   BLOCO 4 — CASOS VAZIOS. Sem desafios → sem botão Desafios; sem
 *     pré-requisitos → sem rótulo nem chips.
 *
 *   BLOCO 5 — i18n nos DOIS idiomas (pt-BR e en), com as chaves existentes.
 *
 *   BLOCO 6 — GUARDAS DE FONTE: o contrato de props congelado (o do
 *     CollapsibleLessonHeader MENOS `defaultOpen` — a lista é fixada AQUI, não
 *     lida do componente antigo, que a onda 2 aposenta), sem toggle de colapso
 *     (sem estado interno/AnimatePresence) e sem `component="header"`.
 *
 * Reprodução: `bash tools/t.sh tests/lessonSidebarHeader.test.ts`
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

// ATENÇÃO ao padrão da casa: o componente é .tsx e o tsconfig de tests/ não
// liga `jsx` — por isso a importação é DINÂMICA por URL (mesma técnica de
// tests/lessonCollapsibleHeader.test.ts).
const COMPONENT_MODULE = new URL(
  '../src/components/course/LessonSidebarHeader.tsx',
  import.meta.url,
).href;

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPONENT_PATH = resolve(HERE, '../src/components/course/LessonSidebarHeader.tsx');

/** Fonte sem comentários — só o código que realmente roda. */
function codeOf(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

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
  const tag = openTagWith(html, marker);
  const cls = /class="([^"]*)"/.exec(tag);
  const emotion = cls?.[1].split(/\s+/).find((c) => c.startsWith('css-'));
  assert.ok(emotion, `elemento com "${marker}" não tem classe do emotion: ${tag}`);
  return emotion;
}

/** Pega a TAG DE ABERTURA do `<button>` que carrega `marker`. */
function buttonTagWith(html: string, marker: string): string {
  const tag = openTagWith(html, marker);
  assert.match(tag, /^<button\b/, `esperava um <button>, veio: ${tag.slice(0, 80)}`);
  return tag;
}

/** A TAG DE ABERTURA do `<button>` cujo rótulo visível é `label` (o botão
 *  sem aria-label — o nome acessível é o próprio texto). */
function buttonTagByLabel(html: string, label: string): string {
  const at = html.indexOf(`>${label}</button>`);
  assert.notEqual(at, -1, `botão com rótulo "${label}" não está no HTML`);
  const open = html.lastIndexOf('<button', at);
  assert.notEqual(open, -1, `nenhum <button> antes do rótulo "${label}"`);
  return html.slice(open, html.indexOf('>', open) + 1);
}

/** A classe do emotion (`css-*`) de uma tag de abertura. */
function emotionClassOfTag(tag: string): string {
  const emotion = /class="([^"]*)"/.exec(tag)?.[1].split(/\s+/).find((c) => c.startsWith('css-'));
  assert.ok(emotion, `tag sem classe do emotion: ${tag}`);
  return emotion;
}

/**
 * O valor FINAL de uma propriedade na regra-BASE de uma classe (seletor
 * exatamente `.classe`, sem pseudo/descendente): a última declaração vence
 * (mesma especificidade, ordem de fonte) — é o que o navegador pinta.
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
 * Fixtures — o MESMO componente que a LessonView vai publicar no sidebar
 * ═══════════════════════════════════════════════════════════════════════════ */

/** O contrato de props, declarado LOCALMENTE — o tipo exportado pelo
 *  componente é .tsx e não pode ser importado em teste (ver COMPONENT_MODULE). */
interface LessonSidebarHeaderProps {
  title: string;
  summary: string;
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

/** O componente REAL, carregado no `before`. */
let LessonSidebarHeader: ComponentType<LessonSidebarHeaderProps>;

const BASE: LessonSidebarHeaderProps = {
  title: 'Aula E2E sobre funções de primeira classe e closures',
  summary: 'Resumo da aula: funções de primeira classe no JavaScript.',
  challengeCount: 2,
  pendingChallengeCount: 1,
  challengesExpanded: false,
  onChallengesClick: () => {},
  onSourcesClick: () => {},
  theoryProgress: 42,
  sectionCurrent: 2,
  sectionTotal: 3,
  prerequisites: [
    { slug: 'declaracoes', title: 'Declarações' },
    { slug: 'escopo', title: 'Escopo léxico' },
  ],
  onPrerequisiteClick: () => {},
};

function renderHeader(props: Partial<LessonSidebarHeaderProps> = {}): string {
  return renderToStaticMarkup(
    createElement(
      ThemeProvider,
      { theme },
      createElement(LessonSidebarHeader, { ...BASE, ...props }),
    ),
  );
}

const TITLE = BASE.title;
const SUMMARY = BASE.summary;
/** O nome acessível que o e2e procura: "Desafios da aula (1 pendentes)". */
const CHALLENGES_ARIA = `aria-label="${ptBR.lesson.challengesButtonAria.replace('{{pending}}', '1')}"`;

before(async () => {
  process.env.I18NEXT_NO_SUPPORT_NOTICE = '1';
  await i18next.use(initReactI18next).init({
    lng: 'pt-BR',
    // A MESMA opção de interpolação da produção (src/i18n/index.ts).
    interpolation: { escapeValue: false },
    resources: { 'pt-BR': { translation: ptBR }, en: { translation: en } },
  });
  const mod = (await import(COMPONENT_MODULE)) as {
    LessonSidebarHeader: typeof LessonSidebarHeader;
  };
  LessonSidebarHeader = mod.LessonSidebarHeader;
});

/* ═══════════════════════ BLOCO 1 — ESTRUTURA E LANDMARKS ═════════════════ */

describe('1. estrutura: <section aria-labelledby> → h1, nenhum <header>', () => {
  it('a raiz é <section> e o aria-labelledby aponta para o id do h1', () => {
    const markup = markupOf(renderHeader());
    assert.match(markup, /^<section\b/, `a raiz tem que ser <section>, veio: ${markup.slice(0, 60)}`);
    const labelledBy = /^<section\b[^>]*\baria-labelledby="([^"]+)"/.exec(markup)?.[1];
    assert.ok(labelledBy, 'a section precisa de aria-labelledby (vira região nomeada pelo título)');
    const h1 = openTagWith(markup, '<h1');
    assert.ok(h1.includes(`id="${labelledBy}"`), `o aria-labelledby (${labelledBy}) não aponta para o h1: ${h1}`);
  });

  it('NENHUM <header> no HTML (dentro do AppBar, um <header> seria um SEGUNDO banner)', () => {
    const html = renderHeader();
    assert.ok(!/<header\b/.test(html), 'um <header> no slot quebra getByRole("banner") dos e2e');
    assert.ok(!html.includes('role="banner"'), 'nem banner explícito');
  });

  it('exatamente UM h1, com o título COMPLETO (e o título aparece uma vez só)', () => {
    const html = renderHeader();
    const h1s = html.match(/<h1[\s>]/g) ?? [];
    assert.equal(h1s.length, 1, 'exatamente UM h1');
    assert.match(html, new RegExp(`<h1\\b[^>]*>${TITLE}</h1>`), 'o h1 carrega o título inteiro');
    assert.equal(html.split(TITLE).length - 1, 1, 'o título não é duplicado');
  });

  it('o resumo, o progresso + contador e os pré-requisitos estão SEMPRE presentes (sem colapso)', () => {
    const html = renderHeader();
    assert.ok(html.includes(SUMMARY), 'resumo sempre visível');
    assert.match(
      html,
      new RegExp(`aria-label="${ptBR.lesson.theoryProgress.replace('{{percent}}', '42')}"`),
      'a barra carrega o MESMO aria-label do cabeçalho antigo',
    );
    assert.match(html, /role="progressbar"/);
    assert.match(html, /aria-valuenow="42"/);
    assert.ok(
      html.includes(ptBR.lesson.theoryCount.replace('{{current}}', '2').replace('{{total}}', '3')),
      'contador "Seção N de M"',
    );
    assert.ok(html.includes(ptBR.lesson.prerequisitesLabel), 'rótulo de pré-requisitos');
    assert.ok(html.includes('>Declarações<') && html.includes('>Escopo léxico<'), 'um chip por pré-requisito');
  });

  it('sem toggle de colapso: nada de aria-label de expandir/recolher e só os 2 botões de ação', () => {
    const html = renderHeader();
    assert.ok(!html.includes(ptBR.lesson.headerToggleExpand), 'sem toggle "Mostrar detalhes"');
    assert.ok(!html.includes(ptBR.lesson.headerToggleCollapse), 'sem toggle "Ocultar detalhes"');
    // Os chips clicáveis são `role="button"` em <div>; os <button> são só as ações.
    const buttons = html.match(/<button\b/g) ?? [];
    assert.equal(buttons.length, 2, `esperava só Desafios + Fontes, veio: ${buttons.length}`);
    // O único aria-expanded é o do Desafios (reflete o popover da view).
    assert.equal((html.match(/aria-expanded=/g) ?? []).length, 1);
  });
});

/* ═══════════════ BLOCO 2 — "QUEBRA, NUNCA RECORTA" (CSS emitido) ══════════ */

describe('2. SC 1.4.12 — o título quebra, nunca recorta (CSS emitido pelo emotion)', () => {
  it('o h1 NÃO tem white-space:nowrap nem text-overflow:ellipsis; tem overflow-wrap:anywhere', () => {
    const html = renderHeader();
    const h1Class = emotionClassOf(html, TITLE);
    const rules = cssRulesOf(html).filter((r) => r.selector.includes(h1Class));
    assert.ok(rules.length > 0, `regra do h1 (${h1Class}) existe`);
    const body = rules.map((r) => r.body).join(';');
    assert.doesNotMatch(body, /white-space:nowrap/, 'noWrap é overflow:hidden + reticências (F104)');
    assert.doesNotMatch(body, /text-overflow:ellipsis/, 'o título não pode ter reticências');
    assert.doesNotMatch(body, /overflow:hidden/, 'o título não pode recortar');
    assert.match(body, /white-space:normal/);
    assert.match(body, /overflow-wrap:anywhere/, 'nem um identificador longo estoura a coluna');
  });

  it('o resumo também quebra (overflow-wrap:anywhere, tinta secundária)', () => {
    const html = renderHeader();
    const cls = emotionClassOf(html, SUMMARY);
    assert.equal(finalDeclOf(html, cls, 'overflow-wrap'), 'anywhere');
    assert.equal(finalDeclOf(html, cls, 'color'), 'var(--mui-palette-text-secondary)');
  });

  it('o rótulo dos chips vira MULTILINHA (o default do MuiChip é nowrap + ellipsis)', () => {
    const html = renderHeader();
    const label = cssRulesOf(html).find(
      (r) => /MuiChip-root \.MuiChip-label$/.test(r.selector),
    );
    assert.ok(label, 'o override do rótulo do chip (".<chip> .MuiChip-label") existe');
    assert.match(label.body, /white-space:normal/);
    assert.match(label.body, /overflow-wrap:anywhere/);
    assert.match(label.body, /text-overflow:clip/, 'nem o text-overflow computado sobra (e2e-spacing)');
    assert.match(label.body, /overflow:visible/);
  });
});

/* ═════════════════════════════ BLOCO 3 — AÇÕES ═══════════════════════════ */

describe('3. ações: Desafios (badge + popover da view) e Fontes', () => {
  it('Desafios: aria-label interpolado, aria-haspopup, aria-expanded=false, rótulo e badge', () => {
    const html = renderHeader();
    const desafios = buttonTagWith(html, CHALLENGES_ARIA);
    assert.match(desafios, /aria-haspopup="true"/);
    assert.match(desafios, /aria-expanded="false"/, 'sem popover aberto, o botão diz false');
    assert.ok(html.includes(`>${ptBR.lesson.challengesButton}</button>`), 'rótulo Desafios');
    assert.match(html, /<span[^>]*MuiBadge-badge[^>]*>\s*1\s*<\/span>/, 'badge com a contagem de pendentes');
  });

  it('challengesExpanded=true reflete no aria-expanded do Desafios', () => {
    const html = renderHeader({ challengesExpanded: true });
    assert.match(buttonTagWith(html, CHALLENGES_ARIA), /aria-expanded="true"/);
  });

  it('a contagem de pendentes muda o badge E o nome acessível juntos', () => {
    const html = renderHeader({ pendingChallengeCount: 3 });
    buttonTagWith(html, `aria-label="${ptBR.lesson.challengesButtonAria.replace('{{pending}}', '3')}"`);
    assert.match(html, /<span[^>]*MuiBadge-badge[^>]*>\s*3\s*<\/span>/);
  });

  it('Fontes: <button> com o rótulo EXATO que o e2e procura (name: "Fontes")', () => {
    const html = renderHeader();
    const fontes = buttonTagByLabel(html, ptBR.lesson.sourcesButton);
    assert.ok(!fontes.includes('aria-label='), 'sem aria-label: o nome acessível é o próprio rótulo');
    assert.ok(!fontes.includes('aria-haspopup'), 'Fontes abre diálogo da view, não popover');
  });

  it('regra 3b: o rótulo dos DOIS botões termina em TINTA (text.primary), nunca em accentText', () => {
    const html = renderHeader();
    const desafiosCls = emotionClassOf(html, CHALLENGES_ARIA);
    assert.equal(finalDeclOf(html, desafiosCls, 'color'), 'var(--mui-palette-text-primary)');
    // O acento sobra na BORDA do Desafios (a ação de destaque)…
    assert.equal(finalDeclOf(html, desafiosCls, 'border-color'), 'var(--mui-palette-primary-fill)');
    // …e no ÍCONE.
    // (o tema também emite `.<botão> .MuiButton-startIcon` — o vão de 10px do
    // ícone —, então as regras desse seletor são JUNTADAS antes de ler.)
    const icon = cssRulesOf(html)
      .filter((r) => r.selector === `.${desafiosCls} .MuiButton-startIcon`)
      .map((r) => r.body)
      .join(';');
    assert.match(icon, /color:var\(--mui-palette-primary-fill\)/, 'ícone do Desafios no acento');

    // Fontes: tinta no rótulo, borda NEUTRA (o desenho do cabeçalho antigo).
    const fontesCls = emotionClassOfTag(buttonTagByLabel(html, ptBR.lesson.sourcesButton));
    assert.equal(finalDeclOf(html, fontesCls, 'color'), 'var(--mui-palette-text-primary)');
    assert.equal(finalDeclOf(html, fontesCls, 'border-color'), 'var(--mui-palette-nonText-neutral)');
  });
});

/* ═══════════════════════════ BLOCO 4 — CASOS VAZIOS ══════════════════════ */

describe('4. sem desafios / sem pré-requisitos', () => {
  it('sem desafios: botão Desafios (e badge) NÃO existem; Fontes continua', () => {
    const html = renderHeader({ challengeCount: 0, pendingChallengeCount: 0 });
    assert.ok(!html.includes(ptBR.lesson.challengesButton), 'sem desafios não há botão');
    assert.ok(!html.includes('MuiBadge-badge'), 'nem badge órfão');
    assert.ok(html.includes(`>${ptBR.lesson.sourcesButton}</button>`));
    assert.equal((html.match(/<button\b/g) ?? []).length, 1);
  });

  it('sem pré-requisitos: nem o rótulo nem a linha de chips existem', () => {
    const html = renderHeader({ prerequisites: [] });
    assert.ok(!html.includes(ptBR.lesson.prerequisitesLabel));
    assert.ok(!html.includes('MuiChip-root'), 'sem chips');
  });
});

/* ════════════════════════════ BLOCO 5 — i18n ═════════════════════════════ */

describe('5. i18n — as chaves reusadas resolvem nos DOIS idiomas', () => {
  it('pt-BR: rótulos, aria-labels e contador em português', () => {
    const html = renderHeader();
    assert.ok(html.includes(`>${ptBR.lesson.challengesButton}</button>`));
    assert.ok(html.includes(`>${ptBR.lesson.sourcesButton}</button>`));
    assert.ok(html.includes(CHALLENGES_ARIA));
    assert.ok(html.includes(ptBR.lesson.prerequisitesLabel));
    // nenhuma chave crua vazou (sinal de i18n não resolvido)
    assert.ok(!html.includes('lesson.'), 'chave i18n crua no HTML');
  });

  it('en: rótulos, aria-labels e contador em inglês', async () => {
    await i18next.changeLanguage('en');
    try {
      const html = renderHeader();
      assert.ok(html.includes(`>${en.lesson.challengesButton}</button>`));
      assert.ok(html.includes(`>${en.lesson.sourcesButton}</button>`));
      assert.ok(html.includes(`aria-label="${en.lesson.challengesButtonAria.replace('{{pending}}', '1')}"`));
      assert.ok(html.includes(`aria-label="${en.lesson.theoryProgress.replace('{{percent}}', '42')}"`));
      assert.ok(html.includes(en.lesson.theoryCount.replace('{{current}}', '2').replace('{{total}}', '3')));
      assert.ok(html.includes(en.lesson.prerequisitesLabel));
      assert.ok(!html.includes('lesson.'), 'chave i18n crua no HTML');
    } finally {
      await i18next.changeLanguage('pt-BR');
    }
  });
});

/* ═══════════════════════════ BLOCO 6 — GUARDAS DE FONTE ══════════════════ */

describe('6. guardas de fonte — contrato congelado, sem colapso, sem <header>', () => {
  const SRC = readFileSync(COMPONENT_PATH, 'utf8');
  const CODE = codeOf(SRC);

  it('o contrato de props é o do CollapsibleLessonHeader MENOS defaultOpen (lista congelada)', () => {
    const body = /export interface LessonSidebarHeaderProps \{([\s\S]*?)\n\}/.exec(CODE)?.[1];
    assert.ok(body, 'LessonSidebarHeaderProps não encontrado');
    const fields = [...body.matchAll(/^\s*(?:readonly\s+)?(\w+)\??:/gm)].map((m) => m[1]).sort();
    assert.deepEqual(
      fields,
      [
        'challengeCount',
        'challengesExpanded',
        'onChallengesClick',
        'onPrerequisiteClick',
        'onSourcesClick',
        'pendingChallengeCount',
        'prerequisites',
        'sectionCurrent',
        'sectionTotal',
        'summary',
        'theoryProgress',
        'title',
      ],
    );
    assert.ok(!fields.includes('defaultOpen'), 'sem colapso não há defaultOpen');
    assert.match(CODE, /onChallengesClick: \(anchor: HTMLButtonElement\) => void;/);
    assert.match(CODE, /export function LessonSidebarHeader\(/);
  });

  it('sem toggle de colapso: sem estado interno, sem AnimatePresence, sem aria-expanded de toggle', () => {
    assert.ok(!CODE.includes('useState'), 'o componente é só apresentação (a view é dona do estado)');
    assert.ok(!CODE.includes('AnimatePresence'));
    assert.ok(!CODE.includes('headerToggle'), 'sem chaves i18n do toggle antigo');
  });

  it('a raiz é section com aria-labelledby (useId) — nunca component="header"', () => {
    assert.match(CODE, /component="section"/);
    assert.match(CODE, /aria-labelledby=\{titleId\}/);
    assert.match(CODE, /const titleId = useId\(\);/);
    assert.ok(!CODE.includes('component="header"'), 'header no slot = segundo banner');
    assert.ok(!/<header\b/.test(CODE));
  });

  it('nada de noWrap no componente (a política do sidebar é quebrar)', () => {
    assert.ok(!CODE.includes('noWrap'), 'noWrap = overflow hidden + ellipsis + nowrap (F104)');
  });

  it('o clique do Desafios entrega o PRÓPRIO botão como âncora do popover da view', () => {
    assert.match(CODE, /onClick=\{\(e\) => onChallengesClick\(e\.currentTarget\)\}/);
  });
});
