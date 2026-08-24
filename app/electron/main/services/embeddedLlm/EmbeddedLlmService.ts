/**
 * electron/main/services/embeddedLlm/EmbeddedLlmService.ts — fachada pública do
 * motor LLM local no processo main.
 *
 * Roteia para UM de dois backends:
 *  - **Utility process** (default): `LlmProxyService` faz fork de
 *    out/main/llm-engine.js (isolamento de crash — um segfault do llama.cpp mata
 *    só o filho).
 *  - **In-process** (`STUDY_METHOD_LLM_IN_PROCESS=1`): `handleEngineMessage` roda
 *    o motor embutido no main (escape hatch de debug/bisect, sem isolamento).
 *
 * A resolução id→caminho do GGUF vive AQUI (o modelStore usa `electron.app`, que
 * um utility process não tem). O proxy recebe o `modelPath` já resolvido e o
 * repassa ao processo filho.
 */
import {
  handleEngineMessage,
  type EngineDeps,
  type OklmSurface,
} from './llmEngine.process';
import { LlmProxyService, localLlmProxy } from './LlmProxyService';
import { getLocalModelById } from '@shared/constants/localModels';

/** Escape hatch — lido UMA vez no boot. */
const IN_PROCESS = process.env.STUDY_METHOD_LLM_IN_PROCESS === '1';

export interface ChatOptions {
  modelId: string;
  prompt: string;
  contextSize?: number;
  temperature?: number;
  maxTokens?: number;
}

export interface EmbeddedLlmDeps {
  proxy?: LlmProxyService;
  /** modelStore para resolução de caminho (default: singleton global). */
  getModelPath?: (modelId: string) => Promise<string | null>;
  /** Surface node-llama-cpp injetável (testes / in-process debug). */
  oklm?: OklmSurface;
  forceInProcess?: boolean;
}

/** Cria a fachada do motor (DI-friendly). */
export function createEmbeddedLlm(deps: EmbeddedLlmDeps = {}): EmbeddedLlmService {
  const useInProcess = deps.forceInProcess ?? IN_PROCESS;
  const proxy = deps.proxy ?? localLlmProxy;
  const getModelPath = deps.getModelPath ?? defaultGetModelPath;
  const oklm = deps.oklm;

  // EngineDeps estável para o caminho in-process (um por instância da fachada).
  const engineDeps: EngineDeps = {
    oklm,
    modelPathResolver: getModelPath,
  };

  let activeId: string | null = null;

  return {
    get inProcess(): boolean {
      return useInProcess;
    },
    async status(): Promise<unknown> {
      if (useInProcess) return handleEngineMessage({ type: 'status' }, engineDeps);
      return proxy.status();
    },
    async load(modelId: string, contextSize?: number): Promise<void> {
      const modelPath = await getModelPath(modelId);
      if (!modelPath) throw new Error(`LOCAL_MODEL_NOT_INSTALLED:${modelId}`);
      if (useInProcess) {
        await handleEngineMessage(
          { type: 'load', modelId, modelPath, contextSize },
          engineDeps,
        );
      } else {
        await proxy.load(modelId, modelPath, contextSize);
      }
      activeId = modelId;
    },
    async unload(): Promise<void> {
      if (useInProcess) {
        await handleEngineMessage({ type: 'unload' }, engineDeps);
      } else {
        await proxy.unload();
      }
      activeId = null;
    },
    async chat(opts: ChatOptions, onDelta?: (text: string) => void): Promise<{ text: string }> {
      const modelPath = await getModelPath(opts.modelId);
      if (!modelPath) throw new Error(`LOCAL_MODEL_NOT_INSTALLED:${opts.modelId}`);
      if (useInProcess) {
        const out = await handleEngineMessage(
          {
            type: 'chat',
            modelId: opts.modelId,
            modelPath,
            prompt: opts.prompt,
            contextSize: opts.contextSize,
            temperature: opts.temperature,
            maxTokens: opts.maxTokens,
          },
          engineDeps,
        );
        let text = '';
        for (const m of out) {
          if (m.type === 'delta') {
            onDelta?.(m.text);
            text += m.text;
          } else if (m.type === 'response' && !m.ok) {
            throw new Error(m.error);
          }
        }
        return { text };
      }
      return proxy.chat(
        { modelId: opts.modelId, modelPath, prompt: opts.prompt, contextSize: opts.contextSize, temperature: opts.temperature, maxTokens: opts.maxTokens },
        onDelta,
      );
    },
    getActive(): string | null {
      return activeId;
    },
    async dispose(): Promise<void> {
      if (!useInProcess) await proxy.dispose();
      activeId = null;
    },
  };
}

export interface EmbeddedLlmService {
  readonly inProcess: boolean;
  status(): Promise<unknown>;
  load(modelId: string, contextSize?: number): Promise<void>;
  unload(): Promise<void>;
  chat(opts: ChatOptions, onDelta?: (text: string) => void): Promise<{ text: string }>;
  getActive(): string | null;
  dispose(): Promise<void>;
}

/** Resolve id→path via o catálogo + diretório de modelos do app (userData). */
function defaultGetModelPath(modelId: string): Promise<string | null> {
  return _modelDir(modelId);
}
/** Cache do store real (electron.app) — criado sob demanda. */
let _storeSingleton: { getModelPath: (id: string) => Promise<string | null> } | null = null;
async function _modelDir(modelId: string): Promise<string | null> {
  const entry = getLocalModelById(modelId);
  if (!entry) return null;
  const app = (await import('electron')).app;
  const { promises: fsp } = await import('node:fs');
  const path = await import('node:path');
  const modelsDir = path.join(app.getPath('userData'), 'models');
  const { createModelStore } = await import('./modelStore');
  if (!_storeSingleton) _storeSingleton = createModelStore({ modelsDir, fs: fsp });
  return _storeSingleton.getModelPath(modelId);
}

/** Singleton global da fachada. */
export const embeddedLlm = createEmbeddedLlm();