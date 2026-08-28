/**
 * tests/embeddedLlmService.test.ts — fachada EmbeddedLlmService (createEmbeddedLlm).
 *
 * Onda 1 (onda1-alinhar-imports-main) converteu os imports dinâmicos deste
 * módulo para estáticos. O módulo NÃO tinha teste direto nenhum: a lógica da
 * fachada (roteamento proxy↔in-process, ciclo activeId, erros
 * LOCAL_MODEL_NOT_INSTALLED, agregação de deltas e dispose) só era alcançada
 * por e2e com modelo real. Este arquivo fixa o contrato com fakes, SEM
 * electron/binários/rede:
 *   - proxy fake (status/load/unload/chat/dispose com callLog);
 *   - getModelPath fake (resolução id→path, null quando não instalado);
 *   - oklm fake (surface node-llama-cpp injetada) para o caminho in-process.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createEmbeddedLlm } from '../electron/main/services/embeddedLlm/EmbeddedLlmService';
import type * as EmbeddedLlmModule from '../electron/main/services/embeddedLlm/EmbeddedLlmService';
import type { LlmProxyService } from '../electron/main/services/embeddedLlm/LlmProxyService';
import type { LlamaChatSessionLike, OklmSurface } from '../electron/main/services/embeddedLlm/llmEngine.process';

const MODEL_PATH = '/models/m1.gguf';

interface ChatCall {
  modelId: string;
  modelPath: string;
  prompt: string;
  contextSize?: number;
  temperature?: number;
  maxTokens?: number;
}

/** Proxy fake com callLog — satisfaz a superfície usada pela fachada. */
function makeFakeProxy(): {
  proxy: LlmProxyService;
  calls: string[];
  chatCalls: ChatCall[];
} {
  const calls: string[] = [];
  const chatCalls: ChatCall[] = [];
  const proxy = {
    async status(): Promise<unknown> {
      calls.push('status');
      return { loaded: 'proxy-loaded' };
    },
    async load(modelId: string, modelPath: string, contextSize?: number): Promise<void> {
      calls.push(`load:${modelId}:${modelPath}:${contextSize ?? ''}`);
    },
    async unload(): Promise<void> {
      calls.push('unload');
    },
    async chat(
      opts: {
        modelId: string;
        modelPath: string;
        prompt: string;
        contextSize?: number;
        temperature?: number;
        maxTokens?: number;
      },
      onDelta?: (t: string) => void,
    ): Promise<{ text: string }> {
      calls.push(`chat:${opts.modelId}:${opts.modelPath}`);
      chatCalls.push({ ...opts });
      onDelta?.('olá ');
      return { text: 'olá mundo' };
    },
    async dispose(): Promise<void> {
      calls.push('dispose');
    },
  };
  return { proxy: proxy as unknown as LlmProxyService, calls, chatCalls };
}

function makeGetModelPath(installed: string[] = []): (id: string) => Promise<string | null> {
  return async (id: string) => (installed.includes(id) ? MODEL_PATH : null);
}

/**
 * Surface oklm fake para o caminho in-process (espelha tests/llmEngine.test.ts):
 * getLlama → loadModel → createContext → getSequence → LlamaChatSession.prompt
 * com onTextChunk por chunk.
 */
function makeFakeOklm(over: { chunks?: string[]; throwOnPrompt?: boolean } = {}): {
  oklm: OklmSurface;
  callLog: string[];
} {
  const chunks = over.chunks ?? ['Olá', ' ', 'mundo'];
  const final = chunks.join('');
  const callLog: string[] = [];

  const FakeSession = class implements LlamaChatSessionLike {
    async prompt(
      _text: string,
      opts?: { onTextChunk?: (t: string) => void; temperature?: number; maxTokens?: number },
    ): Promise<string> {
      callLog.push(`prompt-opts:${opts?.temperature ?? ''}:${opts?.maxTokens ?? ''}`);
      if (over.throwOnPrompt) throw new Error('inference boom');
      for (const c of chunks) opts?.onTextChunk?.(c);
      return final;
    }
    dispose(): void {
      callLog.push('session.dispose');
    }
  };

  const oklm: OklmSurface = {
    getLlama: async () =>
      ({
        async loadModel(opts: { modelPath: string }) {
          callLog.push(`loadModel:${opts.modelPath}`);
          return {
            async createContext() {
              callLog.push('createContext');
              return {
                getSequence() {
                  callLog.push('getSequence');
                  return {};
                },
                async dispose() {
                  callLog.push('context.dispose');
                },
              };
            },
            async dispose() {
              callLog.push('model.dispose');
            },
          };
        },
      }) as never,
    LlamaChatSession: FakeSession as never,
  };
  return { oklm, callLog };
}

describe('createEmbeddedLlm: modo utility process (proxy fake)', () => {
  it('inProcess é false com forceInProcess: false e true com forceInProcess: true', () => {
    assert.equal(createEmbeddedLlm({ forceInProcess: false }).inProcess, false);
    assert.equal(createEmbeddedLlm({ forceInProcess: true }).inProcess, true);
  });

  it('status roteia para o proxy e devolve o valor do proxy', async () => {
    const { proxy, calls } = makeFakeProxy();
    const svc = createEmbeddedLlm({ proxy, getModelPath: makeGetModelPath(['m1']) });
    const out = await svc.status();
    assert.deepEqual(calls, ['status']);
    assert.deepEqual(out, { loaded: 'proxy-loaded' });
  });

  it('load resolve o caminho, chama proxy.load com (id, path, contextSize) e seta activeId', async () => {
    const { proxy, calls } = makeFakeProxy();
    const svc = createEmbeddedLlm({ proxy, getModelPath: makeGetModelPath(['m1']) });
    await svc.load('m1', 4096);
    assert.deepEqual(calls, ['load:m1:/models/m1.gguf:4096']);
    assert.equal(svc.getActive(), 'm1');
  });

  it('load com modelo não instalado → LOCAL_MODEL_NOT_INSTALLED, proxy.load NÃO é chamado', async () => {
    const { proxy, calls } = makeFakeProxy();
    const svc = createEmbeddedLlm({ proxy, getModelPath: makeGetModelPath([]) });
    await assert.rejects(() => svc.load('m2'), /LOCAL_MODEL_NOT_INSTALLED:m2/);
    assert.deepEqual(calls, []);
    assert.equal(svc.getActive(), null);
  });

  it('unload chama proxy.unload e zera activeId', async () => {
    const { proxy, calls } = makeFakeProxy();
    const svc = createEmbeddedLlm({ proxy, getModelPath: makeGetModelPath(['m1']) });
    await svc.load('m1');
    await svc.unload();
    assert.deepEqual(calls, ['load:m1:/models/m1.gguf:', 'unload']);
    assert.equal(svc.getActive(), null);
  });

  it('chat passa caminho resolvido + TODAS as options, repassa onDelta e devolve {text}', async () => {
    const { proxy, calls, chatCalls } = makeFakeProxy();
    const svc = createEmbeddedLlm({ proxy, getModelPath: makeGetModelPath(['m1']) });
    const deltas: string[] = [];
    const out = await svc.chat(
      { modelId: 'm1', prompt: 'oi', temperature: 0.5, maxTokens: 100, contextSize: 2048 },
      (t) => deltas.push(t),
    );
    assert.deepEqual(calls, ['chat:m1:/models/m1.gguf']);
    // Cada campo passado pelo renderer chega ao proxy SEM mutação/queda.
    assert.equal(chatCalls.length, 1);
    assert.deepEqual(chatCalls[0], {
      modelId: 'm1',
      modelPath: MODEL_PATH,
      prompt: 'oi',
      temperature: 0.5,
      maxTokens: 100,
      contextSize: 2048,
    });
    assert.deepEqual(deltas, ['olá ']);
    assert.deepEqual(out, { text: 'olá mundo' });
  });

  it('chat com modelo não instalado → LOCAL_MODEL_NOT_INSTALLED e proxy.chat NÃO é chamado', async () => {
    const { proxy, calls } = makeFakeProxy();
    const svc = createEmbeddedLlm({ proxy, getModelPath: makeGetModelPath([]) });
    await assert.rejects(
      () => svc.chat({ modelId: 'm2', prompt: 'oi' }),
      /LOCAL_MODEL_NOT_INSTALLED:m2/,
    );
    assert.deepEqual(calls, []);
  });

  it('dispose chama proxy.dispose e zera activeId', async () => {
    const { proxy, calls } = makeFakeProxy();
    const svc = createEmbeddedLlm({ proxy, getModelPath: makeGetModelPath(['m1']) });
    await svc.load('m1');
    await svc.dispose();
    assert.deepEqual(calls, ['load:m1:/models/m1.gguf:', 'dispose']);
    assert.equal(svc.getActive(), null);
  });
});

describe('createEmbeddedLlm: modo in-process (oklm fake)', () => {
  it('status NÃO carrega modelo (mesmo contrato do smoke do engine)', async () => {
    const { oklm, callLog } = makeFakeOklm();
    const svc = createEmbeddedLlm({
      forceInProcess: true,
      oklm,
      getModelPath: makeGetModelPath(['m1']),
    });
    const out = (await svc.status()) as Array<{ type: string; ok?: boolean; data?: unknown }>;
    assert.equal(callLog.length, 0, 'status não deve tocar o modelo');
    assert.equal(out[0].type, 'response');
    assert.equal(out[0].ok, true);
  });

  it('load carrega via oklm com o caminho resolvido, repassa contextSize e seta activeId', async () => {
    const { oklm, callLog } = makeFakeOklm();
    const svc = createEmbeddedLlm({
      forceInProcess: true,
      oklm,
      getModelPath: makeGetModelPath(['m1']),
    });
    await svc.load('m1', 4096);
    assert.ok(callLog.includes(`loadModel:${MODEL_PATH}`), callLog.join(','));
    assert.equal(svc.getActive(), 'm1');
    // O contextSize chega ao engine: o status do runtime devolve o contexto
    // efetivo (clamp entre 2048 e 16384 — 4096 passa direto).
    const status = (await svc.status()) as Array<{
      type: string;
      ok?: boolean;
      data?: { loaded?: string | null; contextSize?: number | null };
    }>;
    assert.equal(status[0].type, 'response');
    assert.equal(status[0].ok, true);
    assert.equal(status[0].data?.loaded, 'm1');
    assert.equal(status[0].data?.contextSize, 4096);
  });

  it('load com modelo não instalado → LOCAL_MODEL_NOT_INSTALLED ANTES do oklm', async () => {
    const { oklm, callLog } = makeFakeOklm();
    const svc = createEmbeddedLlm({
      forceInProcess: true,
      oklm,
      getModelPath: makeGetModelPath([]),
    });
    await assert.rejects(() => svc.load('m2'), /LOCAL_MODEL_NOT_INSTALLED:m2/);
    assert.equal(callLog.length, 0);
    assert.equal(svc.getActive(), null);
  });

  it('chat in-process: agrega deltas, chama onDelta por chunk, repassa temperature/maxTokens e devolve o texto final', async () => {
    const { oklm, callLog } = makeFakeOklm({ chunks: ['Olá', ' ', 'mundo'] });
    const svc = createEmbeddedLlm({
      forceInProcess: true,
      oklm,
      getModelPath: makeGetModelPath(['m1']),
    });
    const deltas: string[] = [];
    const out = await svc.chat(
      { modelId: 'm1', prompt: 'oi', temperature: 0.3, maxTokens: 256 },
      (t) => deltas.push(t),
    );
    assert.deepEqual(deltas, ['Olá', ' ', 'mundo']);
    assert.deepEqual(out, { text: 'Olá mundo' });
    // As options chegam ao prompt do engine (0.3 / 256).
    assert.ok(callLog.includes('prompt-opts:0.3:256'), callLog.join(','));
  });

  it('chat in-process com erro de inferência → rejeita com a mensagem do response !ok', async () => {
    const { oklm } = makeFakeOklm({ throwOnPrompt: true });
    const svc = createEmbeddedLlm({
      forceInProcess: true,
      oklm,
      getModelPath: makeGetModelPath(['m1']),
    });
    await assert.rejects(() => svc.chat({ modelId: 'm1', prompt: 'oi' }), /inference boom/);
  });

  it('unload in-process descarrega o modelo e zera activeId', async () => {
    const { oklm, callLog } = makeFakeOklm();
    const svc = createEmbeddedLlm({
      forceInProcess: true,
      oklm,
      getModelPath: makeGetModelPath(['m1']),
    });
    await svc.load('m1');
    assert.equal(svc.getActive(), 'm1');
    await svc.unload();
    assert.ok(callLog.includes('session.dispose'), callLog.join(','));
    assert.equal(svc.getActive(), null);
  });

  it('dispose em modo in-process NÃO chama proxy.dispose (guard da fachada)', async () => {
    const { oklm } = makeFakeOklm();
    const { proxy, calls } = makeFakeProxy();
    const svc = createEmbeddedLlm({
      forceInProcess: true,
      proxy,
      oklm,
      getModelPath: makeGetModelPath(['m1']),
    });
    await svc.load('m1');
    await svc.dispose();
    assert.deepEqual(calls, [], 'proxy.dispose não deve ser chamado no modo in-process');
    assert.equal(svc.getActive(), null);
  });
});

describe('createEmbeddedLlm: escape hatch STUDY_METHOD_LLM_IN_PROCESS (env no boot)', () => {
  let loadSeq = 0;

  /**
   * Reavalia o módulo com o env desejado (o flag é lido UMA vez no load —
   * EmbeddedLlmService.ts linha ~35). Import cache-busted, mesmo padrão do
   * tests/e2eStubs.test.ts; env restaurado assim que o módulo é avaliado.
   */
  async function loadModuleWithEnv(env: Record<string, string>): Promise<typeof EmbeddedLlmModule> {
    loadSeq += 1;
    const prev = new Map<string, string | undefined>();
    for (const k of Object.keys(env)) {
      prev.set(k, process.env[k]);
      process.env[k] = env[k];
    }
    try {
      const url = `../electron/main/services/embeddedLlm/EmbeddedLlmService.ts?env-${loadSeq}`;
      return (await import(url)) as typeof EmbeddedLlmModule;
    } finally {
      for (const [k, v] of prev) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  }

  it('STUDY_METHOD_LLM_IN_PROCESS=1 no boot → fachada usa o caminho in-process de produção', async () => {
    const mod = await loadModuleWithEnv({ STUDY_METHOD_LLM_IN_PROCESS: '1' });
    const { oklm, callLog } = makeFakeOklm();
    const svc = mod.createEmbeddedLlm({ oklm, getModelPath: makeGetModelPath(['m1']) });

    // Sem forceInProcess: o IN_PROCESS do boot decide — e é true.
    assert.equal(svc.inProcess, true);

    // O caminho in-process real funciona de ponta a ponta (deltas agregados).
    const deltas: string[] = [];
    const out = await svc.chat({ modelId: 'm1', prompt: 'oi' }, (t) => deltas.push(t));
    assert.deepEqual(deltas, ['Olá', ' ', 'mundo']);
    assert.deepEqual(out, { text: 'Olá mundo' });
    assert.ok(callLog.includes(`loadModel:${MODEL_PATH}`), callLog.join(','));
  });

  it('STUDY_METHOD_LLM_IN_PROCESS ausente no boot → fachada usa o proxy (default de produção)', async () => {
    delete process.env.STUDY_METHOD_LLM_IN_PROCESS;
    const mod = await loadModuleWithEnv({});
    const { proxy, calls } = makeFakeProxy();
    const svc = mod.createEmbeddedLlm({ proxy, getModelPath: makeGetModelPath(['m1']) });
    assert.equal(svc.inProcess, false);
    await svc.status();
    assert.deepEqual(calls, ['status']);
  });
});
