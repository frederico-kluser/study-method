/**
 * components/ui/EmptyState.tsx — o ESTADO VAZIO centralizado: ícone + título +
 * descrição + CTA (auditoria de layout §4).
 *
 * É o formato de `LessonView.tsx` (o bloco "nenhuma aula de trilha
 * selecionada") feito primitivo: coluna centrada com respiro, ícone grande do
 * acento, título, descrição com medida tectada e a ação por baixo.
 *
 * VIEW PURA: só props (o ícone entra como COMPONENTE de ícone MUI, para que a
 * cor/tamanho venham do primitivo e não de cada chamador). A copy — título,
 * descrição, rótulo do CTA — vive no chamador e nas stories (pt-BR/en), nunca
 * aqui.
 *
 * Os dois números são EXTRAÍDOS do bloco original, não inventados:
 * `EMPTY_ICON_FONT_PX` (56) e `EMPTY_DESCRIPTION_MAX_PX` (480 — a medida da
 * descrição, mesmo piso de leitura do `LAYOUT.readingColumnPx`, encolhida para
 * a coluna ficar com o título como âncora).
 */
import type { ComponentType, ReactElement, ReactNode } from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { SvgIconProps } from '@mui/material/SvgIcon';

import { LAYOUT } from '../../lib/designTokens';
import { centeredColumnSx } from '../../lib/layoutSx';

/** Tamanho do ícone do estado vazio (do bloco original da LessonView). */
export const EMPTY_ICON_FONT_PX = 56;
/** Medida da descrição do estado vazio (do bloco original da LessonView). */
export const EMPTY_DESCRIPTION_MAX_PX = 480;

export interface EmptyStateProps {
  /** Ícone MUI (ex.: `<AutoStoriesIcon />` como componente, não como nó). */
  readonly icon?: ComponentType<SvgIconProps>;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  /** O CTA — já traduzido pelo chamador. */
  readonly action?: ReactNode;
  /** Teto de largura em px — `LAYOUT.*`. Por omissão, a coluna de leitura. */
  readonly width?: number;
  /** Respiro do topo (unidades de `theme.spacing`) — 6 no bloco original. */
  readonly topPad?: number;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  width = LAYOUT.readingColumnPx,
  topPad = 6,
}: EmptyStateProps): ReactElement {
  return (
    <Stack spacing={2} sx={[centeredColumnSx(width, topPad), { alignItems: 'center' }]}>
      {Icon ? <Icon color="primary" sx={{ fontSize: EMPTY_ICON_FONT_PX }} /> : null}
      <Typography variant="h6" align="center">
        {title}
      </Typography>
      {description ? (
        <Typography
          variant="body2"
          align="center"
          sx={{ color: 'text.secondary', maxWidth: EMPTY_DESCRIPTION_MAX_PX }}
        >
          {description}
        </Typography>
      ) : null}
      {action}
    </Stack>
  );
}
