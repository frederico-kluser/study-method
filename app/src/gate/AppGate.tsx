/**
 * src/gate/AppGate.tsx — GATE DE INÍCIO (onda 6). CHROME MUI v9 + useTranslation
 * (removeu o tSafe).
 *
 * Envolve o <App/> e, ao montar, consulta `window.api.keys.startupStatus()`.
 * O tipo `startupStatus` NÃO está no ApiSchema (a onda 8 é dona única das
 * adições de tipo no api-schema) — mantemos o cast KeysWithStartupStatus
 * (padrão do base) até a onda 8 tipar.
 *
 * Fases (StartupStatus.phase):
 *   - 'checking' (ou status nulo) → SPLASH com CircularProgress (gate.checking);
 *   - 'blocked'  → <SetupView onDone={recheck}/> (formulário OBRIGATÓRIO de keys);
 *   - 'offline'  → <OfflineBanner/> (Alert) no topo + <App/> (features online
 *                  gateadas via flags; LLM local continua utilizável);
 *   - 'ready'    → <App/>.
 *
 * Guarda o startup result + flags num context (StartupCtx) — as features
 * consultam via `useStartup()`.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { StartupStatus } from '@shared/ipc-contract';
import App from '../App';
import { getApi } from '../lib/apiBridge';
import { applyOfflineFlags, type StartupFlags } from './startupState';
import { SetupView } from './SetupView';

/** Assinatura mínima do canal keys:startup-status exposto pelo preload. O tipo
 * `startupStatus` NÃO está no ApiSchema (a onda 8 será dona única das adições
 * de tipo do api-schema) — até lá usamos cast, como o base fazia. */
type KeysWithStartupStatus = {
  startupStatus(): Promise<StartupStatus>;
};

/** Valor do StartupCtx exposto via useStartup(). */
export interface StartupContextValue {
  /** Último resultado do gate (null antes de resolver). */
  status: StartupStatus | null;
  /** Flags de capacidade derivados (canUseOnline / canUseLocal). */
  flags: StartupFlags;
  /** Re-executa a checagem (usado pelo "Salvar e continuar" do SetupView). */
  recheck(): Promise<void>;
}

export const StartupCtx = createContext<StartupContextValue>({
  status: null,
  flags: { canUseOnline: true, canUseLocal: true },
  recheck: async () => {},
});

/** Hook consumido pelas features para saber se online/local estão liberados. */
export function useStartup(): StartupContextValue {
  return useContext(StartupCtx);
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
          <Typography variant="body1" color="text.secondary">
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
  return (
    <Alert severity="warning" role="alert" sx={{ borderRadius: 0 }}>
      <strong>{t('translation:gate.offline')}</strong>
      <span>{` ${t('translation:gate.offlineTip')}`}</span>
    </Alert>
  );
}

/** Painel de erro do próprio gate (canal falhou — deveria raramente ocorrer). */
function GateError({ onRetry }: { onRetry: () => void }): ReactElement {
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
              Não foi possível consultar o estado das chaves de API. Verifique se o app iniciou corretamente e tente novamente.
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

export function AppGate(): ReactElement {
  const [status, setStatus] = useState<StartupStatus | null>(null);
  const [readError, setReadError] = useState(false);

  const runCheck = useCallback(async () => {
    setStatus(null);
    setReadError(false);
    try {
      const api = getApi().keys as unknown as KeysWithStartupStatus;
      const res = await api.startupStatus();
      setStatus(res);
    } catch {
      setReadError(true);
    }
  }, []);

  useEffect(() => {
    void runCheck();
  }, [runCheck]);

  const flags = useMemo(
    () => (status ? applyOfflineFlags(status) : { canUseOnline: true, canUseLocal: true }),
    [status],
  );

  const contextValue = useMemo<StartupContextValue>(
    () => ({ status, flags, recheck: runCheck }),
    [status, flags, runCheck],
  );

  let content: ReactElement;
  if (readError) {
    content = <GateError onRetry={() => void runCheck()} />;
  } else if (!status || status.phase === 'checking') {
    content = <Splash />;
  } else if (status.phase === 'blocked') {
    content = <SetupView onDone={() => void runCheck()} />;
  } else if (status.phase === 'offline') {
    content = (
      <Box component="div">
        <OfflineBanner />
        <App />
      </Box>
    );
  } else {
    // 'ready'
    content = <App />;
  }

  return <StartupCtx.Provider value={contextValue}>{content}</StartupCtx.Provider>;
}