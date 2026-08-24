/**
 * tests/modelStore.test.ts — store de modelos: índice, download (fake),
 * delete, get/setActive e RESUME (arquivo parcial mantido).
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import type { DownloadProgress } from '../shared/ipc-contract';
import { LOCAL_MODEL_CATALOG } from '../shared/constants/localModels';
import { createModelStore, type DownloaderFactory } from '../electron/main/services/embeddedLlm/modelStore';

const DEF_ID = 'LiquidAI/LFM2.5-8B-A1B-GGUF:Q4_K_M';

/** Estado mutável que controla o comportamento do downloader fake. */
interface FakeState {
  totalBytes: number;
  /** bytes escritos no 1º download (parcial = totalBytes/2). */
  firstChunk: number;
  /** se o 1º download deve "abortar" com DOWNLOAD_CANCELLED. */
  abortFirst: boolean;
  /** contador global de bytes já persistidos no arquivo de destino. */
  written: Map<string, number>;
}

function makeDownloaderFake(state: FakeState): DownloaderFactory {
  return async (opts) => {
    const target = path.join(opts.dirPath, opts.fileName ?? 'model.gguf');
    return {
      async download() {
        const exists = await fsp.stat(target).catch(() => null);
        const already = exists ? exists.size : 0;
        const desired = state.totalBytes;
        if (already >= desired) {
          return target; // já inteiro
        }
        await fsp.mkdir(path.dirname(target), { recursive: true });
        // download resumível: continua do que já existe até `desired`.
        const desiredEnd = state.abortFirst ? Math.min(desired, already + state.firstChunk) : desired;
        const chunk = Buffer.alloc(Math.max(0, desiredEnd - already), 0x41);
        const handle = await fsp.open(target, 'a');
        try {
          await handle.write(chunk, 0, chunk.length, already);
        } finally {
          await handle.close();
        }
        // Emite progresso intermediário (como o downloader real faz).
        opts.onProgress?.({ totalSize: desired, downloadedSize: desiredEnd });
        if (state.abortFirst && desiredEnd < desired) {
          // primeiro download para no meio (cancela) — parcial mantido.
          throw new Error('DOWNLOAD_CANCELLED:test');
        }
        return target;
      },
    };
  };
}

function newState(over: Partial<FakeState> = {}): FakeState {
  return {
    totalBytes: 100_000,
    firstChunk: 50_000,
    abortFirst: false,
    written: new Map(),
    ...over,
  };
}

const tmpDirs: string[] = [];
async function makeModelsDir(): Promise<string> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'modelstore-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(async () => {
  for (const d of tmpDirs.splice(0)) {
    await fsp.rm(d, { recursive: true, force: true });
  }
});

describe('createModelStore', () => {
  let modelsDir: string;
  beforeEach(async () => {
    modelsDir = await makeModelsDir();
  });

  it('list() devolve o catálogo com downloaded:false no início', async () => {
    const store = createModelStore({ modelsDir });
    const list = await store.list();
    assert.equal(list.length, 3);
    for (const m of list) {
      assert.equal(m.downloaded, false);
      assert.equal(m.active, false);
    }
  });

  it('download() progresso + índice + getModelPath (fake)', async () => {
    const state = newState();
    const store = createModelStore({ modelsDir, downloader: makeDownloaderFake(state) });
    const progress: DownloadProgress[] = [];
    const p = await store.download(DEF_ID, {
      onProgress: (pr) => progress.push(pr),
    });
    assert.ok(p.endsWith('LFM2.5-8B-A1B-Q4_K_M.gguf'));
    assert.ok((await fsp.stat(p)).size === state.totalBytes);

    // progress inicial não-done
    assert.ok(progress.some((x) => x.modelId === DEF_ID && x.done === false));
    // progress done no fim
    assert.equal(progress.at(-1)?.done, true);
    assert.equal(progress.at(-1)?.percent, 1);

    // índice
    assert.equal(await store.isDownloaded(DEF_ID), true);
    assert.equal(await store.getModelPath(DEF_ID), p);

    // list() reflete downloaded
    const list = await store.list();
    assert.equal(list.find((m) => m.id === DEF_ID)?.downloaded, true);
  });

  it('download() idempotente se já baixado', async () => {
    const state = newState();
    const store = createModelStore({ modelsDir, downloader: makeDownloaderFake(state) });
    const p1 = await store.download(DEF_ID);
    const p2 = await store.download(DEF_ID);
    assert.equal(p1, p2);
  });

  it('download() de id desconhecido → erro + progress com error', async () => {
    const state = newState();
    const store = createModelStore({ modelsDir, downloader: makeDownloaderFake(state) });
    const progress: DownloadProgress[] = [];
    await assert.rejects(
      () => store.download('desconhecido:x', { onProgress: (pr) => progress.push(pr) }),
      /unknown local model id/,
    );
    const last = progress.at(-1);
    assert.equal(last?.done, true);
    assert.ok(last?.error);
  });

  it('delete() remove o arquivo, o índice e zera o estado', async () => {
    const state = newState();
    const store = createModelStore({ modelsDir, downloader: makeDownloaderFake(state) });
    const p = await store.download(DEF_ID);
    await store.delete(DEF_ID);
    await assert.rejects(() => fsp.stat(p));
    assert.equal(await store.isDownloaded(DEF_ID), false);
    const list = await store.list();
    assert.equal(list.find((m) => m.id === DEF_ID)?.downloaded, false);
  });

  it('get/setActive persistência via active.json', async () => {
    const store = createModelStore({ modelsDir });
    assert.equal(await store.getActive(), null);
    await store.setActive(DEF_ID);
    assert.equal(await store.getActive(), DEF_ID);
    await store.setActive(null);
    assert.equal(await store.getActive(), null);
  });

  it('RESUME: primeiro download para no meio e mantém o parcial; o segundo completa', async () => {
    // 1º: baixa metade e cancela (throw DOWNLOAD_CANCELLED) — parcial fica.
    const state = newState({ abortFirst: true, firstChunk: 50_000, totalBytes: 100_000 });
    const store = createModelStore({ modelsDir, downloader: makeDownloaderFake(state) });

    await assert.rejects(() => store.download(DEF_ID), /DOWNLOAD_CANCELLED/);
    // sem registro de completo no índice
    assert.equal(await store.isDownloaded(DEF_ID), false);

    const partialPath = path.join(modelsDir, 'LFM2.5-8B-A1B-Q4_K_M.gguf');
    const partialSize = (await fsp.stat(partialPath)).size;
    assert.equal(partialSize, 50_000); // parcial mantido

    // 2º: mesmo store → downloader retoma do que já existe (não re-baixa a 1ª metade).
    const p2 = await store.download(DEF_ID);
    assert.equal((await fsp.stat(p2)).size, 100_000);
    assert.equal(await store.isDownloaded(DEF_ID), true);
  });

  it('catálogo expõe default/fallback/3 entradas', () => {
    assert.equal(LOCAL_MODEL_CATALOG.length, 3);
    const def = LOCAL_MODEL_CATALOG.find((m) => m.isDefault);
    const small = LOCAL_MODEL_CATALOG.find((m) => m.isSmallFallback);
    assert.equal(def?.id, 'LiquidAI/LFM2.5-8B-A1B-GGUF:Q4_K_M');
    assert.equal(small?.id, 'LiquidAI/LFM2-1.2B-GGUF:Q4_K_M');
  });
});