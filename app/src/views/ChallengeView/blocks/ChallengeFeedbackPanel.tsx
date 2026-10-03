/**
 * src/views/ChallengeView/blocks/ChallengeFeedbackPanel.tsx — o painel de
 * SAÍDA + FEEDBACK (3.º painel): saída determinística (terminal), erro de
 * infra com retry (C3), stream do pi com disclosure acessível (S6) e o
 * veredito do avaliador (S1) + erro da fase pi (W10).
 *
 * VIEW PURA (docs/storybook/STORY-SPEC.md §5): só props, zero IPC, zero
 * estado. O terminal (xterm) entra como SLOT (`terminal`) — mantém este
 * bloco importável fora do Electron (o xterm precisa de canvas com dimensões;
 * ver docs/storybook/RENDER-PLAYBOOK.md §4).
 *
 * DRY (auditoria §3/§8): os três erros são `RetryAlert` e as duas linhas de
 * cabeçalho são `SectionHeader`. O erro de CHAVE (W10) NÃO ganha retry
 * (resolve-se nas Configurações) e o `RetryAlert` expressa isso com
 * `action={false}` (extensão da consolidação DRY: `retryAlertState` mostra só
 * a mensagem/detalhe, sem botão — "Tentar de novo" que não resolve é mentira).
 */
import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import MemoryIcon from '@mui/icons-material/Memory';
import { RetryAlert } from '../../../components/ui/RetryAlert';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { ChallengeStreamBlocks } from './ChallengeStreamBlocks';
import { ChallengeVerdictBlock } from './ChallengeVerdictBlock';
import type { StreamingBlock, VerdictSeverity } from '../challengeUi';

export interface ChallengeFeedbackPanelProps {
  /** Terminal de saída determinística (slot — o xterm vive no container). */
  terminal: ReactNode;
  /** Fase determinística em curso (chip "A executar…"). */
  testRunning: boolean;
  /** Erro de INFRA da fase determinística (null = sem erro). */
  testError: string | null;
  onRetryTests: () => void;
  /** Chip do provedor de feedback (null = ainda sem provedor). */
  providerLabel: string | null;
  piRunning: boolean;
  piAborted: boolean;
  /** S2: pedido de feedback em voo, sem conteúdo ainda. */
  requestingFeedback: boolean;
  showThinking: boolean;
  onToggleThinking: () => void;
  blocks: StreamingBlock[];
  /** Veredito do avaliador (null = ainda sem). */
  verdict: { severity: VerdictSeverity; markdown: string } | null;
  /** Erro da fase pi (null = sem erro). */
  piError: { text: string; kind: 'key' | 'other' } | null;
  onRetryPi: () => void;
}

export function ChallengeFeedbackPanel({
  terminal,
  testRunning,
  testError,
  onRetryTests,
  providerLabel,
  piRunning,
  piAborted,
  requestingFeedback,
  showThinking,
  onToggleThinking,
  blocks,
  verdict,
  piError,
  onRetryPi,
}: ChallengeFeedbackPanelProps): ReactElement {
  const { t } = useTranslation();
  return (
    <Paper variant="outlined" sx={{ p: { xs: 1, md: 2 } }}>
      {/* Seção de saída determinística */}
      <SectionHeader
        title={t('translation:challenge.output')}
        actions={
          testRunning ? (
            <Chip size="small" label={t('translation:challenge.running')} color="primary" variant="outlined" />
          ) : undefined
        }
      />
      <Box sx={{ mt: 0.5, height: 220 }}>
        <Box data-onboarding-target="challenge-terminal" component="span" sx={{ display: 'contents' }}>
          {terminal}
        </Box>
      </Box>

      {/* C3: o estado de ERRO da fase determinística, finalmente visível —
          mensagem i18n + "Tentar de novo" (antes o catch só escrevia no
          terminal e seguia para o pi como se nada fosse). */}
      {testError !== null ? (
        <RetryAlert message={testError} onRetry={onRetryTests} />
      ) : null}

      {/* Seção de feedback */}
      <SectionHeader
        title={
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
            <MemoryIcon fontSize="small" color="action" />
            <span>{t('translation:challenge.feedback')}</span>
          </Box>
        }
        actions={
          <>
            {providerLabel !== null ? (
              <Chip label={providerLabel} size="small" variant="outlined" color="secondary" />
            ) : null}
            {piRunning ? (
              <Chip size="small" label={t('translation:challenge.running')} color="primary" variant="outlined" />
            ) : null}
            {piAborted ? (
              <Chip size="small" label={t('translation:challenge.aborted')} variant="outlined" />
            ) : null}
          </>
        }
      />

      <Box sx={{ mt: 0.5 }}>
        {/* S2 (auditoria de UX): o INTERSTÍCIO entre os testes e a avaliação
            era invisível — este estado explícito cobre exatamente a janela de
            pedido em voo, sem conteúdo ainda. */}
        {requestingFeedback ? (
          <Typography variant="body2" role="status" sx={{ color: 'text.secondary', mb: 0.5 }}>
            {t('translation:challenge.requestingFeedback')}
          </Typography>
        ) : null}
        <Button
          size="small"
          startIcon={showThinking ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          onClick={onToggleThinking}
          // S6: disclosure acessível — o botão diz o que controla
          // (aria-controls) e se está aberto (aria-expanded).
          aria-expanded={showThinking}
          aria-controls="challenge-thinking-panel"
        >
          {t('translation:challenge.thinking')}
        </Button>
        {/* S6: a região controlada pelo toggle (streams + resultado). Vive no
            DOM mesmo quando vazia para o aria-controls nunca apontar para um id
            inexistente. */}
        <Box component="div" id="challenge-thinking-panel">
          <ChallengeStreamBlocks blocks={blocks} showThinking={showThinking} />
          {verdict !== null ? (
            <ChallengeVerdictBlock severity={verdict.severity} markdown={verdict.markdown} />
          ) : null}
        </Box>
        {piError !== null ? (
          piError.kind === 'other' ? (
            // W10: "Tentar de novo" só nos erros que o retry resolve (repete a
            // fase pi).
            <RetryAlert message={piError.text} onRetry={onRetryPi} />
          ) : (
            // W10: erro de CHAVE não ganha retry — resolve-se nas
            // Configurações; a dica da chave SÓ neste ramo (era ruído nos
            // restantes erros). `action={false}` é o "sem retentativa" do
            // primitivo (auditoria §3): a mensagem e a dica, sem botão.
            <RetryAlert
              action={false}
              message={piError.text}
              detail={t('translation:challenge.keyHint')}
            />
          )
        ) : null}
      </Box>
    </Paper>
  );
}
