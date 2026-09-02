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

/**
 * Timeouts por AÇÃO do renderer (onda 4 — fix W1: canais de AÇÃO com o mesmo
 * teto dos canais de leitura). A regra de cada valor: SEMPRE MAIOR que o teto
 * LEGÍTIMO do main para aquela ação (o main aborta a LLM/exec antes), de modo
 * que o timeout NUNCA corta uma resposta legítima — ele só desbloqueia o canal
 * MUDO (IPC que não resolve nem rejeita), com mensagem clara + estado limpo.
 *
 * Por canal (teto legítimo do main → timeout do renderer):
 *
 *   next (track:tutor-chat 'next') — DETERMINÍSTICO: o markdown da seção já
 *     está no arquivo da trilha, o main NÃO chama a LLM (tutorChat.ts) →
 *     10s é folga enorme (IPC_TIMEOUT_MS).
 *   answer (track:tutor-chat 'answer') — o main ABORTA a LLM em 45s
 *     (tutorChat.ts `timeoutMs: 45_000`) → 70s garante que a resposta
 *     legítima (até o abort + jitter de rede/parse) nunca é cortada.
 *   lessonDone (track:lesson-done) — persistência local (ms) → 10s.
 *   challengeSubmit (track:challenge-submit) — o main roda o código do aluno
 *     com exec `timeoutMs: 30s` (challengeExec.ts) + overhead de spawn/load
 *     da trilha → 45s cobre o teto legítimo com folga.
 *   challengeRegenerate (track:challenge-regenerate) — o main faz ATÉ 2
 *     tentativas de LLM com `timeoutMs: 60s` cada (challengeRegenerator.ts,
 *     MAX_REGEN_ATTEMPTS=2) → teto legítimo de ~120s + verificação; 150s não
 *     corta nada legítimo e ainda desbloqueia o canal mudo.
 *   keysSet (keys:set-key) — persistência local → 10s.
 *   keysValidate (keys:validate-llm/brave) — validador do main aborta em
 *     ~8s (apiKeyValidator.ts) → 10s (mesmo valor do guard da onda 2b).
 */
export const ACTION_TIMEOUTS = {
  next: IPC_TIMEOUT_MS,
  answer: 70_000,
  lessonDone: IPC_TIMEOUT_MS,
  challengeSubmit: 45_000,
  challengeRegenerate: 150_000,
  keysSet: IPC_TIMEOUT_MS,
  keysValidate: IPC_TIMEOUT_MS,
} as const;

/**
 * Normaliza o erro de um canal para o estado `string | null` da UI (fix W3).
 *
 * Invariante falsy-proof: o estado de erro da UI é `string | null` e só `null`
 * significa "sem erro". Um `error` VAZIO ('') devolvido num `ok:false` é um
 * erro VÁLIDO — o render precisa cair no ramo de erro, nunca num spinner
 * eterno. Este helper garante: ok:true → null; ok:false → o error do canal
 * (inclusive ''), ou o `fallback` quando o canal devolve sem mensagem.
 */
export function resolveChannelError(
  res: { ok: boolean; error?: string | null },
  fallback: string,
): string | null {
  if (res.ok) return null;
  return res.error ?? fallback;
}
