/**
 * components/ui/useFocusTrap.ts — o adapter React do laço de foco
 * (auditoria de layout §7, `useFocusTrap`).
 *
 * ─── POR QUE ESTE ARQUIVO NÃO TEM DECISÃO NENHUMA ────────────────────────
 * `src/lib` compila SEM DOM nem React (tsconfig.node.json), então o laço —
 * seletor, regras de borda, devolução de foco — vive em `lib/focusTrap.ts`,
 * puro e testado por `node:test` com objetos de mentira
 * (`tests/focusTrap.test.ts`). Este hook é COLETA: liga refs/DOM às funções
 * puras e não acrescenta regra nenhuma. Se uma regra nova aparecer, ela nasce
 * lá e ganha teste; aqui só se liga.
 *
 * Contrato ao abrir (o mesmo das quatro cópias que este hook aposenta —
 * `QuizOverlayHost`, `ChallengeGenerateModal`, `TutorialSelectionModal`,
 * `OnboardingOverlay`):
 *   1. grava quem tinha o foco (o abridor — `<body>` NUNCA conta: está sempre
 *      conectado e o `focus()` dele é um no-op que PARECE ter funcionado);
 *   2. o foco ENTRA no painel (o teclado não fica no app atrás do scrim);
 *   3. `Escape` dispensa (o chamador decide o que é dispensar);
 *   4. `Tab` circula DENTRO do painel (`createFocusLoop`);
 *   5. ao fechar, o foco VOLTA para onde estava (`focusReturnTarget`, com a
 *      âncora que sobrevive ao fecho quando o abridor já não existe).
 */
import { useEffect, useRef, type RefObject } from 'react';

import { createFocusLoop, focusReturnTarget } from '../../lib/focusTrap';

export interface FocusTrapOptions {
  /** O painel `aria-modal` (com `tabIndex={-1}` para receber o foco de entrada). */
  readonly containerRef: RefObject<HTMLElement | null>;
  /** O laço está ativo (modal aberto). */
  readonly active: boolean;
  /** `Escape` — o chamador decide o que é dispensar. */
  readonly onDismiss: () => void;
  /**
   * A âncora que SOBREVIVE ao fecho (o card que continha o abridor) — a perna
   * 2 da devolução de foco. Sem ela, só o abridor de verdade é candidato.
   * O `HTMLElement` real satisfaz sozinho o contrato estrutural
   * (`FocusReturnAnchor`) — ver `lib/focusTrap.ts`.
   */
  readonly getReturnAnchor?: () => HTMLElement | null;
}

export function useFocusTrap({
  containerRef,
  active,
  onDismiss,
  getReturnAnchor,
}: FocusTrapOptions): void {
  /** Quem tinha o foco quando o modal abriu (a perna 1 da devolução). */
  const openerRef = useRef<HTMLElement | null>(null);
  // Callbacks fora das dependências: trocar identidade de `onDismiss` não pode
  // re-executar o efeito — ele recapturaria o abridor DEPOIS de o foco já estar
  // dentro do painel e devolveria o foco ao próprio modal.
  const onDismissRef = useRef(onDismiss);
  const getReturnAnchorRef = useRef(getReturnAnchor);
  useEffect(() => {
    onDismissRef.current = onDismiss;
    getReturnAnchorRef.current = getReturnAnchor;
  });

  useEffect(() => {
    if (!active) return;
    const ativo = document.activeElement;
    if (ativo instanceof HTMLElement && ativo !== document.body) {
      openerRef.current = ativo;
    }
    containerRef.current?.focus();

    const loopDeFoco = createFocusLoop({
      getContainer: () => containerRef.current,
      getActive: () => document.activeElement,
    });
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onDismissRef.current();
        return;
      }
      loopDeFoco(event);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      // O `HTMLElement` satisfaz o contrato estrutural (`FocusReturnAnchor`)
      // por si — ver `lib/focusTrap.ts`. N inferido = `HTMLElement`, a mesma
      // forma da chamada original em `QuizOverlayHost`.
      const alvo = focusReturnTarget(openerRef.current, getReturnAnchorRef.current?.() ?? null);
      openerRef.current = null;
      alvo?.focus();
    };
  }, [active, containerRef]);
}
