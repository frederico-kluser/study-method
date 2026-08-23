/**
 * tests/validationAlert.test.ts — lógica pura do ALERT de validação de chaves
 * (onda 7, MUI SettingsView). Sem jsdom. Cobre o mapeamento MESMO do KeysPanel
 * antigo: 401→error401, 429→error429, rede→errorNetwork, resto→invalid,
 * válido→valid. Extraída em src/lib/validationAlert.ts para ser testável.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ValidationResult } from '../shared/ipc-contract';
import {
  classifyValidationError,
  validationAlert,
  type ValidationI18nKey,
} from '../src/lib/validationAlert';

function result(errorMessage?: string, isValid = false): ValidationResult {
  return {
    isValid,
    provider: 'deepseek',
    errorMessage,
    checkedAt: new Date().toISOString(),
  };
}

describe('classifyValidationError — buckets de tradução', () => {
  it('401/unauthorized → "401"', () => {
    assert.equal(classifyValidationError('HTTP 401 Unauthorized'), '401');
    assert.equal(classifyValidationError('unauthorized: invalid api key'), '401');
  });

  it('429/rate-limit → "429"', () => {
    assert.equal(classifyValidationError('HTTP 429 rate limit exceeded'), '429');
  });

  it('falha de rede → "network"', () => {
    assert.equal(classifyValidationError('network error'), 'network');
    assert.equal(classifyValidationError('fetch failed'), 'network');
  });

  it('qualquer outra/ausente → "other"', () => {
    assert.equal(classifyValidationError('Something unexpected'), 'other');
    assert.equal(classifyValidationError(''), 'other');
    assert.equal(classifyValidationError(undefined), 'other');
  });
});

describe('validationAlert — mapeia ValidationResult para chave i18n', () => {
  it('válido → success/translation:keys.valid', () => {
    const a = validationAlert(result(undefined, true));
    assert.equal(a.severity, 'success');
    assert.equal(a.i18nKey, 'translation:keys.valid');
  });

  it('401 → error/translation:keys.error401', () => {
    const a = validationAlert(result('401 unauthorized'));
    assert.equal(a.severity, 'error');
    assert.equal(a.i18nKey, 'translation:keys.error401');
  });

  it('429 → error/translation:keys.error429', () => {
    const a = validationAlert(result('too many requests 429'));
    assert.equal(a.severity, 'error');
    assert.equal(a.i18nKey, 'translation:keys.error429');
  });

  it('rede → error/translation:keys.errorNetwork', () => {
    const a = validationAlert(result('timeout'));
    assert.equal(a.severity, 'error');
    assert.equal(a.i18nKey, 'translation:keys.errorNetwork');
  });

  it('outro → error/translation:keys.invalid', () => {
    const a = validationAlert(result('nope'));
    assert.equal(a.severity, 'error');
    assert.equal(a.i18nKey, 'translation:keys.invalid');
  });
});

describe('validationAlert — chaves retornadas existem nos resources', () => {
  it('todas as i18nKey devolvidas estão sob translation:keys.* e são literais válidas', () => {
    const known: ValidationI18nKey[] = [
      'translation:keys.valid',
      'translation:keys.invalid',
      'translation:keys.error401',
      'translation:keys.error429',
      'translation:keys.errorNetwork',
    ];
    // Exercita todos os caminhos e garante que o resultado cai num literal conhecido.
    const samples = [
      result(undefined, true),
      result('401'),
      result('429'),
      result('network'),
      result('outro caso'),
    ].map((r) => validationAlert(r).i18nKey);
    for (const key of samples) {
      assert.ok(known.includes(key), `chave inesperada: ${key}`);
    }
  });
});