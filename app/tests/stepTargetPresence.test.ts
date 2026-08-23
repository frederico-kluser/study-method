/**
 * tests/stepTargetPresence.test.ts — ACHADO-1 ("Pular se alvo ausente").
 *
 * A regra do Ondokai é: um passo cujo alvo não existe no DOM é pulado (não
 * trava). Este teste cobre o núcleo puro de detecção em `stepTargetPresence`:
 *  - alvo presente ⇒ NÃO pula (aguarda a ação do passo);
 *  - alvo ausente e que NÃO pode nascer (id desconhecido / sempre-visível
 *    ausente) ⇒ PULA (avança) — evitando o dead-lock;
 *  - alvo ausente GATED por aba (ex.: challenge-editor/test-answer sem desafio
 *    ativo) ⇒ NÃO pula — o overlay fornece o fallback de "Continuar".
 * Sem jsdom (node:test + tsx); o `document` mínimo é injetado via globalThis.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  isStepTargetPresent,
  shouldAutoSkipStep,
  stepTargetIds,
} from '../src/features/onboarding/logic/stepTargetPresence';
import type { OnboardingStepDefinition } from '../src/features/onboarding/types/onboarding.types';

interface FlatNode {
  getAttribute(name: string): string | null;
}

/** Monta um `document` mínimo (`querySelectorAll`) que enumera alvos presentes. */
function installDocument(targetIds: string[]): void {
  const nodes: FlatNode[] = targetIds.map((id) => ({
    getAttribute: (name: string) =>
      name === 'data-onboarding-target' ? id : null,
  }));
  (globalThis as unknown as { document: unknown }).document = {
    querySelectorAll: (selector: string): FlatNode[] =>
      selector === '[data-onboarding-target]' ? nodes : [],
  };
}

interface TargetDocument {
  querySelectorAll(selector: string): FlatNode[];
}

function removeDocument(): void {
  delete (globalThis as unknown as { document?: TargetDocument }).document;
}

function step(over: Partial<OnboardingStepDefinition>): OnboardingStepDefinition {
  return {
    id: 'challenge-test-answer',
    chapterId: 'challenge',
    titleKey: 'translation:tutorial.steps.challengeTestAnswer.title',
    descriptionKey: 'translation:tutorial.steps.challengeTestAnswer.description',
    targetSelector: '[data-onboarding-target="challenge-test-answer"]',
    expectedAction: 'test-answer',
    hideContinueButton: true,
    ...over,
  };
}

describe('stepTargetIds', () => {
  it('lê o primário e o alternativo (alt tentado antes)', () => {
    const s = step({
      targetSelector: '[data-onboarding-target="challenge-editor"]',
      alternateTargetSelector: '[data-onboarding-target="challenge-terminal"]',
    });
    const ids = stepTargetIds(s);
    assert.deepEqual(ids, ['challenge-terminal', 'challenge-editor']);
  });

  it('não duplica ids', () => {
    const s = step({
      targetSelector: '[data-onboarding-target="challenge-editor"]',
      alternateTargetSelector: '[data-onboarding-target="challenge-editor"]',
    });
    assert.deepEqual(stepTargetIds(s), ['challenge-editor']);
  });
});

describe('isStepTargetPresent', () => {
  beforeEach(() => removeDocument());
  afterEach(() => removeDocument());

  it('true quando o alvo do passo está montado no DOM', () => {
    installDocument(['app-title', 'challenge-test-answer']);
    assert.equal(isStepTargetPresent(step({})), true);
  });

  it('false quando o alvo do passo NÃO está montado', () => {
    installDocument(['app-title']);
    assert.equal(isStepTargetPresent(step({})), false);
  });

  it('false sem document (nope/nó)', () => {
    removeDocument();
    assert.equal(isStepTargetPresent(step({})), false);
  });
});

describe('shouldAutoSkipStep (ACHADO-1)', () => {
  beforeEach(() => removeDocument());
  afterEach(() => removeDocument());

  it('NÃO pula quando o alvo está PRESENTE (aguarda a ação)', () => {
    installDocument(['challenge-test-answer']);
    assert.equal(shouldAutoSkipStep(step({})), false);
  });

  it('PULA quando o passo não tem alvo detectável', () => {
    const s = step({ targetSelector: 'no data-onboarding-target here' });
    assert.equal(shouldAutoSkipStep(s), true);
  });

  it('PULA alvo ausente cujo id é DESCONHECIDO do catálogo (nunca nasce)', () => {
    installDocument([]);
    const s = step({ targetSelector: '[data-onboarding-target="ghost-target"]' });
    assert.equal(shouldAutoSkipStep(s), true);
  });

  it('PULA alvo "everywhere" ausente (não vira por ação do usuário)', () => {
    installDocument([]);
    const s = step({ targetSelector: '[data-onboarding-target="nav-tabs"]' });
    assert.equal(shouldAutoSkipStep(s), true);
  });

  it('NÃO pula alvo ausente GATED por aba (ex.: challenge sem desafio ativo) — usa fallback de Continuar', () => {
    // challenge-test-answer só monta com desafio ATIVO; sem ele, o alvo está
    // ausente MAS pode nascer quando o usuário selecionar um desafio → NÃO pula.
    installDocument([]);
    assert.equal(shouldAutoSkipStep(step({})), false);
  });
});