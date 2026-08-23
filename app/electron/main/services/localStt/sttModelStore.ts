/**
 * Local STT model store (NVIDIA Nemotron via sherpa-onnx) — study-method.
 *
 * Copiado de quiet-que (electron/main/services/localStt/sttModelStore.ts), SEM o
 * ponteiro cloud (o study-method não tem backend de downloads além do espelho
 * público). A URL de cada asset vem direto do catálogo embutido
 * (`buildSttAssetUrl`), com override de dev via `STUDY_METHOD_STT_MIRROR_BASE`.
 * O sha256 do CATÁLOGO continua sendo a âncora de confiança de cada byte baixado.
 *
 * DIFERENÇA vs o espelho quiet-que: este módulo NÃO importa `electron` — o
 * caminho do userData, o `fetch` e o relógio são INJETADOS por
 * `createSttModelStore` (o módulo roda em teste com um tmpdir e um fetch fake).
 *
 * Owns the on-disk STT model directory under userData, a JSON index of installed
 * models, and per-file resumable downloads from the public asset mirror.
 *
 * NESTA ONDA o modelo viaja EMBUTIDO: `embeddedModelsPath` (DI — quem injeta é
 * o `sttLocalService` com `app.getAppPath()/resources` em dev e
 * `process.resourcesPath` empacotado) com o layout
 * `<embeddedModelsPath>/stt-models/<modelId>/`. Embutido ⇒ instalado em TODAS
 * as portas e o `deleteModel` RECUSA com `LOCAL_STT_EMBEDDED_NOT_DELETABLE`.
 * NENHUMA escrita acontece no diretório embutido em runtime.
 *
 * @module electron/main/services/localStt/sttModelStore
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { createHash } from 'crypto';
import { createReadStream, createWriteStream } from 'fs';
import {
  STT_MODEL_CATALOG,
  buildSttAssetUrl,
  type SttModelEntry,
  type SttModelFile,
} from './sttModels.constants';

const dlLog = {
  info: (msg: string): void => console.log(`[SttModelStore] ${msg}`),
  warn: (msg: string): void => console.warn(`[SttModelStore] ⚠️ ${msg}`),
};

function humanBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  return `${v.toFixed(u === 0 || v >= 100 ? 0 : 1)} ${units[u]}`;
}

export interface InstalledSttModelRecord {
  id: string;
  /** Absolute path of the model directory (all files live flat inside). */
  dirPath: string;
  sizeBytes: number;
  downloadedAt: string;
  lastUsedAt?: string;
}

export interface SttDownloadProgress {
  modelId: string;
  downloaded: number;
  total: number;
  pct: number;
  /** Name of the file currently downloading (UI detail line). */
  currentFile?: string;
}

export interface SttModelStoreDeps {
  /** Absolute path of the userData dir — the models live under `stt-models/`. */
  userDataPath: string;
  /**
   * Absolute path of the EMBEDDED resources dir (dev: `<repo>/resources`;
   * packaged: `process.resourcesPath`). The bundled model lives under
   * `<embeddedModelsPath>/stt-models/<modelId>/` and is resolved BEFORE the
   * userData copy. Optional: without it the store behaves as before (userData
   * only).
   */
  embeddedModelsPath?: string;
  /** Injected fetch (tests fake it; defaults to the global). */
  fetchFn?: typeof fetch;
  /** Injected clock for index timestamps (defaults to Date.now). */
  now?: () => Date;
  /** Injected catalogue (tests shrink it; defaults to the shipped catalog). */
  catalog?: SttModelEntry[];
}

export interface SttModelStore {
  listInstalled(): Promise<InstalledSttModelRecord[]>;
  isInstalled(modelId: string): Promise<boolean>;
  /** Resolves the model directory for loading, null if not installed. */
  getModelDirForLoad(modelId: string): Promise<string | null>;
  /** Downloads a catalogue model (all files) with aggregate progress. Idempotent. */
  downloadModel(
    modelId: string,
    onProgress?: (p: SttDownloadProgress) => void,
  ): Promise<InstalledSttModelRecord>;
  /** Stops an in-progress download; `.part` files are kept for resume. */
  cancelDownload(modelId: string): boolean;
  /** Deletes a model directory and removes it from the index. REFUSES embedded. */
  deleteModel(modelId: string): Promise<void>;
  /** Catalogue + installed status. `installed` = embedded OR userData. */
  getCatalogWithStatus(): Promise<
    Array<SttModelEntry & { installed: boolean; embedded: boolean }>
  >;
}

interface SttModelsIndex {
  version: 1;
  models: Record<string, InstalledSttModelRecord>;
}

export function createSttModelStore(deps: SttModelStoreDeps): SttModelStore {
  const userDataPath = deps.userDataPath;
  const embeddedModelsPath = deps.embeddedModelsPath;
  const fetchFn = deps.fetchFn ?? fetch;
  const now = deps.now ?? (() => new Date());
  const catalog = deps.catalog ?? STT_MODEL_CATALOG;

  const sttModelsDir = (): string => path.join(userDataPath, 'stt-models');
  const indexPath = (): string => path.join(sttModelsDir(), 'stt-models.index.json');
  const modelDir = (modelId: string): string => path.join(sttModelsDir(), modelId);
  const assetDestPath = (modelId: string, file: SttModelFile): string =>
    path.join(modelDir(modelId), file.name);

  const embeddedModelDir = (modelId: string): string | null =>
    embeddedModelsPath ? path.join(embeddedModelsPath, 'stt-models', modelId) : null;

  const getSttModelById = (id: string | undefined): SttModelEntry | undefined =>
    id ? catalog.find((m) => m.id === id) : undefined;

  const mirrorBase = (): string | undefined =>
    process.env.STUDY_METHOD_STT_MIRROR_BASE || undefined;

  const loadIndex = async (): Promise<SttModelsIndex> => {
    try {
      const raw = await fs.readFile(indexPath(), 'utf-8');
      const parsed = JSON.parse(raw) as SttModelsIndex;
      if (!parsed || typeof parsed !== 'object' || !parsed.models) {
        return { version: 1, models: {} };
      }
      return parsed;
    } catch {
      return { version: 1, models: {} };
    }
  };

  const saveIndex = async (index: SttModelsIndex): Promise<void> => {
    await fs.mkdir(sttModelsDir(), { recursive: true });
    await fs.writeFile(indexPath(), JSON.stringify(index, null, 2), 'utf-8');
  };

  const fileSize = async (p: string): Promise<number | null> => {
    try {
      return (await fs.stat(p)).size;
    } catch {
      return null;
    }
  };

  const sha256File = async (filePath: string): Promise<string | undefined> => {
    try {
      return await new Promise<string>((resolve, reject) => {
        const hash = createHash('sha256');
        const stream = createReadStream(filePath);
        stream.on('error', reject);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
      });
    } catch {
      return undefined;
    }
  };

  const isCompleteInDir = async (entry: SttModelEntry, dir: string): Promise<boolean> => {
    for (const file of entry.files) {
      const size = await fileSize(path.join(dir, file.name));
      if (size !== file.sizeBytes) return false;
    }
    return true;
  };

  const isModelComplete = async (entry: SttModelEntry): Promise<boolean> =>
    isCompleteInDir(entry, modelDir(entry.id));

  const isEmbeddedComplete = async (entry: SttModelEntry): Promise<boolean> => {
    const dir = embeddedModelDir(entry.id);
    return dir !== null && (await isCompleteInDir(entry, dir));
  };

  const embeddedRecord = (entry: SttModelEntry): InstalledSttModelRecord => ({
    id: entry.id,
    dirPath: embeddedModelDir(entry.id)!,
    sizeBytes: entry.totalSizeBytes,
    downloadedAt: now().toISOString(),
  });

  async function listInstalled(): Promise<InstalledSttModelRecord[]> {
    const embeddedIds = new Set<string>();
    const present: InstalledSttModelRecord[] = [];
    if (embeddedModelsPath) {
      for (const entry of catalog) {
        if (await isEmbeddedComplete(entry)) {
          embeddedIds.add(entry.id);
          present.push(embeddedRecord(entry));
        }
      }
    }

    const index = await loadIndex();
    let mutated = false;

    for (const [id, rec] of Object.entries(index.models)) {
      if (embeddedIds.has(id)) {
        delete index.models[id];
        mutated = true;
        continue;
      }
      const entry = getSttModelById(id);
      if (entry && (await isModelComplete(entry))) {
        present.push(rec);
      } else {
        delete index.models[id];
        mutated = true;
      }
    }

    if (mutated) await saveIndex(index);
    return present;
  }

  async function isInstalled(modelId: string): Promise<boolean> {
    const entry = getSttModelById(modelId);
    if (!entry) return false;
    if (await isEmbeddedComplete(entry)) return true;
    const index = await loadIndex();
    if (!index.models[modelId]) return false;
    return isModelComplete(entry);
  }

  async function getModelDirForLoad(modelId: string): Promise<string | null> {
    const entry = getSttModelById(modelId);
    if (!entry) return null;
    const embedded = embeddedModelDir(modelId);
    if (embedded && (await isCompleteInDir(entry, embedded))) return embedded;
    const index = await loadIndex();
    const rec = index.models[modelId];
    if (!rec || !(await isModelComplete(entry))) return null;
    rec.lastUsedAt = now().toISOString();
    index.models[modelId] = rec;
    await saveIndex(index);
    return rec.dirPath;
  }

  async function downloadAsset(
    url: string,
    dest: string,
    file: SttModelFile,
    signal: AbortSignal,
    onBytes: (deltaBytes: number) => void,
  ): Promise<void> {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    const partPath = `${dest}.part`;

    for (let attempt = 0; attempt < 2; attempt++) {
      let offset = (await fileSize(partPath)) ?? 0;
      if (attempt > 0) {
        dlLog.warn(`${file.name}: sha256 não conferiu — REBAIXANDO do zero (tentativa 2/2)`);
      }
      if (offset > file.sizeBytes) {
        await fs.rm(partPath, { force: true });
        offset = 0;
      }
      if (offset > 0) onBytes(offset);

      if (offset < file.sizeBytes) {
        const headers: Record<string, string> = {};
        if (offset > 0) headers.Range = `bytes=${offset}-`;

        dlLog.info(
          offset > 0
            ? `${file.name}: RETOMANDO de ${humanBytes(offset)}/${humanBytes(file.sizeBytes)} (HTTP Range)`
            : `${file.name}: baixando ${humanBytes(file.sizeBytes)}`,
        );

        const response = await fetchFn(url, { headers, signal });
        if (response.status === 200 && offset > 0) {
          dlLog.warn(`${file.name}: o espelho ignorou o Range (HTTP 200) — recomeçando do zero`);
          await fs.rm(partPath, { force: true });
          onBytes(-offset);
          offset = 0;
        } else if (!response.ok && response.status !== 206) {
          throw new Error(`HTTP ${response.status} downloading ${file.name}`);
        }
        if (!response.body) throw new Error(`Empty response body for ${file.name}`);

        const out = createWriteStream(partPath, { flags: offset > 0 ? 'a' : 'w' });
        try {
          for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
            if (!out.write(Buffer.from(chunk))) {
              await new Promise<void>((resolve, reject) => {
                out.once('drain', resolve);
                out.once('error', reject);
              });
            }
            onBytes(chunk.byteLength);
          }
          await new Promise<void>((resolve, reject) => {
            out.end(() => resolve());
            out.once('error', reject);
          });
        } catch (err) {
          out.destroy();
          throw err;
        }
      }

      const hash = await sha256File(partPath);
      if (hash === file.sha256) {
        await fs.rename(partPath, dest);
        dlLog.info(`${file.name}: sha256 OK, promovido (${humanBytes(file.sizeBytes)})`);
        return;
      }

      const badSize = (await fileSize(partPath)) ?? 0;
      await fs.rm(partPath, { force: true });
      onBytes(-badSize);
      if (attempt === 1) {
        throw new Error(`Checksum mismatch for ${file.name} after retry`);
      }
    }
  }

  const activeDownloads = new Map<string, AbortController>();

  async function downloadModel(
    modelId: string,
    onProgress?: (p: SttDownloadProgress) => void,
  ): Promise<InstalledSttModelRecord> {
    const entry = getSttModelById(modelId);
    if (!entry) throw new Error(`Unknown local STT model id: ${modelId}`);

    const controller = new AbortController();
    activeDownloads.set(modelId, controller);

    try {
      if (await isEmbeddedComplete(entry)) {
        dlLog.info(`${modelId}: já EMBUTIDO no pacote — nada a baixar`);
        return embeddedRecord(entry);
      }

      const index = await loadIndex();
      if (index.models[modelId] && (await isModelComplete(entry))) {
        dlLog.info(`${modelId}: já instalado e íntegro — nada a baixar`);
        return index.models[modelId];
      }

      const total = entry.totalSizeBytes;
      const startedAt = Date.now();
      let downloaded = 0;
      let currentFile: string | undefined;
      const emit = (): void =>
        onProgress?.({
          modelId,
          downloaded,
          total,
          pct: total > 0 ? downloaded / total : 0,
          currentFile,
        });

      for (const file of entry.files) {
        const dest = assetDestPath(modelId, file);
        if ((await fileSize(dest)) === file.sizeBytes) {
          downloaded += file.sizeBytes;
          emit();
          continue;
        }
        currentFile = file.name;
        emit();
        const url = buildSttAssetUrl(entry, file.name, mirrorBase());
        await downloadAsset(url, dest, file, controller.signal, (delta) => {
          downloaded += delta;
          emit();
        });
      }

      const record: InstalledSttModelRecord = {
        id: modelId,
        dirPath: modelDir(modelId),
        sizeBytes: total,
        downloadedAt: now().toISOString(),
      };

      const fresh = await loadIndex();
      fresh.models[modelId] = record;
      await saveIndex(fresh);

      return record;
    } catch (err) {
      if (controller.signal.aborted || (err instanceof Error && /abort/i.test(err.message))) {
        throw new Error(`DOWNLOAD_CANCELLED:${modelId}`);
      }
      throw err;
    } finally {
      activeDownloads.delete(modelId);
    }
  }

  function cancelDownload(modelId: string): boolean {
    const controller = activeDownloads.get(modelId);
    if (!controller) return false;
    controller.abort();
    activeDownloads.delete(modelId);
    return true;
  }

  async function deleteModel(modelId: string): Promise<void> {
    const entry = getSttModelById(modelId);
    if (entry && (await isEmbeddedComplete(entry))) {
      throw new Error(`LOCAL_STT_EMBEDDED_NOT_DELETABLE:${modelId}`);
    }
    const index = await loadIndex();
    await fs.rm(modelDir(modelId), { recursive: true, force: true });
    if (index.models[modelId]) {
      delete index.models[modelId];
      await saveIndex(index);
    }
  }

  async function getCatalogWithStatus(): Promise<
    Array<SttModelEntry & { installed: boolean; embedded: boolean }>
  > {
    const installed = await listInstalled();
    const ids = new Set(installed.map((r) => r.id));
    const embeddedIds = new Set<string>();
    for (const entry of catalog) {
      if (await isEmbeddedComplete(entry)) embeddedIds.add(entry.id);
    }
    return catalog.map((entry) => ({
      ...entry,
      installed: ids.has(entry.id) || embeddedIds.has(entry.id),
      embedded: embeddedIds.has(entry.id),
    }));
  }

  return {
    listInstalled,
    isInstalled,
    getModelDirForLoad,
    downloadModel,
    cancelDownload,
    deleteModel,
    getCatalogWithStatus,
  };
}