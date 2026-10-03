/**
 * components/ui/Pressable.tsx — a CASCA de press-feedback `motion.span`.
 *
 * Substitui as 15 cópias do bloco animado que envolvia botões de ação
 * (auditoria de layout §2):
 *
 *   <motion.span whileTap={{ scale: 0.98 }} transition={springs.snappy}
 *     tabIndex={-1} style={{ display: 'inline-block' }}>…</motion.span>
 *
 * ─── CONTRATO ─────────────────────────────────────────────────────────────
 * VIEW PURA (só props + a leitura de `prefers-reduced-motion`, que é
 * apresentação). Toda a configuração do movimento — incluindo o `tabIndex`
 * -1 obrigatório — é decisão de `Pressable.state.ts`, testada sem jsdom.
 *
 * O elemento animado é uma CASCA: quem recebe foco e clique é o controle
 * filho (Button, IconButton…). Por isso `tabIndex={-1}`: sem ele, o `motion`
 * injeta `tabIndex=0` e a frente do próprio botão ganha uma parada de Tab.
 */
import type { ReactElement, ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';

import { pressableMotionState } from './Pressable.state';

export interface PressableProps {
  /** O controle que recebe foco/clique. */
  readonly children: ReactNode;
  /** Hover com lift espacial (a variante do QuizChatCard). */
  readonly hover?: boolean;
  /** Força movimento reduzido (as stories); por omissão lê o sistema. */
  readonly reducedMotion?: boolean;
}

export function Pressable({ children, hover, reducedMotion }: PressableProps): ReactElement {
  const reduzidoDoSistema = useReducedMotion();
  const movimento = pressableMotionState({
    hover,
    reducedMotion: reducedMotion ?? reduzidoDoSistema ?? false,
  });

  return (
    <motion.span
      whileTap={movimento.whileTap}
      whileHover={movimento.whileHover}
      transition={movimento.transition}
      tabIndex={movimento.tabIndex}
      style={movimento.style}
    >
      {children}
    </motion.span>
  );
}
