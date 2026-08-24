/**
 * electron/main/services/piProviderMapper.ts — mapeamentos puros entre o
 * modelo da workflow (study-method) e o formato/objeto Model do Pi SDK
 * (v0.64.0). Funções puras (sem I/O), centralizam traduções futuras.
 *
 * O modelo alvo da onda é DeepSeek V4 Flash 0731 via OpenAI-compatible
 * completions em https://api.deepseek.com. Para provider 'deepseek' SEMPRE
 * retornamos o Model EXPLÍCITO (buildDeepSeekModelObject) — nunca deixamos o
 * SDK escolher um default, senão o modelo errado roda.
 */

import type { PiModelConfig, PiThinkingLevel } from '@shared/ipc-contract';
import { DEEPSEEK_ENV_KEY, DEEPSEEK_MODEL, DEEPSEEK_PI_PROVIDER } from '@shared/piAgent/constants';

/**
 * Formato do Model object do pi-ai v0.64.0 (openai-completions),
 * com compat OpenRouter/OpenAI-compatible opcional.
 */
export interface PiModelObject {
  id: string;
  name: string;
  api: 'openai-completions';
  provider: string;
  baseUrl: string;
  reasoning: boolean;
  input: Array<'text' | 'image'>;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  contextWindow: number;
  maxTokens: number;
  headers?: Record<string, string>;
  compat?: {
    supportsDeveloperRole?: boolean;
    supportsReasoningEffort?: boolean;
    maxTokensField?: 'max_completion_tokens' | 'max_tokens';
  } & Record<string, unknown>;
}

/**
 * provider da workflow → provider nativo do Pi SDK. 'deepseek' passa direto.
 */
export function mapWorkflowProviderToPi(provider: string): string {
  const mapping: Record<string, string> = {
    deepseek: DEEPSEEK_PI_PROVIDER,
  };
  return mapping[provider] ?? provider;
}

/** model da workflow → id no Pi SDK. Passthrough; centraliza futuras traduções. */
export function mapWorkflowModelToPi(_provider: string, model: string): string {
  return model;
}

/**
 * Monta um PiModelConfig a partir do provider/model da workflow.
 */
export function buildPiModelConfig(
  provider: string,
  model: string,
  thinkingLevel: PiThinkingLevel = 'off'
): PiModelConfig {
  return {
    provider: mapWorkflowProviderToPi(provider),
    model: mapWorkflowModelToPi(provider, model),
    thinkingLevel: thinkingLevel !== 'off' ? thinkingLevel : undefined,
  };
}

/**
 * Critério de temperatura (reproduzido do electron-huu):
 * pi coding agent roda determinístico (temperatura 0); pi-ai só repassa a
 * temperatura quando o model resolved aceita um valor não-default.
 * OpenAI-native reasoning models rejeitam temperature não-default → omitir.
 * DeepSeek (openai-completions) aceita → forçar 0.
 *
 * @param model o model resolved do pi-ai (ou null/undefined quando fora do catálogo)
 */
export function piModelSupportsTemperature(
  model: { provider?: unknown; reasoning?: unknown } | null | undefined
): boolean {
  if (!model) return true;
  const provider = typeof model.provider === 'string' ? model.provider : '';
  const isOpenAiNative =
    provider === 'openai' ||
    provider === 'openai-codex' ||
    provider === 'azure-openai-responses';
  return !(isOpenAiNative && model.reasoning === true);
}

/**
 * Model EXPLÍCITO do DeepSeek V4 Flash 0731. Usado SEMPRE para provider
 * 'deepseek' — impede o SDK de cair num default errado. A chave é injetada no
 * header Authorization.
 */
export function buildDeepSeekModelObject(apiKey: string): PiModelObject {
  return {
    id: DEEPSEEK_MODEL.id,
    name: DEEPSEEK_MODEL.name,
    api: 'openai-completions',
    provider: DEEPSEEK_PI_PROVIDER,
    baseUrl: DEEPSEEK_MODEL.baseUrl,
    reasoning: true,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: DEEPSEEK_MODEL.contextWindow,
    maxTokens: DEEPSEEK_MODEL.maxTokens,
    headers: { Authorization: `Bearer ${apiKey}` },
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: true,
      maxTokensField: 'max_tokens',
    },
  };
}

export { DEEPSEEK_ENV_KEY, DEEPSEEK_MODEL, DEEPSEEK_PI_PROVIDER };