/**
 * src/views/ChallengeView/blocks/TrackChallengeLoadError.tsx — o estado de
 * ERRO de carga da spec do desafio de trilha (W11: sempre com saída —
 * "Tentar de novo" refaz a consulta).
 *
 * VIEW PURA (docs/storybook/STORY-SPEC.md §5): só props, zero IPC, zero
 * estado. W3 (falsy-proof): '' é erro VÁLIDO — só `null` significa "sem erro"
 * (a decisão é do chamador; aqui só se desenha). O desenho é o primitivo
 * `LoadErrorState` (auditoria §3, forma (a)) na coluna larga
 * (`LAYOUT.wideColumnPx` — era o `maxWidth: 720` escrito à mão).
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { LAYOUT } from '../../../lib/designTokens';
import { LoadErrorState } from '../../../components/ui/LoadErrorState';

export interface TrackChallengeLoadErrorProps {
  /** Mensagem de erro (null → fallback "desafio não encontrado"). */
  loadError: string | null;
  onRetry: () => void;
}

export function TrackChallengeLoadError({ loadError, onRetry }: TrackChallengeLoadErrorProps): ReactElement {
  const { t } = useTranslation();
  return (
    <LoadErrorState
      message={loadError ?? t('translation:challenge.trackNotFound')}
      onRetry={onRetry}
      width={LAYOUT.wideColumnPx}
    />
  );
}
