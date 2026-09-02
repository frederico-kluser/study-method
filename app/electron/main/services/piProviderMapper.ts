/**
 * electron/main/services/piProviderMapper.ts — mapeamentos puros entre o
 * modelo da workflow (study-method) e o formato/objeto Model do Pi SDK
 * (v0.64.0). Funções puras (sem I/O), centralizam traduções futuras.
 *
 * O modelo alvo é `z-ai/glm-5.3-flash` servido pelo OpenRouter
 * (https://openrouter.ai/api/v1), OpenAI-compatible completions. Para provider
 * 'openrouter' SEMPRE retornamos o Model EXPLÍCITO (buildOpenRouterModelObject)
 * — nunca deixamos o SDK escolher um default, senão o modelo errado roda.
 */

import type { PiModelConfig, PiThinkingLevel } from '@shared/ipc-contract';
import {
  OPENROUTER_ATTRIBUTION_HEADERS,
  OPENROUTER_EFFORTS,
  OPENROUTER_MODEL,
  OPENROUTER_PROVIDER_POLICY,
  type OpenRouterEffort,
} from '@shared/llm/constants';
import {
  DEEPSEEK_ENV_KEY,
  DEEPSEEK_MODEL,
  DEEPSEEK_PI_PROVIDER,
  LEGACY_DEEPSEEK_PROVIDER_KEY,
  OPENROUTER_PI_PROVIDER,
} from '@shared/piAgent/constants';

/**
 * Os níveis de raciocínio que o **Pi SDK** conhece
 * (`ThinkingLevel` de @mariozechner/pi-ai v0.64.0). NÃO inclui `'off'` (o SDK
 * trata a ausência) nem `'max'` (que só existe no nosso PiThinkingLevel).
 */
export type PiSdkThinkingLevel = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

/** Ordem canônica dos níveis do SDK, do menor para o maior. */
export const PI_SDK_THINKING_LEVELS: readonly PiSdkThinkingLevel[] = [
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
] as const;

/**
 * Mapa TOTAL nível-do-SDK → `reasoning.effort` do OpenRouter.
 *
 * ESTE É O PONTO DELICADO DA MIGRAÇÃO. O enum global de `reasoning.effort` do
 * OpenRouter é `max|xhigh|high|medium|low|minimal|none`, mas o modelo alvo
 * aceita SÓ `max|high|low` (`supported_efforts` da API; ver
 * shared/llm/constants.ts). Um effort fora desses três volta HTTP 400 — e neste
 * repositório um 400 historicamente CAIU NO CAMINHO DE SUCESSO do cliente,
 * virando "resposta vazia" em vez de erro de configuração. Então nenhum valor
 * do enum pode chegar cru na API.
 *
 * O SDK aplica exatamente `reasoningEffortMap[level] ?? level` antes de montar
 * `reasoning: { effort }` (pi-ai openai-completions, thinkingFormat
 * 'openrouter'). Como este mapa é TOTAL sobre os 5 níveis do SDK, o `?? level`
 * NUNCA é alcançado: o que sai no fio está sempre em OPENROUTER_EFFORTS.
 *
 * O colapso 5→3 é deliberado: `minimal|low → low`, `medium|high → high`,
 * `xhigh → max`. Arredondar PARA CIMA nos dois níveis do meio manteria tudo em
 * `max` e apagaria a distinção pedida por quem escolheu um nível baixo.
 */
export const OPENROUTER_REASONING_EFFORT_MAP: Record<PiSdkThinkingLevel, OpenRouterEffort> = {
  minimal: 'low',
  low: 'low',
  medium: 'high',
  high: 'high',
  xhigh: 'max',
};

/**
 * `PiThinkingLevel` (7 valores, contrato IPC) → nível do **SDK** (5 valores).
 *
 * `'off'` → `undefined`: o chamador NÃO deve setar `thinkingLevel` na sessão.
 * `'max'` → `'xhigh'`: `'max'` não existe no `ThinkingLevel` do SDK e mandá-lo
 * cru é PERIGOSO — `AgentSession.setThinkingLevel` faz `_clampThinkingLevel`, e
 * um nível fora da lista conhecida cai em `availableLevels[0]`, que é `'off'`.
 * Ou seja: passar `'max'` direto ao SDK desligaria o raciocínio em silêncio,
 * exatamente o bug que esta migração existe para matar. `'xhigh'` é o topo que
 * o SDK conhece e o mapa acima o traduz para o effort `'max'` no fio.
 */
export function mapThinkingLevelToPiSdk(
  level: PiThinkingLevel | undefined
): PiSdkThinkingLevel | undefined {
  switch (level) {
    case undefined:
    case 'off':
      return undefined;
    case 'max':
    case 'xhigh':
      return 'xhigh';
    case 'high':
      return 'high';
    case 'medium':
      return 'medium';
    case 'low':
      return 'low';
    case 'minimal':
      return 'minimal';
    default: {
      // Exaustividade: se PiThinkingLevel ganhar um valor novo, isto não compila.
      const exhaustive: never = level;
      return exhaustive;
    }
  }
}

/**
 * `PiThinkingLevel` → o `reasoning.effort` que REALMENTE vai no corpo HTTP.
 *
 * É a composição `OPENROUTER_REASONING_EFFORT_MAP[mapThinkingLevelToPiSdk(l)]`,
 * ou seja, a MESMA conta que o SDK faz — declarada aqui para poder ser afirmada
 * por teste sem subir uma sessão. Resultado: sempre um de OPENROUTER_EFFORTS,
 * ou `undefined` quando o raciocínio está desligado.
 *
 *   off → (nenhum) · minimal → low · low → low · medium → high
 *   high → high    · xhigh → max   · max → max
 */
export function mapThinkingLevelToOpenRouterEffort(
  level: PiThinkingLevel | undefined
): OpenRouterEffort | undefined {
  const sdkLevel = mapThinkingLevelToPiSdk(level);
  return sdkLevel === undefined ? undefined : OPENROUTER_REASONING_EFFORT_MAP[sdkLevel];
}

/** True quando `effort` é um dos efforts que o modelo alvo aceita. */
export function isSupportedOpenRouterEffort(effort: unknown): effort is OpenRouterEffort {
  return (OPENROUTER_EFFORTS as readonly string[]).includes(effort as string);
}

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
    reasoningEffortMap?: Partial<Record<PiSdkThinkingLevel, string>>;
    openRouterRouting?: Record<string, unknown>;
  } & Record<string, unknown>;
}

/**
 * provider da workflow → provider nativo do Pi SDK.
 *
 * `'openrouter'` passa direto (é um KnownProvider do pi-ai). O legado
 * `'deepseek'` é REDIRECIONADO para 'openrouter': o endpoint antigo não é mais
 * o caminho do app, e uma request persistida com o provider velho deve rodar no
 * modelo novo em vez de apontar para um provider sem chave.
 */
export function mapWorkflowProviderToPi(provider: string): string {
  const mapping: Record<string, string> = {
    [OPENROUTER_PI_PROVIDER]: OPENROUTER_PI_PROVIDER,
    [LEGACY_DEEPSEEK_PROVIDER_KEY]: OPENROUTER_PI_PROVIDER,
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
 * OpenRouter (openai-completions) aceita mesmo com reasoning ligado → forçar 0.
 *
 * @param model o model resolved do pi-ai (ou null/undefined quando fora do catálogo)
 */
export function piModelSupportsTemperature(
  model: { provider?: unknown; reasoning?: unknown } | null | undefined
): boolean {
  if (!model) return true;
  const provider = typeof model.provider === 'string' ? model.provider : '';
  // Explícito: o provider do app é openai-COMPATIBLE, não openai-native. Ele
  // aceita temperature junto de reasoning; a regra abaixo não pode pegá-lo por
  // engano se um dia o SDK marcar reasoning:true de outro jeito.
  if (provider === OPENROUTER_PI_PROVIDER) return true;
  const isOpenAiNative =
    provider === 'openai' ||
    provider === 'openai-codex' ||
    provider === 'azure-openai-responses';
  return !(isOpenAiNative && model.reasoning === true);
}

/**
 * Model EXPLÍCITO do `z-ai/glm-5.3-flash` no OpenRouter. Usado SEMPRE para
 * provider 'openrouter' — impede o SDK de cair num default errado. A chave é
 * injetada no header Authorization.
 *
 * `compat` carrega quatro decisões load-bearing:
 *  - `supportsDeveloperRole: false` — o system prompt vai como role `system`.
 *  - `supportsReasoningEffort: true` — o effort é enviado (o modelo tem
 *    `reasoning.mandatory: true`; não existe caminho sem pensar).
 *  - `maxTokensField: 'max_tokens'` — o campo que este endpoint espera.
 *  - `reasoningEffortMap` — a tradução TOTAL para os três efforts aceitos, sem
 *    a qual `medium`/`minimal`/`xhigh` iriam crus no corpo e voltariam 400.
 *
 * `openRouterRouting` recebe OPENROUTER_PROVIDER_POLICY (`require_parameters:
 * true`): sem ela o OpenRouter pode rotear para um upstream que IGNORA
 * `reasoning`, e a resposta volta SEM raciocínio, silenciosamente, com HTTP 200.
 */
export function buildOpenRouterModelObject(apiKey: string): PiModelObject {
  return {
    id: OPENROUTER_MODEL.id,
    name: OPENROUTER_MODEL.name,
    api: 'openai-completions',
    provider: OPENROUTER_PI_PROVIDER,
    baseUrl: OPENROUTER_MODEL.baseUrl,
    reasoning: true,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: OPENROUTER_MODEL.contextWindow,
    maxTokens: OPENROUTER_MODEL.maxTokens,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...OPENROUTER_ATTRIBUTION_HEADERS,
    },
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: true,
      maxTokensField: 'max_tokens',
      reasoningEffortMap: { ...OPENROUTER_REASONING_EFFORT_MAP },
      openRouterRouting: { ...OPENROUTER_PROVIDER_POLICY },
    },
  };
}

/**
 * Reexports LEGADOS. `DEEPSEEK_*` estão CONGELADOS e não descrevem o modelo em
 * uso pelo caminho pi (ver shared/piAgent/constants.ts); ficam aqui só para não
 * quebrar a superfície do módulo antes da ONDA 2. Não existe mais um
 * `buildDeepSeekModelObject`: o único Model do caminho pi é o do OpenRouter.
 */
export { DEEPSEEK_ENV_KEY, DEEPSEEK_MODEL, DEEPSEEK_PI_PROVIDER, OPENROUTER_PI_PROVIDER };
