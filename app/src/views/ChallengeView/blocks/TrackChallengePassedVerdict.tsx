/**
 * src/views/ChallengeView/blocks/TrackChallengePassedVerdict.tsx — o veredito
 * de SUCESSO do desafio de trilha: confete + "Passou com N estrelas" e, para
 * target 'lesson' (ONDA 4 — next-glow), as saídas "Avançar para a próxima
 * aula" / "Gerar novo desafio".
 *
 * VIEW PURA (docs/storybook/STORY-SPEC.md §5): só props, zero IPC, zero
 * estado. Não aparece para target 'module' (desafio autoral — não regenera)
 * nem 'proficiency' (fluxo próprio de destravamento) — o gate é do chamador.
 * S9: a caixa também aparece com o relógio estourado se a tentativa em voo
 * PASSOU (o veredito do relógio mantém-se, com o aviso próprio).
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';

export interface TrackChallengePassedVerdictProps {
  /** Estrelas finais (vai no anúncio `challenge.passedAnnounce`). */
  starsLeft: number;
  /** Ações pós-sucesso do desafio de AULA (próxima aula / gerar novo). */
  showLessonActions: boolean;
  /** Regeneração em curso (spinner + gate do botão). */
  regenerating: boolean;
  /** Processo GLOBAL de geração em voo (gate do botão — ONDA3). */
  generateRunning: boolean;
  onAdvance: () => void;
  onRegenerate: () => void;
}

export function TrackChallengePassedVerdict({
  starsLeft,
  showLessonActions,
  regenerating,
  generateRunning,
  onAdvance,
  onRegenerate,
}: TrackChallengePassedVerdictProps): ReactElement {
  const { t } = useTranslation();
  const tI = t as unknown as (key: string, options?: Record<string, string | number>) => string;
  return (
    <Stack spacing={1}>
      <Alert severity="success">{tI('challenge.passedAnnounce', { stars: starsLeft })}</Alert>
      {showLessonActions ? (
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            color="success"
            onClick={onAdvance}
            startIcon={<PlayCircleIcon />}
          >
            {t('translation:challenge.nextLessonButton')}
          </Button>
          <Button
            variant="outlined"
            color="secondary"
            onClick={onRegenerate}
            disabled={regenerating || generateRunning}
            startIcon={regenerating ? <CircularProgress size={16} /> : <AutoAwesomeIcon />}
          >
            {t('translation:challenge.generateNewAfterPass')}
          </Button>
        </Stack>
      ) : null}
    </Stack>
  );
}
