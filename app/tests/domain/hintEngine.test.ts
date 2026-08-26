/**
 * tests/domain/hintEngine.test.ts — motor de HINTS + ESTOU-PERDIDO + QUEBRA
 * (onda2-desafio-hints). Domínio puro; cobre as 3 dicas, o 4º clique que quebra,
 * o botão estou-perdido, o plano de quebra e o helper breakDueToHint.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  HINT_STRATEGY,
  nextHint,
  lostButton,
  buildBreakPlan,
  breakDueToHint,
} from '../../electron/main/domain/hintEngine';

describe('HINT_STRATEGY', () => {
  it('MAX_HINTS = 3 (até 3 dicas antes da quebra)', () => {
    assert.equal(HINT_STRATEGY.MAX_HINTS, 3);
  });
});

describe('nextHint', () => {
  it('com 0 digitadas e 3 hints -> devolve o hint de position 0 (não break)', () => {
    const hints = ['dica A', 'dica B', 'dica C'];
    const res = nextHint(0, hints);
    assert.deepEqual(res, { kind: 'hint', hint: 'dica A' });
  });

  it('com 1 usada -> position 1; com 2 -> position 2', () => {
    const hints = ['dica A', 'dica B', 'dica C'];
    assert.deepEqual(nextHint(1, hints), { kind: 'hint', hint: 'dica B' });
    assert.deepEqual(nextHint(2, hints), { kind: 'hint', hint: 'dica C' });
  });

  it('com 3 usadas (4º clique) -> break hint-4th e NENHUM hint', () => {
    const hints = ['dica A', 'dica B', 'dica C'];
    const res = nextHint(3, hints);
    assert.deepEqual(res, { kind: 'break', reason: 'hint-4th' });
    assert.equal('hint' in res, false);
  });

  it('antes do 4º clique: chance consumida devolve hint, nunca break', () => {
    for (let used = 0; used < HINT_STRATEGY.MAX_HINTS; used++) {
      const res = nextHint(used, ['a', 'b', 'c']);
      assert.equal(res.kind, 'hint');
    }
  });

  it('com hints vazios mas 3 usadas -> break (não tem mais o que dar)', () => {
    assert.deepEqual(nextHint(3, []), { kind: 'break', reason: 'hint-4th' });
  });

  it('com hints vazios mas abaixo do limite -> break (não há dica na posição)', () => {
    // Posição 0 não existe na lista → não há o que dar → quebra.
    assert.deepEqual(nextHint(0, []), { kind: 'break', reason: 'hint-4th' });
  });
});

describe('lostButton', () => {
  it('-> break lost-manual, mesmo efeito do 4º clique', () => {
    assert.deepEqual(lostButton(), { kind: 'break', reason: 'lost-manual' });
  });
});

describe('buildBreakPlan', () => {
  const lessonBody = [
    'Primeiro parágrafo: o que é recursão e o caso base.',
    'Segundo parágrafo: como a pilha de chamadas se comporta na recursão.',
  ].join('\n\n');

  it('retorna >= 2 sub-aulas, cada uma com título e bodySubset não vazios', () => {
    const plan = buildBreakPlan({
      lessonTitle: 'Recursão',
      lessonBody,
      question: 'O que o aluno está respondendo?',
      challenge: 'Fatorial',
      whatTheyDidntUnderstand: 'não entendi o caso base',
    });

    assert.ok(plan.subLessons.length >= 2, `esperado >= 2, veio ${plan.subLessons.length}`);
    for (const sub of plan.subLessons) {
      assert.ok(sub.title.trim().length > 0, 'título não pode ser vazio');
      assert.ok(sub.bodySubset.trim().length > 0, 'bodySubset não pode ser vazio');
      assert.ok(sub.keyIdea.trim().length > 0, 'keyIdea não pode ser vazio');
    }
  });

  it('a primeira sub-aula cobre a ideia-chave que ele não entendeu', () => {
    const plan = buildBreakPlan({
      lessonTitle: 'Recursão',
      lessonBody,
      question: 'Pergunta',
      challenge: 'Fatorial',
      whatTheyDidntUnderstand: 'não entendi o caso base',
    });

    const first = plan.subLessons[0];
    assert.match(first.keyIdea, /caso base/i);
    // Primeiro parágrafo do corpo cobre essa ideia.
    assert.match(first.bodySubset, /caso base/i);
  });

  it('distribui os parágrafos do corpo de forma determinística', () => {
    const planA = buildBreakPlan({
      lessonTitle: 'Recursão',
      lessonBody,
      question: 'Pergunta',
      challenge: 'Fatorial',
      whatTheyDidntUnderstand: 'pilha',
    });
    const planB = buildBreakPlan({
      lessonTitle: 'Recursão',
      lessonBody,
      question: 'Pergunta',
      challenge: 'Fatorial',
      whatTheyDidntUnderstand: 'pilha',
    });
    assert.deepEqual(planA, planB, 'mesma entrada -> mesma saída');
    assert.equal(planA.subLessons.length, 2);
    assert.match(planA.subLessons[1].bodySubset, /pilha de chamadas/i);
  });

  it('corpo com 1 parágrafo ainda gera 2 sub-aulas (prática guiada)', () => {
    const plan = buildBreakPlan({
      lessonTitle: 'Recursão',
      lessonBody: 'Só um parágrafo explicando a base do tema.',
      question: 'Pergunta',
      challenge: 'Fatorial',
      whatTheyDidntUnderstand: 'tudo',
    });
    assert.ok(plan.subLessons.length >= 2, `esperado >= 2, veio ${plan.subLessons.length}`);
    assert.match(plan.subLessons[0].title, /fundamentos/i);
    assert.match(plan.subLessons[1].title, /prática/i);
  });

  it('sem confusão, usa o desafio (fallback) como ideia-chave da 1ª sub-aula', () => {
    const plan = buildBreakPlan({
      lessonTitle: 'Recursão',
      lessonBody,
      question: 'Pergunta',
      challenge: 'Fatorial',
      whatTheyDidntUnderstand: '   ',
    });
    assert.match(plan.subLessons[0].keyIdea, /fatorial/i);
  });
});

describe('breakDueToHint', () => {
  it('true quando hints_consumed >= 3', () => {
    assert.equal(breakDueToHint({ hintsUsed: 3, breakEvents: 0 }), true);
    assert.equal(breakDueToHint({ hintsUsed: 5, breakEvents: 0 }), true);
  });

  it('true quando breakEvents >= 1', () => {
    assert.equal(breakDueToHint({ hintsUsed: 0, breakEvents: 1 }), true);
    assert.equal(breakDueToHint({ hintsUsed: 2, breakEvents: 3 }), true);
  });

  it('false quando hints_consumed < 3 e nenhum break event', () => {
    assert.equal(breakDueToHint({ hintsUsed: 0, breakEvents: 0 }), false);
    assert.equal(breakDueToHint({ hintsUsed: 2, breakEvents: 0 }), false);
  });
});
