/**
 * tests/localAi-handlers.test.ts — handlers localAi:* (build puro, com fakes).
 * Foco: download emite progresso via webContents fake; list/delete/get-set active
 * delegam ao store/engine fakes; detect/recommend usam detect fake.
 *
 * CONTRATO DE SHAPE: cada handler devolve o valor NU do contrato em sucesso
 * (HardwareInfo, LocalModelInfo, LocalModelInfo[], string|null, {ok}, {text}) —
 * o preload repassa o invoke cru, sem unwrap. Erros LANÇAM (rejeição do invoke).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { promises as fsp } from 'node:fs';
import * as os from 'node:os';

import type { HardwareInfo, LocalModelInfo } from '../shared/ipc-contract';
import { LOCAL_AI_CHANNELS } from '../shared/ipc-contract';
import {
  buildLocalAiHandlers,
  type LlmLike,
} from '../electron/main/ipc/localAi-handlers';
import { createModelStore, type ModelStore } from '../electron/main/services/embeddedLlm/modelStore';

const DEF_ID = 'LiquidAI/LFM2.5-8B-A1B-GGUF:Q4_K_M';

/** Store fake sobre disco temporário (usa modelStore real, sem rede). */
async function makeFakeStore(): Promise<{ store: ModelStore; dir: string }> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'localai-test-'));
  const store = createModelStore({
    modelsDir: dir,
    downloader: async (opts) => {
      const target = path.join(opts.dirPath, opts.fileName ?? 'model.gguf');
      return {
        async download() {
          await fsp.mkdir(path.dirname(target), { recursive: true });
          await fsp.writeFile(target, Buffer.alloc(4096, 0x42));
          // emite progresso
          opts.onProgress?.({ totalSize: 4096, downloadedSize: 4096 });
          return target;
        },
      };
    },
  });
  return { store, dir };
}

function fakeEngine(active: string | null): LlmLike {
  return {
    load: async () => {},
    unload: async () => {},
    chat: async () => ({ text: '' }),
    status: async () => ({}),
    getActive: () => active,
  };
}

function fakeEvent() {
  const sent: Array<{ channel: string; args: unknown[] }> = [];
  return {
    sent,
    event: {
      sender: {
        isDestroyed: () => false,
        send: (channel: string, ...args: unknown[]) => sent.push({ channel, args }),
      },
    },
  };
}

const HARDWARE: HardwareInfo = { backend: 'CPU', ramGb: 16, vramGb: null, cpuModel: 'x' };

describe('buildLocalAiHandlers (puro, fakes)', () => {
  it('detect-hardware devolve HardwareInfo DIRETO (sem envelope)', async () => {
    const handlers = buildLocalAiHandlers({ detect: async () => HARDWARE });
    const handler = handlers.get(LOCAL_AI_CHANNELS.DETECT_HARDWARE)!;
    const res = (await handler(fakeEvent().event)) as HardwareInfo;
    assert.deepEqual(res, HARDWARE);
    assert.equal(Object.prototype.hasOwnProperty.call(res, 'success'), false);
  });

  it('recommend devolve um LocalModelInfo recomendado DIRETO', async () => {
    const handlers = buildLocalAiHandlers({ detect: async () => HARDWARE });
    const handler = handlers.get(LOCAL_AI_CHANNELS.RECOMMEND)!;
    const res = (await handler(fakeEvent().event)) as LocalModelInfo;
    assert.equal(res.recommended, true);
    assert.ok(res.id && res.label, 'deve ser um LocalModelInfo');
    assert.equal(Object.prototype.hasOwnProperty.call(res, 'success'), false);
  });

  it('list devolve LocalModelInfo[] DIRETO (catálogo + active)', async () => {
    const { store } = await makeFakeStore();
    await store.setActive(DEF_ID);
    const handlers = buildLocalAiHandlers({ getStore: async () => store });
    const res = (await handlers.get(LOCAL_AI_CHANNELS.LIST)!(fakeEvent().event)) as LocalModelInfo[];
    assert.ok(Array.isArray(res), 'list deve devolver ARRAY');
    assert.equal(res.length, 3);
    assert.equal(res.find((m) => m.id === DEF_ID)?.active, true);
    assert.equal(Object.prototype.hasOwnProperty.call(res, 'success'), false);
  });

  it('download EMITE progresso via webContents fake e devolve {ok}', async () => {
    const { store } = await makeFakeStore();
    const handlers = buildLocalAiHandlers({ getStore: async () => store });
    const { event, sent } = fakeEvent();
    const res = (await handlers.get(LOCAL_AI_CHANNELS.DOWNLOAD)!(event, DEF_ID)) as {
      ok: boolean;
      path?: string;
    };
    // o retorno NU é {ok}; a UI ignora e lê o progresso pelo evento.
    assert.equal(res.ok, true);
    assert.ok(res.path);
    assert.equal(Object.prototype.hasOwnProperty.call(res, 'success'), false);
    // o fake do downloader emite onProgress uma vez → deve ter ido ao webContents
    const progressMsg = sent.find((s) => s.channel === LOCAL_AI_CHANNELS.DOWNLOAD_PROGRESS);
    assert.ok(progressMsg, 'esperava evento download-progress');
    const progress = progressMsg.args[0] as {
      modelId: string;
      transferredBytes: number;
      percent: number;
    };
    assert.equal(progress.modelId, DEF_ID);
    assert.equal(progress.transferredBytes, 4096);
  });

  it('download com cancelação → REJEITA (throw, padrão study)', async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'localai-cancel-'));
    const store = createModelStore({
      modelsDir: dir,
      downloader: async () => ({
        async download() {
          throw new Error(`DOWNLOAD_CANCELLED:${DEF_ID}`);
        },
      }),
    });
    const handlers = buildLocalAiHandlers({ getStore: async () => store });
    const p = handlers.get(LOCAL_AI_CHANNELS.DOWNLOAD)!(fakeEvent().event, DEF_ID);
    await assert.rejects(p, (err: unknown) => String((err as Error)?.message).includes('DOWNLOAD_CANCELLED'));
  });

  it('get/set-active delegam ao store (nu: string|null e {ok})', async () => {
    const { store } = await makeFakeStore();
    const handlers = buildLocalAiHandlers({ getStore: async () => store });

    const setRes = (await handlers.get(LOCAL_AI_CHANNELS.SET_ACTIVE)!(fakeEvent().event, DEF_ID)) as {
      ok: boolean;
    };
    assert.equal(setRes.ok, true);
    assert.equal(Object.prototype.hasOwnProperty.call(setRes, 'success'), false);

    const getRes = (await handlers.get(LOCAL_AI_CHANNELS.GET_ACTIVE)!(fakeEvent().event)) as
      | string
      | null;
    assert.equal(getRes, DEF_ID);
  });

  it('delete remove do store e dá unload quando é o modelo ativo; devolve {ok}', async () => {
    const { store } = await makeFakeStore();
    let unloaded = 0;
    const engine = { ...fakeEngine(DEF_ID), unload: async () => { unloaded += 1; } };
    const handlers = buildLocalAiHandlers({
      getStore: async () => store,
      getEngine: async () => engine,
    });
    const res = (await handlers.get(LOCAL_AI_CHANNELS.DELETE)!(fakeEvent().event, DEF_ID)) as {
      ok: boolean;
    };
    assert.equal(res.ok, true);
    assert.equal(Object.prototype.hasOwnProperty.call(res, 'success'), false);
    assert.equal(unloaded, 1);
    assert.equal(await store.isDownloaded(DEF_ID), false);
  });
});

describe('localAi:chat (inferência do modelo local como avaliador)', () => {
  it('usa engine fake com modelId explícito e devolve {text} DIRETO', async () => {
    let lastPrompt = '';
    const engine = {
      ...fakeEngine(null),
      chat: async (opts: { modelId: string; prompt: string }) => {
        lastPrompt = opts.prompt;
        return { text: `avaliação de ${opts.modelId}` };
      },
    };
    const handlers = buildLocalAiHandlers({ getEngine: async () => engine });
    const res = (await handlers.get(LOCAL_AI_CHANNELS.CHAT)!(fakeEvent().event, {
      modelId: DEF_ID,
      prompt: 'corrija',
    })) as { text: string };
    assert.deepEqual(res, { text: `avaliação de ${DEF_ID}` });
    assert.equal(lastPrompt, 'corrija');
    assert.equal(Object.prototype.hasOwnProperty.call(res, 'success'), false);
  });

  it('sem modelId → cai para o modelo ATIVO do store fake e devolve {text}', async () => {
    const { store } = await makeFakeStore();
    await store.setActive(DEF_ID);
    const engine = {
      ...fakeEngine(null),
      chat: async (opts: { modelId: string }) => ({ text: `avaliação de ${opts.modelId}` }),
    };
    const handlers = buildLocalAiHandlers({
      getStore: async () => store,
      getEngine: async () => engine,
    });
    const res = (await handlers.get(LOCAL_AI_CHANNELS.CHAT)!(fakeEvent().event, {
      prompt: 'p',
    })) as { text: string };
    assert.deepEqual(res, { text: `avaliação de ${DEF_ID}` });
  });

  it('NENHUM modelo ativo → REJEITA (throw p/ o renderer capturar)', async () => {
    const { store } = await makeFakeStore();
    const handlers = buildLocalAiHandlers({
      getStore: async () => store,
      getEngine: async () => fakeEngine(null),
    });
    const p = handlers.get(LOCAL_AI_CHANNELS.CHAT)!(fakeEvent().event, { prompt: 'p' });
    await assert.rejects(p, (err: unknown) =>
      String((err as Error)?.message).includes('Nenhum modelo local ativo'),
    );
  });

  it('prompt vazio → REJEITA, sem chamar o engine', async () => {
    let called = false;
    const engine = {
      ...fakeEngine(null),
      chat: async () => {
        called = true;
        return { text: 'x' };
      },
    };
    const handlers = buildLocalAiHandlers({ getEngine: async () => engine });
    const p = handlers.get(LOCAL_AI_CHANNELS.CHAT)!(fakeEvent().event, {
      modelId: DEF_ID,
      prompt: '   ',
    });
    await assert.rejects(p, (err: unknown) =>
      String((err as Error)?.message).includes('Prompt vazio'),
    );
    assert.equal(called, false);
  });

  it('modelo baixado ausente → REJEITA com hint de volta ao OpenRouter', async () => {
    const { store } = await makeFakeStore();
    const engine = {
      ...fakeEngine(null),
      chat: async () => {
        throw new Error(`LOCAL_MODEL_NOT_INSTALLED:${DEF_ID}`);
      },
    };
    const handlers = buildLocalAiHandlers({
      getStore: async () => store,
      getEngine: async () => engine,
    });
    const p = handlers.get(LOCAL_AI_CHANNELS.CHAT)!(fakeEvent().event, {
      modelId: DEF_ID,
      prompt: 'p',
    });
    await assert.rejects(p, (err: unknown) => {
      const msg = String((err as Error)?.message);
      return msg.includes('OpenRouter') && msg.includes('LOCAL_MODEL_NOT_INSTALLED');
    });
  });
});