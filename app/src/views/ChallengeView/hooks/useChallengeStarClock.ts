/**
 * src/views/ChallengeView/hooks/useChallengeStarClock.ts — ESTRELAS +
 * CRONÔMETRO do desafio ativo da ChallengeView (máquina pura em
 * src/lib/challengeStars.ts — só estrelas, sem gamificação extra).
 *
 * Separação STATE/VIEW (docs/storybook/STORY-SPEC.md §5): o relógio, a máquina
 * de estrelas e o mark terminal do timeout vivem aqui; a view recebe
 * `{ starsLeft, elapsedMs, timedOut }` + as operações que as outras fases do
 * fluxo precisam (`concludeNow`, `onWrongAnswer`, as guardas). Semântica
 * preservada byte a byte do corpo da ChallengeView:
 *
 *  - reset por desafio (trocar de desafio RESETA estrelas + cronômetro);
 *  - tick de 1s + perdas por blur/visibility (anúncios só de perdas NOVAS);
 *  - tempo esgotado sem passar marca 'timeout' (ONDA5, evento TERMINAL,
 *    idempotente pela key do desafio — `markedForKeyRef`).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChallengeInfo } from '../../../../shared/ipc-contract';
import {
  createStarTracker,
  starLossI18nKey,
  timeLimitForDifficulty,
  INITIAL_STARS,
  type StarLossI18nKey,
  type StarTracker,
} from '../../../lib/challengeStars';
import { announceStatus } from '../../../lib/confetti';
import { shouldMarkAttempt } from '../../../lib/answerFlow';
import type { MarkAttemptFn } from './useChallengeList';

export interface UseChallengeStarClockInput {
  /** Desafio ativo (null = nenhum). */
  challenge: ChallengeInfo | null;
  /** Key do desafio ativo (`${challengeId}:${workspaceDir}`) ou null. */
  challengeKey: string | null;
  /** Marcação de tentativa terminal (o timeout é evento TERMINAL). */
  markAttempt: MarkAttemptFn;
  /** Key do último desafio já marcado (idempotência por desafio). */
  markedForKeyRef: { current: string | null };
}

export interface ChallengeStarClock {
  starsLeft: number;
  elapsedMs: number;
  timedOut: boolean;
  /** Estrelas correntes do tracker (INITIAL_STARS sem tracker). */
  starsNow(): number;
  /** Duração desde o início da tentativa corrente. */
  elapsedNow(): number;
  /** O desafio concluiu na tela? (relógio congelado; guarda de mark). */
  isConcluded(): boolean;
  /** O relógio já estourou? (guarda de mark). */
  wasTimedOut(): boolean;
  /** Passou: congela o relógio e devolve a duração final. */
  concludeNow(): number;
  /** Resposta errada: -1 estrela e o log de anúncios é sincronizado. */
  onWrongAnswer(): void;
}

export function useChallengeStarClock(input: UseChallengeStarClockInput): ChallengeStarClock {
  const { t } = useTranslation();
  const [starsLeft, setStarsLeft] = useState(INITIAL_STARS);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const trackerRef = useRef<StarTracker | null>(null);
  const startTsRef = useRef(0);
  const lastEventCountRef = useRef(0);
  const timedOutRef = useRef(false);
  const concludedRef = useRef(false);

  // Identidade do desafio "mais recente" (rewrite a cada render) para o tick
  // marcar com o desafio certo — o closure do efeito segura o `challenge` da
  // render em que nasceu.
  const liveRef = useRef(input);
  liveRef.current = input;

  // Reset da máquina de estrelas e do cronômetro ao (des)montar um desafio.
  useEffect(() => {
    const active = input.challenge;
    trackerRef.current = active
      ? createStarTracker({ timeLimitMs: timeLimitForDifficulty(active.difficulty) })
      : null;
    setStarsLeft(INITIAL_STARS);
    setElapsedMs(0);
    setTimedOut(false);
    timedOutRef.current = false;
    concludedRef.current = false;
    lastEventCountRef.current = 0;
    startTsRef.current = Date.now();
  }, [input.challengeKey, input.challenge]);

  // Tick do cronômetro (1s) + listeners de perda de foco (blur/visibility).
  // Registrados por desafio ativo; removidos ao desmontar (sem vazamento).
  useEffect(() => {
    const tracker = trackerRef.current;
    if (!input.challengeKey || !tracker) return undefined;

    const syncStars = (): void => setStarsLeft(tracker.stars());

    // Anuncia perdas NOVAS do log (decaimento por demora no tick; foco). A
    // perda por resposta errada fica fora: o anúncio do resultado cobre.
    const announceNewLosses = (): void => {
      const events = tracker.getEvents();
      const fresh = events.slice(lastEventCountRef.current);
      lastEventCountRef.current = events.length;
      const texts = fresh
        .map((e) => starLossI18nKey(e.cause))
        .filter((k): k is StarLossI18nKey => k !== null)
        .map((k) => t(`translation:${k}`));
      if (texts.length > 0) announceStatus(texts.join(' '));
    };

    const handleBlur = (): void => {
      if (concludedRef.current) return; // desafio concluído: estrelas travadas
      tracker.onBlur();
      syncStars();
      announceNewLosses();
    };
    const handleVisibilityChange = (): void => {
      if (document.hidden) handleBlur();
    };

    const tick = (): void => {
      if (concludedRef.current) return; // relógio congelado após concluir
      const elapsed = Date.now() - startTsRef.current;
      setElapsedMs(elapsed);
      tracker.onTick(elapsed);
      syncStars();
      announceNewLosses();
      if (tracker.isTimedOut(elapsed) && !timedOutRef.current) {
        timedOutRef.current = true;
        tracker.onTimeout();
        syncStars();
        announceNewLosses();
        setTimedOut(true);
        // ONDA5 mark TERMINAL: tempo esgotou SEM passar → 'timeout' (só se o
        // desafio não foi concluído nem já marcado — 1ª tentativa terminal
        // vence). O tick só chega aqui com concludedRef false (early return).
        const { challengeKey } = liveRef.current;
        const verdict = shouldMarkAttempt({
          event: 'timed-out',
          alreadyMarked: liveRef.current.markedForKeyRef.current === challengeKey,
          concluded: concludedRef.current,
          timedOut: true,
        });
        const ativo = liveRef.current.challenge;
        if (verdict && ativo) {
          liveRef.current.markAttempt(
            ativo,
            verdict,
            trackerRef.current?.stars() ?? INITIAL_STARS,
            elapsed,
          );
        }
      }
    };

    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const interval = window.setInterval(tick, 1000);
    tick(); // primeiro tique imediato (sincroniza o display)

    return () => {
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(interval);
    };
  }, [input.challengeKey, input.markAttempt, t]);

  const starsNow = useCallback((): number => trackerRef.current?.stars() ?? INITIAL_STARS, []);
  const elapsedNow = useCallback((): number => Date.now() - startTsRef.current, []);
  const isConcluded = useCallback((): boolean => concludedRef.current, []);
  const wasTimedOut = useCallback((): boolean => timedOutRef.current, []);

  /** Passou: congela o relógio no tempo atual e devolve a duração final. */
  const concludeNow = useCallback((): number => {
    concludedRef.current = true;
    const durationMs = Date.now() - startTsRef.current;
    setElapsedMs(durationMs);
    return durationMs;
  }, []);

  /** Resposta errada: -1 estrela; o evento do log é descartado (o anúncio do
   *  resultado já cobre — evita duplicado no tick seguinte). */
  const onWrongAnswer = useCallback((): void => {
    trackerRef.current?.onWrongAnswer();
    setStarsLeft(trackerRef.current?.stars() ?? INITIAL_STARS);
    if (trackerRef.current) {
      lastEventCountRef.current = trackerRef.current.getEvents().length;
    }
  }, []);

  return {
    starsLeft,
    elapsedMs,
    timedOut,
    starsNow,
    elapsedNow,
    isConcluded,
    wasTimedOut,
    concludeNow,
    onWrongAnswer,
  };
}
