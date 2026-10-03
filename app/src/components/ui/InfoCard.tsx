/**
 * components/ui/InfoCard.tsx — o CARTÃO DE LISTA
 * (auditoria de layout §10): `Card variant="outlined"` + `CardContent` com o
 * padding canónico, título `subtitle1` semibold e subtítulo secundário.
 *
 * As ~9 cópias (placeholders ×3, RoadmapView ×2, OrphanTracksPanel e os
 * cartões de estado de setup) repetiam o mesmo padding
 * (`p: 1.5, '&:last-child': { pb: 1.5 }` — agora `infoCardPaddingSx` de
 * `lib/layoutSx.ts`) e o mesmo `fontWeight: 600` do subtítulo (16 cópias em
 * 13 ficheiros — agora `infoCardTitleSx`). O cartão SELECIONÁVEL é o
 * "padrão do SubjectCard" (`CardActionArea`): o cartão vira botão real
 * (Tab + Enter/Espaço), nunca uma div com onClick.
 *
 * ─── CONTRATO ─────────────────────────────────────────────────────────────
 * VIEW PURA: só props. O modelo de interação (informativo/acionável/selecionado
 * + a ARIA honesta + a superfície de hover/seleção, sempre em referência de
 * paleta do tema) é `InfoCard.state.ts`, testado sem jsdom. A copy vive no
 * chamador. Quebra, nunca recorta: `overflowWrap: 'break-word'` no título.
 */
import type { ReactElement, ReactNode } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';

import { infoCardPaddingSx, infoCardTitleSx } from '../../lib/layoutSx';
import { infoCardState } from './InfoCard.state';

export interface InfoCardProps {
  readonly title: ReactNode;
  /** Subtítulo secundário (o `caption` das cópias). */
  readonly subtitle?: ReactNode;
  /** Slot de ações/chips à direita. */
  readonly actions?: ReactNode;
  /** Ícone/distintivo à esquerda (ex.: `TrackProgressBadge`). */
  readonly icon?: ReactNode;
  /** Torna o cartão acionável (`CardActionArea` — botão real). */
  readonly selectable?: boolean;
  /** Estado selecionado (só significa alguma coisa com `selectable`). */
  readonly selected?: boolean;
  /** O clique — exigido pelo modo acionável. */
  readonly onClick?: () => void;
}

export function InfoCard({
  title,
  subtitle,
  actions,
  icon,
  selectable = false,
  selected = false,
  onClick,
}: InfoCardProps): ReactElement {
  const estado = infoCardState({ selectable, selected });

  const conteudo = (
    <CardContent sx={infoCardPaddingSx}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        {icon}
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography variant="subtitle1" sx={infoCardTitleSx}>
            {title}
          </Typography>
          {subtitle ? (
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
              {subtitle}
            </Typography>
          ) : null}
        </Box>
        {actions}
      </Box>
    </CardContent>
  );

  return (
    <Card variant="outlined" sx={estado.surfaceSx}>
      {estado.interactive ? (
        <CardActionArea onClick={onClick} aria-pressed={estado.selected}>
          {conteudo}
        </CardActionArea>
      ) : (
        conteudo
      )}
    </Card>
  );
}
