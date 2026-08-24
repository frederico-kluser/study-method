/**
 * tests/stt-handlers.test.ts — handlers de streaming do STT local (onda 8).
 *
 * Testa `buildSttStreamHandlers` com um PROXY FALSO (nunca toca o engine real):
 * fluxo start→chunk→stop/cancel, validações de frame/request e o envelope
 * `{ success, data?, error? }`. Sem GPU, sem sherpa, sem electron.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { STT_CHANNELS } from '../shared/ipc-contract';
import { buildSttStreamHandlers, type SttInvokeEvent } from '../electron/main/ipc/stt-handlers';
import type { WireStreamOptions } from '../electron/main/services/localStt/protocol';

const fakeEvent = (): SttInvokeEvent => ({
  sender: { send: () => undefined, isDestroyed: () => false },
});

/** Proxy fake: registra chamadas e simula o engine local. */
function makeFakeProxy() {
  const calls: {
    starts: Array<{ sessionId: string; opts: WireStreamOptions }>;
    chunks: Array<{ sessionId: string; samples: Float32Array }>;
    stops: string[];
    cancels: string[];
  } = { starts: [], chunks: [], stops: [], cancels: [] };
  let startErr: Error | null = null;
  let stopText = 'olá mundo';
  return {
    calls,
    failStart: (e: Error) => {
      startErr = e;
    },
    setStopText: (t: string) => {
      stopText = t;
    },
    startStream: async (
      sessionId: string,
      opts: WireStreamOptions,
      _onPartial: (t: string) => void,
    ) => {
      calls.starts.push({ sessionId, opts });
      if (startErr) throw startErr;
    },
    pushChunk: (sessionId: string, samples: Float32Array) => {
      calls.chunks.push({ sessionId, samples });
    },
    stopStream: async (sessionId: string) => {
      calls.stops.push(sessionId);
      return stopText;
    },
    cancelStream: (sessionId: string) => {
      calls.cancels.push(sessionId);
    },
  };
}
type FakeProxy = ReturnType<typeof makeFakeProxy>;

/** Injeta o MESMO shape de proxy que o handler espera (`typeof asrProxy`). */
function handlers(proxy: FakeProxy) {
  // `resolveModelDir` fake devolve um dir de modelo de mentira — o teste NUNCA
  // toca o store/electron reais (sem GPU, sem sherpa).
  const fakeModelDir = (
    _req: { locale: string; sessionId: string },
  ): Promise<WireStreamOptions | null> =>
    Promise.resolve({
      modelId: 'nemotron-3.5-asr-streaming-0.6b-560ms-int8',
      modelDir: '/fake/models/nemotron',
      mode: 'streaming',
      modelFiles: {
        encoder: 'encoder.int8.onnx',
        decoder: 'decoder.int8.onnx',
        joiner: 'joiner.int8.onnx',
        tokens: 'tokens.txt',
      },
      language: 'pt',
    });
  return buildSttStreamHandlers(
    proxy as unknown as Parameters<typeof buildSttStreamHandlers>[0],
    fakeModelDir as never,
  );
}

describe('buildSttStreamHandlers (streaming STT)', () => {
  it('stream-start abre a sessão com locale/hint resolvido e devolve {success}', async () => {
    const proxy = makeFakeProxy();
    const map = handlers(proxy);
    const handler = map.get(STT_CHANNELS.STREAM_START)!;

    const res = await handler(fakeEvent(), { sessionId: 'mic', locale: 'pt-BR' });
    assert.ok(res && (res as { success?: boolean }).success);
    assert.equal(proxy.calls.starts.length, 1);
    assert.equal(proxy.calls.starts[0].sessionId, 'mic');
  });

  it('stream-start sem modelo instalado devolve erro envelope (não lança)', async () => {
    const proxy = makeFakeProxy();
    const map = handlers(proxy);
    const handler = map.get(STT_CHANNELS.STREAM_START)!;
    proxy.failStart(new Error('LOCAL_STT_MODEL_NOT_INSTALLED'));

    const res = (await handler(fakeEvent(), { sessionId: 'mic', locale: 'en' })) as {
      success: boolean;
      error?: string;
    };
    assert.equal(res.success, false);
    assert.match(res.error ?? '', /MODEL_NOT_INSTALLED/);
  });

  it('stream-chunk envia um Float32Array ≤ 48000 amostras', async () => {
    const proxy = makeFakeProxy();
    const map = handlers(proxy);
    const chunk = map.get(STT_CHANNELS.STREAM_CHUNK)!;
    const samples = new Float32Array(2048);
    const res = await chunk(fakeEvent(), { sessionId: 'mic', samples });
    assert.ok(res && (res as { success?: boolean }).success);
    assert.equal(proxy.calls.chunks.length, 1);
  });

  it('stream-chunk rejeita frame vazio ou > 48000 (envelope de erro)', async () => {
    const proxy = makeFakeProxy();
    const map = handlers(proxy);
    const chunk = map.get(STT_CHANNELS.STREAM_CHUNK)!;
    const bad1 = (await chunk(fakeEvent(), { sessionId: 'mic', samples: new Float32Array(0) })) as {
      success: boolean;
    };
    const bad2 = (await chunk(fakeEvent(), {
      sessionId: 'mic',
      samples: new Float32Array(48001),
    })) as { success: boolean };
    assert.equal(bad1.success, false);
    assert.equal(bad2.success, false);
    assert.equal(proxy.calls.chunks.length, 0);
  });

  it('stream-stop devolve o texto final', async () => {
    const proxy = makeFakeProxy();
    proxy.setStopText('texto final');
    const map = handlers(proxy);
    const stop = map.get(STT_CHANNELS.STREAM_STOP)!;
    const res = (await stop(fakeEvent(), { sessionId: 'mic' })) as {
      success: boolean;
      data?: { text?: string };
    };
    assert.equal(res.success, true);
    assert.equal(res.data?.text, 'texto final');
    assert.deepEqual(proxy.calls.stops, ['mic']);
  });

  it('stream-cancel abandona a sessão', async () => {
    const proxy = makeFakeProxy();
    const map = handlers(proxy);
    const cancel = map.get(STT_CHANNELS.STREAM_CANCEL)!;
    const res = await cancel(fakeEvent(), { sessionId: 'mic' });
    assert.ok(res && (res as { success?: boolean }).success);
    assert.deepEqual(proxy.calls.cancels, ['mic']);
  });
});