/**
 * Local (on-device) TTS model + default-voice catalogue — study-method.
 *
 * Copiado de ondokai (`src/shared/constants/ttsModels.constants.ts`) e ADAPTADO
 * ao study-method (onda 8, voz local): catálogo de DUAS vozes Piper
 * (`piper-en-amy` e `piper-pt-br-faber`, sampleRate 22050) e a função pura
 * `defaultVoiceFor(lng)` que a UI usa para escolher o modelo por idioma.
 *
 * Shared entre o main (download/load/generate) e o renderer (hook/componentes
 * de voz). Fonte única de verdade para os modelos on-device.
 *
 * O engine é **Piper** (VITS family): um modelo single-speaker por língua,
 * voiced por um `sid` embutido (0). Piper phonemiza via espeak-ng data
 * (`resources/espeak-ng-data/` — GPLv3, isolado num processo filho).
 *
 * @module shared/constants/ttsModels.constants
 */

/** One downloadable asset of a TTS model. */
export interface TtsModelFile {
  name: string;
  sizeBytes: number;
  sha256: string;
}

/** A curated default voice bundled with a model. */
export interface TtsDefaultVoiceEntry {
  id: string;
  label: string;
  gender: 'female' | 'male';
  /** BCP-47-ish language the voice speaks (matches its model). */
  language: string;
  modelId: string;
  /** Built-in speaker id (Piper single-speaker = 0). */
  sid?: number;
  license: 'CC0' | 'CC-BY-4.0' | 'Apache-2.0' | 'MIT';
  attribution: string;
}

/** An installable on-device TTS model. */
export interface TtsModelEntry {
  /** Stable catalogue id, also the on-disk dir name. */
  id: string;
  /** Engine family that loads this model (routes the sherpa config shape). */
  family: 'pocket-tts' | 'kokoro' | 'vits';
  /** Language the model speaks (one entry per language). */
  language: string;
  label: string;
  assetPath: string;
  files: TtsModelFile[];
  voiceFiles: TtsModelFile[];
  /** Sum of files + voiceFiles sizes. */
  totalSizeBytes: number;
  /** Output sample rate of the model (Piper medium 22.05 kHz). */
  sampleRate: number;
  license: 'CC-BY-4.0' | 'Apache-2.0' | 'MIT';
  attribution: string;
  isDefault?: boolean;
}

/**
 * Public base URL of the ondokai model mirror (GitHub Release flat layout).
 * Overridable via STUDY_METHOD_TTS_MIRROR_BASE env (main).
 */
export const TTS_ASSETS_DEFAULT_BASE =
  'https://github.com/frederico-kluser/ondokai-models/releases/latest/download';

export function ttsAssetName(modelId: string, fileName: string): string {
  return `${modelId}__${fileName}`;
}

export function buildTtsAssetUrl(
  entry: Pick<TtsModelEntry, 'id'>,
  fileName: string,
  baseOverride?: string,
): string {
  const base = (baseOverride || TTS_ASSETS_DEFAULT_BASE).replace(/\/+$/, '');
  return `${base}/${ttsAssetName(entry.id, fileName)}`;
}

/** Curated default voices. Piper is single-speaker per model → `sid: 0`. */
export const TTS_DEFAULT_VOICES: TtsDefaultVoiceEntry[] = [
  {
    id: 'amy',
    sid: 0,
    label: 'Amy',
    gender: 'female',
    language: 'en',
    modelId: 'piper-en-amy',
    license: 'MIT',
    attribution: 'Piper en_US-amy-medium (rhasspy/piper-voices) — MIT',
  },
  {
    id: 'faber',
    sid: 0,
    label: 'Faber',
    gender: 'male',
    language: 'pt-BR',
    modelId: 'piper-pt-br-faber',
    license: 'MIT',
    attribution: 'Piper pt_BR-faber-medium (rhasspy/piper-voices) — MIT',
  },
];

export const TTS_MODEL_CATALOG: TtsModelEntry[] = [
  {
    id: 'piper-en-amy',
    family: 'vits',
    language: 'en',
    label: 'Piper — English (Amy)',
    assetPath: 'tts/piper-en-amy/v1',
    files: [
      {
        name: 'model.onnx',
        sizeBytes: 63201425,
        sha256: 'fbaa8e36d8f26fe6f3ebb65cab461e629d8b37a5b7c5fb78fb64317db73e1c25',
      },
      {
        name: 'tokens.txt',
        sizeBytes: 921,
        sha256: '87c8ef66eae5473ed0cc0366b3964c736ca6c5f676c979522ea31234e47430b9',
      },
    ],
    voiceFiles: [],
    totalSizeBytes: 63202346,
    sampleRate: 22050,
    license: 'MIT',
    attribution:
      'Piper en_US-amy-medium (rhasspy/piper-voices, MIT) via sherpa-onnx (Apache-2.0); espeak-ng phonemizer (GPLv3)',
    isDefault: true,
  },
  {
    id: 'piper-pt-br-faber',
    family: 'vits',
    language: 'pt-BR',
    label: 'Piper — Português (Faber)',
    assetPath: 'tts/piper-pt-br-faber/v1',
    files: [
      {
        name: 'model.onnx',
        sizeBytes: 63149204,
        sha256: '1eecd74d1984c73922033629de08974a4cf878f0b4b150e78146331d3d37a053',
      },
      {
        name: 'tokens.txt',
        sizeBytes: 907,
        sha256: '2619c1a9de1bcf928162f40c583caf39368cfd6b2340c7bcad51dc634411ec36',
      },
    ],
    voiceFiles: [],
    totalSizeBytes: 63150111,
    sampleRate: 22050,
    license: 'MIT',
    attribution:
      'Piper pt_BR-faber-medium (rhasspy/piper-voices, MIT) via sherpa-onnx (Apache-2.0); espeak-ng phonemizer (GPLv3)',
  },
];

/** The first-run default TTS model (English Piper). */
export const DEFAULT_TTS_MODEL: TtsModelEntry =
  TTS_MODEL_CATALOG.find((m) => m.isDefault) ?? TTS_MODEL_CATALOG[0];

export function getTtsModelById(id: string | undefined): TtsModelEntry | undefined {
  if (!id) return undefined;
  return TTS_MODEL_CATALOG.find((m) => m.id === id);
}

export function getDefaultVoicesForModel(modelId: string): TtsDefaultVoiceEntry[] {
  if (!getTtsModelById(modelId)) return [];
  return TTS_DEFAULT_VOICES.filter((v) => v.modelId === modelId);
}

export function getTtsDefaultVoiceById(id: string | undefined): TtsDefaultVoiceEntry | undefined {
  if (!id) return undefined;
  return TTS_DEFAULT_VOICES.find((v) => v.id === id);
}

/** App locales with first-class on-device TTS support (mirror of STT). */
export const TTS_SUPPORTED_LOCALES = ['pt-BR', 'en'] as const;

/** Lowercase + strip region for coarse comparisons (`pt-BR` → `pt`). */
function normalizeTtsLocale(locale: string | undefined): string | undefined {
  if (!locale) return undefined;
  return locale.toLowerCase().split(/[-_]/)[0];
}

/**
 * Pick the catalogue model whose `language` matches the app locale, so
 * generated speech follows the selected UI language. Falls back to the
 * first-run default (English) for unknown locales.
 */
export function resolveTtsModelForLocale(locale: string | undefined): TtsModelEntry {
  const code = normalizeTtsLocale(locale);
  if (!code) return DEFAULT_TTS_MODEL;
  return (
    TTS_MODEL_CATALOG.find((m) => normalizeTtsLocale(m.language) === code) ?? DEFAULT_TTS_MODEL
  );
}

/**
 * Pure helper for the SpeakButton/voice UI: given an app locale, return the
 * default VOICE ID (Amy for en, Faber for pt-BR). Falls back to the default
 * English voice for unknown locales.
 */
export function defaultVoiceFor(lng: string | undefined): string {
  const code = normalizeTtsLocale(lng);
  switch (code) {
    case 'pt':
      return 'faber';
    case 'en':
      return 'amy';
    default:
      return 'amy';
  }
}

export const TTS_SPEED_MIN = 0.5;
export const TTS_SPEED_MAX = 2.0;
export const TTS_SPEED_DEFAULT = 1.0;

/** Max characters per generateAudio run (matches the previous block limit). */
export const TTS_MAX_TEXT_LENGTH = 4096;