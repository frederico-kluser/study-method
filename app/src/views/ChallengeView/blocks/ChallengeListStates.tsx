/**
 * src/views/ChallengeView/blocks/ChallengeListStates.tsx — os ESTADOS da
 * listagem de desafios sem desafio ativo: erro de listagem (W11: sempre com
 * saída — "Tentar de novo" refaz a consulta), estado vazio legítimo
 * (ONDA-UX-VAZIO: informativo + CTA "ir para a Aula") e o convite a escolher.
 *
 * VIEW PURA (docs/storybook/STORY-SPEC.md §5): só props, zero IPC, zero
 * estado. Os dois Alerts com ação são o primitivo `RetryAlert` (auditoria §3,
 * forma (b) — o bloco "erro + Tentar de novo"/"Alert com ação").
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Typography from '@mui/material/Typography';
import { RetryAlert } from '../../../components/ui/RetryAlert';

export interface ChallengeListStatesProps {
  listing: 'idle' | 'loading' | 'error' | 'empty';
  listError: string;
  /** Há desafio ativo? (os estados só aparecem sem desafio em cena.) */
  hasActive: boolean;
  onRetry: () => void;
  onGoToLesson: () => void;
}

export function ChallengeListStates({
  listing,
  listError,
  hasActive,
  onRetry,
  onGoToLesson,
}: ChallengeListStatesProps): ReactElement | null {
  const { t } = useTranslation();
  return (
    <>
      {listing === 'error' && !hasActive ? (
        // W11: erro de listagem SEMPRE com saída — "Tentar de novo" refaz a
        // consulta (um erro de canal não é beco sem saída).
        <RetryAlert message={listError} onRetry={onRetry} />
      ) : null}

      {/* ONDA-UX-VAZIO: o estado vazio legítimo (nenhum desafio gerado ainda)
          é INFORMATIVO e vem com o CTA que o texto pedia a palavras — quem
          quer desafio gera uma aula primeiro, e a aula é na aba Aula. */}
      {listing === 'empty' && !hasActive ? (
        <RetryAlert
          severity="info"
          message={t('translation:challenge.noChallengesEmpty')}
          retryLabel={t('translation:challenge.emptyGoToLesson')}
          onRetry={onGoToLesson}
        />
      ) : null}

      {!hasActive && listing !== 'empty' ? (
        <Typography variant="body1" sx={{ color: 'text.secondary', mt: 2 }}>
          {t('translation:challenge.selectPrompt')}
        </Typography>
      ) : null}
    </>
  );
}
