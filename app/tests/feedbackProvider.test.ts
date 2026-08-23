/**
 * tests/feedbackProvider.test.ts — resolveFeedbackProvider (função pura).
 *
 * O modelo local SÓ avalia o feedback quando o usuário selecionou 'local' nas
 * Configurações E há um modelo local ativo; qualquer outro caso cai para o
 * DeepSeek (comportamento histórico / default seguro).
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

  it('defaultModelProvider=local mas SEM modelo ativo → deepseek', () => {
    assert.equal(
      resolveFeedbackProvider({ defaultModelProvider: 'local', activeLocalModelId: null }),
      'deepseek',
    );
    assert.equal(
      resolveFeedbackProvider({ defaultModelProvider: 'local', activeLocalModelId: '   ' }),
      'deepseek',
    );
  });

  it('defaultModelProvider ausente (nunca salvo) → deepseek mesmo com modelo ativo', () => {
    assert.equal(
      resolveFeedbackProvider({ defaultModelProvider: undefined, activeLocalModelId: 'LiquidAI/LFM2.5-8B-A1B-GGUF:Q4_K_M' }),
      'deepseek',
    );
  });

  it('defaultModelProvider=deepseek explícito → deepseek (mesmo com modelo ativo)', () => {
    assert.equal(
      resolveFeedbackProvider({ defaultModelProvider: 'deepseek', activeLocalModelId: 'LiquidAI/LFM2.5-8B-A1B-GGUF:Q4_K_M' }),
      'deepseek',
    );
  });
});