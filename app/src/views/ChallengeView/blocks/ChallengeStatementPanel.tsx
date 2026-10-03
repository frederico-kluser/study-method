/**
 * src/views/ChallengeView/blocks/ChallengeStatementPanel.tsx — o ENUNCIADO do
 * desafio (Paper + markdown) com o cabeçalho de título/linguagem.
 *
 * VIEW PURA (docs/storybook/STORY-SPEC.md §5): só props, zero IPC, zero
 * estado. W11: enunciado/workspace indisponível NUNCA é um texto morto —
 * `RetryAlert` (auditoria §3, forma (b); warning para enunciado ausente,
 * error para falha de workspace) com "Tentar de novo" que re-carrega o
 * workspace. O cabeçalho título + chip é o `SectionHeader` (auditoria §8).
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { RetryAlert } from '../../../components/ui/RetryAlert';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { MarkdownView } from '../../../components/markdown';

export interface ChallengeStatementPanelProps {
  /** Título do desafio. */
  title: string;
  /** Linguagem (chip do cabeçalho). */
  language: string;
  /** Enunciado em markdown (vazio = ainda a carregar). */
  statement: string;
  /** Erro de carga do enunciado/workspace (null = tudo bem). */
  statementError: { text: string; severity: 'warning' | 'error' } | null;
  onRetry: () => void;
}

export function ChallengeStatementPanel({
  title,
  language,
  statement,
  statementError,
  onRetry,
}: ChallengeStatementPanelProps): ReactElement {
  const { t } = useTranslation();
  return (
    <Paper variant="outlined" sx={{ p: { xs: 1, md: 2 } }}>
      <SectionHeader title={title} actions={<Chip label={language} size="small" variant="outlined" />} />
      {statementError ? (
        <RetryAlert
          severity={statementError.severity}
          message={statementError.text}
          onRetry={onRetry}
        />
      ) : statement ? (
        <Box>
          {/* ONDA "chat e código": um único renderizador de markdown para o
              app inteiro (src/components/markdown) — os mesmos plugins KaTeX,
              highlight de sintaxe e a distinção entrada x saída no bloco de
              código. */}
          <MarkdownView markdown={statement} />
        </Box>
      ) : (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t('translation:challenge.statementLoading')}
        </Typography>
      )}
    </Paper>
  );
}
