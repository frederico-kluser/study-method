/**
 * src/lib/validationAlert.ts — lógica PURA (sem React/DOM) que decide o ALERT
 * MUI de uma validação de chave de API (keys.validateDeepseek/validateBrave).
 *
 * Extraída da KeysPanel (onda 7 — MUI) para ser testável via node:test sem
 * jsdom. Mesmo mapeamento do KeysPanel antigo (error401/error429/errorNetwork),
 * mas devolve a CHAVE i18n (keys.*) + severidade para o <Alert> renderizar a
 * tradução — em vez de texto pt-BR hardcoded.
 */
import type { ValidationResult } from '../../shared/ipc-contract';

/** Severidades de Alert MUI alinhadas ao resultado. */
export type ValidationAlertSeverity = 'success' | 'error' | 'info';

/**
 * Chaves i18n sob `keys.*` retornadas pelo helper — união literal (com namespace
 * `translation:` explícito, exigido pelo strictKeyChecks; resolve em runtime via
 * defaultNS). Todas existem em pt-BR e en.
 */
export type ValidationI18nKey =
  | 'translation:keys.valid'
  | 'translation:keys.invalid'
  | 'translation:keys.error401'
  | 'translation:keys.error429'
  | 'translation:keys.errorNetwork';

export interface ValidationAlertI18n {
  severity: ValidationAlertSeverity;
  /** Chave i18n sob `keys.*` (ex.: 'keys.valid'). */
  i18nKey: ValidationI18nKey;
}

/**
 * Classifica a MENSAGEM de erro bruta do provedor num bucket de tradução.
 * O mapeamento espelha o comportamento do KeysPanel/LocalAiPanel antigos:
 *   401/unauthorized → keys.error401; 429/rate-limit → keys.error429;
 *   falha de rede → keys.errorNetwork; resto/ausente → keys.invalid.
 */
export type ValidationErrorClass = '401' | '429' | 'network' | 'other';

export function classifyValidationError(raw: string | undefined): ValidationErrorClass {
  const msg = (raw ?? '').trim().toLowerCase();

  if (/401|unauthorized|invalid api|api key.*(inval|não valid|not valid)/.test(msg)) {
    return '401';
  }
  if (/429|rate limit|too many/.test(msg)) {
    return '429';
  }
  if (
    /network|fetch|timeout|enode|getaddrinfo|econnrefused|offline|sem conex|no connection|etimedout/i.test(
      msg,
    )
  ) {
    return 'network';
  }
  return 'other';
}

/**
 * Decide o Alert de um `ValidationResult` (retorno das validations de chave).
 * `isValid` → sucesso; senão classifica a mensagem de erro no bucket i18n.
 */
export function validationAlert(result: ValidationResult): ValidationAlertI18n {
  if (result.isValid) {
    return { severity: 'success', i18nKey: 'translation:keys.valid' };
  }
  const cls = classifyValidationError(result.errorMessage);
  switch (cls) {
    case '401':
      return { severity: 'error', i18nKey: 'translation:keys.error401' };
    case '429':
      return { severity: 'error', i18nKey: 'translation:keys.error429' };
    case 'network':
      return { severity: 'error', i18nKey: 'translation:keys.errorNetwork' };
    default:
      return { severity: 'error', i18nKey: 'translation:keys.invalid' };
  }
}