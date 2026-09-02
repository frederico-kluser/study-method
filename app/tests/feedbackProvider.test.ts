/**
 * tests/feedbackProvider.test.ts — resolveFeedbackProvider (função pura).
 *
 * O modelo local SÓ avalia o feedback quando o usuário selecionou 'local' nas
 * Configurações E há um modelo local ativo; qualquer outro caso cai para o
 * OpenRouter (a nuvem — default seguro).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveFeedbackProvider } from '../src/lib/feedbackProvider';

describe('resolveFeedbackProvider', () => {
  it('local ativo + defaultModelProvider=local → local', () => {
    assert.equal(
      resolveFeedbackProvider({ defaultModelProvider: 'local', activeLocalModelId: 'LiquidAI/LFM2.5-8B-A1B-GGUF:Q4_K_M' }),
      'local',
    );
  });

  it('defaultModelProvider=local mas SEM modelo ativo → openrouter', () => {
    assert.equal(
      resolveFeedbackProvider({ defaultModelProvider: 'local', activeLocalModelId: null }),
      'openrouter',
    );
    assert.equal(
      resolveFeedbackProvider({ defaultModelProvider: 'local', activeLocalModelId: '   ' }),
      'openrouter',
    );
  });

  it('defaultModelProvider ausente (nunca salvo) → openrouter mesmo com modelo ativo', () => {
    assert.equal(
      resolveFeedbackProvider({ defaultModelProvider: undefined, activeLocalModelId: 'LiquidAI/LFM2.5-8B-A1B-GGUF:Q4_K_M' }),
      'openrouter',
    );
  });

  it('defaultModelProvider=openrouter explícito → openrouter (mesmo com modelo ativo)', () => {
    assert.equal(
      resolveFeedbackProvider({ defaultModelProvider: 'openrouter', activeLocalModelId: 'LiquidAI/LFM2.5-8B-A1B-GGUF:Q4_K_M' }),
      'openrouter',
    );
  });
});