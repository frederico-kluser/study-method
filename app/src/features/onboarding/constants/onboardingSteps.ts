/**
 * src/features/onboarding/constants/onboardingSteps.ts
 *
 * STEPS do TUTORIAL COMPLETO (`first-workflow`) do Study Method.
 *
 * Onda 16 — portado do Ondokai (`onboardingSteps.ts`) e adaptado ao fluxo REAL
 * da GUI: shell → settings (chaves) → lesson (assunto + gerar → rodar) →
 * challenge (editor + testar resposta). Steps com `expectedAction` AUTO-AVANÇAM
 * quando o sinal correspondente do Study Method é satisfeito (avaliação por
 * snapshot); steps informativos (sem expectedAction) avançam com "Continuar".
 *
 * REGRA i18n (onda 12): título/corpo SEMPRE por chave `translation:tutorial.*`.
 */

import type {
  OnboardingChapterDefinition,
  OnboardingStepDefinition,
} from '../types/onboarding.types';

/** Primeiro step do tutorial completo (ponto de entrada). */
export const FIRST_ONBOARDING_STEP_ID = 'shell-app-title';

export const ONBOARDING_CHAPTERS: OnboardingChapterDefinition[] = [
  { id: 'shell', titleKey: 'translation:tutorial.chapter.shell' },
  { id: 'settings', titleKey: 'translation:tutorial.chapter.settings' },
  { id: 'lesson', titleKey: 'translation:tutorial.chapter.lesson' },
  { id: 'challenge', titleKey: 'translation:tutorial.chapter.challenge' },
];

export const ONBOARDING_STEPS: ReadonlyArray<OnboardingStepDefinition> = [
  // ─── Capítulo 1: A interface (shell — alvos sempre visíveis) ──────────────
  {
    id: 'shell-app-title',
    chapterId: 'shell',
    titleKey: 'translation:tutorial.steps.shellAppTitle.title',
    descriptionKey: 'translation:tutorial.steps.shellAppTitle.description',
    targetSelector: '[data-onboarding-target="app-title"]',
  },
  {
    id: 'shell-theme-toggle',
    chapterId: 'shell',
    titleKey: 'translation:tutorial.steps.shellThemeToggle.title',
    descriptionKey: 'translation:tutorial.steps.shellThemeToggle.description',
    targetSelector: '[data-onboarding-target="theme-toggle"]',
  },
  {
    id: 'shell-language-switcher',
    chapterId: 'shell',
    titleKey: 'translation:tutorial.steps.shellLanguageSwitcher.title',
    descriptionKey: 'translation:tutorial.steps.shellLanguageSwitcher.description',
    targetSelector: '[data-onboarding-target="language-switcher"]',
  },
  {
    id: 'shell-nav-tabs',
    chapterId: 'shell',
    titleKey: 'translation:tutorial.steps.shellNavTabs.title',
    descriptionKey: 'translation:tutorial.steps.shellNavTabs.description',
    targetSelector: '[data-onboarding-target="nav-tabs"]',
  },

  // ─── Capítulo 2: Configurações (chaves) — navegação guiada por ação ──
  {
    id: 'open-settings',
    chapterId: 'settings',
    titleKey: 'translation:tutorial.steps.openSettings.title',
    descriptionKey: 'translation:tutorial.steps.openSettings.description',
    targetSelector: '[data-onboarding-target="nav-tabs"]',
    view: 'settings',
    expectedAction: 'open-settings',
    hideContinueButton: true,
  },
  {
    id: 'settings-keys-fill',
    chapterId: 'settings',
    titleKey: 'translation:tutorial.steps.settingsKeys.title',
    descriptionKey: 'translation:tutorial.steps.settingsKeysFill.description',
    targetSelector: '[data-onboarding-target="settings-keys-section"]',
    view: 'settings',
    expectedAction: 'settings-keys-filled',
    hideContinueButton: true,
  },

  // ─── Capítulo 3: Aula — assunto + geração ────────────────────────────
  {
    id: 'open-lesson',
    chapterId: 'lesson',
    titleKey: 'translation:tutorial.steps.openLesson.title',
    descriptionKey: 'translation:tutorial.steps.openLesson.description',
    targetSelector: '[data-onboarding-target="nav-tabs"]',
    view: 'lesson',
    expectedAction: 'open-lesson',
    hideContinueButton: true,
  },

  // ─── Capítulo 4: Desafio — editor + testar ───────────────────────────
  {
    id: 'open-challenge',
    chapterId: 'challenge',
    titleKey: 'translation:tutorial.steps.openChallenge.title',
    descriptionKey: 'translation:tutorial.steps.openChallenge.description',
    targetSelector: '[data-onboarding-target="nav-tabs"]',
    view: 'challenge',
    expectedAction: 'open-challenge',
    hideContinueButton: true,
  },
  {
    id: 'challenge-editor-type',
    chapterId: 'challenge',
    titleKey: 'translation:tutorial.steps.challengeEditor.title',
    descriptionKey: 'translation:tutorial.steps.challengeEditorType.description',
    targetSelector: '[data-onboarding-target="challenge-editor"]',
    view: 'challenge',
    expectedAction: 'type-in-editor',
    hideContinueButton: true,
  },
  {
    id: 'challenge-test-answer',
    chapterId: 'challenge',
    titleKey: 'translation:tutorial.steps.challengeTestAnswer.title',
    descriptionKey: 'translation:tutorial.steps.challengeTestAnswer.description',
    targetSelector: '[data-onboarding-target="challenge-test-answer"]',
    view: 'challenge',
    expectedAction: 'test-answer',
    hideContinueButton: true,
  },

  // ─── Conclusão ─────────────────────────────────────────────────────────
  {
    id: 'tour-complete',
    chapterId: 'challenge',
    titleKey: 'translation:tutorial.steps.tourComplete.title',
    descriptionKey: 'translation:tutorial.steps.tourComplete.description',
    targetSelector: '[data-onboarding-target="nav-tabs"]',
    isLast: true,
  },
];

/** Índice de um stepId no array de steps do completo (ou -1). */
export function indexOfStepId(id: string): number {
  return ONBOARDING_STEPS.findIndex((s) => s.id === id);
}