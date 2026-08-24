/**
 * src/features/onboarding/hooks/useHelpHint.ts
 *
 * DICA pós-tutorial (hint): um mini-tour de 1 passo, exibido UMA vez, após o
 * usuário CONCLUIR OU PULAR o tutorial, na 1ª vez que ele chega à aba Aula
 * (`lesson`). Aponta o campo de assunto (`lesson-subject`) e diz "digite
 * qualquer dúvida". Reusa o caminho do hint in-memory do `useOnboarding`
 * (`startHelpHint`), sem tutorial novo/persistência. Flag one-shot separada
 * (`study-method-onboarding-help-hint-v1`) — re-rodar o tutorial não rearra.
 *
 * LATCH SÍNCRONO (StrictMode-safe): a flag é escrita e o `firedRef` marcado
 * ANTES do `startHelpHint` (double-invoke de dev não dispara duas vezes).
 */

import { useEffect, useRef } from 'react';
import type { OnboardingStatus } from '../types/onboarding.types';
import { onboardingStorageService } from '../services/onboardingStorage.service';
import type { NavKey } from '../../../lib/shellNav';
import { shouldShowHelpHint } from './helpHint.rule';

interface UseHelpHintParams {
  /** Sessão passada do startup-gate. */
  enabled: boolean;
  /** Aba ativa do shell. */
  activeView: NavKey;
  /** O status do tutorial (`progress.status`). */
  onboardingStatus: OnboardingStatus;
  /** Inicia o hint in-memory (1 passo) no `useOnboarding`. */
  startHelpHint: () => void;
}

export function useHelpHint({
  enabled,
  activeView,
  onboardingStatus,
  startHelpHint,
}: UseHelpHintParams): void {
  const firedRef = useRef(false);

  useEffect(() => {
    if (!enabled || firedRef.current) {
      return;
    }
    if (onboardingStorageService.wasHelpHintShown()) {
      firedRef.current = true;
      return;
    }
    const done = onboardingStatus === 'completed' || onboardingStatus === 'skipped';
    if (
      !shouldShowHelpHint({
        enabled,
        alreadyShown: false,
        onboardingStatus,
        activeView,
      })
    ) {
      return;
    }
    // Latch + persiste ANTES de iniciar o hint (StrictMode-safe).
    firedRef.current = true;
    onboardingStorageService.markHelpHintShown();
    startHelpHint();
  }, [enabled, activeView, onboardingStatus, startHelpHint]);
}