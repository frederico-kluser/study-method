/**
 * shared/ipc-contract.ts — CONTRATO único entre main process, preload e renderer.
 *
 * CONGELADO no COMMIT PREP da onda 1: todos os agentes implementam CONTRA estes
 * nomes de canal e estes tipos base. Nomes não mudam sem atualizar este arquivo
 * (e o preload/renderer juntos). Extensões de tipo por agente são permitidas
 * DENTRO dos seus arquivos, nunca renomeando canais já declarados aqui.
 */

// ─── Canais: chaves de API ────────────────────────────────────────────────────
export const KEYS_CHANNELS = {
  GET_STATUS: 'keys:get-status',
  SET_KEY: 'keys:set-key',
  VALIDATE_DEEPSEEK: 'keys:validate-deepseek',
  VALIDATE_BRAVE: 'keys:validate-brave',
  // ADITIVO (onda 6 — startup gate): o GATE DE INÍCIO consulta esse canal no
  // montage do AppGate. Registrado por `registerStartupHandlers` (um
  // registrador SEPARADO do registerKeysHandlers, que continua dono dos 4
  // canais acima). O preload expõe `window.api.keys.startupStatus` de forma
  // automática (deriva de API_GROUPS=KEYS_CHANNELS).
  STARTUP_STATUS: 'keys:startup-status',
} as const;

// ─── Canais: pi coding agent ──────────────────────────────────────────────────
export const PI_CHANNELS = {
  EXECUTE: 'pi:execute',
  ABORT: 'pi:abort',
  STREAM_EVENT: 'pi:stream-event',
  GET_STATUS: 'pi:get-status',
} as const;

export type PiThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export interface PiModelConfig {
  provider: string;
  model: string;
  thinkingLevel?: PiThinkingLevel;
}

export interface PiExecuteRequest {
  prompt: string;
  workingDirectory?: string;
  modelConfig: PiModelConfig;
  skillSystemPrompt?: string;
  additionalContext?: string;
  timeout?: number;
}

export type PiStreamEvent =
  | { type: 'status_change'; status: string; data?: string; timestamp: number }
  | { type: 'text_delta'; data: string; toolName?: string; timestamp: number }
  | { type: 'thinking_delta'; data: string; timestamp: number }
  | { type: 'tool_start'; toolName: string; data?: string; timestamp: number }
  | { type: 'tool_end'; toolName: string; data?: string; timestamp: number }
  | { type: 'turn_start'; data?: string; timestamp: number }
  | { type: 'turn_end'; data?: string; timestamp: number }
  | { type: 'agent_end'; data?: string; timestamp: number }
  | { type: 'error'; data: string; timestamp: number };

export interface PiExecuteResult {
  success: boolean;
  output: string;
  error?: string;
  executionTimeMs: number;
}

// ─── Canais: LLM local (node-llama-cpp) ───────────────────────────────────────
export const LOCAL_AI_CHANNELS = {
  DETECT_HARDWARE: 'localAi:detect-hardware',
  RECOMMEND: 'localAi:recommend',
  LIST: 'localAi:list',
  DOWNLOAD: 'localAi:download',
  DOWNLOAD_PROGRESS: 'localAi:download-progress',
  DELETE: 'localAi:delete',
  GET_ACTIVE: 'localAi:get-active',
  SET_ACTIVE: 'localAi:set-active',
  CHAT: 'localAi:chat',
} as const;

export interface HardwareInfo {
  backend: string;
  ramGb: number;
  vramGb: number | null;
  cpuModel: string;
}

export interface LocalModelInfo {
  id: string;
  label: string;
  hfRepo: string;
  filename: string;
  quant: string;
  sizeBytes: number;
  recommended?: boolean;
  active?: boolean;
  downloaded?: boolean;
  agentReady: boolean;
}

export interface DownloadProgress {
  modelId: string;
  transferredBytes: number;
  totalBytes: number;
  percent: number;
  speedBps: number;
  done: boolean;
  error?: string;
}

/** Pedido de `localAi:chat` — inferência do modelo local como avaliador. */
export interface LocalAiChatRequest {
  modelId?: string;
  prompt: string;
}

/** Resultado de `localAi:chat` — o texto final do modelo (bloco único, s/ streaming). */
export interface LocalAiChatResult {
  text: string;
}

// ─── Canais: study-method (scripts da skill) ──────────────────────────────────
export const STUDY_CHANNELS = {
  RESOLVE_SKILL_DIR: 'study:resolve-skill-dir',
  GET_SETUPS: 'study:get-setups',
  CREATE_SETUP: 'study:create-setup',
  NEW_SESSION: 'study:new-session',
  PLAN_LESSON: 'study:plan-lesson',
  GENERATE_LESSON: 'study:generate-lesson',
  LESSON_PROGRESS: 'study:lesson-progress',
  GET_LESSON: 'study:get-lesson',
  GET_FINDINGS: 'study:get-findings',
  LIST_CHALLENGES: 'study:list-challenges',
  CREATE_CHALLENGE: 'study:create-challenge',
  VERIFY_CHALLENGE: 'study:verify-challenge',
  TEST_ANSWER: 'study:test-answer',
  TEST_ANSWER_EVENT: 'study:test-answer-event',
  LIST_WORKSPACE_FILES: 'study:list-workspace-files',
  READ_WORKSPACE_FILE: 'study:read-workspace-file',
  WRITE_WORKSPACE_FILE: 'study:write-workspace-file',
  DELETE_WORKSPACE_FILE: 'study:delete-workspace-file',
  // Onda 3 (seleção de aulas — persistência): fiação da camada SQL (repo.ts)
  // aos canais IPC. O renderer lista os assuntos com aulas persistidas, lista/
  // lê aulas de um assunto e registra respostas/lição concluída.
  LIST_TOPICS: 'study:list-topics',
  LIST_LESSONS_BY_SUBJECT: 'study:list-lessons-by-subject',
  GET_LESSON_BY_ID: 'study:get-lesson-by-id',
  RECORD_ANSWER: 'study:record-answer',
  MARK_LESSON_COMPLETED: 'study:mark-lesson-completed',
} as const;

// ─── DTOs de persistência (onda 3 — seleção de aulas) ─────────────────────────
// Estas interfaces são STANDALONE — shared é importado pelo renderer, então NUNCA
// importa de electron/main. Espelham os shapes da camada SQL (db/repo.ts):
// `listSubjects`/`listLessonsBySubject` de lá são a fonte de verdade; estes DTOs
// são a forma tipada que trafega pelos canais study:* abaixo.

/** Assunto com contagens (de `study:list-topics` ← repo.listSubjects). */
export interface SubjectSummary {
  id: string;
  name: string;
  slug: string;
  lessonCount: number;
  answeredCount: number;
}

/** Aula resumida por assunto (de `study:list-lessons-by-subject`). */
export interface LessonSummary {
  id: string;
  title: string;
  body: string;
  difficulty: number;
  completedAt: string | null;
}

/** Aula completa (de `study:get-lesson-by-id`). */
export interface LessonRow {
  id: string;
  subject_id: string;
  title: string;
  body: string;
  difficulty: number;
  parent_lesson_id: string | null;
  origin_lesson_id: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface StudyFinding {
  query: string;
  title: string;
  url: string;
  description: string;
  score?: number;
}

export interface StudyLesson {
  title: string;
  subject: string;
  markdown: string;
  findings: StudyFinding[];
  challenges: ChallengeInfo[];
  createdAt: string;
}

export interface ChallengeInfo {
  challengeId: string;
  title: string;
  language: string;
  concept: string;
  difficulty: number;
  status: string;
  verdict: string;
  workspaceDir: string;
  statementPath: string;
}

export interface TestAnswerResult {
  success: boolean;
  testsRun: number;
  expectedTests: number;
  passed: boolean;
  output: string;
  verdictFeedback?: string;
}

export interface WorkspaceFile {
  path: string;
  name: string;
  size: number;
  dir: boolean;
  language?: string;
}

// ─── Canais: validação de chaves ──────────────────────────────────────────────
export interface ValidationResult {
  isValid: boolean;
  provider: 'deepseek' | 'brave';
  errorMessage?: string;
  checkedAt: string;
}

export interface KeysStatus {
  deepseekConfigured: boolean;
  braveConfigured: boolean;
  deepseekValidated: boolean;
  braveValidated: boolean;
}

/**
 * Status do GATE DE INÍCIO (onda 6 — startup gate). Resultado de
 * `keys:startup-status`: a validação real das DUAS chaves (DeepSeek + Brave)
 * acontecida no main no primeiro acesso do renderer.
 *
 * `phase` interpreta o estado agregado:
 * - 'checking' → ainda validando (o AppGate mostra splash);
 * - 'blocked'  → alguma chave falta configurar ou é inválida (401/403).
 *               O AppGate renderiza o SetupView obrigatório;
 * - 'offline'  → ambas as chaves ESTÃO configuradas mas as DUAS falharam por
 *               erro de rede — o app inicia com um aviso e as features online
 *               ficam gateadas (LLM local continua utilizável);
 * - 'ready'    → as duas chaves são válidas; app inicia livre.
 *
 * Por provedor: `configured` = há chave salva; `valid` = a validação passou
 * (401/403 → false; 402/429/200 → true); `error` = mensagem clara quando a
 * chave é inválida ou falhou por rede.
 */
export interface StartupStatus {
  phase: 'checking' | 'ready' | 'blocked' | 'offline';
  deepseek: { configured: boolean; valid: boolean; error?: string };
  brave: { configured: boolean; valid: boolean; error?: string };
  /** true APENAS quando ambas as chaves configuradas falharam por erro de rede. */
  offline: boolean;
  checkedAt: string;
}

// ─── Canais: settings ─────────────────────────────────────────────────────────
export const SETTINGS_CHANNELS = {
  GET: 'settings:get',
  SET: 'settings:set',
  GET_SETUPS_DIR: 'settings:get-setups-dir',
  SET_SETUPS_DIR: 'settings:set-setups-dir',
} as const;

export interface AppSettings {
  setupsDir?: string;
  lastSubject?: string;
  defaultModelProvider?: 'deepseek' | 'local';
  defaultModelId?: string;
  /** ADITIVO (onda 6): idioma ativo, persistido pelo LanguageSwitcher do i18n. */
  language?: string;
}

// ─── Canais: STT local (onda 8 — voz) ────────────────────────────────────────
// On-device ASR via sherpa-onnx-node (Nemotron streaming) num utility process.
// Todos os handlers devolvem o envelope `{ success, data?, error? }`.

export const STT_CHANNELS = {
  MODEL_STATUS: 'stt:model-status',
  MODEL_DOWNLOAD: 'stt:model-download',
  MODEL_DOWNLOAD_PROGRESS: 'stt:model-download-progress',
  MODEL_CANCEL: 'stt:model-cancel',
  MODEL_DELETE: 'stt:model-delete',
  STREAM_START: 'stt:stream-start',
  STREAM_CHUNK: 'stt:stream-chunk',
  STREAM_STOP: 'stt:stream-stop',
  STREAM_CANCEL: 'stt:stream-cancel',
  STREAM_PARTIAL: 'stt:stream-partial',
  ENGINE_STATUS: 'stt:engine-status',
} as const;

/** Estado de UM modelo de STT local (catálogo + disco + download em voo). */
export interface SttModelStatus {
  modelId: string;
  state: 'absent' | 'installed' | 'downloading';
  /** Modelo embutido no pacote (resources/stt-models) — não deletável. */
  embedded: boolean;
  downloadedBytes: number;
  totalBytes: number;
  progress: number;
}

/** Push `stt:model-download-progress` — progresso do download de um modelo. */
export interface SttModelProgressPayload {
  modelId: string;
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
}

/** Push `stt:stream-partial` — transcrição parcial CUMULATIVA (replace). */
export interface SttPartialPayload {
  sessionId: string;
  text: string;
  /** true no commit do final (e no resultado de `stt:stream-stop`). */
  isFinal: boolean;
}

/** Push `stt:engine-status` — de um utility process de STT. */
export interface SttEngineStatusPayload {
  status: 'ready' | 'restarting' | 'dead';
}

/** Pedido de `stt:stream-start` — abertura de UMA sessão local. */
export interface SttStreamStartRequest {
  /** Locale da UI ('pt-BR' | 'en') — resolve o hint de língua do modelo. */
  locale: string;
  /** Id de sessão (geralmente fixo 'mic'). */
  sessionId: string;
}

/** Pedido de `stt:stream-chunk` — um frame PCM 16 kHz mono (≤ 48000 amostras). */
export interface SttStreamChunk {
  sessionId: string;
  samples: Float32Array;
}

// ─── Canais: TTS local (onda 8 — voz) ────────────────────────────────────────
// On-device TTS via binário externo (sherpa-onnx-offline-tts / Piper, GPL
// isolado num processo filho). Todos os handlers devolvem o envelope
// `{ success, data?, error? }`.

export const TTS_CHANNELS = {
  LIST: 'localTts:list',
  DOWNLOAD: 'localTts:download',
  DOWNLOAD_PROGRESS: 'localTts:download-progress',
  CANCEL_DOWNLOAD: 'localTts:cancel-download',
  DELETE: 'localTts:delete',
  GENERATE: 'localTts:generate',
  CANCEL_GENERATE: 'localTts:cancel-generate',
  GET_PREFERENCE: 'localTts:get-preference',
  SET_PREFERENCE: 'localTts:set-preference',
} as const;

/** Uma entrada do catálogo de TTS local + estado de instalação. */
export interface TtsModelInfo {
  id: string;
  language: string;
  label: string;
  /** Modelo embutido no pacote (resources/tts-models) — não deletável. */
  embedded: boolean;
  installed: boolean;
  sampleRate: number;
  totalSizeBytes: number;
}

/** Push `localTts:download-progress` — progresso do download de um modelo. */
export interface TtsDownloadProgressPayload {
  modelId: string;
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
}

/** Pedido de `localTts:generate` — síntese de fala de um modelo Piper. */
export interface TtsGenerateRequest {
  /** Id único do chamador — permite `localTts:cancel-generate`. */
  requestId: string;
  modelId: string;
  text: string;
  /** Voz default do modelo (Piper é single-speaker → sid 0). */
  defaultVoiceId?: string;
  /** Velocidade (`0.5`..`2.0`); omissa usa 1.0. */
  speed?: number;
  /** Provedor — 'local' é o único suportado nesta onda. */
  provider: 'local';
}

/** Resultado de `localTts:generate` — um WAV em base64. */
export interface TtsGenerateResult {
  audioBase64: string;
  format: 'wav';
  sampleRate: number;
  /** Path do arquivo temporário quando a UI pede para salvar (opcional). */
  savedTo?: string;
}

/** Preferência persistida do TTS local (`localTts:get-preference`/`set-preference`). */
export interface LocalTtsPreference {
  /** ModelId/voz a usar por padrão (ex.: 'piper-pt-br-faber'). */
  modelId?: string;
  defaultVoiceId?: string;
  speed?: number;
}