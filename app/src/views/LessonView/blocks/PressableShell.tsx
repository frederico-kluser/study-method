/**
 * blocks/PressableShell.tsx — a CASCA de press-feedback dos botões da aula
 * (audit LAYOUT-DRY-AUDIT §2: o mesmo bloco `motion.span` estava copiado 15×
 * em 4 ficheiros, 10 deles em LessonView.tsx).
 *
 * É hoje um alias do primitivo `components/ui/Pressable` (o primitivo de
 * design system que a audit propõe e que já existe em código): o DOM emitido
 * é o mesmo — `motion.span` com `whileTap={scale: MOTION.pressScale}`,
 * `transition={springs.snappy}`, `tabIndex={-1}` (ONDA12: a casca animada
 * NUNCA é parada de tab — quem recebe foco é o controle dentro dela) e
 * `display: inline-block`. Mantido como bloco da aula para as histórias
 * `Componentes/Aula/*` documentarem o vocabulário da view.
 */
import type { ReactElement, ReactNode } from 'react';
import { Pressable } from '../../../components/ui/Pressable';

export interface PressableShellProps {
  /** O controle (Button/IconButton) que recebe foco e clique. */
  children: ReactNode;
}

export function PressableShell({ children }: PressableShellProps): ReactElement {
  return <Pressable>{children}</Pressable>;
}
