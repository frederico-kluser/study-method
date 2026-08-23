/**
 * src/features/onboarding/services/onboardingStorage.service.ts
 *
 * PERSISTÊNCIA do tutorial em localStorage.
 *
 * Portado e ADAPTADO de `ondokai/.../onboardingStorage.service.ts`. Mesmo
 * desenho: payload único de progresso (com version para migrações) + flags
 * one-shot SEPARADAS para não rearmar efeitos:
 *
 *   - `study-method-onboarding-v1`            → progresso (status + step atual);
 *   - `study-method-onboarding-help-hint-v1`  → dica pós-tutorial (reservada);
 *   - `study-method-onboarding-offered-v1`    → oferta de primeira execução já mostrada.
 *
 * Flags separadas preservam o comportamento do Ondokai: dismiss da oferta NÃO
 * toca o progresso, e `clear()` não rearra a oferta. A validação de payload
 * rejeita step/status desconhecidos (dados corrompidos são descartados).
 *
 * Nota de ambiente: lê o storage via `globalThis.localStorage` (no renderer é o
 * `window.localStorage`; em node:test sem jsdom um fake é injetado em
 * `globalThis.localStorage` — mesmo padrão de src/i18n/index.ts).
 *
 * Testado em tests/onboardingStorage.test.ts (node:test, sem jsdom).
 */

import {
  ONBOARDING_STEPS,
} from '../constants/onboardingSteps';
import {
  QUICK_START_STEPS,
} from '../constants/quickStartSteps';
import type {
  OnboardingProgress,
  OnboardingStatus,
  OnboardingStepId,
  OnboardingStoragePayload,
} from '../types/onboarding.types';

const ONBOARDING_STORAGE_KEY = 'study-method-onboarding-v1';
const ONBOARDING_STORAGE_VERSION = 1;

const HELP_HINT_STORAGE_KEY = 'study-method-onboarding-help-hint-v1';

const TUTORIAL_SELECTION_OFFERED_KEY = 'study-method-onboarding-offered-v1';

const VALID_ONBOARDING_STATUSES = new Set<OnboardingStatus>([
  'not_started',
  'in_progress',
  'completed',
  'skipped',
]);

const VALID_ONBOARDING_STEP_IDS = new Set<OnboardingStepId>([
  ...ONBOARDING_STEPS.map((s) => s.id as OnboardingStepId),
  ...QUICK_START_STEPS.map((s) => s.id as OnboardingStepId),
]);

/** Forma mínima de localStorage usada nas leituras/escritas. */
interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function storage(): StorageLike | null {
  try {
    return (globalThis as { localStorage?: StorageLike }).localStorage ?? null;
  } catch {
    return null;
  }
}

function isValidPayload(payload: unknown): payload is OnboardingStoragePayload {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const candidate = payload as Partial<OnboardingStoragePayload>;

  if (candidate.version !== ONBOARDING_STORAGE_VERSION) {
    return false;
  }
  if (!candidate.status || !VALID_ONBOARDING_STATUSES.has(candidate.status as OnboardingStatus)) {
    return false;
  }
  if (!candidate.currentStepId || !VALID_ONBOARDING_STEP_IDS.has(candidate.currentStepId as OnboardingStepId)) {
    return false;
  }

  return typeof candidate.updatedAt === 'number' && Number.isFinite(candidate.updatedAt);
}

export const onboardingStorageService = {
  load(): OnboardingProgress | null {
    const ls = storage();
    if (!ls) {
      return null;
    }

    try {
      const raw = ls.getItem(ONBOARDING_STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (!isValidPayload(parsed)) {
        ls.removeItem(ONBOARDING_STORAGE_KEY);
        return null;
      }
      return {
        status: parsed.status,
        currentStepId: parsed.currentStepId,
        updatedAt: parsed.updatedAt,
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[onboardingStorageService] Failed to load onboarding state', error);
      return null;
    }
  },

  save(progress: OnboardingProgress): void {
    const ls = storage();
    if (!ls) {
      return;
    }
    try {
      const payload: OnboardingStoragePayload = {
        ...progress,
        version: ONBOARDING_STORAGE_VERSION,
      };
      ls.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[onboardingStorageService] Failed to persist onboarding state', error);
    }
  },

  clear(): void {
    const ls = storage();
    if (!ls) {
      return;
    }
    ls.removeItem(ONBOARDING_STORAGE_KEY);
  },

  /** Dica pós-tutorial (one-shot) — se já foi mostrada. */
  wasHelpHintShown(): boolean {
    const ls = storage();
    if (!ls) {
      return false;
    }
    try {
      return ls.getItem(HELP_HINT_STORAGE_KEY) === 'true';
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[onboardingStorageService] Failed to read help-hint flag', error);
      return false;
    }
  },

  markHelpHintShown(): void {
    const ls = storage();
    if (!ls) {
      return;
    }
    try {
      ls.setItem(HELP_HINT_STORAGE_KEY, 'true');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[onboardingStorageService] Failed to persist help-hint flag', error);
    }
  },

  /** Oferta de primeira execução (one-shot) — se já foi oferecida. */
  wasTutorialSelectionOffered(): boolean {
    const ls = storage();
    if (!ls) {
      return false;
    }
    try {
      return ls.getItem(TUTORIAL_SELECTION_OFFERED_KEY) === 'true';
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[onboardingStorageService] Failed to read tutorial-offer flag', error);
      return false;
    }
  },

  markTutorialSelectionOffered(): void {
    const ls = storage();
    if (!ls) {
      return;
    }
    try {
      ls.setItem(TUTORIAL_SELECTION_OFFERED_KEY, 'true');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[onboardingStorageService] Failed to persist tutorial-offer flag', error);
    }
  },
};

/** Export puro para validar payloads em testes (isValidPayload é interno p/ o service). */
export function isValidOnboardingPayload(payload: unknown): payload is OnboardingStoragePayload {
  return isValidPayload(payload);
}