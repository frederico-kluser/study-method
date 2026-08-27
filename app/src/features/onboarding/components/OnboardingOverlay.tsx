/**
 * src/features/onboarding/components/OnboardingOverlay.tsx
 *
 * OVERLAY do tutorial (onda 16 — refaz fiel ao ondokai
 * `InteractiveOnboardingOverlay`). Mantém a mecânica central:
 *
 *  - portal em `document.body` com z-index 14000 (acima dos modais);
 *  - SPOTLIGHT que segue o alvo (`data-onboarding-target`) via getBoundingClientRect
 *    num loop de RAF + resize/scroll, tentando o alvo ALTERNATIVO ANTES do primário;
 *  - MÁSCARA de 4 segmentos ao redor do spotlight bloqueando interação FORA dele
 *    (cursor not-allowed) + listener global em modo capture;
 *  - PAINEL de instruções posicionado sem colidir com o spotlight
 *    (`calculatePanelPosition`), com status de auto-avanço (`expectedAction`),
 *    botões Continuar/Concluir, Skip (com confirmação) e Fechar;
 *  - controles de áudio de narração (mute), exibidos quando disponíveis;
 *  - dica "vá para a aba X" quando o step mira uma aba e o usuário não está nela.
 *
 * Estilo via MUI v9 (`sx`) + CSS Module (OnboardingOverlay.module.css) para
 * spotlight/efeitos. z-index 1400 (abaixo do modal de seleção 1400+? usamos
 * 14000 como no ondokai).
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { NavKey } from '../../../lib/shellNav';
import { ONBOARDING_CHAPTERS } from '../constants/onboardingSteps';
import type { OnboardingStepDefinition } from '../types/onboarding.types';
import {
  calculatePanelPosition,
  getResponsiveSizeClass,
  rectsOverlap,
  scrollTargetIntoView,
  type RevealableElement,
} from '../utils/onboardingPositioning.utils';
import styles from './OnboardingOverlay.module.css';

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface ViewportSize {
  width: number;
  height: number;
}

interface PanelSize {
  width: number;
  height: number;
}

export interface OnboardingOverlayProps {
  isVisible: boolean;
  currentStep: OnboardingStepDefinition;
  currentStepIndex: number;
  totalSteps: number;
  currentChapterIndex: number;
  totalChapters: number;
  currentChapterTitleKey: string;
  isLastStep: boolean;
  isActionSatisfied: boolean;
  canAdvance: boolean;
  isStepTransitioning: boolean;
  /** Aba ativa do shell (dica "vá para a aba X"). */
  activeView?: NavKey;
  /** Narração está mudo? */
  isAudioMuted?: boolean;
  /** Alterna mute da narração. */
  onToggleMute?: () => void;
  onNext: () => void;
  onSkip: () => void;
  onPause: () => void;
}

const SPOTLIGHT_PADDING = 10;
const SPOTLIGHT_RADIUS = 12;

const NAV_TAB_KEY: Record<NavKey, 'translation:nav.home' | 'translation:nav.settings' | 'translation:nav.lesson' | 'translation:nav.roadmap' | 'translation:nav.challenge'> = {
  home: 'translation:nav.home',
  settings: 'translation:nav.settings',
  lesson: 'translation:nav.lesson',
  roadmap: 'translation:nav.roadmap',
  challenge: 'translation:nav.challenge',
};

function getViewportSize(): ViewportSize {
  if (typeof window === 'undefined') return { width: 0, height: 0 };
  return { width: window.innerWidth, height: window.innerHeight };
}

function findTargetElement(selector?: string, index?: number): Element | null {
  if (!selector || typeof document === 'undefined') return null;
  if (index !== undefined && index !== 0) {
    const all = document.querySelectorAll(selector);
    if (all.length === 0) return null;
    if (index === -1) return all[all.length - 1];
    return all[index] ?? null;
  }
  return document.querySelector(selector);
}

function toSpotlightRect(target: Element): SpotlightRect | null {
  const rect = target.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    top: Math.max(0, rect.top - SPOTLIGHT_PADDING),
    left: Math.max(0, rect.left - SPOTLIGHT_PADDING),
    width: rect.width + SPOTLIGHT_PADDING * 2,
    height: rect.height + SPOTLIGHT_PADDING * 2,
  };
}

function areViewportsEqual(a: ViewportSize, b: ViewportSize): boolean {
  return a.width === b.width && a.height === b.height;
}

function areSpotlightsEqual(a: SpotlightRect | null, b: SpotlightRect | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;
}

const RESPONSIVE_CLASS: Record<string, string | undefined> = {
  'onboarding-overlay-panel--medium': styles.medium,
  'onboarding-overlay-panel--small': styles.small,
  'onboarding-overlay-panel--xsmall': styles.xsmall,
};

export function OnboardingOverlay({
  isVisible,
  currentStep,
  currentStepIndex,
  totalSteps,
  currentChapterIndex,
  totalChapters,
  currentChapterTitleKey,
  isLastStep,
  isActionSatisfied,
  canAdvance,
  isStepTransitioning,
  activeView,
  isAudioMuted = false,
  onToggleMute,
  onNext,
  onSkip,
  onPause,
}: OnboardingOverlayProps): React.ReactElement | null {
  const { t } = useTranslation();
  const [viewport, setViewport] = useState<ViewportSize>(() => getViewportSize());
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const [panelSize, setPanelSize] = useState<PanelSize>({ width: 420, height: 320 });
  const [spotlightReady, setSpotlightReady] = useState(false);
  const [panelVisible, setPanelVisible] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'skip' | 'close' | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const viewportRef = useRef<ViewportSize>(viewport);
  const spotlightRef = useRef<SpotlightRect | null>(spotlight);

  const shouldRender = isVisible;
  const targetPresent = spotlight !== null;

  // Entrada da animação (uma vez ao abrir o overlay).
  useEffect(() => {
    if (!shouldRender) {
      setSpotlightReady(false);
      setPanelVisible(false);
      return;
    }
    setSpotlightReady(false);
    setPanelVisible(false);
    const spotlightTimer = window.setTimeout(() => setSpotlightReady(true), 100);
    const panelTimer = window.setTimeout(() => setPanelVisible(true), 200);
    return () => {
      window.clearTimeout(spotlightTimer);
      window.clearTimeout(panelTimer);
    };
  }, [shouldRender]);

  const handleSkipRequest = useCallback(() => setConfirmAction('skip'), []);
  const handleCloseRequest = useCallback(() => setConfirmAction('close'), []);

  const handleConfirmYes = useCallback(() => {
    const action = confirmAction;
    setConfirmAction(null);
    requestAnimationFrame(() => {
      if (action === 'skip') onSkip();
      else if (action === 'close') onPause();
    });
  }, [confirmAction, onSkip, onPause]);

  const handleConfirmCancel = useCallback(() => setConfirmAction(null), []);

  // Esc abre/cancela o diálogo de confirmação.
  useEffect(() => {
    if (!shouldRender) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (confirmAction !== null) {
        event.preventDefault();
        event.stopPropagation();
        setConfirmAction(null);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      handleCloseRequest();
    };
    window.addEventListener('keydown', handleEscape, true);
    return () => window.removeEventListener('keydown', handleEscape, true);
  }, [shouldRender, confirmAction, handleCloseRequest]);

  const handleMaskClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  }, []);

  // Bloqueia interação fora do spotlight (reforço além das máscaras).
  useEffect(() => {
    if (!shouldRender) return;

    const blockInteraction = (e: Event): void => {
      if (!spotlight) return;
      const target = e.target;
      if (!(target instanceof Element)) return;

      if (target.closest('[data-onboarding-panel]')) return;
      if (target.closest('[data-onboarding-confirm]')) return;

      const rect = target.getBoundingClientRect();
      const targetCenter = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
      const withinSpotlight =
        targetCenter.x >= spotlight.left &&
        targetCenter.x <= spotlight.left + spotlight.width &&
        targetCenter.y >= spotlight.top &&
        targetCenter.y <= spotlight.top + spotlight.height;
      if (withinSpotlight) return;

      e.stopPropagation();
      e.preventDefault();
    };

    document.addEventListener('mousedown', blockInteraction, true);
    document.addEventListener('mouseup', blockInteraction, true);
    document.addEventListener('click', blockInteraction, true);
    document.addEventListener('dblclick', blockInteraction, true);
    return () => {
      document.removeEventListener('mousedown', blockInteraction, true);
      document.removeEventListener('mouseup', blockInteraction, true);
      document.removeEventListener('click', blockInteraction, true);
      document.removeEventListener('dblclick', blockInteraction, true);
    };
  }, [shouldRender, spotlight]);

  // Sincroniza viewport + spotlight via RAF (alternate ANTES do primário).
  useEffect(() => {
    if (!shouldRender) return;

    let rafId: number | null = null;

    const syncLayout = (): void => {
      const nextViewport = getViewportSize();
      if (!areViewportsEqual(viewportRef.current, nextViewport)) {
        viewportRef.current = nextViewport;
        setViewport(nextViewport);
      }
      const target =
        findTargetElement(currentStep.alternateTargetSelector) ??
        findTargetElement(currentStep.targetSelector, currentStep.targetSelectorIndex);
      const rect = target ? toSpotlightRect(target) : null;
      if (!areSpotlightsEqual(spotlightRef.current, rect)) {
        spotlightRef.current = rect;
        setSpotlight(rect);
      }
    };

    const tick = (): void => {
      syncLayout();
      rafId = window.requestAnimationFrame(tick);
    };

    syncLayout();
    rafId = window.requestAnimationFrame(tick);
    window.addEventListener('resize', syncLayout);
    window.addEventListener('scroll', syncLayout, true);
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', syncLayout);
      window.removeEventListener('scroll', syncLayout, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    shouldRender,
    currentStep.id,
    currentStep.targetSelector,
    currentStep.alternateTargetSelector,
    currentStep.targetSelectorIndex,
  ]);

  // Revela alvo fora do viewport quando o step ativa.
  const scrolledForStepRef = useRef<string | null>(null);
  useEffect(() => {
    if (!shouldRender) return;
    const selector = currentStep.alternateTargetSelector ?? currentStep.targetSelector;
    if (!selector || scrolledForStepRef.current === currentStep.id) return;
    const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let attempts = 0;
    const maxAttempts = 40;
    const timer = window.setInterval(() => {
      attempts += 1;
      const target = findTargetElement(selector, currentStep.targetSelectorIndex);
      if (target) {
        scrollTargetIntoView(target as unknown as RevealableElement, smooth);
        scrolledForStepRef.current = currentStep.id;
        window.clearInterval(timer);
      } else if (attempts >= maxAttempts) {
        window.clearInterval(timer);
      }
    }, 50);
    return () => window.clearInterval(timer);
  }, [shouldRender, currentStep.id, currentStep.targetSelector, currentStep.alternateTargetSelector, currentStep.targetSelectorIndex]);

  useLayoutEffect(() => {
    if (!shouldRender || typeof window === 'undefined' || !panelRef.current) return;

    const updateSize = (): void => {
      const el = panelRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setPanelSize({ width: rect.width, height: rect.height });
      }
    };

    updateSize();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateSize);
    observer.observe(panelRef.current);
    return () => observer.disconnect();
  }, [currentStep.id, shouldRender]);

  const spotlightStyle = useMemo(() => {
    if (!spotlight) return undefined;
    return {
      top: spotlight.top,
      left: spotlight.left,
      width: spotlight.width,
      height: spotlight.height,
      borderRadius: SPOTLIGHT_RADIUS,
    };
  }, [spotlight]);

  const maskSegments = useMemo(() => {
    if (!spotlight) {
      return [
        {
          key: 'full',
          style: { top: 0, left: 0, width: viewport.width, height: viewport.height },
        },
      ];
    }
    const bottomTop = spotlight.top + spotlight.height;
    const rightLeft = spotlight.left + spotlight.width;
    const rightWidth = Math.max(0, viewport.width - rightLeft);
    const bottomHeight = Math.max(0, viewport.height - bottomTop);
    return [
      { key: 'top', style: { top: 0, left: 0, width: viewport.width, height: Math.max(0, spotlight.top) } },
      { key: 'left', style: { top: spotlight.top, left: 0, width: Math.max(0, spotlight.left), height: spotlight.height } },
      { key: 'right', style: { top: spotlight.top, left: rightLeft, width: rightWidth, height: spotlight.height } },
      { key: 'bottom', style: { top: bottomTop, left: 0, width: viewport.width, height: bottomHeight } },
    ];
  }, [spotlight, viewport]);

  const panelPosition = useMemo(() => {
    if (!viewport.width || !viewport.height) {
      return { top: 18, left: 18, width: 460, compact: false };
    }
    return calculatePanelPosition(
      spotlight,
      panelSize.width || 420,
      panelSize.height || 320,
      viewport,
      currentStepIndex,
    );
  }, [currentStepIndex, panelSize.height, panelSize.width, spotlight, viewport]);

  const panelOverlapsSpotlight = useMemo(() => {
    if (!spotlight) return false;
    const panelRect = {
      top: panelPosition.top,
      left: panelPosition.left,
      width: panelPosition.width,
      height: panelSize.height || 320,
    };
    return rectsOverlap(panelRect, spotlight, 0);
  }, [panelPosition, panelSize.height, spotlight]);

  const chapter = ONBOARDING_CHAPTERS.find((c) => c.id === currentStep.chapterId);
  const needsNavigation =
    !targetPresent && currentStep.view !== undefined && activeView !== currentStep.view;

  if (!shouldRender || typeof document === 'undefined') return null;

  const responsiveClass = RESPONSIVE_CLASS[getResponsiveSizeClass(viewport.width)] ?? '';
  const hasAction = currentStep.expectedAction !== undefined;
  const finishLabel = isLastStep
    ? t('translation:tutorial.controls.finishTutorial')
    : t('translation:tutorial.controls.next');

  return createPortal(
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 14000,
        pointerEvents: 'none',
      }}
      aria-live="polite"
    >
      {/* Máscaras */}
      {maskSegments.map((segment) => (
        <Box
          key={segment.key}
          sx={{
            position: 'fixed',
            background: 'rgba(0,0,0,0.55)',
            pointerEvents: 'auto',
            cursor: 'not-allowed',
          }}
          style={segment.style}
          onClick={handleMaskClick}
          onMouseDown={handleMaskClick}
        />
      ))}

      {/* Spotlight */}
      {spotlightStyle ? (
        <Box
          className={`${styles.spotlight} ${spotlightReady ? styles.spotlightReady : styles.spotlightClosing}`}
          style={spotlightStyle}
        />
      ) : null}

      {/* Painel */}
      <Paper
        ref={panelRef}
        component="aside"
        data-onboarding-panel
        role="dialog"
        aria-modal="true"
        elevation={6}
        className={`${responsiveClass} ${isStepTransitioning ? styles.panelTransitioning : ''} ${panelVisible ? styles.panelVisible : styles.panelHidden}`}
        sx={{
          top: panelPosition.top,
          left: panelPosition.left,
          width: panelPosition.width,
          maxWidth: 'min(460px, calc(100vw - 36px))',
          pointerEvents: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
          p: 2,
          borderRadius: 2,
          border: 1,
          borderColor: 'divider',
          ...(panelOverlapsSpotlight
            ? { pointerEvents: 'none', '& button': { pointerEvents: 'auto' } }
            : {}),
        }}
        style={{ position: 'fixed' }}
      >
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography
            variant="caption"
            sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.08, color: 'primary.main' }}
          >
            {`${t('translation:tutorial.progress.chapter')} ${currentChapterIndex + 1} / ${totalChapters}`}
          </Typography>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            {onToggleMute ? (
              <Button
                size="small"
                aria-label={
                  isAudioMuted
                    ? t('translation:tutorial.audio.unmute')
                    : t('translation:tutorial.audio.mute')
                }
                onClick={onToggleMute}
                sx={{ minWidth: 28, minHeight: 28, p: 0, color: 'text.secondary' }}
              >
                {isAudioMuted ? '🔇' : '🔊'}
              </Button>
            ) : null}
            <Button
              size="small"
              aria-label={t('translation:tutorial.controls.close')}
              onClick={handleCloseRequest}
              sx={{ minWidth: 28, minHeight: 28, p: 0, color: 'text.secondary' }}
            >
              ×
            </Button>
          </Stack>
        </Stack>

        <Typography variant="h6" component="h3">
          {t(currentStep.titleKey)}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t(currentStep.descriptionKey)}
        </Typography>

        {needsNavigation && currentStep.view ? (
          <Box
            sx={{
              mt: 0.5,
              p: 1,
              borderRadius: 1,
              bgcolor: 'action.selected',
              border: 1,
              borderColor: 'divider',
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {`${t('translation:tutorial.nav.goToTab')} ${t(NAV_TAB_KEY[currentStep.view])}`}
            </Typography>
          </Box>
        ) : null}

        {hasAction ? (
          <Box
            role="status"
            sx={{
              mt: 0.5,
              px: 1,
              py: 0.5,
              borderRadius: 1,
              alignSelf: 'flex-start',
              bgcolor: isActionSatisfied ? 'success.main' : 'action.hover',
              color: isActionSatisfied ? 'success.contrastText' : 'text.secondary',
              fontWeight: 600,
              fontSize: 12,
            }}
          >
            {isActionSatisfied
              ? t('translation:tutorial.status.readyToContinue')
              : t('translation:tutorial.status.waitingForAction')}
          </Box>
        ) : null}

        <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', mt: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            {`${t('translation:tutorial.progress.step')} ${currentStepIndex + 1} / ${totalSteps}`}
          </Typography>
          <Typography variant="caption" color="text.primary">
            {chapter ? t(chapter.titleKey) : ''}
          </Typography>
        </Stack>

        <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', alignItems: 'center' }}>
          <Button size="small" variant="text" color="inherit" onClick={handleSkipRequest}>
            {t('translation:tutorial.controls.skipTutorial')}
          </Button>
          {/* O "Continuar" fica visível quando o step espera ação MAS o alvo não
              está no DOM (fallback p/ nunca travar em alvo ausente — ACHADO-1b),
              além dos steps informativos que sempre mostram o botão. */}
          {!currentStep.hideContinueButton || canAdvance ? (
            <Button
              size="small"
              variant="contained"
              onClick={onNext}
              disabled={!canAdvance || isStepTransitioning}
            >
              {finishLabel}
            </Button>
          ) : null}
        </Stack>
      </Paper>

      {/* Diálogo de confirmação de skip/close */}
      {confirmAction ? (
        <Box className={styles.confirmDialog} data-onboarding-confirm>
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              bgcolor: 'rgba(0,0,0,0.5)',
            }}
            onClick={handleConfirmCancel}
          />
          <Paper
            component="div"
            role="alertdialog"
            aria-modal="true"
            elevation={8}
            sx={{ p: 3, maxWidth: 380, width: 'calc(100vw - 48px)', position: 'relative', borderRadius: 2 }}
          >
            <Typography variant="body2" sx={{ mb: 0, textAlign: 'center' }}>
              {t(confirmAction === 'skip'
                ? 'translation:tutorial.confirm.skipMessage'
                : 'translation:tutorial.confirm.closeMessage')}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ justifyContent: 'center', mt: 2.5 }}>
              <Button size="small" variant="outlined" onClick={handleConfirmCancel}>
                {t('translation:tutorial.confirm.cancel')}
              </Button>
              <Button size="small" variant="contained" onClick={handleConfirmYes}>
                {t(confirmAction === 'skip'
                  ? 'translation:tutorial.confirm.skipConfirm'
                  : 'translation:tutorial.confirm.closeConfirm')}
              </Button>
            </Stack>
          </Paper>
        </Box>
      ) : null}
    </Box>,
    document.body,
  );
}