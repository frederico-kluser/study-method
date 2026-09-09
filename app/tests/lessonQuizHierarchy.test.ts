/**
 * tests/lessonQuizHierarchy.test.ts — ONDA12: a HIERARQUIA do corpo do quiz e
 * o CONTORNO das pílulas, medidos no CSS que o card realmente emite.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * OS DOIS DEFEITOS QUE A PROVA VISUAL APONTOU
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   1. DOIS CABEÇALHOS COMPETINDO. O modal tem UM título ("Prove que
 *      entendeu", peso 400 — igual à referência do dono). Logo abaixo, a
 *      AFIRMAÇÃO vinha em `body2` com `fontWeight: 600` — mais forte que a
 *      PERGUNTA, que vinha em `body2` peso normal. O olho lia dois títulos e
 *      a pergunta, que é o que o aluno precisa responder, ficava em terceiro.
 *      Conserto: a afirmação cai para tinta SECUNDÁRIA em peso normal (vira a
 *      linha de contexto que é) e a pergunta sobe para `body1` (18px) peso
 *      500 — a voz principal do CORPO, sem virar um segundo cabeçalho.
 *
 *   2. CONTORNO FRACO. As pílulas saíam com 1px de borda em tinta a 55% e
 *      quase sumiam contra o cartão. A referência usa contorno cheio e
 *      nítido. Conserto: 1,5px a 72%, por `color-mix` sobre a variável do
 *      tema (nada de cor crua) e com a especificidade `&&` necessária para
 *      vencer a regra por descendência do QuizOverlayHost.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * A ARMADILHA QUE ESTE ARQUIVO EXISTE PARA TRAVAR
 * ══════════════════════════════════════════════════════════════════════════
 * `color="text.secondary"` como PROP do Typography é NO-OP em @mui/material
 * 9.3 — medido aqui: a classe emitida sai sem `color` nenhum. Só
 * `sx={{ color: 'text.secondary' }}` (ou o legado `color="textSecondary"`)
 * escreve `color:var(--mui-palette-text-secondary)`. Um teste que lesse a
 * FONTE (`grep color="text.secondary"`) aprovaria um rebaixamento que não
 * chega à tela; por isso aqui se mede o CSS EMITIDO, com o componente REAL
 * montado por `react-dom/server` (a técnica de tests/quizOverlayRender.test.ts).
 *
 * Reprodução: `bash tools/t.sh tests/lessonQuizHierarchy.test.ts`
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
import type { QuizState } from '../src/lib/trackLessonState';
import type { TrackAssertionDto } from '../shared/ipc-contract';

const HERE = dirname(fileURLToPath(import.meta.url));
const CARD_MODULE = new URL('../src/views/LessonView/LessonQuiz.tsx', import.meta.url).href;
const LESSON_PATH = resolve(
  HERE,
  '../resources/tracks/python/modules/a-tela/lessons/a-primeira-linha/lesson.json',
);
const ASSERTION = (
  JSON.parse(readFileSync(LESSON_PATH, 'utf8')) as { assertions: TrackAssertionDto[] }
).assertions[0];

interface CardProps {
  assertion: TrackAssertionDto;
  quiz: QuizState | undefined;
  onSelect: (answerIndex: number) => void;
}

let LessonQuizCard: ComponentType<CardProps>;

function render(quiz: QuizState | undefined = undefined): string {
  return renderToStaticMarkup(
    createElement(
      ThemeProvider,
      { theme },
      createElement(LessonQuizCard, { assertion: ASSERTION, quiz, onSelect: () => {} }),
    ),
  );
}

/**
 * A REGRA CSS que o elemento cujo conteúdo é `text` está de fato usando:
 * acha a tag que contém o texto, lê a classe emotion dela e devolve o corpo
 * da regra `.css-xxx{…}` correspondente. É o que separa "está no arquivo" de
 * "chega à tela".
 */
function ruleForText(html: string, text: string): string {
  const at = html.indexOf(text);
  assert.ok(at >= 0, `o texto "${text.slice(0, 40)}…" não chegou ao HTML`);
  const abertura = html.lastIndexOf('<', at);
  const tag = html.slice(abertura, at);
  const classe = /class="([^"]*)"/.exec(tag)?.[1] ?? '';
  const emotion = classe.split(/\s+/).find((c) => c.startsWith('css-'));
  assert.ok(emotion, `o elemento de "${text.slice(0, 40)}…" não tem classe emotion`);
  const regra = new RegExp(`\\.${emotion}\\{([^}]*)\\}`).exec(html);
  assert.ok(regra, `a regra de ${emotion} não foi emitida`);
  return regra[1];
}

before(async () => {
  process.env.I18NEXT_NO_SUPPORT_NOTICE = '1';
  await i18next.use(initReactI18next).init({
    lng: 'pt-BR',
    // A MESMA opção de interpolação da produção (src/i18n/index.ts:
    // `interpolation: { escapeValue: false }`). Sem ela o harness roda com o
    // default do i18next — `escapeValue` LIGADO — e passa a medir uma string
    // que o app nunca emite: `"` vira `&quot;`, o React escapa o `&` de novo, e
    // uma alternativa real como `print("boa noite")` chega ao `aria-label` como
    // `print(&amp;quot;boa noite&amp;quot;)`. O produto está certo; era o
    // harness que divergia dele.
    interpolation: { escapeValue: false },
    resources: { 'pt-BR': { translation: ptBR } },
  });
  const mod = (await import(CARD_MODULE)) as { LessonQuizCard: typeof LessonQuizCard };
  LessonQuizCard = mod.LessonQuizCard;
});

describe('UM título só — a PERGUNTA é a voz principal do corpo', () => {
  it('a AFIRMAÇÃO perdeu o negrito e ganhou tinta SECUNDÁRIA', () => {
    const regra = ruleForText(render(), ASSERTION.statement);
    assert.match(
      regra,
      /color:var\(--mui-palette-text-secondary\)/,
      'a afirmação tem de sair da tinta primária (e por `sx`, não pela prop `color`, que é no-op)',
    );
    assert.ok(
      !/font-weight:\s*(600|700|bold)/.test(regra),
      `a afirmação não pode mais competir em peso com o título: ${regra}`,
    );
  });

  it('a PERGUNTA é maior e mais firme que a afirmação', () => {
    const html = render();
    const pergunta = ruleForText(html, 'O que aparece na tela?');
    const afirmacao = ruleForText(html, ASSERTION.statement);
    const px = (regra: string): number => Number(/font-size:(\d+)px/.exec(regra)?.[1] ?? 0);
    const peso = (regra: string): number => {
      const todos = [...regra.matchAll(/font-weight:(\d+)/g)].map((m) => Number(m[1]));
      // A ÚLTIMA vence — é a cascata dentro da mesma regra, e é assim que o
      // `sx` sobrescreve o peso da variante.
      return todos[todos.length - 1] ?? 400;
    };
    assert.ok(px(pergunta) > px(afirmacao), `pergunta ${px(pergunta)}px vs afirmação ${px(afirmacao)}px`);
    assert.ok(peso(pergunta) > peso(afirmacao), `pergunta ${peso(pergunta)} vs afirmação ${peso(afirmacao)}`);
    // E ela NÃO vira um segundo cabeçalho: continua na família de TEXTO
    // (título nesta base é display/Nunito) e abaixo do peso de título (700).
    assert.match(pergunta, /Inter/, 'a pergunta é TEXTO, não título');
    assert.ok(peso(pergunta) < 700, 'a pergunta não pode ter peso de título');
  });
});

describe('CONTORNO das pílulas — cheio e nítido, e igual para as quatro', () => {
  it('a borda sobe para 1,5px em tinta a 72%, por color-mix sobre a variável', () => {
    const html = render();
    const regra =
      /\.css-[A-Za-z0-9-]+\.css-[A-Za-z0-9-]+\.MuiButton-outlined:not\(\.Mui-disabled\)\{([^}]*)\}/.exec(
        html,
      );
    assert.ok(regra, 'a regra de contorno das pílulas não foi emitida com o dobro de classe (&&)');
    assert.match(regra[1], /border-width:1\.5px/, 'a borda tem de engrossar');
    assert.match(
      regra[1],
      /border-color:color-mix\(in srgb, var\(--mui-palette-text-primary\) 72%, transparent\)/,
      'a cor sai da VARIÁVEL do tema por color-mix — nada de hex, rgb() ou alpha()',
    );
  });

  it('nenhuma cor crua entrou no card', () => {
    const src = readFileSync(resolve(HERE, '../src/views/LessonView/LessonQuiz.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(src), 'hex cru no card');
    assert.ok(!/\brgba?\(/.test(src), 'rgb()/rgba() cru no card');
    assert.ok(!/\bhsla?\(/.test(src), 'hsl() cru no card');
    assert.ok(!/\balpha\(/.test(src), 'alpha() é proibido — cor com variável CSS usa color-mix');
    assert.ok(
      !/palette\.mode\s*===/.test(src),
      'ternário sobre palette.mode é proibido pelo contrato de tokens',
    );
  });

  it('a regra vale para as QUATRO pílulas (ela não olha para índice nenhum)', () => {
    const html = render().replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
    const classes = [
      ...html.matchAll(/class="([^"]*MuiButton-root[^"]*)"[^>]*aria-label="Opção /g),
    ].map((m) => m[1]);
    assert.equal(classes.length, ASSERTION.options.length, 'as quatro pílulas estão lá');
    assert.equal(new Set(classes).size, 1, 'as quatro compartilham a MESMA classe');
  });

  it('respondido: o contorno reforçado NÃO invade o veredito do tema', () => {
    // Depois da resposta, as quatro ficam `Mui-disabled` — e a regra é
    // `:not(.Mui-disabled)`. O desenho das travadas continua sendo o do tema,
    // que já calibrou o contraste delas.
    const html = render({ answered: true, selected: 1, correct: false });
    const escopo =
      /\.css-[A-Za-z0-9-]+\.css-[A-Za-z0-9-]+\.MuiButton-outlined:not\(\.Mui-disabled\)\{/.test(html);
    assert.ok(escopo, 'a regra continua existindo, escopada ao estado não respondido');
    assert.ok(html.includes('Mui-disabled'), 'as pílulas travam depois da resposta');
  });
});
