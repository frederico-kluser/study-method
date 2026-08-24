/**
 * electron/main/services/embeddedLlm/llmEngine.process.ts — PROCESSO UTILITY DO LLM LOCAL.
 *
 * Entry do processo utility que o LlmProxyService faz fork via
 * `utilityProcess.fork(out/main/llm-engine.js)`. O electron.vite.config.ts
 * (congelado) lista este path como entrada do build de `main`, gerando
 * out/main/llm-engine.js. Um crash nativo do llama.cpp (segfault/OOM) mata APENAS
 * este processo, não o app — o proxy o reinicia.
 *
 * Protocolo de mensagens (JSON via process.parentPort.postMessage):
 *   main → engine: { type: 'status' | 'load' | 'unload' | 'chat', ... }
 *   engine → main: { type: 'delta', text }  (streaming intermediário de chat)
 *   engine → main: { type: 'response', ok: true, data } | { type: 'response', ok: false, error }
 *
 * A resposta a 'status' NÃO carrega modelo — é a base do smoke test (prova que o
 * processo responde sem baixar/ler GGUF). `handleEngineMessage(msg, deps)` é a
 * função pura e testável: os testes usam deps fake (getLlama fake, resolver fake)
 * para verificar o protocolo SEM binários nem rede. O entry real apenas liga essa
 * função ao process.parentPort.
 *
 * node-llama-cpp 3.18 (API verificada nos .d.ts): `getLlama({ gpu: 'auto' })` →
 * `llama.loadModel({ modelPath })` (o construtor de LlamaModel é privado; a
 * fábrica é loadModel) → `model.createContext(...)` → `context.getSequence()` →
 * `new LlamaChatSession({ contextSequence })` → `session.prompt(text, { onTextChunk })`.
 */

// ── Tipos do surface node-llama-cpp que usamos (injetáveis nos testes) ──────

export interface LlamaModelLike {
  createContext(options?: { contextSize?: number | { min?: number; max?: number } }): Promise<{
    getSequence(): unknown;
    dispose(): Promise<void> | void;
  }>;
  dispose(): Promise<void> | void;
}

export interface LlamaLike {
  loadModel(options: { modelPath: string; contextSize?: number }): Promise<LlamaModelLike>;
}

export interface LlamaChatSessionLike {
  prompt(
    text: string,
    options?: {
      onTextChunk?: (chunk: string) => void;
      signal?: AbortSignal;
      maxTokens?: number;
      temperature?: number;
    },
  ): Promise<string>;
  dispose(): void;
}

/** Surface node-llama-cpp injetável (fakes nos testes). */
export interface OklmSurface {
  getLlama(options?: { gpu?: string | false }): Promise<LlamaLike>;
  LlamaChatSession: new (opts: { contextSequence: unknown }) => LlamaChatSessionLike;
}

export interface EngineDeps {
  /** Surface node-llama-cpp; default importa o pacote real sob demanda. */
  oklm?: OklmSurface;
  /** Resolve um id de catálogo para o caminho do GGUF em disco (null se não baixado). */
  modelPathResolver: (modelId: string) => Promise<string | null>;
  /** Contexto máximo de inferência (default 16384 — bug LFM2 MoE llama.cpp#16491). */
  contextSize?: number;
}

// ── Request / Response ────────────────────────────────────────────────────────

export type EngineRequest =
  | { type: 'status' }
  | { type: 'load'; modelId: string; modelPath?: string; contextSize?: number }
  | { type: 'unload' }
  | {
      type: 'chat';
      modelId: string;
      modelPath?: string;
      prompt: string;
      contextSize?: number;
      temperature?: number;
      maxTokens?: number;
    };

export type EngineOutgoing =
  | { type: 'delta'; text: string }
  | { type: 'response'; ok: true; data: unknown }
  | { type: 'response'; ok: false; error: string };

/** Constantes de contexto (alinhadas à referência electron-huu). */
const MAX_CONTEXT_SIZE = 16384;
const MIN_CONTEXT_SIZE = 2048;

/** Carrega o surface real do node-llama-cpp (lazy — ESM-only). */
async function loadRealOklm(): Promise<OklmSurface> {
  const mod = (await import('node-llama-cpp')) as unknown as {
    getLlama: (opts?: { gpu?: string | false }) => Promise<LlamaLike>;
    LlamaChatSession: new (opts: { contextSequence: unknown }) => LlamaChatSessionLike;
  };
  return { getLlama: mod.getLlama, LlamaChatSession: mod.LlamaChatSession };
}

function clampContext(size?: number, fallback = 8192): number {
  const s = size ?? fallback;
  return Math.max(MIN_CONTEXT_SIZE, Math.min(MAX_CONTEXT_SIZE, s));
}

// ── Engine (estado vivo por conjunto de deps, para isolamento em testes) ─────

interface LoadedModel {
  modelId: string;
  modelPath: string;
  contextSize: number;
  model: LlamaModelLike;
  session: LlamaChatSessionLike;
}

const runtimes = new WeakMap<object, EngineRuntime>();

class EngineRuntime {
  private llamaPromise: Promise<LlamaLike> | null = null;
  private loadPromise: Promise<unknown> | null = null;
  private loaded: LoadedModel | null = null;

  constructor(private readonly deps: EngineDeps) {}

  private oklm(): Promise<OklmSurface> {
    return this.deps.oklm ? Promise.resolve(this.deps.oklm) : loadRealOklm();
  }

  private getLlama(): Promise<LlamaLike> {
    if (!this.llamaPromise) {
      this.llamaPromise = this.oklm().then((m) => m.getLlama({ gpu: 'auto' }));
    }
    return this.llamaPromise;
  }

  /** Serializa load/unload/chat para não correr o modelo concorrentemente. */
  private async run<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.loadPromise;
    let release: (() => void) | undefined;
    this.loadPromise = new Promise<void>((res) => {
      release = () => res();
    });
    if (prev) await prev;
    try {
      return await fn();
    } finally {
      release?.();
    }
  }

  private async disposeLoaded(): Promise<void> {
    if (!this.loaded) return;
    const { session, model } = this.loaded;
    this.loaded = null;
    try {
      session.dispose();
    } catch {
      /* best-effort */
    }
    try {
      await model.dispose();
    } catch {
      /* best-effort */
    }
  }

  private async loadLocked(modelId: string, modelPath: string, contextSize: number): Promise<LoadedModel> {
    if (this.loaded && this.loaded.modelId === modelId && this.loaded.contextSize === contextSize) {
      return this.loaded;
    }
    if (this.loaded) await this.disposeLoaded();

    const surface = await this.oklm();
    const llama = await this.getLlama();
    const model = await llama.loadModel({ modelPath, contextSize });
    const context = await model.createContext({ contextSize: { min: MIN_CONTEXT_SIZE, max: contextSize } });
    const sequence = context.getSequence();
    const session = new surface.LlamaChatSession({ contextSequence: sequence });
    this.loaded = { modelId, modelPath, contextSize, model, session };
    return this.loaded;
  }

  /** Resolve o caminho do GGUF: do request (`modelPath`) ou deps.modelPathResolver. */
  private async resolvePath(msg: { modelId: string; modelPath?: string }): Promise<string> {
    if (msg.modelPath) return msg.modelPath;
    const resolved = await this.deps.modelPathResolver(msg.modelId);
    if (!resolved) throw new Error(`LOCAL_MODEL_NOT_INSTALLED:${msg.modelId}`);
    return resolved;
  }

  async handle(msg: EngineRequest): Promise<EngineOutgoing[]> {
    switch (msg.type) {
      case 'status':
        // SEM carregar modelo — base do smoke test.
        return [
          {
            type: 'response',
            ok: true,
            data: { loaded: this.loaded?.modelId ?? null, contextSize: this.loaded?.contextSize ?? null },
          },
        ];

      case 'load': {
        const contextSize = clampContext(msg.contextSize ?? this.deps.contextSize);
        try {
          const modelPath = await this.resolvePath(msg);
          const loaded = await this.run(() => this.loadLocked(msg.modelId, modelPath, contextSize));
          return [{ type: 'response', ok: true, data: { modelId: loaded.modelId, contextSize: loaded.contextSize } }];
        } catch (err) {
          return [{ type: 'response', ok: false, error: err instanceof Error ? err.message : String(err) }];
        }
      }

      case 'unload': {
        try {
          await this.run(() => this.disposeLoaded());
          return [{ type: 'response', ok: true, data: null }];
        } catch (err) {
          return [{ type: 'response', ok: false, error: err instanceof Error ? err.message : String(err) }];
        }
      }

      case 'chat': {
        return this.run(async () => {
          const contextSize = clampContext(msg.contextSize ?? this.deps.contextSize);
          const out: EngineOutgoing[] = [];
          try {
            const modelPath = await this.resolvePath(msg);
            const { session } = await this.loadLocked(msg.modelId, modelPath, contextSize);
            const text = await session.prompt(msg.prompt, {
              onTextChunk: (chunk) => {
                if (chunk) out.push({ type: 'delta', text: chunk });
              },
              temperature: msg.temperature,
              maxTokens: msg.maxTokens,
            });
            out.push({ type: 'response', ok: true, data: { text } });
            return out;
          } catch (err) {
            out.push({ type: 'response', ok: false, error: err instanceof Error ? err.message : String(err) });
            return out;
          }
        });
      }
    }
  }

  /** Libera o modelo (best-effort), sem resposta — usado no shutdown. */
  async dispose(): Promise<void> {
    try {
      await this.disposeLoaded();
    } catch {
      /* best-effort */
    }
  }
}

/** Obtém (e reuse) um runtime de engine para um dado conjunto de deps. */
function runtimeFor(deps: EngineDeps): EngineRuntime {
  let rt = runtimes.get(deps as object);
  if (!rt) {
    rt = new EngineRuntime(deps);
    runtimes.set(deps as object, rt);
  }
  return rt;
}

/**
 * Função pura e testável: processa uma EngineRequest e devolve as mensagens de
 * saída (deltas + response). O entry real liga-a ao process.parentPort. Nos
 * testes, deps fake verificam o protocolo sem binários.
 */
export async function handleEngineMessage(
  msg: EngineRequest,
  deps: EngineDeps,
): Promise<EngineOutgoing[]> {
  return runtimeFor(deps).handle(msg);
}

/** Shutdown best-effort (usado pelo STOP do proxy). */
export async function disposeEngine(deps: EngineDeps): Promise<void> {
  const rt = runtimes.get(deps as object);
  if (rt) await rt.dispose();
}

// ⚠️ ATENÇÃO: para o BUILD do electron-vite, este entry SÓ pode tocar em
// process.parentPort/Electron quando rodado como processo utility. Fora disso
// (testes / import acidental) a parte abaixo fica inerte. O listener é
// registrado SINCRONAMENTE — um utility process empacotado sai quando o entry
// retorna sem nada pendente.

function startEngineHost(): void {
  const parentPort = process.parentPort;
  const deps: EngineDeps = {
    // O proxy (main) resolve o id→path via modelStore (que usa electron.app,
    // indisponível num utility process) e envia `modelPath` nos requests.
    // Se um request chegar sem path, este resolver fallback falha claramente.
    modelPathResolver: async (modelId) => {
      throw new Error(
        `LOCAL_MODEL_NOT_INSTALLED:${modelId} — model path must be resolved main-side`,
      );
    },
  };

  const send = (msg: EngineOutgoing): void => {
    try {
      parentPort.postMessage(msg);
    } catch (err) {
      console.error('[LLM-Engine] postMessage failed:', err);
    }
  };

  parentPort.on('message', (event) => {
    const data = (event as { data?: unknown }).data;
    if (!data || typeof data !== 'object' || typeof (data as { type?: unknown }).type !== 'string') {
      return;
    }
    void handleEngineMessage(data as EngineRequest, deps).then((out) => {
      for (const m of out) send(m);
    });
  });

  // Shutdown graceful: quando o pai se desconecta, libera o modelo e sai.
  // (o proxy também kill o processo — este é o caminho limpo)
  process.on('disconnect', () => {
    void disposeEngine(deps).finally(() => process.exit(0));
  });
}

// Inerte fora de um utility process (testes / import acidental).
if (typeof process !== 'undefined' && process.parentPort) {
  startEngineHost();
}