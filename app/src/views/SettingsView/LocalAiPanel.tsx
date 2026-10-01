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
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
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
import { readCached, writeCached } from './panelCache';

type DownloadTick = Pick<DownloadProgress, 'modelId' | 'percent' | 'speedBps' | 'done' | 'error'>;

/**
 * Alvo de toque mínimo (px) — o piso de 44 que o design system cobra para
 * qualquer controle apontável (mesma receita do LessonView/TrackChallengePanel).
 */
const TOUCH_TARGET_PX = 44;

/** Campo do provedor de feedback (defaultModelProvider). */
type FeedbackProvider = 'openrouter' | 'local';

function HardwareView({ info }: { info: HardwareInfo }): ReactElement {
  const { t } = useTranslation();
  const rows: Array<{ label: string; value: string }> = [
    { label: t('translation:localAi.backend'), value: info.backend },
    { label: t('translation:localAi.ram'), value: `${info.ramGb.toFixed(1)} GB` },
    {
      label: t('translation:localAi.vram'),
      // W20 (onda-ux): o literal 'n/d' era copy SOLTURA — no locale `en` o
      // utilizador via português. Agora é chave (`localAi.notDetermined`:
      // "n/d" / "n/a"). Nomes de marca e strings do hardware (backend, CPU)
      // NÃO se traduzem — vêm da máquina.
      value: info.vramGb == null ? t('translation:localAi.notDetermined') : `${info.vramGb.toFixed(1)} GB`,
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
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
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
  // Interpolação ({{var}}): mesmo cast aprovado do ChallengeView (tI) — o `t`
  // tipado (i18next v25 + strictKeyChecks) não expõe a assinatura
  // (chave, options), e a base inteira interpola por este cast.
  const tI = useMemo(
    () => t as unknown as (key: string, options?: Record<string, string | number>) => string,
    [t],
  );
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  // SWR: nasce com a última lista conhecida — o IPC abaixo revalida em toda
  // montagem. O spinner só roda na 1ª abertura (sem cache); nas seguintes a
  // lista conhecida já pinta no primeiro commit.
  const [models, setModels] = useState<LocalModelInfo[]>(
    () => readCached<LocalModelInfo[]>('localAi.models') ?? [],
  );
  const [detecting, setDetecting] = useState(false);
  const [loadingModels, setLoadingModels] = useState(
    () => readCached('localAi.models') === undefined,
  );
  // W19 (onda-ux): o erro tem frase PRINCIPAL i18n + detalhe técnico opcional —
  // `String(err)` nunca vira a frase da UI.
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null);
  // C3 (onda-ux): exclusão de modelo local só com CONFIRMAÇÃO (nome + tamanho),
  // o mesmo padrão do ProgressPanel/OrphanTracksPanel.
  const [pendingDelete, setPendingDelete] = useState<LocalModelInfo | null>(null);
  // W23 (onda-ux): feedback do "Provedor de feedback" INLINE junto ao seletor
  // (antes fugia para o Alert do fundo da lista, longe da ação).
  const [feedbackMsg, setFeedbackMsg] = useState<{ severity: 'success' | 'error'; message: string; detail?: string } | null>(null);
  // S6 (onda-ux): anúncio do resultado da deteção de hardware (role="status").
  const [detectMsg, setDetectMsg] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadTicks, setDownloadTicks] = useState<Record<string, DownloadTick>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [feedbackProvider, setFeedbackProvider] = useState<FeedbackProvider>(
    () => readCached<FeedbackProvider>('settings.feedbackProvider') ?? 'openrouter',
  );

  // Lê o provedor salvo na montagem (settings:get).
  useEffect(() => {
    let cancelled = false;
    getApi()
      .settings.get()
      .then((settings) => {
        if (cancelled) return;
        if (
          settings?.defaultModelProvider === 'local' ||
          settings?.defaultModelProvider === 'openrouter'
        ) {
          setFeedbackProvider(settings.defaultModelProvider);
          writeCached('settings.feedbackProvider', settings.defaultModelProvider);
        }
      })
      .catch(() => {
        /* settings indisponível — mantém o default openrouter */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFeedbackProviderChange = async (next: FeedbackProvider): Promise<void> => {
    const prev = feedbackProvider;
    setFeedbackProvider(next);
    setFeedbackMsg(null);
    writeCached('settings.feedbackProvider', next);
    try {
      await getApi().settings.set({ defaultModelProvider: next });
      // W23: confirmação INLINE junto ao seletor — a mudança fica dita onde
      // foi feita, não no Alert do fundo da página.
      setFeedbackMsg({ severity: 'success', message: t('translation:localAi.feedbackSaved') });
    } catch (err) {
      setFeedbackProvider(prev);
      // Reverte também o cache — senão a próxima visita pinta o valor novo
      // (que nunca chegou ao disco) até a revalidação corrigir.
      writeCached('settings.feedbackProvider', prev);
      // W19: frase i18n + detalhe técnico opcional (nunca `String(err)` solto).
      setFeedbackMsg({
        severity: 'error',
        message: t('translation:localAi.errorSaveFeedback'),
        detail: String(err),
      });
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoadingModels(true);
    getApi()
      .localAi.list()
      .then((list) => {
        if (!cancelled) {
          setModels(list);
          writeCached('localAi.models', list);
        }
      })
      .catch((err) => {
        // W19: frase i18n + detalhe técnico opcional.
        if (!cancelled) setError({ message: t('translation:localAi.errorList'), detail: String(err) });
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

  // O cache acompanha QUALQUER mudança local na lista (setActive/delete/loop
  // de download) — um único efeito sincroniza estado → cache.
  useEffect(() => {
    writeCached('localAi.models', models);
  }, [models]);

  const handleDetect = async (): Promise<void> => {
    setDetecting(true);
    setError(null);
    // S6: o anúncio do resultado anterior some enquanto se deteta de novo.
    setDetectMsg('');
    try {
      const info = await getApi().localAi.detectHardware();
      setHardware(info);
      // S6: o resultado é ANUNCIADO (role="status" logo abaixo do botão) —
      // quem usa leitor de tela não fica sem saber que a deteção terminou.
      setDetectMsg(
        tI('translation:localAi.detectDone', { backend: info.backend, ram: info.ramGb.toFixed(1) }),
      );
    } catch (err) {
      // W19: frase i18n + detalhe técnico opcional.
      setError({ message: t('translation:localAi.errorDetect'), detail: String(err) });
    } finally {
      setDetecting(false);
    }
  };

  const handleDownload = async (modelId: string): Promise<void> => {
    setError(null);
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
      // W19: frase i18n (+ modelo) e detalhe técnico opcional.
      setError({ message: `${t('translation:localAi.errorDownload')} ${modelId}`, detail: String(err) });
      setDownloading(null);
    }
  };

  const handleSetActive = async (modelId: string): Promise<void> => {
    setError(null);
    setBusy((b) => ({ ...b, [modelId]: true }));
    try {
      await getApi().localAi.setActive(modelId);
      setModels((prev) => prev.map((m) => ({ ...m, active: m.id === modelId })));
    } catch (err) {
      setError({ message: `${t('translation:localAi.errorActivate')} ${modelId}`, detail: String(err) });
    } finally {
      setBusy((b) => ({ ...b, [modelId]: false }));
    }
  };

  const handleDelete = async (modelId: string): Promise<void> => {
    setError(null);
    setBusy((b) => ({ ...b, [modelId]: true }));
    try {
      await getApi().localAi.delete(modelId);
      setModels((prev) =>
        prev.map((m) =>
          m.id === modelId ? { ...m, downloaded: false, active: false } : m,
        ),
      );
    } catch (err) {
      setError({ message: `${t('translation:localAi.errorRemove')} ${modelId}`, detail: String(err) });
    } finally {
      setBusy((b) => ({ ...b, [modelId]: false }));
    }
  };

  /**
   * C3 (onda-ux): a exclusão só acontece DEPOIS do diálogo de confirmação
   * (nome + tamanho do modelo) — mesmo padrão do ProgressPanel e do
   * OrphanTracksPanel. O diálogo fecha e a remoção corre em seguida.
   */
  const handleConfirmDelete = async (): Promise<void> => {
    const model = pendingDelete;
    setPendingDelete(null);
    if (model) await handleDelete(model.id);
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
          sx={{
            maxWidth: 320,
            // Piso de alvo de toque (TOUCH_TARGET_PX): o alvo REAL do Select é
            // o `.MuiSelect-select` (o div role="combobox"), não a raiz — por
            // isso o minHeight vai para ele, com o texto centrado na vertical.
            '& .MuiSelect-select': {
              minHeight: TOUCH_TARGET_PX,
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
          {/* minHeight = piso de alvo de toque (TOUCH_TARGET_PX). */}
          <Button
            variant="outlined"
            disabled={detecting}
            onClick={() => void handleDetect()}
            startIcon={detecting ? <CircularProgress size={16} /> : undefined}
            sx={{ minHeight: TOUCH_TARGET_PX }}
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

                  <Typography variant="body2" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
                    {formatBytes(model.sizeBytes)}
                  </Typography>

                  {isDownloading && tick ? (
                    <Stack spacing={0.5}>
                      <LinearProgress
                        variant="determinate"
                        value={pct}
                        // O nome acessível era inglês hardcoded ("download
                        // <id>") numa UI pt-BR — a chave `localAi.downloadAria`
                        // já existe nos dois locales.
                        aria-label={tI('translation:localAi.downloadAria', { id: model.id })}
                        aria-valuenow={pct}
                      />
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
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
                    {/* minHeight/width = piso de alvo de toque
                        (TOUCH_TARGET_PX): botões small (~30px) e o IconButton
                        small (30×30) ficam com a caixa no piso, ícone intacto. */}
                    {model.downloaded ? (
                      <>
                        <Button
                          variant="contained"
                          size="small"
                          disabled={busy[model.id] || inUse}
                          onClick={() => void handleSetActive(model.id)}
                          sx={{ minHeight: TOUCH_TARGET_PX }}
                        >
                          {busy[model.id]
                            ? t('translation:common.loading')
                            : inUse
                              ? t('translation:localAi.inUse')
                              : t('translation:localAi.use')}
                        </Button>
                        <IconButton
                          // W22 (onda-ux): o nome acessível leva o NOME do
                          // modelo — dois botões "Excluir" idênticos eram
                          // indistinguíveis no leitor de tela.
                          aria-label={tI('translation:localAi.deleteAria', { name: formatModelLabel(model) })}
                          size="small"
                          color="error"
                          disabled={busy[model.id]}
                          // C3 (onda-ux): NUNCA apaga direto — abre o diálogo
                          // de confirmação (nome + tamanho), como os demais.
                          onClick={() => setPendingDelete(model)}
                          sx={{ width: TOUCH_TARGET_PX, height: TOUCH_TARGET_PX }}
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
                        sx={{ minHeight: TOUCH_TARGET_PX }}
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
      <Dialog
        open={pendingDelete !== null}
        onClose={() => {
          if (pendingDelete && !busy[pendingDelete.id]) setPendingDelete(null);
        }}
        aria-labelledby="localai-delete-confirm-title"
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle id="localai-delete-confirm-title">
          {pendingDelete
            ? tI('translation:localAi.deleteConfirmTitle', { name: formatModelLabel(pendingDelete) })
            : ''}
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2">
            {pendingDelete
              ? tI('translation:localAi.deleteConfirmDescription', {
                  name: formatModelLabel(pendingDelete),
                  size: formatBytes(pendingDelete.sizeBytes),
                })
              : ''}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingDelete(null)} disabled={pendingDelete ? busy[pendingDelete.id] : false} autoFocus>
            {t('translation:common.cancel')}
          </Button>
          <Button
            onClick={() => void handleConfirmDelete()}
            color="error"
            variant="contained"
            disabled={pendingDelete ? busy[pendingDelete.id] : false}
          >
            {pendingDelete && busy[pendingDelete.id]
              ? t('translation:common.loading')
              : t('translation:localAi.deleteConfirmAction')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}