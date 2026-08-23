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

import { STUDY_CHANNELS } from '../shared/ipc-contract';
import {
  buildStudyHandlers,
  languageForFile,
  normalizeGenerateLessonPayload,
  registerStudyHandlers,
  resolveContainedWorkspacePath,
  __resetStudyHandlersMemory,
  type LessonServiceLike,
  type RunnerLike,
  type StudyHandlerDeps,
} from '../electron/main/ipc/study-handlers';
import { mkTempDir, rmrf, writeFile } from './_helpers/fs';

/** Fakes configuráveis que satisfazem LessonServiceLike e RunnerLike. */
function makeDeps(overrides: {
  lesson?: Partial<LessonServiceLike>;
  runner?: Partial<RunnerLike>;
  emit?: (channel: string, ev: unknown) => void;
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

  const deps: StudyHandlerDeps = { runner, lesson, emit };
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
    it('string avulsa → { subject } com trim + campos vazios', () => {
      assert.deepEqual(normalizeGenerateLessonPayload('  Closures  '), { subject: 'Closures', language: undefined, goal: undefined });
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
      const list = res as Array<{ challengeId: string; title: string; verdict: string; concept: string }>;
      assert.ok(Array.isArray(list), 'list-challenges deve devolver array');
      assert.equal(list.length, 1);
      assert.equal(list[0].challengeId, '0007');
      assert.equal(list[0].verdict, 'approved');
      assert.equal(list[0].concept, 'recursao');
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