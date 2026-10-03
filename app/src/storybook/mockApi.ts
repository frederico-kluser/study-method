/**
 * src/storybook/mockApi.ts — API falsa do Storybook (renderizar sem Electron).
 *
 * As views falam com o main EXCLUSIVAMENTE por `getApi()` (apiBridge); este
 * módulo preenche esse slot com um `ApiSchema` completo e determinístico, para
 * que qualquer story renderize sem `window.api` nem processo principal.
 *
 *   - a FÁBRICA é o `createExposedApi(ipc)` real (preload/api-schema.ts) sobre
 *     um `IpcBridgeLike` falso com handlers por CANAL — cobertura total sem
 *     reimplementar método a método, e o extra `keys.startupStatus` (fora do
 *     ApiSchema mas usado pelo AppGate) também responde;
 *   - CONTRATO de valores: todo o método resolve com dados realistas (fixa-
 *     dos em `./fixtures.ts`) — nunca rejeita, nunca fica pendente; o merge de
 *     `MockApiOverrides` é por MÉTODO (só o que a story escreve é substituído);
 *   - EVENTOS: os métodos `on*` devolvem um unsubscribe inofensivo e guardam o
 *     callback; `emitMockEvent(grupo, metodo, ev)` despacha para esses call-
 *     backs — é assim que as stories de loading/progresso simulam o push do
 *     main (ex.: emitMockEvent('track', 'onChallengeRegenerateProgress', …));
 *   - o registo de listeners é feito no envoltório de cada método (chave
 *     `grupo.metodo`) em vez de por nome de canal: assim cobre os métodos
 *     derivados E os overrides sem duplicar a derivação de nomes do preload;
 *   - livre de `electron`, `node:*`, node-llama-cpp, sherpa-onnx e
 *     web-tree-sitter — corre no browser do Storybook.
 *
 * `installMockApi(overrides)` é o que o preview.tsx chama antes de cada story;
 * uma instalação subsequente substitui a anterior de forma limpa e
 * `resetMockApi()` devolve o slot ao estado original.
 */
import { __resetApiForTests, __setApiForTests } from '../lib/apiBridge';
import {
  API_GROUPS,
  createExposedApi,
  type ApiSchema,
  type IpcBridgeLike,
} from '../../electron/preload/api-schema';
import {
  GAMES_CHANNELS,
  KEYS_CHANNELS,
  LOCAL_AI_CHANNELS,
  PI_CHANNELS,
  SETTINGS_CHANNELS,
  STT_CHANNELS,
  STUDY_CHANNELS,
  TRACK_CHANNELS,
  TTS_CHANNELS,
} from '@shared/ipc-contract';
import type {
  MarkChallengeAttemptRequest,
  QuizAttemptRequest,
  TrackChallengeGetRequest,
  TrackChallengeSpec,
  TrackLessonEntry,
  TrackListEntry,
  TrackLessonPayload,
  TutorChatRequest,
} from '@shared/ipc-contract';
import {
  fixtureChallengeAttempt,
  fixtureChallengeInfos,
  fixtureDownloadProgress,
  fixtureGameLevelPayload,
  fixtureGameRunResult,
  fixtureGameWorlds,
  fixtureGetLessonById,
  fixtureHardwareInfo,
  fixtureJudgeAnswer,
  fixtureKeysStatus,
  fixtureLocalAiChat,
  fixtureLocalModels,
  fixtureMarkChallengeAttempt,
  fixtureMathAnswerCheck,
  fixturePiExecuteResult,
  fixtureQuizAttemptDto,
  fixtureQuizAttemptReply,
  fixtureQuizExplainReply,
  fixtureQuizHistoryReply,
  fixtureQuizRemedialReply,
  fixtureSettings,
  fixtureStartupStatus,
  fixtureSttModelStatuses,
  fixtureStudyFindings,
  fixtureStudyLesson,
  fixtureSubjectTopics,
  fixtureLessonSummaries,
  fixtureTestAnswerResult,
  fixtureTrackChallenge,
  fixtureTrackDetail,
  fixtureTrackEntries,
  fixtureTrackList,
  fixtureTrackModules,
  fixtureTrackLesson,
  fixtureTrackOrphans,
  fixtureTrackRegenerateResult,
  fixtureTrackSubmitResult,
  fixtureTrackTheory,
  fixtureTtsGenerateResult,
  fixtureTtsModels,
  fixtureTtsPreference,
  fixtureTutorReply,
  fixtureValidationBrave,
  fixtureValidationLlm,
  fixtureWorkspaceFileContents,
  fixtureWorkspaceFiles,
} from './fixtures';

// ─── Tipos derivados do contrato ─────────────────────────────────────────────

/** Todos os canais do contrato (união literal por grupo do `API_GROUPS`). */
type AnyChannel = {
  [G in keyof typeof API_GROUPS]: (typeof API_GROUPS)[G][keyof (typeof API_GROUPS)[G]];
}[keyof typeof API_GROUPS];

/** Handler de UM canal: recebe os args do invoke e devolve o valor (nunca rejeita). */
type ChannelHandler = (...args: unknown[]) => unknown;

/**
 * Mapa canal→handler COMPLETO: o tipo exige TODOS os canais do contrato, pelo
 * que um canal esquecido é erro de compilação, não bug silencioso na story.
 */
type ChannelHandlerMap = Record<AnyChannel, ChannelHandler>;

/** Callback de um método de evento, guardado sem conhecer o tipo do payload. */
type UnknownListener = (ev: unknown) => void;

/**
 * Envelope dos canais de voz (STT/TTS) — o `{ success, data?, error? }` que os
 * handlers reais devolvem (SttIpcResult/TtsIpcResult do main).
 */
interface VoiceIpcEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/** Sucesso de um canal de voz, com o payload em `data`. */
function voiceOk<T>(data: T): VoiceIpcEnvelope<T> {
  return { success: true, data };
}

// ─── Mundo coerente derivado dos fixtures ────────────────────────────────────

/** Aulas da trilha canónica, achatadas na ordem dos módulos. */
const lessonEntries: TrackLessonEntry[] = fixtureTrackModules.flatMap((m) => m.lessons);

function lessonEntryBySlug(lessonId: string | undefined): TrackLessonEntry | undefined {
  return lessonEntries.find((l) => l.slug === lessonId);
}

function trackEntryBySlug(trackSlug: string | undefined): TrackListEntry | undefined {
  return fixtureTrackEntries.find((t) => t.slug === trackSlug);
}

/** Próxima aula da trilha (o botão "Avançar" lê `nextLesson`). */
function nextLessonOf(slug: string): { slug: string; title: string } | null {
  const i = lessonEntries.findIndex((l) => l.slug === slug);
  const next = i >= 0 ? lessonEntries[i + 1] : undefined;
  return next ? { slug: next.slug, title: next.title } : null;
}

/**
 * Conteúdo de UMA aula: para as aulas conhecidas da trilha canónica devolve a
 * aula rica com a identidade/estado do pedido (título, dificuldade, travamento
 * e `nextLesson` batem certo com o roadmap); para slugs desconhecidos devolve a
 * aula canónica com o slug carimbado — nunca vazio.
 */
function lessonFor(lessonId: string | undefined): TrackLessonPayload {
  const entry = lessonEntryBySlug(lessonId);
  if (!entry) return { ...fixtureTrackLesson, slug: lessonId ?? fixtureTrackLesson.slug };
  return {
    ...fixtureTrackLesson,
    slug: entry.slug,
    moduleSlug: entry.moduleSlug,
    title: entry.title,
    summary: entry.summary,
    difficulty: entry.difficulty,
    locked: entry.locked,
    done: entry.done,
    nextLesson: nextLessonOf(entry.slug),
  };
}

/** Detalhe da trilha: o canónico para `python-iniciante`; para as outras, o
 *  conteúdo canónico com a identidade do pedido carimbada (mesma contagem). */
function detailFor(entry: TrackListEntry | undefined) {
  if (!entry || entry.slug === fixtureTrackDetail.slug) return fixtureTrackDetail;
  return {
    ...fixtureTrackDetail,
    slug: entry.slug,
    title: entry.title,
    description: entry.description,
    doneCount: entry.doneCount,
    lessonCount: entry.lessonCount,
    proficient: entry.proficient,
  };
}

/** Teste de proficiência da trilha canónica (cobre a trilha inteira). */
const proficiencySpec: TrackChallengeSpec = {
  ...fixtureTrackChallenge,
  slug: 'proficiencia',
  title: 'Teste de proficiência: Python do Zero',
  concept: 'proficiencia',
  difficulty: 3,
  statement:
    '# Teste de proficiência\n\n' +
    'Resolva os desafios de variáveis, condicionais e listas — a prova cobre a trilha inteira.\n\n' +
    'Passar destrava TODAS as aulas.\n',
  lastVerdict: null,
  stars: 0,
  failedCount: 0,
};

/** Desafio do módulo `fundamentos` (rodada 9 — desafio de fim de módulo). */
const moduleChallengeSpec: TrackChallengeSpec = {
  ...fixtureTrackChallenge,
  slug: 'desafio-modulo-fundamentos',
  title: 'Desafio do módulo: Fundamentos',
  concept: 'fundamentos',
  statement:
    '# Desafio do módulo: Fundamentos\n\n' +
    'Junte variáveis, tipos e condicionais num programa só: leia uma temperatura ' +
    'e devolva "frio" (abaixo de 20), "agradável" ou "quente".\n',
  lastVerdict: 'failed',
  stars: 1,
  failedCount: 1,
};

/** Especificação do desafio consoante o alvo pedida (aula/proficiência/módulo). */
function challengeSpecFor(req: Partial<TrackChallengeGetRequest>): TrackChallengeSpec {
  if (req.target === 'proficiency') return proficiencySpec;
  if (req.target === 'module') return moduleChallengeSpec;
  return { ...fixtureTrackChallenge, slug: req.challengeId ?? fixtureTrackChallenge.slug };
}

/** Submit do teste de proficiência: a prova passou (trilha destravada). */
const proficiencySubmitResult = {
  ...fixtureTrackSubmitResult,
  passed: true,
  output: '✔ variáveis e tipos\n✔ condicionais\n✔ listas e fatiamento\n3 passed in 0.11s',
  checks: [
    { name: 'variáveis e tipos', passed: true },
    { name: 'condicionais', passed: true },
    { name: 'listas e fatiamento', passed: true },
  ],
  passedCount: 3,
  totalCount: 3,
};

// ─── Handlers por canal (a fonte única de valores do mock) ───────────────────

const channelHandlers: ChannelHandlerMap = {
  // settings — os `set` são `Promise<void>` por contrato (resolvem undefined).
  [SETTINGS_CHANNELS.GET]: () => fixtureSettings,
  [SETTINGS_CHANNELS.SET]: () => undefined,
  [SETTINGS_CHANNELS.GET_SETUPS_DIR]: () => fixtureSettings.setupsDir ?? '/home/aluno/StudyMethod/setups',
  [SETTINGS_CHANNELS.SET_SETUPS_DIR]: () => undefined,

  // keys — inclui o `startup-status` (fora do ApiSchema; o AppGate consome-o).
  [KEYS_CHANNELS.GET_STATUS]: () => fixtureKeysStatus,
  [KEYS_CHANNELS.SET_KEY]: () => undefined,
  [KEYS_CHANNELS.VALIDATE_LLM]: () => fixtureValidationLlm,
  [KEYS_CHANNELS.VALIDATE_BRAVE]: () => fixtureValidationBrave,
  [KEYS_CHANNELS.STARTUP_STATUS]: () => fixtureStartupStatus,

  // pi
  [PI_CHANNELS.EXECUTE]: () => fixturePiExecuteResult,
  [PI_CHANNELS.ABORT]: () => ({ ok: true }),
  [PI_CHANNELS.GET_STATUS]: () => ({ available: true }),
  [PI_CHANNELS.STREAM_EVENT]: () => undefined, // canal de EVENTO — nunca invocado

  // localAi — o main devolve valores NUS (sem envelope) neste grupo.
  [LOCAL_AI_CHANNELS.DETECT_HARDWARE]: () => fixtureHardwareInfo,
  [LOCAL_AI_CHANNELS.RECOMMEND]: () => fixtureLocalModels.find((m) => m.recommended) ?? fixtureLocalModels[0],
  [LOCAL_AI_CHANNELS.LIST]: () => fixtureLocalModels,
  [LOCAL_AI_CHANNELS.DOWNLOAD]: (raw) => ({
    ok: true,
    path: `/home/aluno/.config/study-method/models/${String(raw ?? 'modelo')}.gguf`,
  }),
  [LOCAL_AI_CHANNELS.DOWNLOAD_PROGRESS]: () => undefined, // canal de EVENTO
  [LOCAL_AI_CHANNELS.DELETE]: () => ({ ok: true }),
  [LOCAL_AI_CHANNELS.GET_ACTIVE]: () => fixtureLocalModels.find((m) => m.active)?.id ?? null,
  [LOCAL_AI_CHANNELS.SET_ACTIVE]: () => ({ ok: true }),
  [LOCAL_AI_CHANNELS.CHAT]: () => fixtureLocalAiChat,

  // study (fluxo legado de geração + persistência)
  [STUDY_CHANNELS.RESOLVE_SKILL_DIR]: () => ({ skillDir: '/home/aluno/.claude/skills/study-method' }),
  [STUDY_CHANNELS.GET_SETUPS]: () => ({
    rows: [
      {
        setupId: 'setup-1',
        setupRoot: `${fixtureSettings.setupsDir ?? '/home/aluno/StudyMethod/setups'}/funcoes-em-python`,
        subjectSlug: 'funcoes-em-python',
      },
    ],
  }),
  [STUDY_CHANNELS.CREATE_SETUP]: () => ({
    setupId: 'setup-1',
    setupRoot: `${fixtureSettings.setupsDir ?? '/home/aluno/StudyMethod/setups'}/funcoes-em-python`,
  }),
  [STUDY_CHANNELS.NEW_SESSION]: () => ({ sessionId: 'session-1' }),
  // `study:plan-lesson` não tem handler real no main (canal nunca registado);
  // o mock devolve um plano plausível para a story não ficar pendente.
  [STUDY_CHANNELS.PLAN_LESSON]: () => ({
    ok: true,
    plan: { title: 'Funções em Python', sections: ['O que é uma função?', 'Parâmetros e retorno'] },
  }),
  [STUDY_CHANNELS.GENERATE_LESSON]: () => ({
    lesson: fixtureStudyLesson,
    rejected: [],
    lessonId: 'lesson-1',
    subjectId: 'subject-1',
  }),
  [STUDY_CHANNELS.LESSON_PROGRESS]: () => undefined, // canal de EVENTO
  [STUDY_CHANNELS.RESEARCH_PROGRESS]: () => undefined, // canal de EVENTO
  [STUDY_CHANNELS.GET_LESSON]: () => fixtureStudyLesson,
  [STUDY_CHANNELS.GET_FINDINGS]: () => fixtureStudyFindings,
  [STUDY_CHANNELS.LIST_CHALLENGES]: () => fixtureChallengeInfos,
  [STUDY_CHANNELS.CREATE_CHALLENGE]: () => ({ challenge: fixtureChallengeInfos[0] }),
  [STUDY_CHANNELS.VERIFY_CHALLENGE]: () => ({
    verdict: 'approved',
    mutationScore: 1,
    killed: 6,
    survived: 0,
    rejections: [],
    stdout: '6 mutantes mortos em 6 (o teste rejeita todos)',
    applyExhausted: true,
  }),
  [STUDY_CHANNELS.TEST_ANSWER]: () => fixtureTestAnswerResult,
  [STUDY_CHANNELS.TEST_ANSWER_EVENT]: () => undefined, // canal de EVENTO
  [STUDY_CHANNELS.LIST_WORKSPACE_FILES]: () => fixtureWorkspaceFiles,
  [STUDY_CHANNELS.READ_WORKSPACE_FILE]: (raw) => {
    const req = (raw ?? {}) as { path?: string };
    return fixtureWorkspaceFileContents[req.path ?? ''] ?? '# ficheiro de exemplo\n';
  },
  [STUDY_CHANNELS.WRITE_WORKSPACE_FILE]: () => ({ ok: true }),
  [STUDY_CHANNELS.DELETE_WORKSPACE_FILE]: () => ({ ok: true }),
  [STUDY_CHANNELS.LIST_TOPICS]: () => fixtureSubjectTopics,
  [STUDY_CHANNELS.LIST_LESSONS_BY_SUBJECT]: () => fixtureLessonSummaries,
  [STUDY_CHANNELS.GET_LESSON_BY_ID]: () => fixtureGetLessonById,
  [STUDY_CHANNELS.RECORD_ANSWER]: () => ({ ok: true }),
  [STUDY_CHANNELS.MARK_LESSON_COMPLETED]: () => ({ ok: true }),
  [STUDY_CHANNELS.CHECK_MATH_ANSWER]: () => fixtureMathAnswerCheck,
  [STUDY_CHANNELS.JUDGE_ANSWER]: () => fixtureJudgeAnswer,
  [STUDY_CHANNELS.MARK_CHALLENGE_ATTEMPT]: (raw) => {
    const req = (raw ?? {}) as Partial<MarkChallengeAttemptRequest>;
    return {
      ok: true,
      attempt: {
        ...fixtureChallengeAttempt,
        challengeId: req.challengeId ?? fixtureChallengeAttempt.challengeId,
        verdict: req.verdict ?? fixtureChallengeAttempt.verdict,
        stars: req.stars ?? fixtureChallengeAttempt.stars,
        durationMs: req.durationMs ?? fixtureChallengeAttempt.durationMs,
      },
    };
  },
  [STUDY_CHANNELS.CLEAR_PROGRESS]: () => ({ ok: true }),

  // track (rodada 8 — conteúdo pronto)
  [TRACK_CHANNELS.LIST]: () => fixtureTrackList,
  [TRACK_CHANNELS.GET]: (raw) => {
    const req = (raw ?? {}) as { trackSlug?: string };
    return { ok: true, track: detailFor(trackEntryBySlug(req.trackSlug)) };
  },
  [TRACK_CHANNELS.LESSON]: (raw) => {
    const req = (raw ?? {}) as { lessonId?: string };
    return { ok: true, lesson: lessonFor(req.lessonId) };
  },
  [TRACK_CHANNELS.LESSON_DONE]: () => ({ ok: true }),
  [TRACK_CHANNELS.TUTOR_CHAT]: (raw) => {
    const req = (raw ?? {}) as Partial<TutorChatRequest>;
    if (req.action === 'answer') return fixtureTutorReply;
    const section = fixtureTrackTheory[req.presentedSections?.length ?? 0];
    if (!section) return { ...fixtureTutorReply, done: true };
    return {
      ok: true,
      message: section.markdown,
      sectionId: section.id,
      sectionTitle: section.title,
      done: false,
    };
  },
  [TRACK_CHANNELS.CHALLENGE_GET]: (raw) => {
    const req = (raw ?? {}) as Partial<TrackChallengeGetRequest>;
    return { ok: true, challenge: challengeSpecFor(req) };
  },
  [TRACK_CHANNELS.CHALLENGE_SUBMIT]: () => fixtureTrackSubmitResult,
  [TRACK_CHANNELS.CHALLENGE_REGENERATE]: () => fixtureTrackRegenerateResult,
  [TRACK_CHANNELS.CHALLENGE_REGENERATE_PROGRESS]: () => undefined, // canal de EVENTO
  [TRACK_CHANNELS.PROFICIENCY_GET]: () => ({ ok: true, challenge: proficiencySpec }),
  [TRACK_CHANNELS.PROFICIENCY_SUBMIT]: () => proficiencySubmitResult,
  [TRACK_CHANNELS.ORPHANS]: () => fixtureTrackOrphans,
  [TRACK_CHANNELS.PURGE_ORPHANS]: () => ({
    ok: true,
    removed: fixtureTrackOrphans.ok ? fixtureTrackOrphans.orphans : [],
    skipped: [],
  }),
  [TRACK_CHANNELS.QUIZ_ATTEMPT]: (raw) => {
    const req = (raw ?? {}) as Partial<QuizAttemptRequest>;
    return {
      ok: true,
      attempt: {
        ...fixtureQuizAttemptDto,
        lessonId: req.lessonId ?? fixtureQuizAttemptDto.lessonId,
        sectionKey: req.sectionKey ?? fixtureQuizAttemptDto.sectionKey,
        assertionId: req.assertionId ?? fixtureQuizAttemptDto.assertionId,
        selectedIndex: req.selectedIndex ?? fixtureQuizAttemptDto.selectedIndex,
        correct: req.correct ?? fixtureQuizAttemptDto.correct,
      },
      mastery: fixtureQuizAttemptReply.ok ? fixtureQuizAttemptReply.mastery : [],
    };
  },
  [TRACK_CHANNELS.QUIZ_EXPLAIN]: () => fixtureQuizExplainReply,
  [TRACK_CHANNELS.QUIZ_REMEDIAL]: () => fixtureQuizRemedialReply,
  [TRACK_CHANNELS.QUIZ_HISTORY]: () => fixtureQuizHistoryReply,

  // games (ONDA-GAMES)
  [GAMES_CHANNELS.LIST_WORLDS]: () => fixtureGameWorlds,
  [GAMES_CHANNELS.LOAD_LEVEL]: (_worldId, levelId) => ({
    ...fixtureGameLevelPayload,
    id: typeof levelId === 'string' && levelId ? levelId : fixtureGameLevelPayload.id,
  }),
  [GAMES_CHANNELS.RUN]: () => fixtureGameRunResult,

  // stt (voz local — envelope { success, data?, error? })
  [STT_CHANNELS.MODEL_STATUS]: () => voiceOk(fixtureSttModelStatuses),
  [STT_CHANNELS.MODEL_DOWNLOAD]: (raw) =>
    voiceOk({
      ...fixtureSttModelStatuses[0],
      modelId: typeof raw === 'string' ? raw : fixtureSttModelStatuses[0].modelId,
      state: 'downloading',
      progress: 0.42,
    }),
  [STT_CHANNELS.MODEL_DOWNLOAD_PROGRESS]: () => undefined, // canal de EVENTO
  [STT_CHANNELS.MODEL_CANCEL]: () => voiceOk({ cancelled: true }),
  [STT_CHANNELS.MODEL_DELETE]: (raw) =>
    voiceOk({
      modelId: typeof raw === 'string' ? raw : fixtureSttModelStatuses[0].modelId,
      state: 'absent',
      embedded: false,
      downloadedBytes: 0,
      totalBytes: 0,
      progress: 0,
    }),
  [STT_CHANNELS.STREAM_START]: (raw) => {
    const req = (raw ?? {}) as { sessionId?: string };
    return voiceOk({ sessionId: req.sessionId ?? 'mic' });
  },
  [STT_CHANNELS.STREAM_CHUNK]: () => voiceOk(undefined),
  [STT_CHANNELS.STREAM_STOP]: () => voiceOk({ text: 'explique-me o que é uma variável' }),
  [STT_CHANNELS.STREAM_CANCEL]: () => voiceOk(undefined),
  [STT_CHANNELS.STREAM_PARTIAL]: () => undefined, // canal de EVENTO
  [STT_CHANNELS.ENGINE_STATUS]: () => undefined, // canal de EVENTO

  // localTts (voz local) — `generate`/`get-preference` são valor NU no
  // ApiSchema (é assim que a narração do onboarding lê `res.audioBase64`);
  // os restantes usam o envelope dos handlers reais.
  [TTS_CHANNELS.LIST]: () => voiceOk(fixtureTtsModels),
  [TTS_CHANNELS.DOWNLOAD]: (raw) => voiceOk({ modelId: typeof raw === 'string' ? raw : fixtureTtsModels[0].id }),
  [TTS_CHANNELS.DOWNLOAD_PROGRESS]: () => undefined, // canal de EVENTO
  [TTS_CHANNELS.CANCEL_DOWNLOAD]: () => voiceOk({ cancelled: true }),
  [TTS_CHANNELS.DELETE]: () => voiceOk({ deleted: true }),
  [TTS_CHANNELS.GENERATE]: () => fixtureTtsGenerateResult,
  [TTS_CHANNELS.CANCEL_GENERATE]: () => voiceOk(undefined),
  [TTS_CHANNELS.GET_PREFERENCE]: () => fixtureTtsPreference,
  [TTS_CHANNELS.SET_PREFERENCE]: () => voiceOk(undefined),
};

// ─── Fábrica: createExposedApi sobre um IpcBridgeLike falso ──────────────────

const fakeIpc: IpcBridgeLike = {
  invoke: (channel: string, ...args: unknown[]): Promise<unknown> => {
    const handler = (channelHandlers as Record<string, ChannelHandler | undefined>)[channel];
    // Regra do mock: NUNCA rejeita e NUNCA fica pendente. Canal fora do
    // contrato resolve undefined (só acontece se o preload derivar um canal
    // novo antes de este mapa o conhecer).
    return Promise.resolve(handler ? handler(...args) : undefined);
  },
  // Os `on*` são registados pelo envoltório de método (ver wrapMethod) — aqui
  // só é preciso devolver um unsubscribe inofensivo.
  on: () => () => {},
};

/** Callbacks registados por método de evento: `'grupo.metodo'` → callbacks. */
const eventListeners = new Map<string, Set<UnknownListener>>();

function eventKey(group: string, method: string): string {
  return `${group}.${method}`;
}

/**
 * Envolve UM método para registar o callback dos métodos de evento. O teste é
 * de FORMA (1º argumento função + retorno função = subscrição com unsubscribe),
 * o que cobre os métodos derivados do `createExposedApi` E os overrides sem
 * duplicar a derivação de nomes de canal do preload.
 */
function wrapMethod(
  group: string,
  method: string,
  fn: (...args: unknown[]) => unknown,
): (...args: unknown[]) => unknown {
  return (...args: unknown[]): unknown => {
    const result = fn(...args);
    const listener = args[0];
    if (typeof listener !== 'function' || typeof result !== 'function') return result;
    const cb = listener as UnknownListener;
    const key = eventKey(group, method);
    let set = eventListeners.get(key);
    if (!set) {
      set = new Set<UnknownListener>();
      eventListeners.set(key, set);
    }
    const listeners = set;
    listeners.add(cb);
    const stop = result as () => void;
    // Unsubscribe real (remove o callback e chama o do transporte) — inofensivo
    // se a story o ignorar ou chamar duas vezes.
    return () => {
      listeners.delete(cb);
      stop();
    };
  };
}

// ─── Overrides (merge por método) ────────────────────────────────────────────

/**
 * Substituições por GRUPO e MÉTODO — ex.:
 * `installMockApi({ track: { list: async () => fixtureMinhaTrilha } })`.
 * O merge é profundo por método: só os métodos escritos são substituídos, os
 * restantes do grupo (e os outros grupos) ficam com os valores do mock.
 */
export type MockApiOverrides = {
  [G in keyof ApiSchema]?: { [M in keyof ApiSchema[G]]?: ApiSchema[G][M] };
};

function applyOverrides(
  base: Record<string, Record<string, unknown>>,
  overrides: MockApiOverrides,
): void {
  const byGroup = overrides as unknown as Record<string, Record<string, unknown> | undefined>;
  for (const [group, methods] of Object.entries(byGroup)) {
    if (!methods) continue;
    base[group] = { ...(base[group] ?? {}), ...methods };
  }
}

// ─── API pública do mock ─────────────────────────────────────────────────────

/**
 * Cria um `ApiSchema` completo e determinístico: TODOS os métodos resolvem com
 * dados realistas (fixtures) — nunca lançam, nunca ficam pendentes. Os métodos
 * de evento devolvem um unsubscribe e guardam o callback para `emitMockEvent`.
 */
export function createMockApi(overrides?: MockApiOverrides): ApiSchema {
  const derived = createExposedApi(fakeIpc) as unknown as Record<string, Record<string, unknown>>;
  const merged: Record<string, Record<string, unknown>> = {};
  for (const [group, methods] of Object.entries(derived)) merged[group] = { ...methods };
  if (overrides) applyOverrides(merged, overrides);
  // O envoltório cobre também os overrides: um método de evento substituído
  // continua alcançável por `emitMockEvent`.
  for (const [group, methods] of Object.entries(merged)) {
    for (const [method, fn] of Object.entries(methods)) {
      methods[method] = wrapMethod(group, method, fn as (...args: unknown[]) => unknown);
    }
  }
  return merged as unknown as ApiSchema;
}

/** Instalação atual (para uma instalação subsequente a substituir de forma limpa). */
let installed: ApiSchema | null = null;

/**
 * Cria o mock, injeta-o no slot de `getApi()` (`__setApiForTests`) e devolve-o.
 * Uma chamada subsequente substitui a instalação anterior de forma limpa.
 */
export function installMockApi(overrides?: MockApiOverrides): ApiSchema {
  if (installed) resetMockApi();
  eventListeners.clear();
  const api = createMockApi(overrides);
  installed = api;
  __setApiForTests(api);
  return api;
}

/** Desinstala o mock: descarta os listeners e restaura o slot de `getApi()`. */
export function resetMockApi(): void {
  installed = null;
  eventListeners.clear();
  __resetApiForTests();
}

/** Só os métodos de EVENTO de cada grupo (`on*` que assinam e devolvem unsubscribe). */
export type MockEventMethod<G extends keyof ApiSchema> = {
  [M in keyof ApiSchema[G]]: ApiSchema[G][M] extends (cb: (ev: infer _E) => void) => () => void
    ? M
    : never;
}[keyof ApiSchema[G]] &
  keyof ApiSchema[G];

/** Payload que o método de evento `M` de `G` entrega ao callback. */
export type MockEventPayload<G extends keyof ApiSchema, M extends keyof ApiSchema[G]> =
  ApiSchema[G][M] extends (cb: (ev: infer E) => void) => () => void ? E : never;

/**
 * Despacha UM evento para os callbacks registados pelos métodos de evento do
 * mock — é o push main→renderer simulado (stories de loading/progresso):
 *
 *   emitMockEvent('track', 'onChallengeRegenerateProgress', { stage: 'generating' });
 *
 * Sem subscrições ativas é um no-op; nunca lança.
 */
export function emitMockEvent<G extends keyof ApiSchema, M extends MockEventMethod<G>>(
  group: G,
  method: M,
  ev: MockEventPayload<G, M>,
): void {
  const listeners = eventListeners.get(eventKey(String(group), String(method)));
  if (!listeners) return;
  for (const cb of listeners) cb(ev);
}

// Reexport conveniente: as stories conseguem emitir payloads dos fixtures sem
// outro import (ex.: emitMockEvent('localAi', 'onDownloadProgress', fixtureDownloadProgress)).
export { fixtureDownloadProgress };