/**
 * src/lib/validate.ts — validações puras de entrada da UI.
 */

export interface ValidationIssue {
  ok: boolean;
  /** Mensagem user-facing em pt-BR quando `ok` é false. */
  message?: string;
}

const MAX_SUBJECT_LENGTH = 200;

/**
 * Valida o assunto digitado na tela de Aula.
 * Regras: não pode ser vazio (ou só espaços) e pode ter no máximo 200 chars.
 */
export function validateSubject(subject: string): ValidationIssue {
  const trimmed = subject.trim();
  if (trimmed.length === 0) {
    return { ok: false, message: 'Digite um assunto para estudar.' };
  }
  if (trimmed.length > MAX_SUBJECT_LENGTH) {
    return {
      ok: false,
      message: `Assunto muito longo (máximo ${MAX_SUBJECT_LENGTH} caracteres).`,
    };
  }
  return { ok: true };
}

/** Conveniência para checar se uma chave de API é não vazia na tela Settings. */
export function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}