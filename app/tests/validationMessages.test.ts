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
      provider: 'openrouter',
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
      provider: 'openrouter',
      checkedAt: new Date().toISOString(),
    });
    assert.equal(ui.state, 'invalid');
    assert.match(ui.message, /openrouter/);
  });
});

describe('humanizeValidationError', () => {
  it('401 / unauthorized -> chave inválida', () => {
    assert.match(humanizeValidationError('401 Unauthorized', 'openrouter'), /Chave inválida/);
    assert.match(humanizeValidationError('invalid api key', 'openrouter'), /Chave inválida/);
  });
  it('429 / rate limit -> limite de requisições', () => {
    assert.match(humanizeValidationError('429 Too Many Requests', 'openrouter'), /Limite/);
  });

  it('402 / sem crédito -> créditos insuficientes (NÃO "chave inválida")', () => {
    // O OpenRouter responde 402 com a chave VÁLIDA quando a conta zera; a
    // mensagem tem de mandar adicionar crédito, não trocar a chave.
    for (const raw of ['402 Payment Required', 'Insufficient credits', 'no credits left']) {
      const msg = humanizeValidationError(raw, 'openrouter');
      assert.match(msg, /[Cc]réditos insuficientes/, `mensagem errada para "${raw}"`);
      assert.doesNotMatch(msg, /Chave inválida/, `402 não pode virar "chave inválida" ("${raw}")`);
    }
  });

  it('429 que cita cota/crédito continua sendo limite de requisições', () => {
    assert.match(humanizeValidationError('429 credit quota exceeded', 'openrouter'), /Limite/);
  });

  it("provider 'openrouter' aparece no fallback genérico", () => {
    assert.match(humanizeValidationError(undefined, 'openrouter'), /openrouter/);
  });
  it('erro genérico mantém a mensagem bruta', () => {
    assert.match(
      humanizeValidationError('weird error xyz', 'openrouter'),
      /weird error xyz/,
    );
  });
  it('empty string -> genérico com provider', () => {
    assert.match(humanizeValidationError('', 'brave'), /brave/);
    assert.match(humanizeValidationError(undefined, 'openrouter'), /openrouter/);
  });
});