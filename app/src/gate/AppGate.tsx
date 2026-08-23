/**
 * src/gate/AppGate.tsx — GATE DE INÍCIO (onda 6).
 *
 * Envolve o <App/> e, ao montar, consulta `window.api.keys.startupStatus()`
 * (via CAST — o preload deriva keys.startupStatus de KEYS_CHANNELS, mas a
 * ApiSchema tipada em preload/api-schema.ts é CONGELADA nesta rodada e não
 * declara o método; o orquestrador/pós-merge adiciona a tipagem).
 *
 * Fases (StartupStatus.phase):
 *   - 'checking' (ou status nulo) → SPLASH com spinner (tSafe('gate.checking'));
 *   - 'blocked'  → <SetupView onDone={recheck}/> (formulário OBRIGATÓRIO de keys);
 *   - 'offline'  → <OfflineBanner/> no topo + <App/> (features online gateadas
 *                  via flags; LLM local continua utilizável);
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
import type { StartupStatus } from '@shared/ipc-contract';
import App from '../App';
import { getApi } from '../lib/apiBridge';
import { tSafe } from '../lib/tSafe';
import { applyOfflineFlags, type StartupFlags } from './startupState';
import { SetupView } from './SetupView';

/** Assinatura mínima do canal keys:startup-status exposto pelo preload. */
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
  return (
    <div className="gate-splash" role="status" aria-live="polite">
      <div className="gate-splash__card panel">
        <div className="gate-splash__spinner" aria-hidden="true" />
        <p className="status-text status-text--muted">{tSafe('gate.checking', 'Verificando chaves…')}</p>
      </div>
    </div>
  );
}

/** Aviso renderizado no topo do app em modo OFFLINE (ambas as chaves falharam por rede). */
export function OfflineBanner(): ReactElement {
  return (
    <div className="gate-offline-banner" role="alert">
      <strong>{tSafe('gate.offline', 'Modo offline')}</strong>
      <span>{tSafe('gate.offlineTip', 'Não foi possível validar as chaves online. As funções online estão temporariamente indisponíveis; o tutor local continua funcionando.')}</span>
    </div>
  );
}

/** Painel de erro do próprio gate (canal falhou — deveria raramente ocorrer). */
function GateError({ onRetry }: { onRetry: () => void }): ReactElement {
  return (
    <div className="gate-blocked">
      <div className="panel gate-card">
        <h1 className="panel__title">{tSafe('gate.checkError', 'Falha ao verificar as chaves')}</h1>
        <p className="status-text status-text--danger">
          {tSafe('gate.checkErrorDetail', 'Não foi possível consultar o estado das chaves de API. Verifique se o app iniciou corretamente e tente novamente.')}
        </p>
        <button type="button" className="btn btn--primary" onClick={onRetry}>
          {tSafe('gate.tryAgain', 'Tentar novamente')}
        </button>
      </div>
    </div>
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
      <div className="gate-app-offline">
        <OfflineBanner />
        <App />
      </div>
    );
  } else {
    // 'ready'
    content = <App />;
  }

  return <StartupCtx.Provider value={contextValue}>{content}</StartupCtx.Provider>;
}