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
 * identidade do modelo atual é redeclarada aqui: este arquivo só REEXPORTA o
 * contrato. Não há mais literais de provedor legado neste arquivo — o único
 * lugar que ainda LÊ os nomes antigos é o fallback explícito e comentado de
 * `services/piAuthBridge.ts`.
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
