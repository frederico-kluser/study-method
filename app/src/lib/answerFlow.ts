/**
 * src/lib/answerFlow.ts — lógica pura do fluxo de resposta encadeada da aula.
 *
 * Onda 3 (UI): a tela de aula agora é CURTA (1-2 parágrafos) + UM input em que o
 * aluno digita o que entendeu OU responde a pergunta. Ao responder não-vazio, o
 * app avança para a próxima aula do mesmo assunto (quando existe) ou sugere
 * gerar nova aula.
 *
 * Módulo 100% puro e testável SEM jsdom: nenhum I/O de banco/rede vive aqui; as
 * funções recebem o que precisam por parâmetro. O encadeamento (qual a próxima
 * aula) delega ao motor de domínio `pickNextLesson` de
 * electron/main/domain/lessonEngine — importado por precedente de
 * src/lib/apiBridge.ts (que importa type de ../../electron/...).
 */
import {
  pickNextLesson,
  type LessonCandidate,
} from '../../electron/main/domain/lessonEngine';

/** Resultado de `nextAfterAnswer`. */
export interface NextAfterAnswer {
  /** true quando a resposta deve avançar (próxima aula ou sinal de nova). */
  advance: boolean;
  /** Id da próxima aula pendente, quando há (senão ausente → "gerar nova"). */
  nextLessonId?: string;
  /** Motivo legível (pt-BR) da escolha, quando há próxima. */
  reason?: string;
}

/**
 * Decide se a resposta do aluno pode avançar o fluxo: texto não-vazio após trim.
 * - '' / whitespace → false (não avança);
 * - texto → true.
 */
export function canAdvance(answerText: string): boolean {
  return answerText.trim().length > 0;
}

/**
 * Encadeia após a resposta: usa `canAdvance` e, se houver texto, delega a
 * `pickNextLesson` do motor de domínio para escolher a próxima aula do MESMO
 * assunto (a incompleta de menor dificuldade, ou a mais avançada quando todas
 * completas). Vazio nunca avança.
 */
export function nextAfterAnswer(input: {
  lessons: LessonCandidate[];
  answerText: string;
}): NextAfterAnswer {
  if (!canAdvance(input.answerText)) {
    return { advance: false };
  }
  const next = pickNextLesson(input.lessons ?? []);
  if (next.lessonId) {
    return { advance: true, nextLessonId: next.lessonId, reason: next.reason };
  }
  return { advance: true };
}

/** Chaves i18n (sem prefixo 'translation:') retornadas por `newLessonActionLabel`. */
export type LessonActionLabelKey = 'lesson.continue' | 'lesson.newLesson';

/**
 * Rótulo (i18n-key sem prefixo 'translation:') do botão primário da aula.
 * - há aula pendente (hasLessons=true) → 'lesson.continue' ("Continuar");
 * - senão → 'lesson.newLesson' ("Gerar nova aula").
 */
export function newLessonActionLabel(hasLessons: boolean): LessonActionLabelKey {
  return hasLessons ? 'lesson.continue' : 'lesson.newLesson';
}
