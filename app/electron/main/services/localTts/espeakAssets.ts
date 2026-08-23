/**
 * espeak-ng-data path (main process) for the espeak-based TTS engine (Piper
 * VITS) — study-method.
 *
 * Copiado de ondokai (electron/main/services/localTts/espeakAssets.ts). Piper
 * phonemiza com espeak-ng, que lê os dados de `dataDir` (passado ao sherpa-onnx
 * como o vits `dataDir`). Fazemos o SHIP de `resources/espeak-ng-data/` (GPLv3 —
 * licenses/THIRD-PARTY-TTS.md) ao lado do app em vez de baixar em runtime.
 * Mesma resolução dev-vs-packaged do ttsEnginePaths.
 *
 * @module electron/main/services/localTts/espeakAssets
 */

import path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

/**
 * Directory holding the espeak-ng phoneme data passed to sherpa-onnx as the
 * vits/kokoro `dataDir`. Shipped in `resources/espeak-ng-data` (dev) or
 * `process.resourcesPath/espeak-ng-data` (packaged).
 */
export function getEspeakNgDataDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'espeak-ng-data')
    : path.join(app.getAppPath(), 'resources', 'espeak-ng-data');
}

/**
 * Whether the espeak-ng phoneme data is actually present on disk. `phontab` is
 * the core phoneme table espeak-ng cannot initialize without, so its presence is
 * a reliable sentinel.
 */
export function isEspeakNgDataAvailable(): boolean {
  try {
    return fs.existsSync(path.join(getEspeakNgDataDir(), 'phontab'));
  } catch {
    return false;
  }
}