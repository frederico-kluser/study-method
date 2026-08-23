/**
 * tests/helpHintRule.test.ts — dica pós-tutorial (1x só).
 *
 * A regra `shouldShowHelpHint` decide quando o mini-tour de 1 passo aponta o
 * campo de assunto, na 1ª vez que o usuário chega à aba Aula após concluir OU
 * pular o tutorial. O latch one-shot é garantido pela flag de storage (testada
 * em onboardingStorage.test.ts); aqui validamos a DECISÃO pura — incluindo que
 * não re-dispara quando já mostrado (a "1x só" em si).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  shouldShowHelpHint,
  type HelpHintRuleInput,
} from '../src/features/onboarding/hooks/helpHint.rule';
import type { OnboardingStatus } from '../src/features/onboarding/types/onboarding.types';

function input(over: Partial<HelpHintRuleInput>): HelpHintRuleInput {
  return {
    enabled: true,
    alreadyShown: false,
    onboardingStatus: 'completed',
    activeView: 'lesson',
    ...over,
  };
}

describe('shouldShowHelpHint', () => {
  it('mostra na 1ª vez que chega à Aula após completar', () => {
    assert.equal(shouldShowHelpHint(input({})), true);
  });

  it('mostra também após PULAR o tutorial', () => {
    assert.equal(
      shouldShowHelpHint(input({ onboardingStatus: 'skipped' })),
      true,
    );
  });

  it('NÃO mostra se a dica já foi mostrada (flag one-shot — a "1x só")', () => {
    assert.equal(shouldShowHelpHint(input({ alreadyShown: true })), false);
  });

  it('NÃO mostra fora da aba Aula', () => {
    for (const v of ['home', 'settings', 'challenge'] as const) {
      assert.equal(shouldShowHelpHint(input({ activeView: v })), false, `${v} não dispara`);
    }
  });

  it('NÃO mostra com tutorial não concluído (in_progress/not_started)', () => {
    for (const s of ['not_started', 'in_progress'] as OnboardingStatus[]) {
      assert.equal(shouldShowHelpHint(input({ onboardingStatus: s })), false);
    }
  });

  it('NÃO mostra quando disabled (gate não liberado)', () => {
    assert.equal(shouldShowHelpHint(input({ enabled: false })), false);
  });
});