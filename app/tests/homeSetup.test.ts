/**
 * tests/homeSetup.test.ts — lógica pura da Home (onda 17A — tela guiada).
 * Sem jsdom: `homeSetupStatus`/`homeSuggestedSubjects`/`homeSuggestionsBalanced`
 * são funções puras em src/lib/homeSetup.ts. Cobre a agregação do status do
 * setup de chaves e o contrato da lista de sugestões (2-3 programação + 1-2
 * matemática, chaves i18n com namespace `translation:`).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  homeSetupStatus,
  homeSuggestedSubjects,
  homeSuggestionsBalanced,
  type HomeSetupInput,
} from '../src/lib/homeSetup';
import en from '../src/i18n/locales/en/translation.json';

type JsonRecord = Record<string, unknown>;
function valueAt(obj: JsonRecord, dotted: string): unknown {
  return dotted
    .split('.')
    .reduce<unknown>((acc, part) => (acc as JsonRecord | undefined)?.[part], obj);
}

describe('homeSetupStatus — status agregado das chaves', () => {
  it('null/indefinido (ainda carregando) conta como missing', () => {
    assert.equal(homeSetupStatus(null), 'missing');
    assert.equal(homeSetupStatus(undefined), 'missing');
  });

  it('ambas as chaves configuradas → ready', () => {
    const ok: HomeSetupInput = { llmConfigured: true, braveConfigured: true };
    assert.equal(homeSetupStatus(ok), 'ready');
  });

  it('qualquer chave faltando → missing', () => {
    assert.equal(
      homeSetupStatus({ llmConfigured: true, braveConfigured: false }),
      'missing',
    );
    assert.equal(
      homeSetupStatus({ llmConfigured: false, braveConfigured: true }),
      'missing',
    );
    assert.equal(
      homeSetupStatus({ llmConfigured: false, braveConfigured: false }),
      'missing',
    );
  });
});

describe('homeSuggestedSubjects — lista de sugestões', () => {
  it('expõe 3 programação + 2 matemática na ordem canônica', () => {
    const list = homeSuggestedSubjects();
    const domains = list.map((s) => s.domain);
    assert.equal(domains.filter((d) => d === 'programming').length, 3);
    assert.equal(domains.filter((d) => d === 'math').length, 2);
    // ordem: as de programação primeiro, depois as de matemática.
    assert.deepEqual(domains, ['programming', 'programming', 'programming', 'math', 'math']);
  });

  it('cada labelKey aponta para uma chave i18n existente com namespace translation:', () => {
    for (const s of homeSuggestedSubjects()) {
      assert.ok(s.labelKey.startsWith('translation:'), `${s.labelKey} deve ter namespace`);
      const dotted = s.labelKey.replace(/^translation:/, '');
      const v = valueAt(en as JsonRecord, dotted);
      assert.ok(typeof v === 'string' && (v as string).length > 0, `${s.labelKey} deve existir no locale en`);
    }
  });

  it('o contrato de copy está equilibrado (programação + matemática)', () => {
    assert.equal(homeSuggestionsBalanced(), true);
  });
});