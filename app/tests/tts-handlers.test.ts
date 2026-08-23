/**
 * tests/tts-handlers.test.ts — handlers do TTS local (onda 8).
 *
 * Testa `buildLocalTtsHandlers` com um ENGINE FALSO injetado (nunca roda o
 * binário sherpa): generate devolve um WAV de mentira; list/download/delete
 * com store fake. Cobre o envelope `{ success, data?, error? }` e a
 * preferência. Sem GPU, sem execFile real.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { TTS_CHANNELS } from '../shared/ipc-contract';
import { buildLocalTtsHandlers } from '../electron/main/ipc/localTts-handlers';

const fakeEvent = { sender: { send: () => undefined } };

/** Engine fake de geração — captura requestId/modelId e devolve um WAV falso. */
function makeFakeEngine() {
  const generated: Array<{ requestId: string; modelId: string }> = [];
  return {
    generated,
    async generate(opts: { requestId: string; modelId: string }) {
      generated.push({ requestId: opts.requestId, modelId: opts.modelId });
      // Um WAV PCM16 mono mínimo (44 header + 1 sample 16-bit).
      const wav = Buffer.alloc(46);
      wav.write('RIFF', 0, 'ascii');
      wav.write('WAVE', 8, 'ascii');
      return { wavBase64: wav.toString('base64'), sampleRate: 22050, numSamples: 1, latencyMs: 5 };
    },
    cancel: () => undefined,
  };
}

describe('buildLocalTtsHandlers (TTS local)', () => {
  it('generate devolve um WAV em base64 (envelope success)', async () => {
    const engine = makeFakeEngine();
    const map = buildLocalTtsHandlers({
      generate: engine.generate as never,
      cancel: engine.cancel as never,
    });
    const gen = map.get(TTS_CHANNELS.GENERATE)!;

    const res = (await gen(fakeEvent, {
      requestId: 'r1',
      modelId: 'piper-pt-br-faber',
      text: 'olá',
      provider: 'local',
    })) as { success: boolean; data?: { audioBase64?: string; format?: string; sampleRate?: number } };
    assert.equal(res.success, true);
    assert.ok(res.data?.audioBase64 && res.data.audioBase64.length > 0, 'WAV em base64');
    assert.equal(res.data?.format, 'wav');
    assert.equal(res.data?.sampleRate, 22050);
    assert.equal(engine.generated.length, 1);
    assert.equal(engine.generated[0].modelId, 'piper-pt-br-faber');
  });

  it('generate valida request obrigatório (requestId/modelId/text)', async () => {
    const engine = makeFakeEngine();
    const map = buildLocalTtsHandlers({
      generate: engine.generate as never,
      cancel: engine.cancel as never,
    });
    const gen = map.get(TTS_CHANNELS.GENERATE)!;
    for (const bad of [
      {},
      { requestId: 'r1', modelId: 'x', text: '' },
      { requestId: 'r1', text: 'sem model' },
    ]) {
      const res = (await gen(fakeEvent, bad)) as { success: boolean; error?: string };
      assert.equal(res.success, false);
      assert.match(res.error ?? '', /INVALID_REQUEST/);
    }
  });

  it('provider != local é rejeitado', async () => {
    const engine = makeFakeEngine();
    const map = buildLocalTtsHandlers({
      generate: engine.generate as never,
      cancel: engine.cancel as never,
    });
    const res = (await map.get(TTS_CHANNELS.GENERATE)!(
      fakeEvent,
      { requestId: 'r1', modelId: 'm', text: 'x', provider: 'cloud' },
    )) as { success: boolean; error?: string };
    assert.equal(res.success, false);
    assert.match(res.error ?? '', /UNSUPPORTED_PROVIDER/);
  });

  it('cancela a geração em voo pelo requestId', async () => {
    const engine = makeFakeEngine();
    const map = buildLocalTtsHandlers({
      generate: engine.generate as never,
      cancel: engine.cancel as never,
    });
    const res = await map.get(TTS_CHANNELS.CANCEL_GENERATE)!(fakeEvent, 'r1');
    assert.ok(res && (res as { success?: boolean }).success);
  });

  it('set/get preference persistem modelId/voice/speed', async () => {
    const engine = makeFakeEngine();
    const map = buildLocalTtsHandlers({
      generate: engine.generate as never,
      cancel: engine.cancel as never,
    });
    await map.get(TTS_CHANNELS.SET_PREFERENCE)!(fakeEvent, {
      modelId: 'piper-pt-br-faber',
      defaultVoiceId: 'faber',
      speed: 1.2,
    });
    const res = (await map.get(TTS_CHANNELS.GET_PREFERENCE)!(fakeEvent)) as {
      data?: { modelId?: string; defaultVoiceId?: string; speed?: number };
    };
    assert.equal(res.data?.modelId, 'piper-pt-br-faber');
    assert.equal(res.data?.defaultVoiceId, 'faber');
    assert.equal(res.data?.speed, 1.2);
  });
});