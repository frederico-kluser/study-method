/**
 * src/views/ChallengeView/blocks/TrackChallengeStatement.tsx — o ATO 1 do
 * desafio de trilha: enunciado (markdown) + "Começar". O cronômetro SÓ começa
 * no "Começar" (pedido do dono do produto) — aqui só se desenha; quem decide é
 * o chamador.
 *
 * VIEW PURA (docs/storybook/STORY-SPEC.md §5): só props, zero IPC, zero
 * estado.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { MarkdownView } from '../../../components/markdown';

export interface TrackChallengeStatementProps {
  /** Enunciado em markdown. */
  statement: string;
  /** O aluno já começou (esconde o "Começar"). */
  started: boolean;
  onStart: () => void;
}

export function TrackChallengeStatement({ statement, started, onStart }: TrackChallengeStatementProps): ReactElement {
  const { t } = useTranslation();
  return (
    <Box
      sx={{
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        p: 2,
        '& p:first-of-type': { mt: 0 },
        '& p:last-of-type': { mb: 0 },
      }}
    >
      <MarkdownView markdown={statement} />
      {!started ? (
        <Button
          variant="contained"
          size="large"
          onClick={onStart}
          startIcon={<PlayArrowIcon />}
          sx={{ mt: 2 }}
          fullWidth
        >
          {t('translation:challenge.startButton')}
        </Button>
      ) : null}
    </Box>
  );
}
