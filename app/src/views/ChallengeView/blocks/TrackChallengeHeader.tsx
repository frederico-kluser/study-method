/**
 * src/views/ChallengeView/blocks/TrackChallengeHeader.tsx — o CABEÇALHO do
 * desafio de trilha: voltar + título + chips (dificuldade/testes/gerado) +
 * estrelas + cronômetro.
 *
 * VIEW PURA (docs/storybook/STORY-SPEC.md §5): só props, zero IPC, zero
 * estado. O DOM preserva o contrato observado pelo e2e (tests/e2e/
 * e2e-desafio-retomar.spec.ts): as estrelas (`role="img"`) e o relógio
 * (`role="timer"`) vivem no MESMO `Stack`.
 *
 * ONDA-UX-WAYFINDING: o painel Desafio não tem aba no rail (ONDA-SEM-DESAFIO-
 * NO-RAIL) — o botão "Voltar" segue a ORIGEM da navegação (quem decide o
 * destino é o `onBack` do chamador). Alvo de toque 44px (piso do design
 * system).
 *
 * O TÍTULO é o `SectionHeader` de nível 1 com o TALHE `h5` (auditoria §8):
 * os dois cabeçalhos de PÁGINA são `<h1>` e partilham a semântica, mas não o
 * talhe — o `level` decide o `component` e o `variant` é o escape hatch de
 * tamanho (`SectionHeader.state.ts`). Voltar, chips e estrelas/relógio ficam
 * onde estavam: a coluna da esquerda é empilhada (voltar ACIMA do título), o
 * que a linha única do `SectionHeader` não desenha.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { touchTargetSx } from '../../../lib/layoutSx';
import { SectionHeader } from '../../../components/ui/SectionHeader';

export interface TrackChallengeHeaderProps {
  title: string;
  /** Rótulo de dificuldade já interpolado (`challenge.difficulty`). */
  difficultyLabel: string;
  /** Rótulo de contagem de testes já interpolado (`challenge.testsCount`). */
  testsLabel: string;
  /** Badge "desafio gerado" (source === 'generated'). */
  generated: boolean;
  /** Estrelas que restam (0..3). */
  starsLeft: number;
  /** Texto do relógio (contagem decrescente OU o limite — ver `started`). */
  timerText: string;
  onBack: () => void;
}

export function TrackChallengeHeader({
  title,
  difficultyLabel,
  testsLabel,
  generated,
  starsLeft,
  timerText,
  onBack,
}: TrackChallengeHeaderProps): ReactElement {
  const { t } = useTranslation();
  const tI = t as unknown as (key: string, options?: Record<string, string | number>) => string;
  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}
    >
      <Box>
        <Button
          size="small"
          startIcon={<ArrowBackIcon />}
          onClick={onBack}
          sx={{ ...touchTargetSx, mb: 0.5 }}
        >
          {t('translation:common.back')}
        </Button>
        <SectionHeader level={1} variant="h5" title={title} />
        {/* O `mb: 1` canónico da linha de cabeçalho (`SectionHeader`) é o
            espaço até aos chips — o `mt: 0.5` local saiu com a migração. */}
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Chip size="small" variant="outlined" label={difficultyLabel} />
          <Chip size="small" variant="outlined" label={testsLabel} />
          {generated ? (
            <Chip size="small" color="secondary" label={t('translation:challenge.generatedBadge')} />
          ) : null}
        </Stack>
      </Box>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        {/* ONDA-UX-A11Y: estrelas e cronómetro COM nome acessível
            (`challenge.starsAria`/`timerAria`), mesmo padrão da ChallengeView:
            `role="img"` no agrupamento de estrelas e rótulo próprio no
            `role="timer"`. */}
        <Box
          component="span"
          role="img"
          aria-label={tI('challenge.starsAria', { current: starsLeft, total: 3 })}
          sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}
        >
          {[0, 1, 2].map((i) =>
            i < starsLeft ? (
              <StarIcon key={i} fontSize="small" sx={{ color: 'warning.main' }} />
            ) : (
              <StarBorderIcon key={i} fontSize="small" sx={{ color: 'action.disabled' }} />
            ),
          )}
        </Box>
        <Typography
          variant="body2"
          sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}
          role="timer"
          aria-label={tI('challenge.timerAria', { time: timerText })}
        >
          {timerText}
        </Typography>
      </Stack>
    </Stack>
  );
}
