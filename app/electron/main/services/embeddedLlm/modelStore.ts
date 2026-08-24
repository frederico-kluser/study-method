/**
 * electron/main/services/embeddedLlm/modelStore.ts — store de modelos GGUF locais.
 *
 * Possui o diretório de modelos em disco, um índice JSON (`models.index.json`)
 * dos modelos baixados, e downloads RESUMÍVEIS via `createModelDownloader` do
 * node-llama-cpp (que retoma arquivos `.part` sozinhos). `createModelStore` é
 * DI-friendly: `modelsDir`, `fs` e uma fábrica de downloader são injetáveis —
 * os testes usam um downloader fake que simula progresso e escrita sem rede.
 */
import { promises as fsp } from 'node:fs';
import * as path from 'node:path';
import type { DownloadProgress, LocalModelInfo } from '@shared/ipc-contract';
import { getLocalModelById, toLocalModelInfo } from '@shared/constants/localModels';
import { catalogAsInfo } from './recommend';

/** Registro persistido por modelo no índice. */
export interface ModelRecord {
  id: string;
  quant: string;
  hfRepo: string;
  filename?: string;
  sizeBytes: number;
  downloaded: boolean;
  sha256?: string;
  /** Caminho absoluto do GGUF em disco. */
  localPath: string;
}

/** Shape do índice em disco. */
export interface ModelsIndex {
  version: 1;
  models: Record<string, ModelRecord>;
}

/** Índice vazio (fabrica um `models` NOVO a cada chamada — nunca compartilhar a
 * sub-referência `models`, senão mutações num store vazam para outros). */
function emptyIndex(): ModelsIndex {
  return { version: 1, models: {} };
}

/** Shape mínimo do downloader do node-llama-cpp que usamos. */
export interface ModelDownloaderLike {
  download(opts?: { signal?: AbortSignal }): Promise<string>;
}

export interface CreateModelDownloaderOptions {
  modelUri: string;
  dirPath: string;
  fileName?: string;
  tokens?: { huggingFace: string };
  onProgress?: (p: { totalSize: number; downloadedSize: number }) => void;
}

/** Fábrica de downloader (injetável para testes). Default usa node-llama-cpp. */
export type DownloaderFactory = (
  deps: CreateModelDownloaderOptions,
) => Promise<ModelDownloaderLike> | ModelDownloaderLike;

/** HF access token para modelos gated (env). */
function hfTokens(): { huggingFace: string } | undefined {
  return process.env.HF_TOKEN ? { huggingFace: process.env.HF_TOKEN } : undefined;
}

export interface CreateModelStoreDeps {
  /** Diretório onde ficam os GGUFs e o índice (ex.: userData/models). */
  modelsDir: string;
  /** fs impl injetável (testes). */
  fs?: typeof fsp;
  /** Fábrica de downloader injetável (testes). Default: node-llama-cpp real. */
  downloader?: DownloaderFactory;
  /** Arquivo do índice (default 'models.index.json'). */
  indexFileName?: string;
  /** Arquivo do ativo (default 'active.json'). */
  activeFileName?: string;
}

export interface DownloadCallbacks {
  onProgress?: (p: DownloadProgress) => void;
  signal?: AbortSignal;
}

export interface ModelStore {
  /** Diretório onde os modelos vivem. */
  readonly dir: string;
  list(): Promise<LocalModelInfo[]>;
  download(id: string, cb?: DownloadCallbacks): Promise<string>;
  delete(id: string): Promise<void>;
  getActive(): Promise<string | null>;
  setActive(id: string | null): Promise<void>;
  getModelPath(id: string): Promise<string | null>;
  isDownloaded(id: string): Promise<boolean>;
}

/** Estado de download/ativação para mesclar com o catálogo no list(). */
export interface LocalModelState {
  downloaded: boolean;
  active: boolean;
  sizeBytes?: number;
}

/** Constrói um store de modelos sob o diretório dado (DI-friendly). */
export function createModelStore(deps: CreateModelStoreDeps): ModelStore {
  const fs = deps.fs ?? fsp;
  const dir = deps.modelsDir;
  const indexPath = path.join(dir, deps.indexFileName ?? 'models.index.json');
  const activePath = path.join(dir, deps.activeFileName ?? 'active.json');

  const downloader: DownloaderFactory =
    deps.downloader ??
    (async (opts: CreateModelDownloaderOptions) => {
      const { createModelDownloader } = await import('node-llama-cpp');
      return createModelDownloader(opts);
    });

  async function ensureDir(): Promise<void> {
    await fs.mkdir(dir, { recursive: true });
  }

  async function loadIndex(): Promise<ModelsIndex> {
    try {
      const raw = await fs.readFile(indexPath, "utf-8");
      const parsed = JSON.parse(raw) as ModelsIndex;
      if (!parsed || typeof parsed !== 'object' || !parsed.models) return emptyIndex();
      return parsed;
    } catch {
      return emptyIndex();
    }
  }

  async function saveIndex(index: ModelsIndex): Promise<void> {
    await ensureDir();
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  }

  async function fileExists(p: string): Promise<boolean> {
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  }

  /** Estado de um único modelo no índice (nulo se não baixado/arquivo sumiu). */
  async function getRecord(id: string): Promise<ModelRecord | null> {
    const index = await loadIndex();
    const rec = index.models[id];
    if (!rec) return null;
    if (!(await fileExists(rec.localPath))) {
      // auto-heal: arquivo removido fora → remove do índice.
      delete index.models[id];
      await saveIndex(index);
      return null;
    }
    return rec;
  }

  return {
    dir,

    async list(): Promise<LocalModelInfo[]> {
      const index = await loadIndex();
      const activeId = await this.getActive();
      const states = new Map<string, LocalModelState>();
      let mutated = false;
      for (const [id, rec] of Object.entries(index.models)) {
        if (await fileExists(rec.localPath)) {
          states.set(id, { downloaded: true, active: id === activeId, sizeBytes: rec.sizeBytes });
        } else {
          delete index.models[id];
          mutated = true;
        }
      }
      if (mutated) await saveIndex(index);
      return catalogAsInfo(null).map((info) => {
        const s = states.get(info.id);
        if (!s) return info;
        return {
          ...info,
          downloaded: s.downloaded,
          active: s.active,
          ...(s.sizeBytes !== undefined ? { sizeBytes: s.sizeBytes } : {}),
        };
      });
    },

    /**
     * Baixa um modelo do catálogo (resumível). Progresso sai via onProgress no
     * shape do contrato (transferredBytes/totalBytes/percent/speedBps/done).
     * Erros de download emitem progress com `done:true, error` e re-lançam.
     */
    async download(id: string, cb?: DownloadCallbacks): Promise<string> {
      const entry = getLocalModelById(id);
      if (!entry) {
        const err = new Error(`DOWNLOAD_ERROR: unknown local model id "${id}"`);
        cb?.onProgress?.({
          modelId: id,
          transferredBytes: 0,
          totalBytes: 0,
          percent: 0,
          speedBps: 0,
          done: true,
          error: err.message,
        });
        throw err;
      }

      // Já baixado? Retorna o caminho.
      const existing = await getRecord(id);
      if (existing) return existing.localPath;

      await ensureDir();
      let lastBytes = 0;
      let lastTs = Date.now();
      let speedBps = 0;

      let dl: ModelDownloaderLike;
      try {
        dl = await downloader({
          modelUri: entry.modelUri,
          dirPath: dir,
          fileName: entry.filename,
          tokens: hfTokens(),
          onProgress: ({ totalSize, downloadedSize }) => {
            const now = Date.now();
            const dt = (now - lastTs) / 1000;
            if (dt > 0) {
              speedBps = (downloadedSize - lastBytes) / dt;
            }
            lastBytes = downloadedSize;
            lastTs = now;
            cb?.onProgress?.({
              modelId: id,
              transferredBytes: downloadedSize,
              totalBytes: totalSize,
              percent: totalSize > 0 ? downloadedSize / totalSize : 0,
              speedBps: Math.max(0, Math.round(speedBps)),
              done: false,
            });
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        cb?.onProgress?.({
          modelId: id,
          transferredBytes: 0,
          totalBytes: 0,
          percent: 0,
          speedBps: 0,
          done: true,
          error: msg,
        });
        throw err;
      }

      let localPath: string;
      try {
        localPath = await dl.download({ signal: cb?.signal });
      } catch (err) {
        const aborted = cb?.signal?.aborted;
        const msg = aborted
          ? `DOWNLOAD_CANCELLED:${id}`
          : err instanceof Error
            ? err.message
            : String(err);
        // Arquivo parcial é mantido em disco — um download futuro retoma.
        cb?.onProgress?.({
          modelId: id,
          transferredBytes: lastBytes,
          totalBytes: 0,
          percent: 0,
          speedBps: 0,
          done: true,
          error: msg,
        });
        throw aborted ? new Error(msg) : err;
      }

      let sizeBytes = 0;
      try {
        const st = await fs.stat(localPath);
        sizeBytes = st.size;
      } catch {
        /* tamanho best-effort */
      }

      const rec: ModelRecord = {
        id,
        quant: entry.quant,
        hfRepo: entry.hfRepo,
        filename: entry.filename,
        sizeBytes,
        downloaded: true,
        localPath,
      };
      const index = await loadIndex();
      index.models[id] = rec;
      await saveIndex(index);

      cb?.onProgress?.({
        modelId: id,
        transferredBytes: sizeBytes,
        totalBytes: sizeBytes,
        percent: 1,
        speedBps: 0,
        done: true,
      });
      return localPath;
    },

    /** Remove o GGUF e o índice. Idempotente. */
    async delete(id: string): Promise<void> {
      const index = await loadIndex();
      const rec = index.models[id];
      if (rec) {
        try {
          await fs.unlink(rec.localPath);
        } catch {
          /* já removido */
        }
        delete index.models[id];
        await saveIndex(index);
      }
    },

    async getActive(): Promise<string | null> {
      try {
        const raw = await fs.readFile(activePath, 'utf-8');
        const parsed = JSON.parse(raw) as { id?: string };
        return parsed.id && parsed.id.length > 0 ? parsed.id : null;
      } catch {
        return null;
      }
    },

    async setActive(id: string | null): Promise<void> {
      await ensureDir();
      if (id) {
        await fs.writeFile(activePath, JSON.stringify({ id }, null, 2), 'utf-8');
      } else {
        try {
          await fs.unlink(activePath);
        } catch {
          /* já ausente */
        }
      }
    },

    /** Resolve o caminho do GGUF para carregar; null se não baixado. */
    async getModelPath(id: string): Promise<string | null> {
      const rec = await getRecord(id);
      return rec?.localPath ?? null;
    },

    async isDownloaded(id: string): Promise<boolean> {
      return (await this.getModelPath(id)) !== null;
    },
  };
}