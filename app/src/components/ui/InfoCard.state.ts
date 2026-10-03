/**
 * components/ui/InfoCard.state.ts — o modelo de interação do cartão de lista,
 * PURO (sem React, sem DOM — testado de `tests/uiPrimitivesState.test.ts`).
 *
 * As ~9 cópias do "cartão de lista" (auditoria de layout §10) tinham três
 * modos que se distinguiam só no código de cada view: informativo (só
 * CardContent), acionável (Card + CardActionArea — "o padrão do SubjectCard")
 * e selecionado. A regra de honestidade ARIA está aqui:
 *
 *   - `aria-pressed` SÓ existe quando o cartão é um toggle (`selectable`);
 *     num cartão informativo ele mentiria ("este texto está premido?");
 *   - o fundo de hover é dos ACIONÁVEIS e vem do tema (`action.hover`); o de
 *     seleção vem de `action.selected`. NENHUMA cor crua — referência de
 *     paleta, que o `theme.vars` resolve nos dois esquemas.
 */

export interface InfoCardSurfaceSx {
  /** Hover (só acionáveis) — a referência de paleta do tema. */
  readonly '&:hover'?: { readonly bgcolor: string };
  /** Seleção estática (só toggle selecionado). */
  readonly bgcolor?: string;
}

export interface InfoCardState {
  /** O cartão é acionável (renderiza `CardActionArea`) ou só informativo. */
  readonly interactive: boolean;
  /** `aria-pressed` — `undefined` quando o cartão não é toggle. */
  readonly selected: boolean | undefined;
  readonly surfaceSx: InfoCardSurfaceSx;
}

export interface InfoCardStateOptions {
  readonly selectable?: boolean;
  readonly selected?: boolean;
}

export function infoCardState(options: InfoCardStateOptions = {}): InfoCardState {
  const selectable = options.selectable === true;
  const selecionado = selectable && options.selected === true;
  return {
    interactive: selectable,
    selected: selectable ? options.selected === true : undefined,
    surfaceSx: selecionado
      ? { bgcolor: 'action.selected' }
      : selectable
        ? { '&:hover': { bgcolor: 'action.hover' } }
        : {},
  };
}
