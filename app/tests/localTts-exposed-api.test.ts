/**
 * tests/localTts-exposed-api.test.ts — envelope TTS desembrulhado no preload.
 *
 * BUG DE PRODUTO corrigido: os handlers de request `localTts:*` devolvem o
 * envelope `{ success, data?, error? }` (TtsIpcResult<T> de
 * electron/main/ipc/localTts-handlers.ts), mas o ApiSchema promete o VALOR NU
 * (`generate(): Promise<TtsGenerateResult>`, `getPreference(): Promise<LocalTtsPreference>`).
 * Antes do fix o `createExposedApi` passava o invoke adiante SEM desembrulhar →
 * o consumidor (onboardingAudio.service.ts) lia `res.audioBase64` sobre o
 * envelope → `undefined` → a narração do onboarding nunca tocava.
 *
 * Estes testes provam o caminho EXPÕE AO RENDERER (o `createExposedApi` é a
 * mesma fábrica que o contextBridge usa em electron/preload/index.ts):
 *  - `generate` → `TtsGenerateResult` NU com `audioBase64` presente;
 *  - `getPreference` → `LocalTtsPreference` NU;
 *  - envelope de ERRO → REJEIÇÃO com `Error(error)` (sem valor nu possível:
 *    `Promise<T>` só pode falhar por rejeição — o que o consumidor do
 *    onboarding já apanha no try/catch "resolve em silêncio");
 *  - coerência do grupo: TODOS os canais de request `localTts:*` desembrulham;
 *  - regressão do contraste: `stt:*` mantém o envelope À VISTA (useMicSTT
 *    desembrulha no consumidor — esse caminho está correto e não pode mudar);
 *  - valores JÁ nus passam intactos (doubles de teste / mock do Storybook).
 *
 * Sem electron, sem engine: node:test + um IpcBridgeLike falso; o caso
 * end-to-end liga os handlers REAIS do main (engine/store falsos) ao exposed api.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  STT_CHANNELS,
  TTS_CHANNELS,
  type LocalTtsPreference,
  type TtsGenerateRequest,
  type TtsGenerateResult,
  type TtsModelInfo,
} from '../shared/ipc-contract';
import { createExposedApi, type IpcBridgeLike } from '../electron/preload/api-schema';
import { buildLocalTtsHandlers } from '../electron/main/ipc/localTts-handlers';
import type { SettingsStore } from '../electron/main/services/settingsStore';

/** Fake determinístico do transporte: regista cada invoke e despacha-o. */
function makeIpc(
  dispatch: (channel: string, args: unknown[]) => unknown,
): IpcBridgeLike & { invoked: Array<{ channel: string; args: unknown[] }> } {
  const invoked: Array<{ channel: string; args: unknown[] }> = [];
  return {
    invoked,
    invoke: async (channel: string, ...args: unknown[]) => {
      invoked.push({ channel, args });
      return dispatch(channel, args);
    },
    on: () => () => {},
  };
}

/** Mensagem do envelope → valor de conveniência para asserções. */
const wav: TtsGenerateResult = {
  audioBase64: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=',
  format: 'wav',
  sampleRate: 22050,
};
const pref: LocalTtsPreference = {
  modelId: 'piper-pt-br-faber',
  defaultVoiceId: 'faber',
  speed: 1.2,
};
const models: TtsModelInfo[] = [
  {
    id: 'piper-pt-br-faber',
    language: 'pt-BR',
    label: 'Piper — Portuguese (Faber)',
    embedded: true,
    installed: true,
    sampleRate: 22050,
    totalSizeBytes: 63150111,
  },
];
const genReq: TtsGenerateRequest = {
  requestId: 'r1',
  modelId: 'piper-pt-br-faber',
  text: 'olá mundo',
  provider: 'local',
};

describe('localTts no caminho exposto ao renderer (fix do envelope)', () => {
  it('generate resolve o TtsGenerateResult NU (audioBase64 presente), não o envelope', async () => {
    const ipc = makeIpc(() => ({ success: true, data: wav }));
    const api = createExposedApi(ipc);

    const res = await api.localTts.generate(genReq);

    // O valor NU: sem `.success`/`.data`, com audioBase64 direto no topo.
    assert.deepEqual(res, wav);
    assert.ok(res.audioBase64.length > 0, 'audioBase64 presente no valor exposto');
    assert.equal(res.format, 'wav');
    assert.equal(res.sampleRate, 22050);
    assert.equal('success' in res, false, 'o envelope NÃO pode vazar para o renderer');
    // O pedido chega íntegro ao transporte, no canal do contrato.
    assert.equal(ipc.invoked.length, 1);
    assert.equal(ipc.invoked[0].channel, TTS_CHANNELS.GENERATE);
    assert.deepEqual(ipc.invoked[0].args, [genReq]);
  });

  it('getPreference resolve a LocalTtsPreference NU, não o envelope', async () => {
    const ipc = makeIpc(() => ({ success: true, data: pref }));
    const api = createExposedApi(ipc);

    const res = await api.localTts.getPreference();

    assert.deepEqual(res, pref);
    assert.equal('success' in res, false, 'o envelope NÃO pode vazar para o renderer');
    assert.equal(ipc.invoked[0].channel, TTS_CHANNELS.GET_PREFERENCE);
  });

  it('envelope de ERRO rejeita com Error(error) — sem valor nu possível', async () => {
    const ipc = makeIpc(() => ({ success: false, error: 'LOCAL_TTS_ENGINE_MISSING' }));
    const api = createExposedApi(ipc);

    // Documentado: success:false → REJEIÇÃO (Promise<T> não tem T para dar).
    await assert.rejects(() => api.localTts.generate(genReq), {
      name: 'Error',
      message: 'LOCAL_TTS_ENGINE_MISSING',
    });
    await assert.rejects(() => api.localTts.getPreference(), {
      name: 'Error',
      message: 'LOCAL_TTS_ENGINE_MISSING',
    });
    await assert.rejects(() => api.localTts.setPreference(pref), {
      name: 'Error',
      message: 'LOCAL_TTS_ENGINE_MISSING',
    });
  });

  it('envelope de erro sem mensagem rejeita com o token LOCAL_TTS_ERROR', async () => {
    const ipc = makeIpc(() => ({ success: false }));
    const api = createExposedApi(ipc);
    await assert.rejects(() => api.localTts.generate(genReq), {
      name: 'Error',
      message: 'LOCAL_TTS_ERROR',
    });
  });

  it('os restantes canais de request também devolvem valor nu (coerência do grupo)', async () => {
    const results: Record<string, unknown> = {
      [TTS_CHANNELS.LIST]: { success: true, data: models },
      [TTS_CHANNELS.DOWNLOAD]: { success: true, data: { modelId: 'piper-en-amy' } },
      [TTS_CHANNELS.CANCEL_DOWNLOAD]: { success: true, data: { cancelled: true } },
      [TTS_CHANNELS.DELETE]: { success: true, data: { deleted: true } },
      [TTS_CHANNELS.CANCEL_GENERATE]: { success: true },
      [TTS_CHANNELS.SET_PREFERENCE]: { success: true },
    };
    const ipc = makeIpc((channel) => results[channel]);
    const api = createExposedApi(ipc);

    assert.deepEqual(await api.localTts.list(), models);
    assert.deepEqual(await api.localTts.download('piper-en-amy'), { modelId: 'piper-en-amy' });
    assert.deepEqual(await api.localTts.cancelDownload('piper-en-amy'), { cancelled: true });
    assert.deepEqual(await api.localTts.delete('piper-en-amy'), { deleted: true });
    // canais void (data ausente) resolvem undefined — nunca o envelope.
    assert.equal(await api.localTts.cancelGenerate('r1'), undefined);
    assert.equal(await api.localTts.setPreference(pref), undefined);
  });

  it('TODOS os canais de request localTts:* desembrulham (nenhum envelope escapa)', async () => {
    const marker = { marker: true };
    const ipc = makeIpc(() => ({ success: true, data: marker }));
    const api = createExposedApi(ipc);
    const members = (api as unknown as Record<string, Record<string, (...a: unknown[]) => unknown>>)
      .localTts;

    let checked = 0;
    for (const value of Object.values(TTS_CHANNELS)) {
      const channel: string = value;
      if (channel === TTS_CHANNELS.DOWNLOAD_PROGRESS) continue; // push, não request
      const track = channel.split(':')[1]!.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
      const member = members[track];
      assert.ok(member, `canal '${channel}' deveria expor o membro '${track}'`);
      assert.equal(await member('arg'), marker, `canal '${channel}' tem de devolver o valor NU`);
      checked += 1;
    }
    assert.equal(checked, 8, 'os 8 canais de request localTts:* entram no unwrap');
  });

  it('REGRESSÃO/contraste: stt:* mantém o envelope à vista (useMicSTT desembrulha)', async () => {
    const envelope = { success: true, data: { text: 'explicado' } };
    const ipc = makeIpc(() => envelope);
    const api = createExposedApi(ipc);

    const res = await api.stt.streamStop('s1');
    // Identidade: o consumidor lê `(res as { success, data }).data` — o preload
    // NÃO pode desembrulhar os canais stt:*.
    assert.equal(res, envelope);
    assert.equal(ipc.invoked[0].channel, STT_CHANNELS.STREAM_STOP);
  });

  it('valor JÁ nu passa intacto (doubles de teste / mock do Storybook)', async () => {
    const ipc = makeIpc((channel) => (channel === TTS_CHANNELS.GET_PREFERENCE ? pref : wav));
    const api = createExposedApi(ipc);
    assert.deepEqual(await api.localTts.generate(genReq), wav);
    assert.deepEqual(await api.localTts.getPreference(), pref);
  });

  it('end-to-end: handlers REAIS do main → valor nu no caminho do renderer', async () => {
    // Mesma fábrica do main (envelope TtsIpcResult) com engine/store falsos.
    const fakeEvent = { sender: { send: () => undefined } };
    const values: Record<string, unknown> = {};
    const fakeStore: SettingsStore = {
      getValue: async <T>(key: string) => values[key] as T | undefined,
      setValue: async (key: string, value: unknown) => {
        values[key] = value;
      },
    } as unknown as SettingsStore;
    const map = buildLocalTtsHandlers({
      generate: (async (opts: { requestId: string; modelId: string }) => {
        void opts;
        return { wavBase64: wav.audioBase64, sampleRate: wav.sampleRate, numSamples: 1, latencyMs: 5 };
      }) as never,
      cancel: (() => undefined) as never,
      getStore: async () => fakeStore,
    });

    const ipc = makeIpc((channel, args) => {
      const handler = map.get(channel);
      assert.ok(handler, `canal '${channel}' tem handler no main`);
      return handler(fakeEvent, ...args);
    });
    const api = createExposedApi(ipc);

    // generate: envelope do main → WAV nu com audioBase64 (o bug original).
    const res = await api.localTts.generate(genReq);
    assert.equal('success' in res, false);
    assert.equal(res.audioBase64, wav.audioBase64);
    assert.equal(res.format, 'wav');
    assert.equal(res.sampleRate, 22050);

    // preferência: set → get com valor NU (round-trip pelo exposed api).
    await api.localTts.setPreference(pref);
    const got = await api.localTts.getPreference();
    assert.deepEqual(got, pref);
  });
});
