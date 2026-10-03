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
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { PanelKey } from '../../../lib/shellNav';
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
  activeView?: PanelKey;
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

/* Tudo que pode receber Tab dentro de um painel `aria-modal` — a lista canônica
 * do laço de foco, COPIADA do exemplar (QuizOverlayHost.tsx) para os dois
 * painéis deste overlay. Sem o laço, o `aria-modal="true"` mente: o leitor de
 * tela ignora o resto da tela, mas o Tab passeia pelo app inteiro atrás do
 * scrim (SC 2.4.3). */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Nome acessível do diálogo de confirmação = o título que ele renderiza. */
const CONFIRM_TITLE_ID = 'onboarding-confirm-title';
/** Nome acessível do painel de instruções = o título do passo em curso. */
const PANEL_TITLE_ID = 'onboarding-panel-title';

// ONDA-GAMES (ajuste mínimo forçado pelo tipo): o `Record<PanelKey, ...>` é
// TOTAL por desenho — um painel novo não compila sem entrada aqui. 'games'
// ganhou a sua chave nav.* junto com o item do rail (ownership da onda Games).
const NAV_TAB_KEY: Record<PanelKey, 'translation:nav.home' | 'translation:nav.settings' | 'translation:nav.lesson' | 'translation:nav.roadmap' | 'translation:nav.games' | 'translation:nav.challenge'> = {
  home: 'translation:nav.home',
  settings: 'translation:nav.settings',
  lesson: 'translation:nav.lesson',
  roadmap: 'translation:nav.roadmap',
  games: 'translation:nav.games',
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
  const theme = useTheme();
  // SCRIM: o TOKEN do tema (`palette.scrim` — preto acromático a 55%), não uma
  // rgba() escrita à mão. As máscaras do spotlight (`rgba(0,0,0,0.55)`) e o
  // backdrop do diálogo de confirmação (`rgba(0,0,0,0.5)`) eram DOIS scrims
  // divergentes do `MuiBackdrop`/quiz; ler o token fecha a conta num valor só
  // (o mesmo ciclo que o QuizOverlayHost documenta — um valor, um lugar).
  const scrim = theme.vars.palette.scrim;
  const [viewport, setViewport] = useState<ViewportSize>(() => getViewportSize());
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const [panelSize, setPanelSize] = useState<PanelSize>({ width: 420, height: 320 });
  const [spotlightReady, setSpotlightReady] = useState(false);
  const [panelVisible, setPanelVisible] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'skip' | 'close' | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  /** O painel do diálogo de confirmação (o segundo painel `aria-modal`).
   *  `HTMLDivElement` porque o Paper dele é `component="div"` (o de instruções
   *  é `component="aside"` e por isso aceita `HTMLElement`). */
  const confirmRef = useRef<HTMLDivElement | null>(null);
  /** Quem tinha o foco quando o OVERLAY abriu (para o devolver ao fechar). */
  const panelOpenerRef = useRef<HTMLElement | null>(null);
  /** Quem tinha o foco quando o DIÁLOGO de confirmação abriu. */
  const confirmOpenerRef = useRef<HTMLElement | null>(null);
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

  // ─── FOCO DOS PAINÉIS `aria-modal` (SC 2.4.3) ────────────────────────────
  // Os DOIS painéis (o de instruções e o alertdialog de confirmação) declaram
  // `aria-modal="true"`, e a promessa desse atributo só se cumpre com gestão de
  // foco: ao abrir, o foco ENTRA no painel (o teclado não fica no app atrás do
  // scrim); ao fechar, o foco VOLTA para o elemento que o tinha (o mesmo
  // contrato do QuizOverlayHost — SC 2.4.3). `<body>` não conta como abridor:
  // ele está sempre conectado e o `focus()` dele é um no-op que PARECE ter
  // funcionado (a falha exata documentada no exemplar).
  useEffect(() => {
    if (!shouldRender) return;
    const ativo = document.activeElement;
    if (ativo instanceof HTMLElement && ativo !== document.body) {
      panelOpenerRef.current = ativo;
    }
    panelRef.current?.focus();
    return () => {
      const alvo = panelOpenerRef.current;
      panelOpenerRef.current = null;
      if (alvo !== null && alvo.isConnected) alvo.focus();
    };
  }, [shouldRender]);

  // O alertdialog é uma pilha em cima do painel: quando ele abre, o foco vai
  // para ele; quando ele fecha (cancela), o foco volta ao elemento do painel
  // que o abriu (o "Pular"/"Fechar"). Quando ele fecha porque o utilizador
  // CONFIRMOU, o overlay inteiro desmonta logo a seguir e é o efeito de cima
  // quem dá a palavra final — a guarda `isConnected` descarta este retorno.
  useEffect(() => {
    if (!shouldRender || confirmAction === null) return;
    const ativo = document.activeElement;
    if (ativo instanceof HTMLElement && ativo !== document.body) {
      confirmOpenerRef.current = ativo;
    }
    confirmRef.current?.focus();
    return () => {
      const alvo = confirmOpenerRef.current;
      confirmOpenerRef.current = null;
      if (alvo !== null && alvo.isConnected) alvo.focus();
    };
  }, [shouldRender, confirmAction]);

  // O LAÇO DE TAB — o miolo do exemplar (QuizOverlayHost), com uma única
  // EXTENSÃO declarada e medida: nos passos que pedem AÇÃO sobre o alvo
  // (`expectedAction` — preencher as chaves, digitar no editor, testar a
  // resposta), o alvo REVELADO pelo spotlight entra no ciclo junto do painel.
  // Ele NÃO está "atrás do scrim": é o recorte que o scrim deixa à mostra, e é
  // justamente o alvo que o passo está a ensinar. Sem esta extensão, um
  // utilizador só de teclado ficaria TRANCADO fora da ação ensinada (o
  // "Continuar" só nasce com `canAdvance`, que depende da ação) e a única saída
  // seria pular o tutorial — trocar o P1 "o Tab passeia pelo app" por um P1
  // pior "o teclado não consegue concluir o tutorial". Para todo o resto —
  // incluindo o alertdialog — o laço é exatamente o do exemplar: o Tab circula
  // DENTRO do painel.
  useEffect(() => {
    if (!shouldRender) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab') return;
      const confirmando = confirmAction !== null;
      const container = confirmando ? confirmRef.current : panelRef.current;
      if (container === null) return;
      const alvos = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)];
      // O alvo revelado entra no ciclo só nos passos de AÇÃO (ver acima), e só
      // enquanto o alertdialog está fechado — quando ele abre, o foco pertence
      // ao diálogo.
      if (!confirmando && currentStep.expectedAction !== undefined) {
        const alvo =
          findTargetElement(currentStep.alternateTargetSelector) ??
          findTargetElement(currentStep.targetSelector, currentStep.targetSelectorIndex);
        if (alvo !== null) {
          if (alvo instanceof HTMLElement && alvo.matches(FOCUSABLE)) alvos.unshift(alvo);
          alvos.push(...alvo.querySelectorAll<HTMLElement>(FOCUSABLE));
        }
      }
      // Sem nada focável dentro, o Tab não pode sair do painel mesmo assim:
      // o próprio painel (tabIndex -1) recebe o foco de volta.
      if (alvos.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const primeiro = alvos[0]!;
      const ultimo = alvos[alvos.length - 1]!;
      const atual = document.activeElement;
      if (event.shiftKey && (atual === primeiro || atual === container)) {
        event.preventDefault();
        ultimo.focus();
      } else if (!event.shiftKey && atual === ultimo) {
        event.preventDefault();
        primeiro.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    shouldRender,
    confirmAction,
    currentStep.expectedAction,
    currentStep.targetSelector,
    currentStep.alternateTargetSelector,
    currentStep.targetSelectorIndex,
  ]);

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

    // POR QUE ESTE `scroll` LISTENER EXISTE (e não é o padrão proibido):
    // a regra proíbe `scroll` como MOTOR DE ANIMAÇÃO — quem anima com ele
    // re-renderiza a árvore em todo quadro e some no mobile. Este aqui não
    // anima: ele acompanha o RETÂNGULO de um alvo do DOM, que é a única coisa
    // que o navegador não entrega por `IntersectionObserver` (que dá
    // interseção, não posição). Os dois cuidados que fazem a diferença já
    // estão aqui: `syncLayout` só chama `setState` quando o valor MUDOU (as
    // comparações por ref logo acima), e o efeito tem cleanup. O `passive` é o
    // que falta — este handler não chama `preventDefault`, então ele não pode
    // atrasar o scroll.
    syncLayout();
    rafId = window.requestAnimationFrame(tick);
    window.addEventListener('resize', syncLayout);
    window.addEventListener('scroll', syncLayout, { capture: true, passive: true });
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', syncLayout);
      window.removeEventListener('scroll', syncLayout, { capture: true } as EventListenerOptions);
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
            // O TOKEN do scrim (ver o comentário do `scrim` no topo): as
            // máscaras eram uma terceira rgba() crua divergente do resto da
            // base. O spotlight é o recorte que este fundo deixa à mostra.
            background: scrim,
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
        // Nome acessível = o título do passo (o h6 logo abaixo) e alvo do foco
        // de abertura (`tabIndex={-1}`: focável por script, fora da ordem de
        // Tab — o laço de foco descrito no efeito de teclado).
        aria-labelledby={PANEL_TITLE_ID}
        tabIndex={-1}
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
          {/* `primary.accentText`, não `primary.main`: `main` é o
              PREENCHIMENTO da família e como texto sobre o painel (nível 1 da
              rampa) media 4,26:1 no escuro — abaixo do piso AA. O valor de
              TEXTO calibrado entrega 5,21:1 no escuro e 5,46:1 no claro
              (regra 3b: o painel é superfície de leitura, níveis 0–2, onde o
              acento PODE ser texto). */}
          <Typography
            variant="caption"
            sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.08, color: 'primary.accentText' }}
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

        {/* O título do passo — e o NOME ACESSÍVEL do painel (aria-labelledby). */}
        <Typography variant="h6" component="h3" id={PANEL_TITLE_ID}>
          {t(currentStep.titleKey)}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
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
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {`${t('translation:tutorial.progress.step')} ${currentStepIndex + 1} / ${totalSteps}`}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.primary' }}>
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
              // O MESMO token das máscaras do spotlight — era a quarta rgba()
              // crua deste overlay (0,5 contra 0,55, sem razão para divergir).
              bgcolor: scrim,
            }}
            onClick={handleConfirmCancel}
          />
          <Paper
            ref={confirmRef}
            component="div"
            role="alertdialog"
            aria-modal="true"
            // Nome acessível = a mensagem que ele renderiza (o título de facto
            // deste diálogo), e alvo do foco de abertura — ver os efeitos de
            // foco/laço de Tab acima.
            aria-labelledby={CONFIRM_TITLE_ID}
            tabIndex={-1}
            elevation={8}
            sx={{ p: 3, maxWidth: 380, width: 'calc(100vw - 48px)', position: 'relative', borderRadius: 2 }}
          >
            <Typography variant="body2" id={CONFIRM_TITLE_ID} sx={{ mb: 0, textAlign: 'center' }}>
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