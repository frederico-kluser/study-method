/**
 * src/views/SettingsView/OrphanTracksPanel.tsx — RESQUÍCIOS (onda9-cache-reconcilia).
 *
 * O defeito que este painel fecha: o progresso do aluno vive no SQLite e o
 * conteúdo vive em `resources/tracks`. Apagada a trilha, o banco continuava
 * apontando para ela e o Início mostrava o cartão de um curso que não existe
 * mais. A reconciliação (`track:orphans` → `electron/main/db/reconcile.ts`)
 * tira o resquício do caminho do aluno; ESTE painel é onde ele reaparece —
 * nomeado, contado e removível DE PROPÓSITO.
 *
 * Por que não apagar sozinho: o ciclo normal deste projeto é "apaga e regera"
 * (a materialização F12 recusa sobrescrever destino existente), e a trilha
 * volta com o MESMO slug. Uma faxina automática destruiria progresso a cada
 * regeração. Aqui o dado só some quando o dono manda — e a lista mostra
 * EXATAMENTE o que sairia ANTES de sair.
 *
 * Gêmeo de terminal: `npm run track -- track:reset-orphans` (lista) e
 * `--yes` (remove). Mesmíssima regra dos dois lados: um único
 * `computeOrphanState`.
 */
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import type { TrackOrphanEntry } from '../../../shared/ipc-contract';
import { getApi } from '../../lib/apiBridge';
import { IPC_TIMEOUT_MS, isTimeoutError, resolveChannelError, withTimeout } from '../../lib/ipcTimeout';

type Feedback = { kind: 'done' } | { kind: 'error'; message: string } | null;

/** Uma linha do resquício: o slug + o inventário do que seria removido. */
function OrphanRow({
  orphan,
  tI,
}: {
  orphan: TrackOrphanEntry;
  tI: (key: string, options?: Record<string, string | number>) => string;
}): ReactElement {
  const { t } = useTranslation();
  const chips: string[] = [];
  if (orphan.attemptCount > 0) chips.push(tI('settings.orphansAttempts', { n: orphan.attemptCount }));
  if (orphan.lessonsDoneCount > 0) chips.push(tI('settings.orphansLessonsDone', { n: orphan.lessonsDoneCount }));
  if (orphan.generatedChallengeCount > 0) {
    chips.push(tI('settings.orphansGenerated', { n: orphan.generatedChallengeCount }));
  }
  if (orphan.hasProficiency) chips.push(t('translation:settings.orphansProficiency'));
  chips.push(tI('settings.orphansRowCount', { n: orphan.rowCount }));

  return (
    <Card variant="outlined">
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {orphan.subjectName && orphan.subjectName !== orphan.slug
            ? `${orphan.subjectName} (${orphan.slug})`
            : orphan.slug}
        </Typography>
        <Stack direction="row" spacing={0.5} sx={{ mt: 0.75, flexWrap: 'wrap', gap: 0.5 }}>
          {chips.map((label) => (
            <Chip key={label} size="small" variant="outlined" label={label} />
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

export function OrphanTracksPanel(): ReactElement {
  const { t } = useTranslation();
  // Interpolação ({{n}}): mesmo cast aprovado das demais views (tI).
  const tI = t as unknown as (key: string, options?: Record<string, string | number>) => string;

  // null = ainda verificando; [] = nada órfão (estado bom e comum).
  const [orphans, setOrphans] = useState<TrackOrphanEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  /** Recarrega a reconciliação (o "o quê" que o diálogo vai mostrar). */
  const load = useCallback((): void => {
    setLoadError(null);
    withTimeout(getApi().track.orphans(), IPC_TIMEOUT_MS, 'track.orphans')
      .then((res) => {
        if (res.ok === false) {
          setLoadError(
            resolveChannelError(res, t('translation:settings.orphansLoadFailed')) ??
              t('translation:settings.orphansLoadFailed'),
          );
          return;
        }
        setOrphans(res.orphans);
      })
      .catch((err: unknown) => {
        setLoadError(
          isTimeoutError(err)
            ? t('translation:settings.orphansTimeout')
            : t('translation:settings.orphansLoadFailed'),
        );
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => load(), [load]);

  /**
   * Remoção EXPLÍCITA: manda os slugs que a tela ACABOU de mostrar. O main
   * recalcula a reconciliação e ignora qualquer slug que não seja órfão de
   * verdade — nenhum progresso de trilha instalada pode sair por aqui, nem se
   * a lista da tela estiver velha.
   */
  const handleRemove = useCallback(async (): Promise<void> => {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await withTimeout(
        getApi().track.purgeOrphans({ slugs: (orphans ?? []).map((o) => o.slug) }),
        IPC_TIMEOUT_MS,
        'track.purge-orphans',
      );
      if (res.ok) {
        setFeedback({ kind: 'done' });
        setOrphans([]);
        load();
      } else {
        setFeedback({
          kind: 'error',
          // `?? fallback`: resolveChannelError devolve `string | null` e o
          // tsconfig do renderer não liga strictNullChecks — sem isto um
          // `null` viraria um Alert vazio em runtime, sem o tsc reclamar.
          message:
            resolveChannelError(res, t('translation:settings.orphansRemoveFailed')) ??
            t('translation:settings.orphansRemoveFailed'),
        });
      }
    } catch (err) {
      setFeedback({
        kind: 'error',
        message: isTimeoutError(err)
          ? t('translation:settings.orphansTimeout')
          : t('translation:settings.orphansRemoveFailed'),
      });
    } finally {
      // Fecha nos TRÊS caminhos (sucesso, falha de negócio, rejeição) — o
      // Alert de feedback fica ABAIXO do botão, fora do backdrop do modal.
      setConfirmOpen(false);
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orphans, load, t]);

  const list = orphans ?? [];

  return (
    <section aria-labelledby="settings-orphans-title">
      <Typography variant="h6" id="settings-orphans-title">
        {t('translation:settings.orphansTitle')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {t('translation:settings.orphansDescription')}
      </Typography>

      {loadError !== null ? (
        <Box sx={{ mb: 1.5 }}>
          <Alert severity="warning">{loadError}</Alert>
          <Button variant="outlined" size="small" onClick={load} sx={{ mt: 1 }}>
            {t('translation:common.tryAgain')}
          </Button>
        </Box>
      ) : null}

      {/* Nada órfão é o estado BOM — dito com todas as letras, não em branco. */}
      {loadError === null && orphans !== null && list.length === 0 ? (
        <Alert severity="success" data-testid="settings-orphans-empty">
          {t('translation:settings.orphansEmpty')}
        </Alert>
      ) : null}

      {list.length > 0 ? (
        <Stack spacing={1} data-testid="settings-orphans-list">
          {list.map((orphan) => (
            <OrphanRow key={orphan.slug} orphan={orphan} tI={tI} />
          ))}
        </Stack>
      ) : null}

      {list.length > 0 ? (
        <Button
          variant="outlined"
          color="error"
          startIcon={<DeleteForeverIcon />}
          onClick={() => setConfirmOpen(true)}
          disabled={busy}
          sx={{ mt: 1.5 }}
        >
          {t('translation:settings.orphansRemove')}
        </Button>
      ) : null}

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
        {t('translation:settings.orphansCliHint')}
      </Typography>

      {feedback?.kind === 'done' ? (
        <Alert severity="success" sx={{ mt: 1.5 }}>
          {t('translation:settings.orphansDone')}
        </Alert>
      ) : null}
      {feedback?.kind === 'error' ? (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          {feedback.message}
        </Alert>
      ) : null}

      {/* CONFIRMAÇÃO: repete a lista item a item — o dono vê O QUE sai ANTES
          de sair, e é lembrado de que reinstalar a trilha traz tudo de volta
          se ele cancelar. */}
      <Dialog
        open={confirmOpen}
        onClose={() => {
          if (!busy) setConfirmOpen(false);
        }}
        aria-labelledby="settings-orphans-confirm-title"
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle id="settings-orphans-confirm-title">
          {t('translation:settings.orphansConfirmTitle')}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1}>
            <Typography variant="body2">
              {t('translation:settings.orphansConfirmDescription')}
            </Typography>
            {list.map((orphan) => (
              <OrphanRow key={orphan.slug} orphan={orphan} tI={tI} />
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={busy}>
            {t('translation:common.cancel')}
          </Button>
          <Button
            onClick={() => void handleRemove()}
            color="error"
            variant="contained"
            disabled={busy}
            autoFocus
          >
            {busy
              ? t('translation:settings.orphansBusy')
              : t('translation:settings.orphansConfirmAction')}
          </Button>
        </DialogActions>
      </Dialog>
    </section>
  );
}
