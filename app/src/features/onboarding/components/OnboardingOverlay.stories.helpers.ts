/**
 * OnboardingOverlay.stories.helpers.ts — builders PUROS das histórias do
 * `OnboardingOverlay` (sem JSX de propósito: os helpers de história são
 * `*.stories.helpers.ts` e ficam FORA do glob de histórias e da varredura do
 * gate de cobertura — ver STORY-SPEC §1).
 *
 * O overlay é o componente mais "de mundo real" do catálogo: ilumina alvos do
 * DOM (`[data-onboarding-*]`) e precisa de um `OnboardingStepDefinition` coerente
 * com o índice/capítulo que mostra. Aqui mora essa coerência: as histórias
 * pedem um passo REAL (`ONBOARDING_STEPS` — os mesmos que o tutorial usa) e
 * recebem as props completas, sem reescrever a aritmética de capítulo/índice
 * (que é a do `useOnboarding`, preservada aqui).
 */
import { ONBOARDING_CHAPTERS, ONBOARDING_STEPS } from '../constants/onboardingSteps';
import type {
  OnboardingChapterDefinition,
  OnboardingStepDefinition,
} from '../types/onboarding.types';
import type { OnboardingOverlayProps } from './OnboardingOverlay';

/** O passo real do tutorial pelo id (falha ruidosa se o id não existir). */
export function stepById(id: string): OnboardingStepDefinition {
  const step = ONBOARDING_STEPS.find((s) => s.id === id);
  if (!step) throw new Error(`passo "${id}" não existe em ONBOARDING_STEPS`);
  return step;
}

/** Índice 1-based do passo no percurso completo (para `currentStepIndex`). */
export function stepIndex(id: string): number {
  return ONBOARDING_STEPS.findIndex((s) => s.id === id);
}

/** Índice do capítulo do passo (para `currentChapterIndex`). */
export function chapterIndex(chapterId: OnboardingStepDefinition['chapterId']): number {
  return ONBOARDING_CHAPTERS.findIndex((c: OnboardingChapterDefinition) => c.id === chapterId);
}

/**
 * Props COMPLETAS do overlay para um passo real — a coerência
 * (índices/totais/capítulo/último passo) calculada como o `useOnboarding`
 * calcula; tudo o resto é sobreponível pela história.
 */
export function overlayPropsFor(
  step: OnboardingStepDefinition,
  over: Partial<OnboardingOverlayProps> = {},
): OnboardingOverlayProps {
  const chapter = ONBOARDING_CHAPTERS.find(
    (c: OnboardingChapterDefinition) => c.id === step.chapterId,
  );
  return {
    isVisible: true,
    currentStep: step,
    currentStepIndex: Math.max(0, stepIndex(step.id)),
    totalSteps: ONBOARDING_STEPS.length,
    currentChapterIndex: Math.max(0, chapterIndex(step.chapterId)),
    totalChapters: ONBOARDING_CHAPTERS.length,
    currentChapterTitleKey: chapter?.titleKey ?? 'translation:tutorial.chapter.shell',
    isLastStep: step.isLast === true,
    // Sem `expectedAction` o "Continuar" nasce pronto; com ação, espera-a (ou
    // a flag `continueAlwaysEnabled` do contrato dos passos do Desafio).
    isActionSatisfied: false,
    canAdvance: step.expectedAction === undefined || step.continueAlwaysEnabled === true,
    isStepTransitioning: false,
    onNext: () => console.debug('[storybook] onNext'),
    onSkip: () => console.debug('[storybook] onSkip'),
    onPause: () => console.debug('[storybook] onPause'),
    ...over,
  };
}
