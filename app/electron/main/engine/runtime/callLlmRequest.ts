/**
 * app/electron/main/engine/runtime/callLlmRequest.ts — MONTAGEM DE REQUISIÇÃO
 * do transporte único de LLM: validação da entrada, mensagens, o body que vai
 * ao cliente e a ENTRADA da chave de cache.
 *
 * EXTRAÍDO de `runtime/callLlmTransport.ts` na refatoração L06 (arquivo ≤500
 * linhas, CC≤8; comportamento observável preservado). Funções PURAS sobre a
 * requisição — nenhum efeito, nenhum estado.
 */

import {
  OPENROUTER_MAX_EFFORT,
  type OpenRouterEffort,
} from '@shared/llm/constants';
import type { LlmChatMessage } from '../../services/llmClient';
import type { LlmCacheKeyInput } from './llmCache';
import type { EngineChatRequest, LlmCallRequest } from './callLlmTypes';

/** O erro de validação da requisição, ou null quando está válida. */
export function validateRequest(req: LlmCallRequest): string | null {
  if (!req.prompt || req.prompt.trim().length === 0) {
    return 'prompt vazio — sem mensagem não há chamada';
  }
  if (!req.stageVersion || req.stageVersion.trim().length === 0) {
    return 'stageVersion vazio — o cache precisa de identidade de etapa';
  }
  if (!Number.isInteger(req.timeoutMs) || req.timeoutMs < 1) {
    return `timeoutMs inválido (${req.timeoutMs}) — obrigatório por etapa, inteiro ≥ 1`;
  }
  return null;
}

export function buildMessages(req: LlmCallRequest): LlmChatMessage[] {
  const messages: LlmChatMessage[] = [];
  if (req.system && req.system.trim().length > 0) {
    messages.push({ role: 'system', content: req.system });
  }
  messages.push({ role: 'user', content: req.prompt });
  return messages;
}

/**
 * A requisição que vai ao cliente. `reasoningEffort` só vai no body quando o
 * chamador pediu — a ausência é o caminho do default do cliente (`'max'`), e
 * mandar `undefined` explícito seria pedir ao cliente que adivinhasse.
 */
export function montarClientRequest(req: LlmCallRequest, modelId: string): EngineChatRequest {
  return {
    messages: buildMessages(req),
    temperature: req.temperature ?? 0,
    ...(req.maxTokens !== undefined ? { maxTokens: req.maxTokens } : {}),
    ...(req.reasoningEffort !== undefined ? { reasoningEffort: req.reasoningEffort } : {}),
    model: modelId,
    timeoutMs: req.timeoutMs,
  };
}

/**
 * Cache: chave = sha256(prompt + system + schema + params + model_id +
 * stage_version). O system é enviado ao provedor por buildMessages, logo
 * entra na chave — duas entradas com system diferente NÃO compartilham
 * artefato. Parâmetros de geração (temperatura/maxTokens/reasoningEffort)
 * entram via params: mesmo prompt com knobs diferentes NÃO compartilha
 * artefato. O effort é REPRODUTIBILIDADE, não otimização — dois runs com
 * esforços diferentes pensam diferente e não podem colidir no mesmo
 * arquivo de cache. O esforço EFETIVO é o que entra: `reasoningEffort:
 * 'max'` explícito e omissão produzem a MESMA requisição, logo o MESMO
 * artefato.
 */
export function montarKeyInput(
  req: LlmCallRequest,
  modelId: string,
  effectiveEffort: OpenRouterEffort,
): LlmCacheKeyInput {
  return {
    prompt: req.prompt,
    system: req.system,
    schema: req.schema,
    params: {
      ...(req.params ?? {}),
      temperature: req.temperature ?? 0,
      ...(req.maxTokens !== undefined ? { maxTokens: req.maxTokens } : {}),
      reasoningEffort: effectiveEffort,
    },
    modelId,
    stageVersion: req.stageVersion,
  };
}

/**
 * O esforço EFETIVO da chamada: o que o chamador pediu ou, na ausência, o que
 * o cliente vai aplicar (`OPENROUTER_MAX_EFFORT`). É esse valor — não
 * `undefined` — que entra na chave de cache (`montarKeyInput`).
 */
export function esforcoEfetivo(req: LlmCallRequest): OpenRouterEffort {
  return req.reasoningEffort ?? OPENROUTER_MAX_EFFORT;
}
