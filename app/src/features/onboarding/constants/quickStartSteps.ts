/**
 * src/features/onboarding/constants/quickStartSteps.ts
 *
 * STEPS do QUICK START (`quick-start`) do Study Method.
 *
 * Onda 16 — portado do Ondokai (`quickStartSteps.ts`). Versão CURTA do tutorial,
 * sem exigir setup de chaves (navegação informativa + uma ação de teste), para
 * dar uma orientação rápida ao usuário que não quer o fluxo completo.
 *
 * Segue o mesmo espírito do ondokai: compartilha o primeiro step (shell) com o
 * completo e usa ids distintos (prefixo `qs-*`) nos demais — assim o storage
 * valida os dois arrays e o overlay reutiliza a mesma mecânica.
 */

import type {
  OnboardingChapterDefinition,
  OnboardingStepDefinition,
} from '../types/onboarding.types';

/** Capítulos do Quick Start (um único capítulo, shell). */
export const QUICK_START_CHAPTERS: OnboardingChapterDefinition[] = [
  { id: 'shell', titleKey: 'translation:tutorial.chapter.shell' },
];

/** Primeiro step do Quick Start. */
export const FIRST_QUICK_START_STEP_ID = 'shell-app-title';

export const QUICK_START_STEPS: ReadonlyArray<OnboardingStepDefinition> = [
  {
    id: 'shell-app-title',
    chapterId: 'shell',
    titleKey: 'translation:tutorial.steps.shellAppTitle.title',
    descriptionKey: 'translation:tutorial.steps.shellAppTitle.description',
    targetSelector: '[data-onboarding-target="app-title"]',
  },
  {
    id: 'qs-shell-nav-tabs',
    chapterId: 'shell',
    titleKey: 'translation:tutorial.steps.shellNavTabs.title',
    descriptionKey: 'translation:tutorial.steps.shellNavTabs.description',
    targetSelector: '[data-onboarding-target="nav-tabs"]',
  },
  {
    id: 'qs-open-lesson',
    chapterId: 'lesson',
    titleKey: 'translation:tutorial.steps.openLesson.title',
    descriptionKey: 'translation:tutorial.steps.qsOpenLesson.description',
    targetSelector: '[data-onboarding-target="nav-tabs"]',
    view: 'lesson',
    expectedAction: 'open-lesson',
    hideContinueButton: true,
  },
  {
    id: 'qs-open-challenge',
    chapterId: 'challenge',
    titleKey: 'translation:tutorial.steps.openChallenge.title',
    descriptionKey: 'translation:tutorial.steps.qsOpenChallenge.description',
    targetSelector: '[data-onboarding-target="nav-tabs"]',
    view: 'challenge',
    expectedAction: 'open-challenge',
    hideContinueButton: true,
  },
  {
    id: 'qs-challenge-test-answer',
    chapterId: 'challenge',
    titleKey: 'translation:tutorial.steps.challengeTestAnswer.title',
    descriptionKey: 'translation:tutorial.steps.qsChallengeTestAnswer.description',
    targetSelector: '[data-onboarding-target="challenge-test-answer"]',
    view: 'challenge',
    expectedAction: 'test-answer',
    hideContinueButton: true,
  },
  {
    id: 'qs-tour-complete',
    chapterId: 'challenge',
    titleKey: 'translation:tutorial.steps.quickStartComplete.title',
    descriptionKey: 'translation:tutorial.steps.quickStartComplete.description',
    targetSelector: '[data-onboarding-target="nav-tabs"]',
    isLast: true,
  },
];

/** Índice de um stepId no array do Quick Start (ou -1). */
export function indexOfQuickStartStepId(id: string): number {
  return QUICK_START_STEPS.findIndex((s) => s.id === id);
}