/**
 * src/views/ChallengeView/blocks/TrackChallengeTimeoutNotices.tsx — os AVISOS
 * de tempo esgotado do desafio de trilha (S9): o veredito do relógio ('timeout')
 * FICA quando o submit em voo resolve depois — o resultado da tentativa segue
 * visível (aviso dedicado), sem sobreposição silenciosa de vereditos.
 *
 * VIEW PURA (docs/storybook/STORY-SPEC.md §5): só props, zero IPC, zero
 * estado.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';

export interface TrackChallengeTimeoutNoticesProps {
  /** O relógio estourou (aviso "Tempo esgotado"). */
  timedOut: boolean;
  /** O relógio estourou COM o submit em voo e o resultado chegou depois. */
  resultArrived: boolean;
}

export function TrackChallengeTimeoutNotices({
  timedOut,
  resultArrived,
}: TrackChallengeTimeoutNoticesProps): ReactElement | null {
  const { t } = useTranslation();
  return (
    <>
      {timedOut ? (
        <Alert severity="warning">{t('translation:challenge.timedOutAnnounce')}</Alert>
      ) : null}
      {timedOut && resultArrived ? (
        <Alert severity="info">{t('translation:challenge.timeoutDuringSubmit')}</Alert>
      ) : null}
    </>
  );
}
