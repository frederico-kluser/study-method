/**
 * src/lib/challengeNav.ts — contexto React de navegação Desafio ↔ Aula.
 *
 * Mantido em `src/lib` (alvo também do tsconfig.node.json, por isso SEM JSX):
 * aqui vivem o contexto (`ChallengeNavCtx`), o hook de estado puro
 * (`useNavChallengeState`) e o hook de consumo (`useChallengeNav`). O
 * componente `ChallengeNavProvider` (com JSX) fica em
 * `src/components/challengeNav/ChallengeNavProvider.tsx`, compilado só pelo
 * tsconfig.json (renderer).
 *
 * Permite que a LessonView selecione um desafio e que o shell navegue para a
 * view Desafio com esse desafio pré-selecionado.
 */
import { createContext, useCallback, useContext, useReducer } from 'react';
import type { ChallengeInfo } from '../../shared/ipc-contract';

/**
 * ADITIVO (rodada 8 — trilhas): seleção de UM desafio de trilha para a
 * ChallengeView. O aluno abre a aula da trilha e escolhe um desafio (ou o
 * teste de proficiência) — a ChallengeView detecta este campo e usa o fluxo
 * track (track:challenge / challenge-submit / challenge-regenerate) em vez do
 * fluxo legado (workspace da geração).
 */
export interface TrackChallengeNavSelection {
  trackSlug: string;
  target: 'lesson' | 'proficiency';
  lessonId?: string;
  challengeId: string;
  /** título do desafio para o cabeçalho (vem do payload da aula). */
  title?: string;
}

/** Estado+functors expostos pelo contexto. */
export interface ChallengeNavValue {
  /** Desafio selecionado (navegação direta da Aula), ou null. */
  selectedChallenge: ChallengeInfo | null;
  /** Seleciona/limpa o desafio ativo. */
  selectChallenge: (challenge: ChallengeInfo | null) => void;
  /** ADITIVO (rodada 8): desafio de TRILHA selecionado (fluxo track). */
  trackChallenge: TrackChallengeNavSelection | null;
  /** Seleciona/limpa o desafio de trilha ativo. */
  selectTrackChallenge: (sel: TrackChallengeNavSelection | null) => void;
  /** Version que muda quando a seleção muda — facilita involidar caches. */
  version: number;
  /**
   * Pede ao shell para navegar para a aba Desafio (a LessonView chama após
   * selecionar um desafio). No-op sem provider.
   */
  navigateToChallenge: () => void;
  /**
   * ADITIVO (fix15-list-challenges): setupRoot do ÚLTIMO generateLesson bem-
   * -sucedido, capturado pela LessonView no progresso `materializing` e
   * compartilhado com a ChallengeView via contexto. Permite à ChallengeView
   * passar `setupRoot` explícito ao list-challenges (sem depender só do fallback
   * da memória do main). null enquanto nenhuma aula foi gerada nesta sessão.
   */
  lastSetupRoot: string | null;
  /** Armazena o setupRoot (e null quando limpo). Callback estável. */
  setLastSetupRoot: (setupRoot: string | null) => void;
}

/** Reservado para persistência futura em hash. */
export const CHALLENGE_NAV_QUERY = 'challengeId';

/** Valor default (sem provider). `selectedChallenge` vira null. */
export const DEFAULT_CHALLENGE_NAV: ChallengeNavValue = {
  selectedChallenge: null,
  selectChallenge: () => {
    /* no-op sem provider */
  },
  trackChallenge: null,
  selectTrackChallenge: () => {
    /* no-op sem provider */
  },
  version: 0,
  navigateToChallenge: () => {
    /* no-op sem provider */
  },
  lastSetupRoot: null,
  setLastSetupRoot: () => {
    /* no-op sem provider */
  },
};

export const ChallengeNavCtx = createContext<ChallengeNavValue>(DEFAULT_CHALLENGE_NAV);

/** Estado traduzido pelo reducer de navegação. */
export interface ChallengeNavState {
  selectedChallenge: ChallengeInfo | null;
  /** ADITIVO (rodada 8): desafio de trilha ativo. */
  trackChallenge: TrackChallengeNavSelection | null;
  version: number;
}

export const initialChallengeNavState: ChallengeNavState = {
  selectedChallenge: null,
  trackChallenge: null,
  version: 0,
};

export type ChallengeNavAction =
  | { type: 'set'; challenge: ChallengeInfo | null }
  | { type: 'clear' }
  | { type: 'setTrack'; selection: TrackChallengeNavSelection | null }
  | { type: 'clearTrack' };

/**
 * Reducer PURO da navegação (testável no gate node:test, sem jsdom). Seleciona
 * um desafio e incrementa `version` para invalidar caches da view.
 */
export function challengeNavReducer(
  state: ChallengeNavState,
  action: ChallengeNavAction,
): ChallengeNavState {
  switch (action.type) {
    case 'set':
      return { ...state, selectedChallenge: action.challenge, version: state.version + 1 };
    case 'clear':
      return { ...state, selectedChallenge: null, version: state.version + 1 };
    case 'setTrack':
      return { ...state, trackChallenge: action.selection, version: state.version + 1 };
    case 'clearTrack':
      return { ...state, trackChallenge: null, version: state.version + 1 };
    default:
      return state;
  }
}

/**
 * Hook da máquina de navegação: usa o reducer puro para manter
 * `selectedChallenge`/`trackChallenge` + contador de versão.
 */
export function useNavChallengeState(initial: ChallengeInfo | null = null): {
  selectedChallenge: ChallengeInfo | null;
  selectChallenge: (c: ChallengeInfo | null) => void;
  trackChallenge: TrackChallengeNavSelection | null;
  selectTrackChallenge: (sel: TrackChallengeNavSelection | null) => void;
  version: number;
} {
  const [state, dispatch] = useReducer(challengeNavReducer, {
    ...initialChallengeNavState,
    selectedChallenge: initial,
  });
  const selectChallenge = useCallback((c: ChallengeInfo | null): void => {
    dispatch({ type: 'set', challenge: c });
  }, []);
  const selectTrackChallenge = useCallback((sel: TrackChallengeNavSelection | null): void => {
    dispatch({ type: 'setTrack', selection: sel });
  }, []);
  return {
    selectedChallenge: state.selectedChallenge,
    selectChallenge,
    trackChallenge: state.trackChallenge,
    selectTrackChallenge,
    version: state.version,
  };
}

/** Hook de consumo: devolve o valor do contexto (default quando sem provider). */
export function useChallengeNav(): ChallengeNavValue {
  return useContext(ChallengeNavCtx);
}
