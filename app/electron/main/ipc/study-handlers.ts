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
  ChallengeAttemptRow,
  ChallengeInfo,
  GetLessonByIdResult,
  JudgeAnswerOutcome,
  JudgeAnswerRequest,
  LessonSummary,
  MarkChallengeAttemptRequest,
  MarkChallengeAttemptResult,
  MathAnswerCheckResult,
  ResearchProgressEvent,
  StudyLesson,
  SubjectSummary,
  TestAnswerResult,
  WorkspaceFile,
} from '@shared/ipc-contract';
import { STUDY_CHANNELS } from '@shared/ipc-contract';
import type { LessonDomain, LessonProgress } from '../services/lessonTypes';
import { stableChallengeSlug } from '../services/lessonOrchestrator';
import { safeHandleMap, type IpcMainHandleLike, type IpcHandlerFn } from './safeHandle';
import {
  MATH_FAMILIES,
  generateMathProblem,
  isMathFamily,
  parseMathAnswer,
  type MathFamily,
} from '../services/mathLib';
import type { AnswerJudgeLike } from '../services/answerJudge';

/** Conjunto de métodos do lesson-orchestrator que os handlers usam. */
export interface LessonServiceLike {
  generateLesson(
    subject: string,
    opts?: {
      onProgress?: (p: LessonProgress) => void;
      /** ADITIVO (onda2-research-live): events `research:*` (estudo:research-progress). */
      onResearchProgress?: (ev: ResearchProgressEvent) => void;
      language?: string;
      goal?: string;
      /** ADITIVO (onda3-respostas): domínio explícito da UI ('math' | 'programming'). */
      domain?: LessonDomain;
      /** ADITIVO (onda4): salt explícito do exercício de matemática (override). */
      mathSeed?: string;
    },
  ): Promise<{ lesson: StudyLesson; rejected: unknown[]; lessonId?: string; subjectId?: string }>;
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
  /** ONDA4+5: devolve { lesson, exercise, domain, subjectSlug, challenge } —
   * null quando a lição não existe. */
  getLessonById(id: string): Promise<GetLessonByIdResult | null>;
  recordAnswer(lessonId: string, answerText: string): Promise<void>;
  markLessonCompleted(id: string): Promise<void>;
  /**
   * ADITIVO (onda2-research-live): histórico de tentativas de um desafio —
   * usado para resolver ChallengeInfo.subjectId (challenges→lessons→subject_id
   * quando PERSISTIDO; challenge_attempts.subject_id é a única via existente
   * que mapeia challengeId→subjectId). Ausente ⇒ subjectId undefined.
   */
  getAttemptsForChallenge?(challengeId: string): Promise<Array<{ subjectId?: string }>>;
  /** ONDA4 (nunca-repetir): subject persistido pelo slug (null se não existe). */
  findSubjectBySlug?(slug: string): Promise<{ id: string; slug: string; domain: 'programming' | 'math' } | null>;
  /** ONDA4 (nunca-repetir): slugs já tentados de um subject (vazio quando nenhum). */
  listAttemptedChallengeSlugs?(subjectId: string): Promise<string[]>;
  /** ONDA4 (nunca-repetir): grava UMA tentativa (FK subject_id respeitada). */
  markChallengeAttempt?(input: {
    subjectId: string;
    lessonId: string;
    challengeId: string;
    verdict: 'passed' | 'failed' | 'timeout' | 'abandoned';
    stars?: number;
    durationMs?: number;
  }): Promise<ChallengeAttemptRow>;
  /** ONDA4 (nunca-repetir): cria/atualiza um subject (usado sob demanda no mark). */
  upsertSubject?(
    name: string,
    domain?: 'programming' | 'math',
  ): Promise<{ subject: { id: string; slug: string; domain: 'programming' | 'math' }; slug: string }>;
  /** ONDA1-NAV-UI (reset de progresso): apaga TODAS as tabelas de avanço do
   *  aluno — repassado a study:clear-progress. OPCIONAL: ausente ⇒ o canal
   *  responde { ok:false } gracioso (mesmo padrão dos demais canais de repo). */
  clearAllProgress?(): Promise<void>;
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
  /**
   * ADITIVO (onda3-respostas): avaliador da resposta digitada
   * (`study:judge-answer`). OPCIONAL — ausente ⇒ o canal responde
   * { ok:false, error:{ code:'ANSWER_JUDGE_UNAVAILABLE', … } } (nunca inventa
   * veredito). A fiação real injeta `createAnswerJudge(...)` no index.ts.
   */
  answerJudge?: AnswerJudgeLike;
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

/**
 * Lê todos os desafios `<setupRoot>/challenges/<NNNN>-<slug>/meta.json` como
 * ChallengeInfo. ADITIVO (onda2-research-live): quando `repo` expõe
 * getAttemptsForChallenge, resolve `subjectId` do desafio PERSISTIDO na camada
 * SQL (challenge_attempts.subject_id — a via existente challenges→lessons→
 * subject_id); sem repo/sem tentativas ⇒ undefined.
 *
 * ONDA4 (nunca-repetir):
 *   - `subjectId` é resolvido PRIMARIAMENTE via subject_slug do setup.json
 *     (`<setupRoot>/setup.json` → findSubjectBySlug; undefined quando o subject
 *     ainda não foi persistido) e o mesmo subjectId entra em TODOS os
 *     ChallengeInfo do setup;
 *   - desafios cujo slug estável (basename sem o prefixo NNNN) ∈
 *     `listAttemptedChallengeSlugs(subjectId)` são EXCLUÍDOS da listagem
 *     ("errou → o próximo é outro problema"). Sem setup.json legível ou sem
 *     repo, nenhum filtro é aplicado (lista intacta — retrocompat).
 */
async function listChallengesFrom(
  setupRoot: string,
  repo?: LessonPersistenceLike,
): Promise<ChallengeInfo[]> {
  const challengesRoot = path.join(setupRoot, 'challenges');
  let entries;
  try {
    entries = await fsp.readdir(challengesRoot, { withFileTypes: true });
  } catch {
    return []; // sem challenges/ ⇒ lista vazia (setup novo).
  }

  // subjectId do SETUP (setup.json subject_slug → findSubjectBySlug). Falha de
  // leitura/parse NUNCA derruba a lista — cai para undefined.
  let subjectId: string | undefined;
  try {
    if (repo?.findSubjectBySlug) {
      const setupMeta = JSON.parse(
        await fsp.readFile(path.join(setupRoot, 'setup.json'), 'utf8'),
      ) as Record<string, unknown>;
      const subjectSlug =
        typeof setupMeta.subject_slug === 'string' && setupMeta.subject_slug.trim()
          ? setupMeta.subject_slug.trim()
          : '';
      if (subjectSlug) {
        const subj = await repo.findSubjectBySlug(subjectSlug);
        if (subj) subjectId = subj.id;
      }
    }
  } catch {
    subjectId = undefined;
  }

  // nunca-repetir: slugs já tentados do subject do setup (uma única query).
  let attempted: string[] = [];
  try {
    if (subjectId && repo?.listAttemptedChallengeSlugs) {
      attempted = await repo.listAttemptedChallengeSlugs(subjectId);
    }
  } catch {
    attempted = [];
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
    const challengeId = typeof meta.challenge_id === 'string' ? meta.challenge_id : id;
    // ONDA4: slug ESTÁVEL (basename sem o prefixo NNNN — mesma string do
    // orchestrator/ChallengeInfo e das tentativas da UI).
    const slug = stableChallengeSlug(chDir);
    // ONDA4: nunca-repetir — exclui desafios cujo slug já foi tentado.
    if (attempted.includes(slug)) continue;

    // Fallback de subjectId (retrocompat onda2): última tentativa persistida do
    // desafio. Falha de resolução NUNCA derruba a lista — cai para undefined.
    let attemptSubjectId: string | undefined;
    if (repo?.getAttemptsForChallenge && challengeId) {
      try {
        const attempts = await repo.getAttemptsForChallenge(challengeId);
        const last = attempts[attempts.length - 1];
        if (last?.subjectId && typeof last.subjectId === 'string') attemptSubjectId = last.subjectId;
      } catch {
        attemptSubjectId = undefined;
      }
    }

    infos.push({
      challengeId,
      slug,
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
      ...(subjectId ? { subjectId } : {}),
      ...(!subjectId && attemptSubjectId ? { subjectId: attemptSubjectId } : {}),
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
  /** ADITIVO (onda3-respostas): domínio explícito da UI ('math' | 'programming'). */
  domain?: LessonDomain;
}

/**
 * Normaliza o payload de `study:generate-lesson`. O renderer chama com uma
 * STRING AVULSA (subject.trim()), mas o contrato também permite um objeto
 * `{ subject, language?, goal?, domain? }`. Devolve um objeto normalizado ou
 * lança um erro claro quando o shape é inválido (subject ausente/vazio).
 */
export function normalizeGenerateLessonPayload(payload: unknown): NormalizedGenerateLesson {
  if (typeof payload === 'string') {
    const subject = payload.trim();
    if (!subject) throw new Error('study: generate-lesson requer `subject` (string não vazia).');
    return { subject, language: undefined, goal: undefined, domain: undefined };
  }
  const p = (payload ?? {}) as Record<string, unknown>;
  const subject = typeof p.subject === 'string' ? p.subject.trim() : '';
  if (!subject) throw new Error('study: generate-lesson requer `subject` (string não vazia).');
  const domain = p.domain === 'math' || p.domain === 'programming' ? p.domain : undefined;
  return {
    subject,
    language: typeof p.language === 'string' ? p.language : undefined,
    goal: typeof p.goal === 'string' ? p.goal : undefined,
    ...(domain ? { domain } : {}),
  };
}

/**
 * Monta o mapa canal→handler (PURA). `deps.runner` injeta o runner; `deps.lesson`
 * injeta o orchestrator; `deps.emit` é o canal para a UI.
 */
export function buildStudyHandlers(deps: StudyHandlerDeps): Map<string, IpcHandlerFn> {
  const { runner, lesson, emit, repo, answerJudge } = deps;
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
      // ADITIVO (onda2-research-live): o planner emite os events `research:*`
      // (plan/query-start/query-done/round-*/done) — repassa ao canal novo
      // study:research-progress. O canal por fases continua intacto acima.
      onResearchProgress: (ev: ResearchProgressEvent) => {
        emit(STUDY_CHANNELS.RESEARCH_PROGRESS, ev);
      },
      language: normalized.language,
      goal: normalized.goal,
      // ADITIVO (onda3-respostas): domínio explícito da UI — o orquestrador
      // resolve por heurística quando ausente (default 'programming').
      ...(normalized.domain ? { domain: normalized.domain } : {}),
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
    const challenges = await listChallengesFrom(setupRoot, repo);
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
  //   - get-lesson-by-id        → GetLessonByIdResult (input {lessonId})
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

  map.set(STUDY_CHANNELS.GET_LESSON_BY_ID, async (_event, payload: unknown): Promise<GetLessonByIdResult> => {
    if (!repo) return { lesson: null, exercise: null, domain: null, subjectSlug: null, challenge: null };
    const p = (payload ?? {}) as Record<string, unknown>;
    const lessonId =
      typeof p.lessonId === 'string' ? p.lessonId.trim() : '';
    if (!lessonId) return { lesson: null, exercise: null, domain: null, subjectSlug: null, challenge: null };
    const found = await repo.getLessonById(lessonId);
    if (!found) return { lesson: null, exercise: null, domain: null, subjectSlug: null, challenge: null };
    // ONDA4+5: o repo devolve { lesson, exercise (parse de exercise_json),
    // domain, subjectSlug, challenge } — repasse DIRETO (pass-through).
    return found;
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

  // ─── nunca-repetir (onda4-desafio-persistencia) ────────────────────────────
  // study:mark-challenge-attempt: registra UMA tentativa de desafio. challengeId
  // = slug estável do desafio OU slug sintético de math
  // 'math:<subjectSlug>:<family>:<seed>'. O subjectId é resolvido: explícito no
  // payload > findSubjectBySlug(subjectSlug) > upsertSubject(subjectSlug) sob
  // demanda (a FK subject_id é NOT NULL). lesson_id da tentativa é sintético
  // ('lesson:<slug>') — a tabela não tem FK em lesson_id; a onda 5 pode
  // sobrepor com o lessonId real do generate-lesson quando disponível.
  map.set(STUDY_CHANNELS.CLEAR_PROGRESS, async (): Promise<{ ok: boolean; error?: string }> => {
    // ONDA1-NAV-UI (reset de progresso — Settings): apaga o avanço do aluno
    // via repo.clearAllProgress(). Repo ausente (stub E2E, persistência
    // desabilitada) → { ok:false } gracioso, como os demais canais de repo.
    if (!repo || !repo.clearAllProgress) {
      return { ok: false, error: 'study: persistência indisponível (repo ausente).' };
    }
    await repo.clearAllProgress();
    return { ok: true };
  });

  map.set(STUDY_CHANNELS.MARK_CHALLENGE_ATTEMPT, async (_event, payload: unknown): Promise<MarkChallengeAttemptResult> => {
    if (!repo) return { ok: false, error: 'study: persistência indisponível (repo ausente).' };
    const p = (payload ?? {}) as MarkChallengeAttemptRequest;
    const challengeId = typeof p.challengeId === 'string' && p.challengeId.trim() ? p.challengeId.trim() : '';
    if (!challengeId) throw new Error('study: mark-challenge-attempt requer `challengeId` (slug do desafio ou slug sintético de math).');
    if (p.verdict !== 'passed' && p.verdict !== 'failed' && p.verdict !== 'timeout' && p.verdict !== 'abandoned') {
      throw new Error('study: mark-challenge-attempt requer `verdict` (passed|failed|timeout|abandoned).');
    }
    const stars = typeof p.stars === 'number' ? p.stars : 0;
    if (!Number.isInteger(stars) || stars < 0 || stars > 3) {
      throw new Error('study: mark-challenge-attempt requer `stars` inteiro 0..3.');
    }
    const durationMs = typeof p.durationMs === 'number' ? p.durationMs : 0;
    if (!Number.isInteger(durationMs) || durationMs < 0) {
      throw new Error('study: mark-challenge-attempt requer `durationMs` inteiro >= 0.');
    }
    const explicitSubjectId = typeof p.subjectId === 'string' && p.subjectId.trim() ? p.subjectId.trim() : '';
    const subjectSlug = typeof p.subjectSlug === 'string' && p.subjectSlug.trim() ? p.subjectSlug.trim() : '';
    const lessonId = typeof p.lessonId === 'string' && p.lessonId.trim() ? p.lessonId.trim() : '';
    let subjectId = explicitSubjectId;
    // ADITIVO rodada8-trilhas: lessonId explícito da aula tem precedência —
    // grava `lesson:<lessonId>` (nunca-repetir por aula); sem ele, o padrão
    // antigo deriva do subjectSlug.
    let lessonIdRef = lessonId || subjectSlug || explicitSubjectId || 'unknown';
    if (!subjectId) {
      if (!subjectSlug) return { ok: false, error: 'study: mark-challenge-attempt requer `subjectId` ou `subjectSlug`.' };
      if (repo.findSubjectBySlug) {
        const found = await repo.findSubjectBySlug(subjectSlug);
        if (found) subjectId = found.id;
      }
      if (!subjectId) {
        if (!repo.upsertSubject) return { ok: false, error: 'study: mark-challenge-attempt não resolveu subjectId (sem findSubjectBySlug/upsertSubject).' };
        const up = await repo.upsertSubject(subjectSlug); // sob demanda (FK NOT NULL)
        subjectId = up.subject.id;
      }
    }
    if (!repo.markChallengeAttempt) {
      return { ok: false, error: 'study: mark-challenge-attempt indisponível (repo sem markChallengeAttempt).' };
    }
    const attempt = await repo.markChallengeAttempt({
      subjectId,
      lessonId: `lesson:${lessonIdRef}`,
      challengeId,
      verdict: p.verdict,
      stars,
      durationMs,
    });
    return { ok: true, attempt };
  });

  // ─── respostas (onda3-respostas — verificação por execução + interpretação) ─
  // study:check-math-answer: verificação POR EXECUÇÃO (SEM LLM). O main
  // RECOMPUTA o esperado de (family, seed) via mathLib — nunca confia no
  // renderer (a UI envia family/seed que vêm do `exercise` da lição, não o
  // esperado). reason 'malformed' quando a resposta não é um número
  // reconhecível; 'wrong' quando é um número mas diverge do esperado.
  map.set(
    STUDY_CHANNELS.CHECK_MATH_ANSWER,
    async (_event, payload: unknown): Promise<MathAnswerCheckResult> => {
      const p = (payload ?? {}) as Record<string, unknown>;
      if (!isMathFamily(p.family)) {
        throw new Error(
          `study: check-math-answer requer \`family\` válida (${MATH_FAMILIES.join(' | ')}).`
        );
      }
      const family = p.family as MathFamily;
      if (typeof p.seed !== 'number' || !Number.isInteger(p.seed)) {
        throw new Error('study: check-math-answer requer `seed` (inteiro).');
      }
      if (typeof p.answerText !== 'string' || p.answerText.trim() === '') {
        throw new Error('study: check-math-answer requer `answerText` (string não vazia).');
      }
      // Re-computa o esperado a partir de (family, seed) — a fonte de verdade
      // é a biblioteca determinística, nunca o renderer.
      const problem = generateMathProblem(family, p.seed);
      const parsed = parseMathAnswer(p.answerText);
      const correct = parsed !== null && problem.verify(p.answerText);
      return {
        correct,
        expectedNormalized: problem.normalized,
        ...(correct ? {} : { reason: parsed === null ? ('malformed' as const) : ('wrong' as const) }),
      };
    },
  );

  // study:judge-answer: avalia a INTERPRETAÇÃO digitada com LLM (OpenRouter →
  // fallback embeddedLlm). Falha total ⇒ { ok:false, error:{ code } } — nunca
  // inventa veredito. Sem `answerJudge` injetado, responde estruturado
  // (ANSWER_JUDGE_UNAVAILABLE), igual aos demais canais opcionais.
  map.set(
    STUDY_CHANNELS.JUDGE_ANSWER,
    async (_event, payload: unknown): Promise<JudgeAnswerOutcome> => {
      const p = (payload ?? {}) as Record<string, unknown>;
      if (typeof p.answerText !== 'string' || p.answerText.trim() === '') {
        throw new Error('study: judge-answer requer `answerText` (string não vazia).');
      }
      const ctx = (p.context ?? {}) as Record<string, unknown>;
      if (typeof ctx.subject !== 'string' || ctx.subject.trim() === '') {
        throw new Error('study: judge-answer requer `context.subject` (string não vazia).');
      }
      if (typeof ctx.lessonExcerpt !== 'string' || ctx.lessonExcerpt.trim() === '') {
        throw new Error('study: judge-answer requer `context.lessonExcerpt` (string não vazia).');
      }
      if (!answerJudge) {
        return {
          ok: false,
          error: {
            code: 'ANSWER_JUDGE_UNAVAILABLE',
            message: 'study: avaliador de resposta indisponível (answerJudge não injetado).',
          },
        };
      }
      const req: JudgeAnswerRequest = {
        ...(typeof p.lessonId === 'string' && p.lessonId.trim() ? { lessonId: p.lessonId.trim() } : {}),
        answerText: p.answerText,
        context: { subject: ctx.subject, lessonExcerpt: ctx.lessonExcerpt },
      };
      return answerJudge.judgeAnswer(req);
    },
  );

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