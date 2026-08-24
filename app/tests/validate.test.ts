/**
 * tests/validate.test.ts — validações puras de entrada da UI.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateSubject, isNonEmpty } from '../src/lib/validate';

describe('validateSubject', () => {
  it('vazio / só espaços é inválido', () => {
    assert.equal(validateSubject('').ok, false);
    assert.equal(validateSubject('   ').ok, false);
  });
  it('trim: espaço nas bordas é ignorado', () => {
    assert.equal(validateSubject('  filas em C  ').ok, true);
  });
  it('limite de 200 caracteres', () => {
    assert.equal(validateSubject('a'.repeat(200)).ok, true);
    assert.equal(validateSubject('a'.repeat(201)).ok, false);
    const long = validateSubject('a'.repeat(300));
    assert.equal(long.ok, false);
    assert.match(long.message ?? '', /máximo 200/);
  });
  it('assunto válido não tem message', () => {
    assert.equal(validateSubject('recursão').message, undefined);
  });
});

describe('isNonEmpty', () => {
  it('apenas conteúdo não vazio', () => {
    assert.equal(isNonEmpty('sk-test'), true);
    assert.equal(isNonEmpty(''), false);
    assert.equal(isNonEmpty('   '), false);
  });
});