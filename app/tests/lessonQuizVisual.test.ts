/**
 * tests/lessonQuizVisual.test.ts — ONDA10, DEFEITO 1: o quiz ENTREGAVA a
 * resposta antes do aluno clicar.
 *
 * O QUE O CÓDIGO ANTIGO FAZIA (LessonQuiz.tsx, medido):
 *
 *     const isCorrectOption = i === assertion.answerIndex;   // sem `answered`
 *     variant={answered ? (isCorrectOption ? 'contained' : 'outlined') : 'outlined'}
 *     color={isCorrectOption ? 'success' : isWrongPick ? 'error' : 'inherit'}
 *     startIcon={isCorrectOption ? <CheckCircleIcon /> : ...}
 *
 * `variant` estava guardada por `answered`; `color` e `startIcon` NÃO. Com
 * `quiz === undefined` (nada respondido) a alternativa CERTA já saía VERDE e
 * com ✓ — a resposta na tela antes do primeiro clique.
 *
 * O QUE ESTA SUÍTE TRAVA:
 *   1. com `quiz === undefined`, o estado visual das 4 alternativas é
 *      IDÊNTICO entre si (deep-equal) e neutro — nada, em pixel nenhum,
 *      distingue a correta;
 *   2. o mesmo para um quiz existente porém `answered: false` (defensivo);
 *   3. depois de responder, o feedback aparece — certo em verde/✓, a escolha
 *      errada em vermelho/✗, todas travadas;
 *   4. a expressão ANTIGA, reproduzida aqui literalmente, VAZA — o teste
 *      documenta o bug de forma executável e prova que a diferença entre as
 *      duas lógicas é real;
 *   5. GUARDA DE FONTE: o JSX de LessonQuiz.tsx não pode voltar a enxergar
 *      `assertion.answerIndex`. Enquanto toda a decisão visual vier de
 *      `optionVisualState`, o vazamento não tem por onde retornar.
 *
 * ANTES DO CONSERTO esta suíte não passa: `optionVisualState` não existia e a
 * guarda de fonte encontra `i === assertion.answerIndex` no JSX.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  createTrackLessonState,
  optionVisualState,
  quizForSection,
  submitQuizAnswer,
  type QuizOptionVisual,
  type QuizState,
} from '../src/lib/trackLessonState';
import type { TrackAssertionDto } from '../shared/ipc-contract';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Afirmação de teste: 4 opções, a CERTA é a de índice 2. */
const ASSERTION: TrackAssertionDto = {
  id: 'a1',
  statement: 'print mostra texto na tela.',
  question: 'O que os parênteses fazem?',
  options: ['Nada', 'Somam números', 'Seguram o que vai ser mostrado', 'Fecham o programa'],
  answerIndex: 2,
  feedback: 'Os parênteses seguram o argumento da chamada.',
  sectionId: 's1',
};

const NEUTRAL: QuizOptionVisual = {
  color: 'inherit',
  variant: 'outlined',
  icon: null,
  disabled: false,
};

/** Todos os índices de opção da afirmação. */
const EVERY = ASSERTION.options.map((_, i) => i);

describe('ONDA10 defeito 1 — o quiz NÃO pode entregar a resposta antes do clique', () => {
  it('quiz === undefined: as 4 alternativas têm estado visual IDÊNTICO e neutro', () => {
    const visuals = EVERY.map((i) => optionVisualState(i, ASSERTION, undefined));
    // A invariante do dono, na forma mais forte possível: indistinguíveis.
    for (const v of visuals) {
      assert.deepEqual(
        v,
        visuals[0],
        'nenhuma alternativa pode diferir de outra antes de responder',
      );
      assert.deepEqual(v, NEUTRAL, 'o estado antes de responder é o NEUTRO');
    }
    // E, explicitamente, nada de verde nem de ✓ na alternativa correta.
    const correta = optionVisualState(ASSERTION.answerIndex, ASSERTION, undefined);
    assert.equal(correta.color, 'inherit', 'a correta NÃO pode vir verde');
    assert.equal(correta.icon, null, 'a correta NÃO pode vir com ✓');
    assert.equal(correta.variant, 'outlined', 'a correta NÃO pode vir preenchida');
    assert.equal(correta.disabled, false, 'antes de responder toda opção é clicável');
  });

  it('quiz existente porém answered:false também não distingue nada (defensivo)', () => {
    const naoRespondido: QuizState = { answered: false, selected: null, correct: null };
    const visuals = EVERY.map((i) => optionVisualState(i, ASSERTION, naoRespondido));
    for (const v of visuals) assert.deepEqual(v, NEUTRAL);
  });

  it('o estado neutro é uma CÓPIA por chamada (mutação em um card não contamina outro)', () => {
    const a = optionVisualState(0, ASSERTION, undefined);
    const b = optionVisualState(1, ASSERTION, undefined);
    assert.notEqual(a, b, 'objetos distintos');
    assert.deepEqual(a, b, 'com o mesmo conteúdo');
  });

  it('respondido CERTO: só a correta ganha verde/✓; todas travam', () => {
    const s = submitQuizAnswer(createTrackLessonState(), 's1', 2, ASSERTION.answerIndex);
    const quiz = quizForSection(s, 's1');
    const visuals = EVERY.map((i) => optionVisualState(i, ASSERTION, quiz));
    assert.deepEqual(visuals[2], {
      color: 'success',
      variant: 'contained',
      icon: 'correct',
      disabled: true,
    });
    for (const i of [0, 1, 3]) {
      assert.deepEqual(visuals[i], {
        color: 'inherit',
        variant: 'outlined',
        icon: null,
        disabled: true,
      });
    }
  });

  it('respondido ERRADO: a correta em verde/✓, a escolhida em vermelho/✗, todas travadas', () => {
    const s = submitQuizAnswer(createTrackLessonState(), 's1', 0, ASSERTION.answerIndex);
    const quiz = quizForSection(s, 's1');
    const visuals = EVERY.map((i) => optionVisualState(i, ASSERTION, quiz));
    assert.deepEqual(visuals[0], {
      color: 'error',
      variant: 'outlined',
      icon: 'wrong',
      disabled: true,
    });
    assert.deepEqual(visuals[2], {
      color: 'success',
      variant: 'contained',
      icon: 'correct',
      disabled: true,
    });
    for (const i of [1, 3]) {
      assert.equal(visuals[i].color, 'inherit');
      assert.equal(visuals[i].icon, null);
      assert.equal(visuals[i].disabled, true);
    }
  });

  it('a LÓGICA ANTIGA (reproduzida) VAZA a resposta — a nova não', () => {
    // Cópia literal do que o JSX fazia antes do conserto.
    const antigo = (i: number, quiz: QuizState | undefined) => {
      const answered = quiz?.answered === true;
      const correct = quiz?.correct === true;
      const isCorrectOption = i === ASSERTION.answerIndex; // ← sem checar `answered`
      const isWrongPick = answered && !correct && i === quiz?.selected;
      return {
        color: isCorrectOption ? 'success' : isWrongPick ? 'error' : 'inherit',
        icon: isCorrectOption ? 'correct' : isWrongPick ? 'wrong' : null,
      };
    };
    // O bug, executável: sem nenhuma resposta, a alternativa 2 já era verde/✓.
    assert.equal(antigo(2, undefined).color, 'success', 'a lógica antiga vazava a cor');
    assert.equal(antigo(2, undefined).icon, 'correct', 'a lógica antiga vazava o ícone');
    // A lógica atual, no MESMO cenário, não vaza.
    assert.equal(optionVisualState(2, ASSERTION, undefined).color, 'inherit');
    assert.equal(optionVisualState(2, ASSERTION, undefined).icon, null);
  });
});

describe('ONDA10 defeito 1 — guarda de FONTE: o JSX do card não vê answerIndex', () => {
  const file = resolve(HERE, '../src/views/LessonView/LessonQuiz.tsx');
  const src = readFileSync(file, 'utf8');
  /** Fonte sem comentários (só o código que realmente roda). */
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('não existe comparação com assertion.answerIndex no componente', () => {
    assert.ok(
      !code.includes('assertion.answerIndex'),
      'o card voltou a ler answerIndex — a decisão visual PRECISA vir de optionVisualState',
    );
  });

  it('answerIndex só aparece na assinatura do onSelect (o caminho de SUBMIT)', () => {
    const offenders = code
      .split('\n')
      .filter((l) => l.includes('answerIndex'))
      .filter((l) => !l.includes('onSelect'));
    assert.deepEqual(offenders, [], 'answerIndex fora do onSelect no código do card');
  });

  it('o card consome optionVisualState (a função pura é o único caminho visual)', () => {
    assert.ok(code.includes('optionVisualState('), 'o card deve chamar optionVisualState');
    for (const prop of ['variant={visual.variant}', 'color={visual.color}', 'disabled={visual.disabled}']) {
      assert.ok(code.includes(prop), `o Button deve receber ${prop}`);
    }
    assert.ok(code.includes("visual.icon === 'correct'"), 'o ícone deve vir de visual.icon');
  });
});
