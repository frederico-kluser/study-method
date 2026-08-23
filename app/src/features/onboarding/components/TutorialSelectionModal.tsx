/**
 * src/features/onboarding/components/TutorialSelectionModal.tsx
 *
 * MODAL de seleção do tutorial (primeira execução).
 *
 * Portado e ADAPTADO de `ondokai/.../TutorialSelectionModal.tsx` + CSS. No
 * Ondokai havia duas opções (Quick Start vs Full com créditos de IA); no Study
 * Method há um ÚNICO "tour rápido" sem dependência de créditos/AI, então o
 * modal oferece uma opção (Iniciar) + dispensar ("Agora não" / "Nunca mais").
 *
 * TODO o texto via `t('translation:tutorial.*')` (strictKeyChecks). MUI v9.
 */

import { type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

export interface TutorialSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Inicia o tutorial rápido. */
  onStartTutorial: () => void;
}

export function TutorialSelectionModal({
  isOpen,
  onClose,
  onStartTutorial,
}: TutorialSelectionModalProps): ReactElement | null {
  const { t } = useTranslation();

  if (!isOpen || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <Box
      onClick={onClose}
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 1300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'rgba(0,0,0,0.5)',
        p: 2,
      }}
    >
      <Paper
        component="div"
        role="dialog"
        aria-modal="true"
        elevation={8}
        onClick={(e) => e.stopPropagation()}
        sx={{ position: 'relative', maxWidth: 480, width: '100%', p: 3, borderRadius: 2 }}
      >
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="h5" component="h2">
            {t('translation:tutorial.selection.title')}
          </Typography>
          <Button
            size="small"
            aria-label={t('translation:tutorial.controls.close')}
            onClick={onClose}
            sx={{ minWidth: 28, minHeight: 28, p: 0, color: 'text.secondary' }}
          >
            ×
          </Button>
        </Stack>

        <Typography variant="body2" color="text.secondary">
          {t('translation:tutorial.selection.subtitle')}
        </Typography>

        <Button
          type="button"
          variant="outlined"
          fullWidth
          onClick={onStartTutorial}
          sx={{ mt: 3, textAlign: 'left', p: 2, alignItems: 'flex-start' }}
        >
          <Stack sx={{ gap: 0.5, textAlign: 'left' }}>
            <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                {t('translation:tutorial.selection.quickTourTitle')}
              </Typography>
              <Box
                component="span"
                sx={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: 0.08,
                  px: 1,
                  py: 0.25,
                  borderRadius: 1,
                  bgcolor: 'action.selected',
                  color: 'primary.main',
                }}
              >
                {t('translation:tutorial.selection.badgeRecommended')}
              </Box>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {t('translation:tutorial.selection.quickTourDescription')}
            </Typography>
          </Stack>
        </Button>

        <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', mt: 2.5 }}>
          <Button size="small" variant="text" color="inherit" onClick={onClose}>
            {t('translation:tutorial.selection.dismiss')}
          </Button>
        </Stack>
      </Paper>
    </Box>,
    document.body,
  );
}