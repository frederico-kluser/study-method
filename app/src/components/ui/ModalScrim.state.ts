/**
 * components/ui/ModalScrim.state.ts — as decisões do SHELL de overlay/modal,
 * PURAS (sem React, sem DOM — testadas de `tests/uiPrimitivesState.test.ts`).
 *
 * Substitui as 5 cópias do "fixed + scrim + blur + safe-center" (auditoria de
 * layout §6): `QuizOverlayHost` e `ChallengeGenerateModal` eram cópias
 * estruturais — os comentários cruzavam-se ("o MESMO blur do irmão" / "mesma
 * receita do QuizOverlayHost") — e mais `TutorialSelectionModal`,
 * `OnboardingOverlay` e a família `AppGate`/`SetupView`.
 *
 * ─── AS DECISÕES QUE MORAM AQUI ───────────────────────────────────────────
 *   1. CENTRADO SEGURO: `alignItems: 'flex-start'` + `margin: 'auto'` no
 *      cartão (comentário ONDA-UX-SCROLL do exemplar). Com espaço livre as
 *      margens auto centram; com cartão mais alto que a janela elas resolvem
 *      para 0, o cartão encosta ao topo e o shell ROLA (`overflowY: 'auto'`)
 *      até ao fim. `alignItems: 'center'` com overflow corta o topo SEM
 *      deixar alcançá-lo — e `safe center` não está tipado no csstype.
 *   2. O CLIQUE DE DISPENSA é do scrim, nunca do cartão: o alvo do evento tem
 *      de ser o próprio scrim (`target === currentTarget`) — o cartão faz
 *      `stopPropagation`, mas a regra não depende disso.
 *   3. MOVIMENTO REDUZIDO: o cartão entra em fade puro
 *      (`reducedFadeVariants` de `lib/animationTokens.ts`); com movimento, o
 *      ciclo `windowVariants`.
 *
 * ─── OS VALORES, TODOS EXTRAÍDOS (nada é novo) ────────────────────────────
 * `MODAL_SCRIM_PADDING` (16) e `MODAL_SCRIM_BLUR_PX` (6) estavam escritos 2×
 * com o mesmo valor e comentários a jurar que eram iguais (§6); o padding do
 * cartão é a receita do exemplar `QuizOverlayHost`.
 */
import type { Variants } from 'motion/react';

import { reducedFadeVariants, windowVariants } from '../../lib/animationTokens';

/** Padding do shell (px) — a receita copiada das duas cópias irmãs (§6). */
export const MODAL_SCRIM_PADDING = 16;
/** Blur do backdrop (px) — o MESMO nas duas cópias irmãs, agora por escrito. */
export const MODAL_SCRIM_BLUR_PX = 6;
/** Padding do cartão (unidades de `theme.spacing`) — a receita do exemplar. */
export const MODAL_CARD_PADDING = { xs: 2.5, sm: 3 } as const;

/** O estilo inline do shell — a forma do `motion.div` de fora (§6). */
export interface ScrimShellStyle {
  position: 'fixed';
  inset: number;
  zIndex: number;
  display: 'flex';
  alignItems: 'flex-start';
  justifyContent: 'center';
  overflowY: 'auto';
  padding: number;
  background: string;
  backdropFilter: string;
  WebkitBackdropFilter: string;
}

/**
 * O shell do modal: fixed + scrim + blur + centrado seguro + scroll (§6).
 * O `scrim` vem do token do tema (`theme.vars.palette.scrim`) — nunca uma cor
 * crua — e o `zIndex` de `Z_INDEX.*` (designTokens.ts).
 */
export function scrimShellStyle(zIndex: number, scrim: string): ScrimShellStyle {
  const blur = `blur(${MODAL_SCRIM_BLUR_PX}px)`;
  return {
    position: 'fixed',
    inset: 0,
    zIndex,
    display: 'flex',
    // Centrado SEGURO — ver decisão 1 do cabeçalho.
    alignItems: 'flex-start',
    justifyContent: 'center',
    overflowY: 'auto',
    padding: MODAL_SCRIM_PADDING,
    background: scrim,
    backdropFilter: blur,
    WebkitBackdropFilter: blur,
  };
}

/** O wrapper do cartão: largura total até ao teto, centrado com `margin: auto`. */
export function scrimCardStyle(maxWidth: number): {
  width: '100%';
  maxWidth: number;
  margin: 'auto';
} {
  return { width: '100%', maxWidth, margin: 'auto' };
}

/** As variantes do cartão — fade puro sob movimento reduzido (decisão 3). */
export function scrimCardVariants(reducedMotion: boolean): Variants {
  return reducedMotion ? reducedFadeVariants : windowVariants;
}

/**
 * O clique foi no PRÓPRIO scrim (dispensa), e não dentro do cartão.
 * `target === currentTarget` é a regra inteira: sem delegação a classes, sem
 * depender do `stopPropagation` do cartão.
 */
export function isScrimBackdropClick(target: unknown, currentTarget: unknown): boolean {
  return target === currentTarget;
}
