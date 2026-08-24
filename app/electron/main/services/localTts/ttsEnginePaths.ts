/**
 * Path resolution for the **separate** (out-of-process) local TTS engine —
 * study-method.
 *
 * Copiado de ondokai (electron/main/services/localTts/ttsEnginePaths.ts) e
 * ADAPTADO ao study-method (onda 8, voz local): env override
 * `STUDY_METHOD_TTS_ENGINE_BIN`.
 *
 * GPL ISOLATION (Option A): the on-device TTS engine is the upstream
 * `sherpa-onnx-offline-tts` **command-line executable**, which statically links
 * espeak-ng (GPLv3). It runs in its **own process**, invoked by the app via
 * `child_process.execFile` (arm's-length: CLI args + a WAV file on disk). The
 * app process links **nothing** from it — that keeps the proprietary code free
 * of GPL. NEVER import or link the sherpa-onnx TTS library in-process.
 *
 * Everything the engine needs ships inside the installer (no runtime download):
 *  - the engine binary      → `<resources>/tts-engine/<platform>-<arch>/…`
 *  - the Piper model files   → `<resources>/tts-models/<modelId>/…`
 *  - the espeak-ng data      → `<resources>/espeak-ng-data` (see espeakAssets)
 *
 * @module electron/main/services/localTts/ttsEnginePaths
 */

import path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import { getEspeakNgDataDir, isEspeakNgDataAvailable } from './espeakAssets';

export { getEspeakNgDataDir, isEspeakNgDataAvailable };

/** Per-target sub-directory, e.g. `linux-x64`, `darwin-arm64`, `win32-x64`. */
function platformArchDir(): string {
  return `${process.platform}-${process.arch}`;
}

/** Root of a staged resource tree: `resources/<name>` (dev) or
 *  `<resources>/<name>` (packaged). */
function resourceRoot(name: string): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, name)
    : path.join(app.getAppPath(), 'resources', name);
}

/**
 * Absolute path of the separate TTS engine executable for THIS platform/arch.
 * Honours `STUDY_METHOD_TTS_ENGINE_BIN` (dev/testing escape hatch) first.
 */
export function getTtsEngineBinaryPath(): string {
  const override = process.env.STUDY_METHOD_TTS_ENGINE_BIN;
  if (override) return override;
  const exe = process.platform === 'win32' ? 'sherpa-onnx-offline-tts.exe' : 'sherpa-onnx-offline-tts';
  const base = path.join(resourceRoot('tts-engine'), platformArchDir());
  // Tolerate either a flat layout (`<dir>/<exe>`) or the upstream release's
  // `bin/`+`lib/` layout (`<dir>/bin/<exe>`, libs in `<dir>/lib`).
  const candidates = [path.join(base, exe), path.join(base, 'bin', exe)];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* fall through to the next candidate */
    }
  }
  return candidates[0];
}

/** Whether the separate TTS engine binary is present on disk for this target. */
export function isTtsEngineAvailable(): boolean {
  try {
    return fs.existsSync(getTtsEngineBinaryPath());
  } catch {
    return false;
  }
}

/**
 * Directory of a model's files bundled in the installer
 * (`<resources>/tts-models/<modelId>`, holding `model.onnx` + `tokens.txt`).
 */
export function getBundledModelDir(modelId: string): string {
  return path.join(resourceRoot('tts-models'), modelId);
}

/** Whether a model is bundled in the installer (sentinel: its `model.onnx`). */
export function isBundledModelAvailable(modelId: string): boolean {
  try {
    return fs.existsSync(path.join(getBundledModelDir(modelId), 'model.onnx'));
  } catch {
    return false;
  }
}