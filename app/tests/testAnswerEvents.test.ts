/**
 * tests/testAnswerEvents.test.ts — `mapTestAnswerPhase`: deriva a fase do evento
 * `test-answer-event` que o main pusha (contrato `phase`), tolerando `type`
 * por compatibilidade e retornando `null` para qualquer outra forma.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mapTestAnswerPhase } from '../src/lib/testAnswerEvents';

describe('mapTestAnswerPhase', () => {
  it('mapeia `phase: "started"` → started (contrato canônico)', () => {
    assert.equal(mapTestAnswerPhase({ phase: 'started', challengeDir: '/x' }), 'started');
  });

  it('mapeia `phase: "done"` → done (contrato canônico)', () => {
    assert.equal(mapTestAnswerPhase({ phase: 'done', challengeDir: '/x' }), 'done');
  });

  it('tolerates o antigo `type` por compatibilidade com main/produtores antigos', () => {
    assert.equal(mapTestAnswerPhase({ type: 'started', challengeDir: '/x' }), 'started');
    assert.equal(mapTestAnswerPhase({ type: 'done', challengeDir: '/x' }), 'done');
  });

  it('retorna null para fase desconhecida, ausente ou shape inválido (garbage)', () => {
    assert.equal(mapTestAnswerPhase({ phase: 'paused' }), null);
    assert.equal(mapTestAnswerPhase({ phase: '' }), null);
    assert.equal(mapTestAnswerPhase({}), null);
    assert.equal(mapTestAnswerPhase(null), null);
    assert.equal(mapTestAnswerPhase(undefined), null);
    assert.equal(mapTestAnswerPhase('started'), null); // string crua não é objeto
    assert.equal(mapTestAnswerPhase(42), null);
  });

  it('`phase` tem precedência sobre `type` quando ambos presentes', () => {
    assert.equal(mapTestAnswerPhase({ phase: 'done', type: 'started' }), 'done');
  });
});