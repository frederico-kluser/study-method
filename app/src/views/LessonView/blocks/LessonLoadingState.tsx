/**
 * blocks/LessonLoadingState.tsx — a espera do carregamento da aula
 * (`track.lesson` em voo).
 *
 * Bloco de VIEW PURO extraído de LessonView.tsx (contrato STORY-SPEC §5).
 * ONDA-UX-FEEDBACK + S3 (auditoria de UX): a espera tem TEXTO VISÍVEL (uma
 * barra nua não diz o que está a acontecer) e nome acessível na barra
 * (`common.loading`), para leitores de ecrã anunciarem a espera.
 */
import { Box, LinearProgress, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { ReactElement } from 'react';

export function LessonLoadingState(): ReactElement {
  const { t } = useTranslation();
  return (
    <Box sx={{ p: 2, maxWidth: 640, mx: 'auto', pt: 4 }}>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
        {t('translation:lesson.loading')}
      </Typography>
      <LinearProgress aria-label={t('translation:common.loading')} />
    </Box>
  );
}
