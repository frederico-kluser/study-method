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
 * Identidade do modelo alvo: DeepSeek V4 Flash, servido via OpenAI-compatible
 * completions em https://api.deepseek.com.
 *
 * O id foi CORRIGIDO para `deepseek-v4-flash` (VALIDADO na API real — GET
 * /models devolve exatamente {deepseek-v4-flash, deepseek-v4-pro,
 * deepseek-v4-flash-vision-exp}; POST /chat/completions com
 * `deepseek-v4-flash` devolve 200 com content não-vazio). O literal anterior
 * `deepseek-v4-flash-0731` NÃO existe e a API respondia HTTP 400
 * "invalid_request_error: The supported API model names are ... but you passed
 * deepseek-v4-flash-0731", que caía no caminho de sucesso do cliente e virava o
 * enganoso "resposta sem choices[0].message.content". Ver handoff fix15.
 */
export const DEEPSEEK_MODEL = {
  id: 'deepseek-v4-flash',
  name: 'DeepSeek V4 Flash',
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com',
  contextWindow: 131072,
  maxTokens: 8192,
} as const;

/** Provider pi nativo para DeepSeek (mesmo nome no KnownProvider). */
export const DEEPSEEK_PI_PROVIDER = 'deepseek' as const;

/** Nome da variável de ambiente com a chave DeepSeek (fallback do PiAuthBridge). */
export const DEEPSEEK_ENV_KEY = 'DEEPSEEK_API_KEY' as const;