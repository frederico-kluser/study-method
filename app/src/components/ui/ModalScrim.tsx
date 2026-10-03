/**
 * components/ui/ModalScrim.tsx — o SHELL de overlay/modal
 * (auditoria de layout §6): fixed + scrim + blur + centrado seguro + scroll.
 *
 * Era o bloco de ~25 linhas copiado entre `QuizOverlayHost` e
 * `ChallengeGenerateModal` (cópias estruturais — os comentários cruzavam-se a
 * jurar que o blur era o mesmo) e repetido com variantes em
 * `TutorialSelectionModal`, `OnboardingOverlay` e na família
 * `AppGate`/`SetupView`. Agora é uma linha: `<ModalScrim …>`.
 *
 * ─── CONTRATO ─────────────────────────────────────────────────────────────
 * VIEW: só props (mais as duas leituras de apresentação — `useTheme` para o
 * token do scrim e `useReducedMotion` para as variantes). Nada de IPC,
 * localStorage ou estado de app. Toda a decisão (shell, clique de dispensa,
 * variantes) vive em `ModalScrim.state.ts` e no laço de foco de
 * `lib/focusTrap.ts` via `useFocusTrap`.
 *
 * Visual 100% do contrato: o scrim é o token `theme.vars.palette.scrim`; o
 * cartão segue a REGRA DO MODAL do tema (`modalSurfaceStyles` de
 * `src/theme.ts` — nível 1 no claro, nível 4 no escuro, `applyStyles('dark')`
 * por último) e o raio vem de `SHAPE.md`. O `role="dialog"` + `aria-modal` +
 * `aria-label` (o chamador traduz) estão no cartão, que é quem recebe o foco
 * ao abrir.
 */
import type { MouseEvent, ReactElement, ReactNode } from 'react';
import { useRef } from 'react';
import Box from '@mui/material/Box';
import { useTheme, type Theme } from '@mui/material/styles';
import type { SystemStyleObject } from '@mui/system';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { springs } from '../../lib/animationTokens';
import { LAYOUT, SHAPE, Z_INDEX } from '../../lib/designTokens';
import { modalSurfaceStyles } from '../../theme';
import {
  MODAL_CARD_PADDING,
  isScrimBackdropClick,
  scrimCardStyle,
  scrimCardVariants,
  scrimShellStyle,
} from './ModalScrim.state';
import { useFocusTrap } from './useFocusTrap';

export interface ModalScrimProps {
  /** Aberto/fechado (a saída anima via `AnimatePresence`). */
  readonly open: boolean;
  /**
   * Nome acessível do diálogo em LINHA — a copy vive no chamador (traduzida).
   * O contrato: o diálogo tem de ter um nome acessível, OU `ariaLabel` OU
   * `ariaLabelledBy` (o accname dá prioridade ao `aria-labelledby`).
   */
  readonly ariaLabel?: string;
  /**
   * Id do elemento que nomeia o diálogo (`aria-labelledby`) — o contrato
   * auditado do tutorial (achado-1): o TÍTULO do modal é o nome acessível.
   */
  readonly ariaLabelledBy?: string;
  /**
   * Id do elemento que descreve o diálogo (`aria-describedby`) — o SUBTÍTULO
   * do tutorial (achado-1). Sem ele o leitor de tela só lê o nome.
   */
  readonly ariaDescribedBy?: string;
  /** Dispensa: clique no scrim ou `Escape`. */
  readonly onDismiss: () => void;
  /** Teto do cartão em px — `LAYOUT.*` (por omissão `LAYOUT.modalCardPx`). */
  readonly maxWidth?: number;
  /** Camada — `Z_INDEX.*` (por omissão `Z_INDEX.modal`). */
  readonly zIndex?: number;
  /** Força movimento reduzido (as stories); por omissão lê o sistema. */
  readonly reducedMotion?: boolean;
  /**
   * CHROME do cartão — estilo composto POR CIMA da superfície base do
   * primitivo (superfície modal + raio `SHAPE.md` + padding): a moldura/sombra
   * medida de cada modal (ex.: o `cardShadow` `color-mix` do QuizOverlayHost,
   * o glow do done) entra aqui sem reescrever o scrim/safe-center. O `sx` do
   * chamador é o que vence a ordem.
   */
  readonly cardSx?: SystemStyleObject<Theme>;
  /** Classe do cartão (para CSS/chaves de animação próprias do chamador). */
  readonly cardClassName?: string;
  /** Âncora de devolução de foco — o card que sobrevive ao fecho (§7). */
  readonly getReturnAnchor?: () => HTMLElement | null;
  readonly children?: ReactNode;
}

export function ModalScrim({
  open,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  onDismiss,
  maxWidth = LAYOUT.modalCardPx,
  zIndex = Z_INDEX.modal,
  reducedMotion,
  cardSx,
  cardClassName,
  getReturnAnchor,
  children,
}: ModalScrimProps): ReactElement {
  const theme = useTheme();
  const reduzidoDoSistema = useReducedMotion();
  const reduzido = reducedMotion ?? reduzidoDoSistema ?? false;
  const cardRef = useRef<HTMLDivElement | null>(null);

  useFocusTrap({ containerRef: cardRef, active: open, onDismiss, getReturnAnchor });

  // A superfície base do cartão — a REGRA DO MODAL do tema (nível 1 no claro,
  // nível 4 no escuro, `applyStyles('dark')` por último) + raio de `SHAPE` +
  // o padding do exemplar. O chrome do chamador (`cardSx`) compõe por cima.
  const cardBaseSx = (tema: Theme) => ({
    ...modalSurfaceStyles(tema),
    borderRadius: `${SHAPE.md}px`,
    p: MODAL_CARD_PADDING,
  });

  // Dispensa só quando o clique é no PRÓPRIO scrim (ModalScrim.state.ts) — o
  // cartão não propaga, mas a regra não depende disso.
  const handleScrimClick = (event: MouseEvent<HTMLDivElement>): void => {
    if (isScrimBackdropClick(event.target, event.currentTarget)) onDismiss();
  };
  const stopPropagation = (event: MouseEvent<HTMLDivElement>): void => {
    event.stopPropagation();
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="modal-scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={springs.snappy}
          style={scrimShellStyle(zIndex, theme.vars.palette.scrim)}
          onClick={handleScrimClick}
        >
          <motion.div
            variants={scrimCardVariants(reduzido)}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={reduzido ? springs.snappy : springs.window}
            style={scrimCardStyle(maxWidth)}
            onClick={stopPropagation}
          >
            <Box
              ref={cardRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label={ariaLabel}
              aria-labelledby={ariaLabelledBy}
              aria-describedby={ariaDescribedBy}
              className={cardClassName}
              sx={cardSx === undefined ? cardBaseSx : [cardBaseSx, cardSx]}
            >
              {children}
            </Box>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
