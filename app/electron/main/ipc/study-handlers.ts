/**
 * electron/main/ipc/study-handlers.ts — handlers IPC do estudo (pesquisa/aulas/
 * editor da skill study-method).
 *
 * Canais (contrato congelado em shared/ipc-contract.ts, STUDY_CHANNELS):
 *   resolve-skill-dir · get-setups · create-setup · new-session · generate-lesson
 *   get-lesson · get-findings · list-challenges · create-challenge ·
 *   verify-challenge · test-answer · list/read/write/delete-workspace-file.
 *
 * `buildStudyHandlers(deps)` é PURA (Map<canal, handler>; não toca electron nem
 * a skill); `registerStudyHandlers(deps)` liga o map ao ipcMain REAL via
 * safeHandle — idempotente com os placeholders de ipc/index.ts (removeHandler
 * antes de handle) e com re-registros. O canal `study:plan-lesson` NÃO é tocado
 * aqui: fica com o placeholder (não faz parte desta onda — ver handoff).
 *
 * Estado em memória de módulo (não persistido):
 *   - `lastGenerateResult`: o gerado por `study:generate-lesson`, para
 *     `study:get-lesson` / `study:get-findings`;
 *   - `lastSetupRoot` / `lastSetupId`: setup materializado pelo último
 *     `study:generate-lesson` (capturado no progresso `materializing` do
 *     orchestrator, com fallback derivado do workspaceDir do 1º desafio).
 *     Falback dos handlers que pedem setupRoot quando o invoke não o passa
 *     (list-challenges, create-challenge, workspace files).
 *
 * Filesystem de workspace: operações RESTRITAS ao workspaceDir informado —
 * o path resolve é validado por contenção (mesmo padrão `containedIn` do runner);
 * nunca se lê/escreve fora.
 *
 * CONVENÇÃO DE SHAPE (uniformizada na onda 4 — os retornos seguem o tipo tipado
 * do contrato DIRETO, sem wrapper, salvo quando o handler naturalmente precisa
 * de metadados):
 *   - list-challenges      → ChallengeInfo[]   (SEM `{challenges}`)
 *   - list-workspace-files → WorkspaceFile[]   (SEM `{files}`)
 *   - read-workspace-file  → string content pura (SEM `{content, encoding}`;
 *     encoding é sempre utf8 e a UI consome a string; se precisar expor encoding
 *     no futuro, vira um canal separado)
 *   - test-answer          → TestAnswerResult direto
 *   - get-lesson           → StudyLesson direto;  get-findings → StudyFinding[]
 *   - Demais canais devolvem o OBJETO natural do domínio:
 *       resolve-skill-dir → { skillDir } · get-setups → { rows }
 *       create-setup → { setupId, setupRoot } · new-session → { sessionId }
 *       generate-lesson → { lesson, rejected } (o rejected é metadado do processo)
 *       create-challenge → { challenge: {...} } · verify-challenge → `{...verdict}`
 *       write/delete-workspace-file → { ok }.
 */
import { promises as fsp } from 'node:fs';
import * as path from 'node:path';

import type {
  ChallengeInfo,
  LessonRow,
  LessonSummary,
  StudyLesson,
  SubjectSummary,
  TestAnswerResult,
  WorkspaceFile,
} from '@shared/ipc-contract';
import { STUDY_CHANNELS } from '@shared/ipc-contract';
import type { LessonProgress } from '../services/lessonTypes';
import { safeHandleMap, type IpcMainHandleLike, type IpcHandlerFn } from './safeHandle';

/** Conjunto de métodos do lesson-orchestrator que os handlers usam. */
export interface LessonServiceLike {
  generateLesson(subject: string, opts?: { onProgress?: (p: LessonProgress) => void; language?: string; goal?: string }): Promise<{ lesson: StudyLesson; rejected: unknown[] }>;
  testAnswer(challengeDir: string, opts?: { outputLimit?: number }): Promise<TestAnswerResult>;
  listSetups(): Promise<{ rows: Array<{ setupId: string; setupRoot: string; subjectSlug?: string }> }>;
  resolveSkillDirInfo(): Promise<{ skillDir: string }>;
}

/** Conjunto de métodos do runner que os handlers usam. */
export interface RunnerLike {
  resolveSkillDir(): Promise<string>;
  createSetup(spec: {
    path: string;
    subject: string;
    subjectSlug: string;
    title: string;
    language?: string;
    skillLevel?: string;
    sessionMinutes?: number;
    theorySource?: string;
  }): Promise<{ setupId: string; setupRoot: string }>;
  newSession(setupRoot: string, goal?: string): Promise<string>;
  createChallenge(
    setupRoot: string,
    c: { language: string; slug: string; concept: string; difficulty?: number; skillLevel?: string }
  ): Promise<{ challengeDirAbs: string; relativePath: string }>;
  verifyChallenge(challengeDir: string, opts?: { sampleSize?: number; nRep?: number; threshold?: number }): Promise<{
    verdict: string;
    mutationScore?: number;
    killed?: number;
    survived?: number;
    rejections: string[];
    stdout: string;
    applyExhausted?: boolean;
  }>;
  testStudentAnswer(challengeDir: string, opts?: { outputLimit?: number }): Promise<{
    success: boolean;
    exitCode: number;
    passed: boolean;
    testsRun: number | null;
    expectedTests: number | null;
    verdict?: string;
    output: string;
  }>;
}

/**
 * Subconjunto da camada SQL (db/repo.ts) usado pelos handlers de persistência
 * da onda 3 (seleção de aulas). OPCIONAL em `StudyHandlerDeps` — quando ausente,
 * os canais study:list-topics/list-lessons-by-subject/get-lesson-by-id/
 * record-answer/mark-lesson-completed respondem de forma graciosa (lista vazia/
 * null/{ok:false}), para não quebrar os testes existentes nem o harness E2E que
 * injetam deps sem repo.
 */
export interface LessonPersistenceLike {
  listSubjects(): Promise<SubjectSummary[]>;
  listLessonsBySubject(subjectSlug: string): Promise<LessonSummary[]>;
  getLessonById(id: string): Promise<LessonRow | null>;
  recordAnswer(lessonId: string, answerText: string): Promise<void>;
  markLessonCompleted(id: string): Promise<void>;
}

export interface StudyHandlerDeps {
  /** Subconjunto do StudyMethodRunner usado pelos handlers. */
  runner: RunnerLike;
  /** Subconjunto do LessonOrchestrator. */
  lesson: LessonServiceLike;
  /** Emite um evento para a UI (ex.: webContents.send). */
  emit: (channel: string, ev: unknown) => void;
  /** OPCIONAL (onda 3): repo de persistência das aulas. Ausente → canais de
   *  persistência respondem gracioso ([]{lesson:null}/{ok:false,error}). */
  repo?: LessonPersistenceLike;
}

/** Estado em memória de módulo (get-lesson/get-findings/list-challenges/workspace). */
interface StudyMemory {
  lastGenerateResult: { lesson: StudyLesson; rejected: unknown[] } | null;
  lastFindings: StudyLesson['findings'] | null;
  lastSetupRoot: string | null;
  /** Id do setup do último generateLesson (aditivo fix15-list-challenges). */
  lastSetupId: string | null;
  /** Provider lazy de resolveSkillDir (setado por buildStudyHandlers). */
  lastSkillDirProvider: (() => Promise<string>) | null;
}
const memory: StudyMemory = {
  lastGenerateResult: null,
  lastFindings: null,
  lastSetupRoot: null,
  lastSetupId: null,
  lastSkillDirProvider: null,
};

/** (testes) zera o estado em memória dos handlers study:*. Não usado em runtime. */
export function __resetStudyHandlersMemory(): void {
  memory.lastGenerateResult = null;
  memory.lastFindings = null;
  memory.lastSetupRoot = null;
  memory.lastSetupId = null;
  memory.lastSkillDirProvider = null;
}

/** Extensão → linguagem (tabela do contrato dos arquivos de workspace). */
export function languageForFile(name: string): string | undefined {
  const ext = path.extname(name).toLowerCase();
  switch (ext) {
    case '.py':
      return 'python';
    case '.mjs':
    case '.js':
      return 'javascript';
    case '.go':
      return 'go';
    case '.rs':
      return 'rust';
    case '.c':
    case '.h':
      return 'c';
    case '.md':
      return 'markdown';
    case '.json':
      return 'json';
    default:
      return undefined;
  }
}

/**
 * Resolve `rel` (caminho relativo do workspace) para um path ABSOLUTO garantidamente
 * DENTRO de `workspaceDir`. Devolve { path } ou { error }. Nunca lê/escreve fora.
 */
export function resolveContainedWorkspacePath(
  workspaceDir: string,
  rel: unknown,
): { path: string } | { error: string } {
  if (typeof workspaceDir !== 'string' || !workspaceDir.trim()) {
    return { error: 'study: workspaceDir vazio/ausente.' };
  }
  if (typeof rel !== 'string' || rel.trim() === '') {
    return { error: 'study: `path` (relativo ao workspace) é obrigatório.' };
  }
  const base = path.resolve(workspaceDir);
  const target = path.resolve(base, rel);
  const relCheck = path.relative(base, target);
  if (relCheck === '' || relCheck.startsWith('..') || path.isAbsolute(relCheck)) {
    return { error: `study: path fora do workspace (traversal rejeitado): ${rel}` };
  }
  return { path: target };
}

/** Lê todos os desafios `<setupRoot>/challenges/<NNNN>-<slug>/meta.json` como ChallengeInfo. */
async function listChallengesFrom(setupRoot: string): Promise<ChallengeInfo[]> {
  const challengesRoot = path.join(setupRoot, 'challenges');
  let entries;
  try {
    entries = await fsp.readdir(challengesRoot, { withFileTypes: true });
  } catch {
    return []; // sem challenges/ ⇒ lista vazia (setup novo).
  }
  const infos: ChallengeInfo[] = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const chDir = path.join(challengesRoot, ent.name);
    let meta: Record<string, unknown>;
    try {
      const raw = await fsp.readFile(path.join(chDir, 'meta.json'), 'utf8');
      meta = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      continue; // meta.json ausente/ilegível: ignora este diretório.
    }
    const base = ent.name;
    const id = /^[0-9]{4}/.exec(base)?.[0] ?? '';
    const artifacts = (meta.artifacts ?? {}) as Record<string, unknown>;
    infos.push({
      challengeId: typeof meta.challenge_id === 'string' ? meta.challenge_id : id,
      title: typeof meta.title === 'string' ? meta.title : base,
      language: typeof meta.language === 'string' ? meta.language : '',
      concept:
        Array.isArray(meta.target_concepts) && (meta.target_concepts[0] as Record<string, unknown>)?.concept_id
          ? String((meta.target_concepts[0] as Record<string, unknown>).concept_id)
          : '',
      difficulty: typeof meta.difficulty === 'number' ? meta.difficulty : 0,
      status: 'validated',
      verdict: typeof meta.verdict === 'string' ? meta.verdict : 'unknown',
      workspaceDir: chDir,
      statementPath: path.join(chDir, String(artifacts.statement_path ?? 'README.md')),
    });
  }
  return infos;
}

/**
 * Verifica se a skill existe (delega ao runner.resolveSkillDir) e devolve o
 * diretório. Se a skill estiver ausente, propaga o erro claro do runner (ou uma
 * mensagem própria quando o provider ainda não foi ligado).
 */
async function skillDirOrThrow(): Promise<string> {
  if (!memory.lastSkillDirProvider) {
    throw new Error(
      'study: resolve-skill-dir chamado antes de buildStudyHandlers (provider não ligado).'
    );
  }
  return memory.lastSkillDirProvider();
}

/** Resultado normalizado do payload de `study:generate-lesson`. */
interface NormalizedGenerateLesson {
  subject: string;
  language?: string;
  goal?: string;
}

/**
 * Normaliza o payload de `study:generate-lesson`. O renderer chama com uma
 * STRING AVULSA (subject.trim()), mas o contrato também permite um objeto
 * `{ subject, language?, goal? }`. Devolve um objeto normalizado ou lança um
 * erro claro quando o shape é inválido (subject ausente/vazio).
 */
export function normalizeGenerateLessonPayload(payload: unknown): NormalizedGenerateLesson {
  if (typeof payload === 'string') {
    const subject = payload.trim();
    if (!subject) throw new Error('study: generate-lesson requer `subject` (string não vazia).');
    return { subject, language: undefined, goal: undefined };
  }
  const p = (payload ?? {}) as Record<string, unknown>;
  const subject = typeof p.subject === 'string' ? p.subject.trim() : '';
  if (!subject) throw new Error('study: generate-lesson requer `subject` (string não vazia).');
  return {
    subject,
    language: typeof p.language === 'string' ? p.language : undefined,
    goal: typeof p.goal === 'string' ? p.goal : undefined,
  };
}

/**
 * Monta o mapa canal→handler (PURA). `deps.runner` injeta o runner; `deps.lesson`
 * injeta o orchestrator; `deps.emit` é o canal para a UI.
 */
export function buildStudyHandlers(deps: StudyHandlerDeps): Map<string, IpcHandlerFn> {
  const { runner, lesson, emit, repo } = deps;
  memory.lastSkillDirProvider = () => runner.resolveSkillDir();

  const map: Map<string, IpcHandlerFn> = new Map();

  map.set(STUDY_CHANNELS.RESOLVE_SKILL_DIR, async (): Promise<{ skillDir: string }> => {
    const dir = await skillDirOrThrow();
    return { skillDir: dir };
  });

  map.set(STUDY_CHANNELS.GET_SETUPS, async (): Promise<{ rows: Array<{ setupId: string; setupRoot: string; subjectSlug?: string }> }> => {
    return lesson.listSetups();
  });

  map.set(STUDY_CHANNELS.CREATE_SETUP, async (_event, spec: unknown): Promise<{ setupId: string; setupRoot: string }> => {
    const s = (spec ?? {}) as Record<string, unknown>;
    if (typeof s.path !== 'string' || !s.path.trim()) throw new Error('study: create-setup requer `path`.');
    if (typeof s.subject !== 'string' || !s.subject.trim()) throw new Error('study: create-setup requer `subject`.');
    if (typeof s.title !== 'string' || !s.title.trim()) throw new Error('study: create-setup requer `title`.');
    const created = await runner.createSetup({
      path: s.path,
      subject: s.subject,
      subjectSlug: typeof s.subjectSlug === 'string' ? s.subjectSlug : s.subject,
      title: s.title,
      language: typeof s.language === 'string' ? s.language : undefined,
      skillLevel: typeof s.skillLevel === 'string' ? s.skillLevel : undefined,
    });
    memory.lastSetupRoot = created.setupRoot;
    return created;
  });

  map.set(STUDY_CHANNELS.NEW_SESSION, async (_event, payload: unknown): Promise<{ sessionId: string }> => {
    const p = (payload ?? {}) as Record<string, unknown>;
    const setupRoot =
      (typeof p.setupRoot === 'string' && p.setupRoot.trim()) ? p.setupRoot : memory.lastSetupRoot;
    if (!setupRoot) throw new Error('study: new-session requer `setupRoot` (ou crie um setup antes).');
    const goal = typeof p.goal === 'string' ? p.goal : undefined;
    const sessionId = await runner.newSession(setupRoot, goal);
    memory.lastSetupRoot = setupRoot;
    return { sessionId };
  });

  map.set(STUDY_CHANNELS.GENERATE_LESSON, async (_event, payload: unknown) => {
    // Fix15c-review: zera o setup do generate ANTERIOR NO INÍCIO — se esta
    // geração falhar ANTES do `materializing` (ex.: pesquisa falha), o
    // list-challenges não deve usar o setupRoot velho de outro generate.
    memory.lastSetupRoot = null;
    memory.lastSetupId = null;
    // Aceita uma STRING AVULSA (subject, como a UI chama: generateLesson(subject))
    // OU um objeto `{ subject, language?, goal? }`. Normaliza para o objeto antes
    // de delegar ao lesson-orchestrator (que aceita subject string).
    const normalized = normalizeGenerateLessonPayload(payload);
    const result = await lesson.generateLesson(normalized.subject, {
      onProgress: (prog: LessonProgress) => {
        // Fix15-list-challenges: o orchestrator expõe o setup materializado na
        // fase `materializing` (setupRoot/setupId). Gravamos aqui ANTES de
        // responder — assim o fluxo "gerar aula → listar desafios" funciona sem a
        // UI repassar setupRoot (e como fallback robusto do list-challenges).
        if (prog.setupRoot && typeof prog.setupRoot === 'string' && prog.setupRoot.trim()) {
          memory.lastSetupRoot = prog.setupRoot.trim();
          memory.lastSetupId =
            prog.setupId && typeof prog.setupId === 'string' && prog.setupId.trim()
              ? prog.setupId.trim()
              : null;
        }
        emit(STUDY_CHANNELS.LESSON_PROGRESS, prog);
      },
      language: normalized.language,
      goal: normalized.goal,
    });
    memory.lastGenerateResult = result;
    memory.lastFindings = result.lesson.findings;
    // Fallback defensivo: se o setupRoot não chegou pelo progresso (ex.: um stub
    // de lesson sem emit), deriva do workspaceDir do 1º desafio aprovado
    // (<setupRoot>/challenges/<NNNN>-<slug> → dirname(dirname(workspaceDir))).
    if (!memory.lastSetupRoot) {
      const first = result.lesson.challenges?.[0];
      if (first?.workspaceDir) {
        const parent = path.dirname(first.workspaceDir);
        const derived = path.dirname(parent);
        if (derived && path.basename(parent) === 'challenges') {
          memory.lastSetupRoot = derived;
        }
      }
    }
    return result; // { lesson, rejected }
  });

  map.set(STUDY_CHANNELS.GET_LESSON, async (): Promise<StudyLesson> => {
    if (!memory.lastGenerateResult) throw new Error('study: nenhuma aula gerada ainda.');
    return memory.lastGenerateResult.lesson;
  });

  map.set(STUDY_CHANNELS.GET_FINDINGS, async () => {
    if (!memory.lastFindings) throw new Error('study: nenhuma aula gerada ainda (sem findings).');
    return memory.lastFindings;
  });

  // Contrato (shared/ipc-contract.ts → ApiSchema): listChallenges devolve
  // ChallengeInfo[] DIRETO (sem wrapper `{challenges}`) — a UI faz `.map()`.
  map.set(STUDY_CHANNELS.LIST_CHALLENGES, async (_event, payload: unknown): Promise<ChallengeInfo[]> => {
    const p = (payload ?? {}) as Record<string, unknown>;
    const setupRoot =
      (typeof p.setupRoot === 'string' && p.setupRoot.trim()) ? p.setupRoot : memory.lastSetupRoot;
    if (!setupRoot) throw new Error('study: list-challenges requer `setupRoot` (ou um setup já usado).');
    const challenges = await listChallengesFrom(setupRoot);
    memory.lastSetupRoot = setupRoot;
    return challenges;
  });

  map.set(STUDY_CHANNELS.CREATE_CHALLENGE, async (_event, payload: unknown) => {
    const p = (payload ?? {}) as Record<string, unknown>;
    const setupRoot =
      (typeof p.setupRoot === 'string' && p.setupRoot.trim()) ? p.setupRoot : memory.lastSetupRoot;
    if (!setupRoot) throw new Error('study: create-challenge requer `setupRoot`.');
    if (typeof p.language !== 'string' || !p.language.trim()) throw new Error('study: create-challenge requer `language`.');
    if (typeof p.slug !== 'string' || !p.slug.trim()) throw new Error('study: create-challenge requer `slug`.');
    if (typeof p.concept !== 'string' || !p.concept.trim()) throw new Error('study: create-challenge requer `concept`.');
    const ch = await runner.createChallenge(setupRoot, {
      language: p.language,
      slug: p.slug,
      concept: p.concept,
      difficulty: typeof p.difficulty === 'number' ? p.difficulty : undefined,
      skillLevel: typeof p.skillLevel === 'string' ? p.skillLevel : undefined,
    });
    memory.lastSetupRoot = setupRoot;
    return { challenge: ch };
  });

  map.set(STUDY_CHANNELS.VERIFY_CHALLENGE, async (_event, payload: unknown) => {
    const p = (payload ?? {}) as Record<string, unknown>;
    if (typeof p.challengeDir !== 'string' || !p.challengeDir.trim()) {
      throw new Error('study: verify-challenge requer `challengeDir`.');
    }
    const verdict = await runner.verifyChallenge(p.challengeDir);
    return { ...verdict };
  });

  map.set(STUDY_CHANNELS.TEST_ANSWER, async (_event, payload: unknown): Promise<TestAnswerResult> => {
    const p = (payload ?? {}) as Record<string, unknown>;
    if (typeof p.challengeDir !== 'string' || !p.challengeDir.trim()) {
      throw new Error('study: test-answer requer `challengeDir`.');
    }
    emit(STUDY_CHANNELS.TEST_ANSWER_EVENT, { phase: 'started', challengeDir: p.challengeDir });
    try {
      const result = await lesson.testAnswer(p.challengeDir);
      emit(STUDY_CHANNELS.TEST_ANSWER_EVENT, {
        phase: 'done',
        challengeDir: p.challengeDir,
        result,
      });
      return result;
    } catch (err) {
      emit(STUDY_CHANNELS.TEST_ANSWER_EVENT, {
        phase: 'done',
        challengeDir: p.challengeDir,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  });

  // ─── workspace files (FS restrito ao workspaceDir) ──────────────────────────
  // Contrato: listWorkspaceFiles devolve WorkspaceFile[] DIRETO (sem wrapper).
  map.set(STUDY_CHANNELS.LIST_WORKSPACE_FILES, async (_event, payload: unknown): Promise<WorkspaceFile[]> => {
    const p = (payload ?? {}) as Record<string, unknown>;
    const workspaceDir =
      (typeof p.workspaceDir === 'string' && p.workspaceDir.trim()) ? p.workspaceDir : memory.lastSetupRoot;
    if (!workspaceDir) throw new Error('study: list-workspace-files requer `workspaceDir`.');
    const base = path.resolve(workspaceDir);
    return await listFilesRecursive(base, base);
  });

  // Contrato: readWorkspaceFile devolve a STRING `content` DIRETA (sem wrapper
  // `{content, encoding}` — o encoding é sempre utf8 e a UI (EditorPane /
  // ChallengeView) consume a string pura. Se um dia for preciso expor o
  // encoding, ele vira um canal separado.
  map.set(STUDY_CHANNELS.READ_WORKSPACE_FILE, async (_event, payload: unknown): Promise<string> => {
    const p = (payload ?? {}) as Record<string, unknown>;
    const workspaceDir = (typeof p.workspaceDir === 'string' && p.workspaceDir.trim()) ? p.workspaceDir : memory.lastSetupRoot;
    if (!workspaceDir) throw new Error('study: read-workspace-file requer `workspaceDir`.');
    const resolved = resolveContainedWorkspacePath(workspaceDir, p.path);
    if ('error' in resolved) throw new Error(resolved.error);
    return await fsp.readFile(resolved.path, 'utf8');
  });

  map.set(STUDY_CHANNELS.WRITE_WORKSPACE_FILE, async (_event, payload: unknown): Promise<{ ok: boolean }> => {
    const p = (payload ?? {}) as Record<string, unknown>;
    const workspaceDir = (typeof p.workspaceDir === 'string' && p.workspaceDir.trim()) ? p.workspaceDir : memory.lastSetupRoot;
    if (!workspaceDir) throw new Error('study: write-workspace-file requer `workspaceDir`.');
    const resolved = resolveContainedWorkspacePath(workspaceDir, p.path);
    if ('error' in resolved) throw new Error(resolved.error);
    if (typeof p.content !== 'string') throw new Error('study: write-workspace-file requer `content` (string).');
    await fsp.mkdir(path.dirname(resolved.path), { recursive: true });
    await fsp.writeFile(resolved.path, p.content, 'utf8');
    return { ok: true };
  });

  map.set(STUDY_CHANNELS.DELETE_WORKSPACE_FILE, async (_event, payload: unknown): Promise<{ ok: boolean }> => {
    const p = (payload ?? {}) as Record<string, unknown>;
    const workspaceDir = (typeof p.workspaceDir === 'string' && p.workspaceDir.trim()) ? p.workspaceDir : memory.lastSetupRoot;
    if (!workspaceDir) throw new Error('study: delete-workspace-file requer `workspaceDir`.');
    const resolved = resolveContainedWorkspacePath(workspaceDir, p.path);
    if ('error' in resolved) throw new Error(resolved.error);
    await fsp.rm(resolved.path, { force: true });
    return { ok: true };
  });

  // ─── persistência (onda 3 — seleção de aulas) ──────────────────────────────
  // Ligam a camada SQL (db/repo.ts) aos canais IPC. Quando `repo` está ausente
  // (OU o input é vazio/inválido), respondem de forma GRACIOSA em vez de lançar:
  //   - list-topics             → SubjectSummary[]
  //   - list-lessons-by-subject → LessonSummary[]      (input {subjectSlug})
  //   - get-lesson-by-id        → { lesson: LessonRow|null } (input {lessonId})
  //   - record-answer           → { ok }               (input {lessonId,answerText})
  //   - mark-lesson-completed   → { ok }               (input {lessonId})
  map.set(STUDY_CHANNELS.LIST_TOPICS, async (): Promise<SubjectSummary[]> => {
    if (!repo) return [];
    return repo.listSubjects();
  });

  map.set(STUDY_CHANNELS.LIST_LESSONS_BY_SUBJECT, async (_event, payload: unknown): Promise<LessonSummary[]> => {
    if (!repo) return [];
    const p = (payload ?? {}) as Record<string, unknown>;
    const subjectSlug =
      typeof p.subjectSlug === 'string' ? p.subjectSlug.trim() : '';
    if (!subjectSlug) return [];
    return repo.listLessonsBySubject(subjectSlug);
  });

  map.set(STUDY_CHANNELS.GET_LESSON_BY_ID, async (_event, payload: unknown): Promise<{ lesson: LessonRow | null }> => {
    if (!repo) return { lesson: null };
    const p = (payload ?? {}) as Record<string, unknown>;
    const lessonId =
      typeof p.lessonId === 'string' ? p.lessonId.trim() : '';
    if (!lessonId) return { lesson: null };
    const lesson = await repo.getLessonById(lessonId);
    return { lesson };
  });

  map.set(STUDY_CHANNELS.RECORD_ANSWER, async (_event, payload: unknown): Promise<{ ok: boolean; error?: string }> => {
    if (!repo) return { ok: false, error: 'study: persistência indisponível (repo ausente).' };
    const p = (payload ?? {}) as Record<string, unknown>;
    const lessonId =
      typeof p.lessonId === 'string' ? p.lessonId.trim() : '';
    const answerText =
      typeof p.answerText === 'string' ? p.answerText.trim() : '';
    if (!lessonId || !answerText) return { ok: false, error: 'study: record-answer requer `lessonId` e `answerText`.' };
    await repo.recordAnswer(lessonId, answerText);
    return { ok: true };
  });

  map.set(STUDY_CHANNELS.MARK_LESSON_COMPLETED, async (_event, payload: unknown): Promise<{ ok: boolean; error?: string }> => {
    if (!repo) return { ok: false, error: 'study: persistência indisponível (repo ausente).' };
    const p = (payload ?? {}) as Record<string, unknown>;
    const lessonId =
      typeof p.lessonId === 'string' ? p.lessonId.trim() : '';
    if (!lessonId) return { ok: false, error: 'study: mark-lesson-completed requer `lessonId`.' };
    await repo.markLessonCompleted(lessonId);
    return { ok: true };
  });

  return map;
}

/** Lista recursiva de arquivos (dir/name/size/language por extensão). */
async function listFilesRecursive(base: string, dir: string): Promise<WorkspaceFile[]> {
  const out: WorkspaceFile[] = [];
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    const rel = path.relative(base, full);
    if (ent.isDirectory()) {
      out.push({ path: rel, name: ent.name, size: 0, dir: true });
      out.push(...(await listFilesRecursive(base, full)));
    } else if (ent.isFile()) {
      let size = 0;
      try {
        size = (await fsp.stat(full)).size;
      } catch {
        size = 0;
      }
      out.push({ path: rel, name: ent.name, size, dir: false, language: languageForFile(ent.name) });
    }
  }
  return out;
}

/**
 * Entry real: liga o mapa de handlers study:* ao ipcMain REAL via safeHandle.
 * `ipc` é opcional (testes injetam o fake); default resolve o real lazy.
 */
export async function registerStudyHandlers(deps: StudyHandlerDeps, ipc?: IpcMainHandleLike): Promise<void> {
  const map = buildStudyHandlers(deps);
  if (ipc) {
    safeHandleMap(ipc, map);
    return;
  }
  const { ipcMain } = await import('electron');
  safeHandleMap(ipcMain as IpcMainHandleLike, map);
}