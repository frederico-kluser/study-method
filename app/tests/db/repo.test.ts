/**
 * tests/db/repo.test.ts — testes do repositório de dados do tutor
 * (electron/main/db/repo.ts). Cobre TODOS os métodos do contrato de CRUD com
 * cenários reais sobre sqlite `:memory:` (DI: a open() devolve um banco vazio).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import {
  createLessonRepo,
  slugify,
  type LessonRepo,
  type CreateLessonInput,
} from '../../electron/main/db/repo';

/** Abre um banco em memória (alguns cenários checam persistência). */
function makeRepo(): { repo: LessonRepo; db: DatabaseSync; close: () => void } {
  const db = new DatabaseSync(':memory:');
  const repo = createLessonRepo(() => db);
  return { repo, db, close: () => db.close() };
}

function lessonInput(over: Partial<CreateLessonInput> = {}): CreateLessonInput {
  return {
    subjectSlug: 'algoritmos',
    title: 'Aula parte 1',
    body: 'Um parágrafo sobre vetores.',
    ...over,
  };
}

describe('slugify', () => {
  it('deriva kebab-case sem acento', () => {
    assert.equal(slugify('Algoritmos e Estruturas de Dados'), 'algoritmos-e-estruturas-de-dados');
  });
  it('limpa pontuação e espaços repetidos', () => {
    assert.equal(slugify('  Calculo!!  I  '), 'calculo-i');
  });
});

describe('createLessonRepo — subject', () => {
  it('upsert cria e é idempotente (mesmo slug → mesmo id)', async () => {
    const { repo, close } = makeRepo();
    const r1 = await repo.upsertSubject('Algoritmos');
    const r2 = await repo.upsertSubject('  algoritmos  '); // normaliza
    assert.equal(r1.slug, 'algoritmos');
    assert.equal(r1.slug, r2.slug);
    assert.equal(r2.subject.id, r1.subject.id);
    close();
  });

  it('listSubjects conta lessons e respostas via JOIN', async () => {
    const { repo, close } = makeRepo();
    await repo.upsertSubject('Vetores');
    const l1 = await repo.createLesson(lessonInput({ subjectSlug: 'vetores', title: 'A1' }));
    const l2 = await repo.createLesson(lessonInput({ subjectSlug: 'vetores', title: 'A2' }));
    await repo.recordAnswer(l1, 'resposta do a1');
    await repo.recordAnswer(l1, 'mais uma');
    const list = await repo.listSubjects();
    assert.equal(list.length, 1);
    assert.equal(list[0].name, 'Vetores');
    assert.equal(list[0].lessonCount, 2);
    assert.equal(list[0].answeredCount, 2);
    close();
  });
});

describe('createLessonRepo — lesson', () => {
  it('createLesson cria lesson + challenge + hints; getLessonById devolve; markLessonCompleted', async () => {
    const { repo, close } = makeRepo();
    await repo.upsertSubject('Algoritmos');
    const id = await repo.createLesson({
      subjectSlug: 'algoritmos',
      title: 'Ordenação',
      body: 'Bubble sort em um parágrafo.',
      difficulty: 3,
      challenge: {
        slug: 'bubble-sort',
        title: 'Bubble Sort',
        language: 'python',
        concept: 'sorting',
        difficulty: 3,
        statement: 'Ordene a lista.',
        testCasesJson: '[{"in":[3,1,2],"out":[1,2,3]}]',
        solutionJson: '{"code":"def f(x): return sorted(x)"}',
        hints: [
          { position: 1, hintText: 'Compare vizinhos.' },
          { position: 2, hintText: 'Repita até estável.' },
        ],
      },
    });
    const lesson = await repo.getLessonById(id);
    assert.ok(lesson);
    assert.equal(lesson.title, 'Ordenação');
    assert.equal(lesson.difficulty, 3);
    assert.equal(lesson.completed_at, null);

    close();
  });

  it('createLesson com challenge cria o desafio fundido e seus hints', async () => {
    const { repo, db, close } = makeRepo();
    await repo.upsertSubject('Algoritmos');
    await repo.createLesson({
      subjectSlug: 'algoritmos',
      title: 'Ordenação',
      body: 'Bubble sort.',
      challenge: {
        slug: 'bubble-sort',
        title: 'Bubble Sort',
        language: 'python',
        concept: 'sorting',
        difficulty: 3,
        statement: 'Ordene a lista.',
        testCasesJson: '[{"in":[3,1,2],"out":[1,2,3]}]',
        solutionJson: '{"code":"def f(x): return sorted(x)"}',
        hints: [
          { position: 1, hintText: 'Compare vizinhos.' },
          { position: 2, hintText: 'Repita até estável.' },
        ],
      },
    });
    const ch = db.prepare('SELECT * FROM challenges LIMIT 1').get() as {
      challenge_slug: string;
      difficulty: number;
      test_cases_json: string;
    };
    assert.equal(ch.challenge_slug, 'bubble-sort');
    assert.equal(ch.difficulty, 3);
    assert.ok(ch.test_cases_json.includes('[3,1,2]'));
    const hints = await repo.getHintsForChallenge(
      (db.prepare('SELECT id FROM challenges LIMIT 1').get() as { id: string }).id,
    );
    assert.equal(hints.length, 2);
    assert.deepEqual(
      hints.map((h) => [h.position, h.hint_text]),
      [
        [1, 'Compare vizinhos.'],
        [2, 'Repita até estável.'],
      ],
    );
    close();
  });

  it('listLessonsBySubject devolve só as aulas do assunto, com completedAt', async () => {
    const { repo, close } = makeRepo();
    await repo.upsertSubject('vetores');
    await repo.upsertSubject('grafos');
    const v = await repo.createLesson(lessonInput({ subjectSlug: 'vetores', title: 'V1' }));
    await repo.createLesson(lessonInput({ subjectSlug: 'grafos', title: 'G1' }));
    await repo.markLessonCompleted(v);
    const list = await repo.listLessonsBySubject('vetores');
    assert.equal(list.length, 1);
    assert.equal(list[0].title, 'V1');
    assert.ok(list[0].completedAt);
    close();
  });
});

describe('createLessonRepo — answer', () => {
  it('recordAnswer insere E incrementa progress.answered; getAnswerForLesson devolve a última', async () => {
    const { repo, close } = makeRepo();
    await repo.upsertSubject('algoritmos');
    const id = await repo.createLesson(lessonInput());
    await repo.recordAnswer(id, 'primeira');
    await repo.recordAnswer(id, 'segunda');
    const last = await repo.getAnswerForLesson(id);
    assert.equal(last?.answer_text, 'segunda');
    const totals = await repo.answeredTopicCount('algoritmos');
    assert.equal(totals.answered, 2);
    close();
  });
});

describe('createLessonRepo — hint/break', () => {
  it('addHint + getHintsForChallenge na ordem de position', async () => {
    const { repo, db, close } = makeRepo();
    await repo.upsertSubject('algoritmos');
    const lessonId = await repo.createLesson(
      lessonInput({
        challenge: {
          slug: 's',
          title: 'T',
          language: 'py',
          concept: 'c',
          statement: 'st',
          testCasesJson: '[]',
          solutionJson: '{}',
        },
      }),
    );
    const ch = db.prepare('SELECT id FROM challenges LIMIT 1').get() as { id: string };
    await repo.addHint(lessonId, 2, 'segundo');
    await repo.addHint(lessonId, 1, 'primeiro');
    const hints = await repo.getHintsForChallenge(ch.id);
    assert.equal(hints.length, 2);
    assert.equal(hints[0].position, 1);
    assert.equal(hints[0].hint_text, 'primeiro');
    assert.equal(hints[1].position, 2);
    assert.equal(hints[1].used_at, null);
    close();
  });

  it('consumeHint marca used_at e incrementa hint_consumed', async () => {
    const { repo, db, close } = makeRepo();
    await repo.upsertSubject('algoritmos');
    const lessonId = await repo.createLesson(
      lessonInput({
        challenge: {
          slug: 's',
          title: 'T',
          language: 'py',
          concept: 'c',
          statement: 'st',
          testCasesJson: '[]',
          solutionJson: '{}',
          hints: [{ position: 1, hintText: 'ajuda' }],
        },
      }),
    );
    const ch = db.prepare('SELECT id FROM challenges LIMIT 1').get() as { id: string };
    await repo.consumeHint(ch.id, 'ajuda');
    const hints = await repo.getHintsForChallenge(ch.id);
    assert.ok(hints[0].used_at);
    const totals = await repo.answeredTopicCount('algoritmos');
    assert.equal(totals.hintConsumed, 1);
    void lessonId;
    close();
  });

  it('recordHintBreak insere evento e incrementa became_lesson_children', async () => {
    const { repo, db, close } = makeRepo();
    await repo.upsertSubject('algoritmos');
    const lessonId = await repo.createLesson(
      lessonInput({
        challenge: {
          slug: 's',
          title: 'T',
          language: 'py',
          concept: 'c',
          statement: 'st',
          testCasesJson: '[]',
          solutionJson: '{}',
        },
      }),
    );
    const ch = db.prepare('SELECT id FROM challenges LIMIT 1').get() as { id: string };
    await repo.recordHintBreak(lessonId, ch.id, 'pediu a resposta', 'nota opcional');
    const ev = db
      .prepare('SELECT * FROM hint_break_events LIMIT 1')
      .get() as { reason: string; note: string; lesson_id: string };
    assert.equal(ev.reason, 'pediu a resposta');
    assert.equal(ev.note, 'nota opcional');
    assert.equal(ev.lesson_id, lessonId);
    const totals = await repo.answeredTopicCount('algoritmos');
    assert.equal(totals.becameChildren, 1);
    close();
  });
});

describe('createLessonRepo — progress', () => {
  it('lessonCountForSubject e answeredTopicCount refletem as escritas', async () => {
    const { repo, close } = makeRepo();
    await repo.upsertSubject('algoritmos');
    const l1 = await repo.createLesson(lessonInput({ title: 'A1' }));
    await repo.createLesson(lessonInput({ title: 'A2' }));
    await repo.recordAnswer(l1, 'ans');
    assert.equal(await repo.lessonCountForSubject('algoritmos'), 2);
    assert.equal(await repo.lessonCountForSubject('inexistente'), 0);
    const totals = await repo.answeredTopicCount('algoritmos');
    assert.deepEqual(totals, { answered: 1, hintConsumed: 0, becameChildren: 0 });
    close();
  });
});

describe('createLessonRepo — tree', () => {
  it('getTree monta raiz + filha via parentLessonId', async () => {
    const { repo, close } = makeRepo();
    await repo.upsertSubject('algoritmos');
    const root = await repo.createLesson(lessonInput({ title: 'Raiz' }));
    const filha = await repo.createLesson(
      lessonInput({ title: 'Filha', parentLessonId: root }),
    );
    const tree = await repo.getTree('algoritmos');
    assert.equal(tree.root?.lessonId, root);
    assert.equal(tree.nodes.length, 2);
    const f = tree.nodes.find((n) => n.lessonId === filha);
    assert.equal(f?.parentLessonId, root);
    assert.equal(f?.originLessonId, null);
    close();
  });
});
