/**
 * tests/cx-services-repo.test.ts — CARACTERIZAÇÃO (golden master) de
 * `electron/main/db/repo.ts` ANTES da refatoração de core/services.
 *
 * Estes testes FIXAM o comportamento OBSERVÁVEL atual da repo — saídas,
 * estados persistidos e erros tipados — sobre sqlite `:memory:` (DI: `open()`
 * devolve um banco vazio). Eles são a rede de segurança da refatoração: se um
 * refactor mudar algo aqui, o contrato observável mudou.
 *
 * Idiomas idênticos aos de tests/db/repo.test.ts (node:test + assert/strict).
 * OFFLINE: nenhum rede, nenhum Electron, nenhum LLM.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import {
  createLessonRepo,
  parseLessonExercise,
  parseRemedialQuiz,
  slugify,
  type LessonRepo,
  type RemedialQuizRecord,
} from '../electron/main/db/repo';

function makeRepo(opts: { foreignKeys?: boolean } = {}): {
  repo: LessonRepo;
  db: DatabaseSync;
  close: () => void;
} {
  const db = new DatabaseSync(':memory:');
  if (opts.foreignKeys) db.exec('PRAGMA foreign_keys = ON');
  const repo = createLessonRepo(() => db);
  return { repo, db, close: () => db.close() };
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ─── slugify ─────────────────────────────────────────────────────────────────

describe('cx/repo: slugify (caracterização)', () => {
  it('kebab-case sem acento, minúsculas, hífens colapsados e sem pontuação', () => {
    assert.equal(slugify('Álgebra Linear — Revisão (Parte 2)'), 'algebra-linear-revisao-parte-2');
    assert.equal(slugify('Aula 2!!'), 'aula-2');
  });

  it('entrada sem caractere aproveitável devolve string vazia (não inventa slug)', () => {
    assert.equal(slugify(''), '');
    assert.equal(slugify('   '), '');
    assert.equal(slugify('!!! ???'), '');
    assert.equal(slugify('~~~'), '');
  });

  it('nunca produz hífen nas pontas nem hífen duplo interno', () => {
    const s = slugify('  --Calculus--Avancado--  ');
    assert.equal(s, 'calculus-avancado');
    assert.ok(!s.startsWith('-') && !s.endsWith('-') && !s.includes('--'));
  });
});

// ─── parseLessonExercise ─────────────────────────────────────────────────────

describe('cx/repo: parseLessonExercise (parse defensivo — nunca lança)', () => {
  const VALID = {
    kind: 'math',
    family: 'fractions',
    seed: 7,
    prompt: 'Quanto é 1/2 + 1/4?',
    expectedNormalized: '3/4',
  };

  it('roundtrip do shape válido', () => {
    assert.deepEqual(parseLessonExercise(JSON.stringify(VALID)), VALID);
  });

  it('campos EXTRAS são descartados — o resultado tem só os 5 do contrato', () => {
    const parsed = parseLessonExercise(JSON.stringify({ ...VALID, extra: 1, id: 'x' }));
    assert.ok(parsed);
    assert.deepEqual(Object.keys(parsed).sort(), [
      'expectedNormalized',
      'family',
      'kind',
      'prompt',
      'seed',
    ]);
  });

  it('ausente/vazio/não-string/JSON inválido ⇒ null', () => {
    assert.equal(parseLessonExercise(undefined), null);
    assert.equal(parseLessonExercise(null), null);
    assert.equal(parseLessonExercise(123), null);
    assert.equal(parseLessonExercise(''), null);
    assert.equal(parseLessonExercise('   '), null);
    assert.equal(parseLessonExercise('{nao-e-json'), null);
  });

  it('JSON de forma errada (array/string/nulo) ⇒ null', () => {
    assert.equal(parseLessonExercise('[]'), null);
    assert.equal(parseLessonExercise('[1,2]'), null);
    assert.equal(parseLessonExercise('"texto"'), null);
    assert.equal(parseLessonExercise('null'), null);
  });

  it('forma fora do contrato ⇒ null (kind errado, seed não-inteiro, campos faltando)', () => {
    assert.equal(parseLessonExercise(JSON.stringify({ ...VALID, kind: 'physics' })), null);
    assert.equal(parseLessonExercise(JSON.stringify({ ...VALID, seed: 1.5 })), null);
    assert.equal(parseLessonExercise(JSON.stringify({ ...VALID, seed: '7' })), null);
    assert.equal(parseLessonExercise(JSON.stringify({ ...VALID, prompt: 42 })), null);
    assert.equal(
      parseLessonExercise(JSON.stringify({ kind: 'math', family: 'x', seed: 1, prompt: 'p' })),
      null,
      'sem expectedNormalized ⇒ null',
    );
  });

  it('nunca lança em entradas arbitrárias', () => {
    for (const raw of ['{', '[]{}', '{"kind":', Symbol.iterator.toString(), '0', 'false']) {
      assert.doesNotThrow(() => parseLessonExercise(raw));
    }
  });
});

// ─── parseRemedialQuiz ───────────────────────────────────────────────────────

describe('cx/repo: parseRemedialQuiz do repo (guarda do quiz_json persistido)', () => {
  const VALID = {
    id: 'af-1#g1',
    originAssertionId: 'af-1',
    generation: 1,
    statement: 'A afirmação.',
    question: 'Pergunta?',
    options: ['a', 'b', 'c', 'd'],
    answerIndex: 2,
    feedback: 'Porque sim.',
  };

  it('roundtrip do shape válido; opcionais ausentes NÃO aparecem no resultado', () => {
    const q = parseRemedialQuiz(JSON.stringify(VALID));
    assert.ok(q);
    assert.deepEqual(q, VALID);
    assert.equal('sectionId' in q, false);
    assert.equal('optionRationales' in q, false);
  });

  it('opcionais presentes e coerentes entram no resultado', () => {
    const q = parseRemedialQuiz(
      JSON.stringify({
        ...VALID,
        sectionId: 'sec-1',
        optionRationales: ['r-a', 'r-b', 'r-c', 'r-d'],
      }),
    );
    assert.ok(q);
    assert.equal(q.sectionId, 'sec-1');
    assert.deepEqual(q.optionRationales, ['r-a', 'r-b', 'r-c', 'r-d']);
  });

  it('EXATAMENTE 4 opções: 0/1/3/5/6 opções ⇒ null (o contrato do quiz)', () => {
    for (const n of [0, 1, 3, 5, 6]) {
      const options = Array.from({ length: n }, (_, i) => `opt${i}`);
      assert.equal(
        parseRemedialQuiz(JSON.stringify({ ...VALID, options, answerIndex: 0 })),
        null,
        `options.length=${n} deveria ser rejeitado`,
      );
    }
  });

  it('answerIndex fora de 0..3 ou não-inteiro ⇒ null (inclusive negativo)', () => {
    for (const idx of [-1, 4, 99, 1.5, '2']) {
      assert.equal(
        parseRemedialQuiz(JSON.stringify({ ...VALID, answerIndex: idx })),
        null,
        `answerIndex=${String(idx)} deveria ser rejeitado`,
      );
    }
  });

  it('optionRationales coerente é mantido; [] é ausência explícita; meia-declaração SOME (quiz sobrevive)', () => {
    const vazio = parseRemedialQuiz(JSON.stringify({ ...VALID, optionRationales: [] }));
    assert.ok(vazio);
    assert.deepEqual(vazio.optionRationales, [], '[] é ausência explícita e é mantido');

    const dois = parseRemedialQuiz(
      JSON.stringify({ ...VALID, optionRationales: ['r-a', 'r-b'] }),
    );
    assert.ok(dois, 'o quiz SOBREVIVE quando só os racionais estão fora do contrato');
    assert.equal('optionRationales' in dois, false, 'meia-declaração some em vez de viajar quebrada');

    const naoStrings = parseRemedialQuiz(
      JSON.stringify({ ...VALID, optionRationales: ['r-a', 'r-b', 'r-c', 4] }),
    );
    assert.ok(naoStrings);
    assert.equal('optionRationales' in naoStrings, false);
  });

  it('campos obrigatórios com tipo errado, geração não-inteira e JSON inválido ⇒ null', () => {
    assert.equal(parseRemedialQuiz(JSON.stringify({ ...VALID, id: 7 })), null);
    assert.equal(parseRemedialQuiz(JSON.stringify({ ...VALID, generation: 1.5 })), null);
    assert.equal(parseRemedialQuiz(JSON.stringify({ ...VALID, options: ['a', 'b', 3, 'd'] })), null);
    assert.equal(parseRemedialQuiz('corrompido'), null);
    assert.equal(parseRemedialQuiz(''), null);
    assert.equal(parseRemedialQuiz(undefined), null);
    assert.equal(parseRemedialQuiz('[1]'), null);
  });
});

// ─── createLessonRepo: erros tipados e casos-limite ──────────────────────────

describe('cx/repo: createLessonRepo — erros tipados e no-ops seguros', () => {
  it('createLesson com subject desconhecido LANÇA (e não persiste nada)', async () => {
    const { repo, close } = makeRepo();
    await assert.rejects(
      () => repo.createLesson({ subjectSlug: 'nao-existe', title: 'A', body: 'b' }),
      /assunto desconhecido: nao-existe/,
    );
    assert.equal((await repo.listSubjects()).length, 0);
    close();
  });

  it('recordAnswer em lição inexistente é NO-OP seguro (não lança, não grava)', async () => {
    const { repo, close } = makeRepo();
    await repo.recordAnswer('ghost-lesson', 'texto');
    assert.equal(await repo.getAnswerForLesson('ghost-lesson'), null);
    assert.deepEqual(await repo.answeredTopicCount('qualquer'), {
      answered: 0,
      hintConsumed: 0,
      becameChildren: 0,
    });
    close();
  });

  it('recordHintBreak em lição inexistente é NO-OP seguro', async () => {
    const { repo, db, close } = makeRepo();
    await repo.recordHintBreak('ghost-lesson', 'ghost-ch', 'reason', null);
    assert.equal(
      (db.prepare('SELECT COUNT(*) AS n FROM hint_break_events').get() as { n: number }).n,
      0,
    );
    close();
  });

  it('addHint sem desafio fundido LANÇA; consumeHint com challenge desconhecido LANÇA', async () => {
    const { repo, close } = makeRepo();
    await repo.upsertSubject('algoritmos');
    const lessonId = await repo.createLesson({ subjectSlug: 'algoritmos', title: 'A', body: 'b' });
    await assert.rejects(() => repo.addHint(lessonId, 1, 'dica'), /nenhum desafio fundido/);
    await assert.rejects(() => repo.consumeHint('challenge-fantasma', 'x'), /challenge desconhecido/);
    close();
  });

  it('consumeHint marca used_at APENAS nas hints ainda não usadas (idempotente no texto)', async () => {
    const { repo, db, close } = makeRepo();
    await repo.upsertSubject('algoritmos');
    await repo.createLesson({
      subjectSlug: 'algoritmos',
      title: 'A',
      body: 'b',
      challenge: {
        slug: 's',
        title: 'T',
        language: 'python',
        concept: 'c',
        statement: 'st',
        testCasesJson: '[]',
        solutionJson: '{}',
        hints: [
          { position: 1, hintText: 'mesma dica' },
          { position: 2, hintText: 'mesma dica' },
          { position: 3, hintText: 'outra' },
        ],
      },
    });
    const ch = (db.prepare('SELECT id FROM challenges LIMIT 1').get() as { id: string }).id;
    await repo.consumeHint(ch, 'mesma dica');
    const hints = await repo.getHintsForChallenge(ch);
    assert.ok(hints[0].used_at, 'a 1ª com o texto consumido é marcada');
    assert.ok(hints[1].used_at, 'o UPDATE casa TODAS as linhas com o mesmo texto (comportamento atual)');
    assert.equal(hints[2].used_at, null, 'texto diferente não é tocado');
    // Consumir de novo NÃO desmarca nem re-marca o que já tem used_at.
    await repo.consumeHint(ch, 'mesma dica');
    const depois = await repo.getHintsForChallenge(ch);
    assert.equal(depois[0].used_at, hints[0].used_at, 'used_at não muda em consumo repetido');
    close();
  });

  it('getTree sem subject devolve árvore vazia; com filhas devolve root + parentLessonId', async () => {
    const { repo, close } = makeRepo();
    assert.deepEqual(await repo.getTree('inexistente'), { root: null, nodes: [] });
    await repo.upsertSubject('grafos');
    const root = await repo.createLesson({ subjectSlug: 'grafos', title: 'R', body: 'b' });
    await repo.createLesson({
      subjectSlug: 'grafos',
      title: 'F',
      body: 'b',
      parentLessonId: root,
      originLessonId: root,
    });
    const tree = await repo.getTree('grafos');
    assert.equal(tree.root?.lessonId, root);
    assert.equal(tree.nodes.length, 2);
    close();
  });
});

// ─── markChallengeAttempt / tentativas ───────────────────────────────────────

describe('cx/repo: tentativas de desafio (shape + contagem)', () => {
  it('markChallengeAttempt devolve a linha com defaults stars=0 durationMs=0 e createdAt ISO', async () => {
    const { repo, close } = makeRepo();
    await repo.upsertSubject('algoritmos');
    const row = await repo.markChallengeAttempt({
      subjectId: (await repo.findSubjectBySlug('algoritmos'))!.id,
      lessonId: 'lesson:x',
      challengeId: 'desafio-x',
      verdict: 'timeout',
    });
    assert.equal(row.verdict, 'timeout');
    assert.equal(row.stars, 0, 'stars default 0');
    assert.equal(row.durationMs, 0, 'durationMs default 0');
    assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(row.createdAt), 'createdAt é timestamp ISO');
    assert.ok(row.id.length > 0);
    close();
  });

  it('listAttemptedChallengeSlugs deduplica por slug (COALESCE slug/challenge_id) e filtra por subject', async () => {
    const { repo, close } = makeRepo();
    const { subject } = await repo.upsertSubject('algoritmos');
    await repo.markChallengeAttempt({
      subjectId: subject.id,
      lessonId: 'lesson:a',
      challengeId: 'desafio-a',
      verdict: 'passed',
    });
    await repo.markChallengeAttempt({
      subjectId: subject.id,
      lessonId: 'lesson:a',
      challengeId: 'desafio-a',
      verdict: 'failed',
    });
    await repo.markChallengeAttempt({
      subjectId: subject.id,
      lessonId: 'lesson:b',
      challengeId: 'desafio-b',
      verdict: 'abandoned',
    });
    const todos = await repo.listAttemptedChallengeSlugs();
    assert.deepEqual([...todos].sort(), ['desafio-a', 'desafio-b']);
    assert.deepEqual(await repo.listAttemptedChallengeSlugs(subject.id), todos);
    assert.deepEqual(await repo.listAttemptedChallengeSlugs('subject-inexistente'), []);
    close();
  });

  it('getAttemptsForChallenge devolve o histórico com o contrato camelCase', async () => {
    const { repo, close } = makeRepo();
    const { subject } = await repo.upsertSubject('algoritmos');
    const row = await repo.markChallengeAttempt({
      subjectId: subject.id,
      lessonId: 'lesson:a',
      challengeId: 'desafio-a',
      verdict: 'failed',
      stars: 2,
      durationMs: 1500,
    });
    const rows = await repo.getAttemptsForChallenge('desafio-a');
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], row, 'o retorno da escrita bate com a leitura (roundtrip)');
    assert.deepEqual(await repo.getAttemptsForChallenge('nunca-tentado'), []);
    close();
  });

  it('listFailedChallengeSlugs: só failed|timeout de lesson:<id>, únicos, do subject do slug', async () => {
    const { repo, close } = makeRepo();
    const { subject } = await repo.upsertSubject('trilha-x');
    const base = { subjectId: subject.id, lessonId: 'lesson:aula-1' };
    await repo.markChallengeAttempt({ ...base, challengeId: 'c-failed', verdict: 'failed' });
    await repo.markChallengeAttempt({ ...base, challengeId: 'c-timeout', verdict: 'timeout' });
    await repo.markChallengeAttempt({ ...base, challengeId: 'c-passed', verdict: 'passed' });
    await repo.markChallengeAttempt({ ...base, challengeId: 'c-abandoned', verdict: 'abandoned' });
    // tentativa de OUTRA lesson não conta.
    await repo.markChallengeAttempt({
      ...base,
      lessonId: 'lesson:outra',
      challengeId: 'c-de-outra-lesson',
      verdict: 'failed',
    });

    const slugs = await repo.listFailedChallengeSlugs('trilha-x', 'aula-1');
    assert.deepEqual([...slugs].sort(), ['c-failed', 'c-timeout']);
    assert.deepEqual(
      await repo.listFailedChallengeSlugs('trilha-inexistente', 'aula-1'),
      [],
      'subject sem linha ⇒ []',
    );
    close();
  });
});

// ─── trilha: progresso, proficiência, regenerados ────────────────────────────

describe('cx/repo: progresso de trilha (v4)', () => {
  it('markTrackLessonDone é idempotente (INSERT OR IGNORE preserva o completedAt original)', async () => {
    const { repo, close } = makeRepo();
    await repo.markTrackLessonDone('trilha', 'aula-1');
    const [primeira] = await repo.listTrackLessonProgress('trilha');
    await sleep(15);
    await repo.markTrackLessonDone('trilha', 'aula-1');
    const linhas = await repo.listTrackLessonProgress('trilha');
    assert.equal(linhas.length, 1, 'não duplica');
    assert.equal(linhas[0].completedAt, primeira.completedAt, 'a 2ª chamada NÃO re-carimba');
    close();
  });

  it('setTrackProficiency faz upsert (1 linha, último veredito vence); getTrackProficiency null sem registro', async () => {
    const { repo, db, close } = makeRepo();
    assert.equal(await repo.getTrackProficiency('trilha'), null);
    await repo.setTrackProficiency('trilha', 'failed', 1);
    await repo.setTrackProficiency('trilha', 'passed', 3);
    const prof = await repo.getTrackProficiency('trilha');
    assert.equal(prof?.verdict, 'passed');
    assert.equal(prof?.stars, 3);
    assert.ok(prof?.passedAt);
    assert.equal(
      (db.prepare('SELECT COUNT(*) AS n FROM track_proficiency').get() as { n: number }).n,
      1,
      'upsert: uma linha só',
    );
    close();
  });

  it('listGeneratedChallenges devolve camelCase completo; insertGeneratedChallenge idempotente por id', async () => {
    const { repo, close } = makeRepo();
    await repo.insertGeneratedChallenge({
      id: 'gen-1',
      trackSlug: 'trilha',
      lessonId: 'aula-1',
      challengeId: 'dobro',
      statement: 'st',
      starterCode: 'sc',
      testsCode: 'tc',
      solutionCode: 'sol',
      expectedTestCount: 3,
      createdAt: '2026-08-28T00:00:00.000Z',
    });
    const list = await repo.listGeneratedChallenges('trilha', 'aula-1');
    assert.deepEqual(list, [
      {
        id: 'gen-1',
        trackSlug: 'trilha',
        lessonId: 'aula-1',
        challengeId: 'dobro',
        statement: 'st',
        starterCode: 'sc',
        testsCode: 'tc',
        solutionCode: 'sol',
        expectedTestCount: 3,
        createdAt: list[0].createdAt,
      },
    ]);
    assert.deepEqual(await repo.listGeneratedChallenges('trilha', 'aula-2'), []);
    assert.deepEqual(await repo.listGeneratedChallenges('outra-trilha', 'aula-1'), []);
    close();
  });
});

// ─── quiz (v5): attempts, remediações, maestria ──────────────────────────────

describe('cx/repo: quiz_attempts (v5)', () => {
  it('attemptNo é DERIVADO (COUNT+1) por seção quando omitido; explícito é preservado', async () => {
    const { repo, close } = makeRepo();
    const a1 = await repo.recordQuizAttempt({
      trackSlug: 't',
      lessonId: 'a',
      sectionKey: 'sec-1',
      assertionId: 'af-1',
      selectedIndex: 0,
      correct: false,
    });
    const a2 = await repo.recordQuizAttempt({
      trackSlug: 't',
      lessonId: 'a',
      sectionKey: 'sec-1',
      assertionId: 'af-1',
      selectedIndex: 1,
      correct: true,
    });
    // seção DIFERENTE zera a contagem.
    const b1 = await repo.recordQuizAttempt({
      trackSlug: 't',
      lessonId: 'a',
      sectionKey: 'sec-2',
      assertionId: 'af-2',
      selectedIndex: 2,
      correct: true,
    });
    // explícito passa por cima da derivação.
    const c1 = await repo.recordQuizAttempt({
      trackSlug: 't',
      lessonId: 'a',
      sectionKey: 'sec-3',
      assertionId: 'af-3',
      selectedIndex: 3,
      correct: false,
      attemptNo: 42,
      quizOrigin: 'remedial',
    });
    assert.equal(a1.attemptNo, 1);
    assert.equal(a2.attemptNo, 2);
    assert.equal(b1.attemptNo, 1);
    assert.equal(c1.attemptNo, 42);
    assert.equal(a1.quizOrigin, 'authored', "quizOrigin default 'authored'");
    assert.equal(c1.quizOrigin, 'remedial');
    close();
  });

  it('listQuizAttempts devolve roundtrip booleano e respeita o escopo trilha+aula', async () => {
    const { repo, close } = makeRepo();
    await repo.recordQuizAttempt({
      trackSlug: 't',
      lessonId: 'a',
      sectionKey: 'sec-1',
      assertionId: 'af-1',
      selectedIndex: 2,
      correct: true,
    });
    await repo.recordQuizAttempt({
      trackSlug: 't',
      lessonId: 'outra',
      sectionKey: 'sec-1',
      assertionId: 'af-1',
      selectedIndex: 0,
      correct: false,
    });
    const rows = await repo.listQuizAttempts({ trackSlug: 't', lessonId: 'a' });
    assert.equal(rows.length, 1, 'só a aula pedida');
    assert.equal(rows[0].correct, true, 'booleano de verdade (não 0/1)');
    assert.equal(rows[0].selectedIndex, 2);
    assert.ok(rows[0].createdAt);
    close();
  });

  it('quizMasteryFor: mastered = houve ACERTO; firstCorrectAt só nasce com acerto; seções ordenadas por key', async () => {
    const { repo, close } = makeRepo();
    // sec-b: erra, depois acerta.
    await repo.recordQuizAttempt({
      trackSlug: 't',
      lessonId: 'a',
      sectionKey: 'sec-b',
      assertionId: 'af',
      selectedIndex: 0,
      correct: false,
    });
    await sleep(12);
    const certa = await repo.recordQuizAttempt({
      trackSlug: 't',
      lessonId: 'a',
      sectionKey: 'sec-b',
      assertionId: 'af',
      selectedIndex: 1,
      correct: true,
    });
    // sec-a: só erros.
    await repo.recordQuizAttempt({
      trackSlug: 't',
      lessonId: 'a',
      sectionKey: 'sec-a',
      assertionId: 'af',
      selectedIndex: 0,
      correct: false,
    });

    const mastery = await repo.quizMasteryFor({ trackSlug: 't', lessonId: 'a' });
    assert.deepEqual(
      mastery.map((m) => m.sectionKey),
      ['sec-a', 'sec-b'],
      'GROUP BY ordenado por section_key ASC',
    );
    const [a, b] = mastery;
    assert.deepEqual(
      { ...a, firstCorrectAt: a.firstCorrectAt !== null, lastAttemptAt: a.lastAttemptAt !== null },
      {
        sectionKey: 'sec-a',
        mastered: false,
        attemptCount: 1,
        correctCount: 0,
        firstCorrectAt: false,
        lastAttemptAt: true,
      },
    );
    assert.equal(b.mastered, true);
    assert.equal(b.attemptCount, 2);
    assert.equal(b.correctCount, 1);
    assert.equal(b.firstCorrectAt, certa.createdAt, 'firstCorrectAt = MIN(created_at) das CERTAS');
    close();
  });

  it('quizMasteryFor sem tentativas ⇒ [] (a ausência é a resposta)', async () => {
    const { repo, close } = makeRepo();
    assert.deepEqual(await repo.quizMasteryFor({ trackSlug: 't', lessonId: 'a' }), []);
    close();
  });
});

describe('cx/repo: quiz_remediations (v5)', () => {
  const QUIZ: RemedialQuizRecord = {
    id: 'af-1#g1',
    originAssertionId: 'af-1',
    generation: 1,
    statement: 'S',
    question: 'Q?',
    options: ['a', 'b', 'c', 'd'],
    answerIndex: 1,
    feedback: 'F',
    sectionId: 'sec-1',
    optionRationales: ['ra', 'rb', 'rc', 'rd'],
  };

  it('saveQuizRemediation gera id quando omitido e faz roundtrip do quiz', async () => {
    const { repo, close } = makeRepo();
    const row = await repo.saveQuizRemediation({
      trackSlug: 't',
      lessonId: 'a',
      sectionKey: 'sec-1',
      originAssertionId: 'af-1',
      generation: 1,
      explanation: 'Explicação do erro.',
      quiz: QUIZ,
    });
    assert.ok(row.id.length > 0, 'id gerado quando omitido');

    const list = await repo.listQuizRemediations({ trackSlug: 't', lessonId: 'a' });
    assert.equal(list.length, 1);
    assert.equal(list[0].id, row.id);
    assert.equal(list[0].explanation, 'Explicação do erro.');
    assert.deepEqual(list[0].quiz, QUIZ, 'quiz serializado e parseado de volta');
    close();
  });

  it('id explícito é preservado (idempotência do chamador); escopo filtra por trilha+aula', async () => {
    const { repo, close } = makeRepo();
    await repo.saveQuizRemediation({
      id: 'id-fixo',
      trackSlug: 't',
      lessonId: 'a',
      sectionKey: 's',
      originAssertionId: 'af',
      generation: 2,
      explanation: 'e',
      quiz: QUIZ,
    });
    await repo.saveQuizRemediation({
      id: 'id-outra',
      trackSlug: 't',
      lessonId: 'outra',
      sectionKey: 's',
      originAssertionId: 'af',
      generation: 2,
      explanation: 'e',
      quiz: QUIZ,
    });
    const list = await repo.listQuizRemediations({ trackSlug: 't', lessonId: 'a' });
    assert.equal(list.length, 1);
    assert.equal(list[0].id, 'id-fixo');
    assert.equal(list[0].generation, 2);
    close();
  });

  it('quiz_json corrompido ⇒ quiz null e a EXPLICAÇÃO sobrevive (histórico nunca se perde)', async () => {
    const { repo, db, close } = makeRepo();
    await repo.saveQuizRemediation({
      id: 'id-1',
      trackSlug: 't',
      lessonId: 'a',
      sectionKey: 's',
      originAssertionId: 'af',
      generation: 1,
      explanation: 'explicação preservada',
      quiz: QUIZ,
    });
    db.prepare('UPDATE quiz_remediations SET quiz_json = ? WHERE id = ?').run('{quebrado', 'id-1');
    const list = await repo.listQuizRemediations({ trackSlug: 't', lessonId: 'a' });
    assert.equal(list.length, 1, 'o registro corrompido NÃO derruba a leitura');
    assert.equal(list[0].quiz, null);
    assert.equal(list[0].explanation, 'explicação preservada');
    close();
  });
});

// ─── clearAllProgress (inclui as tabelas de QUIZ — o reset não pode mentir) ──

describe('cx/repo: clearAllProgress limpa TAMBÉM o quiz (o quiz É avanço)', () => {
  it('attempts/remediações de quiz somem junto das demais tabelas de avanço', async () => {
    const { repo, close } = makeRepo();
    await repo.recordQuizAttempt({
      trackSlug: 't',
      lessonId: 'a',
      sectionKey: 's',
      assertionId: 'af',
      selectedIndex: 0,
      correct: true,
    });
    await repo.saveQuizRemediation({
      id: 'r-1',
      trackSlug: 't',
      lessonId: 'a',
      sectionKey: 's',
      originAssertionId: 'af',
      generation: 1,
      explanation: 'e',
      quiz: {
        id: 'af#g1',
        originAssertionId: 'af',
        generation: 1,
        statement: 's',
        question: 'q',
        options: ['a', 'b', 'c', 'd'],
        answerIndex: 0,
        feedback: 'f',
      },
    });
    assert.equal((await repo.listQuizAttempts({ trackSlug: 't', lessonId: 'a' })).length, 1);
    assert.equal((await repo.listQuizRemediations({ trackSlug: 't', lessonId: 'a' })).length, 1);

    await repo.clearAllProgress();

    assert.deepEqual(await repo.listQuizAttempts({ trackSlug: 't', lessonId: 'a' }), []);
    assert.deepEqual(await repo.listQuizRemediations({ trackSlug: 't', lessonId: 'a' }), []);
    assert.deepEqual(await repo.quizMasteryFor({ trackSlug: 't', lessonId: 'a' }), []);
    close();
  });
});

// ─── reconciliação banco ↔ disco (listTrackScopedState / purge) ──────────────

describe('cx/repo: estado por slug (reconciliação)', () => {
  it('listTrackScopedState agrega matéria + tabelas de trilha num snapshot por slug', async () => {
    const { repo, close } = makeRepo();
    const { subject } = await repo.upsertSubject('matéria', 'math');
    await repo.createLesson({ subjectSlug: 'materia', title: 'A', body: 'b' });
    await repo.markChallengeAttempt({
      subjectId: subject.id,
      lessonId: 'lesson:a',
      challengeId: 'c',
      verdict: 'passed',
    });
    // slug SÓ em track_progress (trilha apagada deixou estado sem matéria).
    await repo.markTrackLessonDone('so-trilha', 'aula-1');
    await repo.setTrackProficiency('so-trilha', 'passed', 2);
    await repo.insertGeneratedChallenge({
      id: 'g',
      trackSlug: 'so-trilha',
      lessonId: 'aula-1',
      challengeId: 'gc',
      statement: 's',
      starterCode: 'sc',
      testsCode: 'tc',
      solutionCode: 'sol',
      expectedTestCount: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    const rows = await repo.listTrackScopedState();
    assert.deepEqual(
      rows.map((r) => r.slug),
      ['materia', 'so-trilha'],
      'UNION ordenado por slug',
    );
    const materia = rows[0];
    assert.equal(materia.subjectId, subject.id);
    assert.equal(materia.subjectName, 'matéria');
    assert.equal(materia.domain, 'math');
    assert.equal(materia.hasOwnLessons, true);
    assert.equal(materia.attemptCount, 1);
    assert.equal(materia.lessonsDoneCount, 0);
    assert.equal(materia.hasProficiency, false);
    assert.equal(materia.generatedChallengeCount, 0);

    const soTrilha = rows[1];
    assert.equal(soTrilha.subjectId, null, 'slug sem matéria');
    assert.equal(soTrilha.subjectName, null);
    assert.equal(soTrilha.domain, null);
    assert.equal(soTrilha.hasOwnLessons, false);
    assert.equal(soTrilha.lessonsDoneCount, 1);
    assert.equal(soTrilha.hasProficiency, true);
    assert.equal(soTrilha.generatedChallengeCount, 1);
    close();
  });

  it('purgeTrackScopedState devolve o "antes", apaga tudo do slug (inclui quiz) e é idempotente', async () => {
    const { repo, close } = makeRepo();
    const { subject } = await repo.upsertSubject('so-avanco');
    await repo.markChallengeAttempt({
      subjectId: subject.id,
      lessonId: 'lesson:a',
      challengeId: 'c',
      verdict: 'passed',
    });
    await repo.markTrackLessonDone('so-avanco', 'aula-1');
    await repo.recordQuizAttempt({
      trackSlug: 'so-avanco',
      lessonId: 'aula-1',
      sectionKey: 's',
      assertionId: 'af',
      selectedIndex: 0,
      correct: true,
    });

    const antes = await repo.purgeTrackScopedState('so-avanco');
    assert.ok(antes);
    assert.equal(antes.slug, 'so-avanco');
    assert.equal(antes.attemptCount, 1);
    assert.equal(antes.lessonsDoneCount, 1);

    assert.deepEqual(await repo.listQuizAttempts({ trackSlug: 'so-avanco', lessonId: 'aula-1' }), []);
    assert.equal((await repo.listTrackLessonProgress('so-avanco')).length, 0);
    assert.equal(await repo.findSubjectBySlug('so-avanco'), null, 'subject sem lições é apagado');
    assert.equal(await repo.purgeTrackScopedState('so-avanco'), null, 'idempotente: 2ª chamada null');
    close();
  });

  it('purge de slug com LIÇÕES PRÓPRIAS é reprovado pela FK e NÃO apaga nada (transação inteira)', async () => {
    const { repo, close } = makeRepo({ foreignKeys: true });
    const { subject } = await repo.upsertSubject('com-aulas');
    await repo.createLesson({ subjectSlug: 'com-aulas', title: 'A', body: 'b' });
    await assert.rejects(() => repo.purgeTrackScopedState('com-aulas'));
    assert.ok(await repo.findSubjectBySlug('com-aulas'), 'nada foi apagado (rollback)');
    assert.equal((await repo.listTrackScopedState())[0].hasOwnLessons, true);
    void subject;
    close();
  });
});
