/**
 * tests/ipc/study-persist.test.ts — fiação IPC da persistência de aulas
 * (onda 3 — seleção de aulas): liga a camada SQL (db/repo.ts) aos canais
 * study:list-topics / list-lessons-by-subject / get-lesson-by-id /
 * record-answer / mark-lesson-completed.
 *
 * NUNCA toca electron: os handlers são montados com `buildStudyHandlers` e UMA
 * repo REAL sobre sqlite `:memory:`. Verifica também os casos graciosos (repo
 * ausente → [], {lesson:null}, {ok:false}) e inputs vazios.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { STUDY_CHANNELS } from '../../shared/ipc-contract';
import {
  buildStudyHandlers,
  __resetStudyHandlersMemory,
  type LessonServiceLike,
  type RunnerLike,
} from '../../electron/main/ipc/study-handlers';
import type { IpcHandlerFn } from '../../electron/main/ipc/safeHandle';
import { createLessonRepo, type LessonRepo } from '../../electron/main/db/repo';

/** Fakes mínimos que satisfazem RunnerLike e LessonServiceLike. */
function makeBaseDeps() {
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
    listSetups: async () => ({ rows: [] }),
    resolveSkillDirInfo: async () => ({ skillDir: '/tmp/skill' }),
  };
  const runner: RunnerLike = {
    resolveSkillDir: async () => '/tmp/skill',
    createSetup: async () => ({ setupId: 'abc', setupRoot: '/tmp/setup' }),
    newSession: async () => 'sess',
    createChallenge: async () => ({ challengeDirAbs: '/tmp/setup/challenges/0001-x', relativePath: 'challenges/0001-x' }),
    verifyChallenge: async () => ({
      verdict: 'passed',
      mutationScore: 1,
      killed: 1,
      survived: 0,
      rejections: [],
      stdout: '',
    }),
    testStudentAnswer: async () => ({
      success: true,
      exitCode: 0,
      passed: true,
      testsRun: 1,
      expectedTests: 1,
      output: 'ok',
    }),
  };
  return { lesson, runner, emit: (): void => {} };
}

/** Monta uma repo real sobre `:memory:` e um map de handlers com ela injetada. */
function makeWithRepo(): { handlers: Map<string, IpcHandlerFn>; repo: LessonRepo } {
  const db = new DatabaseSync(':memory:');
  const repo = createLessonRepo(() => db);
  const base = makeBaseDeps();
  const handlers = buildStudyHandlers({ ...base, repo });
  return { handlers, repo };
}

describe('study persistência — list-topics', () => {
  before(() => __resetStudyHandlersMemory());
  after(() => __resetStudyHandlersMemory());

  it('com repo: lista assuntos após upserts com lessonCount/answeredCount', async () => {
    const { handlers, repo } = makeWithRepo();
    await repo.upsertSubject('Vetores');
    await repo.upsertSubject('Álgebra');
    await repo.createLesson({ subjectSlug: 'vetores', title: 'A1', body: 'b' });
    await repo.createLesson({ subjectSlug: 'vetores', title: 'A2', body: 'b' });

    const result = (await handlers.get(STUDY_CHANNELS.LIST_TOPICS)!(null, null)) as Array<{
      slug: string;
      lessonCount: number;
      answeredCount: number;
    }>;
    assert.equal(result.length, 2);
    const vetores = result.find((s) => s.slug === 'vetores');
    assert.ok(vetores, 'vetores deveria estar presente');
    assert.equal(vetores!.lessonCount, 2);
    assert.equal(vetores!.answeredCount, 0);

    const l1 = await repo.listLessonsBySubject('vetores');
    await repo.recordAnswer(l1[0].id, 'minha resposta');
    const after = (await handlers.get(STUDY_CHANNELS.LIST_TOPICS)!(null, null)) as Array<{
      slug: string;
      answeredCount: number;
    }>;
    assert.equal(after.find((s) => s.slug === 'vetores')!.answeredCount, 1);
  });

  it('sem repo: devolve [] graciosamente', async () => {
    const handlers = buildStudyHandlers(makeBaseDeps());
    const result = await handlers.get(STUDY_CHANNELS.LIST_TOPICS)!(null, null);
    assert.deepEqual(result, []);
  });
});

describe('study persistência — list-lessons-by-subject', () => {
  after(() => __resetStudyHandlersMemory());

  it('devolve as aulas de um assunto (LessonSummary)', async () => {
    const { handlers, repo } = makeWithRepo();
    await repo.upsertSubject('Vetores');
    await repo.createLesson({ subjectSlug: 'vetores', title: 'A1', body: 'corpo 1', difficulty: 2 });

    const list = (await handlers.get(STUDY_CHANNELS.LIST_LESSONS_BY_SUBJECT)!(null, { subjectSlug: 'vetores' })) as Array<{ title: string; body: string; difficulty: number }>;
    assert.equal(list.length, 1);
    assert.equal(list[0].title, 'A1');
    assert.equal(list[0].body, 'corpo 1');
    assert.equal(list[0].difficulty, 2);
  });

  it('subjectSlug vazio → []', async () => {
    const { handlers } = makeWithRepo();
    assert.deepEqual(
      await handlers.get(STUDY_CHANNELS.LIST_LESSONS_BY_SUBJECT)!(null, {}),
      [],
    );
    assert.deepEqual(
      await handlers.get(STUDY_CHANNELS.LIST_LESSONS_BY_SUBJECT)!(null, { subjectSlug: '' }),
      [],
    );
  });

  it('sem repo → []', async () => {
    const handlers = buildStudyHandlers(makeBaseDeps());
    assert.deepEqual(await handlers.get(STUDY_CHANNELS.LIST_LESSONS_BY_SUBJECT)!(null, { subjectSlug: 'x' }), []);
  });
});

describe('study persistência — get-lesson-by-id', () => {
  after(() => __resetStudyHandlersMemory());

  it('retorna a aula pelo id ({lesson})', async () => {
    const { handlers, repo } = makeWithRepo();
    await repo.upsertSubject('Vetores');
    const id = await repo.createLesson({ subjectSlug: 'vetores', title: 'A1', body: 'corpo', difficulty: 3 });

    const res = (await handlers.get(STUDY_CHANNELS.GET_LESSON_BY_ID)!(null, { lessonId: id })) as { lesson: { id: string; title: string; difficulty: number } | null };
    assert.ok(res.lesson);
    assert.equal(res.lesson!.id, id);
    assert.equal(res.lesson!.title, 'A1');
    assert.equal(res.lesson!.difficulty, 3);
  });

  it('id inexistente → {lesson: null}', async () => {
    const { handlers } = makeWithRepo();
    const res = await handlers.get(STUDY_CHANNELS.GET_LESSON_BY_ID)!(null, { lessonId: 'nao-existe' });
    assert.deepEqual(res, { lesson: null, exercise: null, domain: null });
  });

  it('lessonId vazio → {lesson: null}', async () => {
    const { handlers } = makeWithRepo();
    assert.deepEqual(await handlers.get(STUDY_CHANNELS.GET_LESSON_BY_ID)!(null, {}), { lesson: null, exercise: null, domain: null });
  });

  it('sem repo → {lesson: null}', async () => {
    const handlers = buildStudyHandlers(makeBaseDeps());
    assert.deepEqual(await handlers.get(STUDY_CHANNELS.GET_LESSON_BY_ID)!(null, { lessonId: 'x' }), { lesson: null, exercise: null, domain: null });
  });
});

describe('study persistência — record-answer', () => {
  after(() => __resetStudyHandlersMemory());

  it('persiste a resposta e aumenta answeredCount/lessonCount', async () => {
    const { handlers, repo } = makeWithRepo();
    await repo.upsertSubject('Vetores');
    const id = await repo.createLesson({ subjectSlug: 'vetores', title: 'A1', body: 'b' });

    const res = (await handlers.get(STUDY_CHANNELS.RECORD_ANSWER)!(null, { lessonId: id, answerText: 'resposta do aluno' })) as { ok: boolean };
    assert.equal(res.ok, true);

    const answer = await repo.getAnswerForLesson(id);
    assert.ok(answer, 'resposta deveria estar persistida');
    assert.equal(answer!.answer_text, 'resposta do aluno');

    const list = await repo.listSubjects();
    const vetores = list.find((s) => s.slug === 'vetores')!;
    assert.equal(vetores.answeredCount, 1);
    assert.equal(vetores.lessonCount, 1);
  });

  it('inputs vazios → {ok:false,error}', async () => {
    const { handlers } = makeWithRepo();
    assert.equal((await handlers.get(STUDY_CHANNELS.RECORD_ANSWER)!(null, { lessonId: '', answerText: 'x' }) as { ok: boolean }).ok, false);
    assert.equal((await handlers.get(STUDY_CHANNELS.RECORD_ANSWER)!(null, { lessonId: 'x', answerText: '' }) as { ok: boolean }).ok, false);
    assert.equal((await handlers.get(STUDY_CHANNELS.RECORD_ANSWER)!(null, {}) as { ok: boolean }).ok, false);
  });

  it('sem repo → {ok:false,error}', async () => {
    const handlers = buildStudyHandlers(makeBaseDeps());
    const res = (await handlers.get(STUDY_CHANNELS.RECORD_ANSWER)!(null, { lessonId: 'x', answerText: 'y' })) as { ok: boolean; error?: string };
    assert.equal(res.ok, false);
    assert.ok(res.error, 'deveria trazer mensagem de erro');
  });
});

describe('study persistência — mark-lesson-completed', () => {
  after(() => __resetStudyHandlersMemory());

  it('marca completedAt na aula', async () => {
    const { handlers, repo } = makeWithRepo();
    await repo.upsertSubject('Vetores');
    const id = await repo.createLesson({ subjectSlug: 'vetores', title: 'A1', body: 'b' });
    assert.equal((await repo.getLessonById(id))!.lesson.completed_at, null);

    const res = (await handlers.get(STUDY_CHANNELS.MARK_LESSON_COMPLETED)!(null, { lessonId: id })) as { ok: boolean };
    assert.equal(res.ok, true);
    assert.ok((await repo.getLessonById(id))!.lesson.completed_at, 'completed_at deveria estar preenchido');
  });

  it('lessonId vazio → {ok:false,error}', async () => {
    const { handlers } = makeWithRepo();
    assert.equal((await handlers.get(STUDY_CHANNELS.MARK_LESSON_COMPLETED)!(null, {}) as { ok: boolean }).ok, false);
    assert.equal((await handlers.get(STUDY_CHANNELS.MARK_LESSON_COMPLETED)!(null, { lessonId: '' }) as { ok: boolean }).ok, false);
  });

  it('sem repo → {ok:false,error}', async () => {
    const handlers = buildStudyHandlers(makeBaseDeps());
    const res = (await handlers.get(STUDY_CHANNELS.MARK_LESSON_COMPLETED)!(null, { lessonId: 'x' })) as { ok: boolean; error?: string };
    assert.equal(res.ok, false);
    assert.ok(res.error);
  });
});
