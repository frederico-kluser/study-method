/**
 * electron/main/services/embeddedLlm/LlmProxyService.ts — supervisor do processo
 * utility do motor LLM local.
 *
 * Faz fork de `out/main/llm-engine.js` (llmEngine.process.ts) e fala o protocolo
 * JSON (EngineRequest/EngineOutgoing). Serializa todas as chamadas numa fila
 * única (um modelo por vez); streaming de chat chega como `delta` e é repassado
 * via callback. Se o processo morre (crash nativo do llama.cpp), damos 1 retry
 * (respawn) e, se cair de novo, rejeitamos os pendentes com
 * `LLM_ENGINE_CRASHED`.
 *
 * `dispose()` para o processo (STOP/close → kill). ESCAPE HATCH:
 * `STUDY_METHOD_LLM_IN_PROCESS=1` faz o EmbeddedLlmService rodar o motor embutido
 * no main (sem isolamento de crash) — ver EmbeddedLlmService.ts.
 */
import * as path from 'node:path';
import type { EngineOutgoing, EngineRequest } from './llmEngine.process';

const STOP_GRACE_MS = 3_000;

/** Subconjunto do Electron's UtilityProcess que o proxy usa (fakeable). */
export interface UtilityProcessLike {
  pid?: number;
  stdout?: NodeJS.ReadableStream | null;
  stderr?: NodeJS.ReadableStream | null;
  postMessage(message: unknown): void;
  kill(): boolean;
  on(event: 'message', listener: (message: unknown) => void): unknown;
  on(event: 'exit', listener: (code: number) => void): unknown;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
}

export type ForkFn = (
  modulePath: string,
  args: string[],
  options: { serviceName?: string; stdio?: 'pipe' | 'ignore' | 'inherit' },
) => UtilityProcessLike;

export interface LlmProxyDeps {
  fork?: ForkFn;
  /** Notificação de status (ex.: broadcast de engine-status à UI). */
  onStatus?: (status: ProxyStatus) => void;
  /** Caminho do bundle do motor; default resolve out/main/llm-engine.js. */
  engineEntryPath?: string;
}

export type ProxyStatus = 'idle' | 'spawning' | 'ready' | 'dead';

interface Pending {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  onDelta?: (text: string) => void;
  meta?: { type: 'load' } | { type: 'unload' };
}

const defaultFork: ForkFn = (modulePath, args, options) => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { utilityProcess } = require('electron') as typeof import('electron');
  return utilityProcess.fork(
    modulePath,
    args,
    options,
  ) as unknown as UtilityProcessLike;
};

export class LlmProxyService {
  private readonly fork: ForkFn;
  private readonly onStatus?: (s: ProxyStatus) => void;
  private readonly engineEntryPath: string;

  private child: UtilityProcessLike | null = null;
  private pending: Pending | null = null;
  private readyTimer: ReturnType<typeof setTimeout> | null = null;
  private statusVal: ProxyStatus = 'idle';
  private queue: Promise<unknown> = Promise.resolve();
  private stopping = false;

  constructor(deps: LlmProxyDeps = {}) {
    this.fork = deps.fork ?? defaultFork;
    this.onStatus = deps.onStatus;
    this.engineEntryPath =
      deps.engineEntryPath ?? resolveEngineEntryPath();
  }

  // ── API pública (serializada) ──────────────────────────────────────────────

  /** Checa se o processo responde (não carrega modelo). Base do smoke test. */
  async status(): Promise<unknown> {
    return this.run(() => this.request({ type: 'status' }));
  }

  async load(modelId: string, modelPath: string, contextSize?: number): Promise<void> {
    await this.run(async () => {
      await this.ensureChild();
      await this.request({ type: 'load', modelId, modelPath, contextSize });
    });
  }

  async unload(): Promise<void> {
    await this.run(async () => {
      if (!this.child) return; // nada a liberar
      await this.request({ type: 'unload' });
    });
  }

  async chat(
    opts: { modelId: string; modelPath: string; prompt: string; contextSize?: number; temperature?: number; maxTokens?: number },
    onDelta?: (text: string) => void,
  ): Promise<{ text: string }> {
    return (await this.run(async () => {
      await this.ensureChild();
      const result = await this.request(
        {
          type: 'chat',
          modelId: opts.modelId,
          modelPath: opts.modelPath,
          prompt: opts.prompt,
          temperature: opts.temperature,
          maxTokens: opts.maxTokens,
        },
        onDelta,
      );
      return result as { text: string };
    })) as { text: string };
  }

  /** Desliga o processo utility. Terminal. */
  async dispose(): Promise<void> {
    this.stopping = true;
    this.clearReadyTimer();
    const child = this.child;
    if (!child) {
      this.statusVal = 'dead';
      return;
    }
    try {
      child.postMessage({ type: 'unload' } satisfies EngineRequest);
    } catch {
      /* best-effort */
    }
    const exited = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), STOP_GRACE_MS);
      child.on('exit', () => {
        clearTimeout(timer);
        resolve(true);
      });
    });
    if (!exited) child.kill();
    this.child = null;
    this.statusVal = 'dead';
    this.reject(new Error('LLM engine stopped (app quit)'));
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private setStatus(s: ProxyStatus): void {
    this.statusVal = s;
    this.onStatus?.(s);
  }

  /** Anexa trabalho à fila serial (1 modelo por vez). */
  private run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private clearReadyTimer(): void {
    if (this.readyTimer) {
      clearTimeout(this.readyTimer);
      this.readyTimer = null;
    }
  }

  private enginePath(): string {
    return this.engineEntryPath;
  }

  private spawnChild(): void {
    if (this.child || this.stopping) return;
    this.setStatus('spawning');

    let child: UtilityProcessLike;
    try {
      child = this.fork(this.enginePath(), [], {
        serviceName: 'study-method-llm-engine',
        stdio: 'pipe',
      });
    } catch (err) {
      console.error('[LLM-Proxy] utilityProcess.fork failed:', err);
      this.setStatus('dead');
      this.reject(new Error('LLM_ENGINE_CRASHED: fork failed'));
      return;
    }

    this.child = child;
    // Marca se este processo já é um respawn (não o original).
    (child as unknown as { __llmRespawned?: boolean }).__llmRespawned = false;
    child.stdout?.on('data', (buf: Buffer) => process.stdout.write(`[LLM-Engine] ${buf}`));
    child.stderr?.on('data', (buf: Buffer) => process.stderr.write(`[LLM-Engine!] ${buf}`));
    child.on('message', (message) => this.onMessage(child, message));
    child.on('exit', (code) => this.onExit(child, code));
  }

  private ensureChild(): Promise<void> {
    if (this.stopping) return Promise.reject(new Error('LLM engine is stopped'));
    if (this.child && this.statusVal === 'ready') return Promise.resolve();
    this.spawnChild();
    return Promise.resolve();
  }

  /** Envia um request e aguarda a resposta do processo atual. */
  private request(msg: EngineRequest, onDelta?: (text: string) => void): Promise<unknown> {
    const child = this.child;
    if (!child) return Promise.reject(new Error('LLM_ENGINE_CRASHED: no engine process'));
    return new Promise<unknown>((resolve, reject) => {
      this.pending = { resolve, reject, onDelta };
      try {
        child.postMessage(msg);
        this.setStatus('ready'); // respondeu → assumed ready (status é leve)
      } catch (err) {
        this.pending = null;
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  private onMessage(child: UtilityProcessLike, raw: unknown): void {
    if (child !== this.child) return; // processo obsoleto
    if (!raw || typeof raw !== 'object' || !('type' in raw)) return;
    const msg = raw as EngineOutgoing;
    switch (msg.type) {
      case 'delta':
        this.pending?.onDelta?.(msg.text);
        break;
      case 'response': {
        const p = this.pending;
        this.pending = null;
        if (!p) return;
        if (msg.ok) p.resolve(msg.data);
        else p.reject(new Error(msg.error));
        break;
      }
    }
  }

  private onExit(child: UtilityProcessLike, code: number): void {
    if (child !== this.child) return;
    this.child = null;
    this.clearReadyTimer();

    if (this.stopping) {
      this.statusVal = 'dead';
      this.reject(new Error('LLM engine stopped (app quit)'));
      return;
    }

    const wasRespawned = (child as unknown as { __llmRespawned?: boolean }).__llmRespawned;
    if (wasRespawned) {
      console.error(`[LLM-Proxy] engine crashed de novo (code=${String(code)}) — desistindo`);
      this.setStatus('dead');
      this.reject(new Error(`LLM_ENGINE_CRASHED: code ${String(code)}`));
      return;
    }

    console.error(`[LLM-Proxy] engine crashou (code=${String(code)}) — respawn (1 retry)`);
    (child as unknown as { __llmRespawned?: boolean }).__llmRespawned = true;
    this.reject(new Error(`LLM_ENGINE_CRASHED: code ${String(code)}`));
    this.spawnChild();
  }

  private reject(err: Error): void {
    const p = this.pending;
    this.pending = null;
    if (p) p.reject(err);
  }
}

/** Resolve o caminho do bundle do motor (dev: em out/main; prod: recursos). */
export function resolveEngineEntryPath(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  let app: { getAppPath(): string; isPackaged: boolean } | undefined;
  try {
    app = require('electron').app as typeof app;
  } catch {
    app = undefined;
  }
  const devPath = path.join(__dirname, 'llm-engine.js');
  try {
    if (app && app.isPackaged) {
      // Em asar, utilityProcess.fork aceita caminho dentro do asar; com
      // asarUnpack (nativo), aponta para os recursos extraídos.
      const resourceEntry = path.join(
        (process.resourcesPath as string | undefined) ?? '',
        'app.asar',
        'out',
        'main',
        'llm-engine.js',
      );
      return resourceEntry;
    }
  } catch {
    /* fallback para devPath */
  }
  return devPath;
}

/** Singleton do proxy (EmbeddedLlmService usa quando NÃO em process-in-process). */
export const localLlmProxy = new LlmProxyService();