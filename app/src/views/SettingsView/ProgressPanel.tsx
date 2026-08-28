/**
 * src/views/SettingsView/ProgressPanel.tsx — LIMPAR DADOS DE AVANÇO (onda1-nav-ui).
 *
 * Pedido do dono: "quero um botão pra limpar todos os dados de avanço". Este
 * painel (seção na Settings) apaga o PROGRESSO do aluno no banco SQL via
 * `api.study.clearProgress()` (canal `study:clear-progress` → repo
 * `clearAllProgress`): tentativas de desafio, lições concluídas de trilha,
 * proficiência, desafios regenerados e contadores legados. O CONTEÚDO
 * (currículo das trilhas, configurações, chaves) NUNCA é apagado.
 *
 * Segurança: ação destrutiva SEMPRE passa por diálogo de CONFIRMAÇÃO (MUI
 * Dialog com DialogActions — mesmo padrão dos demais diálogos das views) —
 * um clique acidental não limpa nada. Feedback honesto depois: Alert de
 * sucesso ("dados de avanço apagados") ou de erro (falha/timeout/canal mudo —
 * com withTimeout, o estado `busy` nunca fica preso).
 *
 * Nenhuma view acessa `window` diretamente — só `getApi()` (testável sem jsdom).
 */
import { useCallback, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import { getApi } from '../../lib/apiBridge';
import { IPC_TIMEOUT_MS, isTimeoutError, withTimeout } from '../../lib/ipcTimeout';

type Feedback = { kind: 'done' } | { kind: 'error'; message: string } | null;

export function ProgressPanel(): ReactElement {
  const { t } = useTranslation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  /** Confirma → apaga o progresso (com timeout — canal mudo vira erro claro). */
  const handleClear = useCallback(async (): Promise<void> => {
    setBusy(true);
    setFeedback(null);
    try {
      const res = (await withTimeout(
        getApi().study.clearProgress(),
        IPC_TIMEOUT_MS,
        'study:clear-progress',
      )) as { ok: boolean; error?: string };
      if (res.ok) {
        setFeedback({ kind: 'done' });
      } else {
        setFeedback({ kind: 'error', message: res.error ?? t('translation:settings.clearProgressError') });
      }
    } catch (err) {
      setFeedback({
        kind: 'error',
        message: isTimeoutError(err)
          ? t('translation:settings.clearProgressTimeout')
          : String(err),
      });
    } finally {
      // Fecha o diálogo nos TRÊS caminhos (sucesso, falha de negócio e
      // rejeição — canal mudo/timeout): o Alert de feedback fica ABAIXO do
      // botão — com o modal aberto ele ficaria atrás do backdrop
      // (aria-hidden — invisível para leitores de tela e role queries).
      // No finally, roda em todos os caminhos, inclusive no catch.
      setConfirmOpen(false);
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  return (
    <section aria-labelledby="settings-progress-title" data-onboarding-target="settings-progress-section">
      <Typography variant="h6" id="settings-progress-title">
        {t('translation:settings.clearProgressTitle')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {t('translation:settings.clearProgressDescription')}
      </Typography>

      {/* O botão destrutivo abre o DIÁLOGO de confirmação — nunca limpa direto. */}
      <Button
        variant="outlined"
        color="error"
        startIcon={<DeleteSweepIcon />}
        onClick={() => setConfirmOpen(true)}
        disabled={busy}
        aria-label={t('translation:settings.clearProgress')}
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
          {feedback.message}
        </Alert>
      ) : null}

      <Dialog open={confirmOpen} onClose={() => { if (!busy) setConfirmOpen(false); }} aria-labelledby="settings-progress-confirm-title" maxWidth="xs" fullWidth>
        <DialogTitle id="settings-progress-confirm-title">
          {t('translation:settings.clearProgressConfirmTitle')}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1}>
            <Typography variant="body2">
              {t('translation:settings.clearProgressConfirmDescription')}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t('translation:settings.clearProgressConfirmNote')}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={busy}>
            {t('translation:common.cancel')}
          </Button>
          <Button onClick={() => void handleClear()} color="error" variant="contained" disabled={busy} autoFocus>
            {busy ? t('translation:settings.clearProgressBusy') : t('translation:settings.clearProgressConfirmAction')}
          </Button>
        </DialogActions>
      </Dialog>
    </section>
  );
}
