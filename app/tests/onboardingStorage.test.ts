/**
 * tests/onboardingStorage.test.ts — testes PUROS do storage do tutorial.
 *
 * Porta os testes do Ondokai (onboardingStorage.service) para node:test + tsx
 * SEM jsdom (padrão do Study Method). Cobre:
 *   - round-trip save/load/clear;
 *   - validação de payload (rejeita status/step/versão inválidos);
 *   - flags one-shot separadas (offer + help-hint) e sua independência do
 *     progresso (dismiss da oferta NÃO toca progresso; clear NÃO rearra oferta).
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { onboardingStorageService } from '../src/features/onboarding/services/onboardingStorage.service';
import { FIRST_ONBOARDING_STEP_ID } from '../src/features/onboarding/constants/onboardingSteps';
import type {
  OnboardingProgress,
  OnboardingStatus,
} from '../src/features/onboarding/types/onboarding.types';

/** localStorage fake em memória, injetado em globalThis (sem jsdom). */
function installStorage(): { storage: Map<string, string>; restore: () => void } {
  const storage = new Map<string, string>();
  const fake = {
    getItem(k: string): string | null {
      return storage.has(k) ? (storage.get(k) as string) : null;
    },
    setItem(k: string, v: string): void {
      storage.set(k, v);
    },
    removeItem(k: string): void {
      storage.delete(k);
    },
  };
  const prev = (globalThis as { localStorage?: unknown }).localStorage;
  (globalThis as { localStorage: unknown }).localStorage = fake;
  return {
    storage,
    restore: () => {
      if (prev === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
      else (globalThis as { localStorage: unknown }).localStorage = prev;
    },
  };
}

let env: ReturnType<typeof installStorage>;

beforeEach(() => {
  env = installStorage();
});

describe('onboardingStorageService: round-trip de progresso', () => {
  it('load() retorna null quando nada salvo', () => {
    assert.equal(onboardingStorageService.load(), null);
  });

  it('save() + load() fazem round-trip na chave certa', () => {
    const progress: OnboardingProgress = {
      status: 'in_progress',
      currentStepId: 'shell-theme-toggle',
      updatedAt: 1234,
    };
    onboardingStorageService.save(progress);
    const loaded = onboardingStorageService.load();
    assert.deepEqual(loaded, progress);
    // A chave persistida é a específica do Study Method.
    assert.ok(Array.from(env.storage.keys()).some((k) => k.includes('study-method-onboarding')));
  });

  it('clear() remove o progresso salvo', () => {
    onboardingStorageService.save({
      status: 'completed',
      currentStepId: FIRST_ONBOARDING_STEP_ID,
      updatedAt: 1,
    });
    onboardingStorageService.clear();
    assert.equal(onboardingStorageService.load(), null);
  });

  it('load() discarda payload corrompido/caçato (status inválido)', () => {
    env.storage.set(
      'study-method-onboarding-v1',
      JSON.stringify({ version: 1, status: 'bogus', currentStepId: FIRST_ONBOARDING_STEP_ID, updatedAt: 1 }),
    );
    assert.equal(onboardingStorageService.load(), null);
    assert.equal(onboardingStorageService.load(), null, 'payload inválido é removido');
  });

  it('rejeita step desconhecido', () => {
    env.storage.set(
      'study-method-onboarding-v1',
      JSON.stringify({ version: 1, status: 'in_progress', currentStepId: 'nope', updatedAt: 1 }),
    );
    assert.equal(onboardingStorageService.load(), null);
  });

  it('rejeita version divergente', () => {
    env.storage.set(
      'study-method-onboarding-v1',
      JSON.stringify({ version: 99, status: 'in_progress', currentStepId: FIRST_ONBOARDING_STEP_ID, updatedAt: 1 }),
    );
    assert.equal(onboardingStorageService.load(), null);
  });

  it('rejeita updatedAt não-numérico', () => {
    env.storage.set(
      'study-method-onboarding-v1',
      JSON.stringify({ version: 1, status: 'in_progress', currentStepId: FIRST_ONBOARDING_STEP_ID, updatedAt: 'x' }),
    );
    assert.equal(onboardingStorageService.load(), null);
  });

  it('aceita TODOS os status válidos', () => {
    const valid: OnboardingStatus[] = ['not_started', 'in_progress', 'completed', 'skipped'];
    for (const status of valid) {
      env.storage.clear();
      onboardingStorageService.save({ status, currentStepId: FIRST_ONBOARDING_STEP_ID, updatedAt: 1 });
      const loaded = onboardingStorageService.load();
      assert.equal(loaded?.status, status);
    }
  });
});

describe('onboardingStorageService: flags one-shot independentes', () => {
  it('wasTutorialSelectionOffered começa false e markTutorialSelectionOffered trava', () => {
    assert.equal(onboardingStorageService.wasTutorialSelectionOffered(), false);
    onboardingStorageService.markTutorialSelectionOffered();
    assert.equal(onboardingStorageService.wasTutorialSelectionOffered(), true);
  });

  it('wasHelpHintShown começa false e markHelpHintShown trava', () => {
    assert.equal(onboardingStorageService.wasHelpHintShown(), false);
    onboardingStorageService.markHelpHintShown();
    assert.equal(onboardingStorageService.wasHelpHintShown(), true);
  });

  it('dismiss da oferta (offer) NÃO toca o progresso do tutorial', () => {
    onboardingStorageService.save({ status: 'in_progress', currentStepId: 'lesson-subject-fill', updatedAt: 7 });
    onboardingStorageService.markTutorialSelectionOffered();
    const loaded = onboardingStorageService.load();
    assert.equal(loaded?.status, 'in_progress');
    assert.equal(loaded?.currentStepId, 'lesson-subject-fill');
  });

  it('clear() (progresso) NÃO rearra a oferta de primeira execução', () => {
    onboardingStorageService.markTutorialSelectionOffered();
    onboardingStorageService.clear();
    assert.equal(onboardingStorageService.wasTutorialSelectionOffered(), true, 'offer é independente do progresso');
  });

  it('clear() NÃO desarma a flag de help-hint', () => {
    onboardingStorageService.markHelpHintShown();
    onboardingStorageService.clear();
    assert.equal(onboardingStorageService.wasHelpHintShown(), true);
  });
});

describe('onboardingStorageService: sem localStorage (node:test sem jsdom)', () => {
  it('save/load são no-ops seguros quando localStorage não existe', () => {
    env.restore(); // remove o fake → volta a ausência (ou fake anterior vazio)
    assert.equal(onboardingStorageService.load(), null);
    assert.equal(onboardingStorageService.wasTutorialSelectionOffered(), false);
    assert.doesNotThrow(() => {
      onboardingStorageService.save({ status: 'skipped', currentStepId: FIRST_ONBOARDING_STEP_ID, updatedAt: 1 });
      onboardingStorageService.markTutorialSelectionOffered();
    });
  });
});