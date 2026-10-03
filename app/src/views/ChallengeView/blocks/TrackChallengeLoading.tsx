/**
 * src/views/ChallengeView/blocks/TrackChallengeLoading.tsx — o carregamento da
 * spec do desafio de trilha (ONDA-UX-FEEDBACK: o spinner era mudo —
 * `role="status"` + nome com `common.loading` anunciam a espera).
 *
 * VIEW PURA (docs/storybook/STORY-SPEC.md §5): só props (nenhuma), zero IPC,
 * zero estado.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';

export function TrackChallengeLoading(): ReactElement {
  const { t } = useTranslation();
  return (
    <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }} role="status">
      <CircularProgress aria-label={t('translation:common.loading')} />
    </Box>
  );
}
