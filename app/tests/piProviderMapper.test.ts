/**
 * tests/piProviderMapper.test.ts — funções puras do mapeamento/objeto Model.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDeepSeekModelObject,
  buildPiModelConfig,
  mapWorkflowModelToPi,
  mapWorkflowProviderToPi,
  piModelSupportsTemperature,
} from '../electron/main/services/piProviderMapper';

test('mapWorkflowProviderToPi: deepseek → deepseek; outros passam direto', () => {
  assert.equal(mapWorkflowProviderToPi('deepseek'), 'deepseek');
  assert.equal(mapWorkflowProviderToPi('anthropic'), 'anthropic');
  assert.equal(mapWorkflowProviderToPi('weird-provider'), 'weird-provider');
});

test('mapWorkflowModelToPi: passthrough', () => {
  assert.equal(mapWorkflowModelToPi('deepseek', 'deepseek-v4-flash-0731'), 'deepseek-v4-flash-0731');
  assert.equal(mapWorkflowModelToPi('openai', 'gpt-x'), 'gpt-x');
});

test('buildPiModelConfig: mapeia provider + model + thinkingLevel off → sem thinkingLevel', () => {
  const cfg = buildPiModelConfig('deepseek', 'deepseek-v4-flash-0731', 'off');
  assert.deepEqual(cfg, {
    provider: 'deepseek',
    model: 'deepseek-v4-flash-0731',
    thinkingLevel: undefined,
  });
});

test('buildPiModelConfig: thinkingLevel != off é propagado', () => {
  const cfg = buildPiModelConfig('deepseek', 'deepseek-v4-flash-0731', 'high');
  assert.equal(cfg.thinkingLevel, 'high');
});

test('buildPiModelConfig: default thinkingLevel é off (sem campo)', () => {
  const cfg = buildPiModelConfig('deepseek', 'deepseek-v4-flash-0731');
  assert.equal('thinkingLevel' in cfg && cfg.thinkingLevel === undefined, true);
});

test('piModelSupportsTemperature: deepseek (não-OpenAI-native) aceita temperatura', () => {
  assert.equal(piModelSupportsTemperature({ provider: 'deepseek', reasoning: true }), true);
  assert.equal(piModelSupportsTemperature(null), true);
  assert.equal(piModelSupportsTemperature(undefined), true);
});

test('piModelSupportsTemperature: OpenAI-native reasoning NÃO aceita temperatura', () => {
  assert.equal(piModelSupportsTemperature({ provider: 'openai', reasoning: true }), false);
  assert.equal(piModelSupportsTemperature({ provider: 'openai-codex', reasoning: true }), false);
  assert.equal(piModelSupportsTemperature({ provider: 'azure-openai-responses', reasoning: true }), false);
});

test('buildDeepSeekModelObject: campos exatos do contrato', () => {
  const model = buildDeepSeekModelObject('sk-deepseek-123');
  assert.deepEqual(model, {
    id: 'deepseek-v4-flash-0731',
    name: 'DeepSeek V4 Flash 0731',
    api: 'openai-completions',
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    reasoning: true,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 8192,
    headers: { Authorization: 'Bearer sk-deepseek-123' },
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: true,
      maxTokensField: 'max_tokens',
    },
  });
});