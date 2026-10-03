/**
 * src/views/ChallengeView/blocks/TrackChallengeMastery.tsx — a ANÁLISE DE
 * DOMÍNIO do desafio do MÓDULO: o que esta tentativa demonstrou (e foi
 * marcado) × o que resta refazer ("só faço as aulas que reprovei").
 *
 * VIEW PURA (docs/storybook/STORY-SPEC.md §5): só props, zero IPC, zero
 * estado — a triagem vem de `splitMastery` (trackChallengeUi.ts). Sem
 * `mastery` (erro de análise, alvo não-module) o bloco não renderiza: o
 * veredito continua sendo o do runner.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import type { TrackModuleMasteryReport } from '../../../../shared/ipc-contract';
import { splitMastery } from '../trackChallengeUi';

export interface TrackChallengeMasteryProps {
  /** Relatório de domínio (SÓ target 'module') ou null. */
  mastery: TrackModuleMasteryReport | null;
}

export function TrackChallengeMastery({ mastery }: TrackChallengeMasteryProps): ReactElement | null {
  const { t } = useTranslation();
  if (mastery === null) return null;
  const { demonstradas, refazer } = splitMastery(mastery);
  return (
    <Alert severity="info">
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {t('translation:challenge.masteryTitle')}
      </Typography>
      {demonstradas.length > 0 ? (
        <Typography variant="body2" sx={{ mt: 0.5 }}>
          {t('translation:challenge.masteryDemonstrated')}{' '}
          {demonstradas.map((l) => l.title).join(' · ')}
        </Typography>
      ) : (
        <Typography variant="body2" sx={{ mt: 0.5 }}>
          {t('translation:challenge.masteryNothing')}
        </Typography>
      )}
      {refazer.length > 0 ? (
        <Typography variant="body2" sx={{ mt: 0.5 }}>
          {t('translation:challenge.masteryRedo')}{' '}
          {refazer.map((l) => l.title).join(' · ')}
        </Typography>
      ) : null}
    </Alert>
  );
}
