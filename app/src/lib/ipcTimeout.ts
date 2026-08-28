/**
 * src/lib/ipcTimeout.ts — TIMEOUT REUTILIZÁVEL para chamadas IPC (onda 2c —
 * blindagem de "loading sem fallback").
 *
 * Regra de ouro da UI: NENHUM spinner pode girar para sempre. Se o canal IPC
 * nunca resolver (nem ok nem erro), o usuário ficaria preso num loader eterno —
 * este helper impõe um teto: passado o prazo, a chamada REJEITA com
 * `IpcTimeoutError` (identificável via `isTimeoutError`) e a UI mostra erro
 * claro + ação (retry).
 *
 * As chamadas legítimas resolvem em <100ms hoje; `IPC_TIMEOUT_MS` (10s) é
 * folgado de propósito para nunca atrapalhar o fluxo normal.
 */
export const IPC_TIMEOUT_MS = 10_000;

/** Erro identificável de timeout (testável via isTimeoutError). */
export class IpcTimeoutError extends Error {
  readonly label: string;

  constructor(label: string, ms: number) {
    super(`[timeout] "${label}" não respondeu em ${ms}ms`);
    this.name = 'IpcTimeoutError';
    this.label = label;
  }
}

/** Type guard: distingue timeout (withTimeout) de rejeição normal do canal. */
export function isTimeoutError(err: unknown): err is IpcTimeoutError {
  return err instanceof IpcTimeoutError;
}

/**
 * Corrida com o relógio: resolve com o valor da chamada, ou rejeita com
 * `IpcTimeoutError` após `ms` milissegundos. O timer é SEMPRE limpo (chamada
 * rápida não deixa timer pendurado) e a rejeição/resolução tardia da chamada
 * original é consumida pelo race — sem unhandled rejection.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new IpcTimeoutError(label, ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}
