/**
 * tests/quizOptionLeak.test.ts — ONDA12, DEFEITO 3: a resposta vazava pela
 * POSIÇÃO da pílula.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O DEFEITO, medido antes de ser consertado
 * ══════════════════════════════════════════════════════════════════════════
 *
 *     $ grep -rho '"answerIndex": *[0-9]*' resources/tracks --include='*.json' \
 *         | sort | uniq -c
 *          44 "answerIndex": 0
 *     $ grep -rniE 'shuffle|embaralh|sortear|randomi[sz]' src electron shared tools
 *       (nenhuma saída)
 *
 * A ONDA10 fechou o vazamento por PIXEL: `optionVisualState` retorna o neutro
 * sem sequer LER `answerIndex` antes da resposta, e as quatro pílulas nascem
 * idênticas em classe, cor, borda, peso e ícone. Só que o card mapeava
 * `assertion.options` na ordem do JSON, e no JSON a resposta está em 0 nas 44
 * afirmações do curso. Indistinguíveis por aparência, perfeitamente
 * distinguíveis por LUGAR: clicar sempre na primeira pílula dominava o curso
 * inteiro sem ler nada, e o gate de maestria — que só abre com ACERTO — virava
 * decoração.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * POR QUE ESTE TESTE RENDERIZA O CARD DE VERDADE
 * ══════════════════════════════════════════════════════════════════════════
 * Um teste do módulo puro (`tests/quizOptionOrder.test.ts`) prova que a
 * permutação é boa; ele NÃO prova que a tela a usa. A pergunta desta suíte é
 * outra e é sobre o que o aluno vê: **em que ordem as pílulas chegam ao DOM, e
 * o que acontece com quem clica sempre na primeira.** Por isso aqui se monta o
 * componente REAL com `react-dom/server` (a técnica que esta base já adotou —
 * `tests/quizOverlayRender.test.ts`), lê-se a ORDEM REAL do HTML e roda-se a
 * MÁQUINA PURA REAL (`submitQuizAnswer`/`isQuizMastered`) com o que sair de lá.
 *
 * IMPORT DINÂMICO COM SPECIFIER COMPUTADO: mesma razão do precedente — o
 * projeto composite dos testes compila sem DOM e sem `jsx` de propósito, e um
 * import estático de `.tsx` apagaria essa garantia.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ANTES DO CONSERTO
 * ══════════════════════════════════════════════════════════════════════════
 * Contra `git show HEAD:src/views/LessonView/LessonQuiz.tsx` esta suíte
 * REPROVA: o aluno que clica sempre na primeira pílula domina 44 de 44
 * afirmações, e a ordem de exibição é a identidade.
 *
 * Reprodução: `bash tools/t.sh tests/quizOptionLeak.test.ts`
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemeProvider } from '@mui/material/styles';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import { theme } from '../src/theme';
import ptBR from '../src/i18n/locales/pt-BR/translation.json';
import {
  createTrackLessonState,
  isQuizMastered,
  quizKeyFor,
  submitQuizAnswer,
  type QuizState,
} from '../src/lib/trackLessonState';
import { quizOptionOrder } from '../src/lib/quizOptionOrder';
import type { TrackAssertionDto } from '../shared/ipc-contract';

const HERE = dirname(fileURLToPath(import.meta.url));
const TRACKS = resolve(HERE, '../resources/tracks');
const CARD_MODULE = new URL('../src/views/LessonView/LessonQuiz.tsx', import.meta.url).href;

interface CardProps {
  assertion: TrackAssertionDto;
  quiz: QuizState | undefined;
  onSelect: (answerIndex: number) => void;
}

let LessonQuizCard: ComponentType<CardProps>;

/** TODAS as afirmações reais das trilhas do disco (as 119 atuais de
 * python-iniciante: a-tela 44 + decisao 36 + repeticao 39; 44 à época do
 * conserto, quando a trilha tinha só o módulo a-tela). */
function realAssertions(): TrackAssertionDto[] {
  const out: TrackAssertionDto[] = [];
  for (const entry of readdirSync(TRACKS, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || entry.name !== 'lesson.json') continue;
    const lesson = JSON.parse(readFileSync(join(entry.parentPath, entry.name), 'utf8')) as {
      assertions?: TrackAssertionDto[];
    };
    for (const a of lesson.assertions ?? []) out.push(a);
  }
  return out;
}

const REAL = realAssertions();

/**
 * Entidades HTML de volta ao texto. Uma alternativa REAL da aula 1 é
 * `print("boa noite")`, e o React escapa as aspas ao serializar o atributo:
 * no HTML ela sai como `print(&quot;boa noite&quot;)`. Sem desfazer isso, o
 * `indexOf` na lista de opções falharia — silenciosamente, que é o pior modo.
 *
 * ONDA 12, INTEGRAÇÃO: este comentário afirmava DOIS escapes ("o i18next
 * transforma `\"` em `&quot;` e o React escapa o `&` daí em `&amp;`", saindo
 * `print(&amp;quot;…`), e tratava isso como um defeito de a11y do produto. Era
 * defeito do HARNESS, não do produto: `src/i18n/index.ts` inicializa o
 * i18next com `interpolation: { escapeValue: false }` — o ajuste padrão de
 * react-i18next, porque quem escapa é o React —, e o harness deste arquivo
 * omitia a opção, rodando com o default LIGADO. Agora ele espelha a produção,
 * e sobra só o escape do React. O laço fica (barato, e idempotente por
 * construção), mas o segundo passe não tem mais o que fazer.
 */
function decode(text: string): string {
  let out = text;
  for (let passada = 0; passada < 3; passada++) {
    const antes = out;
    out = out
      .replaceAll('&quot;', '"')
      .replaceAll('&#x27;', "'")
      .replaceAll('&#39;', "'")
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&amp;', '&');
    if (out === antes) break;
  }
  return out;
}

/**
 * As pílulas NA ORDEM DO DOM, pelo NOME ACESSÍVEL ("Opção 2 de 4: …") — que é
 * literalmente o que o leitor de tela anuncia e o que o e2e clica. Devolve o
 * número anunciado e o TEXTO da alternativa.
 */
function pillsOnScreen(html: string): { announced: number; option: string }[] {
  return [...html.matchAll(/aria-label="Opção (\d+) de \d+: ([^"]*)"/g)].map((m) => ({
    announced: Number(m[1]),
    option: decode(m[2]),
  }));
}

function renderCard(assertion: TrackAssertionDto, quiz: QuizState | undefined): string {
  return renderToStaticMarkup(
    createElement(
      ThemeProvider,
      { theme },
      createElement(LessonQuizCard, { assertion, quiz, onSelect: () => {} }),
    ),
  );
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

describe('O ALUNO QUE CLICA SEMPRE NA PRIMEIRA PÍLULA — ele NÃO domina', () => {
  it('sobre as afirmações REAIS, clicar na primeira não vence o curso', () => {
    let dominadas = 0;
    const primeiraEraCerta: string[] = [];
    for (const assertion of REAL) {
      const key = quizKeyFor(assertion);
      const pills = pillsOnScreen(renderCard(assertion, undefined));
      assert.equal(pills.length, assertion.options.length, `${key}: 4 pílulas na tela`);

      // O CLIQUE: a primeira pílula do DOM. O índice submetido é o ORIGINAL —
      // é o que o card passa a `onSelect`, e é o que a máquina pura recebe.
      const escolhido = assertion.options.indexOf(pills[0].option);
      assert.ok(escolhido >= 0, `${key}: a pílula 1 mostra uma alternativa da afirmação`);

      const estado = submitQuizAnswer(
        createTrackLessonState(),
        key,
        escolhido,
        assertion.answerIndex,
      );
      if (isQuizMastered(estado, key)) {
        dominadas += 1;
        primeiraEraCerta.push(key);
      }
    }

    // ANTES DO CONSERTO: 44 de 44 (a certa era SEMPRE a primeira pílula).
    assert.notEqual(
      dominadas,
      REAL.length,
      'clicar sempre na primeira pílula dominou TODAS as afirmações — a posição está entregando a resposta',
    );
    // E não é "quase todas", nem "quase nenhuma": o acerto por posição tem de
    // valer o ACASO (25% da amostra: 11 de 44 então, ~30 de 119 hoje). A banda
    // é folgada porque a amostra é pequena; o que ela recusa é a degeneração —
    // os MESMOS 40%/11% do conserto, escalados (17 de 44 → 45 de 119; 5 de 44
    // → 13 de 119).
    const acaso = Math.round(REAL.length / 4);
    const teto = Math.floor(REAL.length * 0.3864);
    const piso = Math.floor(REAL.length * 0.1136);
    assert.ok(
      dominadas <= teto,
      `o clicador cego dominou ${dominadas} de ${REAL.length} (o acaso é ${acaso}): ${primeiraEraCerta.join(', ')}`,
    );
    assert.ok(
      dominadas >= piso,
      `o clicador cego dominou só ${dominadas} de ${REAL.length} (o acaso é ${acaso}) — a primeira pílula virou o lugar ERRADO por construção, o que é outro atalho`,
    );
  });

  it('a mesma conta pela ÚLTIMA pílula (inverter a ordem não seria conserto)', () => {
    let dominadas = 0;
    for (const assertion of REAL) {
      const key = quizKeyFor(assertion);
      const pills = pillsOnScreen(renderCard(assertion, undefined));
      const escolhido = assertion.options.indexOf(pills[pills.length - 1].option);
      const estado = submitQuizAnswer(
        createTrackLessonState(),
        key,
        escolhido,
        assertion.answerIndex,
      );
      if (isQuizMastered(estado, key)) dominadas += 1;
    }
    const acaso = Math.round(REAL.length / 4);
    const teto = Math.floor(REAL.length * 0.3864);
    const piso = Math.floor(REAL.length * 0.1136);
    assert.ok(
      dominadas >= piso && dominadas <= teto,
      `clicar sempre na última dominou ${dominadas} de ${REAL.length} (o acaso é ${acaso})`,
    );
  });
});

describe('A TELA usa a permutação do módulo — e só ela', () => {
  it('a ordem das pílulas é EXATAMENTE quizOptionOrder(chave, geração, n)', () => {
    for (const assertion of REAL) {
      const key = quizKeyFor(assertion);
      const esperada = quizOptionOrder(key, 0, assertion.options.length);
      const naTela = pillsOnScreen(renderCard(assertion, undefined)).map((p) =>
        assertion.options.indexOf(p.option),
      );
      assert.deepEqual(naTela, esperada, `${key}: a tela não segue a permutação do módulo`);
    }
  });

  it('a ordem é ESTÁVEL entre renders do mesmo card', () => {
    for (const assertion of REAL.slice(0, 10)) {
      const primeira = pillsOnScreen(renderCard(assertion, undefined)).map((p) => p.option);
      for (let i = 0; i < 3; i++) {
        assert.deepEqual(
          pillsOnScreen(renderCard(assertion, undefined)).map((p) => p.option),
          primeira,
          'a pílula não pode trocar de texto entre dois renders',
        );
      }
    }
  });

  it('o NÚMERO ANUNCIADO acompanha a tela (1..n em ordem de DOM)', () => {
    // Se o `aria-label` continuasse preso ao índice do JSON, quem navega por
    // leitor de tela ouviria "Opção 1" na alternativa certa em 44 de 44 — o
    // mesmo atalho, mudado de canal.
    for (const assertion of REAL) {
      const pills = pillsOnScreen(renderCard(assertion, undefined));
      assert.deepEqual(
        pills.map((p) => p.announced),
        pills.map((_, i) => i + 1),
        `${quizKeyFor(assertion)}: a numeração anunciada tem de ser a da tela`,
      );
    }
  });
});

describe('A INVARIANTE SAGRADA CONTINUA DE PÉ (a permutação não a afrouxa)', () => {
  const ASSERTION = REAL[0];
  const KEY = quizKeyFor(ASSERTION);

  it('antes do clique, as quatro pílulas seguem VISUALMENTE idênticas', () => {
    const html = renderCard(ASSERTION, undefined).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
    assert.ok(!html.includes('MuiButton-contained'), 'nenhuma nasce preenchida');
    assert.ok(!html.includes('Success'), 'nenhuma nasce verde');
    assert.ok(!html.includes('Error'), 'nenhuma nasce vermelha');
    assert.ok(!html.includes('data-testid="CheckCircleIcon"'), 'nenhum ✓ antes de responder');
    assert.ok(!html.includes('Mui-disabled'), 'as quatro são clicáveis');
    const classes = [
      ...html.matchAll(/class="([^"]*MuiButton-root[^"]*)"[^>]*aria-label="Opção /g),
    ].map((m) => m[1]);
    assert.equal(classes.length, ASSERTION.options.length, 'as quatro estão lá');
    assert.equal(new Set(classes).size, 1, 'nada distingue uma alternativa das outras');
  });

  it('o VEREDITO cai na pílula certa — o ✓ segue o TEXTO, não a posição', () => {
    // O aluno marca a alternativa ORIGINAL 1 (errada, porque answerIndex é 0).
    const quiz: QuizState = { answered: true, selected: 1, correct: false };
    const html = renderCard(ASSERTION, quiz);
    const pills = pillsOnScreen(html);
    const order = quizOptionOrder(KEY, 0, ASSERTION.options.length);
    // A pílula que carrega o texto da alternativa CORRETA é a única com ✓.
    const displayDaCerta = order.indexOf(ASSERTION.answerIndex);
    assert.equal(
      pills[displayDaCerta].option,
      ASSERTION.options[ASSERTION.answerIndex],
      'a pílula esperada carrega o texto da alternativa correta',
    );
    // Recorta cada <button> e confere QUAL deles ganhou o ✓ e qual ganhou o ✗.
    const botoes = html.split('<button').slice(1);
    const comCheck = botoes.findIndex(
      (b) => b.includes('data-testid="CheckCircleIcon"') && b.includes('aria-label="Opção '),
    );
    const comCancel = botoes.findIndex(
      (b) => b.includes('data-testid="CancelIcon"') && b.includes('aria-label="Opção '),
    );
    assert.equal(comCheck, displayDaCerta, 'o ✓ está na pílula da alternativa correta');
    assert.equal(comCancel, order.indexOf(1), 'o ✗ está na pílula que o aluno marcou');
  });

  it('a fonte do card não voltou a ler answerIndex fora do submit', () => {
    const src = readFileSync(resolve(HERE, '../src/views/LessonView/LessonQuiz.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    assert.ok(!src.includes('assertion.answerIndex'), 'a decisão visual vem de optionVisualState');
    const offenders = src
      .split('\n')
      .filter((l) => l.includes('answerIndex'))
      .filter((l) => !l.includes('onSelect'));
    assert.deepEqual(offenders, [], 'answerIndex fora do onSelect no código do card');
  });
});
