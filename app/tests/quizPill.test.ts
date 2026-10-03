/**
 * tests/quizPill.test.ts — o CONTORNO das pílulas do quiz, sem jsdom.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O QUE ESTE ARQUIVO PROVA
 * ══════════════════════════════════════════════════════════════════════════
 * `src/lib/quizPill.ts` unifica as DUAS cópias manuais de `pillOutline`
 * (auditoria de layout §13): a fórmula
 * `color-mix(in srgb, <tinta do tema> N%, transparent)` estava escrita à mão
 * em LessonQuiz.tsx (72%) e QuizOverlayHost.tsx (55%).
 *
 *   BLOCO 1 — A FÓRMULA: a string EXATA que os dois consumidores escreviam
 *     (o CSS emitido do card continua medido em tests/lessonQuizHierarchy
 *     .test.ts — aqui mede-se a função pura que o produz).
 *   BLOCO 2 — OS VALORES NOMEADOS: `PILL_OUTLINE.card`/`overlay` são as
 *     percentagens REAIS das duas cópias (72/55), não números novos.
 *   BLOCO 3 — ENTRADA INVÁLIDA: pct fora de [0, 100] ou não finito LANÇA
 *     (falha aberta) em vez de coser `NaN%` numa fórmula normativa.
 *   BLOCO 4 — O CONSUMIDOR MIGRADO: o LessonQuiz deixou de recalcular a
 *     fórmula à mão (guarda de fonte) e o módulo não traz cor crua.
 *
 * Reprodução: `bash tools/t.sh tests/quizPill.test.ts`
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { PILL_OUTLINE, quizPillOutline, type QuizPillTheme } from '../src/lib/quizPill';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Um tema de TESTE: só o recorte que a fórmula lê (a tinta como CSS var, como
 * no tema real — `theme.vars.palette.text.primary`).
 */
const TEMA: QuizPillTheme = {
  vars: { palette: { text: { primary: 'var(--mui-palette-text-primary)' } } },
};

describe('quizPillOutline — a fórmula do contorno, uma vez só', () => {
  it('devolve a MESMA string que as duas cópias escreviam à mão', () => {
    assert.equal(
      quizPillOutline(TEMA, PILL_OUTLINE.card),
      'color-mix(in srgb, var(--mui-palette-text-primary) 72%, transparent)',
    );
    assert.equal(
      quizPillOutline(TEMA, PILL_OUTLINE.overlay),
      'color-mix(in srgb, var(--mui-palette-text-primary) 55%, transparent)',
    );
  });

  it('a tinta sai da VARIÁVEL do tema, nunca de um literal de cor', () => {
    const outroTema: QuizPillTheme = {
      vars: { palette: { text: { primary: 'var(--ink-qualquer)' } } },
    };
    assert.equal(
      quizPillOutline(outroTema, PILL_OUTLINE.card),
      'color-mix(in srgb, var(--ink-qualquer) 72%, transparent)',
      'a fórmula lê o tema — quem escolhe a tinta é o tema, não este módulo',
    );
  });

  it('a percentagem é a que o chamador pede (a fórmula não tem valores embutidos)', () => {
    for (const pct of [0, 1, 33.5, 100]) {
      assert.equal(
        quizPillOutline(TEMA, pct),
        `color-mix(in srgb, var(--mui-palette-text-primary) ${pct}%, transparent)`,
      );
    }
  });
});

describe('PILL_OUTLINE — as percentagens nomeadas das duas cópias (§13)', () => {
  it('card = 72 (LessonQuiz) e overlay = 55 (QuizOverlayHost)', () => {
    // Números EXTRAÍDOS das cópias, não escolhidos aqui: 72 é o contorno
    // reforçado das pílulas do card (tests/lessonQuizHierarchy.test.ts mede o
    // CSS emitido a 72%); 55 é o contorno do aviso do overlay.
    assert.equal(PILL_OUTLINE.card, 72);
    assert.equal(PILL_OUTLINE.overlay, 55);
    assert.notEqual(PILL_OUTLINE.card, PILL_OUTLINE.overlay, 'as duas superfícies pedem contornos diferentes');
  });
});

describe('entrada inválida — falha ABERTA, nunca NaN numa fórmula normativa', () => {
  it('pct fora de [0, 100] lança RangeError', () => {
    for (const pct of [-1, 101, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      assert.throws(
        () => quizPillOutline(TEMA, pct),
        RangeError,
        `pct ${String(pct)} não pode chegar à fórmula`,
      );
    }
  });

  it('pct não numérico lança RangeError (a string "72" não é uma percentagem)', () => {
    assert.throws(
      () => quizPillOutline(TEMA, '72' as unknown as number),
      RangeError,
    );
  });
});

describe('o consumidor migrado e a cor crua', () => {
  const CARD = readFileSync(resolve(HERE, '../src/views/LessonView/LessonQuiz.tsx'), 'utf8');
  const MODULO = readFileSync(resolve(HERE, '../src/lib/quizPill.ts'), 'utf8');

  it('LessonQuiz consome o módulo em vez de recalcular `pillOutline` à mão', () => {
    assert.ok(
      CARD.includes('quizPillOutline(theme, PILL_OUTLINE.card)'),
      'o card pede o contorno ao módulo (o valor nomeado é quem diz 72%)',
    );
    assert.ok(
      !CARD.includes('color-mix(in srgb, ${'),
      'a fórmula não pode voltar a ser escrita à mão no consumidor (§13)',
    );
  });

  it('o módulo não tem cor crua — a tinta vem do tema', () => {
    const semComentarios = MODULO.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(semComentarios), 'hex cru no módulo');
    assert.ok(!/\brgba?\(/.test(semComentarios), 'rgb()/rgba() cru no módulo');
    assert.ok(!/\balpha\(/.test(semComentarios), 'alpha() é proibido — cor com variável CSS usa color-mix');
  });
});
