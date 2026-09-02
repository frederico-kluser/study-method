/**
 * shared/llm/constants.ts — CONTRATO CONGELADO do provedor de LLM do app.
 *
 * Este arquivo é o ÚNICO lugar onde vivem a identidade do modelo, a política de
 * raciocínio, a política de provider e o nome da variável de ambiente da chave.
 * Nenhum outro módulo pode conter esses literais: quem precisar, importa daqui.
 *
 * PROVEDOR: OpenRouter (https://openrouter.ai/api/v1), OpenAI-compatible.
 * MODELO:   z-ai/glm-5.3-flash.
 *
 * Os números abaixo NÃO são estimativa — foram lidos da API do OpenRouter em
 * 2026-09-01 com `GET /api/v1/model/z-ai/glm-5.3-flash` (path SINGULAR) e
 * `GET /api/v1/models/z-ai/glm-5.3-flash/endpoints`:
 *
 *   context_length ........... 1.310.720 (o teto do modelo)
 *   top_provider.context_length 1.048.576 (o teto do provider servido por padrão)
 *   max_completion_tokens .... 131.072
 *   reasoning ................ { mandatory: true, default_enabled: true,
 *                                supported_efforts: ["max","high","low"],
 *                                default_effort: "max" }
 *
 * RACIOCÍNIO NO MÁXIMO. O enum global de `reasoning.effort` no OpenRouter é
 * `max | xhigh | high | medium | low | minimal | none`, mas ESTE modelo aceita
 * apenas `max | high | low`. Portanto o topo é `'max'` — `'xhigh'` seria
 * rejeitado e `'high'` seria um degrau ABAIXO do máximo. O raciocínio é
 * `mandatory: true` neste modelo: não existe caminho sem pensar.
 */

/** Identidade do modelo em uso. */
export const OPENROUTER_MODEL = {
  id: 'z-ai/glm-5.3-flash',
  name: 'GLM 5.3 Flash',
  provider: 'openrouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  /** Teto do provider servido por padrão (o do modelo é 1.310.720). */
  contextWindow: 1_048_576,
  maxTokens: 131_072,
} as const;

/**
 * Efforts que ESTE modelo aceita, do maior para o menor. Ordem é significativa:
 * `OPENROUTER_EFFORTS[0]` é o máximo possível.
 */
export const OPENROUTER_EFFORTS = ['max', 'high', 'low'] as const;
export type OpenRouterEffort = (typeof OPENROUTER_EFFORTS)[number];

/** O máximo possível — o que esta aplicação usa em TODA chamada. */
export const OPENROUTER_MAX_EFFORT: OpenRouterEffort = OPENROUTER_EFFORTS[0];

/**
 * Política de raciocínio aplicada por padrão em toda chamada de chat.
 * Vai no body como o campo `reasoning`.
 */
export const OPENROUTER_REASONING = {
  enabled: true,
  effort: OPENROUTER_MAX_EFFORT,
} as const;

/**
 * Política de provider (campo `provider` do body).
 *
 * `require_parameters: true` é o item load-bearing: sem ele o OpenRouter pode
 * rotear para um provider que IGNORA `reasoning`, e a chamada voltaria sem
 * raciocínio nenhum — silenciosamente, com HTTP 200. Com ele, só providers que
 * honram TODOS os parâmetros enviados são elegíveis.
 */
export const OPENROUTER_PROVIDER_POLICY = {
  require_parameters: true,
} as const;

/** Nome da variável de ambiente que carrega a chave. */
export const OPENROUTER_ENV_KEY = 'OPENROUTER_API_KEY' as const;

/**
 * Chave de armazenamento no settingsStore e membro das unions de provider.
 * É o nome CANÔNICO do provedor em todo o app.
 */
export const OPENROUTER_PROVIDER_KEY = 'openrouter' as const;

/* ─── NOMES LEGADOS DO PROVEDOR ANTERIOR — SOBREVIVEM DE PROPÓSITO ────────────
 * Estes dois literais são as ÚNICAS ocorrências do nome do provedor anterior no
 * código do app, e estão aqui — no contrato, num lugar só — porque três leitores
 * precisam do MESMO valor: `ipc/keys-handlers.ts` (fallback de leitura do slot),
 * `services/piAuthBridge.ts` (slot + env do caminho pi) e
 * `tools/track-engine/cli.ts` (env + slot na CLI).
 *
 * POR QUE NÃO SUMIRAM: quem instalou o app antes da troca de provedor tem a
 * chave gravada NO DISCO sob o nome antigo (e possivelmente exportada na env
 * antiga, em ambientes de dev/CI já montados). Apagar estes nomes DESLOGARIA
 * essas pessoas; removê-los de verdade exige uma MIGRAÇÃO EXPLÍCITA do arquivo
 * de settings do usuário, que é uma tarefa separada.
 *
 * REGRA: são de LEITURA e SÓ de leitura. Nada no app GRAVA neste slot (a
 * gravação vai sempre para OPENROUTER_PROVIDER_KEY e APAGA o legado no mesmo
 * passo) nem INJETA esta env (a injetada é sempre OPENROUTER_ENV_KEY).
 * ──────────────────────────────────────────────────────────────────────────── */

/** Slot LEGADO do settingsStore, lido como último recurso. Nunca escrito. */
export const LEGACY_LLM_PROVIDER_KEY = 'deepseek' as const;

/** Env var LEGADA da chave, lida como último recurso. Nunca injetada. */
export const LEGACY_LLM_ENV_KEY = 'DEEPSEEK_API_KEY' as const;

/**
 * Headers de attribution do OpenRouter. `HTTP-Referer` e `X-Title` são os
 * nomes corretos; `X-OpenRouter-App` NÃO existe.
 */
export const OPENROUTER_ATTRIBUTION_HEADERS = {
  'HTTP-Referer': 'https://github.com/ondokai/study-method',
  'X-Title': 'study-method',
} as const;

/**
 * Prefixo de uma chave do OpenRouter. Usado por validação de forma e,
 * sobretudo, pelo mascaramento de log.
 */
export const OPENROUTER_KEY_PREFIX = 'sk-or-v1-' as const;

/**
 * Regex defensiva de mascaramento de chave em logs e mensagens de erro.
 *
 * CUIDADO — ESTE É UM CONTROLE DE SEGURANÇA. A versão anterior era
 * `/(sk-[A-Za-z0-9]{6,})/gi`, que NÃO casa uma chave do OpenRouter: o formato
 * `sk-or-v1-<base64ish>` contém HÍFENS, e a classe `[A-Za-z0-9]` para no
 * primeiro hífen — o mascaramento cobriria apenas `sk-or` e o resto da chave
 * vazaria para o log. A classe abaixo inclui `-` e `_`.
 */
export const LLM_KEY_MASK_PATTERN = /(sk-[A-Za-z0-9_-]{6,})/gi;
