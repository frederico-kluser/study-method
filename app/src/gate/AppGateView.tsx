/**
 * src/gate/AppGateView.tsx — VIEW PURA do gate de início (state/view split —
 * STORY-SPEC §5): só props, sem IPC.
 *
 * Desenha cada fase de arranque (a decisão é PURA — `resolveGatePhase` em
 * ./startupState.ts):
 *   - 'splash'  → SPLASH com CircularProgress (gate.checking);
 *   - 'setup'   → <SetupView/> (formulário OBRIGATÓRIO de keys);
 *   - 'offline' → <OfflineBanner/> (Alert) no topo + o app (features online
 *                 gateadas via flags; LLM local continua utilizável);
 *   - 'ready'   → o app;
 *   - 'error-*' → GateError (canal falhou: rejeição ≠ timeout), com retry.
 *
 * O conteúdo do app entra como SLOT (`app`) — o container passa `<App/>`; as
 * histórias/testes passam um nó leve e documentam as fases sem montar o app.
 */
import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { StartupStatus } from '@shared/ipc-contract';
import type { GatePhase } from './startupState';
import { SetupView } from './SetupView';
import { useStartup } from './useStartupGate';

export interface AppGateViewProps {
  /** Fase de ecrã (resolveGatePhase — pura, testável sem DOM). */
  phase: GatePhase;
  /** Conteúdo do app (o container passa `<App/>`). */
  app: ReactNode;
  /** Re-check do gate (GateError / OfflineBanner). */
  onRetry: () => void;
  /** "Salvar e continuar" do SetupView → re-check. */
  onSetupDone: () => void | Promise<void>;
  /** Status do gate — informa o SetupView sobre chaves já inválidas (W1). */
  startupStatus: StartupStatus | null;
}

/** Splash de checagem (gira enquanto o main valida as chaves). */
function Splash(): ReactElement {
  const { t } = useTranslation();
  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}
    >
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
          <CircularProgress size={28} />
          <Typography variant="body1" sx={{ color: 'text.secondary' }}>
            {t('translation:gate.checking')}
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}

/** Aviso renderizado no topo do app em modo OFFLINE (ambas as chaves falharam por rede). */
export function OfflineBanner(): ReactElement {
  const { t } = useTranslation();
  // W13 (onda-ux): o aviso ganha o "Tentar novamente", que re-executa o gate de
  // início (recheck do StartupCtx) sem fechar o app — se a rede voltou, o
  // banner some sozinho quando o novo veredito chega.
  const { recheck } = useStartup();
  return (
    <Alert severity="warning" role="alert" sx={{ borderRadius: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <Box sx={{ minWidth: 0 }}>
          <strong>{t('translation:gate.offline')}</strong>
          <span>{` ${t('translation:gate.offlineTip')}`}</span>
        </Box>
        <Button
          size="small"
          variant="outlined"
          onClick={() => void recheck()}
          sx={{ flexShrink: 0, minHeight: 32 }}
        >
          {t('translation:gate.tryAgain')}
        </Button>
      </Box>
    </Alert>
  );
}

/**
 * Painel de erro do próprio gate (canal falhou — deveria raramente ocorrer).
 * `kind` distingue o TIMEOUT do canal (IPC nunca resolveu em IPC_TIMEOUT_MS —
 * anti-spinner-eterno) da rejeição imediata: cada um com sua mensagem, ambos
 * com o botão de tentar de novo.
 */
function GateError({
  kind,
  onRetry,
}: {
  kind: 'rejected' | 'timeout';
  onRetry: () => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Box
      sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}
    >
      <Paper variant="outlined" sx={{ p: 3, maxWidth: 440, width: '100%' }}>
        <Stack spacing={1.5}>
          <Alert severity="error">
            <Typography variant="body1" component="div">
              {t('translation:common.error')}
            </Typography>
            <Typography variant="body2" component="div">
              {kind === 'timeout'
                ? t('translation:gate.startupTimeout')
                : t('translation:gate.readError')}
            </Typography>
          </Alert>
          <Button variant="contained" onClick={onRetry} sx={{ alignSelf: 'flex-start' }}>
            {t('translation:gate.tryAgain')}
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}

export function AppGateView({
  phase,
  app,
  onRetry,
  onSetupDone,
  startupStatus,
}: AppGateViewProps): ReactElement {
  if (phase === 'error-rejected' || phase === 'error-timeout') {
    return <GateError kind={phase === 'error-timeout' ? 'timeout' : 'rejected'} onRetry={onRetry} />;
  }
  if (phase === 'splash') return <Splash />;
  if (phase === 'setup') {
    // S5: `onDone` é AGUARDADO pelo SetupView — se o re-check voltar 'blocked',
    // o mesmo SetupView (montado, valores intactos) volta a responder. W1: o
    // status carregado informa se as chaves já são inválidas (mensagem por estado).
    return <SetupView onDone={onSetupDone} startupStatus={startupStatus} />;
  }
  if (phase === 'offline') {
    // ONDA-INPUT-ANCORADO (bug: "o input sobe quando a view tem menos
    // conteúdo"): o wrapper ESTABELECE a altura (flex column de 100%) — o
    // banner fica no topo e o App preenche o resto com a geometria do 'ready'.
    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <OfflineBanner />
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{app}</Box>
      </Box>
    );
  }
  // 'ready'
  return <>{app}</>;
}
