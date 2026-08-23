/**
 * tests/validationMessages.test.ts — mapeamento de ValidationResult para pt-BR.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  humanizeValidationError,
  validationUiFromResult,
} from '../src/lib/validationMessages';

describe('validationUiFromResult', () => {
  it('isValid true -> estado valid', () => {
    const ui = validationUiFromResult({
      isValid: true,
      provider: 'deepseek',
      checkedAt: new Date().toISOString(),
    });
    assert.equal(ui.state, 'valid');
    assert.match(ui.message, /sucesso/);
  });
  it('isValid false -> estado invalid com erro humanizado', () => {
    const ui = validationUiFromResult({
      isValid: false,
      provider: 'brave',
      errorMessage: '401 Unauthorized',
      checkedAt: new Date().toISOString(),
    });
    assert.equal(ui.state, 'invalid');
    assert.match(ui.message, /Chave inválida/);
  });
  it('sem errorMessage -> mensagem genérica', () => {
    const ui = validationUiFromResult({
      isValid: false,
      provider: 'deepseek',
      checkedAt: new Date().toISOString(),
    });
    assert.equal(ui.state, 'invalid');
    assert.match(ui.message, /deepseek/);
  });
});

describe('humanizeValidationError', () => {
  it('401 / unauthorized -> chave inválida', () => {
    assert.match(humanizeValidationError('401 Unauthorized', 'deepseek'), /Chave inválida/);
    assert.match(humanizeValidationError('invalid api key', 'deepseek'), /Chave inválida/);
  });
  it('429 / rate limit -> limite de requisições', () => {
    assert.match(humanizeValidationError('429 Too Many Requests', 'deepseek'), /Limite/);
  });
  it('erro genérico mantém a mensagem bruta', () => {
    assert.match(
      humanizeValidationError('weird error xyz', 'deepseek'),
      /weird error xyz/,
    );
  });
  it('empty string -> genérico com provider', () => {
    assert.match(humanizeValidationError('', 'brave'), /brave/);
    assert.match(humanizeValidationError(undefined, 'deepseek'), /deepseek/);
  });
});