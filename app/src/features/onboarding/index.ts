/**
 * src/features/onboarding/index.ts — exports públicos do tutorial.
 *
 * Espelha o index.ts do Ondokai, adaptado ao Study Method: overlay + modal +
 * hooks + host + steps (completo + quick start) + detecção de alvos + áudio.
 */
export { OnboardingHost, useOnboardingController } from './OnboardingHost';
export { OnboardingOverlay } from './components/OnboardingOverlay';
export { TutorialSelectionModal } from './components/TutorialSelectionModal';
export { useOnboarding } from './hooks/useOnboarding';
export { useFirstRunTutorialPrompt } from './hooks/useFirstRunTutorialPrompt';
export { useHelpHint } from './hooks/useHelpHint';
export {
  evaluateStepAction,
  createSnapshot,
  hasExpectedAction,
} from './logic/evaluateStepAction';
export {
  ONBOARDING_TARGET_CATALOG,
  isKnownTargetId,
  enumeratePresentTargetIds,
} from './constants/onboardingTargets';
export {
  ONBOARDING_CHAPTERS,
  ONBOARDING_STEPS,
  FIRST_ONBOARDING_STEP_ID,
} from './constants/onboardingSteps';
export {
  QUICK_START_CHAPTERS,
  QUICK_START_STEPS,
  FIRST_QUICK_START_STEP_ID,
} from './constants/quickStartSteps';
export { onboardingStorageService } from './services/onboardingStorage.service';
export type { OnboardingTargetMeta } from './constants/onboardingTargets';
export type {
  OnboardingProgress,
  OnboardingStatus,
  OnboardingStepDefinition,
  OnboardingChapterDefinition,
  OnboardingExpectedAction,
  OnboardingRuntimeContext,
  OnboardingStepSnapshot,
  OnboardingTutorialId,
} from './types/onboarding.types';