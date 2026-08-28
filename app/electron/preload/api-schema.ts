/**
 * electron/preload/api-schema.ts — construção da API exposta ao renderer.
 *
 * Este módulo é FUNÇÃO PURA testável: não importa 'electron' e nunca toca o
 * contextBridge/ipcRenderer. Ele define (a) a forma tipada `ApiSchema` que o
 * renderer consome via `window.api` e (b) `createExposedApi(ipc)`, que constrói
 * o objeto exposto a partir de UMA fonte única de verdade (`API_GROUPS`,
 * derivada do contrato congelado em shared/ipc-contract.ts).
 *
 * O entry de verdade `electron/preload/index.ts` importa electron e chama:
 *   contextBridge.exposeInMainWorld('api', createExposedApi(bridgeDoElectron));
 *
 * CONVENÇÃO DE EVENTOS (documentada para as ondas seguintes):
 *  - Canais de REQUISIÇÃO (request) → métodos `invoke`-backed: o renderer chama
 *    `window.api.<grupo>.<metodo>(args)` e recebe `Promise<R>`.
 *  - Canais de EVENTO (main→renderer push) → métodos `on*` que devolvem um
 *    unsubscribe: `const stop = window.api.pi.onStreamEvent(cb); stop()`.
 *    Nesta onda os placeholders do main NUNCA emitem; o esqueleto já expõe a
 *    assinatura para que ui/pi/… consumam sem mudar o preload depois.
 *  - Nomes de método seguem o sufixo do canal: 'pi:stream-event' →
 *    `onStreamEvent`; 'localAi:download-progress' → `onDownloadProgress`;
 *    'study:lesson-progress' → `onLessonProgress`; 'study:test-answer-event' →
 *    `onTestAnswerEvent`.
 */

import type {
  AppSettings,
  ChallengeInfo,
  DownloadProgress,
  GetLessonByIdResult,
  HardwareInfo,
  JudgeAnswerOutcome,
  JudgeAnswerRequest,
  KeysStatus,
  LessonSummary,
  LocalModelInfo,
  LocalTtsPreference,
  MarkChallengeAttemptRequest,
  MarkChallengeAttemptResult,
  MathAnswerCheckRequest,
  MathAnswerCheckResult,
  PiExecuteRequest,
  PiExecuteResult,
  PiStreamEvent,
  ResearchProgressEvent,
  SttModelProgressPayload,
  SttPartialPayload,
  StudyLesson,
  SubjectSummary,
  TtsDownloadProgressPayload,
  TtsGenerateRequest,
  TtsGenerateResult,
  TestAnswerResult,
  TrackChallengeGetRequest,
  TrackChallengeResult,
  TrackDetailResult,
  TrackLessonDoneResult,
  TrackLessonResult,
  TrackListResult,
  TrackRegenerateRequest,
  TrackRegenerateResult,
  TrackSubmitRequest,
  TrackSubmitResult,
  TutorChatRequest,
  TutorReply,
  ValidationResult,
  WorkspaceFile,
} from '@shared/ipc-contract';

import {
  KEYS_CHANNELS,
  LOCAL_AI_CHANNELS,
  PI_CHANNELS,
  SETTINGS_CHANNELS,
  STT_CHANNELS,
  STUDY_CHANNELS,
  TRACK_CHANNELS,
  TTS_CHANNELS,
} from '@shared/ipc-contract';

/**
 * Interface mínima do transporte usada por createExposedApi. O entry real
 * (index.ts) fornece uma implementação sobre electron's ipcRenderer; os testes
 * fornecem um fake.
 */
export interface IpcBridgeLike {
  /** ipcRenderer.invoke — request/response main + renderer. */
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  /** ipcRenderer.on — subscreve a push do main; devolve unsubscribe. */
  on(channel: string, listener: (...args: unknown[]) => void): () => void;
}

/**
 * Fonte única de verdade: cada grupo do contrato congelado e seus canais.
 * Mantém 1:1 com os constantes em shared/ipc-contract.ts. A cobertura de teste
 * (tests/ipc-contract.test.ts) varre estes grupos contra os canais do contrato.
 */
export const API_GROUPS = {
  settings: SETTINGS_CHANNELS,
  keys: KEYS_CHANNELS,
  pi: PI_CHANNELS,
  localAi: LOCAL_AI_CHANNELS,
  study: STUDY_CHANNELS,
  /** ADITIVO (rodada 8 — trilhas): conteúdo pré-definido por CLI + chat do tutor. */
  track: TRACK_CHANNELS,
  stt: STT_CHANNELS,
  localTts: TTS_CHANNELS,
} as const;

/** Canais de evento (push main→renderer). Os demais são request (invoke). */
const EVENT_CHANNELS: ReadonlySet<string> = new Set<string>([
  PI_CHANNELS.STREAM_EVENT,
  LOCAL_AI_CHANNELS.DOWNLOAD_PROGRESS,
  STUDY_CHANNELS.LESSON_PROGRESS,
  STUDY_CHANNELS.RESEARCH_PROGRESS,
  STUDY_CHANNELS.TEST_ANSWER_EVENT,
  STT_CHANNELS.MODEL_DOWNLOAD_PROGRESS,
  STT_CHANNELS.STREAM_PARTIAL,
  STT_CHANNELS.ENGINE_STATUS,
  TTS_CHANNELS.DOWNLOAD_PROGRESS,
]);

/** camelCase do último segmento do canal (ex.: 'localAi:download-progress' → 'ownloadProgress'). */
function trackName(channel: string): string {
  const last = channel.split(':')[1] ?? channel;
  return last.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
}

/** onStreamEvent ← 'stream-event' ; onDownloadProgress ← 'download-progress' … */
function eventTrackName(track: string): string {
  const rest = track.replace(/^./, (c) => c.toUpperCase());
  return `on${rest}`;
}

/**
 * Constroi o objeto exposto. Iterando os grupos do contrato, garante cobertura
 * total dos canais sem duplicar strings (a fonte é o próprio shared/ipc-contract).
 */
export function createExposedApi(ipc: IpcBridgeLike): ApiSchema {
  const out: Record<string, Record<string, unknown>> = {};

  for (const [group, channels] of Object.entries(API_GROUPS)) {
    const member: Record<string, unknown> = {};
    for (const value of Object.values(channels)) {
      const channel: string = value;
      if (EVENT_CHANNELS.has(channel)) {
        const track = trackName(channel); // 'download-progress' → 'downloadProgress'
        const name = eventTrackName(track); // 'downloadProgress' → 'onDownloadProgress'
        member[name] = (listener: (...args: unknown[]) => void) =>
          ipc.on(channel, listener);
      } else {
        const name = trackName(channel); // 'pi:execute' → 'execute'
        member[name] = (...args: unknown[]) => ipc.invoke(channel, ...args);
      }
    }
    out[group] = member;
  }

  // A implementação é construída genericamente; a tipagem vem de ApiSchema.
  return out as unknown as ApiSchema;
}

// ─── Tipagem do objeto exposto (contrato do renderer via window.api) ──────────
// Payloads dos canais ainda não implementados ficam como `unknown` com TODO
// apontando para a onda que os implementa. Só os canais settings:* têm handler
// REAL nesta onda; os demais rejeitam com o placeholder "ainda não implementado".

export interface ApiSchema {
  settings: {
    get(): Promise<AppSettings>;
    set(settings: AppSettings): Promise<void>;
    getSetupsDir(): Promise<string>;
    setSetupsDir(dir: string): Promise<void>;
  };
  keys: {
    getStatus(): Promise<KeysStatus>;
    setKey(provider: 'deepseek' | 'brave', key: string): Promise<void>;
    validateDeepseek(key: string): Promise<ValidationResult>;
    validateBrave(key: string): Promise<ValidationResult>;
  };
  pi: {
    execute(req: PiExecuteRequest): Promise<PiExecuteResult>;
    abort(): Promise<unknown>;
    getStatus(): Promise<unknown>;
    onStreamEvent(cb: (ev: PiStreamEvent) => void): () => void;
  };
  localAi: {
    detectHardware(): Promise<HardwareInfo>;
    recommend(): Promise<unknown>;
    list(): Promise<LocalModelInfo[]>;
    download(modelId: string): Promise<unknown>;
    delete(modelId: string): Promise<unknown>;
    getActive(): Promise<unknown>;
    setActive(modelId: string): Promise<unknown>;
    chat(req: { modelId?: string; prompt: string }): Promise<{ text: string }>;
    onDownloadProgress(cb: (ev: DownloadProgress) => void): () => void;
  };
  study: {
    resolveSkillDir(): Promise<unknown>;
    getSetups(): Promise<unknown>;
    createSetup(): Promise<unknown>;
    newSession(): Promise<unknown>;
    planLesson(): Promise<unknown>;
    /**
     * ONDA5: retipado — o payload é o que o main NORMALIZA em
     * normalizeGenerateLessonPayload (study-handlers): a STRING AVULSA
     * (subject, forma que a UI usava: generateLesson('algoritmos')) OU o objeto
     * `{ subject, domain?, language?, goal? }` — o branch-objeto é o shape
     * normalizado do contrato. Devolve `{ lesson, rejected }` — lesson do tipo
     * do contrato (StudyLesson); lessonId/subjectId chegam quando a geração
     * rodou com repo (onda4-desafio-persistencia). SÓ TIPO: o runtime do
     * preload continua passando os args adiante (invoke) sem tocar no payload.
     */
    generateLesson(
      input: string | { subject: string; domain?: 'math' | 'programming'; language?: string; goal?: string },
    ): Promise<{ lesson: StudyLesson; rejected: unknown[]; lessonId?: string; subjectId?: string }>;
    getLesson(): Promise<unknown>;
    getFindings(): Promise<unknown>;
    /** ADITIVO (fix15-list-challenges): `setupRoot` opcional — sem argumento segue
     *  o fallback do main (memory.lastSetupRoot do último generateLesson). */
    listChallenges(args?: { setupRoot?: string }): Promise<ChallengeInfo[]>;
    createChallenge(): Promise<unknown>;
    verifyChallenge(): Promise<unknown>;
    testAnswer(): Promise<TestAnswerResult>;
    listWorkspaceFiles(): Promise<WorkspaceFile[]>;
    readWorkspaceFile(): Promise<unknown>;
    writeWorkspaceFile(): Promise<unknown>;
    deleteWorkspaceFile(): Promise<unknown>;
    // Onda 3 (seleção de aulas — persistência): ligam a camada SQL ao renderer.
    listTopics(): Promise<SubjectSummary[]>;
    listLessonsBySubject(subjectSlug: string): Promise<LessonSummary[]>;
    /** ONDA4: devolve { lesson, exercise (parse de exercise_json), domain }. */
    getLessonById(lessonId: string): Promise<GetLessonByIdResult>;
    recordAnswer(input: { lessonId: string; answerText: string }): Promise<unknown>;
    markLessonCompleted(lessonId: string): Promise<unknown>;
    /** ONDA4 (nunca-repetir): registra UMA tentativa de desafio (resolve
     *  subjectId por subjectSlug/upsert sob demanda). */
    markChallengeAttempt(input: MarkChallengeAttemptRequest): Promise<MarkChallengeAttemptResult>;
    /** ADITIVO (onda1-nav-ui — reset de progresso): apaga TODAS as tabelas de
     *  avanço do aluno (attempts/lesson-done/proficiência/gerados/contadores
     *  legados); o conteúdo e as configurações ficam. → { ok } | { ok:false,
     *  error } (repo indisponível). */
    clearProgress(): Promise<unknown>;
    onLessonProgress(cb: (ev: unknown) => void): () => void;
    /** ADITIVO (onda2-research-live): progresso da pesquisa Brave (surf-research
     *  style) durante generate-lesson — união discriminada ResearchProgressEvent. */
    onResearchProgress(cb: (ev: ResearchProgressEvent) => void): () => void;
    onTestAnswerEvent(cb: (ev: unknown) => void): () => void;
    /** ADITIVO (onda3-respostas): verificação POR EXECUÇÃO da resposta de um
     *  exercício de matemática (SEM LLM) — o main re-computa o esperado de
     *  (family, seed) via mathLib. `family`/`seed` vêm do `exercise` da lição. */
    checkMathAnswer(input: MathAnswerCheckRequest): Promise<MathAnswerCheckResult>;
    /** ADITIVO (onda3-respostas): avalia a INTERPRETAÇÃO digitada com LLM
     *  (deepseek → fallback embeddedLlm). Falha total ⇒ { ok:false, error }. */
    judgeAnswer(input: JudgeAnswerRequest): Promise<JudgeAnswerOutcome>;
  };
  /** ADITIVO (rodada 8 — trilhas): o aluno consome conteúdo pronto (CLI), não gera. */
  track: {
    list(): Promise<TrackListResult>;
    get(input: { trackSlug: string }): Promise<TrackDetailResult>;
    lesson(input: { trackSlug: string; lessonId: string }): Promise<TrackLessonResult>;
    lessonDone(input: { trackSlug: string; lessonId: string }): Promise<TrackLessonDoneResult>;
    tutorChat(input: TutorChatRequest): Promise<TutorReply>;
    challenge(input: TrackChallengeGetRequest): Promise<TrackChallengeResult>;
    challengeSubmit(input: TrackSubmitRequest): Promise<TrackSubmitResult>;
    challengeRegenerate(input: TrackRegenerateRequest): Promise<TrackRegenerateResult>;
    proficiency(input: TrackChallengeGetRequest): Promise<TrackChallengeResult>;
    proficiencySubmit(input: TrackSubmitRequest & { stars?: number }): Promise<TrackSubmitResult>;
  };
  /** Onda 8 (voz local): STT — envelope { success, data?, error? }. */
  stt: {
    modelStatus(): Promise<unknown>;
    modelDownload(modelId: string): Promise<unknown>;
    modelCancel(modelId: string): Promise<unknown>;
    modelDelete(modelId: string): Promise<unknown>;
    streamStart(req: { locale: string; sessionId: string }): Promise<unknown>;
    streamChunk(chunk: { sessionId: string; samples: Float32Array }): Promise<unknown>;
    streamStop(sessionId: string): Promise<unknown>;
    streamCancel(sessionId: string): Promise<unknown>;
    onModelDownloadProgress(cb: (ev: SttModelProgressPayload) => void): () => void;
    onStreamPartial(cb: (ev: SttPartialPayload) => void): () => void;
    onEngineStatus(cb: (ev: { status: 'ready' | 'restarting' | 'dead' }) => void): () => void;
  };
  /** Onda 8 (voz local): TTS — envelope { success, data?, error? }. */
  localTts: {
    list(): Promise<unknown>;
    download(modelId: string): Promise<unknown>;
    cancelDownload(modelId: string): Promise<unknown>;
    delete(modelId: string): Promise<unknown>;
    generate(req: TtsGenerateRequest): Promise<TtsGenerateResult>;
    cancelGenerate(requestId: string): Promise<unknown>;
    getPreference(): Promise<LocalTtsPreference>;
    setPreference(pref: LocalTtsPreference): Promise<unknown>;
    onDownloadProgress(cb: (ev: TtsDownloadProgressPayload) => void): () => void;
  };
}