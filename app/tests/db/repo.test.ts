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
  type LessonExercise,
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

  it('upsertSubject aceita domain (v2): default programming, math explícito', async () => {
    const { repo, close } = makeRepo();
    const d1 = await repo.upsertSubject('Vetores');
    assert.equal(d1.subject.domain, 'programming', 'default é programming');
    await repo.upsertSubject('Cálculo', 'math');
    const list = await repo.listSubjects();
    assert.equal(list.length, 2);
    const calc = list.find((s) => s.slug === 'calculo');
    assert.equal(calc?.domain, 'math');
    const vet = list.find((s) => s.slug === 'vetores');
    assert.equal(vet?.domain, 'programming');
    close();
  });

  it('ONDA4: upsertSubject ATUALIZA o domain quando o subject já existe e o domínio vem explícito', async () => {
    const { repo, close } = makeRepo();
    await repo.upsertSubject('Geometria', 'math');
    // Re-upsert do MESMO subject com domain explícito DIFERENTE → atualiza.
    const again = await repo.upsertSubject('geometria', 'programming');
    assert.equal(again.subject.domain, 'programming', 'domain explícito deve atualizar a linha existente');
    // E o UPDATE persiste no banco (não é só o retorno).
    const list = await repo.listSubjects();
    assert.equal(list[0].domain, 'programming');
    close();
  });

  it('ONDA4: upsertSubject SEM domain preserva a linha existente (não reseta o domínio)', async () => {
    const { repo, close } = makeRepo();
    await repo.upsertSubject('Geometria', 'math');
    const again = await repo.upsertSubject('geometria'); // domain undefined
    assert.equal(again.subject.domain, 'math', 'linha existente não muda sem domain explícito');
    close();
  });

  it('ONDA4: findSubjectBySlug devolve o subject persistido (null quando ausente)', async () => {
    const { repo, close } = makeRepo();
    await repo.upsertSubject('Cálculo I', 'math');
    const found = await repo.findSubjectBySlug('calculo-i');
    assert.ok(found);
    assert.equal(found.id, (await repo.upsertSubject('Cálculo I')).subject.id);
    assert.equal(found.domain, 'math');
    assert.equal(await repo.findSubjectBySlug('nao-existe'), null);
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
    const found = await repo.getLessonById(id);
    assert.ok(found);
    assert.equal(found.lesson.title, 'Ordenação');
    assert.equal(found.lesson.difficulty, 3);
    assert.equal(found.lesson.completed_at, null);
    // ONDA4: sem exercício persistido ⇒ exercise null; domain do subject.
    assert.equal(found.exercise, null);
    assert.equal(found.domain, 'programming');

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

describe('createLessonRepo — exercise_json (v3, onda4-desafio-persistencia)', () => {
  const EXERCISE: LessonExercise = {
    kind: 'math',
    family: 'fractions',
    seed: 42,
    prompt: 'Quanto é 1/2 + 1/4?',
    expectedNormalized: '3/4',
  };

  it('createLesson com exercise serializa para exercise_json; getLessonById parseia de volta', async () => {
    const { repo, db, close } = makeRepo();
    await repo.upsertSubject('Frações', 'math');
    const id = await repo.createLesson({
      subjectSlug: 'fracoes',
      title: 'Aula de frações',
      body: 'corpo',
      exercise: EXERCISE,
    });
    // O JSON no banco é o serializado do exercício.
    const raw = db.prepare('SELECT exercise_json FROM lessons WHERE id = ?').get(id) as { exercise_json: string | null };
    assert.ok(typeof raw.exercise_json === 'string' && raw.exercise_json.includes('"expectedNormalized":"3/4"'));

    const found = await repo.getLessonById(id);
    assert.ok(found);
    assert.deepEqual(found.exercise, EXERCISE, 'exercise parseado de volta (mesmo shape)');
    assert.deepEqual(found.lesson.exercise, EXERCISE, 'LessonRow.exercise também carrega o parse');
    assert.equal(found.domain, 'math', 'domain vem do subject (JOIN)');
    close();
  });

  it('getLessonById sem exercise_json → exercise null (nunca lança)', async () => {
    const { repo, close } = makeRepo();
    await repo.upsertSubject('Algoritmos');
    const id = await repo.createLesson({ subjectSlug: 'algoritmos', title: 'A', body: 'b' });
    const found = await repo.getLessonById(id);
    assert.ok(found);
    assert.equal(found.exercise, null);
    assert.equal(found.domain, 'programming');
    close();
  });

  it('parse DEFENSIVO: exercise_json inválido (corrompido) ⇒ exercise null, nunca lança', async () => {
    const { repo, db, close } = makeRepo();
    await repo.upsertSubject('Frações', 'math');
    const id = await repo.createLesson({ subjectSlug: 'fracoes', title: 'A', body: 'b' });
    // Corrompe o JSON diretamente no banco (simula dados antigos/parciais).
    db.prepare('UPDATE lessons SET exercise_json = ? WHERE id = ?').run('{nao-e-json', id);
    assert.doesNotThrow(async () => repo.getLessonById(id));
    const found = await repo.getLessonById(id);
    assert.ok(found);
    assert.equal(found.exercise, null, 'JSON inválido ⇒ null (nunca lança)');
    // E o resto da lição continua legível.
    assert.equal(found.lesson.title, 'A');
    // JSON válido mas de forma fora do contrato ⇒ null também.
    db.prepare('UPDATE lessons SET exercise_json = ? WHERE id = ?').run(JSON.stringify({ kind: 'math', family: 7 }), id);
    assert.equal((await repo.getLessonById(id))!.exercise, null, 'forma fora do contrato ⇒ null');
    close();
  });

  it('lesson inexistente → null (getLessonById)', async () => {
    const { repo, close } = makeRepo();
    assert.equal(await repo.getLessonById('nao-existe'), null);
    close();
  });

  it('ONDA5: getLessonById devolve subjectSlug + challenge (lição programming com desafio persistido)', async () => {
    const { repo, close } = makeRepo();
    await repo.upsertSubject('Algoritmos');
    const id = await repo.createLesson({
      subjectSlug: 'algoritmos',
      title: 'Ordenação',
      body: 'Bubble sort.',
      challenge: {
        slug: 'bubble-sort',
        title: 'Bubble Sort',
        language: 'python',
        concept: 'sorting',
        statement: 'Ordene a lista.',
        testCasesJson: '[]',
        solutionJson: '{}',
      },
    });
    const found = await repo.getLessonById(id);
    assert.ok(found);
    assert.equal(found.subjectSlug, 'algoritmos', 'slug do subject (JOIN com subjects)');
    assert.deepEqual(
      found.challenge,
      { slug: 'bubble-sort', title: 'Bubble Sort' },
      'desafio fundido da lição (LEFT JOIN challenges por lesson_id)',
    );
    // Campos da onda 4 continuam intactos (aditivo).
    assert.equal(found.domain, 'programming');
    assert.equal(found.exercise, null);
    close();
  });

  it('ONDA5: math (sem challenge) → subjectSlug preenchido e challenge null', async () => {
    const { repo, close } = makeRepo();
    await repo.upsertSubject('Frações', 'math');
    const id = await repo.createLesson({
      subjectSlug: 'fracoes',
      title: 'Frações',
      body: 'corpo',
      exercise: EXERCISE,
    });
    const found = await repo.getLessonById(id);
    assert.ok(found);
    assert.equal(found.subjectSlug, 'fracoes', 'math também expõe o slug do subject');
    assert.equal(found.challenge, null, 'math não tem linha em challenges → null');
    assert.equal(found.domain, 'math');
    close();
  });

  it('ONDA5: programming SEM challenge persistido → challenge null (nunca inventa)', async () => {
    const { repo, close } = makeRepo();
    await repo.upsertSubject('Vetores');
    const id = await repo.createLesson({ subjectSlug: 'vetores', title: 'A', body: 'b' });
    const found = await repo.getLessonById(id);
    assert.ok(found);
    assert.equal(found.challenge, null, 'sem desafio → null (não lança, não inventa)');
    assert.equal(found.subjectSlug, 'vetores');
    close();
  });
});

describe('createLessonRepo — listGeneratedChallenges (onda3-generate-flow, pedido C)', () => {
  it('ordena os gerados por created_at DESC (mais recente primeiro — o novo desafio fica no TOPO da lista)', async () => {
    const { repo, close } = makeRepo();
    const base = {
      trackSlug: 'trilha-minima',
      lessonId: 'aula-1',
      statement: 'st',
      starterCode: 'sc',
      testsCode: 'tc',
      solutionCode: 'sol',
      expectedTestCount: 1,
      createdAt: '2026-08-28T00:00:00.000Z', // obrigatório no tipo (o INSERT usa now())
    };
    // Insere 1º → 2º → 3º (o 3º é o mais RECENTE; ids crescentes desempatam
    // created_at iguais no mesmo ms).
    await repo.insertGeneratedChallenge({ ...base, id: 'gen-1', challengeId: 'primeiro' });
    await repo.insertGeneratedChallenge({ ...base, id: 'gen-2', challengeId: 'segundo' });
    await repo.insertGeneratedChallenge({ ...base, id: 'gen-3', challengeId: 'terceiro' });

    const list = await repo.listGeneratedChallenges('trilha-minima', 'aula-1');
    assert.deepEqual(
      list.map((g) => g.challengeId),
      ['terceiro', 'segundo', 'primeiro'],
      'mais recente primeiro (DESC)',
    );
    close();
  });
});

describe('createLessonRepo — clearAllProgress (onda1-nav-ui, reset de progresso)', () => {
  it('apaga TODAS as tabelas de avanço e zera completed_at; conteúdo fica', async () => {
    const { repo, db, close } = makeRepo();
    // Conteúdo (currículo — NUNCA é apagado).
    await repo.upsertSubject('Algoritmos');
    const lessonId = await repo.createLesson({
      subjectSlug: 'algoritmos',
      title: 'Ordenação',
      body: 'Bubble sort.',
      challenge: {
        slug: 'bubble-sort',
        title: 'Bubble Sort',
        language: 'python',
        concept: 'sorting',
        statement: 'Ordene.',
        testCasesJson: '[]',
        solutionJson: '{}',
        hints: [{ position: 0, hintText: 'Compare pares.' }],
      },
    });
    const subject = (await repo.listSubjects())[0];

    // Avanço do aluno em TODAS as camadas.
    await repo.markChallengeAttempt({
      subjectId: subject.id,
      lessonId,
      challengeId: 'bubble-sort',
      verdict: 'passed',
      stars: 3,
      durationMs: 1000,
    });
    await repo.markTrackLessonDone('trilha-minima', 'aula-1');
    await repo.setTrackProficiency('trilha-minima', 'passed', 3);
    await repo.insertGeneratedChallenge({
      id: 'gen-1',
      trackSlug: 'trilha-minima',
      lessonId: 'aula-1',
      challengeId: 'dobro',
      statement: 'st',
      starterCode: 'sc',
      testsCode: 'tc',
      solutionCode: 'sol',
      expectedTestCount: 1,
      createdAt: '2026-08-28T00:00:00.000Z', // obrigatório no tipo (o INSERT usa now())
    });
    await repo.recordAnswer(lessonId, 'resposta do aluno');
    await repo.markLessonCompleted(lessonId);
    // O id REAL do desafio fundido (uuid) — consumeHint resolve por id, não por slug.
    const challengeId = (db.prepare('SELECT id FROM challenges WHERE lesson_id = ?').get(lessonId) as { id: string }).id;
    await repo.consumeHint(challengeId, 'Compare pares.');
    await repo.recordHintBreak(lessonId, challengeId, 'lost-manual', 'não entendi');

    // Sanidade: tudo PERSISTIDO antes do reset. A tentativa guarda o
    // challengeId ENVIADO ('bubble-sort' — o slug; a coluna não é FK), então
    // a consulta é pelo slug, não pelo uuid do desafio fundido.
    assert.equal((await repo.getAttemptsForChallenge('bubble-sort')).length, 1);
    assert.equal((await repo.listTrackLessonProgress('trilha-minima')).length, 1);
    assert.ok((await repo.getTrackProficiency('trilha-minima')) !== null);
    assert.equal((await repo.listGeneratedChallenges('trilha-minima', 'aula-1')).length, 1);
    assert.ok((await repo.getAnswerForLesson(lessonId)) !== null);
    const rawBefore = db.prepare('SELECT completed_at FROM lessons WHERE id = ?').get(lessonId) as { completed_at: string | null };
    assert.ok(rawBefore.completed_at !== null, 'completed_at marcado antes do reset');
    // O hint consumido ficou com used_at SETADO (dado de avanço a zerar).
    const hintBefore = db.prepare('SELECT used_at FROM challenge_hints WHERE challenge_id = ?').get(challengeId) as { used_at: string | null };
    assert.ok(hintBefore.used_at !== null, 'used_at marcado antes do reset');

    // RESET.
    await repo.clearAllProgress();

    // Avanço zerado em TODAS as camadas.
    assert.equal((await repo.getAttemptsForChallenge('bubble-sort')).length, 0, 'attempts apagadas');
    assert.equal((await repo.listTrackLessonProgress('trilha-minima')).length, 0, 'track lesson-done apagado');
    assert.equal(await repo.getTrackProficiency('trilha-minima'), null, 'proficiência apagada');
    assert.equal((await repo.listGeneratedChallenges('trilha-minima', 'aula-1')).length, 0, 'desafios gerados apagados');
    assert.equal(await repo.getAnswerForLesson(lessonId), null, 'respostas apagadas');
    assert.deepEqual(await repo.answeredTopicCount('algoritmos'), { answered: 0, hintConsumed: 0, becameChildren: 0 }, 'contadores legados zerados');
    const rawAfter = db.prepare('SELECT completed_at FROM lessons WHERE id = ?').get(lessonId) as { completed_at: string | null };
    assert.equal(rawAfter.completed_at, null, 'completed_at zerado');
    // Dica consumida → used_at ZERADO; a hint em si (conteúdo) permanece.
    const hintAfter = db.prepare('SELECT used_at FROM challenge_hints WHERE challenge_id = ?').get(challengeId) as { used_at: string | null };
    assert.equal(hintAfter.used_at, null, 'used_at zerado pelo clearAllProgress');

    // CONTEÚDO intacto (currículo + hints).
    const found = await repo.getLessonById(lessonId);
    assert.ok(found, 'lesson continua existindo');
    assert.equal(found.lesson.title, 'Ordenação');
    assert.equal(found.subjectSlug, 'algoritmos');
    assert.deepEqual(found.challenge, { slug: 'bubble-sort', title: 'Bubble Sort' }, 'desafio fundido intacto');
    assert.equal((await repo.getHintsForChallenge(challengeId)).length, 1, 'hints do desafio intactos');
    assert.equal((await repo.listSubjects()).length, 1, 'subjects intactos');

    // Idempotência: limpar de novo não lança (banco vazio de avanço).
    await repo.clearAllProgress();
    close();
  });

  it('clearAllProgress em banco SEM dados é no-op seguro (nunca lança)', async () => {
    const { repo, close } = makeRepo();
    await repo.clearAllProgress();
    close();
  });
});
