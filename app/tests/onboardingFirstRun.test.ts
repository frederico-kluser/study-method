/**
 * tests/onboardingFirstRun.test.ts — regra pura de oferta de primeira execução.
 *
 * Porta a lógica do `useFirstRunTutorialPrompt` do Ondokai (o teste lá montava
 * o React hook; aqui extraímos a DECISÃO para uma função pura — Regra: os
 * componentes React não são unit-testados; a lógica pura é). Sem jsdom.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  shouldOfferFirstRunTutorial,
  type FirstRunRuleInput,
} from '../src/features/onboarding/hooks/firstRunTutorial.rule';
import type { OnboardingStatus } from '../src/features/onboarding/types/onboarding.types';

function input(over: Partial<FirstRunRuleInput>): FirstRunRuleInput {
  return { enabled: true, alreadyOffered: false, onboardingStatus: 'not_started', ...over };
}

describe('shouldOfferFirstRunTutorial', () => {
  it('oferece apenas quando enabled, não-oferecido e estado not_started', () => {
    assert.equal(shouldOfferFirstRunTutorial(input({})), true);
  });

  it('NÃO oferece quando disabled (app não liberado pelo gate)', () => {
    assert.equal(shouldOfferFirstRunTutorial(input({ enabled: false })), false);
  });

  it('NÃO oferece quando a oferta já foi mostrada (flag one-shot)', () => {
    assert.equal(shouldOfferFirstRunTutorial(input({ alreadyOffered: true })), false);
  });

  it('NÃO oferece quando o usuário já engajou o tutorial (status não not_started)', () => {
    for (const status of ['in_progress', 'completed', 'skipped'] as OnboardingStatus[]) {
      assert.equal(
        shouldOfferFirstRunTutorial(input({ onboardingStatus: status })),
        false,
        `${status} não deve disarar a oferta`,
      );
    }
  });
});