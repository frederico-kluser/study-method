/**
 * tests/feedbackProviderUi.test.ts — feedbackProviderChipKey (mapeamento puro
 * provedor→i18n-key do Chip).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { feedbackProviderChipKey } from '../src/lib/feedbackProviderUi';

describe('feedbackProviderChipKey', () => {
  it('local → chave do provedor local', () => {
    assert.equal(feedbackProviderChipKey('local'), 'challenge.providerLocal');
  });

  it('openrouter → chave do provedor OpenRouter', () => {
    assert.equal(feedbackProviderChipKey('openrouter'), 'challenge.providerOpenrouter');
  });

  it('null (nenhum provedor decidido) → sem chip', () => {
    assert.equal(feedbackProviderChipKey(null), null);
  });
});