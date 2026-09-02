/**
 * shared/piAgent/constants.ts — constantes internas da integração com o
 * Pi Coding Agent (main process).
 *
 * Os CANAIS IPC não são declarados aqui: eles já estão CONGELADOS em
 * shared/ipc-contract.ts (PI_CHANNELS / KEYS_CHANNELS). Este arquivo só carrega
 * os defaults de execução e os literais de provider usados pelos serviços do
 * caminho pi.
 *
 * FONTE DE VERDADE DO MODELO EM USO: `shared/llm/constants.ts`
 * (OPENROUTER_MODEL, reexportado aqui como OPENROUTER_PI_MODEL). Nenhuma
 * identidade do modelo atual é redeclarada aqui: este arquivo REEXPORTA o
 * contrato e, abaixo, guarda os literais LEGADOS de que o caminho DeepSeek
 * (ainda não migrado) precisa para não mudar de comportamento no meio da
 * migração.
 */

import { OPENROUTER_ENV_KEY, OPENROUTER_MODEL, OPENROUTER_PROVIDER_KEY } from '@shared/llm/constants';

/** Defaults de execução do Pi agent. */
export const PI_DEFAULTS = {
  /** Timeout default de uma execução (ms) — 5 min. */
  timeout: 300_000,
  /** Prefixo de diretório temporário de workspace, sob os.tmpdir(). */
  tempDirPrefix: 'study-method-pi',
} as const;

/**
 * Provider pi nativo do caminho atual: OpenRouter. É um `KnownProvider` do
 * pi-ai v0.64.0, então `setRuntimeApiKey('openrouter', ...)` e a detecção de
 * `thinkingFormat: 'openrouter'` (que manda `reasoning: { effort }` no corpo)
 * funcionam sem gambiarra.
 */
export const OPENROUTER_PI_PROVIDER = OPENROUTER_PROVIDER_KEY;

/**
 * Nome da variável de ambiente com a chave em uso. Alias de leitura do
 * contrato — nenhum literal de chave/modelo é redeclarado neste arquivo.
 */
export const OPENROUTER_PI_ENV_KEY = OPENROUTER_ENV_KEY;

/** O modelo em uso pelo caminho pi. Alias de leitura do contrato. */
export const OPENROUTER_PI_MODEL = OPENROUTER_MODEL;

/* ------------------------------------------------------------------------- *
 * LEGADO DeepSeek — CONGELADO, não é mais a fonte de verdade do modelo em uso *
 * ------------------------------------------------------------------------- */

/**
 * ESTADO NOVO E VERDADEIRO: o modelo do caminho pi é `z-ai/glm-5.3-flash`
 * servido pelo OpenRouter (PI_MODEL / OPENROUTER_MODEL acima). `DEEPSEEK_MODEL`
 * NÃO descreve mais o modelo que o app usa para o feedback de código: ele
 * sobrevive apenas CONGELADO, porque `services/deepseekClient.ts` e
 * `engine/runtime/callLlm.ts` ainda não foram migrados e usam `DEEPSEEK_MODEL.id`
 * como default. Repontá-lo para o OpenRouter aqui MUDARIA o modelo desses dois
 * caminhos de lado, sem que a migração deles tivesse sido feita — por isso o
 * valor fica exatamente como estava até que a ONDA 2 remova o símbolo.
 *
 * A LIÇÃO que originou este comentário continua valendo, e é o motivo de a
 * identidade do modelo viver num único lugar: quando o id estava ERRADO
 * (`deepseek-v4-flash-0731`, um id que não existia), a API respondia HTTP 400
 * "invalid_request_error: The supported API model names are ... but you passed
 * deepseek-v4-flash-0731" — e esse 400 CAÍA NO CAMINHO DE SUCESSO do cliente,
 * virando o enganoso "resposta sem choices[0].message.content" em vez de um
 * erro de configuração. O id atual (`deepseek-v4-flash`) foi VALIDADO na API
 * real. Um valor inválido mandado ao provider não falha alto NESTE repositório:
 * ele se disfarça de resposta vazia. Por isso todo literal que a API valida
 * (id do modelo, `reasoning.effort`) sai do contrato ou de um mapeamento TOTAL
 * e testado — nunca de uma string solta no call site. Ver handoff fix15.
 *
 * @deprecated O caminho pi usa PI_MODEL/OPENROUTER_MODEL. Some na ONDA 2.
 */
export const DEEPSEEK_MODEL = {
  id: 'deepseek-v4-flash',
  name: 'DeepSeek V4 Flash',
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com',
  contextWindow: 131072,
  maxTokens: 8192,
} as const;

/**
 * Slot LEGADO do settingsStore (`apiKeys['deepseek']`) e provider legado das
 * requests antigas. O PiAuthBridge ainda o LÊ como fallback transitório (quem
 * configurou a chave antes da migração continua com feedback funcionando) e o
 * piProviderMapper o REDIRECIONA para 'openrouter'. Nada mais o ESCREVE.
 *
 * @deprecated Use OPENROUTER_PI_PROVIDER. Some na ONDA 2.
 */
export const DEEPSEEK_PI_PROVIDER = 'deepseek' as const;

/**
 * Nome LEGADO da variável de ambiente da chave. Lido só como fallback
 * transitório pelo PiAuthBridge; a var INJETADA já é sempre OPENROUTER_API_KEY.
 *
 * @deprecated Use OPENROUTER_ENV_KEY. Some na ONDA 2.
 */
export const DEEPSEEK_ENV_KEY = 'DEEPSEEK_API_KEY' as const;

/** Nomes explícitos para o fallback transitório (mesmos valores dos acima). */
export const LEGACY_DEEPSEEK_PROVIDER_KEY = DEEPSEEK_PI_PROVIDER;
export const LEGACY_DEEPSEEK_ENV_KEY = DEEPSEEK_ENV_KEY;
