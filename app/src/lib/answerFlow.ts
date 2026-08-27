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
import type { MathAnswerCheckResult } from '../../shared/ipc-contract';

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

/* ═══════════════════════════════════════════════════════════════════════════
 * ONDA 5 — vereditos de resposta digitada (matemática por execução + LLM p/
 * interpretação). Lógica PURA testável: a view só traduz o resultado.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Veredito do juiz de INTERPRETAÇÃO (`JudgeAnswerOutcome.ok === true`). */
export type InterpretationVerdict = 'correct' | 'partial' | 'incorrect';

/** Chave i18n (sem prefixo 'translation:') do rótulo do veredito. */
export function interpretationVerdictI18nKey(verdict: InterpretationVerdict): string {
  switch (verdict) {
    case 'correct':
      return 'lesson.answer.correct';
    case 'partial':
      return 'lesson.answer.partial';
    case 'incorrect':
      return 'lesson.answer.incorrect';
    default:
      return 'lesson.answer.serviceError';
  }
}

/**
 * REGRA EXATA DE AVANÇO pós-veredito (onda 5 — documentada para a UI):
 *
 *   - `null` (sem veredito ainda)  → NÃO avança (o veredito é pré-requisito);
 *   - 'correct'                     → AVANÇA: marca concluída + encadeia;
 *   - 'partial' / 'incorrect'       → NÃO avança automaticamente: o veredito e o
 *     feedback ficam VISÍVEIS e o usuário pode tentar de novo; o escape é o
 *     botão explícito "Avançar mesmo assim" (mesmo caminho do 'correct') — o
 *     fluxo nunca trava o usuário indefinidamente.
 *
 * O input em si continua regido por `canAdvance` (não-vazio) — esta função só
 * decide o AVANÇO do fluxo.
 */
export function canAdvanceAfterVerdict(verdict: InterpretationVerdict | null): boolean {
  return verdict === 'correct';
}

/** Apresentação de UM veredito de exercício de matemática (verificação por execução). */
export type MathVerdictKind = 'correct' | 'wrong' | 'malformed' | 'error';

export interface MathCheckPresentation {
  kind: MathVerdictKind;
  /** Chave i18n (sem prefixo 'translation:') da mensagem a exibir. */
  messageKey: string;
  /**
   * Esperado na forma canônica — SÓ quando `kind === 'wrong'` (pedagogia: a
   * solução NUNCA é revelada antes da primeira tentativa errada).
   */
  expectedNormalized?: string;
}

/**
 * Traduz `MathAnswerCheckResult` em apresentação de veredito. `null` (invoke
 * falhou/inexistente) → erro de serviço, sem veredito inventado.
 * - correct:true          → 'correct';
 * - correct:false + 'wrong'    → 'wrong' COM expectedNormalized (revela o esperado);
 * - correct:false + 'malformed' → 'malformed' (mensagem de formato, SEM esperado);
 * - correct:false sem reason   → 'wrong' defensivo (contam como resposta errada).
 */
export function presentMathCheckResult(result: MathAnswerCheckResult | null): MathCheckPresentation {
  if (!result || typeof result.correct !== 'boolean') {
    return { kind: 'error', messageKey: 'lesson.math.error' };
  }
  if (result.correct) {
    return { kind: 'correct', messageKey: 'lesson.math.correct' };
  }
  if (result.reason === 'malformed') {
    return { kind: 'malformed', messageKey: 'lesson.math.malformed' };
  }
  return {
    kind: 'wrong',
    messageKey: 'lesson.math.wrong',
    expectedNormalized:
      typeof result.expectedNormalized === 'string' && result.expectedNormalized
        ? result.expectedNormalized
        : undefined,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ONDA 5 — marcação de tentativa de DESAFIO (nunca-repetir) só em eventos
 * TERMINAIS. Decisão pura testável (ChallengeView só traduz).
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Veredito gravável de UMA tentativa de desafio (nunca 'failed' da UI). */
export type MarkAttemptVerdict = 'passed' | 'timeout' | 'abandoned';

/** Evento terminal do desafio que PODE gerar uma marcação. */
export type MarkAttemptEventKind = 'tests-passed' | 'timed-out' | 'switched';

export interface MarkAttemptEvent {
  event: MarkAttemptEventKind;
  /** Já houve mark para ESTE desafio? (1ª tentativa terminal vence). */
  alreadyMarked: boolean;
  /** Desafio já concluído com sucesso (concludedRef da view). */
  concluded: boolean;
  /** O tempo JÁ havia estourado ANTES deste evento (timedOutRef da view). */
  timedOut: boolean;
}

/**
 * REGRA EXATA do mark terminal (onda 5 — documentada para a ChallengeView):
 *
 *   - NUNCA marca no primeiro teste falho ('failed' fica fora): o usuário ainda
 *     está trabalhando no desafio — o filtro nunca-repetir não pode escondê-lo;
 *   - 'tests-passed'  → 'passed'   (o desafio foi CONCLUÍDO);
 *   - 'timed-out'     → 'timeout'  (o evento É o primeiro estouro — `timedOut`
 *     do input significa "já tinha estourado ANTES deste evento" e não se
 *     aplica a ele; o tick dispara 1× via timedOutRef);
 *   - 'switched'      → 'abandoned' (troca sem concluir: guarda de identidade
 *     descarta o resultado em voo — a captura acontece ANTES da troca);
 *   - `alreadyMarked` → null (idempotente: o 1º evento terminal do desafio vence).
 */
export function shouldMarkAttempt(input: MarkAttemptEvent): MarkAttemptVerdict | null {
  if (input.alreadyMarked) return null;
  switch (input.event) {
    case 'tests-passed':
      return input.concluded ? 'passed' : null;
    case 'timed-out':
      return input.concluded ? null : 'timeout';
    case 'switched':
      return input.concluded || input.timedOut ? null : 'abandoned';
    default:
      return null;
  }
}

/**
 * Slug ESTÁVEL do desafio para o `challengeId` do mark-challenge-attempt:
 * `ChallengeInfo.slug` quando presente; senão deriva do basename do
 * workspaceDir SEM o prefixo NNNN ('0007-fatorial-recursivo' →
 * 'fatorial-recursivo' — mesmo contrato do main); por fim o challengeId.
 */
export function resolveChallengeSlug(ch: {
  slug?: string;
  workspaceDir?: string;
  challengeId: string;
}): string {
  if (typeof ch.slug === 'string' && ch.slug.trim()) return ch.slug.trim();
  const base = (ch.workspaceDir ?? '').split(/[\\/]/).filter(Boolean).pop() ?? '';
  const withoutPrefix = base.replace(/^\d{4}-/, '');
  return withoutPrefix || ch.challengeId;
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
