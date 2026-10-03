/**
 * src/views/SettingsView/LocalAiModelCard.tsx — bloco do CARTÃO DE MODELO local
 * (badges Recomendado/Ativo/Baixado, tamanho, progresso de download e ações).
 *
 * Bloco puro (só props) — documentado em
 * `Componentes/Definições/LocalAiModelCard`. O alvo real do "Baixar"/"Usar" é
 * o botão inteiro (W21: piso de toque) e o nome acessível do "Excluir" leva o
 * NOME do modelo (W22 — dois botões "Excluir" eram indistinguíveis).
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import DeleteIcon from '@mui/icons-material/Delete';
import type { LocalModelInfo } from '../../../shared/ipc-contract';
import { formatBytes, formatModelLabel, formatSpeedBps } from '../../lib/format';
import type { DownloadTick } from './useLocalAiPanel';
// §1 (LAYOUT-DRY-AUDIT): o piso de alvo de toque são objetos de estilo
// partilhados (`touchTargetSx` = minHeight; `touchTargetBoxSx` = caixa do
// IconButton) — nunca `44` copiado.
import { touchTargetBoxSx, touchTargetSx } from '../../lib/layoutSx';

// (O antigo `TOUCH_TARGET_PX` local saiu — ver `lib/layoutSx.ts`.)

export interface LocalAiModelCardProps {
  model: LocalModelInfo;
  /** Tick de progresso do download deste modelo (undefined = parado). */
  tick: DownloadTick | undefined;
  isDownloading: boolean | undefined;
  /** Percentagem já formatada (0 quando não há tick). */
  pct: number;
  /** Ocupado numa ação própria (Usar/Excluir). */
  busy: boolean;
  /** Já é o modelo em uso. */
  inUse: boolean | undefined;
  onDownload: (modelId: string) => void | Promise<void>;
  onSetActive: (modelId: string) => void | Promise<void>;
  /** C3: NUNCA apaga direto — abre o diálogo de confirmação (nome + tamanho). */
  onRequestDelete: (model: LocalModelInfo) => void;
  tI: (key: string, options?: Record<string, string | number>) => string;
}

export function LocalAiModelCard({
  model,
  tick,
  isDownloading,
  pct,
  busy,
  inUse,
  onDownload,
  onSetActive,
  onRequestDelete,
  tI,
}: LocalAiModelCardProps): ReactElement {
  const { t } = useTranslation();
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
                        (`touchTargetSx`/`touchTargetBoxSx`): botões small
                        (~30px) e o IconButton small (30×30) ficam com a caixa
                        no piso, ícone intacto. */}
                    {model.downloaded ? (
                      <>
                        <Button
                          variant="contained"
                          size="small"
                          disabled={busy || inUse}
                          onClick={() => void onSetActive(model.id)}
                          sx={touchTargetSx}
                        >
                          {busy
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
                          disabled={busy}
                          // C3 (onda-ux): NUNCA apaga direto — abre o diálogo
                          // de confirmação (nome + tamanho), como os demais.
                          onClick={() => onRequestDelete(model)}
                          sx={touchTargetBoxSx}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </>
                    ) : (
                      <Button
                        variant="contained"
                        size="small"
                        disabled={isDownloading}
                        onClick={() => void onDownload(model.id)}
                        sx={touchTargetSx}
                      >
                        {isDownloading ? t('translation:localAi.downloading') : t('translation:localAi.download')}
                      </Button>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
  );
}
