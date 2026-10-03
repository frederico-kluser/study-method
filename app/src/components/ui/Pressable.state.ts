/**
 * components/ui/Pressable.state.ts — a configuração do FEEDBACK DE PRESS da
 * casca animada, PURA (sem React, sem DOM — testada de
 * `tests/uiPrimitivesState.test.ts`).
 *
 * É a metade "decisão" de `components/ui/Pressable.tsx`: o bloco
 * `whileTap/whileHover/transition/tabIndex/style` que estava copiado 15 vezes
 * (LessonView ×10, QuizChatCard ×3, ChallengeGenerateModal ×2 — auditoria de
 * layout §2) é construído aqui, a partir dos tokens (`PRESS.scale`,
 * `PRESS.hoverLiftPx`, `springs.snappy`).
 *
 * As DUAS decisões que este módulo centraliza:
 *
 *   1. o `tabIndex={-1}` é obrigatório e não negociável — o `motion` marca
 *      `tabIndex=0` em quem tem gesto, o que criaria uma PARADA DE TAB extra
 *      na frente do próprio botão (o comentário copiado nas 15 cópias);
 *   2. `prefers-reduced-motion` desliga o gesto (scale/lift são transform —
 *      quem pediu menos movimento não recebe transform). A casca permanece
 *      (é só layout), mas fica estática.
 */
import type { TargetAndTransition, Transition } from 'motion/react';

import { springs } from '../../lib/animationTokens';
import { PRESS } from '../../lib/designTokens';

/** O que a casca `motion.span` recebe — já decidido, só aplicar. */
export interface PressableMotionState {
  readonly whileTap: TargetAndTransition | undefined;
  readonly whileHover: TargetAndTransition | undefined;
  readonly transition: Transition;
  /** SEMPRE -1 (ver decisão 1 do cabeçalho). */
  readonly tabIndex: -1;
  readonly style: { display: 'inline-block' };
}

export interface PressableMotionOptions {
  /** Hover com lift espacial (a variante do QuizChatCard). */
  readonly hover?: boolean;
  /** Movimento reduzido — o gesto é desligado (ver decisão 2). */
  readonly reducedMotion?: boolean;
}

export function pressableMotionState(options: PressableMotionOptions = {}): PressableMotionState {
  const reduzido = options.reducedMotion === true;
  return {
    whileTap: reduzido ? undefined : { scale: PRESS.scale },
    whileHover: !reduzido && options.hover === true ? { y: -PRESS.hoverLiftPx } : undefined,
    transition: springs.snappy,
    tabIndex: -1,
    style: { display: 'inline-block' },
  };
}
