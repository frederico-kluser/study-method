/**
 * src/components/shell/SplitDivider.tsx — a DIVISÓRIA ARRASTÁVEL do shell.
 *
 * ─── DE ONDE VEM O PADRÃO ──────────────────────────────────────────────────
 * VSCode: a área lateral (explorer) e a área de código são separadas por um
 * divisor que o usuário arrasta para dar mais/menos espaço horizontal a cada
 * lado. Aqui o par é a barra lateral do shell ⟷ o `main` com as views —
 * exatamente o que o dono pediu: *"assim tenho mais espaço vertical e essa
 * área que quero movimentar para aumentar ou diminuir o espaço de texto
 * horizontal será esse sidebar"*.
 *
 * ─── POR QUE A MATEMÁTICA MORA EM OUTRO ARQUIVO ────────────────────────────
 * Toda a aritmética (clamp com piso em px, razão⟷px, teclado APG, valores
 * ARIA) já existe em `src/lib/splitRatio.ts`, pura e testada em node:test sem
 * jsdom. Este componente é só marcação, ref e eventos — a onda 3 do desafio
 * vai reusar o MESMO módulo para o split enunciado ⟷ editor.
 *
 * ─── A11Y: PADRÃO WAI-ARIA APG "Window Splitter" ───────────────────────────
 * `role="separator"` com `aria-orientation="vertical"` (o TRAÇO é vertical —
 * painéis lado a lado), `aria-valuemin/now/max` vindos de `splitAriaValues`
 * (fronteiras EFETIVAS, com o piso em px — não as constantes cruas),
 * `aria-controls` para os dois painéis e o teclado completo via
 * `nextRatioForKey` (setas, Home/End, PageUp/PageDown — APG §Window Splitter).
 * A função devolve `null` para tecla não tratada: só aí chamamos
 * `preventDefault()`, para não sequestrar Tab nem atalhos do app.
 *
 * ─── PONTEIRO ──────────────────────────────────────────────────────────────
 * `setPointerCapture` no `pointerdown` garante que TODO `pointermove` seguinte
 * chega ao divisor mesmo com o cursor fora dele (borda da janela, outro painel)
 * — sem capture, arrastar rápido "solta" a divisória no meio. `touch-action:
 * none` é o que deixa o arraste funcionar em touch (senão o browser consome o
 * gesto para scroll). Durante o arraste a razão segue o ponteiro SEM
 * transição — o `flex-basis` da barra anima só no passo de TECLADO (regra do
 * SPLIT_MOTION em splitRatio.ts; animar o arraste faz a divisória "nadar"
 * atrás do mouse).
 */
import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactElement } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import { SHAPE } from '../../lib/designTokens';
import {
  ratioFromPointer,
  splitAriaValues,
  nextRatioForKey,
  type SplitConstraints,
} from '../../lib/splitRatio';
import { FOCUS_RING, focusRingStyles } from '../../theme';

export interface SplitDividerProps {
  /** Razão atual do painel líder (a barra lateral do shell). */
  readonly ratio: number;
  /** Largura do contêiner em px (barra + divisória + main). 0 = não medido. */
  readonly containerPx: number;
  /** Restrições — a divisória não decide números, só obedece. */
  readonly constraints: SplitConstraints;
  /** Nova razão (já clampada pela matemática pura) a cada movimento/tecla. */
  readonly onRatioChange: (ratio: number) => void;
  /** O arraste começou — o shell desliga a transição do flex-basis. */
  readonly onDragStart?: () => void;
  /** O arraste acabou — o shell persiste a razão e religa a transição. */
  readonly onDragEnd?: () => void;
  /** Rótulo da divisória para o leitor de tela. */
  readonly ariaLabel: string;
  /** Dica de uso (arraste/teclado), exposta via `aria-describedby`. */
  readonly hint?: string;
  /** Id do elemento que descreve a divisória (o span da dica). */
  readonly hintId: string;
  /** Ids dos dois painéis controlados — `aria-controls` (APG). */
  readonly controlsIds: readonly [string, string];
  /** Id estável da divisória. */
  readonly dividerId: string;
}

/** Span visualmente escondido — carrega o texto da dica para `aria-describedby`. */
const HIDDEN_HINT_SX = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

export default function SplitDivider({
  ratio,
  containerPx,
  constraints,
  onRatioChange,
  onDragStart,
  onDragEnd,
  ariaLabel,
  hint,
  hintId,
  controlsIds,
  dividerId,
}: SplitDividerProps): ReactElement {
  /** Última origem do contêiner vista no pointerdown — congelada no arraste. */
  const dragOriginRef = useRef<{ originPx: number; widthPx: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const aria = splitAriaValues(ratio, containerPx, 'vertical', constraints);

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      // Só o botão principal arrasta; toque também chega como botão 0.
      if (event.button !== 0) return;
      const container = event.currentTarget.parentElement;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      dragOriginRef.current = { originPx: rect.left, widthPx: rect.width };
      // CAPTURE ANTES de tudo: sem isto, um arraste rápido escapa do elemento.
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
      onDragStart?.();
      event.preventDefault();
    },
    [onDragStart],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const origin = dragOriginRef.current;
      if (!origin) return;
      onRatioChange(
        ratioFromPointer(event.clientX, origin.originPx, origin.widthPx, constraints),
      );
    },
    [constraints, onRatioChange],
  );

  const endDrag = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!dragOriginRef.current) return;
      dragOriginRef.current = null;
      setDragging(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      onDragEnd?.();
    },
    [onDragEnd],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      // `null` = tecla NÃO tratada (Tab, atalhos...): deixa passar SEM preventDefault.
      const next = nextRatioForKey(event.key, ratio, containerPx, {
        orientation: 'vertical',
        constraints,
      });
      if (next === null) return;
      event.preventDefault();
      onRatioChange(next);
    },
    [ratio, containerPx, constraints, onRatioChange],
  );

  return (
    <Box
      component="div"
      role="separator"
      id={dividerId}
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={ariaLabel}
      aria-valuemin={aria.valueMin}
      aria-valuemax={aria.valueMax}
      aria-valuenow={aria.valueNow}
      aria-controls={controlsIds.join(' ')}
      aria-describedby={hint ? hintId : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={handleKeyDown}
      data-dragging={dragging || undefined}
      sx={(theme) => ({
        flexShrink: 0,
        width: constraints.dividerPx,
        cursor: 'col-resize',
        // Touch: o gesto é NOSSO (arraste), não scroll do browser.
        touchAction: 'none',
        backgroundColor: theme.vars.palette.surface.level3,
        // Alvo de mouse mais generoso que o traço visual (6px é fino demais
        // para agarrar de primeira) — área estendida SEM mudar o layout.
        position: 'relative',
        '&::after': {
          content: '""',
          position: 'absolute',
          insetInline: -3,
          top: 0,
          bottom: 0,
        },
        '&:hover': {
          backgroundColor: theme.vars.palette.primary.fill,
        },
        // Anel de foco GRANDE e igual ao do resto do app (FOCUS_RING de tema;
        // mesmo padrão de ':focus-visible' usado pelo NavigationRail).
        '&:focus-visible': focusRingStyles(theme),
        borderRadius: `${SHAPE.sm}px`,
        '@media (prefers-reduced-motion: reduce)': {
          // O traço não anima nada por conta própria (a barra anima o
          // flex-basis, e isso honra reduced-motion do lado dela).
          transition: 'none',
        },
      })}
    >
      {hint ? (
        <Typography id={hintId} component="span" sx={HIDDEN_HINT_SX}>
          {hint}
        </Typography>
      ) : null}
    </Box>
  );
}
