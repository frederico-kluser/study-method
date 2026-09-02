/**
 * tests/study-handlers.test.ts — cobertura unitária dos handlers IPC do estudo
 * (onda 3): study:resolve-skill-dir, get-setups, create-setup, new-session,
 * generate-lesson, get-lesson, get-findings, list-challenges, create-challenge,
 * verify-challenge, test-answer e os arquivos de workspace (list/read/write/delete)
 * + os helpers puros languageForFile / resolveContainedWorkspacePath /
 * normalizeGenerateLessonPayload e registerStudyHandlers com ipc injetado.
 *
 * NUNCA toca electron nem a skill: deps injetados com fakes; filesystem restrito a
 * tmp via tests/_helpers/fs.ts. Cobre os ramos de erro que faltavam (shape inválido,
 * setupRoot ausente, traversal, conteúdo não-string, etc.).
 */
import { describe, it, after, before } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';

import { STUDY_CHANNELS, type JudgeAnswerOutcome, type MathAnswerCheckResult } from '../shared/ipc-contract';
import {
  buildStudyHandlers,
  languageForFile,
  normalizeGenerateLessonPayload,
  registerStudyHandlers,
  resolveContainedWorkspacePath,
  __resetStudyHandlersMemory,
  type LessonPersistenceLike,
  type LessonServiceLike,
  type RunnerLike,
  type StudyHandlerDeps,
} from '../electron/main/ipc/study-handlers';
import { generateMathProblem } from '../electron/main/services/mathLib';
import type { AnswerJudgeLike } from '../electron/main/services/answerJudge';
import { mkTempDir, rmrf, writeFile } from './_helpers/fs';

/** Fakes configuráveis que satisfazem LessonServiceLike e RunnerLike. */
function makeDeps(overrides: {
  lesson?: Partial<LessonServiceLike>;
  runner?: Partial<RunnerLike>;
  emit?: (channel: string, ev: unknown) => void;
  /** ADITIVO (onda2-research-live): repo parcial (só os métodos do teste). */
  repo?: Partial<LessonPersistenceLike>;
  /** ADITIVO (onda3-respostas): avaliador de resposta digitada (fake). */
  answerJudge?: AnswerJudgeLike;
} = {}) {
  const emitCalls: Array<{ channel: string; ev: unknown }> = [];
  const emit = overrides.emit ?? ((channel: string, ev: unknown) => emitCalls.push({ channel, ev }));

  const lesson: LessonServiceLike = {
    generateLesson: async () => ({
      lesson: {
        title: 'Aula',
        subject: 'x',
        markdown: '# Aula',
        findings: [],
        challenges: [],
        createdAt: 'now',
      },
      rejected: [],
    }),
    testAnswer: async () => ({ success: true, testsRun: 1, expectedTests: 1, passed: true, output: 'ok' }),
    listSetups: async () => ({ rows: [{ setupId: 's1', setupRoot: '/tmp/s1', subjectSlug: 'x' }] }),
    resolveSkillDirInfo: async () => ({ skillDir: '/tmp/skill' }),
    ...overrides.lesson,
  };

  const runner: RunnerLike = {
    resolveSkillDir: async () => '/tmp/skill',
    createSetup: async () => ({ setupId: 'abc', setupRoot: '/tmp/setup' }),
    newSession: async () => '0001',
    createChallenge: async () => ({ challengeDirAbs: '/tmp/c', relativePath: 'challenges/0001-slug' }),
    verifyChallenge: async () => ({ verdict: 'approved', rejections: [], stdout: '' }),
    testStudentAnswer: async () => ({ success: true, exitCode: 0, passed: true, testsRun: 1, expectedTests: 1, output: 'ok' }),
    ...overrides.runner,
  };

  const deps: StudyHandlerDeps = {
    runner,
    lesson,
    emit,
    ...(overrides.repo ? { repo: overrides.repo as LessonPersistenceLike } : {}),
    ...(overrides.answerJudge ? { answerJudge: overrides.answerJudge } : {}),
  };
  return { deps, lesson, runner, emitCalls, emit };
}

describe('study-handlers (unit / fakes)', () => {
  let tmp = '';
  before(async () => { tmp = await mkTempDir('study-handlers-'); });
  after(async () => { await rmrf(tmp); });

  describe('languageForFile', () => {
    it('mapeia extensões case-insensitives por extensão', () => {
      assert.equal(languageForFile('main.py'), 'python');
      assert.equal(languageForFile('x.mjs'), 'javascript');
      assert.equal(languageForFile('x.JS'), 'javascript');
      assert.equal(languageForFile('main.go'), 'go');
      assert.equal(languageForFile('lib.rs'), 'rust');
      assert.equal(languageForFile('stub.c'), 'c');
      assert.equal(languageForFile('stub.h'), 'c');
      assert.equal(languageForFile('README.md'), 'markdown');
      assert.equal(languageForFile('package.json'), 'json');
      assert.equal(languageForFile('sem.extensao'), undefined);
      assert.equal(languageForFile('data.txt'), undefined);
    });
  });

  describe('resolveContainedWorkspacePath', () => {
    it('valida workspaceDir e rel (vazios → erro claro)', () => {
      const errOf = (r: ReturnType<typeof resolveContainedWorkspacePath>): string =>
        ('error' in r ? r.error : '');
      assert.match(errOf(resolveContainedWorkspacePath('  ', 'a')), /workspaceDir/);
      assert.match(errOf(resolveContainedWorkspacePath('/tmp/ws', '')), /obrigatório/);
      assert.match(errOf(resolveContainedWorkspacePath('/tmp/ws', undefined)), /obrigatório/);
    });

    it('rejeita traversal (../, absoluto, .. interno) e aceita caminho contido', () => {
      assert.ok('error' in resolveContainedWorkspacePath('/tmp/ws', '../x'));
      assert.ok('error' in resolveContainedWorkspacePath('/tmp/ws', 'a/../../x'));
      assert.ok('error' in resolveContainedWorkspacePath('/tmp/ws', '/etc/passwd'));
      const ok = resolveContainedWorkspacePath('/tmp/ws', 'tests/x.py');
      assert.ok(!('error' in ok));
      assert.equal((ok as { path: string }).path, path.resolve('/tmp/ws/tests/x.py'));
    });
  });

  describe('normalizeGenerateLessonPayload', () => {
    it('string avulsa → { subject } com trim + campos vazios (domain undefined)', () => {
      assert.deepEqual(normalizeGenerateLessonPayload('  Closures  '), {
        subject: 'Closures',
        language: undefined,
        goal: undefined,
        domain: undefined,
      });
    });

    it('string vazia / só espaços → lança', () => {
      assert.throws(() => normalizeGenerateLessonPayload(''), /requer `subject`/);
      assert.throws(() => normalizeGenerateLessonPayload('   '), /requer `subject`/);
    });

    it('objeto com language/goal → normaliza; subject vazio → lança', () => {
      assert.deepEqual(normalizeGenerateLessonPayload({ subject: ' X ', language: 'pt', goal: 'g' }), {
        subject: 'X',
        language: 'pt',
        goal: 'g',
      });
      // subject de tipo errado / ausente → lança.
      assert.throws(() => normalizeGenerateLessonPayload({}), /requer `subject`/);
      assert.throws(() => normalizeGenerateLessonPayload({ subject: 123 }), /requer `subject`/);
      assert.throws(() => normalizeGenerateLessonPayload(null), /requer `subject`/);
    });

    it('language/goal não-string são ignorados (undefined)', () => {
      assert.deepEqual(normalizeGenerateLessonPayload({ subject: 'a', language: 5, goal: {} }), {
        subject: 'a',
        language: undefined,
        goal: undefined,
      });
    });

    it('ADITIVO (onda3-respostas): domain "math"|"programming" normaliza; inválido é ignorado', () => {
      assert.deepEqual(normalizeGenerateLessonPayload({ subject: 'a', domain: 'math' }), {
        subject: 'a',
        language: undefined,
        goal: undefined,
        domain: 'math',
      });
      assert.deepEqual(normalizeGenerateLessonPayload({ subject: 'a', domain: 'programming' }), {
        subject: 'a',
        language: undefined,
        goal: undefined,
        domain: 'programming',
      });
      // Valor fora do enum → undefined (o orquestrador resolve por heurística).
      const out = normalizeGenerateLessonPayload({ subject: 'a', domain: 'ciência' });
      assert.equal(out.domain, undefined);
    });
  });

  describe('study:resolve-skill-dir', () => {
    it('antes de buildStudyHandlers → erro claro (provider não ligado)', async () => {
      // Módulo recém-carregado OU após reset: memory.lastSkillDirProvider nulo.
      const { deps } = makeDeps();
      const handlers = buildStudyHandlers(deps);
      // reset limpa o provider; o handler então deve lançar.
      __resetStudyHandlersMemory();
      await assert.rejects(
        async () => handlers.get(STUDY_CHANNELS.RESOLVE_SKILL_DIR)!(),
        /provider não ligado/,
      );
    });

    it('depois de buildStudyHandlers → devolve o skillDir do runner', async () => {
      const { deps } = makeDeps();
      const handlers = buildStudyHandlers(deps);
      const res = await handlers.get(STUDY_CHANNELS.RESOLVE_SKILL_DIR)!();
      assert.deepEqual(res, { skillDir: '/tmp/skill' });
    });
  });

  describe('study:get-setups', () => {
    it('delega ao lesson.listSetups', async () => {
      const { deps } = makeDeps();
      const handlers = buildStudyHandlers(deps);
      const res = await handlers.get(STUDY_CHANNELS.GET_SETUPS)!();
      assert.deepEqual(res, { rows: [{ setupId: 's1', setupRoot: '/tmp/s1', subjectSlug: 'x' }] });
    });
  });

  describe('study:create-setup', () => {
    it('cria setup com defaults e grava lastSetupRoot', async () => {
      const created = { setupId: 'id9', setupRoot: '/tmp/novo-setup' };
      const { deps, runner } = makeDeps({
        runner: { createSetup: async () => created },
      });
      (runner.createSetup as (s: unknown) => Promise<unknown>) = async (spec) => {
        assert.deepEqual(spec, {
          path: '/tmp/novo-setup',
          subject: 'Listas',
          subjectSlug: 'Listas',
          title: 'Listas pt',
          language: 'pt-BR',
          skillLevel: 'beginner',
        });
        return created;
      };
      const handlers = buildStudyHandlers(deps);
      const res = await handlers.get(STUDY_CHANNELS.CREATE_SETUP)!(undefined, {
        path: '/tmp/novo-setup',
        subject: 'Listas',
        title: 'Listas pt',
        language: 'pt-BR',
        skillLevel: 'beginner',
      });
      assert.deepEqual(res, created);

      // lastSetupRoot setado → new-session sem setupRoot usa memory.
      const session = await handlers.get(STUDY_CHANNELS.NEW_SESSION)!(undefined, {});
      assert.equal((session as { sessionId: string }).sessionId, '0001');
    });

    it('path/subject/title ausentes → lança com mensagem clara', async () => {
      const { deps } = makeDeps();
      const handlers = buildStudyHandlers(deps);
      const create = handlers.get(STUDY_CHANNELS.CREATE_SETUP)!;
      await assert.rejects(async () => create(undefined, { subject: 'x', title: 't' }), /requer `path`/);
      await assert.rejects(async () => create(undefined, { path: '/p', title: 't' }), /requer `subject`/);
      await assert.rejects(async () => create(undefined, { path: '/p', subject: 'x' }), /requer `title`/);
      await assert.rejects(async () => create(undefined, { path: ' ', subject: 'x', title: 't' }), /requer `path`/);
    });
  });

  describe('study:new-session', () => {
    it('sem setupRoot e sem memory → lança', async () => {
      __resetStudyHandlersMemory();
      const { deps } = makeDeps();
      const handlers = buildStudyHandlers(deps);
      await assert.rejects(
        async () => handlers.get(STUDY_CHANNELS.NEW_SESSION)!(undefined, {}),
        /requer `setupRoot`/,
      );
    });

    it('com setupRoot no payload usa e repassa goal', async () => {
      let seen: { root?: string; goal?: string } = {};
      const { deps, runner } = makeDeps({
        runner: { newSession: async (root: string, goal?: string) => { seen = { root, goal }; return '0009'; } },
      });
      (runner.newSession as (r: string, g?: string) => Promise<string>) = async (root, goal) => {
        seen = { root, goal };
        return '0009';
      };
      const handlers = buildStudyHandlers(deps);
      const res = await handlers.get(STUDY_CHANNELS.NEW_SESSION)!(undefined, { setupRoot: '/sitio', goal: 'meta' });
      assert.equal((res as { sessionId: string }).sessionId, '0009');
      assert.equal(seen.root, '/sitio');
      assert.equal(seen.goal, 'meta');
    });

    it('goal não-string → undefined delegado', async () => {
      let goalSeen: unknown = 'sentinel';
      const { deps, runner } = makeDeps({});
      (runner.newSession as (r: string, g?: string) => Promise<string>) = async (_r, goal) => {
        goalSeen = goal;
        return '1';
      };
      const handlers = buildStudyHandlers(deps);
      await handlers.get(STUDY_CHANNELS.NEW_SESSION)!(undefined, { setupRoot: '/x', goal: 99 });
      assert.equal(goalSeen, undefined);
    });

    it('usa memory.lastSetupRoot (de create-setup) e repassa goal string', async () => {
      __resetStudyHandlersMemory();
      let seen: { root?: string; goal?: string } = {};
      const created = { setupId: 's9', setupRoot: '/tmp/mem-root' };
      const { deps, runner } = makeDeps({
        runner: { createSetup: async () => created },
      });
      (runner.newSession as (r: string, g?: string) => Promise<string>) = async (r, g) => {
        seen = { root: r, goal: g };
        return '0042';
      };
      const handlers = buildStudyHandlers(deps);
      await handlers.get(STUDY_CHANNELS.CREATE_SETUP)!(undefined, {
        path: '/tmp/mem-root',
        subject: 'S',
        title: 'T',
      });
      const res = await handlers.get(STUDY_CHANNELS.NEW_SESSION)!(undefined, { goal: 'meta' });
      assert.equal((res as { sessionId: string }).sessionId, '0042');
      assert.equal(seen.root, '/tmp/mem-root');
      assert.equal(seen.goal, 'meta');
    });
  });

  describe('study:generate-lesson / get-lesson / get-findings', () => {
    it('generate devolve {lesson, rejected}; get-findings devolve os findings', async () => {
      __resetStudyHandlersMemory();
      const { deps, emitCalls } = makeDeps({
        lesson: {
          generateLesson: async (subject) => ({
            lesson: {
              title: 'A',
              subject,
              markdown: '# A',
              findings: [{ query: 'q', title: 'T', url: 'u', description: 'd' }],
              challenges: [],
              createdAt: 'now',
            },
            rejected: [{ slug: 'x', verdict: 'weak' }],
          }),
        },
      });
      const handlers = buildStudyHandlers(deps);
      const gen = await handlers.get(STUDY_CHANNELS.GENERATE_LESSON)!(undefined, 'Closures');
      assert.equal((gen as { lesson: { title: string } }).lesson.title, 'A');

      const findings = await handlers.get(STUDY_CHANNELS.GET_FINDINGS)!();
      assert.equal((findings as unknown[]).length, 1);

      // get-findings ANTES de gerar → erro claro.
      __resetStudyHandlersMemory();
      const handlers2 = buildStudyHandlers(makeDeps().deps);
      await assert.rejects(async () => handlers2.get(STUDY_CHANNELS.GET_FINDINGS)!(), /nenhuma aula gerada/);
      void emitCalls;
    });

    it('payload objeto {subject, language, goal} repassa options e emite LESSON_PROGRESS', async () => {
      __resetStudyHandlersMemory();
      let seen: { language?: string; goal?: string; onProgress?: (p: unknown) => void } = {};
      const { deps, emitCalls } = makeDeps({
        lesson: {
          generateLesson: async (_subject, opts) => {
            seen = opts as typeof seen;
            return {
              lesson: {
                title: 'A',
                subject: 'X',
                markdown: '# A',
                findings: [],
                challenges: [],
                createdAt: 'now',
              },
              rejected: [],
            };
          },
        },
      });
      const handlers = buildStudyHandlers(deps);
      const gen = await handlers.get(STUDY_CHANNELS.GENERATE_LESSON)!(undefined, {
        subject: '  Closures  ',
        language: 'pt-BR',
        goal: 'dominar closures',
      });
      assert.equal((gen as { lesson: { title: string } }).lesson.title, 'A');
      // options repassadas ao orchestrator (language/goal não-undefined).
      assert.equal(seen.language, 'pt-BR');
      assert.equal(seen.goal, 'dominar closures');
      // onProgress emite LESSON_PROGRESS.
      assert.equal(typeof seen.onProgress, 'function');
      seen.onProgress!({ phase: 'research', detail: 'x' });
      assert.ok(emitCalls.some((e) => e.channel === STUDY_CHANNELS.LESSON_PROGRESS));
    });

    it('ONDA2-RESEARCH: repassa onResearchProgress e emite study:research-progress', async () => {
      __resetStudyHandlersMemory();
      let seenOnResearch: ((ev: import('@shared/ipc-contract').ResearchProgressEvent) => void) | undefined;
      const { deps, emitCalls } = makeDeps({
        lesson: {
          generateLesson: async (_subject, opts) => {
            seenOnResearch = opts?.onResearchProgress;
            return {
              lesson: { title: 'A', subject: 'X', markdown: '# A', findings: [], challenges: [], createdAt: 'now' },
              rejected: [],
            };
          },
        },
      });
      const handlers = buildStudyHandlers(deps);
      await handlers.get(STUDY_CHANNELS.GENERATE_LESSON)!(undefined, 'Closures');

      // O handler injeta o callback no orchestrator…
      assert.equal(typeof seenOnResearch, 'function', 'onResearchProgress repassado ao orchestrator');
      // …e eventos vindos do planner são emitidos no canal novo.
      seenOnResearch!({ kind: 'research:plan', subQuestions: [], queries: [], maxRounds: 1 });
      assert.ok(
        emitCalls.some((e) => e.channel === STUDY_CHANNELS.RESEARCH_PROGRESS),
        'research-progress deve ser emitido',
      );
      const emitted = emitCalls.find((e) => e.channel === STUDY_CHANNELS.RESEARCH_PROGRESS);
      assert.deepEqual(emitted?.ev, { kind: 'research:plan', subQuestions: [], queries: [], maxRounds: 1 });
      // O canal por fases segue intacto (retrocompat).
      assert.ok(
        !emitCalls.some((e) => e.channel === STUDY_CHANNELS.LESSON_PROGRESS),
        'sem onProgress de fases neste fluxo',
      );
    });
  });

  describe('study:list-challenges', () => {
    it('setupRoot ausente e sem memory → lança', async () => {
      __resetStudyHandlersMemory();
      const { deps } = makeDeps();
      const handlers = buildStudyHandlers(deps);
      await assert.rejects(
        async () => handlers.get(STUDY_CHANNELS.LIST_CHALLENGES)!(undefined, {}),
        /requer `setupRoot`/,
      );
    });

    it('lê challenges/<NNNN>-<slug>/meta.json e normaliza ChallengeInfo', async () => {
      const setupRoot = path.join(tmp, 'setup-a');
      await writeFile(path.join(setupRoot, 'challenges', '0007-fatorial', 'meta.json'), JSON.stringify({
        challenge_id: '0007',
        title: 'Fatorial',
        language: 'python',
        target_concepts: [{ concept_id: 'recursao' }],
        difficulty: 2,
        verdict: 'approved',
        artifacts: { statement_path: 'docs/readme.md' },
      }));
      // dir sem meta.json é ignorado.
      await writeFile(path.join(setupRoot, 'challenges', '9999-sem-meta', 'stub.py'), 'x');
      // arquivo solto não é diretório de desafio.
      await writeFile(path.join(setupRoot, 'challenges', 'loose.txt'), 'x');

      const { deps } = makeDeps();
      const handlers = buildStudyHandlers(deps);
      const res = await handlers.get(STUDY_CHANNELS.LIST_CHALLENGES)!(undefined, { setupRoot });
      // Contrato: devolve ChallengeInfo[] DIRETO (sem wrapper {challenges}).
      const list = res as Array<{ challengeId: string; title: string; verdict: string; concept: string; subjectId?: string }>;
      assert.ok(Array.isArray(list), 'list-challenges deve devolver array');
      assert.equal(list.length, 1);
      assert.equal(list[0].challengeId, '0007');
      assert.equal(list[0].verdict, 'approved');
      assert.equal(list[0].concept, 'recursao');
      // Sem repo (ou sem tentativas persistidas) ⇒ subjectId undefined.
      assert.equal(list[0].subjectId, undefined, 'subjectId undefined quando não persistido');
    });

    it('ONDA2-RESEARCH: list-challenges resolve subjectId via repo.getAttemptsForChallenge (persistido)', async () => {
      const setupRoot = path.join(tmp, 'setup-subject');
      await writeFile(path.join(setupRoot, 'challenges', '0007-fatorial', 'meta.json'), JSON.stringify({
        challenge_id: '0007',
        title: 'Fatorial',
        language: 'python',
        target_concepts: [{ concept_id: 'recursao' }],
        difficulty: 2,
        verdict: 'approved',
        artifacts: { statement_path: 'README.md' },
      }));
      await writeFile(path.join(setupRoot, 'challenges', '0008-loops', 'meta.json'), JSON.stringify({
        challenge_id: '0008',
        title: 'Loops',
        language: 'python',
        target_concepts: [{ concept_id: 'iteracao' }],
        difficulty: 1,
        verdict: 'approved',
        artifacts: { statement_path: 'README.md' },
      }));

      const { deps } = makeDeps({
        repo: {
          // Sem tentativas → subjectId fica undefined.
          getAttemptsForChallenge: async (challengeId: string) =>
            challengeId === '0007' ? [{ subjectId: 'subj-recursao' }] : [],
        },
      });
      const handlers = buildStudyHandlers(deps);
      const res = await handlers.get(STUDY_CHANNELS.LIST_CHALLENGES)!(undefined, { setupRoot });
      const list = res as Array<{ challengeId: string; subjectId?: string }>;
      assert.equal(list.length, 2);
      const fatorial = list.find((c) => c.challengeId === '0007');
      const loops = list.find((c) => c.challengeId === '0008');
      assert.equal(fatorial?.subjectId, 'subj-recursao', 'subjectId do desafio PERSISTIDO');
      assert.equal(loops?.subjectId, undefined, 'sem tentativa persistida ⇒ undefined');
    });

    it('ONDA2-RESEARCH: falha do getAttemptsForChallenge NUNCA derruba a lista', async () => {
      const setupRoot = path.join(tmp, 'setup-subject-falha');
      await writeFile(path.join(setupRoot, 'challenges', '0007-fatorial', 'meta.json'), JSON.stringify({
        challenge_id: '0007',
        title: 'Fatorial',
        language: 'python',
        target_concepts: [{ concept_id: 'recursao' }],
        difficulty: 2,
        verdict: 'approved',
        artifacts: { statement_path: 'README.md' },
      }));
      const { deps } = makeDeps({
        repo: {
          getAttemptsForChallenge: async () => {
            throw new Error('db fechado');
          },
        },
      });
      const handlers = buildStudyHandlers(deps);
      const res = await handlers.get(STUDY_CHANNELS.LIST_CHALLENGES)!(undefined, { setupRoot });
      const list = res as Array<{ challengeId: string; subjectId?: string }>;
      assert.equal(list.length, 1, 'lista sobrevive à falha de resolução');
      assert.equal(list[0].subjectId, undefined);
    });

    it('sem diretório challenges/ → lista vazia', async () => {
      const setupRoot = path.join(tmp, 'setup-vazio');
      const { deps } = makeDeps();
      const handlers = buildStudyHandlers(deps);
      const res = await handlers.get(STUDY_CHANNELS.LIST_CHALLENGES)!(undefined, { setupRoot });
      assert.deepEqual(res, []);
    });

    it('FIX15: generateLesson grava memory.lastSetupRoot (progresso) → list-challenges sem setupRoot listou', async () => {
      __resetStudyHandlersMemory();
      const setupRoot = path.join(tmp, 'setup-gerado');
      await writeFile(path.join(setupRoot, 'challenges', '0011-ordenacao', 'meta.json'), JSON.stringify({
        challenge_id: '0011',
        title: 'Ordenação',
        language: 'python',
        target_concepts: [{ concept_id: 'sorting' }],
        difficulty: 1,
        verdict: 'approved',
        artifacts: { statement_path: 'README.md' },
      }));
      // 1) generateLesson emite o setup na fase `materializing` do progresso.
      const { deps } = makeDeps({
        lesson: {
          generateLesson: async (_subject, opts) => {
            opts?.onProgress?.({
              phase: 'materializing',
              message: 'Setup criado',
              fraction: 0.575,
              setupRoot,
              setupId: 'e2e-setup',
            });
            return {
              lesson: {
                title: 'A',
                subject: 'Ordenação',
                markdown: '# A',
                findings: [],
                challenges: [],
                createdAt: 'now',
              },
              rejected: [],
            };
          },
        },
      });
      const handlers = buildStudyHandlers(deps);
      await handlers.get(STUDY_CHANNELS.GENERATE_LESSON)!(undefined, 'Ordenação');

      // 2) list-challenges SEM setupRoot usa memory.lastSetupRoot e lista.
      const list = await handlers.get(STUDY_CHANNELS.LIST_CHALLENGES)!(undefined, {});
      const arr = list as Array<{ challengeId: string; title: string }>;
      assert.equal(arr.length, 1);
      assert.equal(arr[0].challengeId, '0011');
    });

    it('FIX15: favback deriva setupRoot do workspaceDir do 1º desafio (sem progresso de setup)', async () => {
      __resetStudyHandlersMemory();
      const { deps } = makeDeps({
        lesson: {
          generateLesson: async (subject) => ({
            lesson: {
              title: 'A',
              subject,
              markdown: '# A',
              findings: [],
              challenges: [
                {
                  challengeId: '0007',
                  title: 'Fatorial',
                  language: 'python',
                  concept: 'recursao',
                  difficulty: 2,
                  status: 'validated',
                  verdict: 'approved',
                  workspaceDir: path.join(tmp, 'setup-x', 'challenges', '0007-fatorial'),
                  statementPath: 'README.md',
                },
              ],
              createdAt: 'now',
            },
            rejected: [],
          }),
        },
      });
      const handlers = buildStudyHandlers(deps);
      await handlers.get(STUDY_CHANNELS.GENERATE_LESSON)!(undefined, 'Recursão');

      // challenge.workspaceDir = <root>/challenges/<slug> → setupRoot = dirname².
      const res = await handlers.get(STUDY_CHANNELS.LIST_CHALLENGES)!(undefined, {});
      // O setup derivado aponta para challenges/ daquele root; listagem vazia é
      // OK aqui — o que provamos é que NÃO lança 'requer setupRoot'.
      assert.ok(Array.isArray(res), 'list-challenges usa setupRoot derivado, sem lançar');
    });

    it('FIX15C: generateLesson zera lastSetupRoot/lastSetupId NO INÍCIO (falha antes do materializing não usa setup velho)', async () => {
      __resetStudyHandlersMemory();
      const setupAntigo = path.join(tmp, 'setup-antigo');
      let chamadas = 0;
      const { deps } = makeDeps({
        lesson: {
          generateLesson: async (_subject, opts) => {
            chamadas += 1;
            if (chamadas === 1) {
              // 1ª geração grava o setup no progresso `materializing`.
              opts?.onProgress?.({
                phase: 'materializing',
                message: 'Setup criado',
                fraction: 0.5,
                setupRoot: setupAntigo,
                setupId: 'setup-antigo-id',
              });
              return { lesson: { title: 'A', subject: 'x', markdown: '# A', findings: [], challenges: [], createdAt: 'now' }, rejected: [] };
            }
            // 2ª geração FALHA ANTES do materializing (ex.: pesquisa).
            throw new Error('pesquisa falhou');
          },
        },
      });
      const handlers = buildStudyHandlers(deps);

      // 1) gera e grava lastSetupRoot via progresso.
      await handlers.get(STUDY_CHANNELS.GENERATE_LESSON)!(undefined, 'Iteração');
      // 2) nova geração falha antes do materializing.
      await assert.rejects(
        async () => handlers.get(STUDY_CHANNELS.GENERATE_LESSON)!(undefined, 'Iteração 2'),
        /pesquisa falhou/
      );
      // 3) o handler zerou o setup velho ao entrar na 2ª execução → list-challenges
      //    sem setupRoot deve exigir setup agora, NÃO usar o antigo.
      await assert.rejects(
        async () => handlers.get(STUDY_CHANNELS.LIST_CHALLENGES)!(undefined, {}),
        /requer `setupRoot`/
      );
    });
  });

  describe('study:create-challenge', () => {
    it('campos obrigatórios ausentes → lança', async () => {
      __resetStudyHandlersMemory();
      const { deps } = makeDeps();
      const handlers = buildStudyHandlers(deps);
      const create = handlers.get(STUDY_CHANNELS.CREATE_CHALLENGE)!;
      await assert.rejects(async () => create(undefined, {}), /requer `setupRoot`/);
      await assert.rejects(async () => create(undefined, { setupRoot: '/x' }), /requer `language`/);
      await assert.rejects(async () => create(undefined, { setupRoot: '/x', language: 'py' }), /requer `slug`/);
      await assert.rejects(async () => create(undefined, { setupRoot: '/x', language: 'py', slug: 's' }), /requer `concept`/);
    });

    it('cria desafio delegando e repassa difficulty/skillLevel opcionais', async () => {
      let seen: Record<string, unknown> = {};
      const { deps, runner } = makeDeps({});
      (runner.createChallenge as (r: string, c: unknown) => Promise<unknown>) = async (_r, c) => {
        seen = c as Record<string, unknown>;
        return { challengeDirAbs: '/tmp/c', relativePath: 'challenges/0008-novo' };
      };
      const handlers = buildStudyHandlers(deps);
      const res = await handlers.get(STUDY_CHANNELS.CREATE_CHALLENGE)!(undefined, {
        setupRoot: '/sitio',
        language: 'go',
        slug: 'novo',
        concept: 'recursao',
        difficulty: 3,
        skillLevel: 'intermediate',
      });
      assert.deepEqual(seen, {
        language: 'go',
        slug: 'novo',
        concept: 'recursao',
        difficulty: 3,
        skillLevel: 'intermediate',
      });
      assert.deepEqual(res, { challenge: { challengeDirAbs: '/tmp/c', relativePath: 'challenges/0008-novo' } });
    });
  });

  describe('study:verify-challenge', () => {
    it('sem challengeDir → lança; com → devolve o verdict completo', async () => {
      const { deps } = makeDeps({
        runner: { verifyChallenge: async () => ({ verdict: 'weak', rejections: ['r1'], stdout: 'o', applyExhausted: false }) },
      });
      const handlers = buildStudyHandlers(deps);
      const verify = handlers.get(STUDY_CHANNELS.VERIFY_CHALLENGE)!;
      await assert.rejects(async () => verify(undefined, {}), /requer `challengeDir`/);
      const res = await verify(undefined, { challengeDir: '/tmp/c' });
      assert.equal((res as { verdict: string }).verdict, 'weak');
      assert.deepEqual((res as { rejections: string[] }).rejections, ['r1']);
    });
  });

  describe('study:test-answer', () => {
    it('sem challengeDir → lança; sucesso emite evento done com result', async () => {
      const { deps, emitCalls } = makeDeps({});
      const handlers = buildStudyHandlers(deps);
      const test = handlers.get(STUDY_CHANNELS.TEST_ANSWER)!;
      await assert.rejects(async () => test(undefined, {}), /requer `challengeDir`/);

      await test(undefined, { challengeDir: '/tmp/c' });
      const phases = emitCalls.filter((e) => e.channel === STUDY_CHANNELS.TEST_ANSWER_EVENT).map((e) => (e.ev as { phase: string }).phase);
      assert.deepEqual(phases, ['started', 'done']);
    });

    it('erro do lesson → emite done com error e rethrow', async () => {
      const { deps, emitCalls } = makeDeps({
        lesson: { testAnswer: async () => { throw new Error('falhou'); } },
      });
      const handlers = buildStudyHandlers(deps);
      const test = handlers.get(STUDY_CHANNELS.TEST_ANSWER)!;
      await assert.rejects(async () => test(undefined, { challengeDir: '/tmp/c' }), /falhou/);
      const doneEv = emitCalls.find((e) => e.channel === STUDY_CHANNELS.TEST_ANSWER_EVENT && (e.ev as { phase: string }).phase === 'done');
      assert.equal((doneEv?.ev as { error: string }).error, 'falhou');
    });
  });

  describe('workspace files (write/delete + erros)', () => {
    it('write cria dirs aninhados e devolve {ok:true}; delete remove', async () => {
      const ws = path.join(tmp, 'ws-a');
      const { deps } = makeDeps({});
      const handlers = buildStudyHandlers(deps);
      const write = await handlers.get(STUDY_CHANNELS.WRITE_WORKSPACE_FILE)!(undefined, {
        workspaceDir: ws,
        path: 'src/main.py',
        content: 'print(1)',
      });
      assert.deepEqual(write, { ok: true });
      const read = await handlers.get(STUDY_CHANNELS.READ_WORKSPACE_FILE)!(undefined, { workspaceDir: ws, path: 'src/main.py' });
      // Contrato: devolve a STRING content pura (sem wrapper {content, encoding}).
      assert.equal(typeof read, 'string');
      assert.equal(read, 'print(1)');

      const del = await handlers.get(STUDY_CHANNELS.DELETE_WORKSPACE_FILE)!(undefined, { workspaceDir: ws, path: 'src/main.py' });
      assert.deepEqual(del, { ok: true });
      await assert.rejects(
        async () => handlers.get(STUDY_CHANNELS.READ_WORKSPACE_FILE)!(undefined, { workspaceDir: ws, path: 'src/main.py' }),
        /ENOENT/,
      );
    });

    it('requer workspaceDir/content; traversal → erro antes do FS', async () => {
      __resetStudyHandlersMemory();
      const ws = path.join(tmp, 'ws-b');
      const { deps } = makeDeps({});
      const handlers = buildStudyHandlers(deps);
      const write = handlers.get(STUDY_CHANNELS.WRITE_WORKSPACE_FILE)!;
      await assert.rejects(async () => write(undefined, {}), /requer `workspaceDir`/);
      await assert.rejects(
        async () => write(undefined, { workspaceDir: ws, path: 'a.py' }),
        /requer `content`/,
      );
      // content não-string → erro.
      await assert.rejects(
        async () => write(undefined, { workspaceDir: ws, path: 'a.py', content: 5 }),
        /requer `content`/,
      );
      // traversal → nunca escreve fora.
      await assert.rejects(
        async () => write(undefined, { workspaceDir: ws, path: '../../etc/x', content: 'x' }),
        /fora do workspace/,
      );
      const del = handlers.get(STUDY_CHANNELS.DELETE_WORKSPACE_FILE)!;
      await assert.rejects(async () => del(undefined, {}), /requer `workspaceDir`/);
      const read = handlers.get(STUDY_CHANNELS.READ_WORKSPACE_FILE)!;
      await assert.rejects(async () => read(undefined, { path: 'a.py' }), /requer `workspaceDir`/);
    });

    it('read com path fora do workspace → erro de traversal antes do FS', async () => {
      __resetStudyHandlersMemory();
      const ws = path.join(tmp, 'ws-traversal');
      const { deps } = makeDeps({});
      const handlers = buildStudyHandlers(deps);
      const read = handlers.get(STUDY_CHANNELS.READ_WORKSPACE_FILE)!;
      for (const bad of ['../esc', 'a/../../esc', '/etc/passwd']) {
        await assert.rejects(
          async () => read(undefined, { workspaceDir: ws, path: bad }),
          /fora do workspace/,
        );
      }
      // delete com path fora do workspace também é barrado antes de tocar o FS.
      const del = handlers.get(STUDY_CHANNELS.DELETE_WORKSPACE_FILE)!;
      await assert.rejects(
        async () => del(undefined, { workspaceDir: ws, path: '..' }),
        /fora do workspace/,
      );
    });
  });

  describe('registerStudyHandlers (ipc injetado)', () => {
    it('liga o map via safeHandleMap num ipc fake', async () => {
      const handlersMap = new Map<string, (...a: unknown[]) => unknown>();
      const ipc = {
        handlers: handlersMap,
        removeHandler: (c: string) => handlersMap.delete(c),
        handle: (c: string, fn: (...a: unknown[]) => unknown) => handlersMap.set(c, fn),
      };
      const { deps } = makeDeps({});
      await registerStudyHandlers(deps, ipc);
      assert.ok(handlersMap.has(STUDY_CHANNELS.GET_SETUPS));
      assert.ok(handlersMap.has(STUDY_CHANNELS.GENERATE_LESSON));
      assert.ok(handlersMap.has(STUDY_CHANNELS.LIST_WORKSPACE_FILES));
    });
  });
});
describe('study:check-math-answer (onda3-respostas — verificação por execução, SEM LLM)', () => {
  it('resposta correta → { correct: true, expectedNormalized } recomputado pelo main', async () => {
    const { deps } = makeDeps();
    const handlers = buildStudyHandlers(deps);
    // O main RECOMPUTA o esperado de (family, seed) — a UI só envia family/seed.
    for (const family of ['arithmetic', 'fractions', 'percentages', 'linear-equations']) {
      const problem = generateMathProblem(family as never, 7);
      const res = (await handlers.get(STUDY_CHANNELS.CHECK_MATH_ANSWER)!(undefined, {
        family,
        seed: 7,
        answerText: problem.normalized,
      })) as MathAnswerCheckResult;
      assert.deepEqual(res, { correct: true, expectedNormalized: problem.normalized });
    }
  });

  it('resposta errada → { correct: false, reason: "wrong" } com o esperado canônico', async () => {
    const { deps } = makeDeps();
    const handlers = buildStudyHandlers(deps);
    const problem = generateMathProblem('arithmetic', 3);
    const wrong = problem.expected.num === 0 ? '1' : String(problem.expected.num + 1);
    const res = (await handlers.get(STUDY_CHANNELS.CHECK_MATH_ANSWER)!(undefined, {
      family: 'arithmetic',
      seed: 3,
      answerText: wrong,
    })) as MathAnswerCheckResult;
    assert.equal(res.correct, false);
    assert.equal(res.reason, 'wrong');
    assert.equal(res.expectedNormalized, problem.normalized);
  });

  it('resposta malformada → { correct: false, reason: "malformed" }', async () => {
    const { deps } = makeDeps();
    const handlers = buildStudyHandlers(deps);
    const res = (await handlers.get(STUDY_CHANNELS.CHECK_MATH_ANSWER)!(undefined, {
      family: 'fractions',
      seed: 5,
      answerText: 'não sei',
    })) as MathAnswerCheckResult;
    assert.equal(res.correct, false);
    assert.equal(res.reason, 'malformed');
    assert.equal(typeof res.expectedNormalized, 'string');
  });

  it('aceita formas equivalentes (fração não reduzida, vírgula pt-BR)', async () => {
    const { deps } = makeDeps();
    const handlers = buildStudyHandlers(deps);
    const problem = generateMathProblem('fractions', 9);
    const { num, den } = problem.expected;
    const equivalent = den === 1 ? `${num}.0` : `${num * 3}/${den * 3}`;
    const res = (await handlers.get(STUDY_CHANNELS.CHECK_MATH_ANSWER)!(undefined, {
      family: 'fractions',
      seed: 9,
      answerText: equivalent,
    })) as MathAnswerCheckResult;
    assert.equal(res.correct, true, `equivalente "${equivalent}" aceito para ${problem.normalized}`);
  });

  it('family inválida / seed ausente / answerText vazio → erro claro', async () => {
    const { deps } = makeDeps();
    const handlers = buildStudyHandlers(deps);
    await assert.rejects(
      async () => handlers.get(STUDY_CHANNELS.CHECK_MATH_ANSWER)!(undefined, { family: 'trigonometria', seed: 1, answerText: '2' }),
      /family/,
    );
    await assert.rejects(
      async () => handlers.get(STUDY_CHANNELS.CHECK_MATH_ANSWER)!(undefined, { family: 'arithmetic', answerText: '2' }),
      /seed/,
    );
    await assert.rejects(
      async () => handlers.get(STUDY_CHANNELS.CHECK_MATH_ANSWER)!(undefined, { family: 'arithmetic', seed: 1, answerText: '  ' }),
      /answerText/,
    );
  });
});

describe('study:judge-answer (onda3-respostas — interpretação com LLM)', () => {
  const VALID_INPUT = {
    answerText: 'Uma closure captura o escopo.',
    context: { subject: 'Closures em JavaScript', lessonExcerpt: 'Trecho do material.' },
  };

  it('delega ao answerJudge injetado e devolve o resultado estruturado', async () => {
    const calls: unknown[] = [];
    const answerJudge: AnswerJudgeLike = {
      async judgeAnswer(input) {
        calls.push(input);
        return { ok: true, verdict: 'correct', feedback: 'Ótima descrição.', provider: 'openrouter' };
      },
    };
    const { deps } = makeDeps({ answerJudge });
    const handlers = buildStudyHandlers(deps);
    const res = (await handlers.get(STUDY_CHANNELS.JUDGE_ANSWER)!(undefined, { ...VALID_INPUT, lessonId: 'L42' })) as JudgeAnswerOutcome;
    assert.deepEqual(res, { ok: true, verdict: 'correct', feedback: 'Ótima descrição.', provider: 'openrouter' });
    assert.equal(calls.length, 1);
    const input = calls[0] as { lessonId: string; answerText: string; context: { subject: string; lessonExcerpt: string } };
    assert.equal(input.lessonId, 'L42');
    assert.equal(input.answerText, VALID_INPUT.answerText);
    assert.equal(input.context.subject, VALID_INPUT.context.subject);
    assert.equal(input.context.lessonExcerpt, VALID_INPUT.context.lessonExcerpt);
  });

  it('sem answerJudge injetado → { ok:false, error.code: ANSWER_JUDGE_UNAVAILABLE } (nunca inventa veredito)', async () => {
    const { deps } = makeDeps(); // sem answerJudge
    const handlers = buildStudyHandlers(deps);
    const res = (await handlers.get(STUDY_CHANNELS.JUDGE_ANSWER)!(undefined, VALID_INPUT)) as JudgeAnswerOutcome;
    assert.ok(!res.ok);
    if (!res.ok) {
      assert.equal(res.error.code, 'ANSWER_JUDGE_UNAVAILABLE');
      assert.ok(!('verdict' in res), 'falha total não carrega veredito');
    }
  });

  it('falha do provedor → erro estruturado do serviço repassado (verdict nunca inventado)', async () => {
    const answerJudge: AnswerJudgeLike = {
      async judgeAnswer() {
        return { ok: false, error: { code: 'ANSWER_JUDGE_UNAVAILABLE', message: 'sem LLM.' } };
      },
    };
    const { deps } = makeDeps({ answerJudge });
    const handlers = buildStudyHandlers(deps);
    const res = (await handlers.get(STUDY_CHANNELS.JUDGE_ANSWER)!(undefined, VALID_INPUT)) as JudgeAnswerOutcome;
    assert.ok(!res.ok);
    if (!res.ok) assert.equal(res.error.code, 'ANSWER_JUDGE_UNAVAILABLE');
  });

  it('payload inválido → erro claro (answerText / context obrigatórios)', async () => {
    const { deps } = makeDeps();
    const handlers = buildStudyHandlers(deps);
    await assert.rejects(
      async () => handlers.get(STUDY_CHANNELS.JUDGE_ANSWER)!(undefined, { ...VALID_INPUT, answerText: '' }),
      /answerText/,
    );
    await assert.rejects(
      async () => handlers.get(STUDY_CHANNELS.JUDGE_ANSWER)!(undefined, { answerText: 'x', context: {} }),
      /subject/,
    );
    await assert.rejects(
      async () => handlers.get(STUDY_CHANNELS.JUDGE_ANSWER)!(undefined, {
        answerText: 'x',
        context: { subject: 's' },
      }),
      /lessonExcerpt/,
    );
  });
});

describe('study:mark-challenge-attempt (onda4-desafio-persistencia — nunca-repetir)', () => {
  /** Repo fake com captura da tentativa e resolução por slug. */
  function makeAttemptRepo(overrides: {
    subject?: { id: string; slug: string; domain: 'programming' | 'math' } | null;
    recorded?: unknown[];
  } = {}) {
    const recorded: Array<Record<string, unknown>> = [];
    const repo = {
      findSubjectBySlug: async (slug: string) =>
        overrides.subject && overrides.subject.slug === slug ? overrides.subject : null,
      upsertSubject: async (name: string, domain?: string) => {
        const subj = { id: 'sub-upserted', name, slug: name, domain: domain ?? 'programming' };
        return { subject: subj, slug: subj.slug };
      },
      markChallengeAttempt: async (input: Record<string, unknown>) => {
        recorded.push(input);
        return {
          id: 'att-1',
          subjectId: input.subjectId as string,
          lessonId: input.lessonId as string,
          challengeId: input.challengeId as string,
          verdict: input.verdict as string,
          stars: (input.stars as number) ?? 0,
          durationMs: (input.durationMs as number) ?? 0,
          createdAt: '2026-08-27T00:00:00.000Z',
        };
      },
    };
    return { repo, recorded };
  }

  it('resolves subjectId por subjectSlug (findSubjectBySlug) e grava a tentativa', async () => {
    const { repo, recorded } = makeAttemptRepo({ subject: { id: 'sub-1', slug: 'algoritmos', domain: 'programming' } });
    const { deps } = makeDeps({ repo: repo as unknown as Partial<LessonPersistenceLike> });
    const handlers = buildStudyHandlers(deps);
    const res = (await handlers.get(STUDY_CHANNELS.MARK_CHALLENGE_ATTEMPT)!(undefined, {
      subjectSlug: 'algoritmos',
      challengeId: 'bubble-sort',
      verdict: 'failed',
      stars: 1,
      durationMs: 500,
    })) as { ok: boolean; attempt: { id: string; subjectId: string; verdict: string } };
    assert.equal(res.ok, true);
    assert.equal(res.attempt.subjectId, 'sub-1', 'subjectId resolvido pelo slug');
    assert.equal(res.attempt.verdict, 'failed');
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].subjectId, 'sub-1');
    assert.equal(recorded[0].lessonId, 'lesson:algoritmos', 'lessonId sintético do subject');
    assert.equal(recorded[0].stars, 1);
    assert.equal(recorded[0].durationMs, 500);
  });

  it('subjectId explícito tem precedência sobre subjectSlug', async () => {
    const { repo, recorded } = makeAttemptRepo({ subject: { id: 'sub-1', slug: 'algoritmos', domain: 'programming' } });
    const { deps } = makeDeps({ repo: repo as unknown as Partial<LessonPersistenceLike> });
    const handlers = buildStudyHandlers(deps);
    const res = (await handlers.get(STUDY_CHANNELS.MARK_CHALLENGE_ATTEMPT)!(undefined, {
      subjectId: 'sub-explicito',
      subjectSlug: 'algoritmos',
      challengeId: 'bubble-sort',
      verdict: 'passed',
    })) as { ok: boolean; attempt: { subjectId: string } };
    assert.equal(res.ok, true);
    assert.equal(res.attempt.subjectId, 'sub-explicito', 'subjectId explícito vence');
    assert.equal(recorded[0].subjectId, 'sub-explicito');
  });

  it('subjectSlug sem subject persistido → upsertSubject SOB DEMANDA (FK NOT NULL respeitada)', async () => {
    const { repo, recorded } = makeAttemptRepo({ subject: null }); // findSubjectBySlug → null
    const { deps } = makeDeps({ repo: repo as unknown as Partial<LessonPersistenceLike> });
    const handlers = buildStudyHandlers(deps);
    const res = (await handlers.get(STUDY_CHANNELS.MARK_CHALLENGE_ATTEMPT)!(undefined, {
      subjectSlug: 'novo-assunto',
      challengeId: 'math:novo-assunto:arithmetic:42',
      verdict: 'timeout',
    })) as { ok: boolean; attempt: { subjectId: string } };
    assert.equal(res.ok, true);
    assert.equal(res.attempt.subjectId, 'sub-upserted', 'upsert sob demanda criou o subject');
    assert.equal(recorded[0].challengeId, 'math:novo-assunto:arithmetic:42', 'slug sintético de math vai como challengeId');
  });

  it('sem repo → { ok:false } gracioso', async () => {
    const { deps } = makeDeps(); // sem repo
    const handlers = buildStudyHandlers(deps);
    const res = (await handlers.get(STUDY_CHANNELS.MARK_CHALLENGE_ATTEMPT)!(undefined, {
      subjectSlug: 'algoritmos',
      challengeId: 'x',
      verdict: 'passed',
    })) as { ok: boolean };
    assert.equal(res.ok, false);
  });

  it('sem subjectId E sem subjectSlug → { ok:false, error }', async () => {
    const { repo } = makeAttemptRepo();
    const { deps } = makeDeps({ repo: repo as unknown as Partial<LessonPersistenceLike> });
    const handlers = buildStudyHandlers(deps);
    const res = (await handlers.get(STUDY_CHANNELS.MARK_CHALLENGE_ATTEMPT)!(undefined, {
      challengeId: 'x',
      verdict: 'passed',
    })) as { ok: boolean; error?: string };
    assert.equal(res.ok, false);
    assert.match(res.error ?? '', /subjectId|subjectSlug/);
  });

  it('payload inválido → erro claro (challengeId/verdict/stars/durationMs)', async () => {
    const { repo } = makeAttemptRepo();
    const { deps } = makeDeps({ repo: repo as unknown as Partial<LessonPersistenceLike> });
    const handlers = buildStudyHandlers(deps);
    const mark = handlers.get(STUDY_CHANNELS.MARK_CHALLENGE_ATTEMPT)!;
    await assert.rejects(async () => mark(undefined, { subjectId: 's', verdict: 'passed' }), /challengeId/);
    await assert.rejects(
      async () => mark(undefined, { subjectId: 's', challengeId: 'x', verdict: 'maybe' }),
      /verdict/,
    );
    await assert.rejects(
      async () => mark(undefined, { subjectId: 's', challengeId: 'x', verdict: 'passed', stars: 9 }),
      /stars/,
    );
    await assert.rejects(
      async () => mark(undefined, { subjectId: 's', challengeId: 'x', verdict: 'passed', durationMs: -5 }),
      /durationMs/,
    );
  });
});

describe('study:clear-progress (onda1-nav-ui — reset de progresso)', () => {
  it('com repo → chama clearAllProgress e responde { ok:true }', async () => {
    let called = 0;
    const repo = {
      clearAllProgress: async () => { called += 1; },
    };
    const { deps } = makeDeps({ repo: repo as unknown as Partial<LessonPersistenceLike> });
    const handlers = buildStudyHandlers(deps);
    const res = (await handlers.get(STUDY_CHANNELS.CLEAR_PROGRESS)!(undefined)) as { ok: boolean; error?: string };
    assert.equal(res.ok, true);
    assert.equal(called, 1, 'clearAllProgress do repo foi chamado exatamente 1x');
  });

  it('sem repo → { ok:false } gracioso (mesmo padrão dos canais de repo)', async () => {
    const { deps } = makeDeps(); // sem repo
    const handlers = buildStudyHandlers(deps);
    const res = (await handlers.get(STUDY_CHANNELS.CLEAR_PROGRESS)!(undefined)) as { ok: boolean; error?: string };
    assert.equal(res.ok, false);
    assert.match(res.error ?? '', /repo ausente/);
  });

  it('repo sem clearAllProgress → { ok:false } gracioso (nunca inventa)', async () => {
    const { deps } = makeDeps({ repo: {} as unknown as Partial<LessonPersistenceLike> });
    const handlers = buildStudyHandlers(deps);
    const res = (await handlers.get(STUDY_CHANNELS.CLEAR_PROGRESS)!(undefined)) as { ok: boolean; error?: string };
    assert.equal(res.ok, false);
  });
});

describe('study:list-challenges — nunca-repetir (onda4-desafio-persistencia)', () => {
  let dirNunca = '';
  before(async () => { dirNunca = await mkTempDir('study-handlers-nunca-'); });
  after(async () => { if (dirNunca) await rmrf(dirNunca); });

  const META_JSON = (challengeId: string, title: string) => JSON.stringify({
    challenge_id: challengeId,
    title,
    language: 'python',
    target_concepts: [{ concept_id: 'recursao' }],
    difficulty: 2,
    verdict: 'approved',
    artifacts: { statement_path: 'README.md' },
  });

  async function seedSetup(root: string, challenges: string[]): Promise<void> {
    for (const ch of challenges) {
      await writeFile(path.join(root, 'challenges', ch, 'meta.json'), META_JSON(ch.split('-')[0], ch));
    }
  }

  it('setup.json subject_slug → subjectId em TODOS; exclui desafios com slug tentado; sem attempts lista intacta', async () => {
    const setupRoot = path.join(dirNunca, 'setup-nunca');
    await writeFile(path.join(setupRoot, 'setup.json'), JSON.stringify({ setup_id: 's1', subject_slug: 'algoritmos' }));
    await seedSetup(setupRoot, ['0007-fatorial', '0008-loops']);

    const repo = {
      findSubjectBySlug: async (slug: string) =>
        slug === 'algoritmos' ? { id: 'sub-1', slug, domain: 'programming' } : null,
      listAttemptedChallengeSlugs: async () => ['fatorial'],
    };
    const { deps } = makeDeps({ repo: repo as unknown as Partial<LessonPersistenceLike> });
    const handlers = buildStudyHandlers(deps);
    const list = (await handlers.get(STUDY_CHANNELS.LIST_CHALLENGES)!(undefined, { setupRoot })) as Array<{
      challengeId: string;
      slug?: string;
      subjectId?: string;
    }>;
    assert.equal(list.length, 1, 'desafio tentado (fatorial) EXCLUÍDO');
    assert.equal(list[0].challengeId, '0008');
    assert.equal(list[0].slug, 'loops', 'slug estável sem o prefixo NNNN');
    assert.equal(list[0].subjectId, 'sub-1', 'subjectId vem do subject_slug do setup');

    // Sem attempts registrados → a listagem fica INTACTA (nada é filtrado).
    const repoNoAttempts = { ...repo, listAttemptedChallengeSlugs: async () => [] };
    const { deps: deps2 } = makeDeps({ repo: repoNoAttempts as unknown as Partial<LessonPersistenceLike> });
    const handlers2 = buildStudyHandlers(deps2);
    const full = (await handlers2.get(STUDY_CHANNELS.LIST_CHALLENGES)!(undefined, { setupRoot })) as unknown[];
    assert.equal(full.length, 2, 'sem tentativas ⇒ lista completa');
  });

  it('subject não persistido ainda (findSubjectBySlug null) → sem filtro e subjectId undefined', async () => {
    const setupRoot = path.join(dirNunca, 'setup-sem-subject');
    await writeFile(path.join(setupRoot, 'setup.json'), JSON.stringify({ setup_id: 's2', subject_slug: 'algoritmos' }));
    await seedSetup(setupRoot, ['0007-fatorial']);

    const repo = {
      findSubjectBySlug: async () => null,
      listAttemptedChallengeSlugs: async () => ['fatorial'],
    };
    const { deps } = makeDeps({ repo: repo as unknown as Partial<LessonPersistenceLike> });
    const handlers = buildStudyHandlers(deps);
    const list = (await handlers.get(STUDY_CHANNELS.LIST_CHALLENGES)!(undefined, { setupRoot })) as Array<{
      subjectId?: string;
    }>;
    assert.equal(list.length, 1, 'subject não persistido ⇒ nada é filtrado');
    assert.equal(list[0].subjectId, undefined, 'subjectId undefined quando o subject ainda não foi persistido');
  });

  it('falha do listAttemptedChallengeSlugs NUNCA derruba a lista (sem filtro)', async () => {
    const setupRoot = path.join(dirNunca, 'setup-att-falha');
    await writeFile(path.join(setupRoot, 'setup.json'), JSON.stringify({ setup_id: 's3', subject_slug: 'algoritmos' }));
    await seedSetup(setupRoot, ['0007-fatorial']);

    const repo = {
      findSubjectBySlug: async () => ({ id: 'sub-1', slug: 'algoritmos', domain: 'programming' as const }),
      listAttemptedChallengeSlugs: async () => { throw new Error('db fechado'); },
    };
    const { deps } = makeDeps({ repo: repo as unknown as Partial<LessonPersistenceLike> });
    const handlers = buildStudyHandlers(deps);
    const list = (await handlers.get(STUDY_CHANNELS.LIST_CHALLENGES)!(undefined, { setupRoot })) as unknown[];
    assert.equal(list.length, 1, 'falha da contagem não derruba a lista');
  });
});

describe('study:get-lesson-by-id — ONDA4+5 ({ lesson, exercise, domain, subjectSlug, challenge })', () => {
  it('com repo: devolve lesson + exercise (parse de exercise_json) + domain + subjectSlug + challenge', async () => {
    const repo = {
      getLessonById: async () => ({
        lesson: {
          id: 'les-1',
          subject_id: 'sub-1',
          title: 'Frações',
          body: 'corpo',
          difficulty: 1,
          parent_lesson_id: null,
          origin_lesson_id: null,
          created_at: '2026-08-27T00:00:00.000Z',
          completed_at: null,
          exercise: null,
        },
        exercise: { kind: 'math', family: 'fractions', seed: 7, prompt: 'Quanto é 1/2 + 1/4?', expectedNormalized: '3/4' },
        domain: 'math',
        subjectSlug: 'fracoes',
        challenge: null,
      }),
    };
    const { deps } = makeDeps({ repo: repo as unknown as Partial<LessonPersistenceLike> });
    const handlers = buildStudyHandlers(deps);
    const res = (await handlers.get(STUDY_CHANNELS.GET_LESSON_BY_ID)!(undefined, { lessonId: 'les-1' })) as {
      lesson: { title: string } | null;
      exercise: { family: string; expectedNormalized: string } | null;
      domain: string | null;
      subjectSlug: string | null;
      challenge: { slug: string; title: string } | null;
    };
    assert.equal(res.lesson?.title, 'Frações');
    assert.equal(res.exercise?.family, 'fractions');
    assert.equal(res.exercise?.expectedNormalized, '3/4');
    assert.equal(res.domain, 'math');
    // ONDA5: repasse dos campos novos (pass-through do repo → contrato).
    assert.equal(res.subjectSlug, 'fracoes');
    assert.equal(res.challenge, null);
  });

  it('ONDA5: repassa challenge preenchido (lição programming reaberta pelo desafio)', async () => {
    const repo = {
      getLessonById: async () => ({
        lesson: {
          id: 'les-2',
          subject_id: 'sub-2',
          title: 'Ordenação',
          body: 'corpo',
          difficulty: 2,
          parent_lesson_id: null,
          origin_lesson_id: null,
          created_at: '2026-08-27T00:00:00.000Z',
          completed_at: null,
          exercise: null,
        },
        exercise: null,
        domain: 'programming',
        subjectSlug: 'algoritmos',
        challenge: { slug: 'bubble-sort', title: 'Bubble Sort' },
      }),
    };
    const { deps } = makeDeps({ repo: repo as unknown as Partial<LessonPersistenceLike> });
    const handlers = buildStudyHandlers(deps);
    const res = (await handlers.get(STUDY_CHANNELS.GET_LESSON_BY_ID)!(undefined, { lessonId: 'les-2' })) as {
      subjectSlug: string | null;
      challenge: { slug: string; title: string } | null;
    };
    assert.equal(res.subjectSlug, 'algoritmos');
    assert.deepEqual(res.challenge, { slug: 'bubble-sort', title: 'Bubble Sort' });
  });

  it('sem repo / id inexistente → { lesson: null, exercise: null, domain: null, subjectSlug: null, challenge: null }', async () => {
    const GRACEFUL = { lesson: null, exercise: null, domain: null, subjectSlug: null, challenge: null };
    // sem repo
    const { deps } = makeDeps();
    const handlers = buildStudyHandlers(deps);
    assert.deepEqual(await handlers.get(STUDY_CHANNELS.GET_LESSON_BY_ID)!(undefined, { lessonId: 'x' }), GRACEFUL);
    // com repo mas id inexistente
    const repo = { getLessonById: async () => null };
    const { deps: deps2 } = makeDeps({ repo: repo as unknown as Partial<LessonPersistenceLike> });
    const handlers2 = buildStudyHandlers(deps2);
    assert.deepEqual(await handlers2.get(STUDY_CHANNELS.GET_LESSON_BY_ID)!(undefined, { lessonId: 'nope' }), GRACEFUL);
    // lessonId vazio → mesmo shape gracioso
    assert.deepEqual(await handlers.get(STUDY_CHANNELS.GET_LESSON_BY_ID)!(undefined, {}), GRACEFUL);
  });
});
