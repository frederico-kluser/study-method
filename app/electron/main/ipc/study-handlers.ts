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
 *   - `lastSetupRoot`: último setup usado, fallback dos handlers que pedem
 *     setupRoot quando o invoke não o passa.
 *
 * Filesystem de workspace: operações RESTRITAS ao workspaceDir informado —
 * o path resolve é validado por contenção (mesmo padrão `containedIn` do runner);
 * nunca se lê/escreve fora.
 */
import { promises as fsp } from 'node:fs';
import * as path from 'node:path';

import type {
  ChallengeInfo,
  StudyLesson,
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

export interface StudyHandlerDeps {
  /** Subconjunto do StudyMethodRunner usado pelos handlers. */
  runner: RunnerLike;
  /** Subconjunto do LessonOrchestrator. */
  lesson: LessonServiceLike;
  /** Emite um evento para a UI (ex.: webContents.send). */
  emit: (channel: string, ev: unknown) => void;
}

/** Estado em memória de módulo (get-lesson/get-findings/list-challenges/workspace). */
interface StudyMemory {
  lastGenerateResult: { lesson: StudyLesson; rejected: unknown[] } | null;
  lastFindings: StudyLesson['findings'] | null;
  lastSetupRoot: string | null;
  /** Provider lazy de resolveSkillDir (setado por buildStudyHandlers). */
  lastSkillDirProvider: (() => Promise<string>) | null;
}
const memory: StudyMemory = {
  lastGenerateResult: null,
  lastFindings: null,
  lastSetupRoot: null,
  lastSkillDirProvider: null,
};

/** (testes) zera o estado em memória dos handlers study:*. Não usado em runtime. */
export function __resetStudyHandlersMemory(): void {
  memory.lastGenerateResult = null;
  memory.lastFindings = null;
  memory.lastSetupRoot = null;
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

/**
 * Monta o mapa canal→handler (PURA). `deps.runner` injeta o runner; `deps.lesson`
 * injeta o orchestrator; `deps.emit` é o canal para a UI.
 */
export function buildStudyHandlers(deps: StudyHandlerDeps): Map<string, IpcHandlerFn> {
  const { runner, lesson, emit } = deps;
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
    const p = (payload ?? {}) as Record<string, unknown>;
    const subject = typeof p.subject === 'string' ? p.subject.trim() : '';
    if (!subject) throw new Error('study: generate-lesson requer `subject` (string não vazia).');
    const result = await lesson.generateLesson(subject, {
      onProgress: (prog: LessonProgress) => emit(STUDY_CHANNELS.LESSON_PROGRESS, prog),
      language: typeof p.language === 'string' ? p.language : undefined,
      goal: typeof p.goal === 'string' ? p.goal : undefined,
    });
    memory.lastGenerateResult = result;
    memory.lastFindings = result.lesson.findings;
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

  map.set(STUDY_CHANNELS.LIST_CHALLENGES, async (_event, payload: unknown): Promise<{ challenges: ChallengeInfo[] }> => {
    const p = (payload ?? {}) as Record<string, unknown>;
    const setupRoot =
      (typeof p.setupRoot === 'string' && p.setupRoot.trim()) ? p.setupRoot : memory.lastSetupRoot;
    if (!setupRoot) throw new Error('study: list-challenges requer `setupRoot` (ou um setup já usado).');
    const challenges = await listChallengesFrom(setupRoot);
    memory.lastSetupRoot = setupRoot;
    return { challenges };
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
  map.set(STUDY_CHANNELS.LIST_WORKSPACE_FILES, async (_event, payload: unknown): Promise<{ files: WorkspaceFile[] }> => {
    const p = (payload ?? {}) as Record<string, unknown>;
    const workspaceDir =
      (typeof p.workspaceDir === 'string' && p.workspaceDir.trim()) ? p.workspaceDir : memory.lastSetupRoot;
    if (!workspaceDir) throw new Error('study: list-workspace-files requer `workspaceDir`.');
    const base = path.resolve(workspaceDir);
    const list = await listFilesRecursive(base, base);
    return { files: list };
  });

  map.set(STUDY_CHANNELS.READ_WORKSPACE_FILE, async (_event, payload: unknown): Promise<{ content: string; encoding: 'utf8' }> => {
    const p = (payload ?? {}) as Record<string, unknown>;
    const workspaceDir = (typeof p.workspaceDir === 'string' && p.workspaceDir.trim()) ? p.workspaceDir : memory.lastSetupRoot;
    if (!workspaceDir) throw new Error('study: read-workspace-file requer `workspaceDir`.');
    const resolved = resolveContainedWorkspacePath(workspaceDir, p.path);
    if ('error' in resolved) throw new Error(resolved.error);
    const content = await fsp.readFile(resolved.path, 'utf8');
    return { content, encoding: 'utf8' };
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