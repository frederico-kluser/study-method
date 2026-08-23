/**
 * Main-process supervisor for the ASR engine utility process — study-method.
 *
 * Copiado de quiet-que (electron/main/services/localStt/AsrProxyService.ts) e
 * ADAPTADO: broadcast do status no canal `stt:engine-status`, flag de dev
 * `--study-method-dev`, serviceName `study-method-asr-engine`. Forks
 * `out/main/asr-engine.js` (asrEngine.process.ts) e fala o protocolo tipado de
 * ./protocol. Um crash nativo do sherpa mata só o processo utility — o proxy
 * rejeita o que está em voo, faz broadcast de `stt:engine-status` e respawna
 * com backoff exponencial (500 ms → 8 s, máx 5 tentativas numa janela de
 * 5 min — depois, status `dead` até a próxima chamada).
 *
 * O fork entra por `utilityProcess.fork` com o caminho `out/main/asr-engine.js`
 * (bundled ao lado do entry principal). INJETADO: `fork` + `broadcast` + `now`
 * (clock) — o serviço roda em teste sem Electron e sem timers reais.
 *
 * @module electron/main/services/localStt/AsrProxyService
 */

import * as path from 'path';
import { randomUUID } from 'crypto';
import {
  isAsrEngineResponse,
  type AsrEngineRequest,
  type AsrEngineResponse,
  type AsrEngineStatusPayload,
  type WireStreamOptions,
} from './protocol';

export const READY_TIMEOUT_MS = 20_000;
export const STOP_GRACE_MS = 3_000;
export const MAX_RESPAWN_ATTEMPTS = 5;
export const RESPAWN_BASE_DELAY_MS = 500;
export const RESPAWN_MAX_DELAY_MS = 8_000;
export const CRASH_RESET_WINDOW_MS = 5 * 60_000;

/** The slice of Electron's UtilityProcess the proxy uses (fakeable in tests). */
export interface UtilityProcessLike {
  pid?: number;
  stdout?: NodeJS.ReadableStream | null;
  stderr?: NodeJS.ReadableStream | null;
  postMessage(message: unknown): void;
  kill(): boolean;
  on(event: 'message', listener: (message: unknown) => void): unknown;
  on(event: 'exit', listener: (code: number) => void): unknown;
}

export type ForkFn = (
  modulePath: string,
  args: string[],
  options: { serviceName?: string; stdio?: 'pipe' | 'ignore' | 'inherit' },
) => UtilityProcessLike;

export interface AsrProxyDeps {
  fork?: ForkFn;
  broadcast?: (payload: AsrEngineStatusPayload) => void;
  now?: () => number;
}

export type ProxyStatus = 'idle' | 'spawning' | 'ready' | 'restarting' | 'dead' | 'stopped';

/** A live streaming session's pending callbacks (partials are multi-emit). */
interface StreamHandle {
  onPartial: (text: string) => void;
  /** Resolves/rejects the startStream() ack (cleared once STREAM_STARTED lands). */
  started?: { resolve: () => void; reject: (err: Error) => void };
  /** Resolves/rejects the stopStream() final (set when stop is requested). */
  final?: { resolve: (text: string) => void; reject: (err: Error) => void };
}

const defaultFork: ForkFn = (modulePath, args, options) => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { utilityProcess } = require('electron') as typeof import('electron');
  return utilityProcess.fork(
    modulePath,
    args,
    options as Parameters<typeof utilityProcess.fork>[2],
  ) as unknown as UtilityProcessLike;
};

const defaultBroadcast = (payload: AsrEngineStatusPayload): void => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { BrowserWindow } = require('electron') as typeof import('electron');
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('stt:engine-status', payload);
    }
  } catch {
    /* no renderer up yet — status is best-effort UI sugar */
  }
};

export class AsrProxyService {
  private readonly fork: ForkFn;
  private readonly broadcast: (payload: AsrEngineStatusPayload) => void;
  private readonly now: () => number;

  private child: UtilityProcessLike | null = null;
  private _status: ProxyStatus = 'idle';
  private readonly statusListeners = new Set<(status: ProxyStatus) => void>();
  private readonly streams = new Map<string, StreamHandle>();
  private readyWaiters: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];

  private crashTimes: number[] = [];
  private stopping = false;
  private readyTimer: ReturnType<typeof setTimeout> | null = null;
  private respawnTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(deps: AsrProxyDeps = {}) {
    this.fork = deps.fork ?? defaultFork;
    this.broadcast = deps.broadcast ?? defaultBroadcast;
    this.now = deps.now ?? Date.now;
  }

  get status(): ProxyStatus {
    return this._status;
  }

  /** Há SESSÃO ativa neste momento? (respostas para `stt:model-delete`). */
  get hasActiveStreams(): boolean {
    return this.streams.size > 0;
  }

  /** Assina TODAS as transições de status, devolvendo o unsubscribe. */
  onStatusChange(listener: (status: ProxyStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  // ── Live streaming session ─────────────────────────────────────────────────

  /** Open a session; resolves once the engine has the OnlineRecognizer stream ready. */
  async startStream(
    sessionId: string,
    opts: WireStreamOptions,
    onPartial: (text: string) => void,
  ): Promise<void> {
    await this.ensureReady();
    await new Promise<void>((resolve, reject) => {
      this.streams.set(sessionId, { onPartial, started: { resolve, reject } });
      this.post({ type: 'STREAM_START', sessionId, opts });
    });
  }

  /** Feed a live PCM frame (fire-and-forget; partials arrive via onPartial). */
  pushChunk(sessionId: string, samples: Float32Array): void {
    if (!this.streams.has(sessionId)) return;
    this.post({ type: 'STREAM_CHUNK', sessionId, samples });
  }

  /** Flush + finalize a session, resolving the final transcript. */
  async stopStream(sessionId: string): Promise<string> {
    const handle = this.streams.get(sessionId);
    if (!handle) return '';
    return await new Promise<string>((resolve, reject) => {
      handle.final = { resolve, reject };
      this.post({ type: 'STREAM_STOP', sessionId });
    });
  }

  /** Abandon a session without a final transcript. */
  cancelStream(sessionId: string): void {
    if (!this.streams.delete(sessionId)) return;
    this.post({ type: 'STREAM_CANCEL', sessionId });
  }

  /** Clean shutdown for app quit: STOP, grace period, then kill. Terminal. */
  async stop(): Promise<void> {
    this.stopping = true;
    this.clearReadyTimer();
    this.clearRespawnTimer();
    this.rejectWaiters(new Error('ASR engine is stopping (app quit)'));
    this.rejectAllStreams(new Error('ASR engine is stopping (app quit)'));
    const child = this.child;
    if (!child) {
      this.setStatus('stopped');
      return;
    }
    this.post({ type: 'STOP' });
    const exited = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), STOP_GRACE_MS);
      child.on('exit', () => {
        clearTimeout(timer);
        resolve(true);
      });
    });
    if (!exited) child.kill();
    this.setStatus('stopped');
  }

  debugCrash(): void {
    this.post({ type: '__DEBUG_CRASH' });
  }

  /** Único ponto de escrita do status. */
  private setStatus(next: ProxyStatus): void {
    this._status = next;
    for (const listener of this.statusListeners) {
      try {
        listener(next);
      } catch (err) {
        console.error('[ASR-Proxy] status listener falhou:', err);
      }
    }
  }

  // ── Spawn / readiness ──────────────────────────────────────────────────────

  private ensureReady(): Promise<void> {
    if (this.stopping || this._status === 'stopped') {
      return Promise.reject(new Error('ASR engine is stopped'));
    }
    if (this._status === 'ready' && this.child) return Promise.resolve();
    const waiter = new Promise<void>((resolve, reject) => {
      this.readyWaiters.push({ resolve, reject });
    });
    if (this._status === 'idle' || this._status === 'dead') this.spawnChild();
    return waiter;
  }

  private spawnChild(): void {
    if (this.child || this.stopping) return;
    if (this._status !== 'restarting') this.setStatus('spawning');

    let child: UtilityProcessLike;
    try {
      child = this.fork(this.enginePath(), this.isDev() ? ['--study-method-dev'] : [], {
        serviceName: 'study-method-asr-engine',
        stdio: 'pipe',
      });
    } catch (err) {
      console.error('[ASR-Proxy] utilityProcess.fork failed:', err);
      this.handleCrash('fork-error');
      return;
    }

    this.child = child;
    child.stdout?.on('data', (buf: Buffer) => process.stdout.write(`[ASR-Engine] ${buf}`));
    child.stderr?.on('data', (buf: Buffer) => process.stderr.write(`[ASR-Engine!] ${buf}`));
    child.on('message', (message) => this.onMessage(child, message));
    child.on('exit', (code) => this.onExit(child, code));

    this.readyTimer = setTimeout(() => {
      console.error(`[ASR-Proxy] engine not READY within ${READY_TIMEOUT_MS}ms — killing`);
      child.kill();
    }, READY_TIMEOUT_MS);
  }

  private onEngineReady(child: UtilityProcessLike): void {
    if (child !== this.child) return; // stale
    this.clearReadyTimer();
    console.log(`[ASR-Proxy] engine ready (pid=${child.pid ?? '?'})`);
    this.setStatus('ready');
    this.broadcast({ status: 'ready' });
    const waiters = this.readyWaiters.splice(0);
    for (const waiter of waiters) waiter.resolve();
  }

  // ── Message plumbing ───────────────────────────────────────────────────────

  private onMessage(child: UtilityProcessLike, raw: unknown): void {
    if (child !== this.child) return; // stale
    if (!isAsrEngineResponse(raw)) return;
    const msg: AsrEngineResponse = raw;
    switch (msg.type) {
      case 'READY':
        this.onEngineReady(child);
        break;
      case 'STREAM_STARTED':
        this.onStreamStarted(msg);
        break;
      case 'STREAM_PARTIAL':
        this.streams.get(msg.sessionId)?.onPartial(msg.text);
        break;
      case 'STREAM_FINAL':
        this.onStreamFinal(msg);
        break;
      case 'FATAL':
        console.error('[ASR-Proxy] engine fatal:', msg.error.message);
        break;
    }
  }

  private onStreamStarted(msg: Extract<AsrEngineResponse, { type: 'STREAM_STARTED' }>): void {
    const handle = this.streams.get(msg.sessionId);
    const started = handle?.started;
    if (!started) return;
    handle.started = undefined;
    if (msg.ok) {
      started.resolve();
    } else {
      this.streams.delete(msg.sessionId);
      started.reject(new Error(msg.error.message));
    }
  }

  private onStreamFinal(msg: Extract<AsrEngineResponse, { type: 'STREAM_FINAL' }>): void {
    const handle = this.streams.get(msg.sessionId);
    this.streams.delete(msg.sessionId);
    if (!handle?.final) return;
    if (msg.ok) handle.final.resolve(msg.text);
    else handle.final.reject(new Error(msg.error.message));
  }

  private post(message: AsrEngineRequest): void {
    try {
      this.child?.postMessage(message);
    } catch (err) {
      console.error('[ASR-Proxy] postMessage failed:', err);
    }
  }

  // ── Crash / respawn ────────────────────────────────────────────────────────

  private onExit(child: UtilityProcessLike, code: number): void {
    if (child !== this.child) return; // stale
    this.child = null;
    this.clearReadyTimer();
    if (this.stopping) {
      this.setStatus('stopped');
      this.rejectAllStreams(new Error('ASR engine stopped (app quit)'));
      return;
    }
    console.error(`[ASR-Proxy] engine exited unexpectedly (code=${String(code)})`);
    this.handleCrash(String(code));
  }

  private handleCrash(codeLabel: string): void {
    const crashErr = new Error(
      `ASR_ENGINE_CRASHED: local STT engine exited unexpectedly (code ${codeLabel})`,
    );
    this.rejectAllStreams(crashErr);
    this.crashTimes.push(this.now());
    this.pruneCrashes();
    const attempt = this.crashTimes.length;

    if (attempt > MAX_RESPAWN_ATTEMPTS) {
      console.error(
        `[ASR-Proxy] engine crashed ${attempt} times within ${CRASH_RESET_WINDOW_MS / 60_000}min — giving up (next call retries)`,
      );
      this.setStatus('dead');
      this.broadcast({ status: 'dead' });
      this.rejectWaiters(new Error('ASR_ENGINE_CRASHED: local STT engine is unavailable'));
      return;
    }

    this.setStatus('restarting');
    this.broadcast({ status: 'restarting' });
    const delay = Math.min(RESPAWN_MAX_DELAY_MS, RESPAWN_BASE_DELAY_MS * 2 ** (attempt - 1));
    console.log(
      `[ASR-Proxy] respawning engine in ${delay}ms (attempt ${attempt}/${MAX_RESPAWN_ATTEMPTS})`,
    );
    this.respawnTimer = setTimeout(() => {
      this.respawnTimer = null;
      this.spawnChild();
    }, delay);
  }

  private pruneCrashes(): void {
    const cutoff = this.now() - CRASH_RESET_WINDOW_MS;
    this.crashTimes = this.crashTimes.filter((t) => t > cutoff);
  }

  private rejectAllStreams(err: Error): void {
    const handles = [...this.streams.values()];
    this.streams.clear();
    for (const handle of handles) {
      handle.started?.reject(err);
      handle.final?.reject(err);
    }
  }

  private rejectWaiters(err: Error): void {
    const waiters = this.readyWaiters.splice(0);
    for (const waiter of waiters) waiter.reject(err);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private enginePath(): string {
    // Bundled next to the main entry: out/main/index.js + out/main/asr-engine.js.
    return path.join(__dirname, 'asr-engine.js');
  }

  private isDev(): boolean {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { app } = require('electron') as typeof import('electron');
      return !app.isPackaged;
    } catch {
      return false;
    }
  }

  private clearReadyTimer(): void {
    if (this.readyTimer) {
      clearTimeout(this.readyTimer);
      this.readyTimer = null;
    }
  }

  private clearRespawnTimer(): void {
    if (this.respawnTimer) {
      clearTimeout(this.respawnTimer);
      this.respawnTimer = null;
    }
  }
}

/** App-wide singleton (the session service forks/reuses this). */
export const asrProxy = new AsrProxyService();