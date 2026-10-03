/**
 * src/lib/copyFeedbackState.ts — a MÁQUINA DE ESTADO do feedback do botão
 * "Copiar" do bloco de código, PURA e testável por `node:test` sem jsdom
 * (convenção da casa: `chatBubbleStyle.ts`, `themeModeState.ts`).
 *
 * ─── DE ONDE VEM (ONDA-CODIGO-EDITOR, finding-2 da auditoria uxui) ────────
 * "1 clique para copiar" — o botão copia o `code` CRU do bloco e confirma com
 * "Copiado ✓" por ~2 s. W15 da mesma auditoria: a FALHA de cópia também é
 * estado visível (antes `if (!ok) return` deixava o clique parecer morto).
 *
 * ─── CONTRATO STATE/VIEW ──────────────────────────────────────────────────
 * Antes, `CodeBlock.tsx` carregava DOIS booleanos (`copied`, `copyFailed` —
 * 4 combinações, 2 delas ilegais) e o temporizador do hold. As TRANSIÇÕES —
 * o que cada evento faz ao estado — vivem aqui; o fio dos timers
 * (`setTimeout`/`clearTimeout`) e a escolha de rótulo/ícone (view) ficam no
 * componente. Estados e transições:
 *
 *   idle ──copy(ok)──▶ copied ──hold-elapsed──▶ idle
 *   idle ──copy(falha)──▶ failed ──hold-elapsed──▶ idle
 *
 * `copied`/`failed` nunca se sobrepõem: é UM estado de cada vez (as duas
 * chaves de i18n `common.copiedCode`/`common.copyFailed` alternam no mesmo
 * rótulo). O hold é o mesmo nos dois caminhos (COPIED_HOLD_MS).
 *
 * PURO: sem React, sem DOM, sem timers (`src/lib` é compilado pelo
 * tsconfig.node.json com lib ES2022 SEM DOM — é daqui que os testes node:test
 * leem).
 */

/**
 * ONDA-CODIGO-EDITOR (finding-2): quanto tempo o botão fica em "Copiado ✓".
 * O audit pede "~2s" — tempo de ler a confirmação sem o estado se arrastar.
 */
export const COPIED_HOLD_MS = 2000;

/** Estado visível do botão de cópia (UM de cada vez — ver cabeçalho). */
export type CopyFeedback = 'idle' | 'copied' | 'failed';

/** O estado após uma tentativa de cópia: `ok` → 'copied'; falha → 'failed'. */
export function copyFeedbackAfterCopy(ok: boolean): CopyFeedback {
  return ok ? 'copied' : 'failed';
}

/** O estado após o hold expirar: volta ao repouso ('idle'). */
export function copyFeedbackAfterHold(): CopyFeedback {
  return 'idle';
}

/** true quando o botão mostra o "Copiado ✓" (ícone de confirmação, aria-live). */
export function copyFeedbackShowsCheck(state: CopyFeedback): boolean {
  return state === 'copied';
}

/** true quando a última cópia FALHOU (o feedback vira erro, não silêncio). */
export function copyFeedbackIsFailure(state: CopyFeedback): boolean {
  return state === 'failed';
}
