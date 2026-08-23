/**
 * src/features/onboarding/hooks/useOnboarding.ts
 *
 * Hook principal do tutorial interativo do Study Method.
 *
 * Portado e ADAPTADO de `ondokai/.../useInteractiveOnboarding.ts`. Removemos
 * todo o maquinário acoplado ao editor de workflows (snapshots de runtime,
 * expectedActions, áudio, deep-links de Settings, tutoriais dinâmicos) e
 * mantemos o núcleo que o overlay consome:
 *
 *   - progresso (status + step atual) com persistência em localStorage;
 *   - não auto-resume após recarregar (usuário reabre pelo botão de ajuda);
 *   - navegação next/skip/restart/pause (close);
 *   - primeiro step como ponto de entrada.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  FIRST_ONBOARDING_STEP_ID,
  ONBOARDING_STEPS,
  indexOfStepId,
} from '../constants/onboardingSteps';
import { onboardingStorageService } from '../services/onboardingStorage.service';
import type {
  OnboardingProgress,
  OnboardingStepDefinition,
} from '../types/onboarding.types';

function createDefaultProgress(): OnboardingProgress {
  return {
    status: 'not_started',
    currentStepId: FIRST_ONBOARDING_STEP_ID,
    updatedAt: Date.now(),
  };
}

export interface UseOnboardingResult {
  state: {
    /** O overlay deve estar visível (tutorial ativo e em progresso). */
    isVisible: boolean;
    progress: OnboardingProgress;
    currentStep: OnboardingStepDefinition;
    currentStepIndex: number;
    totalSteps: number;
    isStepTransitioning: boolean;
    /** True no último step (rótulo "Concluir"). */
    isLastStep: boolean;
  };
  actions: {
    next: () => void;
    skip: () => void;
    restart: () => void;
    pause: () => void;
    /** Reabre sempre do início (limpa o progresso salvo primeiro). */
    openFromHelp: () => void;
    startTutorial: () => void;
  };
}

export function useOnboarding(): UseOnboardingResult {
  const initialProgressRef = useRef<OnboardingProgress | null>(null);
  if (!initialProgressRef.current) {
    initialProgressRef.current = onboardingStorageService.load() ?? createDefaultProgress();
  }
  const [progress, setProgress] = useState<OnboardingProgress>(
    initialProgressRef.current ?? createDefaultProgress(),
  );
  // Nunca auto-resume no reload: o usuário deve reabrir pelo modal de seleção.
  const [isVisible, setIsVisible] = useState<boolean>(false);

  const currentStepIndex = useMemo(() => {
    const found = indexOfStepId(progress.currentStepId);
    return found >= 0 ? found : 0;
  }, [progress.currentStepId]);

  const currentStep = ONBOARDING_STEPS[currentStepIndex];
  const totalSteps = ONBOARDING_STEPS.length;

  const persist = useCallback((next: OnboardingProgress): void => {
    setProgress(next);
    onboardingStorageService.save(next);
  }, []);

  const advanceTo = useCallback(
    (index: number): void => {
      if (index >= totalSteps) {
        persist({
          status: 'completed',
          currentStepId: FIRST_ONBOARDING_STEP_ID,
          updatedAt: Date.now(),
        });
        setIsVisible(false);
        return;
      }
      persist({
        status: 'in_progress',
        currentStepId: ONBOARDING_STEPS[index].id,
        updatedAt: Date.now(),
      });
    },
    [persist, totalSteps],
  );

  const next = useCallback(() => {
    if (progress.status !== 'in_progress') {
      return;
    }
    advanceTo(currentStepIndex + 1);
  }, [advanceTo, currentStepIndex, progress.status]);

  const skip = useCallback(() => {
    persist({
      status: 'skipped',
      currentStepId: FIRST_ONBOARDING_STEP_ID,
      updatedAt: Date.now(),
    });
    setIsVisible(false);
  }, [persist]);

  const restart = useCallback(() => {
    persist({
      status: 'in_progress',
      currentStepId: FIRST_ONBOARDING_STEP_ID,
      updatedAt: Date.now(),
    });
    setIsVisible(true);
  }, [persist]);

  const pause = useCallback(() => {
    setIsVisible(false);
  }, []);

  const openFromHelp = useCallback(() => {
    // Sempre recomeça do passo 0 — nunca retoma de sessão anterior.
    onboardingStorageService.clear();
    persist({
      status: 'in_progress',
      currentStepId: FIRST_ONBOARDING_STEP_ID,
      updatedAt: Date.now(),
    });
    setIsVisible(true);
  }, [persist]);

  const startTutorial = useCallback(() => {
    onboardingStorageService.clear();
    persist({
      status: 'in_progress',
      currentStepId: FIRST_ONBOARDING_STEP_ID,
      updatedAt: Date.now(),
    });
    setIsVisible(true);
  }, [persist]);

  return {
    state: {
      isVisible,
      progress,
      currentStep,
      currentStepIndex,
      totalSteps,
      isStepTransitioning: false,
      isLastStep: currentStep.isLast === true || currentStepIndex === totalSteps - 1,
    },
    actions: {
      next,
      skip,
      restart,
      pause,
      openFromHelp,
      startTutorial,
    },
  };
}