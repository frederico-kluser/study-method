/**
 * tests/db/challenge-attempts.test.ts — tentativas de desafio (v2) no repo:
 * markChallengeAttempt / listAttemptedChallengeSlugs / getAttemptsForChallenge,
 * mais o `domain` de subjects (upsertSubject + listSubjects).
 *
 * Usa o padrão dos demais testes de repo: `DatabaseSync(':memory:')` + repo
 * real (o DatabaseSync do node:sqlite já nasce com foreign_keys ON — medido
 * em Node 24 — então a FK de subject_id é enforced de fato).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import {
  createLessonRepo,
  type LessonRepo,
  type ChallengeAttemptRow,
} from '../../electron/main/db/repo';

function makeRepo(): { repo: LessonRepo; db: DatabaseSync; close: () => void } {
  const db = new DatabaseSync(':memory:');
  const repo = createLessonRepo(() => db);
  return { repo, db, close: () => db.close() };
}

/** Cria subject + lesson com desafio e devolve os ids (challengeId via SQL). */
async function seedChallenge(
  repo: LessonRepo,
  db: DatabaseSync,
  opts: { subjectName?: string; domain?: 'programming' | 'math'; slug?: string; lessonTitle?: string } = {},
): Promise<{ subjectId: string; lessonId: string; challengeId: string; challengeSlug: string }> {
  const { subject } = await repo.upsertSubject(opts.subjectName ?? 'Algoritmos', opts.domain);
  const lessonId = await repo.createLesson({
    subjectSlug: subject.slug,
    title: opts.lessonTitle ?? 'Aula do desafio',
    body: 'corpo',
    challenge: {
      slug: opts.slug ?? 'bubble-sort',
      title: 'Bubble Sort',
      language: 'python',
      concept: 'sorting',
      statement: 'Ordene.',
      testCasesJson: '[]',
      solutionJson: '{}',
    },
  });
  const challengeId = (
    db.prepare('SELECT id FROM challenges WHERE lesson_id = ?').get(lessonId) as { id: string }
  ).id;
  return { subjectId: subject.id, lessonId, challengeId, challengeSlug: opts.slug ?? 'bubble-sort' };
}

describe('subjects — domain (v2)', () => {
  it('upsertSubject default: domain = programming; listSubjects devolve domain', async () => {
    const { repo, close } = makeRepo();
    const { subject } = await repo.upsertSubject('Vetores');
    assert.equal(subject.domain, 'programming');
    const [row] = await repo.listSubjects();
    assert.equal(row.domain, 'programming');
    close();
  });

  it('upsertSubject com domain math grava e devolve o domínio', async () => {
    const { repo, close } = makeRepo();
    const { subject } = await repo.upsertSubject('Cálculo I', 'math');
    assert.equal(subject.domain, 'math');
    const list = await repo.listSubjects();
    assert.equal(list.length, 1);
    assert.equal(list[0].domain, 'math');
    close();
  });

  it('upsertSubject idempotente preserva o domain da linha existente', async () => {
    const { repo, close } = makeRepo();
    await repo.upsertSubject('Geometria', 'math');
    const again = await repo.upsertSubject('geometria'); // default programming
    assert.equal(again.subject.domain, 'math', 'linha existente não muda de domínio');
    close();
  });
});

describe('markChallengeAttempt', () => {
  it('grava uma tentativa e devolve a linha criada (camelCase, defaults aplicados)', async () => {
    const { repo, db, close } = makeRepo();
    const s = await seedChallenge(repo, db);
    const attempt = await repo.markChallengeAttempt({
      subjectId: s.subjectId,
      lessonId: s.lessonId,
      challengeId: s.challengeId,
      verdict: 'passed',
      stars: 3,
      durationMs: 1250,
    });
    assert.equal(attempt.verdict, 'passed');
    assert.equal(attempt.stars, 3);
    assert.equal(attempt.durationMs, 1250);
    assert.equal(attempt.subjectId, s.subjectId);
    assert.equal(attempt.lessonId, s.lessonId);
    assert.equal(attempt.challengeId, s.challengeId);
    assert.ok(attempt.id, 'id gerado');
    assert.ok(attempt.createdAt, 'created_at preenchido');

    const raw = db
      .prepare('SELECT verdict, stars, duration_ms FROM challenge_attempts WHERE id = ?')
      .get(attempt.id) as { verdict: string; stars: number; duration_ms: number };
    assert.equal(raw.verdict, 'passed');
    assert.equal(raw.stars, 3);
    assert.equal(raw.duration_ms, 1250);
    close();
  });

  it('stars e durationMs são opcionais (default 0)', async () => {
    const { repo, db, close } = makeRepo();
    const s = await seedChallenge(repo, db);
    const attempt = await repo.markChallengeAttempt({
      subjectId: s.subjectId,
      lessonId: s.lessonId,
      challengeId: s.challengeId,
      verdict: 'failed',
    });
    assert.equal(attempt.stars, 0);
    assert.equal(attempt.durationMs, 0);
    close();
  });

  it('verdict fora do enum → erro CHECK', async () => {
    const { repo, db, close } = makeRepo();
    const s = await seedChallenge(repo, db);
    await assert.rejects(
      repo.markChallengeAttempt({
        subjectId: s.subjectId,
        lessonId: s.lessonId,
        challengeId: s.challengeId,
        verdict: 'maybe' as never,
      }),
      /CHECK/i,
    );
    close();
  });

  it('stars fora de 0..3 → erro CHECK', async () => {
    const { repo, db, close } = makeRepo();
    const s = await seedChallenge(repo, db);
    await assert.rejects(
      repo.markChallengeAttempt({
        subjectId: s.subjectId,
        lessonId: s.lessonId,
        challengeId: s.challengeId,
        verdict: 'passed',
        stars: 5,
      }),
      /CHECK/i,
    );
    close();
  });

  it('subjectId inexistente → erro FOREIGN KEY', async () => {
    const { repo, close } = makeRepo();
    await assert.rejects(
      repo.markChallengeAttempt({
        subjectId: 'sub-inexistente',
        lessonId: 'les-x',
        challengeId: 'chal-x',
        verdict: 'abandoned',
      }),
      /FOREIGN KEY/i,
    );
    close();
  });
});

describe('getAttemptsForChallenge', () => {
  it('histórico ordenado da mais antiga para a mais recente, com shape completo', async () => {
    const { repo, db, close } = makeRepo();
    const s = await seedChallenge(repo, db);
    await repo.markChallengeAttempt({
      subjectId: s.subjectId,
      lessonId: s.lessonId,
      challengeId: s.challengeId,
      verdict: 'failed',
    });
    await new Promise((r) => setTimeout(r, 10)); // garante created_at distinto
    await repo.markChallengeAttempt({
      subjectId: s.subjectId,
      lessonId: s.lessonId,
      challengeId: s.challengeId,
      verdict: 'passed',
      stars: 3,
      durationMs: 800,
    });

    const attempts = await repo.getAttemptsForChallenge(s.challengeId);
    assert.equal(attempts.length, 2);
    assert.deepEqual(
      attempts.map((a) => a.verdict),
      ['failed', 'passed'],
      'ordem cronológica ASC',
    );
    for (const a of attempts) {
      assert.ok((a as ChallengeAttemptRow).id);
      assert.equal(a.challengeId, s.challengeId);
      assert.equal(a.subjectId, s.subjectId);
      assert.equal(a.lessonId, s.lessonId);
      assert.ok(a.createdAt);
    }
    assert.equal(attempts[1].stars, 3);
    assert.equal(attempts[1].durationMs, 800);
    close();
  });

  it('sem tentativas → lista vazia', async () => {
    const { repo, close } = makeRepo();
    assert.deepEqual(await repo.getAttemptsForChallenge('nunca-tentado'), []);
    close();
  });
});

describe('listAttemptedChallengeSlugs', () => {
  it('slugs distintos tentados, mais recente primeiro; deduplica tentativas repetidas', async () => {
    const { repo, db, close } = makeRepo();
    const a = await seedChallenge(repo, db, { slug: 'bubble-sort', subjectName: 'Algoritmos' });
    const b = await seedChallenge(repo, db, { slug: 'merge-sort', subjectName: 'Ordenação' });
    await repo.markChallengeAttempt({
      subjectId: a.subjectId, lessonId: a.lessonId, challengeId: a.challengeId, verdict: 'failed',
    });
    await repo.markChallengeAttempt({
      subjectId: a.subjectId, lessonId: a.lessonId, challengeId: a.challengeId, verdict: 'passed', stars: 2,
    });
    await new Promise((r) => setTimeout(r, 10));
    await repo.markChallengeAttempt({
      subjectId: b.subjectId, lessonId: b.lessonId, challengeId: b.challengeId, verdict: 'timeout',
    });

    const slugs = await repo.listAttemptedChallengeSlugs();
    assert.deepEqual(slugs, ['merge-sort', 'bubble-sort'], 'dedupe + mais recente primeiro');
    close();
  });

  it('filtra por subjectId quando passado', async () => {
    const { repo, db, close } = makeRepo();
    const a = await seedChallenge(repo, db, { slug: 'bubble-sort', subjectName: 'Algoritmos' });
    const b = await seedChallenge(repo, db, { slug: 'soma-pares', subjectName: 'Matemática', domain: 'math' });
    await repo.markChallengeAttempt({
      subjectId: a.subjectId, lessonId: a.lessonId, challengeId: a.challengeId, verdict: 'passed',
    });
    await repo.markChallengeAttempt({
      subjectId: b.subjectId, lessonId: b.lessonId, challengeId: b.challengeId, verdict: 'abandoned',
    });

    assert.deepEqual(await repo.listAttemptedChallengeSlugs(a.subjectId), ['bubble-sort']);
    assert.deepEqual(await repo.listAttemptedChallengeSlugs(b.subjectId), ['soma-pares']);
    assert.deepEqual((await repo.listAttemptedChallengeSlugs()).sort(), ['bubble-sort', 'soma-pares']);
    close();
  });

  it('sem subjectId de uma tentativa sem desafio persistido: cai no challenge_id (COALESCE)', async () => {
    const { repo, close } = makeRepo();
    const { subject } = await repo.upsertSubject('Algoritmos');
    await repo.markChallengeAttempt({
      subjectId: subject.id,
      lessonId: 'les-gerada',
      challengeId: 'chal-nao-persistido',
      verdict: 'passed',
    });
    const slugs = await repo.listAttemptedChallengeSlugs();
    assert.deepEqual(slugs, ['chal-nao-persistido']);
    close();
  });

  it('sem tentativas → lista vazia', async () => {
    const { repo, close } = makeRepo();
    assert.deepEqual(await repo.listAttemptedChallengeSlugs(), []);
    close();
  });
});
