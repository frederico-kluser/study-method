/**
 * src/features/onboarding/OnboardingHost.tsx
 *
 * HOST do tutorial interativo — combina estado (useOnboarding), oferta de
 * primeira execução (useFirstRunTutorialPrompt), dica pós-tutorial (useHelpHint),
 * o modal de seleção (com gate de chaves) e o overlay.
 *
 * AUTO-SUSTENTADO: monta a lógica + oferta first-run + overlay. Recebe do App:
 *  - `isReady` (startup-gate liberado) — o onboarding nunca abre antes disso;
 *  - `activeView` (NavKey da aba ativa) — guia steps e dica de navegação;
 *  - `onNavigateView` — para o CTA "Configurar chaves" navegar à aba Settings
 *    (o host não possui o estado de navegação do shell).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactElement } from 'react';
import type { NavKey } from '../../lib/shellNav';
import { getApi } from '../../lib/apiBridge';
import { useOnboarding } from './hooks/useOnboarding';
import { useFirstRunTutorialPrompt } from './hooks/useFirstRunTutorialPrompt';
import { useHelpHint } from './hooks/useHelpHint';
import { OnboardingOverlay } from './components/OnboardingOverlay';
import { TutorialSelectionModal } from './components/TutorialSelectionModal';
import type { OnboardingProgress, OnboardingTutorialId } from './types/onboarding.types';
import { onboardingStorageService } from './services/onboardingStorage.service';

export interface OnboardingHostProps {
  /** App liberado (startup-gate). O onboarding NUNCA abre antes disso. */
  isReady: boolean;
  /** Aba ativa do shell (usada pela dica de navegação). */
  activeView?: NavKey;
  /** Navega o shell para uma aba (CTA "Configurar chaves" → settings). */
  onNavigateView?: (view: NavKey) => void;
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
    return {
      openFromHelp: () => {},
      progress: onboardingStorageService.load() ?? { status: 'not_started', currentStepId: 'shell-app-title', updatedAt: 0 },
    };
  }
  return ctx;
}

export function OnboardingHost({ isReady, activeView = 'home', onNavigateView }: OnboardingHostProps): ReactElement {
  const { state, actions } = useOnboarding({ activeView });
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [hasKeys, setHasKeys] = useState(true);

  // Gate do Tutorial Completo: chaves OpenRouter + Brave preenchidas. Leitura
  // assíncrona (IPC) — default true até resolver p/ não bloquear a 1ª open.
  const refreshKeys = useCallback(() => {
    getApi()
      .keys.getStatus()
      .then((s) => setHasKeys(Boolean(s.llmConfigured && s.braveConfigured)))
      .catch(() => setHasKeys(true));
  }, []);

  useEffect(() => {
    if (isReady) refreshKeys();
  }, [isReady, refreshKeys]);

  const openTutorialSelection = useCallback(() => setSelectionOpen(true), []);

  // Oferta de primeira execução: só com app liberado, estado novo e na home.
  useFirstRunTutorialPrompt({
    enabled: isReady,
    onboardingStatus: state.progress.status,
    activeView,
    openTutorialSelection,
  });

  // Dica pós-tutorial: 1ª vez na aba Aula após concluir/pular.
  useHelpHint({
    enabled: isReady,
    activeView,
    onboardingStatus: state.progress.status,
    startHelpHint: actions.startHelpHint,
  });

  const startTutorial = useCallback(
    (tutorialId: OnboardingTutorialId) => {
      setSelectionOpen(false);
      actions.startTutorial(tutorialId);
    },
    [actions],
  );

  const controllerValue = useMemo<OnboardingControllerValue>(
    () => ({ openFromHelp: actions.openFromHelp, progress: state.progress }),
    [actions, state.progress],
  );

  return (
    <OnboardingController.Provider value={controllerValue}>
      <TutorialSelectionModal
        isOpen={selectionOpen}
        onClose={() => setSelectionOpen(false)}
        onSelectTutorial={startTutorial}
        hasKeys={hasKeys}
        onOpenSettings={() => onNavigateView?.('settings')}
      />
      <OnboardingOverlay
        isVisible={state.isVisible}
        currentStep={state.currentStep}
        currentStepIndex={state.currentStepIndex}
        totalSteps={state.totalSteps}
        currentChapterIndex={state.currentChapterIndex}
        totalChapters={state.totalChapters}
        currentChapterTitleKey={state.currentChapterTitleKey}
        isLastStep={state.isLastStep}
        isActionSatisfied={state.isActionSatisfied}
        canAdvance={state.canAdvance}
        isStepTransitioning={state.isStepTransitioning}
        activeView={activeView}
        isAudioMuted={state.isAudioMuted}
        onToggleMute={actions.toggleMute}
        onNext={actions.next}
        onSkip={actions.skip}
        onPause={actions.pause}
      />
    </OnboardingController.Provider>
  );
}