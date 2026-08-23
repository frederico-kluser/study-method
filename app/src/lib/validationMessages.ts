/**
 * src/lib/validationMessages.ts — mapeamento puro de um `ValidationResult`
 * (retorno de keys.validateDeepseek / keys.validateBrave) para o texto pt-BR
 * e o estado visual da UI de Settings.
 */
import type { ValidationResult } from '../../shared/ipc-contract';

export type ValidationState = 'idle' | 'validating' | 'valid' | 'invalid';

export interface ValidationUi {
  state: ValidationState;
  message: string;
}

/**
 * Converte a mensagem de erro bruta (qualquer string, tipicamente vinda da
 * página de status HTTP) em um texto pt-BR amigável. Se `errorMessage` for
 * vazio, devolve um texto genérico padrão.
 */
export function humanizeValidationError(
  raw: string | undefined,
  provider: 'deepseek' | 'brave',
): string {
  const msg = (raw ?? '').trim();
  const lower = msg.toLowerCase();

  if (/401|unauthorized|invalid api|api key.*(inval|não valid|not valid)/.test(lower)) {
    return 'Chave inválida: o provedor não reconheceu a chave informada.';
  }
  if (/403|forbidden|permission/i.test(lower)) {
    return 'Acesso negado: a chave não tem permissão para este provedor.';
  }
  if (/429|rate limit|too many/.test(lower)) {
    return 'Limite de requisições atingido (HTTP 429). Tente novamente em alguns instantes.';
  }
  if (/400|bad request/i.test(lower)) {
    return 'O provedor rejeitou o teste (HTTP 400). Revise a chave e tente de novo.';
  }
  if (/5\d\d|server error|internal/i.test(lower)) {
    return 'O provedor retornou erro de servidor. Tente novamente mais tarde.';
  }
  if (/network|fetch|timeout|enode|getaddrinfo|econnrefused|offline|sem conex|no connection|etimedout/i.test(lower)) {
    return 'Falha de rede ao contatar o provedor. Verifique sua conexão e tente de novo.';
  }
  if (msg.length > 0) {
    return `Validação falhou (${provider}): ${msg}`;
  }
  return `Não foi possível validar a chave (${provider}). Tente novamente.`;
}

/**
 * Constrói o estado/UI de validação a partir de um `ValidationResult`.
 * Usado por KeysPanel de forma pura (testável sem React).
 */
export function validationUiFromResult(result: ValidationResult): ValidationUi {
  if (result.isValid) {
    return { state: 'valid', message: 'Chave validada com sucesso.' };
  }
  return {
    state: 'invalid',
    message: humanizeValidationError(result.errorMessage, result.provider),
  };
}