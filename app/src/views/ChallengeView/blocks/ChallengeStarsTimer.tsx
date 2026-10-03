/**
 * src/views/ChallengeView/blocks/ChallengeStarsTimer.tsx — ESTRELAS +
 * CRONÔMETRO do desafio ativo (3 estrelas no início; perdas por foco/tempo/
 * resposta errada/demora — máquina pura em src/lib/challengeStars.ts).
 *
 * VIEW PURA (docs/storybook/STORY-SPEC.md §5): só props, zero IPC, zero
 * estado. A11y: o agrupamento de estrelas é `role="img"` com contagem
 * (`challenge.starsAria`); o relógio tem rótulo próprio (`challenge.timerAria`)
 * e vira "Tempo esgotado" (`challenge.timedOut`) quando estoura.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import TimerIcon from '@mui/icons-material/Timer';

export interface ChallengeStarsTimerProps {
  /** Estrelas que restam (0..totalStars). */
  starsLeft: number;
  totalStars: number;
  /** O relógio estourou (chip vira "Tempo esgotado"). */
  timedOut: boolean;
  /** Texto do relógio já formatado (contagem decrescente). */
  clockText: string;
}

export function ChallengeStarsTimer({
  starsLeft,
  totalStars,
  timedOut,
  clockText,
}: ChallengeStarsTimerProps): ReactElement {
  const { t } = useTranslation();
  const tI = t as unknown as (key: string, options?: Record<string, string | number>) => string;
  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ alignItems: 'center', mt: 0.5, flexWrap: 'wrap', minHeight: 28 }}
    >
      <Box
        component="span"
        role="img"
        aria-label={tI('translation:challenge.starsAria', {
          current: starsLeft,
          total: totalStars,
        })}
        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}
      >
        {Array.from({ length: totalStars }, (_, i) =>
          i < starsLeft ? (
            <StarIcon key={i} fontSize="small" sx={{ color: 'warning.main' }} />
          ) : (
            // W5: estrela vazia é indicador NÃO-TEXTO e precisa de ≥ 3:1
            // (SC 1.4.11). `action.disabled` ficava muito abaixo; o token
            // certo é o `nonText.neutral` (NONTEXT_* de designTokens.ts —
            // medido 3,2:1 no canvas claro e 6,1:1 no escuro).
            <StarBorderIcon
              key={i}
              fontSize="small"
              sx={{ color: (tema) => tema.vars.palette.nonText.neutral }}
            />
          ),
        )}
      </Box>
      <Chip
        size="small"
        variant="outlined"
        icon={timedOut ? undefined : <TimerIcon />}
        label={timedOut ? t('translation:challenge.timedOut') : clockText}
        color={timedOut ? 'error' : 'default'}
        aria-label={
          timedOut
            ? t('translation:challenge.timedOut')
            : tI('translation:challenge.timerAria', { time: clockText })
        }
      />
    </Stack>
  );
}
