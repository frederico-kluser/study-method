/**
 * components/ui/ConfirmDialog.tsx — o DIÁLOGO DE CONFIRMAÇÃO
 * (auditoria de layout §9): `Dialog + Title + Content + Actions`.
 *
 * Estava copiado 4× (ProgressPanel, OrphanTracksPanel, LocalAiPanel,
 * FileExplorer) — sempre `maxWidth="xs" fullWidth`, botão cancelar e botão
 * confirmar com `variant="contained" color="error"`. As chamadas ficam com ~6
 * linhas e a estrutura/ARIA vive num lugar.
 *
 * ─── CONTRATO ─────────────────────────────────────────────────────────────
 * VIEW PURA: só props (o `useId` é determinístico). Os ids ARIA e o bloqueio
 * do estado ocupado são `ConfirmDialog.state.ts`; a copy — título, descrição,
 * rótulos — vive no chamador, com os defaults `translation:common.cancel` /
 * `translation:common.confirm` (chaves existentes, nos dois locales).
 *
 * Acessibilidade (W18, da cópia do ProgressPanel): o foco inicial é do
 * CANCELAR por omissão — num diálogo destrutivo o Enter nunca pode apagar por
 * acidente. Quem quer o contrário (o padrão do FileExplorer) pede
 * `initialFocus="confirm"`. Alvos de toque ≥ `TARGET.minTouchTargetPx`.
 */
import { useId, type ReactElement, ReactNode } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

import { touchTargetSx } from '../../lib/layoutSx';
import { confirmDialogActionsState, confirmDialogIds } from './ConfirmDialog.state';

export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly title: ReactNode;
  /** O corpo do diálogo (com `dividers`) — opcional (o FileExplorer não tinha). */
  readonly description?: ReactNode;
  readonly confirmLabel?: ReactNode;
  readonly cancelLabel?: ReactNode;
  /** Cor do botão de confirmação — `error` por omissão (o padrão das cópias). */
  readonly confirmColor?: 'error' | 'primary' | 'secondary' | 'success' | 'info' | 'warning';
  /** Trabalho em curso: trava fechar/cancelar/confirmar (`ConfirmDialog.state`). */
  readonly busy?: boolean;
  /** Foco inicial — `cancel` por omissão (W18); `confirm` para o padrão antigo. */
  readonly initialFocus?: 'cancel' | 'confirm';
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  confirmColor = 'error',
  busy = false,
  initialFocus = 'cancel',
  onCancel,
  onConfirm,
}: ConfirmDialogProps): ReactElement {
  const { t } = useTranslation();
  const baseId = useId();
  const ids = confirmDialogIds(baseId);
  const estado = confirmDialogActionsState(busy);

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (estado.canDismiss) onCancel();
      }}
      aria-labelledby={ids.titleId}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle id={ids.titleId}>{title}</DialogTitle>
      {description ? (
        <DialogContent dividers>
          <Typography variant="body2" id={ids.descriptionId}>
            {description}
          </Typography>
        </DialogContent>
      ) : null}
      <DialogActions>
        <Button
          onClick={onCancel}
          disabled={estado.cancelDisabled}
          autoFocus={initialFocus === 'cancel'}
          sx={touchTargetSx}
        >
          {cancelLabel ?? t('translation:common.cancel')}
        </Button>
        <Button
          variant="contained"
          color={confirmColor}
          onClick={onConfirm}
          disabled={estado.confirmDisabled}
          autoFocus={initialFocus === 'confirm'}
          sx={touchTargetSx}
        >
          {confirmLabel ?? t('translation:common.confirm')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
