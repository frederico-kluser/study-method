/**
 * Local (on-device) STT/ASR model catalogue — study-method (onda 8, voz local).
 *
 * Copiado de quiet-que (electron/main/services/localStt/sttModels.constants.ts),
 * que por sua vez espelha o `ondokai` (`src/shared/constants/sttModels.constants.ts`).
 * Os VALORES (hash, tamanhos e URLs) são os mesmos — nunca inventados aqui.
 * Mora no main process (a UI de voz é outra onda; se um dia o renderer precisar,
 * migra para `src/shared/` com os mesmos valores).
 *
 * Um único modelo on-device (decisão de produto): Nemotron-3.5-asr-streaming-0.6b
 * (int8, STREAMING / OnlineRecognizer com hint de língua por stream via
 * `setOption({key:'language', …})`). 40 locales incluindo pt-BR; o app o
 * oferece para pt-BR + en. A UI resolve o hint por locale — `sttLanguageHint`.
 *
 * Os assets vivem no repo público de modelos (frederico-kluser/ondokai-models)
 * como assets ACHATADOS e com prefixo (`<modelId>__<fileName>`) do release
 * LATEST. Nesta onda o modelo viaja EMBUTIDO em `resources/stt-models/<modelId>/`
 * (gitignored), então o download do espelho é apenas o fallback de dev.
 *
 * @module electron/main/services/localStt/sttModels.constants
 */

/** One downloadable asset of an STT model. */
export interface SttModelFile {
  /** File name as stored in the mirror and on disk. */
  name: string;
  /** Exact size in bytes (drives aggregate progress + completeness checks). */
  sizeBytes: number;
  /** SHA-256 of the file, verified after download. */
  sha256: string;
}

/** How the sherpa-onnx recognizer is constructed for a model. */
export type SttModelMode = 'offline' | 'streaming';

/** An installable on-device STT model. */
export interface SttModelEntry {
  /** Stable catalogue id, also the on-disk dir name. */
  id: string;
  family: 'parakeet' | 'nemotron';
  /** offline → OfflineRecognizer; streaming → OnlineRecognizer. */
  mode: SttModelMode;
  /** Short human label for the UI. */
  label: string;
  /** App locales (subset of pt-BR,en) this model is offered for. */
  languages: string[];
  /** Whether the model accepts a per-stream language hint. */
  supportsLanguageHint: boolean;
  /** Mirror path under the assets base URL (versioned). */
  assetPath: string;
  /** sherpa transducer component file names (resolved inside the model dir). */
  modelFiles: { encoder: string; decoder: string; joiner: string; tokens: string };
  /** Silero VAD file name, if bundled. */
  vadFile?: string;
  /** All downloadable files (transducer components + tokens + optional VAD). */
  files: SttModelFile[];
  /** Sum of all `files` sizes, for aggregate download progress. */
  totalSizeBytes: number;
  /** Minimum usable RAM (model card guidance). */
  minRamGB: number;
  license: 'OpenMDW-1.1' | 'CC-BY-4.0';
  attribution: string;
  /** First-run default offline model. */
  isDefault?: boolean;
}

/**
 * Public base URL of the model mirror — the LATEST GitHub release of the public
 * models repo (frederico-kluser/ondokai-models). Overridable via the
 * STUDY_METHOD_STT_MIRROR_BASE env var (dev/staging).
 */
export const STT_ASSETS_DEFAULT_BASE =
  'https://github.com/frederico-kluser/ondokai-models/releases/latest/download';

/**
 * Flat, collision-safe Release asset name for one file of a model.
 */
export function sttAssetName(modelId: string, fileName: string): string {
  return `${modelId}__${fileName}`;
}

/** Compose the absolute URL of one asset of a model (flat GitHub Release layout). */
export function buildSttAssetUrl(
  entry: Pick<SttModelEntry, 'id'>,
  fileName: string,
  baseOverride?: string,
): string {
  const base = (baseOverride || STT_ASSETS_DEFAULT_BASE).replace(/\/+$/, '');
  return `${base}/${sttAssetName(entry.id, fileName)}`;
}

/** Shared Silero VAD asset (bundled with every streaming-capable model). */
const SILERO_VAD: SttModelFile = {
  name: 'silero_vad.onnx',
  sizeBytes: 643854,
  sha256: '9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6',
};

export const STT_MODEL_CATALOG: SttModelEntry[] = [
  {
    id: 'nemotron-3.5-asr-streaming-0.6b-560ms-int8',
    family: 'nemotron',
    mode: 'streaming',
    label: 'Nemotron-3.5 (streaming, multilingual)',
    languages: ['pt-BR', 'en'],
    supportsLanguageHint: true,
    assetPath: 'stt/nemotron-3.5-asr-streaming-0.6b-560ms-int8/v1',
    modelFiles: {
      encoder: 'encoder.int8.onnx',
      decoder: 'decoder.int8.onnx',
      joiner: 'joiner.int8.onnx',
      tokens: 'tokens.txt',
    },
    vadFile: 'silero_vad.onnx',
    files: [
      {
        name: 'encoder.int8.onnx',
        sizeBytes: 657395114,
        sha256: '4ff9fedb8f2324ad9736cad6c4a89063d8a428fe21364504ec613a3d60f749b4',
      },
      {
        name: 'decoder.int8.onnx',
        sizeBytes: 14978075,
        sha256: '19f9c98fc6d0a2c33a65a43b36fdb2e914c26c0aa9764be3aebc502a1e982fb0',
      },
      {
        name: 'joiner.int8.onnx',
        sizeBytes: 9504438,
        sha256: '4101c7c679a0bc30483794b27a059e34e79232aa2068d78d51231a22c8b0d7ce',
      },
      {
        name: 'tokens.txt',
        sizeBytes: 131440,
        sha256: '729cc103155bafa785f9cd45746cd41cabe97eab7182fc04d594129587958f8a',
      },
      SILERO_VAD,
    ],
    totalSizeBytes: 682652921,
    minRamGB: 2,
    license: 'OpenMDW-1.1',
    attribution:
      'NVIDIA Nemotron-3.5-asr-streaming-0.6b (OpenMDW-1.1), converted to ONNX by the sherpa-onnx project (Apache-2.0)',
    isDefault: true,
  },
];

/** The first-run default STT model (streaming Nemotron — the only model). */
export const DEFAULT_STT_MODEL: SttModelEntry =
  STT_MODEL_CATALOG.find((m) => m.isDefault) ?? STT_MODEL_CATALOG[0];

export function getSttModelById(id: string | undefined): SttModelEntry | undefined {
  if (!id) return undefined;
  return STT_MODEL_CATALOG.find((m) => m.id === id);
}

/** All app locales any installable model is offered for. */
export const STT_SUPPORTED_LOCALES = ['pt-BR', 'en'] as const;

/** Lowercase, strip region for coarse comparisons (`pt-BR` → `pt`). */
function normalizeLocale(locale: string | undefined): string | undefined {
  if (!locale) return undefined;
  return locale.toLowerCase().split(/[-_]/)[0];
}

/**
 * Map an app locale to the language hint passed to a multilingual streaming
 * model (`stream.setOption({key:'language', value})`). Returns `'auto'` for
 * unknown locales so the model self-detects.
 */
export function sttLanguageHint(locale: string | undefined): string {
  const code = normalizeLocale(locale);
  switch (code) {
    case 'pt':
      return 'pt';
    case 'en':
      return 'en';
    default:
      return 'auto';
  }
}

/** Target sample rate sherpa-onnx ASR expects (16 kHz mono PCM). */
export const STT_TARGET_SAMPLE_RATE = 16000;