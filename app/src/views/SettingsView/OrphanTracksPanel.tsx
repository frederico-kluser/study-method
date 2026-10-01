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
import { IPC_TIMEOUT_MS, isTimeoutError, withTimeout } from '../../lib/ipcTimeout';
import { readCached, writeCached } from './panelCache';

type Feedback =
  | { kind: 'done' }
  | { kind: 'error'; message: string; detail?: string }
  | null;

/**
 * W19 (onda-ux): a FRASE principal é sempre i18n; o texto cru do canal/erro é
 * DETALHE técnico em legenda — nunca a frase que o utilizador lê.
 */
type LoadError = { message: string; detail?: string };

/**
 * Piso de alvo de toque (px) — W21 (onda-ux): o piso de 44 da casa estava a ser
 * aplicado de forma desigual (os botões `size="small"` nascem ~30px e os
 * default ~36px). Mesmo valor/constante de LocalAiPanel e placeholders.tsx.
 */
const TOUCH_TARGET_PX = 44;

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
  // SWR: nasce com a última reconciliação conhecida — a load() abaixo revalida
  // em toda montagem (o main recolcula do banco+disco de verdade; o cache é
  // só o primeiro paint).
  const [orphans, setOrphans] = useState<TrackOrphanEntry[] | null>(
    () => readCached<TrackOrphanEntry[]>('track.orphans') ?? null,
  );
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  /** Recarrega a reconciliação (o "o quê" que o diálogo vai mostrar). */
  const load = useCallback((): void => {
    setLoadError(null);
    withTimeout(getApi().track.orphans(), IPC_TIMEOUT_MS, 'track.orphans')
      .then((res) => {
        if (res.ok === false) {
          setLoadError({
            message: t('translation:settings.orphansLoadFailed'),
            detail: res.error ?? undefined,
          });
          return;
        }
        setOrphans(res.orphans);
        writeCached('track.orphans', res.orphans);
      })
      .catch((err: unknown) => {
        setLoadError({
          message: isTimeoutError(err)
            ? t('translation:settings.orphansTimeout')
            : t('translation:settings.orphansLoadFailed'),
          detail: err instanceof Error ? err.message : String(err),
        });
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
      // `=== false` (e não truthiness): é a comparação discriminante que estreita
      // a união `TrackPurgeOrphansResult` mesmo sem strictNullChecks no projeto.
      if (res.ok === false) {
        setFeedback({
          kind: 'error',
          // W19 (onda-ux): frase i18n sempre; o texto cru do canal vira
          // DETALHE técnico em legenda (antes era a frase principal).
          message: t('translation:settings.orphansRemoveFailed'),
          detail: res.error,
        });
      } else {
        setFeedback({ kind: 'done' });
        setOrphans([]);
        load();
      }
    } catch (err) {
      setFeedback({
        kind: 'error',
        message: isTimeoutError(err)
          ? t('translation:settings.orphansTimeout')
          : t('translation:settings.orphansRemoveFailed'),
        detail: err instanceof Error ? err.message : String(err),
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
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
        {t('translation:settings.orphansDescription')}
      </Typography>

      {loadError !== null ? (
        <Box sx={{ mb: 1.5 }}>
          {/* W19: frase i18n + detalhe técnico em legenda (nunca o cru por cima). */}
          <Alert severity="warning">
            {loadError.message}
            {loadError.detail ? (
              <Typography component="span" variant="caption" sx={{ display: 'block', opacity: 0.75 }}>
                {loadError.detail}
              </Typography>
            ) : null}
          </Alert>
          <Button variant="outlined" size="small" onClick={load} sx={{ mt: 1, minHeight: TOUCH_TARGET_PX }}>
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
          sx={{ mt: 1.5, minHeight: TOUCH_TARGET_PX }}
        >
          {t('translation:settings.orphansRemove')}
        </Button>
      ) : null}

      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1.5 }}>
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
          {feedback.detail ? (
            <Typography component="span" variant="caption" sx={{ display: 'block', opacity: 0.75 }}>
              {feedback.detail}
            </Typography>
          ) : null}
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
          {/* W18 (onda-ux): o foco inicial é do "Cancelar" (autoFocus) — num
              diálogo DESTRUTIVO o Enter nunca pode apagar por acidente. */}
          <Button
            onClick={() => setConfirmOpen(false)}
            disabled={busy}
            autoFocus
            sx={{ minHeight: TOUCH_TARGET_PX }}
          >
            {t('translation:common.cancel')}
          </Button>
          <Button
            onClick={() => void handleRemove()}
            color="error"
            variant="contained"
            disabled={busy}
            sx={{ minHeight: TOUCH_TARGET_PX }}
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
