/**
 * src/views/SettingsView/useProgressPanel.ts — ORQUESTRADOR do painel "Limpar
 * dados de avanço" (state/view split — STORY-SPEC §5).
 *
 * A VIEW (`ProgressPanelView.tsx`) é só props; a MÁQUINA de estados pura (sem
 * React/DOM) vive em ./progressPanelState.ts e é testável por `node:test` sem
 * jsdom; este hook só liga o reducer ao IPC (`study.clearProgress`).
 *
 * Comportamento preservado 1:1 do painel original (onda1-nav-ui + W18/W19):
 *  - ação destrutiva SÓ depois do diálogo de confirmação;
 *  - o diálogo fecha nos TRÊS caminhos (sucesso, falha de negócio, rejeição);
 *  - `withTimeout` no canal: um canal mudo vira erro claro e o `busy` limpa;
 *  - W19: a FRASE principal é sempre i18n; `String(err)`/`res.error` viram
 *    detalhe técnico opcional (legenda), nunca a frase.
 */
import { useCallback, useReducer } from 'react';
import { useTranslation } from 'react-i18next';
import { getApi } from '../../lib/apiBridge';
import { IPC_TIMEOUT_MS, isTimeoutError, withTimeout } from '../../lib/ipcTimeout';
import {
  clearProgressErrorKey,
  initialProgressPanelState,
  progressPanelReducer,
  type ProgressPanelViewProps,
} from './progressPanelState';

export {
  clearProgressErrorKey,
  initialProgressPanelState,
  progressPanelReducer,
  type ProgressFeedback,
  type ProgressPanelEvent,
  type ProgressPanelVm,
  type ProgressPanelViewProps,
} from './progressPanelState';

/** Orquestrador: reducer puro + IPC (canal `study:clear-progress`). */
export function useProgressPanel(): ProgressPanelViewProps {
  const { t } = useTranslation();
  const [state, dispatch] = useReducer(
    progressPanelReducer,
    undefined,
    () => initialProgressPanelState,
  );

  /** Confirma → apaga o progresso (com timeout — canal mudo vira erro claro). */
  const onClear = useCallback(async (): Promise<void> => {
    dispatch({ type: 'clearStarted' });
    try {
      const res = (await withTimeout(
        getApi().study.clearProgress(),
        IPC_TIMEOUT_MS,
        'study:clear-progress',
      )) as { ok: boolean; error?: string };
      if (res.ok) {
        dispatch({ type: 'clearSucceeded' });
      } else {
        dispatch({
          type: 'clearFailed',
          message: t('translation:settings.clearProgressError'),
          detail: res.error,
        });
      }
    } catch (err) {
      dispatch({
        type: 'clearFailed',
        message: t(clearProgressErrorKey(isTimeoutError(err))),
        detail: String(err),
      });
    } finally {
      dispatch({ type: 'clearSettled' });
    }
  }, [t]);

  return {
    ...state,
    onConfirmOpen: () => dispatch({ type: 'confirmOpened' }),
    onConfirmClose: () => dispatch({ type: 'confirmClosed' }),
    onClear,
  };
}
