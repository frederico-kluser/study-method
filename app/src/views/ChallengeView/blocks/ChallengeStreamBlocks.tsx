/**
 * src/views/ChallengeView/blocks/ChallengeStreamBlocks.tsx — os BLOCOS do
 * stream do pi (pensamento/texto/ferramenta/erro) na caixa monoespaçada.
 *
 * VIEW PURA (docs/storybook/STORY-SPEC.md §5): só props, zero IPC, zero
 * estado. A tipografia mono vem da MESMA fonte de verdade do editor e do
 * terminal (`CODE_TYPOGRAPHY`); a superfície é um degrau REAL da rampa tonal
 * (nível 2 — ONDA-UX-SUPERFÍCIE) e o texto de erro usa `error.accentText`
 * (valor de TEXTO da família, ≥ 4,5:1 — ONDA-UX-CONTRASTE).
 */
import type { ReactElement } from 'react';
import Box from '@mui/material/Box';
import { CODE_TYPOGRAPHY } from '../../../lib/codeTheme';
import { hasStreamOutput, streamBlocksVisible, type StreamingBlock } from '../challengeUi';

export interface ChallengeStreamBlocksProps {
  blocks: StreamingBlock[];
  /** Mostrar os blocos 'thinking' (disclosure aberto). */
  showThinking: boolean;
}

export function ChallengeStreamBlocks({ blocks, showThinking }: ChallengeStreamBlocksProps): ReactElement | null {
  if (!hasStreamOutput(blocks)) return null;
  return (
    <Box
      component="div"
      sx={{
        fontFamily: CODE_TYPOGRAPHY.fontFamily,
        fontSize: CODE_TYPOGRAPHY.fontSize,
        bgcolor: (tema) => tema.vars.palette.surface.level2,
        borderRadius: 1,
        p: 1,
        mt: 0.5,
      }}
    >
      {streamBlocksVisible(blocks, showThinking).map((b, i) => (
        <Box
          key={i}
          component="div"
          sx={{
            whiteSpace: 'pre-wrap',
            color:
              b.kind === 'error'
                ? (tema) => tema.vars.palette.error.accentText
                : b.kind === 'tool'
                  ? 'text.secondary'
                  : 'text.primary',
          }}
        >
          {b.text}
        </Box>
      ))}
    </Box>
  );
}
