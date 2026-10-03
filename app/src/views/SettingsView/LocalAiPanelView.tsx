/**
 * src/views/SettingsView/LocalAiPanelView.tsx — VIEW PURA do painel de LLM
 * local (state/view split — STORY-SPEC §5): só props, sem IPC.
 *
 * Contrato do painel (onda 4/5 + rodada 10) preservado:
 *  - "Detectar hardware" → `HardwareView`; lista de modelos →
 *    `LocalAiModelCard`; "Baixar" com progresso reativado pelo MESMO canal
 *    (`localAi.onDownloadProgress`) num `<LinearProgress>`;
 *  - "Usar" (`setActive`) / "Excluir" (`delete`, com CONFIRMAÇÃO C3) quando já
 *    baixado; Select do provedor de feedback com rollback em erro (W23);
 *  - W19: frase i18n em cima, detalhe técnico (se houver) em legenda;
 *  - S6: o resultado da deteção é ANUNCIADO (role="status").
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Grid from '@mui/material/Grid';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { formatBytes, formatModelLabel, formatPercent } from '../../lib/format';
import { HardwareView } from './HardwareView';
import { LocalAiModelCard } from './LocalAiModelCard';
import type { FeedbackProvider, LocalAiPanelViewProps } from './useLocalAiPanel';
// §1 (LAYOUT-DRY-AUDIT): o piso de alvo de toque de 44 é o objeto de estilo
// partilhado `touchTargetSx`, nunca um `44` copiado.
import { touchTargetSx } from '../../lib/layoutSx';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';

export type { LocalAiPanelViewProps } from './useLocalAiPanel';

// (O antigo `TOUCH_TARGET_PX` local saiu — ver `lib/layoutSx.ts`.)

export function LocalAiPanelView({
  hardware,
  models,
  detecting,
  loadingModels,
  error,
  pendingDelete,
  feedbackMsg,
  detectMsg,
  downloading,
  downloadTicks,
  busy,
  feedbackProvider,
  setPendingDelete,
  handleFeedbackProviderChange,
  handleDetect,
  handleDownload,
  handleSetActive,
  handleConfirmDelete,
}: LocalAiPanelViewProps): ReactElement {
  const { t } = useTranslation();
  // Interpolação ({{var}}): mesmo cast aprovado do ChallengeView (tI).
  const tI = t as unknown as (key: string, options?: Record<string, string | number>) => string;

  return (
    <Stack spacing={2}>
      {/* Provedor de feedback */}
      <Stack spacing={0.5}>
        <InputLabel id="localai-feedback-provider-label">
          {t('translation:localAi.feedbackProvider')}
        </InputLabel>
        <Select
          labelId="localai-feedback-provider-label"
          value={feedbackProvider}
          onChange={(e) =>
            void handleFeedbackProviderChange(e.target.value as FeedbackProvider)
          }
          size="small"
          sx={{
            maxWidth: 320,
            // Piso de alvo de toque (`touchTargetSx`): o alvo REAL do Select é
            // o `.MuiSelect-select` (o div role="combobox"), não a raiz — por
            // isso o minHeight vai para ele, com o texto centrado na vertical.
            '& .MuiSelect-select': {
              ...touchTargetSx,
              display: 'flex',
              alignItems: 'center',
            },
          }}
        >
          {/* 'openrouter' é o valor persistido em settings.defaultModelProvider. */}
          <MenuItem value="openrouter">{t('translation:localAi.feedbackProviderOpenrouter')}</MenuItem>
          <MenuItem value="local">{t('translation:localAi.feedbackProviderLocal')}</MenuItem>
        </Select>
        {/* W23 (onda-ux): feedback INLINE junto ao seletor (sucesso e falha) —
            antes só havia um Alert no fundo da lista, longe da ação que o
            causou. W19: detalhe técnico (se houver) em legenda separada. */}
        {feedbackMsg ? (
          <Alert severity={feedbackMsg.severity} sx={{ fontSize: 13, maxWidth: 480 }}>
            <Typography component="span" variant="body2" sx={{ display: 'block' }}>
              {feedbackMsg.message}
            </Typography>
            {feedbackMsg.detail ? (
              <Typography component="span" variant="caption" sx={{ display: 'block', opacity: 0.85 }}>
                {feedbackMsg.detail}
              </Typography>
            ) : null}
          </Alert>
        ) : null}
      </Stack>

      {/* Detect hardware */}
      <Stack spacing={1}>
        <Box>
          {/* minHeight = piso de alvo de toque (`touchTargetSx`). */}
          <Button
            variant="outlined"
            disabled={detecting}
            onClick={() => void handleDetect()}
            startIcon={detecting ? <CircularProgress size={16} /> : undefined}
            sx={touchTargetSx}
          >
            {/* S6 (onda-ux): o botão DIZ que está a detetar ("A detetar…") —
                antes os dois estados partilhavam o mesmo rótulo. */}
            {detecting ? t('translation:localAi.detecting') : t('translation:localAi.detect')}
          </Button>
        </Box>
        {/* S6: o RESULTADO da deteção é anunciado (role="status"/aria-live) —
            a região nasce montada e vazia; é a MUDANÇA de conteúdo que o
            leitor de tela lê. */}
        <Box role="status" aria-live="polite" sx={{ minHeight: 0 }}>
          {detectMsg ? (
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
              {detectMsg}
            </Typography>
          ) : null}
        </Box>
        {hardware ? <HardwareView info={hardware} /> : null}
      </Stack>

      {loadingModels ? (
        <Box sx={{ color: 'text.secondary' }}>{t('translation:common.loading')}</Box>
      ) : null}

      <Grid container spacing={2}>
        {models.map((model) => {
          const tick = downloadTicks[model.id];
          const isDownloading = downloading === model.id || (tick && !tick.done);
          const pct = tick ? formatPercent(tick.percent) : 0;
          return (
            <LocalAiModelCard
              key={model.id}
              model={model}
              tick={tick}
              isDownloading={isDownloading}
              pct={pct}
              busy={busy[model.id] ?? false}
              inUse={model.active}
              onDownload={handleDownload}
              onSetActive={handleSetActive}
              onRequestDelete={setPendingDelete}
              tI={tI}
            />
          );
        })}
      </Grid>

      {/* W19: frase i18n em cima, detalhe técnico (se houver) em legenda. */}
      {error ? (
        <Alert severity="error" sx={{ fontSize: 13 }}>
          <Typography component="span" variant="body2" sx={{ display: 'block' }}>
            {error.message}
          </Typography>
          {error.detail ? (
            <Typography component="span" variant="caption" sx={{ display: 'block', opacity: 0.85 }}>
              {error.detail}
            </Typography>
          ) : null}
        </Alert>
      ) : null}

      {/* C3 (onda-ux): CONFIRMAÇÃO antes de excluir um modelo local — repete o
          nome e o tamanho que vão sair do disco, mesmo padrão do
          ProgressPanel/OrphanTracksPanel. W18: o foco inicial é do
          "Cancelar" (autoFocus), nunca do botão de apagar. */}
      {/* C3 (onda-ux): CONFIRMAÇÃO antes de excluir um modelo local (§9
          ConfirmDialog) — repete o nome e o tamanho que vão sair do disco.
          W18: o foco inicial é do "Cancelar", nunca do botão de apagar. */}
      <ConfirmDialog
        open={pendingDelete !== null}
        title={
          pendingDelete
            ? tI('translation:localAi.deleteConfirmTitle', { name: formatModelLabel(pendingDelete) })
            : ''
        }
        description={
          <Typography variant="body2">
            {pendingDelete
              ? tI('translation:localAi.deleteConfirmDescription', {
                  name: formatModelLabel(pendingDelete),
                  size: formatBytes(pendingDelete.sizeBytes),
                })
              : ''}
          </Typography>
        }
        cancelLabel={t('translation:common.cancel')}
        confirmLabel={
          pendingDelete && busy[pendingDelete.id]
            ? t('translation:common.loading')
            : t('translation:localAi.deleteConfirmAction')
        }
        busy={pendingDelete ? busy[pendingDelete.id] : false}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void handleConfirmDelete()}
      />
    </Stack>
  );
}