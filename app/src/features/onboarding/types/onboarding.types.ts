/**
 * src/features/onboarding/types/onboarding.types.ts
 *
 * Tipos do sistema de TUTORIAL/ONBOARDING interativo do Study Method.
 *
 * Onda 16 — REFAZ fiel ao Ondokai (`poc/electron-huu/src/features/onboarding`):
 *   - DOIS tutoriais: Tutorial Completo (`first-workflow`) e Quick Start
 *     (`quick-start`), com steps compartilhados + prefixo `qs-*` no exclusivo;
 *   - avaliação por SNAPSHOT (`expectedAction` → `evaluateStepAction`), com
 *     auto-avanço ~220ms — sem expectedAction o user avança com "Continuar";
 *   - contexto de runtime + snapshot (navegação, digitação de assunto, geração
 *     de aula, editor, teste de resposta, chaves) lidos de forma confiável;
 *   - a "rota" do Ondokai vira o `view` (NavKey do shell — home|settings|lesson|challenge).
 *
 * NTRO é o mesmo espírito do ondokai, adaptado a uma GUI de 4 abas.
 */

import type { NavKey } from '../../../lib/shellNav';
import type { OnboardingI18nKey } from '../constants/onboardingI18n';

/** Situação do tutorial (persistida). */
export type OnboardingStatus = 'not_started' | 'in_progress' | 'completed' | 'skipped';

/** Identifica qual tutorial está ativo. */
export type OnboardingTutorialId = 'first-workflow' | 'quick-start';

/** Capítulo do tutorial (bloco de steps com título). */
export type OnboardingChapterId = 'shell' | 'settings' | 'lesson' | 'challenge';

/**
 * Ações esperadas avaliadas por snapshot. Cada uma corresponde a um sinal REAL
 * do Study Method (ver `OnboardingRuntimeContext`).
 */
export type OnboardingExpectedAction =
  /** O usuário navegou o shell para a aba Settings. */
  | 'open-settings'
  /** O usuário navegou o shell para a aba Aula. */
  | 'open-lesson'
  /** O usuário navegou o shell para a aba Desafio. */
  | 'open-challenge'
  /** O campo de assunto da LessonView deixou de estar vazio. */
  | 'fill-lesson-subject'
  /** A geração de aula saiu de idle (running ou done). */
  | 'generate-lesson'
  /** O editor CodeMirror do desafio passou a ter conteúdo. */
  | 'type-in-editor'
  /** O usuário disparou "Testar resposta" no desafio. */
  | 'test-answer'
  /** As chaves DeepSeek + Brave foram preenchidas/validadas (settings). */
  | 'settings-keys-filled';

/** Steps do tutorial completo + quick start. */
export type OnboardingStepId =
  // Completo
  | 'shell-app-title'
  | 'shell-theme-toggle'
  | 'shell-language-switcher'
  | 'shell-nav-tabs'
  | 'open-settings'
  | 'settings-keys-fill'
  | 'open-lesson'
  | 'lesson-subject-fill'
  | 'lesson-generate'
  | 'open-challenge'
  | 'challenge-editor-type'
  | 'challenge-test-answer'
  | 'tour-complete'
  // Quick Start (compartilha ids do completo + exclusivos `qs-*`)
  | 'qs-shell-nav-tabs'
  | 'qs-open-lesson'
  | 'qs-open-challenge'
  | 'qs-challenge-test-answer'
  | 'qs-tour-complete'
  // Hint pós-tutorial (1 passo, não persistido).
  | 'help-hint';

/**
 * Contexto RUNTIME do Study Method, lido de forma confiável pelo
 * `useOnboarding` (alimentado por navegação do shell + leitura de DOM/estado).
 * É a fonte de verdade para o `evaluateStepAction`.
 */
export interface OnboardingRuntimeContext {
  /** Aba ativa do shell. */
  activeView: NavKey;
  /** Campo de assunto da Lesson non-vazio (texto digitado). */
  lessonSubjectNonEmpty: boolean;
  /** Geração de aula em andamento ou concluída (idle → running/done). */
  lessonRunningOrDone: boolean;
  /** Editor CodeMirror do desafio com texto (non-vazio). */
  studioCodeNonEmpty: boolean;
  /** O usuário clicou "Testar resposta" (fase determinística rodando ou feita). */
  testAnswerTriggered: boolean;
  /** Chaves DeepSeek + Brave preenchidas (inputs do KeysPanel non-vazios). */
  keysFilled: boolean;
}

/** Snapshot do contexto no início do passo (para delta-base). */
export interface OnboardingStepSnapshot {
  activeView: NavKey;
  lessonSubjectNonEmpty: boolean;
  lessonRunningOrDone: boolean;
  studioCodeNonEmpty: boolean;
  testAnswerTriggered: boolean;
  keysFilled: boolean;
}

/**
 * Definição de um step do tutorial.
 *
 * Título e corpo são SEMPRE por chave i18n (`titleKey`/`descriptionKey` — typed,
 * strictKeyChecks). Alvo via `targetSelector`/`alternateTargetSelector`
 * (este tentado ANTES do primário, como no ondokai). `expectedAction` opcional:
 * quando presente, o step auto-avança ao ser satisfeito (após ~220ms); quando
 * ausente, o usuário avança com "Continuar".
 */
export interface OnboardingStepDefinition {
  id: OnboardingStepId;
  chapterId: OnboardingChapterId;
  /** Chave i18n do título (namespace translation, prefixo `tutorial.*` — typed). */
  titleKey: OnboardingI18nKey;
  /** Chave i18n do corpo. */
  descriptionKey: OnboardingI18nKey;
  /** Seletor CSS do alvo principal (spotlight). */
  targetSelector: string;
  /** Seletor alternativo, tentado ANTES do primário (ex.: modal/panel sobre alvo). */
  alternateTargetSelector?: string;
  /** Índice do match para `targetSelector` (0 = primeiro; -1 = último). */
  targetSelectorIndex?: number;
  /**
   * Aba do shell em que o alvo é visível (a "rota" do Ondokai). Quando `undefined`,
   * o alvo é sempre visível (AppBar/abas). Usado pelo overlay para a dica
   * "vá para a aba X" e para decidir quando o spotlight pode pousar.
   */
  view?: NavKey;
  /** Ação esperada (auto-avanço por snapshot). Omissa ⇒ "Continuar" manual. */
  expectedAction?: OnboardingExpectedAction;
  /** Oculta o botão "Continuar" (steps de auto-avanço por input/navegação). */
  hideContinueButton?: boolean;
  /** True no último step (troca o rótulo para "Concluir"). */
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