/**
 * tests/db/repo.edge.test.ts — TESTES DE BORDA / VALIDAÇÃO do repositório
 * (electron/main/db/repo.ts), complemento do repo.test.ts.
 *
 * Cobre o que a suíte básica NÃO pinça: inputs vazios/nulos, idempotência do
 * upsertSubject sob colisão de slug com acento, createLesson com subjectSlug
 * inexistente, recordAnswer/recordHintBreak em lesson inexistente (agora no-op
 * seguro — não lança, não grava), hints fora de ordem na leitura,
 * getTree com ciclo/raiz ausente/assunto inexistente, e os métodos de leitura em
 * alvo inexistente (getAnswerForLesson, getHintsForChallenge, lessonCount...).
 *
 * NOTE: roda num banco `:memory:` criado pela própria repo, onde o FK original da
 * tabela é enforced — para espelhar o comportamento real da camada.
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

describe('slugify — inputs degenerados', () => {
  it('string vazia / só espaços / só pontuação → slug vazio (sem crash)', () => {
    assert.equal(slugify(''), '');
    assert.equal(slugify('   '), '');
    assert.equal(slugify('!!!'), '');
  });

  it('acentos compostos e hífens normalizados', () => {
    assert.equal(slugify('Café déjà-vu'), 'cafe-deja-vu');
  });
});

describe('createLessonRepo — upsertSubject idempotente sob colisão de slug', () => {
  it('"Café" e "cafe" produzem o MESMO slug "cafe" → mesmo subject (1 linha)', async () => {
    const { repo, close } = makeRepo();
    const r1 = await repo.upsertSubject('Café');
    const r2 = await repo.upsertSubject('cafe');
    assert.equal(r1.slug, 'cafe');
    assert.equal(r2.slug, 'cafe');
    assert.equal(r2.subject.id, r1.subject.id, 'deveria ser idempotente (mesmo id)');
    const list = await repo.listSubjects();
    assert.equal(list.length, 1);
    close();
  });
});

describe('createLessonRepo — createLesson valida subjectSlug', () => {
  it('lança quando o subjectSlug não existe', async () => {
    const { repo, close } = makeRepo();
    await assert.rejects(
      () => repo.createLesson({ subjectSlug: 'nao-existe', title: 'T', body: 'B' }),
      /assunto desconhecido/,
    );
    close();
  });

  it('aceita title/body vazios (não valida conteúdo — comportamento observado)', async () => {
    const { repo, close } = makeRepo();
    await repo.upsertSubject('algoritmos');
    const id = await repo.createLesson(
      lessonInput({ title: '   ', body: '' }),
    );
    const lesson = await repo.getLessonById(id);
    assert.ok(lesson, 'deveria persistir mesmo com conteúdo em branco');
    assert.equal(lesson!.lesson.difficulty, 1, 'difficulty default 1 quando omitida');
    close();
  });

  it('difficulty inválida/omitida usa default 1', async () => {
    const { repo, close } = makeRepo();
    await repo.upsertSubject('algoritmos');
    const id = await repo.createLesson(lessonInput({ difficulty: undefined }));
    const lesson = await repo.getLessonById(id);
    assert.equal((lesson as any)?.lesson.difficulty, 1);
    close();
  });
});

describe('createLessonRepo — recordAnswer em lesson inexistente', () => {
  it('no-op seguro: NÃO lança, NÃO grava resposta nem mexe no progress', async () => {
    const { repo, db, close } = makeRepo();
    let threw = false;
    try {
      await repo.recordAnswer('lesson-inexistente', 'resposta');
    } catch {
      threw = true;
    }
    assert.equal(threw, false, 'não deve lançar (lesson inexistente → no-op)');
    const answers = db.prepare('SELECT COUNT(*) AS n FROM lesson_answers').get() as { n: number };
    assert.equal(answers.n, 0, 'nada gravado em lesson_answers');
    const progress = db.prepare('SELECT COUNT(*) AS n FROM progress').get() as { n: number };
    assert.equal(progress.n, 0, 'nenhuma linha de progress criada');
    close();
  });

  it('recordAnswer em lesson válida NÃO deixa rastro em lesson inexistente adjacente', async () => {
    const { repo, close } = makeRepo();
    await repo.upsertSubject('algoritmos');
    const id = await repo.createLesson(lessonInput());
    await repo.recordAnswer(id, 'resposta valida');
    const none = await repo.getAnswerForLesson('outra-inexistente');
    assert.equal(none, null);
    close();
  });
});

describe('createLessonRepo — recordHintBreak em lesson/challenge inexistente', () => {
  it('no-op seguro: NÃO lança, NÃO grava evento nem mexe no progress', async () => {
    const { repo, db, close } = makeRepo();
    let threw = false;
    try {
      await repo.recordHintBreak('lesson-inexistente', 'chal-inexistente', 'hint-4th', 'nota');
    } catch {
      threw = true;
    }
    assert.equal(threw, false, 'não deve lançar (lesson inexistente → no-op)');
    const events = db.prepare('SELECT COUNT(*) AS n FROM hint_break_events').get() as { n: number };
    assert.equal(events.n, 0, 'nada gravado em hint_break_events');
    const progress = db.prepare('SELECT COUNT(*) AS n FROM progress').get() as { n: number };
    assert.equal(progress.n, 0, 'nenhuma linha de progress criada');
    close();
  });

  it('recordHintBreak em lesson válida grava evento (regressão do no-op anterior)', async () => {
    const { repo, db, close } = makeRepo();
    await repo.upsertSubject('algoritmos');
    const lessonId = await repo.createLesson(
      lessonInput({
        challenge: {
          slug: 's', title: 'T', language: 'py', concept: 'c',
          statement: 'st', testCasesJson: '[]', solutionJson: '{}',
        },
      }),
    );
    const ch = db.prepare('SELECT id FROM challenges LIMIT 1').get() as { id: string };
    await repo.recordHintBreak(lessonId, ch.id, 'pediu a resposta', 'nota');
    const ev = db
      .prepare('SELECT * FROM hint_break_events LIMIT 1')
      .get() as { reason: string; note: string; lesson_id: string };
    assert.equal(ev.reason, 'pediu a resposta');
    assert.equal(ev.note, 'nota');
    assert.equal(ev.lesson_id, lessonId);
    const totals = await repo.answeredTopicCount('algoritmos');
    assert.equal(totals.becameChildren, 1);
    close();
  });
});

describe('createLessonRepo — hints fora de ordem na leitura', () => {
  it('getHintsForChallenge ordena por position ASC mesmo inseridos fora de ordem', async () => {
    const { repo, db, close } = makeRepo();
    await repo.upsertSubject('algoritmos');
    const lessonId = await repo.createLesson(
      lessonInput({
        challenge: {
          slug: 's', title: 'T', language: 'py', concept: 'c',
          statement: 'st', testCasesJson: '[]', solutionJson: '{}',
          hints: [
            { position: 3, hintText: 'terceiro' },
            { position: 1, hintText: 'primeiro' },
            { position: 2, hintText: 'segundo' },
          ],
        },
      }),
    );
    const ch = db.prepare('SELECT id FROM challenges LIMIT 1').get() as { id: string };
    const hints = await repo.getHintsForChallenge(ch.id);
    assert.deepEqual(
      hints.map((h) => [h.position, h.hint_text]),
      [
        [1, 'primeiro'],
        [2, 'segundo'],
        [3, 'terceiro'],
      ],
    );
    void lessonId;
    close();
  });

  it('consumeHint marca used_at apenas no hint correspondente (texto exato)', async () => {
    const { repo, db, close } = makeRepo();
    await repo.upsertSubject('algoritmos');
    const lessonId = await repo.createLesson(
      lessonInput({
        challenge: {
          slug: 's', title: 'T', language: 'py', concept: 'c',
          statement: 'st', testCasesJson: '[]', solutionJson: '{}',
          hints: [
            { position: 1, hintText: 'ajuda A' },
            { position: 2, hintText: 'ajuda B' },
          ],
        },
      }),
    );
    const ch = db.prepare('SELECT id FROM challenges LIMIT 1').get() as { id: string };
    await repo.consumeHint(ch.id, 'ajuda A');
    const hints = await repo.getHintsForChallenge(ch.id);
    assert.ok(hints[0].used_at, 'hint A consumido');
    assert.equal(hints[1].used_at, null, 'hint B não consumido');
    void lessonId;
    close();
  });

  it('addHint lança quando a lesson não tem desafio fundido', async () => {
    const { repo, close } = makeRepo();
    await repo.upsertSubject('algoritmos');
    const lessonId = await repo.createLesson(lessonInput());
    await assert.rejects(() => repo.addHint(lessonId, 1, 'hint'), /nenhum desafio fundido/);
    close();
  });

  it('consumeHint lança quando o challenge não existe', async () => {
    const { repo, close } = makeRepo();
    await assert.rejects(() => repo.consumeHint('chal-inexistente', 'hint'), /challenge desconhecido/);
    close();
  });
});

describe('createLessonRepo — getTree com árvores degeneradas', () => {
  it('assunto inexistente → { root: null, nodes: [] } sem crash', async () => {
    const { repo, close } = makeRepo();
    const tree = await repo.getTree('nao-existe');
    assert.deepEqual(tree, { root: null, nodes: [] });
    close();
  });

  it('ciclo (A pai de B, B pai de A) não trava e devolve root null + ambos os nós', async () => {
    const { repo, db, close } = makeRepo();
    await repo.upsertSubject('ciclo');
    const a = await repo.createLesson({ subjectSlug: 'ciclo', title: 'A', body: 'a' });
    const b = await repo.createLesson({ subjectSlug: 'ciclo', title: 'B', body: 'b' });
    // força o ciclo via SQL direto (repo não expõe setParent).
    db.prepare('UPDATE lessons SET parent_lesson_id = ? WHERE id = ?').run(b, a);
    db.prepare('UPDATE lessons SET parent_lesson_id = ? WHERE id = ?').run(a, b);
    const tree = await repo.getTree('ciclo');
    assert.equal(tree.root, null, 'ciclo não tem raiz efetiva (nenhum nó sem pai e sem origem)');
    assert.equal(tree.nodes.length, 2, 'ambos os nós listados');
    close();
  });

  it('raiz ausente (todo nó com parent) não trava: devolve nodes e root null', async () => {
    const { repo, db, close } = makeRepo();
    await repo.upsertSubject('sinpai');
    const p = await repo.createLesson({ subjectSlug: 'sinpai', title: 'P', body: 'p' });
    const c = await repo.createLesson({ subjectSlug: 'sinpai', title: 'C', body: 'c' });
    // P vira filho de C, C filho de P → ciclo fechado, root nenhum; mas também testa
    // o caso de um nó com parent apontando para nó com origem (não raiz por origem).
    db.prepare('UPDATE lessons SET parent_lesson_id = ?, origin_lesson_id = ? WHERE id = ?').run(c, p, p);
    db.prepare('UPDATE lessons SET parent_lesson_id = ?, origin_lesson_id = ? WHERE id = ?').run(p, null, c);
    const tree = await repo.getTree('sinpai');
    assert.equal(tree.nodes.length, 2);
    // getTree só escolhe raiz com parent==null && origin==null; nenhum satisfaz → root null.
    assert.equal(tree.root, null);
    close();
  });
});

describe('createLessonRepo — leituras em alvo inexistente são seguras', () => {
  it('listSubjects vazio; lessonCountForSubject/answeredTopicCount em assunto inexistente', async () => {
    const { repo, close } = makeRepo();
    assert.deepEqual(await repo.listSubjects(), []);
    assert.equal(await repo.lessonCountForSubject('inexistente'), 0);
    assert.deepEqual(await repo.answeredTopicCount('inexistente'), { answered: 0, hintConsumed: 0, becameChildren: 0 });
    close();
  });

  it('getLessonById, getAnswerForLesson, getHintsForChallenge em id inexistente → null/[].markLessonCompleted inexistente → no-op', async () => {
    const { repo, close } = makeRepo();
    assert.equal(await repo.getLessonById('nope'), null);
    assert.equal(await repo.getAnswerForLesson('nope'), null);
    assert.deepEqual(await repo.getHintsForChallenge('nope'), []);
    await repo.markLessonCompleted('nope'); // não deve lançar
    close();
  });
});
