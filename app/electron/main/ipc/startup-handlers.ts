/**
 * electron/main/ipc/startup-handlers.ts — GATE DE INÍCIO (onda 6).
 *
 * Registra o canal `keys:startup-status` (ADITIVO ao KEYS_CHANNELS do contrato).
 * DIFERENTE do `registerKeysHandlers` (que é dono dos 4 canais keys:* originais),
 * este é um registrador SEPARADO via safeHandle — aditivo, não substitui nada.
 *
 * DECISÃO DO GATE (documentada — ver handoff):
 *   (a) Lê as duas chaves do store (getApiKey).
 *   (b) Se ALGUMA não está configurada → phase 'blocked', configured:false,
 *       valid:false — SEM chamar rede (não valida chave ausente).
 *   (c) Se AMBAS configuradas → valida AMBAS com timeout curto (~8s):
 *        - 401/403 → valid:false + error ('Invalid API key') → phase 'blocked';
 *        - 402/429/200 → valid:true;
 *        - AMBAS falharem por ERRO DE REDE → offline:true, phase 'offline'
 *          (valid:false + offline:true + errorNetwork; o renderer decide:
 *           offline → inicia com aviso, features online gateadas);
 *        - UMA válida + outra rede-falhou → NÃO é offline (a regra exige AMBAS
 *          por rede) → phase 'blocked' com a que falhou listada (erro de rede).
 *
 * `electron` (ipcMain) é importado LAZY dentro do register para os testes não
 * tocarem o runtime do Electron (mesmo padrão de keys-handlers.ts).
 */
import type { StartupStatus, ValidationResult } from '@shared/ipc-contract';
import { KEYS_CHANNELS } from '@shared/ipc-contract';
import type { SettingsStore } from '../services/settingsStore';
import {
  validateBraveKey as defaultValidateBrave,
  validateDeepseekKey as defaultValidateDeepseek,
  type DeepSeekValidationResult,
} from '../services/apiKeyValidator';
import { safeHandleMap, type IpcMainHandleLike, type IpcHandlerFn } from './safeHandle';

/** Timeout padrão da validação combinada (~8s). */
export const DEFAULT_STARTUP_VALIDATION_TIMEOUT_MS = 8000;

export interface RegisterStartupHandlersDeps {
  /** Getter do SettingsStore (lazy/DI). Default: getSettingsStore(). */
  getStore?: () => Promise<SettingsStore>;
  /** Validador DeepSeek injetável. Default: validateDeepseekKey real. */
  validateDeepseek?: typeof defaultValidateDeepseek;
  /** Validador Brave injetável. Default: validateBraveKey real. */
  validateBrave?: typeof defaultValidateBrave;
  /** Timeout da validação em ms (default 8000). 0 desliga o timeout. */
  timeoutMs?: number;
}

async function defaultGetStore(): Promise<SettingsStore> {
  const { getSettingsStore } = await import('../services/settingsStore');
  return getSettingsStore();
}

/** True quando o resultado indica erro de REDE (fetch/Timeout) em vez de chave inválida. */
export function isNetworkError(result: ValidationResult | undefined): boolean {
  const msg = (result?.errorMessage ?? '').trim();
  // Prefixo exato que os validadores usam ao capturar fetch/erro de rede, mais
  // marcadores comuns de rede como fallback robusto.
  return (
    /^Network error:/i.test(msg) ||
    /network|fetch|econn|enotfound|etimedout|failed to fetch|timed out/i.test(msg)
  );
}

/** Função PURA que decide o StartupStatus a partir da configuração + resultados. */
export function classifyStartup(opts: {
  deepseekConfigured: boolean;
  braveConfigured: boolean;
  deepseekResult?: DeepSeekValidationResult;
  braveResult?: ValidationResult;
  checkedAt: string;
}): StartupStatus {
  const { deepseekConfigured, braveConfigured, checkedAt } = opts;

  // (b) Alguma chave sem configurar → blocked, configured:false, SEM rede.
  if (!deepseekConfigured || !braveConfigured) {
    return {
      phase: 'blocked',
      deepseek: { configured: deepseekConfigured, valid: false },
      brave: { configured: braveConfigured, valid: false },
      offline: false,
      checkedAt,
    };
  }

  // (c) Ambas configuradas: os resultados existem (validados com timeout).
  const deepseekResult = opts.deepseekResult!;
  const braveResult = opts.braveResult!;

  const netD = isNetworkError(deepseekResult);
  const netB = isNetworkError(braveResult);

  // AMBAS por rede → OFFLINE (inicia com aviso; online gateado, local ok).
  if (netD && netB) {
    return {
      phase: 'offline',
      deepseek: { configured: true, valid: false, error: deepseekResult.errorMessage },
      brave: { configured: true, valid: false, error: braveResult.errorMessage },
      offline: true,
      checkedAt,
    };
  }

  const validD = deepseekResult.isValid === true;
  const validB = braveResult.isValid === true;

  // Ambas válidas → READY.
  if (validD && validB) {
    return {
      phase: 'ready',
      deepseek: { configured: true, valid: true },
      brave: { configured: true, valid: true },
      offline: false,
      checkedAt,
    };
  }

  // Restante (alguma inválida — 401/403 — OU rede parcial): BLOCKED com a que
  // falhou listada (a regra offline exige AMBAS por rede).
  return {
    phase: 'blocked',
    deepseek: {
      configured: true,
      valid: validD,
      error: validD ? undefined : deepseekResult.errorMessage,
    },
    brave: {
      configured: true,
      valid: validB,
      error: validB ? undefined : braveResult.errorMessage,
    },
    offline: false,
    checkedAt,
  };
}

/** Envolve a validação num timeout curto; timeout → resultado de erro de REDE. */
async function validateWithTimeout<T extends ValidationResult>(
  p: Promise<T>,
  ms: number,
  provider: 'deepseek' | 'brave',
  checkedAt: string,
): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) return p;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<T>([
      p,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
      }),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'timeout';
    return {
      isValid: false,
      provider,
      errorMessage: `Network error: ${message}`,
      checkedAt,
    } as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Monta o mapa canal→handler do GATE DE INÍCIO (PURA, não toca electron).
 * `getStore`/validadores/timeout são injetados para DI nos testes.
 */
export function buildStartupHandlers(
  deps: RegisterStartupHandlersDeps = {},
): Map<string, IpcHandlerFn> {
  const getStore = deps.getStore ?? defaultGetStore;
  const validateDeepseek = deps.validateDeepseek ?? defaultValidateDeepseek;
  const validateBrave = deps.validateBrave ?? defaultValidateBrave;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_STARTUP_VALIDATION_TIMEOUT_MS;

  const map: Map<string, IpcHandlerFn> = new Map();
  map.set(KEYS_CHANNELS.STARTUP_STATUS, async (): Promise<StartupStatus> => {
    const store = await getStore();
    const checkedAt = new Date().toISOString();

    const [deepseekKey, braveKey] = await Promise.all([
      store.getApiKey('deepseek'),
      store.getApiKey('brave'),
    ]);
    const deepseekConfigured = !!deepseekKey;
    const braveConfigured = !!braveKey;

    // (b) Alguma não configurada → blocked SEM rede.
    if (!deepseekConfigured || !braveConfigured) {
      return classifyStartup({ deepseekConfigured, braveConfigured, checkedAt });
    }

    // (c) Ambas configuradas → valida AMBAS (com timeout curto).
    const [deepseekResult, braveResult] = await Promise.all([
      validateWithTimeout(validateDeepseek(deepseekKey), timeoutMs, 'deepseek', checkedAt),
      validateWithTimeout(validateBrave(braveKey), timeoutMs, 'brave', checkedAt),
    ]);

    return classifyStartup({
      deepseekConfigured,
      braveConfigured,
      deepseekResult,
      braveResult,
      checkedAt,
    });
  });

  return map;
}

/**
 * Registra o canal `keys:startup-status` no ipcMain real (lazy) via safeHandle —
 * aditivo e idempotente. Chamado pelo bootstrap do main (index.ts).
 */
export function registerStartupHandlers(deps: RegisterStartupHandlersDeps = {}): void {
  const map = buildStartupHandlers(deps);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ipcMain } = require('electron') as typeof import('electron');
  safeHandleMap(ipcMain as IpcMainHandleLike, map);
}