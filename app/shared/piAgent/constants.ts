/**
 * shared/piAgent/constants.ts — constantes internas da integração com o
 * Pi Coding Agent (main process).
 *
 * Os CANAIS IPC não são declarados aqui: eles já estão CONGELADOS em
 * shared/ipc-contract.ts (PI_CHANNELS / KEYS_CHANNELS). Este arquivo só carrega
 * os defaults de execução e os literais de modelo/provider usados pelos
 * serviços da onda1-pi.
 */

/** Defaults de execução do Pi agent. */
export const PI_DEFAULTS = {
  /** Timeout default de uma execução (ms) — 5 min. */
  timeout: 300_000,
  /** Prefixo de diretório temporário de workspace, sob os.tmpdir(). */
  tempDirPrefix: 'study-method-pi',
} as const;

/**
 * Identidade do modelo alvo (contrato da onda): DeepSeek V4 Flash 0731,
 * servido via OpenAI-compatible completions em https://api.deepseek.com.
 * O mutual-id oficial da API DeepSeek é `deepseek-v4-flash` (o checkpoint 0731
 * é servido sob este id); mantemos o literal `deepseek-v4-flash-0731` conforme
 * o contrato da onda — ver handoff para a ressalva das fontes oficiais.
 */
export const DEEPSEEK_MODEL = {
  id: 'deepseek-v4-flash-0731',
  name: 'DeepSeek V4 Flash 0731',
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com',
  contextWindow: 131072,
  maxTokens: 8192,
} as const;

/** Provider pi nativo para DeepSeek (mesmo nome no KnownProvider). */
export const DEEPSEEK_PI_PROVIDER = 'deepseek' as const;

/** Nome da variável de ambiente com a chave DeepSeek (fallback do PiAuthBridge). */
export const DEEPSEEK_ENV_KEY = 'DEEPSEEK_API_KEY' as const;