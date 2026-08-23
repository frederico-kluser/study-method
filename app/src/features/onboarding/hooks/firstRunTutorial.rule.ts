/**
 * src/features/onboarding/hooks/firstRunTutorial.rule.ts
 *
 * REGRA PURA de decisão da oferta de primeira execução — extraída do hook
 * `useFirstRunTutorialPrompt` para ser testável via node:test (sem jsdom), no
 * mesmo padrão de startupState.ts/themeModeState.ts.
 *
 * O hook só executa `openTutorialSelection` quando esta regra retorna true:
 *   - `enabled`       — sessão passada do startup-gate (app liberado);
 *   - `alreadyOffered`— a oferta nunca foi mostrada (flag localStorage);
 *   - `onboardingStatus` — estado NOVO ('not_started'), i.e., nunca engajou.
 */
import type { OnboardingStatus } from '../types/onboarding.types';

export interface FirstRunRuleInput {
  enabled: boolean;
  /** `onboardingStorageService.wasTutorialSelectionOffered()`. */
  alreadyOffered: boolean;
  onboardingStatus: OnboardingStatus;
}

export function shouldOfferFirstRunTutorial({
  enabled,
  alreadyOffered,
  onboardingStatus,
}: FirstRunRuleInput): boolean {
  if (!enabled || alreadyOffered) {
    return false;
  }
  return onboardingStatus === 'not_started';
}