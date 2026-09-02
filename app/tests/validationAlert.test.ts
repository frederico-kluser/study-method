/**
 * tests/validationAlert.test.ts — lógica pura do ALERT de validação de chaves
 * (onda 7, MUI SettingsView). Sem jsdom. Cobre o mapeamento MESMO do KeysPanel
 * antigo: 401→error401, 429→error429, rede→errorNetwork, resto→invalid,
 * válido→valid. Extraída em src/lib/validationAlert.ts para ser testável.
 *
 * ONDA 1 (OpenRouter): soma o bucket 402→error402 (conta sem crédito, com a
 * chave VÁLIDA — a falha mais comum do OpenRouter) e trava que toda i18n-key
 * devolvida existe DE VERDADE nos dois locales.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ValidationResult } from '../shared/ipc-contract';
import ptBR from '../src/i18n/locales/pt-BR/translation.json';
import en from '../src/i18n/locales/en/translation.json';
import {
  classifyValidationError,
  validationAlert,
  type ValidationI18nKey,
} from '../src/lib/validationAlert';

function result(errorMessage?: string, isValid = false): ValidationResult {
  return {
    isValid,
    // 'openrouter' — o provedor real depois da migração (a union de
    // `provider` no ipc-contract já o aceita, fase EXPAND).
    provider: 'openrouter',
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

  it('402/sem crédito → "402" (chave válida, conta zerada)', () => {
    assert.equal(classifyValidationError('HTTP 402 Payment Required'), '402');
    assert.equal(classifyValidationError('Insufficient credits'), '402');
    assert.equal(classifyValidationError('402'), '402');
  });

  it('429 que cita crédito/cota continua "429" (ordem dos buckets)', () => {
    // Rate-limit vem ANTES de 402: o que o usuário precisa é esperar, não pagar.
    assert.equal(classifyValidationError('429 credit quota rate limit'), '429');
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

  it('402 → error/translation:keys.error402', () => {
    const a = validationAlert(result('402 payment required: insufficient credits'));
    assert.equal(a.severity, 'error');
    assert.equal(a.i18nKey, 'translation:keys.error402');
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
      'translation:keys.error402',
      'translation:keys.error429',
      'translation:keys.errorNetwork',
    ];
    // Exercita todos os caminhos e garante que o resultado cai num literal conhecido.
    const samples = [
      result(undefined, true),
      result('401'),
      result('402'),
      result('429'),
      result('network'),
      result('outro caso'),
    ].map((r) => validationAlert(r).i18nKey);
    for (const key of samples) {
      assert.ok(known.includes(key), `chave inesperada: ${key}`);
    }
  });

  it('toda chave devolvida EXISTE (não-vazia) em pt-BR e em en', () => {
    // O teste acima só compara com uma lista escrita à mão: se a chave nova
    // (error402) não estivesse nos JSONs, o Alert renderizaria a KEY CRUA.
    const samples = [
      result(undefined, true),
      result('401'),
      result('402'),
      result('429'),
      result('network'),
      result('outro caso'),
    ].map((r) => validationAlert(r).i18nKey);
    const bundles: Array<[string, Record<string, unknown>]> = [
      ['pt-BR', ptBR.keys as unknown as Record<string, unknown>],
      ['en', en.keys as unknown as Record<string, unknown>],
    ];
    for (const full of samples) {
      const leaf = full.replace('translation:keys.', '');
      for (const [lng, keys] of bundles) {
        const value = keys[leaf];
        assert.equal(typeof value, 'string', `${lng}: keys.${leaf} deve existir`);
        assert.ok((value as string).trim().length > 0, `${lng}: keys.${leaf} não pode ser vazia`);
      }
    }
  });
});