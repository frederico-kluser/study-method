/**
 * src/views/SettingsView/progressPanelState.ts — MÁQUINA DE ESTADOS PURA do
 * painel "Limpar dados de avanço" (sem React, sem DOM, sem MUI).
 *
 * Testado headless de tests/settingsPanelsState.test.ts; listado em
 * tsconfig.node.json (projeto composite, lib ES2022 SEM DOM) como prova
 * mecânica de que não pode voltar a depender de React/DOM. O orquestrador
 * (hook + IPC) vive em ./useProgressPanel.ts; a view em ./ProgressPanelView.tsx.
 */
/** Feedback de fim de ação: sucesso ou erro (frase i18n + detalhe opcional). */
export type ProgressFeedback =
  | { kind: 'done' }
  | { kind: 'error'; message: string; detail?: string }
  | null;

/** Estado visual do painel (o que a view desenha). */
export interface ProgressPanelVm {
  /** Diálogo de confirmação aberto. */
  confirmOpen: boolean;
  /** Limpeza em curso (desabilita ações; nunca fica preso — ver `clearSettled`). */
  busy: boolean;
  feedback: ProgressFeedback;
}

/** Props da view pura: estado + handlers (o hook devolve exatamente isto). */
export interface ProgressPanelViewProps extends ProgressPanelVm {
  onConfirmOpen(): void;
  onConfirmClose(): void;
  onClear(): Promise<void>;
}

export const initialProgressPanelState: ProgressPanelVm = {
  confirmOpen: false,
  busy: false,
  feedback: null,
};

export type ProgressPanelEvent =
  | { type: 'confirmOpened' }
  | { type: 'confirmClosed' }
  | { type: 'clearStarted' }
  | { type: 'clearSucceeded' }
  | { type: 'clearFailed'; message: string; detail?: string }
  /** SEMPRE no finally: fecha o diálogo e limpa o `busy` nos três caminhos. */
  | { type: 'clearSettled' };

/**
 * Máquina de estados pura do painel. `clearStarted` limpa o feedback da
 * tentativa anterior (o Alert só mostra a falha da tentativa em curso) e o
 * `clearSettled` roda em QUALQUER caminho — nenhuma sequência deixa o botão
 * desabilitado nem o modal preso.
 */
export function progressPanelReducer(
  state: ProgressPanelVm,
  event: ProgressPanelEvent,
): ProgressPanelVm {
  switch (event.type) {
    case 'confirmOpened':
      return { ...state, confirmOpen: true };
    case 'confirmClosed':
      return { ...state, confirmOpen: false };
    case 'clearStarted':
      return { ...state, busy: true, feedback: null };
    case 'clearSucceeded':
      return { ...state, feedback: { kind: 'done' } };
    case 'clearFailed':
      return {
        ...state,
        feedback: { kind: 'error', message: event.message, detail: event.detail },
      };
    case 'clearSettled':
      return { ...state, confirmOpen: false, busy: false };
    default:
      return state;
  }
}

/**
 * Chave i18n da FRASE de erro (W19: a frase é i18n, nunca `String(err)`).
 * Timeout do guard do renderer ≠ falha do canal: cada um com a sua mensagem.
 */
export function clearProgressErrorKey(
  isTimeout: boolean,
):
  | 'translation:settings.clearProgressTimeout'
  | 'translation:settings.clearProgressError' {
  return isTimeout
    ? 'translation:settings.clearProgressTimeout'
    : 'translation:settings.clearProgressError';
}
