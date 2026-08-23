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
} as const;

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