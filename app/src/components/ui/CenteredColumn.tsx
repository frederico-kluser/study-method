/**
 * components/ui/CenteredColumn.tsx — o molde "coluna centrada"
 * `p: 2, maxWidth: N, mx: 'auto'` (auditoria de layout §4).
 *
 * Estava copiado 13 vezes com seis larguras diferentes escritas à mão (o `640`
 * sozinho, 12 vezes em 8 ficheiros). A largura vem SEMPRE de `LAYOUT.*`
 * (`src/lib/designTokens.ts`) e o `sx` de `lib/layoutSx.ts`
 * (`centeredColumnSx`) — nenhum número vive aqui.
 *
 * VIEW PURA: só props. É o contentor de leitura/estado de quase todas as
 * views: erro de carregamento (`LoadErrorState`), estado vazio (`EmptyState`),
 * listas e painéis.
 */
import type { ReactElement, ReactNode } from 'react';
import Box from '@mui/material/Box';

import { LAYOUT } from '../../lib/designTokens';
import { centeredColumnSx } from '../../lib/layoutSx';

export interface CenteredColumnProps {
  /** Teto de largura em px — `LAYOUT.*`. Por omissão, a coluna de leitura. */
  readonly width?: number;
  /** Respiro extra no topo (unidades de `theme.spacing`): 4 nos blocos de erro. */
  readonly topPad?: number;
  readonly children?: ReactNode;
}

export function CenteredColumn({
  width = LAYOUT.readingColumnPx,
  topPad,
  children,
}: CenteredColumnProps): ReactElement {
  return <Box sx={centeredColumnSx(width, topPad)}>{children}</Box>;
}
