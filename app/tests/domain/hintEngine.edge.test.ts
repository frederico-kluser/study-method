/**
 * tests/domain/hintEngine.edge.test.ts — TESTES DE BORDA do motor de hints
 * (electron/main/domain/hintEngine.ts), complemento do hintEngine.test.ts.
 *
 * Cobre o que a suíte básica não pina: nextHint com hints PARCIAIS (menos de 3),
 * buildBreakPlan com body vazio (garante contrato de 2+ sub-aulas), e
 * breakDueToHint com extremos (negativos, NaN, fracionários).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { nextHint, buildBreakPlan, breakDueToHint, HINT_STRATEGY } from '../../electron/main/domain/hintEngine';

describe('nextHint — hints parciais (menos de MAX_HINTS)', () => {
  it('1 hint disponível: position 0 devolve hint; position 1+ quebra (não há dica)', () => {
    const hints = ['dica unica'];
    assert.deepEqual(nextHint(0, hints), { kind: 'hint', hint: 'dica unica' });
    assert.deepEqual(nextHint(1, hints), { kind: 'break', reason: 'hint-4th' });
    assert.deepEqual(nextHint(2, hints), { kind: 'break', reason: 'hint-4th' });
  });

  it('2 hints disponíveis: position 0 e 1 devolvem hint; position 2 quebra', () => {
    const hints = ['a', 'b'];
    assert.deepEqual(nextHint(0, hints), { kind: 'hint', hint: 'a' });
    assert.deepEqual(nextHint(1, hints), { kind: 'hint', hint: 'b' });
    assert.deepEqual(nextHint(2, hints), { kind: 'break', reason: 'hint-4th' });
  });

  it('hint vazio na posição pedida → quebra (string vazia é tratada como ausente)', () => {
    assert.deepEqual(nextHint(0, ['']), { kind: 'break', reason: 'hint-4th' });
  });

  it('hintsUsed negativo/fracionário → floor e nunca abaixo de 0', () => {
    // used = floor(-1) = -1 → Math.max(0, -1) = 0 → position 0.
    assert.deepEqual(nextHint(-1, ['dica']), { kind: 'hint', hint: 'dica' });
    // used = floor(0.9) = 0 → position 0.
    assert.deepEqual(nextHint(0.9, ['dica']), { kind: 'hint', hint: 'dica' });
  });
});

describe('buildBreakPlan — body vazio / degenerado', () => {
  it('body vazio ainda gera 2+ sub-aulas (contrato) com bodySubset vazio', () => {
    const plan = buildBreakPlan({
      lessonTitle: 'Recursão',
      lessonBody: '',
      question: 'q',
      challenge: 'challenge',
      whatTheyDidntUnderstand: 'x',
    });
    assert.ok(plan.subLessons.length >= 2, `esperado >= 2, veio ${plan.subLessons.length}`);
    for (const sub of plan.subLessons) {
      assert.ok(sub.title.trim().length > 0, 'título sempre não-vazio');
      assert.ok(sub.keyIdea.trim().length > 0, 'keyIdea sempre não-vazio');
    }
    // 1ª sub-aula usa a confusão como ideia-chave.
    assert.match(plan.subLessons[0].keyIdea, /x/);
    // Com body vazio, os bodySubset são vazios (o orquestrador preenche via LLM).
    assert.equal(plan.subLessons[0].bodySubset, '');
  });

  it('lessonTitle vazio → usa fallback "Aula" no título e na keyIdea default', () => {
    const plan = buildBreakPlan({
      lessonTitle: '   ',
      lessonBody: 'p1',
      question: '',
      challenge: '',
      whatTheyDidntUnderstand: '',
    });
    assert.equal(plan.subLessons[0].title, 'Aula — fundamentos');
    assert.match(plan.subLessons[0].keyIdea, /aula/i);
  });

  it('body de 1 parágrafo → acrescenta "prática guiada" para fechar 2', () => {
    const plan = buildBreakPlan({
      lessonTitle: 'T',
      lessonBody: 'Só um parágrafo.',
      question: '',
      challenge: '',
      whatTheyDidntUnderstand: 'y',
    });
    assert.equal(plan.subLessons.length, 2);
    assert.match(plan.subLessons[1].title, /prática/i);
  });
});

describe('breakDueToHint — extremos', () => {
  it('negativos → false (nunca quebra com valores negativos)', () => {
    assert.equal(breakDueToHint({ hintsUsed: -5, breakEvents: -1 }), false);
    assert.equal(breakDueToHint({ hintsUsed: -1, breakEvents: 0 }), false);
  });

  it('NaN → false (Math.max(0, floor(NaN)) = NaN, e NaN >= 3 é false)', () => {
    assert.equal(breakDueToHint({ hintsUsed: NaN, breakEvents: NaN }), false);
    assert.equal(breakDueToHint({ hintsUsed: NaN, breakEvents: 0 }), false);
  });

  it('fracionários → floor (2.9 vira 2 → false; 3.0 → true)', () => {
    assert.equal(breakDueToHint({ hintsUsed: 2.9, breakEvents: 0 }), false);
    assert.equal(breakDueToHint({ hintsUsed: 3.0, breakEvents: 0 }), true);
  });

  it('exatamente no limite: hintsUsed == MAX_HINTS-1 false; == MAX_HINTS true', () => {
    assert.equal(breakDueToHint({ hintsUsed: HINT_STRATEGY.MAX_HINTS - 1, breakEvents: 0 }), false);
    assert.equal(breakDueToHint({ hintsUsed: HINT_STRATEGY.MAX_HINTS, breakEvents: 0 }), true);
  });
});
