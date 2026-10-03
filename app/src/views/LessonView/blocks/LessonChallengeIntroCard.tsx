/**
 * blocks/LessonChallengeIntroCard.tsx — o CARD DO DESAFIO DE ABERTURA da aula
 * (ONDA1-CARD-DESAFIO-INICIAL: "o desafio deve ser mostrado logo no começo da
 * aula, abaixo da inicial, falando o que é o desafio, para o aluno que quiser
 * pular").
 *
 * Bloco de VIEW PURO extraído de LessonView.tsx: só props. A DECISÃO (o card
 * aparece? qual desafio? qual estado?) continua sendo do módulo PURO
 * `lessonChallengeCard` — este bloco só TRADUZ o resultado: título, conceito,
 * chips de dificuldade/estado (a regra de estado é `lessonChallengeCardStatus`,
 * a única fonte) e o CTA que o container liga (a navegação é dele).
 *
 * ONDA2 (falha-ver-aula): no estado 'failed' (o aluno já tentou e não passou)
 * o CTA vira o retry do MESMO desafio ("o aluno REFAZ O MESMO teste" — regra
 * do dono), com rótulo e nome acessível próprios. O `lessonChallengeCardStatus`
 * é consultado 3× de propósito (chips + rótulo + aria do CTA) — sem régua
 * paralela de estado (tests/lessonChallengeCardWiring.test.ts guarda isto).
 */
import { Button, Card, CardActions, CardContent, Chip, Stack, Typography, useTheme } from '@mui/material';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import { useTranslation } from 'react-i18next';
import { useMemo, type ReactElement } from 'react';
import type { TrackChallengeSummaryDto } from '../../../../shared/ipc-contract';
import { lessonChallengeCardStatus } from '../../../lib/lessonChallengeCard';
import { PressableShell } from './PressableShell';

export interface LessonChallengeIntroCardProps {
  /** O desafio destacado pela decisão `lessonChallengeCard` (nunca null aqui). */
  challenge: TrackChallengeSummaryDto;
  /** O CTA — o container navega para o desafio (fluxo track, sem gate pós-teoria). */
  onTryChallenge: () => void;
}

export function LessonChallengeIntroCard({
  challenge,
  onTryChallenge,
}: LessonChallengeIntroCardProps): ReactElement {
  const { t } = useTranslation();
  const tI = useMemo(
    () => t as unknown as (key: string, options?: Record<string, string | number>) => string,
    [t],
  );
  const theme = useTheme();
  const status = lessonChallengeCardStatus(challenge);
  return (
    <Card
      variant="outlined"
      role="group"
      aria-label={tI('lesson.challengeIntroCardAria', {
        title: challenge.title,
      })}
      sx={{
        mt: 2,
        textAlign: 'left',
        bgcolor: theme.vars.palette.surface.level1,
      }}
    >
      <CardContent>
        <Typography variant="subtitle2" sx={{ color: 'text.secondary' }}>
          {t('translation:lesson.challengeIntroCardTitle')}
        </Typography>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {challenge.title}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {challenge.concept}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: 'center' }}>
          <Chip
            size="small"
            variant="outlined"
            label={tI('lesson.difficulty', { n: challenge.difficulty })}
          />
          {challenge.failedCount > 0 ? (
            <Chip
              size="small"
              variant="outlined"
              color="warning"
              label={tI('lesson.challengeFailedCount', {
                n: challenge.failedCount,
              })}
            />
          ) : status === 'untried' ? (
            <Chip
              size="small"
              variant="outlined"
              label={t('translation:lesson.challengeUntried')}
            />
          ) : (
            /* ONDA2 (falha-ver-aula, achado do revisor da onda 1): veredito
               presente sem falha contada (ex. 'abandoned' — o aluno saiu da
               tentativa sem submeter) não é 'untried' nem tem failedCount > 0 —
               sem este ramo a linha de chips ficaria muda sobre o estado. */
            <Chip
              size="small"
              variant="outlined"
              color="warning"
              label={t('translation:lesson.challengeNotPassed')}
            />
          )}
        </Stack>
        <Typography variant="caption" component="p" sx={{ mt: 1, color: 'text.secondary' }}>
          {t('translation:lesson.challengeIntroCardHint')}
        </Typography>
      </CardContent>
      <CardActions>
        <PressableShell>
          <Button
            variant="contained"
            size="small"
            onClick={onTryChallenge}
            startIcon={<AssignmentOutlinedIcon />}
            /* ONDA2 (falha-ver-aula): a aria-label EXISTE (challengeIntroCardTryAria)
               e não tinha linha de código nenhuma — agora é o nome acessível do
               CTA. No estado 'failed' o CTA diz o retry do MESMO desafio. */
            aria-label={
              status === 'failed'
                ? tI('lesson.challengeIntroCardTryAgainAria', {
                    title: challenge.title,
                  })
                : tI('lesson.challengeIntroCardTryAria', {
                    title: challenge.title,
                  })
            }
          >
            {/* O MESMO clique do card reabre O MESMO challengeId — o retry do
                estado 'failed' não gera desafio novo. */}
            {status === 'failed'
              ? t('translation:lesson.challengeIntroCardTryAgain')
              : t('translation:lesson.challengeIntroCardTry')}
          </Button>
        </PressableShell>
      </CardActions>
    </Card>
  );
}
