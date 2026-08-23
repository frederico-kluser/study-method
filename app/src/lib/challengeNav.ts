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

/** Estado+functors expostos pelo contexto. */
export interface ChallengeNavValue {
  /** Desafio selecionado (navegação direta da Aula), ou null. */
  selectedChallenge: ChallengeInfo | null;
  /** Seleciona/limpa o desafio ativo. */
  selectChallenge: (challenge: ChallengeInfo | null) => void;
  /** Version que muda quando a seleção muda — facilita involidar caches. */
  version: number;
  /**
   * Pede ao shell para navegar para a aba Desafio (a LessonView chama após
   * selecionar um desafio). No-op sem provider.
   */
  navigateToChallenge: () => void;
}

/** Reservado para persistência futura em hash. */
export const CHALLENGE_NAV_QUERY = 'challengeId';

/** Valor default (sem provider). `selectedChallenge` vira null. */
export const DEFAULT_CHALLENGE_NAV: ChallengeNavValue = {
  selectedChallenge: null,
  selectChallenge: () => {
    /* no-op sem provider */
  },
  version: 0,
  navigateToChallenge: () => {
    /* no-op sem provider */
  },
};

export const ChallengeNavCtx = createContext<ChallengeNavValue>(DEFAULT_CHALLENGE_NAV);

/** Estado traduzido pelo reducer de navegação. */
export interface ChallengeNavState {
  selectedChallenge: ChallengeInfo | null;
  version: number;
}

export const initialChallengeNavState: ChallengeNavState = {
  selectedChallenge: null,
  version: 0,
};

export type ChallengeNavAction =
  | { type: 'set'; challenge: ChallengeInfo | null }
  | { type: 'clear' };

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
      return { selectedChallenge: action.challenge, version: state.version + 1 };
    case 'clear':
      return { selectedChallenge: null, version: state.version + 1 };
    default:
      return state;
  }
}

/**
 * Hook da máquina de navegação: usa o reducer puro para manter
 * `selectedChallenge` + contador de versão.
 */
export function useNavChallengeState(initial: ChallengeInfo | null = null): {
  selectedChallenge: ChallengeInfo | null;
  selectChallenge: (c: ChallengeInfo | null) => void;
  version: number;
} {
  const [state, dispatch] = useReducer(challengeNavReducer, {
    ...initialChallengeNavState,
    selectedChallenge: initial,
  });
  const selectChallenge = useCallback(
    (c: ChallengeInfo | null): void => {
      dispatch({ type: 'set', challenge: c });
    },
    [],
  );
  return {
    selectedChallenge: state.selectedChallenge,
    selectChallenge,
    version: state.version,
  };
}

/** Hook de consumo: devolve o valor do contexto (default quando sem provider). */
export function useChallengeNav(): ChallengeNavValue {
  return useContext(ChallengeNavCtx);
}
