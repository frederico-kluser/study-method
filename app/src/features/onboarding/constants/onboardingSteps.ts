/**
 * src/features/onboarding/constants/onboardingSteps.ts
 *
 * STEPS do tutorial rápido do Study Method.
 *
 * Portado e ADAPTADO de `ondokai/.../onboardingSteps.ts`. O conteúdo original
 * era voltado ao editor de workflows (React Flow); aqui reescrevemos o
 * conteúdo para a nossa GUI (MUI v9): AppBar (título), ThemeToggleButton,
 * LanguageSwitcher, abas, área de assunto da Aula, editor CodeMirror, terminal,
 * botão "Testar resposta" e a seção de chaves de Configurações.
 *
 * REGRA i18n (onda 12): título e corpo são SEMPRE por chave `translation:tutorial.*`
 * (strictKeyChecks — paridade pt-BR/en exata). Nunca texto direto.
 */

import type {
  OnboardingChapterDefinition,
  OnboardingStepDefinition,
} from '../types/onboarding.types';

/** Primeiro step do tutorial (ponto de entrada). */
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

  // ─── Capítulo 2: Configurações ─────────────────────────────────────────────
  {
    id: 'settings-keys',
    chapterId: 'settings',
    titleKey: 'translation:tutorial.steps.settingsKeys.title',
    descriptionKey: 'translation:tutorial.steps.settingsKeys.description',
    targetSelector: '[data-onboarding-target="settings-keys-section"]',
    view: 'settings',
  },

  // ─── Capítulo 3: Aula ──────────────────────────────────────────────────────
  {
    id: 'lesson-subject',
    chapterId: 'lesson',
    titleKey: 'translation:tutorial.steps.lessonSubject.title',
    descriptionKey: 'translation:tutorial.steps.lessonSubject.description',
    targetSelector: '[data-onboarding-target="lesson-subject"]',
    view: 'lesson',
  },

  // ─── Capítulo 4: Desafio ───────────────────────────────────────────────────
  {
    id: 'challenge-editor',
    chapterId: 'challenge',
    titleKey: 'translation:tutorial.steps.challengeEditor.title',
    descriptionKey: 'translation:tutorial.steps.challengeEditor.description',
    targetSelector: '[data-onboarding-target="challenge-editor"]',
    view: 'challenge',
  },
  {
    id: 'challenge-terminal',
    chapterId: 'challenge',
    titleKey: 'translation:tutorial.steps.challengeTerminal.title',
    descriptionKey: 'translation:tutorial.steps.challengeTerminal.description',
    targetSelector: '[data-onboarding-target="challenge-terminal"]',
    view: 'challenge',
  },
  {
    id: 'challenge-test-answer',
    chapterId: 'challenge',
    titleKey: 'translation:tutorial.steps.challengeTestAnswer.title',
    descriptionKey: 'translation:tutorial.steps.challengeTestAnswer.description',
    targetSelector: '[data-onboarding-target="challenge-test-answer"]',
    view: 'challenge',
  },

  // ─── Conclusão ─────────────────────────────────────────────────────────────
  {
    id: 'tour-complete',
    chapterId: 'challenge',
    titleKey: 'translation:tutorial.steps.tourComplete.title',
    descriptionKey: 'translation:tutorial.steps.tourComplete.description',
    targetSelector: '[data-onboarding-target="nav-tabs"]',
    isLast: true,
  },
];

/** Índice de um stepId no array de steps (ou -1). */
export function indexOfStepId(id: string): number {
  return ONBOARDING_STEPS.findIndex((s) => s.id === id);
}