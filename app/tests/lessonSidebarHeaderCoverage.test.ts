/**
 * tests/lessonSidebarHeaderCoverage.test.ts — COMPLEMENTO de
 * tests/lessonSidebarHeader.test.ts (onda1-sidebar-slot): bordas numéricas e de
 * conteúdo que o arquivo-irmão não cobre.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O QUE ESTE ARQUIVO PROVA (e o que ele NÃO consegue provar — com honestidade)
 * ══════════════════════════════════════════════════════════════════════════
 * Mesma técnica da casa (node:test SEM jsdom; `react-dom/server` + tema real +
 * i18next real — ver tests/lessonSidebarHeader.test.ts). O irmão já prova a
 * estrutura (section/h1/landmarks), o CSS de "quebra, nunca recorta", as ações
 * com a fixture PADRÃO (progress=42, 1 pendente, 2 pré-requisitos) e os casos
 * vazios (challengeCount=0, prerequisites=[]). Este arquivo cobre exatamente as
 * BORDAS que sobraram:
 *
 *   BLOCO 1 — PROGRESSO NOS EXTREMOS. theoryProgress em 0 e 100 (aria-valuenow,
 *     aria-valuemin/max que o MUI injeta sozinho, aria-label interpolado nos
 *     extremos) e sectionCurrent/sectionTotal = 0 (contador "Seção 0 de 0" sem
 *     "undefined"/"NaN" — a interpolação é só troca de string, mas o zero é o
 *     caso mais fácil de esconder um bug de "cai no padrão quando falsy").
 *
 *   BLOCO 2 — i18n NOS EXTREMOS (en), fechando o par do Bloco 1.
 *
 *   BLOCO 3 — O BADGE DE PENDENTES EM ZERO. `pendingChallengeCount=0` COM
 *     `challengeCount>0` (desafios existem, nenhum pendente) é um caso que o
 *     irmão não cobre (lá o 0/0 anda junto — sem desafio nenhum). Provado
 *     empiricamente (render real): o MUI Badge marca a classe
 *     `MuiBadge-invisible` NO `<span>` REAL e o deixa SEM o dígito "0" dentro —
 *     mas o `aria-label` do BOTÃO continua computado com `pending: 0` (a
 *     aparência visual e o nome acessível são coisas diferentes). E o inverso:
 *     um valor alto (7) aparece cheio, sem a classe invisible NO SPAN REAL.
 *     ARMADILHA MEDIDA EMPIRICAMENTE (e evitada aqui): o MUI emite a regra
 *     `.css-XXX.MuiBadge-invisible{...}` no `<style>` do SSR SEMPRE — mesmo
 *     quando a instância não está invisible —, então `html.includes(
 *     'MuiBadge-invisible')` no HTML INTEIRO não discrimina nada; só a classe
 *     do `<span>` real (fora do `<style>`) prova o estado.
 *
 *   BLOCO 4 — MUITOS PRÉ-REQUISITOS. 6 itens → 6 chips clicáveis
 *     (`role="button"` — verificado empiricamente ser o marcador que não
 *     multiplica dentro da folha `<style>` do emotion, ao contrário da classe
 *     `MuiChip-root`, que aparece 2× por chip).
 *
 *   BLOCO 5 — TÍTULO EXTREMO, RESUMO VAZIO, PRÉ-REQUISITO LONGO. Um título de
 *     300 caracteres SEM espaço nenhum (o pior caso para `overflow-wrap`)
 *     aparece por COMPLETO — nada no componente corta/substring o título. Um
 *     resumo `''` não lança e não inventa texto de placeholder (o parágrafo
 *     fica vazio — verificado empiricamente: `<p ...></p>` logo após o `</h1>`,
 *     já que `Typography` variant="body2" mapeia para `<p>`). Um pré-requisito
 *     de 120 caracteres sem espaço mantém o texto INTEIRO e a regra CSS
 *     "multilinha" do chip (Bloco 2 do irmão já prova a REGRA existe; aqui o
 *     dado é realista/extremo, não o fixture curto).
 *
 *   BLOCO 6 — CLIQUE: GUARDAS DE FONTE QUE FALTAVAM. O irmão trava a fonte do
 *     clique de Desafios (`onChallengesClick(e.currentTarget)`); aqui fecha o
 *     par que faltava: o clique do CHIP de pré-requisito chama
 *     `onPrerequisiteClick(pre.slug)`, e "Fontes" chama `onSourcesClick` DIRETO
 *     (sem wrapper) — diferença deliberada em relação a Desafios, que precisa
 *     do `currentTarget` para ancorar o popover.
 *
 *   BLOCO 7 — BORDAS COMBINADAS ("kitchen sink"). Todas as bordas acima ao
 *     mesmo tempo (progress=0, seção 0/0, pendente=0, `challengesExpanded=true`,
 *     6 pré-requisitos, título de 300 chars, resumo vazio): não lança, a
 *     estrutura landmark continua íntegra (1 `<section>`, 1 `<h1>`,
 *     `aria-labelledby` aponta certo) — prova que as bordas não interagem mal
 *     entre si.
 *
 * O que este arquivo NÃO prova (do mesmo jeito que o irmão): clique real
 * (sem jsdom não há evento de DOM), popover ancorado, layout real a 180px. Essa
 * fatia é dos specs e2e Playwright, que abrem a aula real (a LessonView
 * publica o componente no slot do sidebar): tests/e2e/e2e-lesson.spec.ts (o h1
 * no slot, o clique em Desafios abrindo o popover, a troca de aula) e
 * tests/e2e/e2e-sidebar-aula-spacing.spec.ts (o piso de 180px sob os
 * overrides do SC 1.4.12, em pt-BR e en). A POSIÇÃO do popover nenhum e2e
 * mede: a direção dele é guarda de fonte em tests/lessonSidebarWiring.test.ts
 * (bloco 4).
 *
 * Reprodução: `bash tools/t.sh tests/lessonSidebarHeaderCoverage.test.ts`
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
// tests/lessonSidebarHeader.test.ts).
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

/** Todos os pares `<seletor>{<corpo>}` das folhas embutidas no HTML do SSR
 *  (mesma técnica de tests/lessonSidebarHeader.test.ts — não lida com @media
 *  aninhado, mas nenhum teste aqui precisa disso). */
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

/** Pega a TAG DE ABERTURA do `<button>` que carrega `marker` (mesma técnica do irmão). */
function buttonTagWith(html: string, marker: string): string {
  const tag = openTagWith(html, marker);
  assert.match(tag, /^<button\b/, `esperava um <button>, veio: ${tag.slice(0, 80)}`);
  return tag;
}

/**
 * A TAG DE ABERTURA real do `<span>` do badge (fora do `<style>`). ATENÇÃO: o
 * MUI emite a regra `.css-XXX.MuiBadge-invisible{...}` no `<style>` SEMPRE —
 * é a definição ESTÁTICA do modificador, presente mesmo quando a instância não
 * está invisible (verificado empiricamente). Por isso `html.includes(
 * 'MuiBadge-invisible')` não discrimina nada: quem decide é a lista de classes
 * do `<span>` REAL, que só esta função inspeciona (via `markupOf` primeiro).
 */
function badgeSpanTag(html: string): string {
  return openTagWith(markupOf(html), 'MuiBadge-badge');
}

/** O contrato de props, declarado LOCALMENTE (o mesmo padrão do irmão — o tipo
 *  exportado pelo componente é .tsx e não pode ser importado em teste). */
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
  title: 'Aula de cobertura sobre funções de primeira classe',
  summary: 'Resumo padrão da fixture de cobertura.',
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
    createElement(ThemeProvider, { theme }, createElement(LessonSidebarHeader, { ...BASE, ...props })),
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

/* ══════════════ BLOCO 1 — PROGRESSO DA TEORIA NOS EXTREMOS (0/100) ══════════ */

describe('1. progresso da teoria nos extremos: 0 e 100, e seção 0 de 0', () => {
  it('theoryProgress=0: role=progressbar, aria-valuenow/min/max e aria-label com percent=0', () => {
    const html = renderHeader({ theoryProgress: 0 });
    assert.match(html, /role="progressbar"/);
    assert.match(html, /aria-valuenow="0"/);
    // O MUI injeta min/max sozinho (verificado empiricamente) — reforça que a
    // barra é acessível nos extremos, não só no meio da fixture padrão (42).
    assert.match(html, /aria-valuemin="0"/);
    assert.match(html, /aria-valuemax="100"/);
    assert.match(
      html,
      new RegExp(`aria-label="${ptBR.lesson.theoryProgress.replace('{{percent}}', '0')}"`),
    );
  });

  it('theoryProgress=100: aria-valuenow="100" e o aria-label reflete 100%', () => {
    const html = renderHeader({ theoryProgress: 100 });
    assert.match(html, /aria-valuenow="100"/);
    assert.match(
      html,
      new RegExp(`aria-label="${ptBR.lesson.theoryProgress.replace('{{percent}}', '100')}"`),
    );
  });

  it('sectionCurrent=0 e sectionTotal=0: contador "Seção 0 de 0" — sem "undefined"/"NaN"', () => {
    const html = renderHeader({ sectionCurrent: 0, sectionTotal: 0 });
    assert.ok(
      html.includes(ptBR.lesson.theoryCount.replace('{{current}}', '0').replace('{{total}}', '0')),
      'a interpolação com 0 não pode cair num fallback nem sumir (0 é falsy)',
    );
    // NOTA: NÃO testamos a ausência da substring "undefined" no HTML inteiro —
    // verificado empiricamente que o MUI emite `var(--mui-palette-..., undefined)`
    // como fallback de canal de cor em QUALQUER render (até na fixture padrão,
    // sem relação nenhuma com sectionCurrent/sectionTotal). Checar a string
    // crua daria falso positivo. "NaN" não tem esse problema.
    assert.ok(!html.includes('NaN'), 'nenhum "NaN" vazou pra tela');
  });
});

/* ══════════════ BLOCO 2 — i18n NOS MESMOS EXTREMOS (en) ═══════════════════ */

describe('2. i18n en — os extremos de progresso (0/100) traduzem certo', () => {
  it('en: aria-label da barra em 0% e em 100%', async () => {
    await i18next.changeLanguage('en');
    try {
      const html0 = renderHeader({ theoryProgress: 0 });
      const html100 = renderHeader({ theoryProgress: 100 });
      assert.match(html0, new RegExp(`aria-label="${en.lesson.theoryProgress.replace('{{percent}}', '0')}"`));
      assert.match(html100, new RegExp(`aria-label="${en.lesson.theoryProgress.replace('{{percent}}', '100')}"`));
    } finally {
      await i18next.changeLanguage('pt-BR');
    }
  });

  it('en: contador "Section 0 of 0" também não quebra', async () => {
    await i18next.changeLanguage('en');
    try {
      const html = renderHeader({ sectionCurrent: 0, sectionTotal: 0 });
      assert.ok(html.includes(en.lesson.theoryCount.replace('{{current}}', '0').replace('{{total}}', '0')));
    } finally {
      await i18next.changeLanguage('pt-BR');
    }
  });
});

/* ══════ BLOCO 3 — BADGE DE PENDENTES EM ZERO (invisível) vs alto ══════════ */

describe('3. badge de pendentes: 0 fica INVISÍVEL (sem dígito); um valor alto aparece cheio', () => {
  it('pendingChallengeCount=0 com challengeCount>0: o botão Desafios continua existindo', () => {
    // Quem decide SE existe o botão é challengeCount, não pendingChallengeCount
    // — o irmão só testa os dois em 0 juntos; aqui eles se separam.
    const html = renderHeader({ pendingChallengeCount: 0 });
    assert.ok(html.includes(`>${ptBR.lesson.challengesButton}</button>`), 'o botão Desafios não pode sumir');
  });

  it('pendingChallengeCount=0: classe MuiBadge-invisible no <span> REAL, e SEM dígito "0" dentro', () => {
    const html = renderHeader({ pendingChallengeCount: 0 });
    const tag = badgeSpanTag(html);
    assert.match(tag, /\bMuiBadge-invisible\b/, `badgeContent=0 sem showZero → MUI marca invisible: ${tag}`);
    assert.match(
      markupOf(html),
      /<span[^>]*MuiBadge-badge[^>]*MuiBadge-invisible[^>]*><\/span>/,
      'o span do badge existe mas fica VAZIO (o MUI não renderiza o "0" quando invisible)',
    );
    assert.ok(
      !/<span[^>]*MuiBadge-badge[^>]*>\s*0\s*<\/span>/.test(markupOf(html)),
      'nenhum "0" visível dentro do span do badge',
    );
  });

  it('pendingChallengeCount=0: o NOME ACESSÍVEL do botão ainda diz "(0 pendentes)" (aparência ≠ nome acessível)', () => {
    const html = renderHeader({ pendingChallengeCount: 0 });
    assert.ok(
      html.includes(`aria-label="${ptBR.lesson.challengesButtonAria.replace('{{pending}}', '0')}"`),
      'o aria-label é computado a partir da prop, independente do badge estar visualmente invisible',
    );
  });

  it('pendingChallengeCount alto (7): SEM invisible no <span> REAL, dígito visível no badge e no aria-label', () => {
    const html = renderHeader({ pendingChallengeCount: 7 });
    const tag = badgeSpanTag(html);
    assert.ok(
      !/\bMuiBadge-invisible\b/.test(tag),
      `com pendentes > 0 a classe invisible não pode estar no span real: ${tag}`,
    );
    assert.match(html, /<span[^>]*MuiBadge-badge[^>]*>\s*7\s*<\/span>/, 'o dígito 7 tem que aparecer no badge');
    assert.ok(html.includes(`aria-label="${ptBR.lesson.challengesButtonAria.replace('{{pending}}', '7')}"`));
  });
});

/* ══════════════════════ BLOCO 4 — MUITOS PRÉ-REQUISITOS ═══════════════════ */

describe('4. muitos pré-requisitos: todos os chips aparecem, um por item', () => {
  const MANY = Array.from({ length: 6 }, (_, i) => ({ slug: `pre-${i}`, title: `Pré-requisito número ${i}` }));

  it('6 pré-requisitos → 6 chips clicáveis (role="button"), cada um com o próprio título', () => {
    const html = renderHeader({ prerequisites: MANY });
    const markup = markupOf(html);
    // `role="button"` é o marcador PRECISO do chip clicável — verificado
    // empiricamente que NÃO se multiplica dentro do <style> do emotion (ao
    // contrário de "MuiChip-root", que aparece 2× por chip: uma vez no nome da
    // classe combinada e outra no sufixo do hash do emotion).
    const chips = markup.match(/role="button"/g) ?? [];
    assert.equal(chips.length, MANY.length, `esperava ${MANY.length} chips, veio ${chips.length}`);
    for (const pre of MANY) {
      assert.ok(html.includes(`>${pre.title}<`), `chip ausente: ${pre.title}`);
    }
    assert.ok(html.includes(ptBR.lesson.prerequisitesLabel), 'o rótulo "Não entendeu? Revisar:" continua presente');
    // Os botões de AÇÃO continuam sendo só os 2 de sempre — os chips não são
    // <button> (são <div role="button"> do MuiChip clicável).
    assert.equal((markup.match(/<button\b/g) ?? []).length, 2);
  });
});

/* ══════ BLOCO 5 — TÍTULO EXTREMO, RESUMO VAZIO, PRÉ-REQUISITO LONGO ═══════ */

describe('5. título de 300 chars sem espaço, resumo vazio, pré-requisito longo', () => {
  it('título de 300 chars SEM espaço nenhum aparece POR COMPLETO — nenhum corte por JS', () => {
    const LONG_TITLE = 'x'.repeat(300);
    const html = renderHeader({ title: LONG_TITLE });
    assert.ok(html.includes(LONG_TITLE), 'o título INTEIRO tem que estar no HTML, sem substring nem corte');
    assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1, 'continua sendo UM h1 só');
  });

  it('resumo vazio (\'\'): não lança, e o parágrafo do resumo fica vazio (sem texto de placeholder)', () => {
    let html = '';
    assert.doesNotThrow(() => {
      html = renderHeader({ summary: '' });
    });
    const markup = markupOf(html);
    // Verificado empiricamente: Typography variant="body2" mapeia para <p>, e
    // com children='' o React não injeta nada — nem um placeholder, nem um
    // espaço. O <p> nasce logo depois do </h1> (mesmo Box de título+resumo).
    assert.match(
      markup,
      /<\/h1><p[^>]*MuiTypography-body2[^>]*><\/p>/,
      'o parágrafo do resumo tem que existir vazio, sem placeholder',
    );
  });

  it('pré-requisito com título de 120 chars sem espaço: texto INTEIRO + CSS multilinha do chip', () => {
    const LONG_PRE = 'y'.repeat(120);
    const html = renderHeader({ prerequisites: [{ slug: 'longo', title: LONG_PRE }] });
    assert.ok(html.includes(`>${LONG_PRE}<`), 'o rótulo do chip carrega o texto INTEIRO, sem corte');
    const label = cssRulesOf(html).find((r) => /MuiChip-root \.MuiChip-label$/.test(r.selector));
    assert.ok(label, 'a regra do rótulo multilinha do chip existe mesmo com um dado extremo');
    assert.match(label.body, /white-space:normal/);
    assert.match(label.body, /overflow-wrap:anywhere/);
  });
});

/* ══════════════════ BLOCO 6 — CLIQUE: GUARDAS DE FONTE ════════════════════ */

describe('6. clique — wiring de origem que o irmão não trava (sem jsdom, só dá pra provar na fonte)', () => {
  const CODE = codeOf(readFileSync(COMPONENT_PATH, 'utf8'));

  it('o chip de pré-requisito chama onPrerequisiteClick(pre.slug) no clique', () => {
    assert.match(CODE, /onClick=\{\(\) => onPrerequisiteClick\(pre\.slug\)\}/);
  });

  it('"Fontes" chama onSourcesClick DIRETO (sem wrapper) — Desafios embrulha com currentTarget', () => {
    assert.match(CODE, /onClick=\{onSourcesClick\}/, 'Fontes não precisa de âncora — chama a prop direto');
    assert.match(
      CODE,
      /onClick=\{\(e\) => onChallengesClick\(e\.currentTarget\)\}/,
      'Desafios entrega o próprio botão como âncora do popover da view',
    );
  });
});

/* ══════════════ BLOCO 7 — BORDAS COMBINADAS ("kitchen sink") ══════════════ */

describe('7. bordas combinadas: nada quebra quando todas acontecem ao mesmo tempo', () => {
  it('progress=0, seção 0/0, pendente=0, expanded=true, 6 pré-requisitos, título de 300 chars, resumo vazio', () => {
    const LONG_TITLE = 'k'.repeat(300);
    const MANY = Array.from({ length: 6 }, (_, i) => ({ slug: `pre-${i}`, title: `Pré ${i}` }));
    let html = '';
    assert.doesNotThrow(() => {
      html = renderHeader({
        title: LONG_TITLE,
        summary: '',
        theoryProgress: 0,
        sectionCurrent: 0,
        sectionTotal: 0,
        pendingChallengeCount: 0,
        challengesExpanded: true,
        prerequisites: MANY,
      });
    });
    const markup = markupOf(html);

    // A estrutura landmark continua íntegra sob todas as bordas juntas.
    assert.equal((markup.match(/<section\b/g) ?? []).length, 1);
    assert.equal((markup.match(/<h1[\s>]/g) ?? []).length, 1);
    const labelledBy = /^<section\b[^>]*\baria-labelledby="([^"]+)"/.exec(markup)?.[1];
    assert.ok(labelledBy, 'aria-labelledby ausente sob as bordas combinadas');
    const h1 = openTagWith(markup, '<h1');
    assert.ok(h1.includes(`id="${labelledBy}"`), 'aria-labelledby desalinhou do h1 sob as bordas combinadas');

    assert.ok(markup.includes(LONG_TITLE), 'o título de 300 chars continua completo');
    assert.equal((markup.match(/role="button"/g) ?? []).length, MANY.length, 'os 6 chips continuam todos');

    // O badge invisível E o aria-expanded=true (do challengesExpanded) convivem
    // sem se atrapalhar — aparência (badge) e estado (popover) são independentes.
    const desafios = buttonTagWith(
      html,
      `aria-label="${ptBR.lesson.challengesButtonAria.replace('{{pending}}', '0')}"`,
    );
    assert.match(desafios, /aria-expanded="true"/);

    // ARMADILHA EVITADA (ver o cabeçalho deste arquivo e badgeSpanTag() acima):
    // `html.includes('MuiBadge-invisible')` sobre o HTML CRU é TAUTOLÓGICO — o
    // emotion emite a regra estática `.css-XXX.MuiBadge-invisible{...}` no
    // <style> do SSR SEMPRE, mesmo quando a instância não está invisible, e
    // por isso não discrimina nada (verificado empiricamente: com
    // pendingChallengeCount=7 essa mesma chamada também seria true). Quem
    // discrimina é a classe do <span> REAL do badge, fora do <style> — a
    // mesma técnica do Bloco 3 (badgeSpanTag).
    const badgeTag = badgeSpanTag(html);
    assert.match(
      badgeTag,
      /\bMuiBadge-invisible\b/,
      `pendingChallengeCount=0 sob as bordas combinadas: o <span> real do badge tem que carregar MuiBadge-invisible: ${badgeTag}`,
    );
  });
});
