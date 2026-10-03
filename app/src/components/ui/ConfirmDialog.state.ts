/**
 * components/ui/ConfirmDialog.state.ts — as decisões do diálogo de confirmação,
 * PURAS (sem React, sem DOM — testadas de `tests/uiPrimitivesState.test.ts`).
 *
 * As 4 cópias do diálogo (auditoria de layout §9 — ProgressPanel,
 * OrphanTracksPanel, LocalAiPanel, FileExplorer) repetiam duas regras sem as
 * escrever:
 *
 *   1. OS IDS ARIA derivam de uma base única (`…-title`, `…-description`) —
 *      cada cópia inventava o seu par à mão e o `aria-labelledby` só
 *      funcionava se ninguém esquecesse de os casar;
 *   2. OCUPADO trava TUDO: fechar, cancelar e confirmar — as cópias
 *      espalhavam `disabled={busy}` e `if (!busy)` por quatro sítios.
 */

export interface ConfirmDialogIds {
  readonly titleId: string;
  readonly descriptionId: string;
}

/** Os ids ARIA do diálogo, derivados da base (o `useId` da view). */
export function confirmDialogIds(baseId: string): ConfirmDialogIds {
  return { titleId: `${baseId}-title`, descriptionId: `${baseId}-description` };
}

export interface ConfirmDialogActionsState {
  /** O cancelamento fica bloqueado enquanto o trabalho corre. */
  readonly cancelDisabled: boolean;
  /** A confirmação idem — nenhuma confirmação dupla. */
  readonly confirmDisabled: boolean;
  /** Esc/backdrop fecham o diálogo? Só quando não está ocupado. */
  readonly canDismiss: boolean;
}

export function confirmDialogActionsState(busy: boolean): ConfirmDialogActionsState {
  return {
    cancelDisabled: busy,
    confirmDisabled: busy,
    canDismiss: !busy,
  };
}
