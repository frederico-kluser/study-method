/**
 * Local TTS model store (Piper VITS via sherpa-onnx) — study-method.
 *
 * Copiado de ondokai (electron/main/services/localTts/ttsModelStore.ts) e
 * ADAPTADO: removido o ponteiro cloud (`getModelDownloadsConfig`) — a URL de
 * cada asset vem do catálogo embutido com override de dev via
 * `STUDY_METHOD_TTS_MIRROR_BASE`. O modelo EMBUTIDO (resources/tts-models)
 * tem prioridade — os modelos Piper viajam no instalador nesta onda.
 *
 * `electron` (app) é importado LAZY dentro das funções que precisam de userData
 * para os testes não tocarem o runtime do Electron (mesmo idioma de
 * keys-handlers.ts).
 *
 * @module electron/main/services/localTts/ttsModelStore
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { createHash } from 'crypto';
import { createReadStream, createWriteStream } from 'fs';
import {
  TTS_MODEL_CATALOG,
  getTtsModelById,
  buildTtsAssetUrl,
  type TtsModelEntry,
  type TtsModelFile,
} from '../../../../src/shared/constants/ttsModels.constants';
import { getBundledModelDir, isBundledModelAvailable } from './ttsEnginePaths';

async function getTtsModelsDir(): Promise<string> {
  const { app } = await (import('electron') as Promise<typeof import('electron')>);
  return path.join(app.getPath('userData'), 'tts-models');
}

async function getIndexPath(): Promise<string> {
  return path.join(await getTtsModelsDir(), 'tts-models.index.json');
}

async function getModelDir(modelId: string): Promise<string> {
  return path.join(await getTtsModelsDir(), modelId);
}

/** On-disk destination of one catalogue asset. */
async function assetDestPath(modelId: string, file: TtsModelFile, isVoice: boolean): Promise<string> {
  const dir = await getModelDir(modelId);
  return isVoice ? path.join(dir, 'voices', file.name) : path.join(dir, file.name);
}

/** Mirror base, overridable for dev/staging via STUDY_METHOD_TTS_MIRROR_BASE. */
function mirrorBase(): string | undefined {
  return process.env.STUDY_METHOD_TTS_MIRROR_BASE || undefined;
}

function resolveAssetUrl(entry: TtsModelEntry, fileName: string): string {
  return buildTtsAssetUrl(entry, fileName, mirrorBase());
}

export interface InstalledTtsModelRecord {
  id: string;
  dirPath: string;
  sizeBytes: number;
  downloadedAt: string;
  lastUsedAt?: string;
  bundled?: boolean;
}

export interface TtsDownloadProgress {
  modelId: string;
  downloaded: number;
  total: number;
  pct: number;
  currentFile?: string;
}

interface TtsModelsIndex {
  version: 1;
  models: Record<string, InstalledTtsModelRecord>;
}

const emptyIndex = (): TtsModelsIndex => ({ version: 1, models: {} });

const activeDownloads = new Map<string, AbortController>();

async function loadIndex(): Promise<TtsModelsIndex> {
  try {
    const raw = await fs.readFile(await getIndexPath(), 'utf-8');
    const parsed = JSON.parse(raw) as TtsModelsIndex;
    if (!parsed || typeof parsed !== 'object' || !parsed.models) return emptyIndex();
    return parsed;
  } catch {
    return emptyIndex();
  }
}

async function saveIndex(index: TtsModelsIndex): Promise<void> {
  await fs.mkdir(await getTtsModelsDir(), { recursive: true });
  await fs.writeFile(await getIndexPath(), JSON.stringify(index, null, 2), 'utf-8');
}

async function fileSize(p: string): Promise<number | null> {
  try {
    return (await fs.stat(p)).size;
  } catch {
    return null;
  }
}

async function sha256File(filePath: string): Promise<string | undefined> {
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
}

function allAssets(entry: TtsModelEntry): Array<{ file: TtsModelFile; isVoice: boolean }> {
  return [
    ...entry.files.map((file) => ({ file, isVoice: false })),
    ...entry.voiceFiles.map((file) => ({ file, isVoice: true })),
  ];
}

async function isModelComplete(entry: TtsModelEntry): Promise<boolean> {
  for (const { file, isVoice } of allAssets(entry)) {
    const size = await fileSize(await assetDestPath(entry.id, file, isVoice));
    if (size !== file.sizeBytes) return false;
  }
  return true;
}

/** Installed records whose files are actually complete on disk. Self-heals index. */
export async function listInstalled(): Promise<InstalledTtsModelRecord[]> {
  const index = await loadIndex();
  const present: InstalledTtsModelRecord[] = [];
  let mutated = false;

  for (const [id, rec] of Object.entries(index.models)) {
    const entry = getTtsModelById(id);
    if (entry && (await isModelComplete(entry))) {
      present.push(rec);
    } else {
      delete index.models[id];
      mutated = true;
    }
  }

  if (mutated) await saveIndex(index);

  const seen = new Set(present.map((r) => r.id));
  for (const entry of TTS_MODEL_CATALOG) {
    if (!seen.has(entry.id) && isBundledModelAvailable(entry.id)) {
      present.push({
        id: entry.id,
        dirPath: getBundledModelDir(entry.id),
        sizeBytes: entry.totalSizeBytes,
        downloadedAt: new Date(0).toISOString(),
        bundled: true,
      });
    }
  }
  return present;
}

export async function isInstalled(modelId: string): Promise<boolean> {
  const entry = getTtsModelById(modelId);
  if (!entry) return false;
  if (isBundledModelAvailable(modelId)) return true;
  const index = await loadIndex();
  if (!index.models[modelId]) return false;
  return isModelComplete(entry);
}

/**
 * Resolves the model directory for generation, returning null if not installed.
 * Also stamps lastUsedAt.
 */
export async function getModelDirForLoad(modelId: string): Promise<string | null> {
  const entry = getTtsModelById(modelId);
  if (!entry) return null;
  // Prefer the bundled copy (resources/tts-models): TTS works fully offline.
  if (isBundledModelAvailable(modelId)) return getBundledModelDir(modelId);
  const index = await loadIndex();
  const rec = index.models[modelId];
  if (!rec || !(await isModelComplete(entry))) return null;
  rec.lastUsedAt = new Date().toISOString();
  index.models[modelId] = rec;
  await saveIndex(index);
  return rec.dirPath;
}

/**
 * Downloads one asset with HTTP-Range resume into `<dest>.part`, verifies its
 * sha256 and renames it into place.
 */
async function downloadAsset(
  url: string,
  dest: string,
  file: TtsModelFile,
  signal: AbortSignal,
  onBytes: (deltaBytes: number) => void,
): Promise<void> {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  const partPath = `${dest}.part`;

  for (let attempt = 0; attempt < 2; attempt++) {
    let offset = (await fileSize(partPath)) ?? 0;
    if (offset > file.sizeBytes) {
      await fs.rm(partPath, { force: true });
      offset = 0;
    }
    if (offset > 0) onBytes(offset);

    const headers: Record<string, string> = {};
    if (offset > 0) headers.Range = `bytes=${offset}-`;

    const response = await fetch(url, { headers, signal });
    if (response.status === 200 && offset > 0) {
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

    const hash = await sha256File(partPath);
    if (hash === file.sha256) {
      await fs.rename(partPath, dest);
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

/** Downloads a catalogue model with aggregate progress. Idempotent. */
export async function downloadModel(
  modelId: string,
  onProgress?: (p: TtsDownloadProgress) => void,
): Promise<InstalledTtsModelRecord> {
  const entry = getTtsModelById(modelId);
  if (!entry) throw new Error(`Unknown local TTS model id: ${modelId}`);

  // Bundled models are installed by definition — no-op.
  if (isBundledModelAvailable(modelId)) {
    return {
      id: modelId,
      dirPath: getBundledModelDir(modelId),
      sizeBytes: entry.totalSizeBytes,
      downloadedAt: new Date(0).toISOString(),
      bundled: true,
    };
  }

  const index = await loadIndex();
  if (index.models[modelId] && (await isModelComplete(entry))) {
    return index.models[modelId];
  }

  const controller = new AbortController();
  activeDownloads.set(modelId, controller);

  const total = entry.totalSizeBytes;
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

  try {
    for (const { file, isVoice } of allAssets(entry)) {
      const dest = await assetDestPath(modelId, file, isVoice);
      if ((await fileSize(dest)) === file.sizeBytes) {
        downloaded += file.sizeBytes;
        emit();
        continue;
      }
      currentFile = file.name;
      emit();
      const url = resolveAssetUrl(entry, file.name);
      await downloadAsset(url, dest, file, controller.signal, (delta) => {
        downloaded += delta;
        emit();
      });
    }
  } catch (err) {
    if (controller.signal.aborted || (err instanceof Error && /abort/i.test(err.message))) {
      throw new Error(`DOWNLOAD_CANCELLED:${modelId}`);
    }
    throw err;
  } finally {
    activeDownloads.delete(modelId);
  }

  const record: InstalledTtsModelRecord = {
    id: modelId,
    dirPath: await getModelDir(modelId),
    sizeBytes: total,
    downloadedAt: new Date().toISOString(),
  };

  const fresh = await loadIndex();
  fresh.models[modelId] = record;
  await saveIndex(fresh);

  return record;
}

/** Stops an in-progress download. `.part` files are kept for resume. */
export function cancelDownload(modelId: string): boolean {
  const controller = activeDownloads.get(modelId);
  if (!controller) return false;
  controller.abort();
  activeDownloads.delete(modelId);
  return true;
}

/** Deletes a model directory (files + voices) and removes it from the index. */
export async function deleteModel(modelId: string): Promise<void> {
  const index = await loadIndex();
  await fs.rm(await getModelDir(modelId), { recursive: true, force: true });
  if (index.models[modelId]) {
    delete index.models[modelId];
    await saveIndex(index);
  }
}

/** Catalogue + installed status. */
export async function getCatalogWithStatus(): Promise<
  Array<TtsModelEntry & { installed: boolean; embedded: boolean }>
> {
  const installed = await listInstalled();
  const ids = new Set(installed.map((r) => r.id));
  return TTS_MODEL_CATALOG.map((entry) => ({
    ...entry,
    installed: ids.has(entry.id) || isBundledModelAvailable(entry.id),
    embedded: isBundledModelAvailable(entry.id),
  }));
}