/**
 * src/views/SettingsView/OrphanTracksPanelView.tsx — VIEW PURA do painel de
 * RESQUÍCIOS (state/view split — STORY-SPEC §5): só props, sem IPC.
 *
 * O defeito que este painel fecha (onda9-cache-reconcilia): apagada a trilha,
 * o banco continuava apontando para ela e o Início mostrava o cartão de um
 * curso que não existe mais. Aqui o resquício reaparece — nomeado, contado e
 * removível DE PROPÓSITO (confirmação que repete a lista item a item).
 *
 * Gêmeo de terminal: `npm run track -- track:reset-orphans` (lista) e
 * `--yes` (remove). Mesmíssima regra dos dois lados: um único
 * `computeOrphanState`.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import { OrphanRow, type TranslateWithVars } from './OrphanRow';
import type { OrphanTracksPanelViewProps } from './useOrphanTracksPanel';
// §1 (LAYOUT-DRY-AUDIT): W21 — o piso de alvo de toque de 44 é o objeto de
// estilo partilhado `touchTargetSx`, nunca um `44` copiado.
import { touchTargetSx } from '../../lib/layoutSx';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { RetryAlert } from '../../components/ui/RetryAlert';
import { SettingsSection } from '../../components/ui/SettingsSection';

export type { OrphanTracksPanelViewProps } from './useOrphanTracksPanel';

// (O antigo `TOUCH_TARGET_PX` local saiu — ver `lib/layoutSx.ts` → `touchTargetSx`.)

export function OrphanTracksPanelView({
  orphans,
  list,
  loadError,
  confirmOpen,
  busy,
  feedback,
  load,
  handleRemove,
  setConfirmOpen,
}: OrphanTracksPanelViewProps): ReactElement {
  const { t } = useTranslation();
  const tI = t as unknown as TranslateWithVars;

  return (
    <SettingsSection
      id="settings-orphans"
      title={t('translation:settings.orphansTitle')}
      description={t('translation:settings.orphansDescription')}
    >

      {loadError !== null ? (
        <Box sx={{ mb: 1.5 }}>
          {/* W19 (§3 RetryAlert): frase i18n + detalhe técnico em legenda
              (nunca o cru por cima) + retentativa no mesmo padrão. */}
          <RetryAlert
            severity="warning"
            message={loadError.message}
            detail={loadError.detail}
            onRetry={load}
          />
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
          sx={{ mt: 1.5, ...touchTargetSx }}
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
      {/* CONFIRMAÇÃO (§9 ConfirmDialog): repete a lista item a item — o dono
          vê O QUE sai ANTES de sair, e é lembrado de que reinstalar a trilha
          traz tudo de volta se ele cancelar. */}
      <ConfirmDialog
        open={confirmOpen}
        title={t('translation:settings.orphansConfirmTitle')}
        description={
          <Stack spacing={1}>
            <Typography variant="body2">
              {t('translation:settings.orphansConfirmDescription')}
            </Typography>
            {list.map((orphan) => (
              <OrphanRow key={orphan.slug} orphan={orphan} tI={tI} />
            ))}
          </Stack>
        }
        cancelLabel={t('translation:common.cancel')}
        confirmLabel={
          busy
            ? t('translation:settings.orphansBusy')
            : t('translation:settings.orphansConfirmAction')
        }
        busy={busy}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void handleRemove()}
      />
    </SettingsSection>
  );
}
