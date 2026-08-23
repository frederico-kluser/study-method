/**
 * src/features/onboarding/index.ts — exports públicos do tutorial.
 *
 * Espelha o index.ts do Ondokai, adaptado ao Study Method: overlay + modal +
 * hooks + host + detecção de alvos.
 */
export { OnboardingHost, useOnboardingController } from './OnboardingHost';
export { OnboardingOverlay } from './components/OnboardingOverlay';
export { TutorialSelectionModal } from './components/TutorialSelectionModal';
export { useOnboarding } from './hooks/useOnboarding';
export { useFirstRunTutorialPrompt } from './hooks/useFirstRunTutorialPrompt';
export {
  ONBOARDING_TARGET_CATALOG,
  isKnownTargetId,
  enumeratePresentTargetIds,
} from './constants/onboardingTargets';
export { ONBOARDING_CHAPTERS, ONBOARDING_STEPS, FIRST_ONBOARDING_STEP_ID } from './constants/onboardingSteps';
export { onboardingStorageService } from './services/onboardingStorage.service';
export type { OnboardingTargetMeta } from './constants/onboardingTargets';
export type {
  OnboardingProgress,
  OnboardingStatus,
  OnboardingStepDefinition,
  OnboardingChapterDefinition,
} from './types/onboarding.types';