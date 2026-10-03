/**
 * components/ui/ActionButton.state.ts — o estado do botão de ação, PURO
 * (sem React, sem DOM — testado de `tests/uiPrimitivesState.test.ts`).
 *
 * Uma decisão só, e ela estava implícita em dezenas de botões: quando o
 * botão dispara trabalho assíncrono (retry, gerar, submeter) ele fica
 * DESABILITADO e `aria-busy` enquanto o trabalho corre — nunca clicável
 * duas vezes, nunca mudo para o leitor de tela.
 */

/** O estado resolvido — a view só aplica. */
export interface ActionButtonBusyState {
  /** Desligado quando o chamador pediu OU quando está a trabalhar. */
  readonly disabled: boolean;
  /** `aria-busy` do botão (`undefined` quando ocioso — o atributo some). */
  readonly busy: boolean | undefined;
  /** Mostra o spinner no lugar do ícone inicial. */
  readonly showSpinner: boolean;
}

export function actionButtonBusyState(loading: boolean, disabled: boolean): ActionButtonBusyState {
  return {
    disabled: disabled || loading,
    busy: loading ? true : undefined,
    showSpinner: loading,
  };
}
