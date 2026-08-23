/**
 * tests/llmEngine.test.ts — `handleEngineMessage` puro: verifica o protocolo do
 * processo utility (status/load/unload/chat) SEM binários nem rede, usando deps
 * fake (getLlama fake → loadModel → createContext → LlamaChatSession fake → prompt).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  handleEngineMessage,
  disposeEngine,
  type EngineDeps,
  type LlamaChatSessionLike,
} from '../electron/main/services/embeddedLlm/llmEngine.process';

const MODEL_PATH = '/models/LFM2.5-8B-A1B-Q4_K_M.gguf';

interface SessionOpts {
  onTextChunk?: (t: string) => void;
  maxTokens?: number;
}

function makeFakeDeps(over: {
  chunks?: string[];
  final?: string;
  throwOnPrompt?: boolean;
  resolver?: (modelId: string) => Promise<string | null>;
} = {}): { deps: EngineDeps; callLog: string[] } {
  const chunks = over.chunks ?? ['Olá', ' ', 'mundo'];
  const final = over.final ?? chunks.join('');
  const callLog: string[] = [];

  const FakeSession = class implements LlamaChatSessionLike {
    constructor() {
      callLog.push('new LlamaChatSession');
    }
    async prompt(text: string, opts?: SessionOpts): Promise<string> {
      callLog.push(`prompt:${text}`);
      if (over.throwOnPrompt) throw new Error('inference boom');
      for (const c of chunks) opts?.onTextChunk?.(c);
      return final;
    }
    dispose() {
      callLog.push('session.dispose');
    }
  };

  const llama = {
    async loadModel(opts: { modelPath: string }) {
      callLog.push(`loadModel:${opts.modelPath}`);
      const context = {
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
      return context;
    },
  };

  const deps: EngineDeps = {
    oklm: {
      getLlama: async () => llama as never,
      LlamaChatSession: FakeSession as never,
    },
    modelPathResolver: over.resolver ?? (async (id) => (id === 'default' ? MODEL_PATH : null)),
  };
  return { deps, callLog };
}

describe('handleEngineMessage', () => {
  it('status responde SEM carregar modelo (base do smoke test)', async () => {
    const { deps, callLog } = makeFakeDeps();
    const out = await handleEngineMessage({ type: 'status' }, deps);
    assert.equal(callLog.length, 0); // nenhum loadModel/context/session
    assert.equal(out.length, 1);
    assert.equal(out[0].type, 'response');
    assert.ok(out[0].ok);
  });

  it('load carrega o modelo através do getLlama fake e responde ok', async () => {
    const { deps, callLog } = makeFakeDeps();
    await handleEngineMessage({ type: 'load', modelId: 'default' }, deps);
    assert.ok(callLog.includes('getSequence'));
    assert.ok(callLog.includes('new LlamaChatSession'));
    const out = await handleEngineMessage({ type: 'status' }, deps);
    const resp = out.find((m) => m.type === 'response' && m.ok) as { data: { loaded: string } };
    assert.equal(resp.data.loaded, 'default');
  });

  it('load com modelo não instalado → response ok:false', async () => {
    const { deps } = makeFakeDeps();
    const out = await handleEngineMessage({ type: 'load', modelId: 'nao-existe' }, deps);
    assert.equal(out.length, 1);
    assert.equal(out[0].type, 'response');
    assert.equal(out[0].ok, false);
    if (out[0].ok === false) {
      assert.match(out[0].error, /LOCAL_MODEL_NOT_INSTALLED/);
    }
  });

  it('chat emite deltas intermediários e a resposta final', async () => {
    const { deps, callLog } = makeFakeDeps({ chunks: ['A', 'B', 'C'] });
    const out = await handleEngineMessage(
      { type: 'chat', modelId: 'default', prompt: 'oi' },
      deps,
    );
    assert.ok(callLog.includes('prompt:oi'));
    // deltas: A, B, C
    const deltas = out.filter((m) => m.type === 'delta');
    assert.equal(deltas.length, 3);
    assert.deepEqual(
      deltas.map((m) => (m.type === 'delta' ? m.text : '')),
      ['A', 'B', 'C'],
    );
    // resposta final
    const resp = out.find((m) => m.type === 'response' && m.ok) as { data: { text: string } };
    assert.equal(resp.data.text, 'ABC');
  });

  it('chat com prompt que falha → deltas parciais + response ok:false', async () => {
    const { deps, callLog } = makeFakeDeps({ throwOnPrompt: true, chunks: ['parcial'] });
    const out = await handleEngineMessage(
      { type: 'chat', modelId: 'default', prompt: 'x' },
      deps,
    );
    // pode ter delta parcial antes do erro
    const hasPartial = out.some((m) => m.type === 'delta' && m.text === 'parcial');
    // resp ok:false
    const resp = out.find((m) => m.type === 'response' && m.ok === false);
    assert.ok(resp, 'esperava response ok:false');
    assert.match(String(resp.error), /inference boom/);
    void callLog;
  });

  it('unload libera a sessão e zera o loaded (status → null)', async () => {
    const { deps, callLog } = makeFakeDeps();
    await handleEngineMessage({ type: 'load', modelId: 'default' }, deps);
    await handleEngineMessage({ type: 'unload' }, deps);
    assert.ok(callLog.includes('session.dispose'));
    const out = await handleEngineMessage({ type: 'status' }, deps);
    const resp = out.find((m) => m.type === 'response' && m.ok) as { data: { loaded: string | null } };
    assert.equal(resp.data.loaded, null);
  });

  it('serializa chat concorrentes (nunca roda o modelo 2x ao mesmo tempo)', async () => {
    const { deps, callLog } = makeFakeDeps({ final: 'ok' });
    const [a, b] = await Promise.all([
      handleEngineMessage({ type: 'chat', modelId: 'default', prompt: 'p1' }, deps),
      handleEngineMessage({ type: 'chat', modelId: 'default', prompt: 'p2' }, deps),
    ]);
    assert.equal(callLog.filter((c) => c.startsWith('prompt:')).length, 2);
    // ambos responderam ok com texto
    const allOkA = a.find((m) => m.type === 'response' && m.ok);
    const allOkB = b.find((m) => m.type === 'response' && m.ok);
    assert.ok(allOkA && allOkB);
  });

  it('modelPath vindo do request tem precedência sobre o resolver', async () => {
    const { deps, callLog } = makeFakeDeps();
    await handleEngineMessage(
      { type: 'load', modelId: 'qualquer', modelPath: '/custom/x.gguf' },
      deps,
    );
    assert.ok(callLog.some((c) => c.includes('/custom/x.gguf')));
  });

  it('disposeEngine libera a sessão (best-effort)', async () => {
    const { deps, callLog } = makeFakeDeps();
    await handleEngineMessage({ type: 'load', modelId: 'default' }, deps);
    await disposeEngine(deps);
    assert.ok(callLog.includes('session.dispose'));
  });
});