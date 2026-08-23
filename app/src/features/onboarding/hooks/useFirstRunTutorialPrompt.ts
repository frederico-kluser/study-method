/**
 * src/features/onboarding/hooks/useFirstRunTutorialPrompt.ts
 *
 * OFERTA de primeira execução do tutorial.
 *
 * Portado e ADAPTADO de `ondokai/.../useFirstRunTutorialPrompt.ts`. A primeira
 * vez que um usuário elegível chega ao app (gate liberado) com estado de
 * onboarding NOVO (`not_started`), abre o `TutorialSelectionModal` UMA vez —
 * o modal que pergunta se ele quer o tutorial (e permite dispensar).
 *
 * Dispara apenas quando:
 *  - `enabled` (sessão passada do startup-gate — ver `isReady` no OnboardingHost);
 *  - a oferta nunca foi mostrada (flag localStorage dedicada); e
 *  - `onboardingStatus === 'not_started'` (nunca engajou o tutorial nesta máquina —
 *    quem já rodou/pulou via o modal não é re-oferecido).
 *
 * One-shot entre sessões via `onboardingStorageService`; idempotente na sessão
 * via ref. StrictMode-safe: a flag é escrita SINCRONAMENTE ANTES de abrir o modal,
 * então o double-invoke de dev (e o re-render que o open dispara) não a dispara
 * duas vezes.
 */

import { useEffect, useRef } from 'react';
import type { OnboardingStatus } from '../types/onboarding.types';
import { onboardingStorageService } from '../services/onboardingStorage.service';
import { shouldOfferFirstRunTutorial } from './firstRunTutorial.rule';
import type { NavKey } from '../../../lib/shellNav';

interface UseFirstRunTutorialPromptParams {
  /** Mesma elegibilidade do onboarding: só para sessões passadas do gate. */
  enabled: boolean;
  /** O status do tutorial (`progress.status`). */
  onboardingStatus: OnboardingStatus;
  /** Aba ativa do shell — a oferta só abre na home. */
  activeView: NavKey;
  /** Abre o `TutorialSelectionModal`. */
  openTutorialSelection: () => void;
}

export function useFirstRunTutorialPrompt({
  enabled,
  onboardingStatus,
  activeView,
  openTutorialSelection,
}: UseFirstRunTutorialPromptParams): void {
  const firedRef = useRef(false);

  useEffect(() => {
    if (!enabled || firedRef.current) {
      return;
    }
    if (onboardingStorageService.wasTutorialSelectionOffered()) {
      firedRef.current = true;
      return;
    }
    if (
      activeView !== 'home' ||
      !shouldOfferFirstRunTutorial({
        enabled,
        alreadyOffered: false,
        onboardingStatus,
      })
    ) {
      return;
    }
    // Latch + persiste ANTES de abrir o modal (nota StrictMode acima).
    firedRef.current = true;
    onboardingStorageService.markTutorialSelectionOffered();
    openTutorialSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, onboardingStatus, activeView, openTutorialSelection]);
}