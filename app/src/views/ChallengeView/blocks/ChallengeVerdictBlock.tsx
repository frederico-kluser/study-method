/**
 * src/views/ChallengeView/blocks/ChallengeVerdictBlock.tsx — o VEREDITO do
 * avaliador (S1): antes era um `<pre>` cru, a mesma cara da saída do
 * terminal; passou a bloco de veredito — Alert com severity por desfecho e o
 * corpo em MarkdownView (o renderizador da casa: KaTeX, código com highlight,
 * listas).
 *
 * VIEW PURA (docs/storybook/STORY-SPEC.md §5): só props, zero IPC, zero
 * estado. A severidade vem de `verdictSeverity` (challengeUi.ts — a
 * semântica das contagens: sucesso quando passou, warning quando PARCIAL,
 * error quando NADA passou).
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import { MarkdownView } from '../../../components/markdown';
import type { VerdictSeverity } from '../challengeUi';

export interface ChallengeVerdictBlockProps {
  severity: VerdictSeverity;
  /** Corpo do veredito em markdown (a avaliação do pi). */
  markdown: string;
}

export function ChallengeVerdictBlock({ severity, markdown }: ChallengeVerdictBlockProps): ReactElement {
  const { t } = useTranslation();
  return (
    <Alert severity={severity} sx={{ mt: 0.5 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
        {t('translation:challenge.verdictLabel')}
      </Typography>
      <MarkdownView markdown={markdown} />
    </Alert>
  );
}
