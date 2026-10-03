/**
 * components/ui/RetryAlert.state.ts — as decisões "há retry?" e "há
 * descarte?" do alerta, PURAS (sem React, sem DOM — testadas de
 * `tests/uiPrimitivesState.test.ts`).
 *
 * O `RetryAlert` nasceu como "Alert com retry NA AÇÃO" (auditoria de layout
 * §3, forma (b)), mas o mesmo bloco mensagem/detalhe serve erros SEM retry —
 * o bloco de erro de CHAVE do ChallengeFeedbackPanel é caso real (onda de
 * migração bloqueada até esta prop existir). A regra de honestidade aqui:
 *
 *   - `action: false` NUNCA mostra o botão (o chamador decide que não há
 *     retentativa — ex.: chave inválida não se "tenta de novo");
 *   - sem `onRetry` também não há botão: um "Tentar de novo" que não faz
 *     nada é mentira;
 *   - o default (`action` omitido + `onRetry` dado) preserva o comportamento
 *     original do primitivo: botão presente.
 *
 * ─── EXTENSÃO ADITIVA (onda DRY da LessonView) ────────────────────────────
 * Os três Alerts da aula (erro do canal do quiz, erro do mic, erro do tutor)
 * têm DESCARTE (`onClose`): o × do `Alert` do MUI. A mesma regra de
 * honestidade vale para ele — sem `onClose` não há × — e há MAIS uma regra,
 * do próprio MUI v9 (Alert.js: `action == null && onClose`), que esta
 * decisão expõe em vez de deixar morrer em silêncio:
 *
 *   - retry e × são MUTUAMENTE EXCLUSIVOS — quando há ação em cena, o `Alert`
 *     desenha a ação e NÃO o ×. É o comportamento de HOJE de todos os
 *     consumidores (a cópia do erro do tutor dizia-o a palavras: "sem receita,
 *     só o fechar de sempre"), preservado byte a byte por esta regra;
 *   - sem `onClose` não há × (um descarte que não descarta é mentira).
 *
 * Se um dia quisermos retry E × no mesmo alerta, é AQUI que a decisão muda
 * (e a vista passa a compor os dois dentro do slot `action`) — nunca num
 * `onClose` entregue ao MUI para ele ignorar.
 */

export interface RetryAlertStateOptions {
  /** `false` esconde o botão mesmo com `onRetry` (default: mostrar). */
  readonly action?: boolean;
  /** O handler do retry — sem ele não há botão. */
  readonly onRetry?: () => void;
  /** O handler do descarte — sem ele não há ×. */
  readonly onClose?: () => void;
}

export interface RetryAlertState {
  /** O botão "Tentar de novo" entra na ação do Alert. */
  readonly showRetry: boolean;
  /** O × de descarte entra no Alert — nunca junto do retry (regra do MUI). */
  readonly showDismiss: boolean;
}

export function retryAlertState(options: RetryAlertStateOptions = {}): RetryAlertState {
  const showRetry = options.action !== false && options.onRetry !== undefined;
  return {
    showRetry,
    showDismiss: options.onClose !== undefined && !showRetry,
  };
}
