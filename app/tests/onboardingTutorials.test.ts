/**
 * tests/onboardingTutorials.test.ts — Quick Start vs Tutorial Completo (onda 16).
 *
 * Valida o que diferencia os DOIS tutoriais do modal de seleção:
 *  - o Completo exige setup de chaves (tem o passo `settings-keys-fill`), o
 *    Quick Start NÃO — é a essência do gate `hasKeys` no TutorialSelectionModal;
 *  - o Quick Start é mais curto (tur informativo) do que o Completo;
 *  - steps compartilhados reutilizam o MESMO id (e não duplicam conteúdo);
 *  - os ids de ambos os arrays são válidos para o storage (persistência cobre
 *    os dois). Sem jsdom.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ONBOARDING_STEPS,
  ONBOARDING_CHAPTERS,
  FIRST_ONBOARDING_STEP_ID,
} from '../src/features/onboarding/constants/onboardingSteps';
import {
  QUICK_START_STEPS,
  QUICK_START_CHAPTERS,
  FIRST_QUICK_START_STEP_ID,
} from '../src/features/onboarding/constants/quickStartSteps';
import { onboardingStorageService } from '../src/features/onboarding/services/onboardingStorage.service';

describe('Quick Start vs Tutorial Completo', () => {
  it('Quick Start é mais curto que o Completo (fluxo informativo)', () => {
    assert.ok(QUICK_START_STEPS.length > 0, 'quick start não pode ser vazio');
    assert.ok(
      QUICK_START_STEPS.length < ONBOARDING_STEPS.length,
      `Quick Start (${QUICK_START_STEPS.length}) deve ser menor que Completo (${ONBOARDING_STEPS.length})`,
    );
  });

  it('Completo tem o passo de setup de chaves; Quick Start NÃO (gate hasKeys)', () => {
    const completeHasKeysStep = ONBOARDING_STEPS.some((s) => s.id === 'settings-keys-fill');
    const qsHasKeysStep = QUICK_START_STEPS.some((s) => s.id === 'settings-keys-fill');
    assert.equal(completeHasKeysStep, true, 'Completo deve guiar o setup de chaves');
    assert.equal(qsHasKeysStep, false, 'Quick Start NÃO deve exigir chaves');
  });

  it('ambos começam no mesmo shell step (entrada compartilhada)', () => {
    assert.equal(FIRST_ONBOARDING_STEP_ID, 'shell-app-title');
    assert.equal(FIRST_QUICK_START_STEP_ID, 'shell-app-title');
  });

  it('Quick Start reutiliza o shell step compartilhado com o Completo', () => {
    const completeIds = new Set(ONBOARDING_STEPS.map((s) => s.id));
    const qsShared = QUICK_START_STEPS.filter((s) => completeIds.has(s.id));
    assert.ok(qsShared.length >= 1, 'Quick Start deve reutilizar steps do Completo');
    // E identifica pela presença de ids exclusivos `qs-*`.
    assert.ok(
      QUICK_START_STEPS.some((s) => s.id.startsWith('qs-')),
      'Quick Start deve ter steps exclusivos qs-*',
    );
  });

  it('Quick Start é resolvível pelo storage (ids no allow-list)', () => {
    // Um id do Quick Start não pode resetar o payload (é conhecido).
    const qsId = QUICK_START_STEPS[QUICK_START_STEPS.length - 1]!.id;
    // save/load com id de quick start deve round-trip (ids conhecidos).
    const fake = new Map<string, string>();
    const prev = (globalThis as { localStorage?: unknown }).localStorage;
    (globalThis as { localStorage: unknown }).localStorage = {
      getItem: (k: string) => fake.get(k) ?? null,
      setItem: (k: string, v: string): void => { fake.set(k, v); },
      removeItem: (k: string): void => { fake.delete(k); },
    };
    try {
      onboardingStorageService.save({ status: 'in_progress', currentStepId: qsId, updatedAt: 1 });
      const loaded = onboardingStorageService.load();
      assert.equal(loaded?.currentStepId, qsId);
    } finally {
      if (prev === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
      else (globalThis as { localStorage: unknown }).localStorage = prev;
    }
  });

  it('capítulos do Quick Start usam chaves i18n válidas do completo', () => {
    const chapterKeys = QUICK_START_CHAPTERS.map((c) => c.titleKey);
    const knownKeys = new Set(ONBOARDING_CHAPTERS.map((c) => c.titleKey));
    for (const k of chapterKeys) {
      assert.ok(knownKeys.has(k), `capítulo ${k} deve existir no completo`);
    }
  });
});