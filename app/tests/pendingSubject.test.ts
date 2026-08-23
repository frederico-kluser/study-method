/**
 * tests/pendingSubject.test.ts — estado compartilhado de assunto pré-selecionado
 * (onda 17A — Home → Aula). Sem jsdom: set/drain/peek/clear são funções puras
 * sobre a variável de módulo. Cobre o round-trip, o consumer one-shot e a
 * limpeza (reset para teste).
 */
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetPendingSubjectForTests,
  clearPendingSubject,
  drainPendingSubject,
  peekPendingSubject,
  setPendingSubject,
} from '../src/lib/pendingSubject';

beforeEach(() => {
  __resetPendingSubjectForTests();
});

describe('pendingSubject — Home → Aula', () => {
  it('começa vazio (peek/drain = null)', () => {
    assert.equal(peekPendingSubject(), null);
    assert.equal(drainPendingSubject(), null);
  });

  it('set → drain devolve o assunto e consome (one-shot)', () => {
    setPendingSubject('Inverter uma árvore binária');
    assert.equal(peekPendingSubject(), 'Inverter uma árvore binária');
    assert.equal(drainPendingSubject(), 'Inverter uma árvore binária');
    assert.equal(drainPendingSubject(), null, 'dado já foi consumido');
  });

  it('set com brancos só é consumido se houver texto (trim)', () => {
    setPendingSubject('   ');
    assert.equal(peekPendingSubject(), null);
    setPendingSubject('  Matemática  ');
    assert.equal(drainPendingSubject(), 'Matemática');
  });

  it('clear zera sem devolver', () => {
    setPendingSubject('assunto');
    clearPendingSubject();
    assert.equal(peekPendingSubject(), null);
  });

  it('sempre o último set vence', () => {
    setPendingSubject('primeiro');
    setPendingSubject('segundo');
    assert.equal(drainPendingSubject(), 'segundo');
  });
});