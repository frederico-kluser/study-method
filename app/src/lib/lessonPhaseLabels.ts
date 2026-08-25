/**
 * src/lib/lessonPhaseLabels.ts — mapeamento PURO da fase de progresso da aula
 * (LessonPhaseState.phase, em pt-BR interno do parser) para a i18n-key de rótulo.
 *
 * O parser `lessonProgress` devolve fases em pt-BR ('pesquisando'|'autorando'|…);
 * a UI precisa do rótulo traduzível, então mapeamos para as chaves `lesson.phase.*`
 * dos resources (typed — literal union para o strictKeyChecks do i18next.d.ts).
 *
 * Mapeamento:
 *   pesquisando  → lesson.phase.research
 *   autorando    → lesson.phase.authoring
 *   materializando → lesson.phase.materializing
 *   validando    → lesson.phase.validating
 *   concluindo   → lesson.phase.done
 *   gerando (estado inicial/genérico do parser) → lesson.phase.research (não há
 *   chave 'gerando'; aponta para a PRIMEIRA etapa — o Stepper do início mostra a
 *   1ª fase ativa com as demais pendentes, em vez de pular para o fim).
 */

import type { LessonPhaseState } from './lessonProgress';

/** Chaves de tradução válidas para as fases da aula. */
export type LessonPhaseLabelKey =
  | 'lesson.phase.research'
  | 'lesson.phase.authoring'
  | 'lesson.phase.materializing'
  | 'lesson.phase.validating'
  | 'lesson.phase.done';

/** Ordem de exibição das fases (usada pelo Stepper da LessonView). */
export const LESSON_PHASE_ORDER: readonly LessonPhaseLabelKey[] = [
  'lesson.phase.research',
  'lesson.phase.authoring',
  'lesson.phase.materializing',
  'lesson.phase.validating',
  'lesson.phase.done',
];

/** Índice (0-based) de uma fase na ordem de exibição; -1 quando desconhecida. */
export function lessonPhaseIndex(phase: LessonPhaseState['phase']): number {
  return LESSON_PHASE_ORDER.indexOf(lessonPhaseKey(phase));
}

/**
 * Devolve a i18n-key de rótulo para a fase do parser. Fases válidas do tipo
 * sempre encontram um rótulo; a fase 'gerando' (inicial/genérica) aponta para
 * a primeira etapa ('research').
 */
export function lessonPhaseKey(phase: LessonPhaseState['phase']): LessonPhaseLabelKey {
  switch (phase) {
    case 'pesquisando':
      return 'lesson.phase.research';
    case 'autorando':
      return 'lesson.phase.authoring';
    case 'materializando':
      return 'lesson.phase.materializing';
    case 'validando':
      return 'lesson.phase.validating';
    case 'concluindo':
      return 'lesson.phase.done';
    case 'gerando':
      // Fase inicial/genérica do parser: aponta para a PRIMEIRA etapa do
      // Stepper, não para a última (bug fix: o início mostrava 4 etapas ✓).
      return 'lesson.phase.research';
    default:
      return 'lesson.phase.done';
  }
}