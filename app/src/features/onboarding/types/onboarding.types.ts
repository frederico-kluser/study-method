/**
 * src/features/onboarding/types/onboarding.types.ts
 *
 * Tipos do sistema de TUTORIAL/ONBOARDING interativo do Study Method.
 *
 * Portado do app Ondokai (`poc/electron-huu/src/features/onboarding/types`),
 * ADAPTADO ao nosso escopo: o Ondokai era fortemente acoplado ao editor de
 * workflows (React Flow) e a tutoriais dinâmicos (template-setup / dynamic-help),
 * com áudio e deep-links de Settings. O Study Method é uma GUI simples de 4
 * abas (Início/Settings/Aula/Desafio), então mantemos aqui apenas o núcleo:
 *   - um ÚNICO tutorial "quick tour" (capítulos + steps informativos);
 *   - alvos `data-onboarding-target` no DOM;
 *   - persistência de progresso em localStorage.
 *
 * SEM ÁUDIO (decisão da onda 12): não portamos `audioPlayback`/`onboardingAudio`/
 * `phraseAudio` — não temos frases de áudio. Steps são informativos (título/corpo
 * por chave i18n + alvo), avançados manualmente por "Continuar" (nada de
 * auto-avanço por expectedAction/requirement).
 */

import type { NavKey } from '../../../lib/shellNav';
import type { OnboardingI18nKey } from '../constants/onboardingI18n';

/** Situação do tutorial (persistida). */
export type OnboardingStatus = 'not_started' | 'in_progress' | 'completed' | 'skipped';

/** Identifica o (único) tutorial ativo. Mantido como union para espelhar o
 * formato do Ondokai e permitir futuras expansões sem quebrar o storage. */
export type OnboardingTutorialId = 'quick-tour';

/** Capítulo do tutorial (bloco de steps com título). */
export type OnboardingChapterId = 'shell' | 'settings' | 'lesson' | 'challenge';

/** Steps do tutorial rápido do Study Method. */
export type OnboardingStepId =
  | 'shell-app-title'
  | 'shell-theme-toggle'
  | 'shell-language-switcher'
  | 'shell-nav-tabs'
  | 'settings-keys'
  | 'lesson-subject'
  | 'challenge-editor'
  | 'challenge-terminal'
  | 'challenge-test-answer'
  | 'tour-complete';

/**
 * Definição de um step do tutorial.
 *
 * Título e corpo são SEMPRE por chave i18n (`titleKey`/`descriptionKey`) — nunca
 * texto direto (regra da onda 12: todas as strings user-facing passam por
 * `t('translation:tutorial.<chave>')` com strictKeyChecks). A localização do
 * alvo usa `targetSelector` (CSS) que aponta para um elemento marcado com
 * `data-onboarding-target="<id>"`.
 */
export interface OnboardingStepDefinition {
  id: OnboardingStepId;
  chapterId: OnboardingChapterId;
  /** Chave i18n do título (namespace translation, prefixo `tutorial.*` — typed). */
  titleKey: OnboardingI18nKey;
  /** Chave i18n do corpo. */
  descriptionKey: OnboardingI18nKey;
  /** Seletor CSS do alvo a destacar (spotlight). */
  targetSelector: string;
  /**
   * Aba do shell em que o alvo é visível. Quando `undefined`, o alvo é
   * sempre visível (elementos do AppBar, abas). O overlay usa isso para:
   *   - mostrar uma dica "vá para a aba X" quando o usuário não está nela;
   *   - PULAR o step caso o alvo não esteja montado no DOM (`enumeratePresentTargetIds`).
   */
  view?: NavKey;
  /** True no último step (troca o rótulo do botão para "Concluir"). */
  isLast?: boolean;
}

/** Definição de um capítulo (agrupamento com título por chave i18n — typed). */
export interface OnboardingChapterDefinition {
  id: OnboardingChapterId;
  titleKey: OnboardingI18nKey;
}

/** Progresso do tutorial (persistido em localStorage). */
export interface OnboardingProgress {
  status: OnboardingStatus;
  currentStepId: OnboardingStepId;
  updatedAt: number;
}

/** Payload persistido (progresso + versão de schema). */
export interface OnboardingStoragePayload extends OnboardingProgress {
  version: 1;
}