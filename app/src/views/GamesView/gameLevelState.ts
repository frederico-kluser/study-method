/**
 * app/src/views/GamesView/gameLevelState.ts — MÁQUINA DE ESTADO PURA do editor
 * + runner do nível (secção Games).
 *
 * ONDA-GAMES + onda Storybook (contrato state/view, STORY-SPEC §5): a
 * `GameLevelView` mantinha 7 `useState` com as transições de carga do nível e
 * de submissão misturadas no corpo do React (efeitos + callbacks). Aqui vive o
 * ESTADO do editor/runner como um reducer puro — sem React, sem DOM, sem IPC —
 * testável por node:test (`tests/gamesLevelState.test.ts`). A view só despacha
 * eventos e mapeia o estado para copy i18n (o `loadError` guarda o TIPO do
 * erro — 'timeout' | 'load' — nunca texto: a copy é da view).
 *
 * ─── EVENTOS (as transições que a view já fazia) ───────────────────────────
 *  load/start   — abre a carga: loading, payload nulo, erros e resultado
 *                 anteriores limpos (troca de linguagem/retry repete isto);
 *  load/success — payload carregado, editor reposto ao STARTER da linguagem
 *                 (decisão documentada na view: código digitado noutra
 *                 linguagem não sobrevive à troca);
 *  load/error   — falha de infraestrutura ('timeout' = IPC estourou,
 *                 'load' = rejeição comum);
 *  code/change  — o aluno digitou no editor;
 *  run/start    — submissão em curso (busy), erro de runner limpo;
 *  run/success  — resultado da submissão (mantém-se mesmo quando ok=false:
 *                 casos falhados NÃO são erro de infraestrutura);
 *  run/error    — o `games.run` rebentou: o erro ganha Alert próprio e a lista
 *                 de casos fica COMO ESTAVA (regra da view);
 *  retry        — re-pede o payload (incrementa o token de retentativa que o
 *                 efeito de carga vigia).
 *
 * O `loadToken` é a machinery da retentativa em forma de estado: o efeito de
 * carga da view depende dele, então "Tentar de novo" é um evento como os
 * outros e não um hack fora da máquina.
 */
import type { GameLevelPayload, GameRunResult } from '../../types/games';

/** Tipo do erro de carregamento (a copy i18n é decidida pela VIEW). */
export type GameLevelLoadErrorKind = 'timeout' | 'load';

export interface GameLevelState {
  /** Token de retentativa: muda ⇒ o efeito de carga da view re-executa. */
  loadToken: number;
  loading: boolean;
  payload: GameLevelPayload | null;
  loadError: GameLevelLoadErrorKind | null;
  /** Código atual do editor (começa no starter do payload carregado). */
  code: string;
  /** Submissão em curso ("a executar"). */
  busy: boolean;
  /** Resultado da última submissão (null = ainda não testou). */
  runResult: GameRunResult | null;
  /** Erro de INFRAESTRUTURA do runner (≠ caso de teste falhado). */
  runError: boolean;
}

export type GameLevelEvent =
  | { type: 'load/start' }
  | { type: 'load/success'; payload: GameLevelPayload }
  | { type: 'load/error'; kind: GameLevelLoadErrorKind }
  | { type: 'code/change'; code: string }
  | { type: 'run/start' }
  | { type: 'run/success'; result: GameRunResult }
  | { type: 'run/error' }
  | { type: 'retry' };

/** Estado inicial: a carga do nível arranca com o contentor. */
export function initialGameLevelState(): GameLevelState {
  return {
    loadToken: 0,
    loading: true,
    payload: null,
    loadError: null,
    code: '',
    busy: false,
    runResult: null,
    runError: false,
  };
}

/** O reset de uma (re)carga: tudo o que pertence ao nível anterior desaparece. */
function clearedForLoad(state: GameLevelState): GameLevelState {
  return {
    ...state,
    loading: true,
    payload: null,
    loadError: null,
    runResult: null,
    runError: false,
  };
}

export function reduceGameLevelState(
  state: GameLevelState,
  event: GameLevelEvent,
): GameLevelState {
  switch (event.type) {
    case 'load/start':
      return clearedForLoad(state);
    case 'retry':
      return { ...clearedForLoad(state), loadToken: state.loadToken + 1 };
    case 'load/success':
      return {
        ...state,
        loading: false,
        payload: event.payload,
        loadError: null,
        code: event.payload.starter,
      };
    case 'load/error':
      return { ...state, loading: false, loadError: event.kind };
    case 'code/change':
      return { ...state, code: event.code };
    case 'run/start':
      return { ...state, busy: true, runError: false };
    case 'run/success':
      return { ...state, busy: false, runResult: event.result };
    case 'run/error':
      // Erro de infraestrutura ≠ caso que falhou: `runResult` fica como estava.
      return { ...state, busy: false, runError: true };
    default:
      return state;
  }
}

/** A view está no estado de ERRO de carga? (payload ausente após tentativa). */
export function hasLevelLoadError(state: GameLevelState): boolean {
  return state.loadError !== null || (!state.loading && state.payload === null);
}
