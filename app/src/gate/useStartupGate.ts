/**
 * src/gate/useStartupGate.ts — ESTADO do gate de início (state/view split —
 * STORY-SPEC §5): a checagem `keys.startupStatus()` com guarda de timeout e a
 * fase de ecrã derivada (decisão PURA em ./startupState.ts).
 *
 * Comportamento preservado (onda 6 + S5/W13):
 *  - `runCheck(keepContent)`: a PRIMEIRA carga mostra o splash; um RE-check
 *    ("Salvar e continuar" / "Tentar novamente") NÃO apaga o que está no ecrã
 *    — o SetupView fica montado (as chaves digitadas sobrevivem) e o App
 *    continua visível sob o banner offline até o novo veredito chegar;
 *  - `readError` distingue timeout (canal MUDO) de rejeição — splash nunca
 *    fica eterno;
 *  - `flags` (canUseOnline/canUseLocal) derivam de `applyOfflineFlags`.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { StartupStatus } from '@shared/ipc-contract';
import { getApi } from '../lib/apiBridge';
import { IPC_TIMEOUT_MS, isTimeoutError, withTimeout } from '../lib/ipcTimeout';
import {
  applyOfflineFlags,
  resolveGatePhase,
  type GatePhase,
  type GateReadError,
  type StartupFlags,
} from './startupState';

/** Assinatura mínima do canal keys:startup-status exposto pelo preload. O tipo
 * `startupStatus` NÃO está no ApiSchema (a onda 8 será dona única das adições
 * de tipo do api-schema) — até lá usamos cast, como o base fazia. */
type KeysWithStartupStatus = {
  startupStatus(): Promise<StartupStatus>;
};

export interface StartupGateState {
  /** Último resultado do gate (null antes de resolver). */
  status: StartupStatus | null;
  /** null = ok; 'rejected' = canal respondeu com erro; 'timeout' = canal MUDO. */
  readError: GateReadError;
  /** Flags de capacidade derivados (canUseOnline / canUseLocal). */
  flags: StartupFlags;
  /** Fase de ecrã (resolveGatePhase — pura). */
  phase: GatePhase;
  runCheck(keepContent?: boolean): Promise<void>;
  /** Re-check preservando o conteúdo (contrato do StartupCtx / SetupView). */
  recheck(): Promise<void>;
}

/**
 * Contexto de arranque (StartupCtx) — as features consultam via `useStartup()`
 * para saber se online/local estão liberados. Vive aqui (sem JSX) para que a
 * view pura (AppGateView → OfflineBanner) o consuma sem ciclos de módulo.
 */
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

export function useStartupGate(): StartupGateState {
  const [status, setStatus] = useState<StartupStatus | null>(null);
  const [readError, setReadError] = useState<GateReadError>(null);

  const runCheck = useCallback(async (keepContent = false) => {
    // S5/W13 (onda-ux): `keepContent` distingue a PRIMEIRA carga (splash) de um
    // RE-check (Salvar e continuar / Tentar novamente): o re-check NÃO apaga o
    // que está no ecrã (ver cabeçalho).
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

  const recheck = useCallback(() => runCheck(true), [runCheck]);

  useEffect(() => {
    void runCheck(false);
  }, [runCheck]);

  const flags = useMemo(
    () => (status ? applyOfflineFlags(status) : { canUseOnline: true, canUseLocal: true }),
    [status],
  );

  return {
    status,
    readError,
    flags,
    phase: resolveGatePhase(status, readError),
    runCheck,
    recheck,
  };
}
