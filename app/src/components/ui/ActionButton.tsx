/**
 * components/ui/ActionButton.tsx — o BOTÃO DE AÇÃO do design system.
 *
 * É o par da casca `Pressable` (auditoria de layout §2): o bloco que estava
 * copiado 15 vezes — casca animada + `<Button sx={{ whiteSpace: 'nowrap',
 * minHeight: 44, px: 3 }} />` — vira uma linha. O piso de alvo de toque
 * (`TARGET.minTouchTargetPx`, 44px) é aplicado POR OMISSÃO
 * (`actionButtonSx` de `lib/layoutSx.ts`), e o `loading` resolve o estado
 * ocupado (desligado + `aria-busy` + spinner) via `ActionButton.state.ts`.
 *
 * ─── CONTRATO ─────────────────────────────────────────────────────────────
 * VIEW PURA: só props. Sem IPC, sem localStorage, sem relógio global. A copy
 * vive no chamador (ou nas stories, que mostram textos traduzidos); a única
 * copy que o primitivo possui é o anúncio sr-only de "a processar"
 * (`translation:ui.actionButton.busy`, nos dois locales).
 *
 * Acessibilidade: alvo de toque ≥ 44px por omissão; foco visível é o anel do
 * tema (`*:focus-visible` do CssBaseline — `focusRingStyles`); o spinner entra
 * no `startIcon` com o mesmo `size={16}` das três cópias da casa
 * (TrackChallengePanel), e o rótulo visível continua lá (um botão que fica
 * sem nome acessível durante o loading é um bug).
 */
import type { ReactElement } from 'react';
import Button, { type ButtonProps } from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Box from '@mui/material/Box';
import type { SystemStyleObject } from '@mui/system';
import type { Theme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';

import { SR_ONLY_SX } from '../../lib/a11yStyles';
import { actionButtonSx } from '../../lib/layoutSx';
import { Pressable } from './Pressable';
import { actionButtonBusyState } from './ActionButton.state';

export interface ActionButtonProps extends Omit<ButtonProps, 'sx'> {
  /** Composto POR CIMA de `actionButtonSx` (o do chamador é o que vence). */
  readonly sx?: SystemStyleObject<Theme>;
  /** Trabalho assíncrono em curso: desliga o botão, anuncia e mostra spinner. */
  readonly loading?: boolean;
  /** Hover com lift espacial (a variante do QuizChatCard). */
  readonly hover?: boolean;
}

export function ActionButton({
  loading = false,
  hover,
  disabled = false,
  startIcon,
  sx,
  children,
  ...rest
}: ActionButtonProps): ReactElement {
  const { t } = useTranslation();
  const estado = actionButtonBusyState(loading, disabled);

  return (
    <Pressable hover={hover}>
      <Button
        {...rest}
        disabled={estado.disabled}
        aria-busy={estado.busy}
        startIcon={estado.showSpinner ? <CircularProgress size={16} /> : startIcon}
        sx={sx === undefined ? actionButtonSx : [actionButtonSx, sx]}
      >
        {children}
        {estado.showSpinner ? (
          <Box component="span" sx={SR_ONLY_SX}>
            {t('translation:ui.actionButton.busy')}
          </Box>
        ) : null}
      </Button>
    </Pressable>
  );
}
