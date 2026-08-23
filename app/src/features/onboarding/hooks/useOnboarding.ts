/**
 * src/features/onboarding/hooks/useOnboarding.ts
 *
 * Hook principal do tutorial interativo do Study Method (onda 16).
 *
 * Refaz fiel ao Ondokai (`useInteractiveOnboarding.ts`):
 *  - DOIS tutoriais (completo `first-workflow` / `quick-start`), resolvidos por
 *    `activeTutorialId`, com steps e capítulos compartilhados + exclusivos;
 *  - AVALIAÇÃO por snapshot: `createSnapshot(context)` no início de cada passo e
 *    `evaluateStepAction(step, snapshot, context)` a cada mudança de contexto;
 *    quando satisfeita, AUTO-AVANÇA após ~220ms. Sem expectedAction ⇒ "Continuar".
 *  - contexto de runtime construído da aba ativa do shell + leituras de DOM
 *    confiáveis (campo de assunto, sinais de geração/teste, editor, chaves);
 *  - persistência via `onboardingStorageService`; NUNCA auto-resume no reload
 *    (o usuário reabre pelo modal de seleção / botão de ajuda);
 *  - navegação next/skip/restart/pause + startTutorial(tutorialId);
 *  - hint pós-tutorial via `startDynamicHint` (1 passo in-memory apontando o
 *    campo de assunto) e áudio de narração por step (ver audio service).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FIRST_ONBOARDING_STEP_ID,
  ONBOARDING_CHAPTERS,
  ONBOARDING_STEPS,
} from '../constants/onboardingSteps';
import {
  FIRST_QUICK_START_STEP_ID,
  QUICK_START_CHAPTERS,
  QUICK_START_STEPS,
} from '../constants/quickStartSteps';
import { createSnapshot, evaluateStepAction, hasExpectedAction } from '../logic/evaluateStepAction';
import {
  isStepTargetPresent,
  shouldAutoSkipStep,
} from '../logic/stepTargetPresence';
import { buildRuntimeContext } from '../logic/onboardingSignals';
import {
  isAudioMuted,
  setAudioMuted,
  speakOnboardingText,
  stopOnboardingAudio,
} from '../services/onboardingAudio.service';
import { onboardingStorageService } from '../services/onboardingStorage.service';
import type {
  OnboardingProgress,
  OnboardingRuntimeContext,
  OnboardingStepDefinition,
  OnboardingStepSnapshot,
  OnboardingTutorialId,
} from '../types/onboarding.types';
import type { NavKey } from '../../../lib/shellNav';

/** Delay do auto-avanço após a ação ser satisfeita (ms), igual ao ondokai. */
const AUTO_ADVANCE_MS = 220;

type SnapshotMap = Partial<Record<string, OnboardingStepSnapshot>>;

function createDefaultProgress(): OnboardingProgress {
  return {
    status: 'not_started',
    currentStepId: FIRST_ONBOARDING_STEP_ID,
    updatedAt: Date.now(),
  };
}

interface UseOnboardingParams {
  /** Aba ativa do shell (builda o contexto de runtime + guia os steps). */
  activeView: NavKey;
}

export interface UseOnboardingResult {
  state: {
    isVisible: boolean;
    progress: OnboardingProgress;
    activeTutorialId: OnboardingTutorialId;
    currentStep: OnboardingStepDefinition;
    currentStepIndex: number;
    totalSteps: number;
    currentChapterIndex: number;
    totalChapters: number;
    currentChapterTitleKey: string;
    isActionSatisfied: boolean;
    canAdvance: boolean;
    isStepTransitioning: boolean;
    isLastStep: boolean;
    /** True no hint pós-tutorial (sem perdas; conteúdo especial). */
    isHelpHint: boolean;
    /** Contexto runtime atual (para debug/status). */
    context: OnboardingRuntimeContext;
    /** Narração disponível no passo atual (controla os controles de áudio). */
    isAudioMuted: boolean;
  };
  actions: {
    next: () => void;
    skip: () => void;
    restart: () => void;
    pause: () => void;
    openFromHelp: () => void;
    startTutorial: (tutorialId: OnboardingTutorialId) => void;
    /** Inicia o hint pós-tutorial (1 passo) — in-memory. */
    startHelpHint: () => void;
    toggleMute: () => void;
  };
}

export function useOnboarding({ activeView }: UseOnboardingParams): UseOnboardingResult {
  const initialProgressRef = useRef<OnboardingProgress | null>(null);
  if (!initialProgressRef.current) {
    initialProgressRef.current = onboardingStorageService.load() ?? createDefaultProgress();
  }
  const [progress, setProgress] = useState<OnboardingProgress>(
    initialProgressRef.current ?? createDefaultProgress(),
  );
  // Nunca auto-resume no reload: usuário reabre pelo modal/botão de ajuda.
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const [activeTutorialId, setActiveTutorialId] = useState<OnboardingTutorialId>('first-workflow');
  // Hint pós-tutorial: array in-memory (não persistido), como o ondokai.
  const [hintSteps, setHintSteps] = useState<OnboardingStepDefinition[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotMap>({});
  const [isAutoAdvancing, setIsAutoAdvancing] = useState(false);
  const autoAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Contexto runtime atual (polling leve + aba ativa).
  const [context, setContext] = useState<OnboardingRuntimeContext>(() =>
    buildRuntimeContext(activeView) as OnboardingRuntimeContext,
  );

  const isHelpHint = hintSteps.length > 0;

  const clearAutoAdvance = useCallback(() => {
    if (autoAdvanceRef.current) {
      clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
  }, []);

  // Atualiza o snapshot do step atual quando ele entra em progresso.
  const currentStepId = progress.currentStepId;

  // Resolve steps/capítulos/firstStep conforme o tutorial ativo.
  const activeSteps: readonly OnboardingStepDefinition[] = isHelpHint
    ? hintSteps
    : activeTutorialId === 'quick-start'
      ? QUICK_START_STEPS
      : ONBOARDING_STEPS;
  const activeChapters = isHelpHint
    ? ONBOARDING_CHAPTERS
    : activeTutorialId === 'quick-start'
      ? QUICK_START_CHAPTERS
      : ONBOARDING_CHAPTERS;
  const firstStepId = activeSteps[0]?.id ?? FIRST_ONBOARDING_STEP_ID;

  const currentStepIndex = useMemo(() => {
    // O hint aponta pro único step; os tutoriais resolvem por índice real.
    if (isHelpHint) return 0;
    const found = activeSteps.findIndex((s) => s.id === currentStepId);
    return found >= 0 ? found : 0;
  }, [activeSteps, currentStepId, isHelpHint]);

  const currentStep = activeSteps[currentStepIndex];

  // Presença do alvo do passo atual no DOM (usada p/ o fallback de "Continuar"
  // e a regra de auto-skip "alvo ausente" — ACHADO-1). Declarado DEPOIS de
  // `currentStep` (o inicializador lazy o referencia).
  const [stepTargetPresent, setStepTargetPresent] = useState<boolean>(() =>
    isStepTargetPresent(currentStep),
  );

  const totalSteps = activeSteps.length;
  const currentChapterIndex = Math.max(
    0,
    activeChapters.findIndex((c) => c.id === currentStep.chapterId),
  );
  const currentChapterTitleKey = activeChapters[currentChapterIndex].titleKey;
  const totalChapters = activeChapters.length;
  const isLastStep = currentStep.isLast === true || currentStepIndex === totalSteps - 1;
  const hasAction = hasExpectedAction(currentStep);

  // Mongeia o contexto de runtime a partir do DOM (sinais das views) + aba ativa.
  useEffect(() => {
    let rafId: number | null = null;
    let disposed = false;

    const sync = () => {
      if (disposed) return;
      const next = buildRuntimeContext(activeView) as OnboardingRuntimeContext;
      setContext((prev) => {
        // Evita re-renders desnecessários: só seta quando algo mudar.
        if (
          prev.activeView === next.activeView &&
          prev.lessonSubjectNonEmpty === next.lessonSubjectNonEmpty &&
          prev.lessonRunningOrDone === next.lessonRunningOrDone &&
          prev.studioCodeNonEmpty === next.studioCodeNonEmpty &&
          prev.testAnswerTriggered === next.testAnswerTriggered &&
          prev.keysFilled === next.keysFilled
        ) {
          return prev;
        }
        return next;
      });
      setStepTargetPresent((prev) => {
        const present = isStepTargetPresent(currentStep);
        return prev === present ? prev : present;
      });
      if (!disposed) rafId = window.requestAnimationFrame(sync);
    };

    sync();
    return () => {
      disposed = true;
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, currentStep.id, currentStep.targetSelector, currentStep.alternateTargetSelector]);

  // Cria snapshot do step quando ele ativa (in_progress + visível).
  useEffect(() => {
    if (progress.status !== 'in_progress' || !isVisible) return;
    setSnapshots((prev) => {
      if (prev[currentStep.id]) return prev;
      return { ...prev, [currentStep.id]: createSnapshot(context) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress.status, isVisible, currentStep.id]);

  const currentSnapshot = snapshots[currentStep.id] ?? context;

  // Avalia a ação esperada vs snapshot+contexto.
  const isActionSatisfied = useMemo(
    () =>
      hasAction
        ? evaluateStepAction(currentStep, currentSnapshot, context)
        : false,
    [currentStep, currentSnapshot, context, hasAction],
  );

  // Presença do alvo: quando AUSENTE num passo de `expectedAction`, o step não
  // pode ser satisfeito por ação (não há onde focar) — fornecemos o FALLBACK de
  // "Continuar" (ACHADO-1b) para NUNCA travar. O auto-skip (ACHADO-1a) cobre os
  // alvos que não podem nascer na view atual.
  const targetAbsentFallback = hasAction && !stepTargetPresent;
  const stepShouldAutoSkip = useMemo(
    () => (hasAction ? shouldAutoSkipStep(currentStep) : false),
    [currentStep, hasAction],
  );

  const canAdvance = !hasAction || isActionSatisfied || targetAbsentFallback;

  // Persiste o progresso sempre que muda (exceto hint in-memory).
  useEffect(() => {
    if (isHelpHint) return;
    onboardingStorageService.save(progress);
  }, [progress, isHelpHint]);

  const persist = useCallback((next: OnboardingProgress): void => {
    setProgress(next);
  }, []);

  const advanceStep = useCallback(() => {
    if (progress.status !== 'in_progress') return;
    const nextIndex = currentStepIndex + 1;
    if (nextIndex >= totalSteps) {
      // Fim do tutorial.
      if (isHelpHint) {
        setIsVisible(false);
        setHintSteps([]);
        return;
      }
      persist({
        status: 'completed',
        currentStepId: firstStepId,
        updatedAt: Date.now(),
      });
      setIsVisible(false);
      return;
    }
    persist({
      status: 'in_progress',
      currentStepId: activeSteps[nextIndex].id,
      updatedAt: Date.now(),
    });
  }, [activeSteps, currentStepIndex, firstStepId, isHelpHint, persist, progress.status, totalSteps]);

  // Auto-avanço quando a ação é satisfeita (~220ms) OU steps sem ação usam
  // o botão Continuar (nunca auto-avançam).
  useEffect(() => {
    clearAutoAdvance();
    if (progress.status !== 'in_progress' || !isVisible) return;
    if (!hasAction || !isActionSatisfied) {
      setIsAutoAdvancing(false);
      return;
    }
    setIsAutoAdvancing(true);
    autoAdvanceRef.current = setTimeout(() => {
      autoAdvanceRef.current = null;
      setIsAutoAdvancing(false);
      advanceStep();
    }, AUTO_ADVANCE_MS);
    return () => clearAutoAdvance();
  }, [
    advanceStep,
    clearAutoAdvance,
    currentStep.id,
    hasAction,
    isActionSatisfied,
    isVisible,
    progress.status,
  ]);

  // AUTO-SKIP por alvo ausente (ACHADO-1a): quando o alvo do passo NÃO existe
  // no DOM E não pode nascer na view atual (id desconhecido / sempre-visível
  // ausente), o passo é avançado automaticamente em vez de travar. Alvos que
  // PODEM nascer por ação do usuário (ex.: selecionar desafio) NÃO caem aqui —
  // esses recebem o fallback de "Continuar" via `targetAbsentFallback`.
  useEffect(() => {
    if (progress.status !== 'in_progress' || !isVisible) return;
    if (!stepShouldAutoSkip) return;
    clearAutoAdvance();
    setIsAutoAdvancing(false);
    advanceStep();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress.status, isVisible, stepShouldAutoSkip, currentStep.id]);

  const next = useCallback(() => {
    if (progress.status !== 'in_progress' || !canAdvance || isAutoAdvancing) return;
    clearAutoAdvance();
    advanceStep();
  }, [advanceStep, canAdvance, clearAutoAdvance, isAutoAdvancing, progress.status]);

  const skip = useCallback(() => {
    clearAutoAdvance();
    setIsAutoAdvancing(false);
    if (isHelpHint) {
      setHintSteps([]);
      setIsVisible(false);
      return;
    }
    persist({
      status: 'skipped',
      currentStepId: firstStepId,
      updatedAt: Date.now(),
    });
    setIsVisible(false);
  }, [clearAutoAdvance, firstStepId, isHelpHint, persist]);

  const pause = useCallback(() => {
    clearAutoAdvance();
    setIsAutoAdvancing(false);
    setIsVisible(false);
  }, [clearAutoAdvance]);

  const startTutorial = useCallback((tutorialId: OnboardingTutorialId) => {
    clearAutoAdvance();
    setIsAutoAdvancing(false);
    onboardingStorageService.clear();
    setActiveTutorialId(tutorialId);
    setHintSteps([]);
    setSnapshots({});
    const first =
      tutorialId === 'quick-start' ? FIRST_QUICK_START_STEP_ID : FIRST_ONBOARDING_STEP_ID;
    persist({
      status: 'in_progress',
      currentStepId: first,
      updatedAt: Date.now(),
    });
    setIsVisible(true);
  }, [clearAutoAdvance, persist]);

  const restart = useCallback(() => {
    clearAutoAdvance();
    setIsAutoAdvancing(false);
    setHintSteps([]);
    setSnapshots({});
    persist({
      status: 'in_progress',
      currentStepId: firstStepId,
      updatedAt: Date.now(),
    });
    setIsVisible(true);
  }, [clearAutoAdvance, firstStepId, persist]);

  const openFromHelp = useCallback(() => {
    clearAutoAdvance();
    setIsAutoAdvancing(false);
    onboardingStorageService.clear();
    setHintSteps([]);
    setSnapshots({});
    // Recomeça do step 0 do tutorial ativo (completo por default).
    persist({
      status: 'in_progress',
      currentStepId: FIRST_ONBOARDING_STEP_ID,
      updatedAt: Date.now(),
    });
    setIsVisible(true);
  }, [clearAutoAdvance, persist]);

  /** Inicia o hint pós-tutorial (1 passo) — não persistido. */
  const startHelpHint = useCallback(() => {
    clearAutoAdvance();
    setIsAutoAdvancing(false);
    setHintSteps([
      {
        id: 'help-hint',
        chapterId: 'lesson',
        titleKey: 'translation:tutorial.helpHint.title',
        descriptionKey: 'translation:tutorial.helpHint.description',
        targetSelector: '[data-onboarding-target="lesson-subject"]',
        view: 'lesson',
      },
    ]);
    setSnapshots({});
    persist({
      status: 'in_progress',
      currentStepId: 'help-hint',
      updatedAt: Date.now(),
    });
    setIsVisible(true);
  }, [clearAutoAdvance, persist]);

  // ─── Áudio de narração (TTS local): mute + autoplay, falha silenciosa ───
  const { i18n } = useTranslation();
  const [audioMuted, setAudioMutedState] = useState<boolean>(() => isAudioMuted());
  const locale = (i18n.language || 'pt-BR') as 'pt-BR' | 'en';

  const toggleMute = useCallback(() => {
    const next = toggleAudioMutedLocal();
    setAudioMutedState(next);
  }, []);

  // Autoplay: narra o título + descrição do passo ao ativá-lo (após a animação).
  const narratedTextRef = useRef('');
  useEffect(() => {
    if (progress.status !== 'in_progress' || !isVisible || audioMuted) {
      stopOnboardingAudio();
      return;
    }
    const text = `${i18n.t(currentStep.titleKey)} ${i18n.t(currentStep.descriptionKey)}`;
    if (text === narratedTextRef.current) return;
    narratedTextRef.current = text;
    const timer = setTimeout(() => {
      void speakOnboardingText(text, locale);
    }, 650);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep.id, currentStep.titleKey, currentStep.descriptionKey, isVisible, progress.status, audioMuted, locale]);

  // Para a narração quando o overlay fecha.
  useEffect(() => {
    if (!isVisible) stopOnboardingAudio();
  }, [isVisible]);

  return {
    state: {
      isVisible,
      progress,
      activeTutorialId,
      currentStep,
      currentStepIndex,
      totalSteps,
      currentChapterIndex,
      totalChapters,
      currentChapterTitleKey,
      isActionSatisfied,
      canAdvance,
      isStepTransitioning: isAutoAdvancing,
      isLastStep,
      isHelpHint,
      context,
      isAudioMuted: audioMuted,
    },
    actions: {
      next,
      skip,
      restart,
      pause,
      openFromHelp,
      startTutorial,
      startHelpHint,
      toggleMute,
    },
  };
}

/**
 * Alterna o mute global da narração no service e devolve o novo estado.
 * (helper local p/ evitar conflito de nomes com `setAudioMuted` importado).
 */
function toggleAudioMutedLocal(): boolean {
  const next = !isAudioMuted();
  setAudioMuted(next);
  return next;
}