/**
 * src/features/onboarding/components/TutorialSelectionModal.tsx
 *
 * MODAL de seleção do tutorial (primeira execução) — ondokai fiel.
 *
 * Onda 16: duas opções (Quick Start e Tutorial Completo), no desenho do
 * TutorialSelectionModal do ondokai:
 *  - Quick Start — sempre disponível (não exige chaves), badge "Recomendado"
 *    quando o Completo está bloqueado (faltam chaves);
 *  - Tutorial Completo — guia por todas as abas (chaves → aula → desafio),
 *    GATEADO por `hasKeys` (DeepSeek + Brave preenchidas). Sem chaves, fica
 *    DESABILITADO com badge "Requer chaves" + CTA "Configurar chaves" que
 *    navega para a aba Settings (fecha o modal).
 *
 * Texto via `t('translation:tutorial.*')`. MUI v9. Portal em `document.body`.
 */

import { type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { OnboardingTutorialId } from '../types/onboarding.types';

export interface TutorialSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTutorial: (tutorialId: OnboardingTutorialId) => void;
  /** Chaves DeepSeek + Brave preenchidas (gate do Tutorial Completo). */
  hasKeys: boolean;
  /** Navega para a aba Settings (CTA "Configurar chaves"). */
  onOpenSettings: () => void;
}

export function TutorialSelectionModal({
  isOpen,
  onClose,
  onSelectTutorial,
  hasKeys,
  onOpenSettings,
}: TutorialSelectionModalProps): ReactElement | null {
  const { t } = useTranslation();

  if (!isOpen || typeof document === 'undefined') {
    return null;
  }

  const goToSettings = (): void => {
    onClose();
    onOpenSettings();
  };

  return createPortal(
    <Box
      onClick={onClose}
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 14500,
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
        sx={{ position: 'relative', maxWidth: 520, width: '100%', p: 3, borderRadius: 2 }}
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

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('translation:tutorial.selection.subtitle')}
        </Typography>

        <Stack spacing={1.5}>
          {/* Quick Start — sempre disponível */}
          <Button
            type="button"
            variant="outlined"
            fullWidth
            onClick={() => onSelectTutorial('quick-start')}
            sx={{ textAlign: 'left', p: 2, alignItems: 'flex-start', justifyContent: 'flex-start' }}
          >
            <Stack sx={{ gap: 0.5, textAlign: 'left', width: '100%' }}>
              <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {t('translation:tutorial.selection.quickStartTitle')}
                </Typography>
                {!hasKeys ? (
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
                ) : (
                  <Box component="span" sx={{ color: 'text.secondary', fontSize: 16 }}>→</Box>
                )}
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {t('translation:tutorial.selection.quickStartDescription')}
              </Typography>
            </Stack>
          </Button>

          {/* Tutorial Completo — gateado por hasKeys */}
          <Button
            type="button"
            variant={hasKeys ? 'outlined' : 'text'}
            fullWidth
            disabled={!hasKeys}
            onClick={() => onSelectTutorial('first-workflow')}
            sx={{ textAlign: 'left', p: 2, alignItems: 'flex-start', justifyContent: 'flex-start' }}
          >
            <Stack sx={{ gap: 0.5, textAlign: 'left', width: '100%' }}>
              <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
                <Typography
                  variant="subtitle1"
                  sx={{ fontWeight: 600, ...(!hasKeys ? { color: 'text.disabled' } : {}) }}
                >
                  {t('translation:tutorial.selection.fullTutorialTitle')}
                </Typography>
                {hasKeys ? (
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
                    {t('translation:tutorial.selection.badgeFull')}
                  </Box>
                ) : (
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
                      bgcolor: 'action.hover',
                      color: 'text.secondary',
                    }}
                  >
                    {t('translation:tutorial.selection.requiresKeys')}
                  </Box>
                )}
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {t('translation:tutorial.selection.fullTutorialDescription')}
              </Typography>
              {!hasKeys ? (
                <Box
                  component="span"
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    goToSettings();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                      goToSettings();
                    }
                  }}
                  sx={{
                    display: 'inline-block',
                    mt: 0.5,
                    color: 'primary.main',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textDecoration: 'none',
                    '&:hover': { textDecoration: 'underline' },
                  }}
                >
                  {t('translation:tutorial.selection.openSettings')}
                </Box>
              ) : null}
            </Stack>
          </Button>
        </Stack>

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