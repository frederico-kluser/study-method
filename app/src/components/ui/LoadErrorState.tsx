/**
 * components/ui/LoadErrorState.tsx — o bloco "erro de carregamento + Tentar de
 * novo" (auditoria de layout §3, forma (a)).
 *
 * Estava copiado 16 vezes em 12 ficheiros (LessonView, TrackChallengePanel,
 * GameLevelView, GamesView, placeholders ×2, RoadmapView, OrphanTracksPanel,
 * KeysPanel…): coluna centrada + `Alert severity="error"` + botão retry. Aqui
 * são 1–3 linhas no chamador.
 *
 * VIEW PURA: só props. A copy do erro vive no chamador (`message`) — cada view
 * sabe dizer O QUE falhou; o primitivo só tem a copy de fallback
 * (`translation:ui.loadError.message`) e o rótulo do retry
 * (`translation:common.tryAgain`, existente). O `loading` delega no estado do
 * `ActionButton` (desligado + `aria-busy` + spinner) enquanto o retry corre.
 */
import type { ReactElement, ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import { useTranslation } from 'react-i18next';

import { LAYOUT } from '../../lib/designTokens';
import { ActionButton } from './ActionButton';
import { CenteredColumn } from './CenteredColumn';

export interface LoadErrorStateProps {
  /** A mensagem de erro — o chamador traduz (fallback do primitivo se omitida). */
  readonly message?: ReactNode;
  /** O retry. */
  readonly onRetry: () => void;
  /** Retry em curso (o botão desliga e anuncia). */
  readonly loading?: boolean;
  /** Rótulo do retry — por omissão `translation:common.tryAgain`. */
  readonly retryLabel?: ReactNode;
  /** Teto de largura em px — `LAYOUT.*`. Por omissão, a coluna de leitura. */
  readonly width?: number;
}

export function LoadErrorState({
  message,
  onRetry,
  loading = false,
  retryLabel,
  width = LAYOUT.readingColumnPx,
}: LoadErrorStateProps): ReactElement {
  const { t } = useTranslation();

  return (
    <CenteredColumn width={width} topPad={4}>
      <Alert severity="error">{message ?? t('translation:ui.loadError.message')}</Alert>
      <ActionButton variant="outlined" onClick={onRetry} loading={loading} sx={{ mt: 1 }}>
        {retryLabel ?? t('translation:common.tryAgain')}
      </ActionButton>
    </CenteredColumn>
  );
}
