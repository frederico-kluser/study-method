/**
 * src/views/SettingsView/LocalAiPanel.tsx — painel de LLM local em Material UI.
 *
 * Mesmo contrato IPC do painel antigo (onda 4/5), agora em MUI:
 *
 *  - "Detectar hardware": `localAi.detectHardware` → Card/Grid com
 *    Backend/RAM/VRAM/CPU (formatação via src/lib/format.ts).
 *  - Lista de modelos (`localAi.list`): Cards com label/quant, badges
 *    Recomendado/Ativo/Baixado (Chip) e tamanho formatado (`formatBytes`).
 *  - "Baixar" → `localAi.download(modelId)`; progresso reativado via
 *    `localAi.onDownloadProgress` (MESMO canal) num `<LinearProgress>`.
 *  - "Usar" (`setActive`) / "Excluir" (`delete`) quando já baixado.
 *  - Select do provedor de feedback (`defaultModelProvider`) via
 *    `settings.get`/`settings.set` — MESMO comportamento do painel antigo.
 */
import { useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import DeleteIcon from '@mui/icons-material/Delete';
import type {
  DownloadProgress,
  HardwareInfo,
  LocalModelInfo,
} from '../../../shared/ipc-contract';
import { getApi } from '../../lib/apiBridge';
import { formatBytes, formatModelLabel, formatPercent, formatSpeedBps } from '../../lib/format';

type DownloadTick = Pick<DownloadProgress, 'modelId' | 'percent' | 'speedBps' | 'done' | 'error'>;

/** Campo do provedor de feedback (defaultModelProvider). */
type FeedbackProvider = 'deepseek' | 'local';

function HardwareView({ info }: { info: HardwareInfo }): ReactElement {
  const { t } = useTranslation();
  const rows: Array<{ label: string; value: string }> = [
    { label: t('translation:localAi.backend'), value: info.backend },
    { label: t('translation:localAi.ram'), value: `${info.ramGb.toFixed(1)} GB` },
    {
      label: t('translation:localAi.vram'),
      value: info.vramGb == null ? 'n/d' : `${info.vramGb.toFixed(1)} GB`,
    },
    { label: t('translation:localAi.cpu'), value: info.cpuModel },
  ];
  return (
    <Grid container spacing={1}>
      {rows.map((r) => (
        <Grid key={r.label} size={{ xs: 6, sm: 3 }}>
          <Box
            sx={{
              bgcolor: 'background.default',
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
              p: 1,
            }}
          >
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {r.label}
            </Typography>
            <Typography variant="body2" sx={{ wordBreak: 'break-word', fontWeight: 600 }}>
              {r.value}
            </Typography>
          </Box>
        </Grid>
      ))}
    </Grid>
  );
}

export function LocalAiPanel(): ReactElement {
  const { t } = useTranslation();
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [models, setModels] = useState<LocalModelInfo[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [error, setError] = useState<string>('');
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadTicks, setDownloadTicks] = useState<Record<string, DownloadTick>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [feedbackProvider, setFeedbackProvider] = useState<FeedbackProvider>('deepseek');

  // Lê o provedor salvo na montagem (settings:get).
  useEffect(() => {
    let cancelled = false;
    getApi()
      .settings.get()
      .then((settings) => {
        if (cancelled) return;
        if (
          settings?.defaultModelProvider === 'local' ||
          settings?.defaultModelProvider === 'deepseek'
        ) {
          setFeedbackProvider(settings.defaultModelProvider);
        }
      })
      .catch(() => {
        /* settings indisponível — mantém o default deepseek */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFeedbackProviderChange = async (next: FeedbackProvider): Promise<void> => {
    const prev = feedbackProvider;
    setFeedbackProvider(next);
    try {
      await getApi().settings.set({ defaultModelProvider: next });
    } catch (err) {
      setFeedbackProvider(prev);
      setError(`${t('translation:localAi.errorSaveFeedback')} ${String(err)}`);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoadingModels(true);
    getApi()
      .localAi.list()
      .then((list) => {
        if (!cancelled) setModels(list);
      })
      .catch((err) => {
        if (!cancelled) setError(`${t('translation:localAi.errorList')} ${String(err)}`);
      })
      .finally(() => {
        if (!cancelled) setLoadingModels(false);
      });

    const unsubscribe = getApi().localAi.onDownloadProgress((ev) => {
      setDownloadTicks((prev) => ({
        ...prev,
        [ev.modelId]: {
          modelId: ev.modelId,
          percent: ev.percent,
          speedBps: ev.speedBps,
          done: ev.done,
          error: ev.error,
        },
      }));
      if (ev.done) {
        setDownloading(null);
        setModels((prev) =>
          prev.map((m) => (m.id === ev.modelId ? { ...m, downloaded: true } : m)),
        );
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const handleDetect = async (): Promise<void> => {
    setDetecting(true);
    setError('');
    try {
      const info = await getApi().localAi.detectHardware();
      setHardware(info);
    } catch (err) {
      setError(`${t('translation:localAi.errorDetect')} ${String(err)}`);
    } finally {
      setDetecting(false);
    }
  };

  const handleDownload = async (modelId: string): Promise<void> => {
    setError('');
    setDownloading(modelId);
    setDownloadTicks((prev) => ({
      ...prev,
      [modelId]: {
        modelId,
        percent: 0,
        speedBps: 0,
        done: false,
        error: undefined,
      },
    }));
    try {
      await getApi().localAi.download(modelId);
    } catch (err) {
      setError(`${t('translation:localAi.errorDownload')} ${modelId}: ${String(err)}`);
      setDownloading(null);
    }
  };

  const handleSetActive = async (modelId: string): Promise<void> => {
    setError('');
    setBusy((b) => ({ ...b, [modelId]: true }));
    try {
      await getApi().localAi.setActive(modelId);
      setModels((prev) => prev.map((m) => ({ ...m, active: m.id === modelId })));
    } catch (err) {
      setError(`${t('translation:localAi.errorActivate')} ${modelId}: ${String(err)}`);
    } finally {
      setBusy((b) => ({ ...b, [modelId]: false }));
    }
  };

  const handleDelete = async (modelId: string): Promise<void> => {
    setError('');
    setBusy((b) => ({ ...b, [modelId]: true }));
    try {
      await getApi().localAi.delete(modelId);
      setModels((prev) =>
        prev.map((m) =>
          m.id === modelId ? { ...m, downloaded: false, active: false } : m,
        ),
      );
    } catch (err) {
      setError(`${t('translation:localAi.errorRemove')} ${modelId}: ${String(err)}`);
    } finally {
      setBusy((b) => ({ ...b, [modelId]: false }));
    }
  };

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
          sx={{ maxWidth: 320 }}
        >
          <MenuItem value="deepseek">{t('translation:localAi.feedbackProviderDeepseek')}</MenuItem>
          <MenuItem value="local">{t('translation:localAi.feedbackProviderLocal')}</MenuItem>
        </Select>
      </Stack>

      {/* Detect hardware */}
      <Stack spacing={1}>
        <Box>
          <Button
            variant="outlined"
            disabled={detecting}
            onClick={() => void handleDetect()}
            startIcon={detecting ? <CircularProgress size={16} /> : undefined}
          >
            {detecting ? t('translation:localAi.detect') : t('translation:localAi.detect')}
          </Button>
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
          const inUse = model.active;
          return (
            <Grid key={model.id} size={{ xs: 12, sm: 6, md: 4 }}>
              <Card variant="outlined" sx={{ height: '100%' }}>
                <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 1,
                      flexWrap: 'wrap',
                    }}
                  >
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      {formatModelLabel(model)}
                    </Typography>
                    <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap' }}>
                      {model.recommended ? (
                        <Chip size="small" color="primary" label={t('translation:localAi.recommended')} />
                      ) : null}
                      {model.active ? (
                        <Chip size="small" color="success" label={t('translation:localAi.active')} />
                      ) : null}
                      {model.downloaded ? (
                        <Chip size="small" variant="outlined" label={t('translation:localAi.downloaded')} />
                      ) : null}
                    </Stack>
                  </Box>

                  <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                    {formatBytes(model.sizeBytes)}
                  </Typography>

                  {isDownloading && tick ? (
                    <Stack spacing={0.5}>
                      <LinearProgress
                        variant="determinate"
                        value={pct}
                        aria-label={`download ${model.id}`}
                        aria-valuenow={pct}
                      />
                      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                        {pct}% · {formatSpeedBps(tick.speedBps)}
                      </Typography>
                      {tick.error ? (
                        <Typography variant="caption" color="error">
                          {tick.error}
                        </Typography>
                      ) : null}
                    </Stack>
                  ) : null}

                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                    {model.downloaded ? (
                      <>
                        <Button
                          variant="contained"
                          size="small"
                          disabled={busy[model.id] || inUse}
                          onClick={() => void handleSetActive(model.id)}
                        >
                          {busy[model.id]
                            ? t('translation:common.loading')
                            : inUse
                              ? t('translation:localAi.inUse')
                              : t('translation:localAi.use')}
                        </Button>
                        <IconButton
                          aria-label={t('translation:localAi.delete')}
                          size="small"
                          color="error"
                          disabled={busy[model.id]}
                          onClick={() => void handleDelete(model.id)}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </>
                    ) : (
                      <Button
                        variant="contained"
                        size="small"
                        disabled={isDownloading}
                        onClick={() => void handleDownload(model.id)}
                      >
                        {isDownloading ? t('translation:localAi.downloading') : t('translation:localAi.download')}
                      </Button>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {error ? <Alert severity="error" sx={{ fontSize: 13 }}>{error}</Alert> : null}
    </Stack>
  );
}