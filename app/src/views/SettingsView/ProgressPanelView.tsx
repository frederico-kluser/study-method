/**
 * src/views/SettingsView/ProgressPanelView.tsx — VIEW PURA do painel "Limpar
 * dados de avanço" (state/view split — STORY-SPEC §5).
 *
 * Só props: sem IPC, sem `getApi`, sem localStorage, sem relógio. O estado e
 * as decisões vivem em `useProgressPanel.ts`; este ficheiro desenha-os e nada
 * mais. É o que as histórias (`ProgressPanel.stories.tsx`) renderizam com
 * `args`.
 *
 * Registos de a11y/UX preservados do original (não "melhorar" sem régua):
 *  - W18: no diálogo DESTRUTIVO o foco inicial é do "Cancelar" (`autoFocus`) —
 *    o Enter nunca apaga por acidente;
 *  - o `Alert` de feedback fica ABAIXO do botão (fora do backdrop do modal —
 *    com o modal aberto ficaria `aria-hidden`, invisível para leitores de
 *    tela e role queries);
 *  - W19: frase i18n em cima (`body2`), detalhe técnico (se houver) em legenda
 *    (`caption`, `opacity: 0.85`) — nunca `String(err)` como frase da UI;
 *  - W21: piso de alvo de toque (`touchTargetSx`) em todos os botões.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import type { ProgressPanelViewProps } from './useProgressPanel';
// §1 (LAYOUT-DRY-AUDIT): W21 — o piso de alvo de toque de 44 aplicado a TODOS
// os botões deste painel (os default nascem ~36px) é o objeto de estilo
// partilhado `touchTargetSx`, nunca um `44` copiado.
import { touchTargetSx } from '../../lib/layoutSx';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { SettingsSection } from '../../components/ui/SettingsSection';

export type { ProgressFeedback, ProgressPanelViewProps } from './useProgressPanel';

export function ProgressPanelView({
  confirmOpen,
  busy,
  feedback,
  onConfirmOpen,
  onConfirmClose,
  onClear,
}: ProgressPanelViewProps): ReactElement {
  const { t } = useTranslation();
  return (
    <SettingsSection
      id="settings-progress"
      onboardingTarget="settings-progress-section"
      title={t('translation:settings.clearProgressTitle')}
      description={t('translation:settings.clearProgressDescription')}
    >

      {/* O botão destrutivo abre o DIÁLOGO de confirmação — nunca limpa direto. */}
      <Button
        variant="outlined"
        color="error"
        startIcon={<DeleteSweepIcon />}
        onClick={onConfirmOpen}
        disabled={busy}
        aria-label={t('translation:settings.clearProgress')}
        sx={touchTargetSx}
      >
        {t('translation:settings.clearProgress')}
      </Button>

      {feedback?.kind === 'done' ? (
        <Alert severity="success" sx={{ mt: 1.5 }}>
          {t('translation:settings.clearProgressDone')}
        </Alert>
      ) : null}
      {feedback?.kind === 'error' ? (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          <Typography component="span" variant="body2" sx={{ display: 'block' }}>
            {feedback.message}
          </Typography>
          {feedback.detail ? (
            <Typography component="span" variant="caption" sx={{ display: 'block', opacity: 0.85 }}>
              {feedback.detail}
            </Typography>
          ) : null}
        </Alert>
      ) : null}

      {/* §9 ConfirmDialog (LAYOUT-DRY-AUDIT): o diálogo de confirmação é o
          primitivo partilhado — W18: foco inicial no "Cancelar". */}
      <ConfirmDialog
        open={confirmOpen}
        title={t('translation:settings.clearProgressConfirmTitle')}
        description={
          <Stack spacing={1}>
            <Typography variant="body2">
              {t('translation:settings.clearProgressConfirmDescription')}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {t('translation:settings.clearProgressConfirmNote')}
            </Typography>
          </Stack>
        }
        cancelLabel={t('translation:common.cancel')}
        confirmLabel={
          busy
            ? t('translation:settings.clearProgressBusy')
            : t('translation:settings.clearProgressConfirmAction')
        }
        busy={busy}
        onCancel={onConfirmClose}
        onConfirm={() => void onClear()}
      />
    </SettingsSection>
  );
}
