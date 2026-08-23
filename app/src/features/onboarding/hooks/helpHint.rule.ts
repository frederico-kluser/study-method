/**
 * src/features/onboarding/hooks/helpHint.rule.ts
 *
 * REGRA PURA de decisão da dica pós-tutorial — extraída do `useHelpHint` para
 * ser testável via node:test (sem jsdom), no mesmo padrão do
 * `firstRunTutorial.rule`. O hook só chama `startHelpHint` quando esta regra
 * retorna true:
 *  - `enabled`        — sessão passada do startup-gate;
 *  - `alreadyShown`   — a dica nunca foi mostrada (flag one-shot);
 *  - `onboardingStatus` — tutorial CONCLUÍDO ou PULADO;
 *  - `activeView`     — o usuário chegou à aba Aula (onde o campo de assunto vive).
 */

import type { OnboardingStatus } from '../types/onboarding.types';

export interface HelpHintRuleInput {
  enabled: boolean;
  /** `onboardingStorageService.wasHelpHintShown()`. */
  alreadyShown: boolean;
  onboardingStatus: OnboardingStatus;
  activeView: 'home' | 'settings' | 'lesson' | 'challenge';
}

export function shouldShowHelpHint({
  enabled,
  alreadyShown,
  onboardingStatus,
  activeView,
}: HelpHintRuleInput): boolean {
  if (!enabled || alreadyShown) {
    return false;
  }
  const done = onboardingStatus === 'completed' || onboardingStatus === 'skipped';
  return done && activeView === 'lesson';
}