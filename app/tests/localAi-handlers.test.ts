/**
 * tests/localAi-handlers.test.ts — handlers localAi:* (build puro, com fakes).
 * Foco: download emite progresso via webContents fake; list/delete/get-set active
 * delegam ao store/engine fakes; detect/recommend usam detect fake.
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
  it('detect-hardware usa o detect fake', async () => {
    const handlers = buildLocalAiHandlers({ detect: async () => HARDWARE });
    const handler = handlers.get(LOCAL_AI_CHANNELS.DETECT_HARDWARE)!;
    const res = (await handler(fakeEvent().event)) as { success: boolean; data?: HardwareInfo };
    assert.equal(res.success, true);
    assert.deepEqual(res.data, HARDWARE);
  });

  it('recommend devolve um LocalModelInfo recomendado', async () => {
    const handlers = buildLocalAiHandlers({ detect: async () => HARDWARE });
    const handler = handlers.get(LOCAL_AI_CHANNELS.RECOMMEND)!;
    const res = (await handler(fakeEvent().event)) as { success: boolean; data?: LocalModelInfo };
    assert.equal(res.success, true);
    assert.equal(res.data?.recommended, true);
  });

  it('list devolve catálogo + estado e marca active', async () => {
    const { store } = await makeFakeStore();
    await store.setActive(DEF_ID);
    const handlers = buildLocalAiHandlers({ getStore: async () => store });
    const res = (await handlers.get(LOCAL_AI_CHANNELS.LIST)!(fakeEvent().event)) as {
      success: boolean;
      data?: LocalModelInfo[];
    };
    assert.equal(res.success, true);
    assert.equal(res.data?.length, 3);
    assert.equal(res.data?.find((m) => m.id === DEF_ID)?.active, true);
  });

  it('download EMITE progresso via webContents fake', async () => {
    const { store } = await makeFakeStore();
    const handlers = buildLocalAiHandlers({ getStore: async () => store });
    const { event, sent } = fakeEvent();
    const res = (await handlers.get(LOCAL_AI_CHANNELS.DOWNLOAD)!(event, DEF_ID)) as {
      success: boolean;
      path?: string;
    };
    assert.equal(res.success, true);
    assert.ok(res.path);
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

  it('download com cancelação → success:false, cancelled:true', async () => {
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
    const res = (await handlers.get(LOCAL_AI_CHANNELS.DOWNLOAD)!(fakeEvent().event, DEF_ID)) as {
      success: boolean;
      cancelled?: boolean;
    };
    assert.equal(res.success, false);
    assert.equal(res.cancelled, true);
  });

  it('get/set-active delegam ao store', async () => {
    const { store } = await makeFakeStore();
    const handlers = buildLocalAiHandlers({ getStore: async () => store });

    const setRes = (await handlers.get(LOCAL_AI_CHANNELS.SET_ACTIVE)!(fakeEvent().event, DEF_ID)) as {
      success: boolean;
    };
    assert.equal(setRes.success, true);

    const getRes = (await handlers.get(LOCAL_AI_CHANNELS.GET_ACTIVE)!(fakeEvent().event)) as {
      success: boolean;
      data?: string;
    };
    assert.equal(getRes.success, true);
    assert.equal(getRes.data, DEF_ID);
  });

  it('delete remove do store e dá unload quando é o modelo ativo', async () => {
    const { store } = await makeFakeStore();
    let unloaded = 0;
    const engine = { ...fakeEngine(DEF_ID), unload: async () => { unloaded += 1; } };
    const handlers = buildLocalAiHandlers({
      getStore: async () => store,
      getEngine: async () => engine,
    });
    const res = (await handlers.get(LOCAL_AI_CHANNELS.DELETE)!(fakeEvent().event, DEF_ID)) as {
      success: boolean;
    };
    assert.equal(res.success, true);
    assert.equal(unloaded, 1);
    assert.equal(await store.isDownloaded(DEF_ID), false);
  });
});