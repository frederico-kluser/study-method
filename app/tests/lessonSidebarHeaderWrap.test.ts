/**
 * tests/lessonSidebarHeaderWrap.test.ts — o CONSERTO onda3 (fc84e8b) de
 * "QUEBRA, NUNCA RECORTA" (SC 1.4.12 / F104) nas AÇÕES do cabeçalho da aula
 * no sidebar (src/components/course/LessonSidebarHeader.tsx).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O BURACO QUE O CONSERTO FECHOU (e que os irmãos não cobriam)
 * ══════════════════════════════════════════════════════════════════════════
 * tests/e2e/e2e-sidebar-aula-spacing.spec.ts mediu, no piso de 180px sob os
 * quatro overrides do SC 1.4.12, um recorte REAL em inglês: o botão
 * "Challenges" media 162,6px contra 155px de coluna útil — a raiz do
 * MuiBadge nasce `flex-shrink: 0` (o botão não encolhia) e a bolha do badge
 * passava da borda do sidebar (`overflowX: 'hidden'` do SessionFrame),
 * recortada. O conserto: `sx={{ maxWidth: '100%' }}` na raiz do Badge (prende
 * a bolha à linha) e `whiteSpace: 'normal'` + `overflowWrap: 'anywhere'` nos
 * DOIS botões ("Desafios" e "Fontes" — o rótulo quebra em vez de estourar).
 * Antes deste conserto SÓ o e2e (que roda o Electron de verdade, mede layout
 * em pixel) pegava esse recorte — nenhum teste unitário dependia dessas três
 * declarações. Este arquivo fecha essa lacuna.
 *
 * tests/lessonSidebarHeader.test.ts (bloco 2) e
 * tests/lessonSidebarHeaderCoverage.test.ts já prova(ra)m "quebra, nunca
 * recorta" do TÍTULO, do RESUMO e do rótulo dos CHIPS — mas não tinham
 * nenhuma asserção sobre a raiz do Badge nem sobre os botões de ação (o
 * conserto é POSTERIOR a esses arquivos). Este arquivo é o complemento
 * ESPECÍFICO dessas três declarações; não duplica nada dos irmãos.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * A ARMADILHA EVITADA: LER O CSS DA INSTÂNCIA, NUNCA A FOLHA ESTÁTICA DO MUI
 * ══════════════════════════════════════════════════════════════════════════
 * tests/lessonSidebarHeaderCoverage.test.ts já documentou, medindo
 * empiricamente, que o MUI emite a regra `.css-XXX.MuiBadge-invisible{...}`
 * no `<style>` do SSR SEMPRE — até quando a instância não está invisible —,
 * então `html.includes('MuiBadge-invisible')` sobre o HTML INTEIRO não
 * discrimina nada. A mesma armadilha existe aqui por um caminho diferente:
 * `max-width:100%` e `white-space:normal` são coisas que o MUI (ou o tema)
 * PODE já declarar em alguma regra genérica/composta em outro lugar da folha
 * (ex.: outro seletor qualquer que também contenha a substring da classe).
 * Por isso as três funções abaixo NUNCA fazem `html.includes(...)` num valor
 * de propriedade: elas (1) acham o ELEMENTO REAL fora do `<style>` (a raiz do
 * Badge, ou o `<button>` pelo rótulo visível), (2) leem a classe do emotion
 * (`css-*`) QUE ESSA INSTÂNCIA carrega, e (3) filtram as regras CUJO SELETOR
 * é EXATAMENTE `.<essa-classe>` (sem pseudo/descendente) — a mesma técnica de
 * `finalDeclOf` dos dois irmãos. Uma regra de outro seletor (mesmo que
 * contenha a substring da classe, ex. `.<classe> .MuiButton-startIcon`) nunca
 * entra nessa leitura.
 *
 * PROVA DE DISCRIMINAÇÃO (rodada FORA deste arquivo, não commitada): uma
 * sonda em node_modules/.cache/scratch/ gerou 5 cópias do FONTE REAL do
 * componente, cada uma com UMA das três propriedades removida (maxWidth do
 * Badge; whiteSpace de Desafios; overflowWrap de Desafios; whiteSpace de
 * Fontes; overflowWrap de Fontes), renderizou cada cópia pelo MESMO pipeline
 * deste arquivo e confirmou que a asserção correspondente FALHA (com a
 * mensagem apontando a propriedade e o elemento certos) — e que mutar
 * Desafios NUNCA derruba a asserção de Fontes (nem vice-versa), confirmando
 * que cada leitura é da INSTÂNCIA certa, não de uma folha compartilhada.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O QUE ESTE ARQUIVO NÃO PROVA (mesma honestidade dos irmãos)
 * ══════════════════════════════════════════════════════════════════════════
 * Sem jsdom (a técnica da casa é `react-dom/server` — ver o cabeçalho de
 * tests/lessonSidebarHeader.test.ts), não há LAYOUT real: a quebra de linha
 * de fato, em pixel, a 180px sob os overrides do SC 1.4.12, é medida em
 * tests/e2e/e2e-sidebar-aula-spacing.spec.ts. E este arquivo NÃO duplica a
 * regressão do badge invisível (`pendingChallengeCount=0` vs. >0), coberta em
 * tests/lessonSidebarHeaderCoverage.test.ts (bloco 3): a fixture-base usa
 * pendentes=1 (badge visível) e o único teste com pendentes=0 (bloco 1)
 * verifica SÓ o `max-width` da raiz do Badge — nunca a classe
 * visible/invisible —, então nenhuma asserção aqui depende daquele
 * comportamento.
 *
 * Reprodução: `bash tools/t.sh tests/lessonSidebarHeaderWrap.test.ts`
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

// ATENÇÃO ao padrão da casa: o componente é .tsx e o tsconfig de tests/ não
// liga `jsx` — por isso a importação é DINÂMICA por URL (mesma técnica de
// tests/lessonSidebarHeader.test.ts).
const COMPONENT_MODULE = new URL(
  '../src/components/course/LessonSidebarHeader.tsx',
  import.meta.url,
).href;

/* ═══════════════════════════════════════════════════════════════════════════
 * Ferramentas de leitura do CSS emitido pelo SSR (mesma técnica e mesmas
 * assinaturas dos dois irmãos — cada arquivo da casa mantém sua própria
 * cópia destes utilitários pequenos, sem módulo compartilhado).
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

/** O HTML sem as folhas `<style>` que o emotion embute no SSR — só a marcação.
 *  Necessário para achar elementos pelo NOME DA CLASSE sem cair na regra
 *  estática correspondente (que também contém essa substring). */
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

/** A classe do emotion (`css-*`) de uma tag de abertura. */
function emotionClassOfTag(tag: string): string {
  const cls = /class="([^"]*)"/.exec(tag)?.[1].split(/\s+/).find((c) => c.startsWith('css-'));
  assert.ok(cls, `tag sem classe do emotion: ${tag}`);
  return cls;
}

/** A TAG DE ABERTURA do `<button>` cujo rótulo visível é `label` (o botão
 *  sem aria-label — o nome acessível é o próprio texto; mesma técnica de
 *  tests/lessonSidebarHeader.test.ts, `buttonTagByLabel`). */
function buttonTagByLabel(html: string, label: string): string {
  const at = html.indexOf(`>${label}</button>`);
  assert.notEqual(at, -1, `botão com rótulo "${label}" não está no HTML`);
  const open = html.lastIndexOf('<button', at);
  assert.notEqual(open, -1, `nenhum <button> antes do rótulo "${label}"`);
  return html.slice(open, html.indexOf('>', open) + 1);
}

/**
 * A TAG DE ABERTURA REAL da RAIZ do Badge (`<span class="MuiBadge-root
 * ...">`, fora do `<style>`). Só existe UM Badge no componente (em volta de
 * "Desafios"). ATENÇÃO à mesma armadilha que `badgeSpanTag` evita em
 * tests/lessonSidebarHeaderCoverage.test.ts para `MuiBadge-badge`: o MUI
 * também emite `.css-XXX-MuiBadge-root{...}` no `<style>`, então a busca
 * precisa ser em `markupOf(html)` — nunca no HTML cru.
 */
function badgeRootTagOf(html: string): string {
  return openTagWith(markupOf(html), 'MuiBadge-root');
}

/**
 * O valor FINAL de uma propriedade na regra-BASE de uma classe (seletor
 * EXATAMENTE `.classe`, sem pseudo/descendente): a última declaração vence
 * (mesma especificidade, ordem de fonte) — é o que o navegador pinta. Mesma
 * função dos dois irmãos.
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
 * Fixtures — o MESMO componente que a LessonView publica no sidebar
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

// Pendentes=1 (badge VISÍVEL): este arquivo não testa a regra visible/
// invisible (é do irmão lessonSidebarHeaderCoverage.test.ts) — usar um valor
// >0 fixo evita qualquer acoplamento acidental com aquela lógica. Sem
// pré-requisitos: os chips não fazem parte deste conserto.
const BASE: LessonSidebarHeaderProps = {
  title: 'Aula sobre funções de primeira classe',
  summary: 'Resumo da aula.',
  challengeCount: 2,
  pendingChallengeCount: 1,
  challengesExpanded: false,
  onChallengesClick: () => {},
  onSourcesClick: () => {},
  theoryProgress: 50,
  sectionCurrent: 1,
  sectionTotal: 2,
  prerequisites: [],
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

/* ═══ BLOCO 1 — A RAIZ DO BADGE FICA PRESA À LINHA (max-width:100%) ═══════ */

describe('1. a raiz do Badge de "Desafios" tem max-width:100% (a instância, não a folha genérica)', () => {
  it('pt-BR: .MuiBadge-root da instância termina com max-width:100%', () => {
    const html = renderHeader();
    const cls = emotionClassOfTag(badgeRootTagOf(html));
    assert.equal(
      finalDeclOf(html, cls, 'max-width'),
      '100%',
      'sem isso a bolha do badge projeta flex-shrink:0 e vaza pela borda do sidebar (overflowX:hidden) — medido em inglês pelo e2e-sidebar-aula-spacing',
    );
  });

  it('o max-width não depende da contagem de pendentes (vale também com pendingChallengeCount=0)', () => {
    // Deliberadamente NÃO afirma nada sobre a classe visible/invisible do
    // badge (isso é do irmão lessonSidebarHeaderCoverage.test.ts) — só que a
    // raiz continua com max-width:100% quando o badge está "vazio".
    const html = renderHeader({ pendingChallengeCount: 0 });
    const cls = emotionClassOfTag(badgeRootTagOf(html));
    assert.equal(finalDeclOf(html, cls, 'max-width'), '100%');
  });

  it('en: max-width:100% não muda com o idioma (é CSS, não texto)', async () => {
    await i18next.changeLanguage('en');
    try {
      const html = renderHeader();
      const cls = emotionClassOfTag(badgeRootTagOf(html));
      assert.equal(finalDeclOf(html, cls, 'max-width'), '100%');
    } finally {
      await i18next.changeLanguage('pt-BR');
    }
  });
});

/* ═══ BLOCO 2 — "DESAFIOS" QUEBRA O RÓTULO (não estoura a coluna) ═════════ */

describe('2. o botão "Desafios" quebra o rótulo: white-space:normal + overflow-wrap:anywhere na instância', () => {
  it('pt-BR: as duas declarações na classe do PRÓPRIO botão "Desafios"', () => {
    const html = renderHeader();
    const cls = emotionClassOfTag(buttonTagByLabel(html, ptBR.lesson.challengesButton));
    assert.equal(finalDeclOf(html, cls, 'white-space'), 'normal', '"Desafios" sem white-space:normal');
    assert.equal(finalDeclOf(html, cls, 'overflow-wrap'), 'anywhere', '"Desafios" sem overflow-wrap:anywhere');
  });

  it('en: "Challenges" — mesmas duas declarações (o CSS não muda, só o rótulo)', async () => {
    await i18next.changeLanguage('en');
    try {
      const html = renderHeader();
      const cls = emotionClassOfTag(buttonTagByLabel(html, en.lesson.challengesButton));
      assert.equal(finalDeclOf(html, cls, 'white-space'), 'normal', '"Challenges" sem white-space:normal');
      assert.equal(finalDeclOf(html, cls, 'overflow-wrap'), 'anywhere', '"Challenges" sem overflow-wrap:anywhere');
    } finally {
      await i18next.changeLanguage('pt-BR');
    }
  });
});

/* ═══ BLOCO 3 — "FONTES" QUEBRA O RÓTULO, COM OU SEM "DESAFIOS" AO LADO ═══ */

describe('3. o botão "Fontes" quebra o rótulo — presente com challengeCount>0 e sozinho com challengeCount=0', () => {
  it('pt-BR, COM "Desafios" ao lado (challengeCount>0): "Fontes" também quebra', () => {
    const html = renderHeader();
    const cls = emotionClassOfTag(buttonTagByLabel(html, ptBR.lesson.sourcesButton));
    assert.equal(finalDeclOf(html, cls, 'white-space'), 'normal', '"Fontes" sem white-space:normal');
    assert.equal(finalDeclOf(html, cls, 'overflow-wrap'), 'anywhere', '"Fontes" sem overflow-wrap:anywhere');
  });

  it('pt-BR, SEM "Desafios" (challengeCount=0 → só "Fontes" existe): as duas propriedades continuam', () => {
    const html = renderHeader({ challengeCount: 0, pendingChallengeCount: 0 });
    // Guarda mínima de que o cenário é o que diz ser (sem depender da lógica
    // de visível/invisível do badge — só da EXISTÊNCIA do botão "Desafios").
    assert.ok(!html.includes(ptBR.lesson.challengesButton), 'este cenário não pode ter o botão "Desafios"');
    const cls = emotionClassOfTag(buttonTagByLabel(html, ptBR.lesson.sourcesButton));
    assert.equal(finalDeclOf(html, cls, 'white-space'), 'normal', '"Fontes" sozinho sem white-space:normal');
    assert.equal(finalDeclOf(html, cls, 'overflow-wrap'), 'anywhere', '"Fontes" sozinho sem overflow-wrap:anywhere');
  });

  it('en, COM "Challenges" ao lado: "Sources" quebra', async () => {
    await i18next.changeLanguage('en');
    try {
      const html = renderHeader();
      const cls = emotionClassOfTag(buttonTagByLabel(html, en.lesson.sourcesButton));
      assert.equal(finalDeclOf(html, cls, 'white-space'), 'normal');
      assert.equal(finalDeclOf(html, cls, 'overflow-wrap'), 'anywhere');
    } finally {
      await i18next.changeLanguage('pt-BR');
    }
  });

  it('en, SEM "Challenges" (challengeCount=0): "Sources" sozinho continua quebrando', async () => {
    await i18next.changeLanguage('en');
    try {
      const html = renderHeader({ challengeCount: 0, pendingChallengeCount: 0 });
      assert.ok(!html.includes(en.lesson.challengesButton), 'este cenário não pode ter o botão "Challenges"');
      const cls = emotionClassOfTag(buttonTagByLabel(html, en.lesson.sourcesButton));
      assert.equal(finalDeclOf(html, cls, 'white-space'), 'normal');
      assert.equal(finalDeclOf(html, cls, 'overflow-wrap'), 'anywhere');
    } finally {
      await i18next.changeLanguage('pt-BR');
    }
  });
});
