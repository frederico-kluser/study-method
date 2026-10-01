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
import { IPC_TIMEOUT_MS, isTimeoutError, withTimeout } from '../lib/ipcTimeout';
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

export function AppGate(): ReactElement {
  const [status, setStatus] = useState<StartupStatus | null>(null);
  // null = ok; 'rejected' = canal respondeu com erro; 'timeout' = canal MUDO
  // (nunca resolveu em IPC_TIMEOUT_MS) — splash nunca fica eterno.
  const [readError, setReadError] = useState<null | 'rejected' | 'timeout'>(null);

  const runCheck = useCallback(async (keepContent = false) => {
    // S5/W13 (onda-ux): `keepContent` distingue a PRIMEIRA carga (splash) de um
    // RE-CHECK (Salvar e continuar / Tentar novamente): o re-check NÃO apaga o
    // que está no ecrã — o SetupView fica montado (as chaves digitadas e o
    // estado de validação sobrevivem) e o App continua visível sob o banner
    // offline até o novo veredito chegar.
    if (!keepContent) setStatus(null);
    setReadError(null);
    try {
      const api = getApi().keys as unknown as KeysWithStartupStatus;
      const res = await withTimeout(api.startupStatus(), IPC_TIMEOUT_MS, 'keys.startupStatus');
      setStatus(res);
    } catch (err) {
      setReadError(isTimeoutError(err) ? 'timeout' : 'rejected');
    }
  }, []);

  /** Re-check preservando o conteúdo (contrato do StartupCtx / SetupView). */
  const recheck = useCallback(() => runCheck(true), [runCheck]);

  useEffect(() => {
    void runCheck(false);
  }, [runCheck]);

  const flags = useMemo(
    () => (status ? applyOfflineFlags(status) : { canUseOnline: true, canUseLocal: true }),
    [status],
  );

  const contextValue = useMemo<StartupContextValue>(
    () => ({ status, flags, recheck }),
    [status, flags, recheck],
  );

  let content: ReactElement;
  if (readError) {
    content = <GateError kind={readError} onRetry={() => void recheck()} />;
  } else if (!status || status.phase === 'checking') {
    content = <Splash />;
  } else if (status.phase === 'blocked') {
    // S5: `onDone` é AGUARDADO pelo SetupView — se o re-check voltar 'blocked',
    // o mesmo SetupView (montado, valores intactos) volta a responder. W1: o
    // status carregado informa se as chaves já são inválidas (mensagem por estado).
    content = <SetupView onDone={recheck} startupStatus={status} />;
  } else if (status.phase === 'offline') {
    // ONDA-INPUT-ANCORADO (bug: "o input sobe quando a view tem menos
    // conteúdo"): o wrapper antigo era um BLOCO de altura auto — e o root do
    // Shell declara `height: '100%'` (App.tsx), que contra um pai auto resolve
    // para AUTO. Em offline a cadeia inteira (#root → shell → main → view) caía
    // para altura de conteúdo: o chat deixava de rolar internamente, `flexGrow`
    // não tinha espaço livre e o composer/inputs passavam a seguir o fluxo do
    // conteúdo — "subindo" para o meio do ecrã quando havia pouco conteúdo.
    // O wrapper agora ESTABELECE a altura (flex column de 100%): o banner fica
    // no topo e o App preenche o resto com a mesma geometria do modo 'ready'.
    content = (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <OfflineBanner />
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <App />
        </Box>
      </Box>
    );
  } else {
    // 'ready'
    content = <App />;
  }

  return <StartupCtx.Provider value={contextValue}>{content}</StartupCtx.Provider>;
}