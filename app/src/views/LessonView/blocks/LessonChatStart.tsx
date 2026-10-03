/**
 * blocks/LessonChatStart.tsx — o CONVITE DE ABERTURA do chat da aula (o ramo
 * de histórico vazio: a bolha inicial + o botão "Começar aula" + o card do
 * desafio de abertura).
 *
 * Bloco de VIEW PURO extraído de LessonView.tsx (contrato STORY-SPEC §5): só
 * props. A aula NÃO começa sozinha — o "Começar aula" dispara a primeira
 * seção (`onStart` → sendNext no container) e o card abaixo oferece pular
 * direto para o desafio (ONDA1-CARD-DESAFIO-INICIAL, exceção do dono: quem
 * clica no card está pulando a teoria, então ele NÃO é gateado pelo quiz — o
 * gate do fluxo normal fica intacto no container).
 */
import { Box, Button, Typography } from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useTranslation } from 'react-i18next';
import type { ReactElement } from 'react';
import type { TrackChallengeSummaryDto } from '../../../../shared/ipc-contract';
import { LessonChallengeIntroCard } from './LessonChallengeIntroCard';
import { PressableShell } from './PressableShell';

export interface LessonChatStartProps {
  /** Turno em voo: trava o "Começar aula" (nada de duas seções em paralelo). */
  busy: boolean;
  /** Dispara a primeira seção da teoria. */
  onStart: () => void;
  /**
   * O desafio destacado pela decisão pura `lessonChallengeCard` — null = sem
   * card (sem desafios pendentes: o módulo puro decide, aqui só se desenha).
   */
  challenge: TrackChallengeSummaryDto | null;
  /** O CTA do card: navega para o desafio (fluxo track, sem gate). */
  onTryChallenge: () => void;
}

export function LessonChatStart({
  busy,
  onStart,
  challenge,
  onTryChallenge,
}: LessonChatStartProps): ReactElement {
  const { t } = useTranslation();
  return (
    <Box sx={{ m: 'auto', textAlign: 'center', color: 'text.secondary' }}>
      <Typography variant="body2">{t('translation:lesson.chatStart')}</Typography>
      {/* ONDA2-CHAT-NINTENDO: press feedback (scale 0.98, spring snappy) nos
          botões do chat — pedido do dono. */}
      <PressableShell>
        <Button
          variant="contained"
          size="small"
          onClick={onStart}
          disabled={busy}
          startIcon={<ArrowForwardIcon />}
          sx={{ mt: 1 }}
        >
          {t('translation:lesson.startButton')}
        </Button>
      </PressableShell>
      {challenge !== null ? (
        <LessonChallengeIntroCard challenge={challenge} onTryChallenge={onTryChallenge} />
      ) : null}
    </Box>
  );
}
