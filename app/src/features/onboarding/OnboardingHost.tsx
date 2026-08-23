/**
 * src/features/onboarding/OnboardingHost.tsx
 *
 * HOST do tutorial interativo — combina estado (useOnboarding), oferta de
 * primeira execução (useFirstRunTutorialPrompt), o modal de seleção e o overlay
 * posicionado. AUTO-SUSTENTADO: monta provider + oferta first-run + overlay.
 *
 * ── INTEGRAÇÃO (ONDA 13) ─────────────────────────────────────────────────────
 * Este host NÃO é montado no App/AppGate nesta onda (decisão do orquestrador,
 * p/ evitar conflito com a onda que toca App.tsx). A montagem acontece na
 * ONDA 13; a linha exata a adicionar (num lugar com acesso a `isReady` do gate
 * e à aba ativa do shell) é:
 *
 *   <OnboardingHost
 *     isReady={isReady}                 // fase do startup-gate === 'ready' (App liberado)
 *     activeView={activeTabKey}         // NavKey da aba ativa do shell (para a dica de navegação)
 *   />
 *
 * `isReady` deve vir do startup-gate: o onboarding só aparece DEPOIS do app
 * liberado (não durante o splash/setup). `activeView` é opcional — sem ele a
 * dica de "vá para a aba X" não é mostrada e steps de alvo ausente são pulados.
 *
 * REABERTA pelo usuário via `useOnboardingController().openFromHelp()` (para um
 * botão de ajuda) — ver index.ts.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactElement } from 'react';
import type { NavKey } from '../../lib/shellNav';
import { useOnboarding } from './hooks/useOnboarding';
import { useFirstRunTutorialPrompt } from './hooks/useFirstRunTutorialPrompt';
import { OnboardingOverlay } from './components/OnboardingOverlay';
import { TutorialSelectionModal } from './components/TutorialSelectionModal';
import type { OnboardingProgress } from './types/onboarding.types';
import { onboardingStorageService } from './services/onboardingStorage.service';

export interface OnboardingHostProps {
  /** App liberado (startup-gate). O onboarding NUNCA abre antes disso. */
  isReady: boolean;
  /** Aba ativa do shell (usada pela dica de navegação). Opcional. */
  activeView?: NavKey;
}

interface OnboardingControllerValue {
  /** Reabre o tutorial a partir do início (ex.: botão de ajuda). */
  openFromHelp: () => void;
  /** Progresso atual (ex.: badge 'em progresso'). */
  progress: OnboardingProgress;
}

const OnboardingController = createContext<OnboardingControllerValue | null>(null);

/** Hook consumido por quem quer reabrir o tutorial programaticamente. */
export function useOnboardingController(): OnboardingControllerValue {
  const ctx = useContext(OnboardingController);
  if (!ctx) {
    // Fallback stand-alone (sem provider): devolve stubs seguros.
    return { openFromHelp: () => {}, progress: onboardingStorageService.load() ?? { status: 'not_started', currentStepId: 'shell-app-title', updatedAt: 0 } };
  }
  return ctx;
}

export function OnboardingHost({ isReady, activeView }: OnboardingHostProps): ReactElement {
  const { state, actions } = useOnboarding();
  const [selectionOpen, setSelectionOpen] = useState(false);

  const openTutorialSelection = useCallback(() => setSelectionOpen(true), []);

  // Oferta de primeira execução: só dispara com o app liberado e estado novo.
  useFirstRunTutorialPrompt({
    enabled: isReady,
    onboardingStatus: state.progress.status,
    openTutorialSelection,
  });

  const startTutorial = useCallback(() => {
    setSelectionOpen(false);
    actions.startTutorial();
  }, [actions]);

  const controllerValue = useMemo<OnboardingControllerValue>(
    () => ({ openFromHelp: actions.openFromHelp, progress: state.progress }),
    [actions, state.progress],
  );

  return (
    <OnboardingController.Provider value={controllerValue}>
      <TutorialSelectionModal
        isOpen={selectionOpen}
        onClose={() => setSelectionOpen(false)}
        onStartTutorial={startTutorial}
      />
      <OnboardingOverlay
        isVisible={state.isVisible}
        currentStep={state.currentStep}
        currentStepIndex={state.currentStepIndex}
        totalSteps={state.totalSteps}
        isLastStep={state.isLastStep}
        activeView={activeView}
        onNext={actions.next}
        onSkip={actions.skip}
        onPause={actions.pause}
      />
    </OnboardingController.Provider>
  );
}