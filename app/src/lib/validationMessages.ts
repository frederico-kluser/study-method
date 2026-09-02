/**
 * src/lib/validationMessages.ts — mapeamento puro de um `ValidationResult`
 * (retorno de keys.validateDeepseek / keys.validateBrave — nomes de canal
 * históricos; o provedor de LLM por trás é o OpenRouter, ver
 * shared/llm/constants.ts) para o texto pt-BR e o estado visual da UI de
 * Settings.
 *
 * As mensagens falam do "provedor" e NÃO cravam um nome: a MESMA função
 * humaniza o erro do OpenRouter e o do Brave Search — o nome do provedor entra
 * pelo parâmetro `provider` só no fallback genérico.
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
  provider: 'deepseek' | 'openrouter' | 'brave',
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
  // 402 — a chave está VÁLIDA, o que acabou foi o crédito. É a falha mais comum
  // do OpenRouter em conta nova/zerada; sem este ramo a mensagem dizia "chave
  // inválida" e mandava o usuário trocar uma chave que está certa. Vem depois
  // do 429 de propósito (rate-limit que cite "quota" continua sendo 429).
  if (/402|payment required|insufficient credit|insufficient_credit|no credits|cr[ée]ditos? insuficient|sem cr[ée]dito/.test(lower)) {
    return 'Créditos insuficientes na conta do provedor (HTTP 402). A chave é válida — adicione créditos e tente novamente.';
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