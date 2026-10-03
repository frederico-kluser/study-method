/**
 * src/gate/AppGate.tsx — GATE DE INÍCIO (onda 6): CONTAINER (state/view split
 * — STORY-SPEC §5).
 *
 * Envolve o <App/> e, ao montar, consulta `keys.startupStatus()`; o export
 * público (`AppGate`, `useStartup`, `StartupCtx`, `OfflineBanner`) mantém-se —
 * main.tsx monta `<AppGate/>` e App.tsx consome `useStartup()`.
 *
 * Fases (StartupStatus.phase → resolveGatePhase, pura):
 *   - 'checking' (ou status nulo) → SPLASH com CircularProgress (gate.checking);
 *   - 'blocked'  → <SetupView onDone={recheck}/> (formulário OBRIGATÓRIO de keys);
 *   - 'offline'  → <OfflineBanner/> (Alert) no topo + <App/> (features online
 *                  gateadas via flags; LLM local continua utilizável);
 *   - 'ready'    → <App/>.
 *
 *   - estado/IPC  → ./useStartupGate.ts (+ decisão pura em ./startupState.ts);
 *   - JSX das fases → ./AppGateView.tsx (histórias + testes SSR).
 */
import { useMemo, type ReactElement } from 'react';
import App from '../App';
import { AppGateView } from './AppGateView';
import { StartupCtx, useStartupGate } from './useStartupGate';

export { OfflineBanner } from './AppGateView';
export { StartupCtx, useStartup } from './useStartupGate';
export type { StartupContextValue } from './useStartupGate';

export function AppGate(): ReactElement {
  const { status, flags, phase, recheck } = useStartupGate();

  const contextValue = useMemo(
    () => ({ status, flags, recheck }),
    [status, flags, recheck],
  );

  return (
    <StartupCtx.Provider value={contextValue}>
      <AppGateView
        phase={phase}
        app={<App />}
        onRetry={() => void recheck()}
        onSetupDone={recheck}
        startupStatus={status}
      />
    </StartupCtx.Provider>
  );
}
