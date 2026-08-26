/**
 * tests/db/with-transaction.test.ts — semântica de transação do repo
 * (electron/main/db/repo.ts).
 *
 * `withTransaction(db, fn)` é um helper PRIVADO do módulo (repo.ts:241) — a
 * API pública de `createLessonRepo` é quem o exercita (createLesson,
 * recordAnswer, consumeHint, recordHintBreak). Este arquivo valida o CONTRATO
 * de transação através dessa API, com um DatabaseSync `:memory:` próprio do
 * teste:
 *   - COMMIT em sucesso: dados ficam visíveis fora da transação;
 *   - ROLLBACK em erro ANTES de escritas: o erro propaga, nada muda;
 *   - ROLLBACK em erro DEPOIS de escritas: estado original restaurado por
 *     inteiro (lesson + progress + challenge + hints somem juntos);
 *   - transação vazia (fn sem escritas) não corrompe nada;
 *   - duas transações SEQUENCIAIS no mesmo db funcionam;
 *   - violação de FK dentro da transação faz ROLLBACK (erro propaga) — e a
 *     conexão segue aceitando transações novas (ROLLBACK efetivo, não-vacuo);
 *   - ATOMICIDADE sob falha no MEIO da tx (seam de injeção de falha): uma
 *     escrita VÁLIDA feita dentro da tx ANTES do ponto de falha é desfeita
 *     pelo ROLLBACK — se o wrapping transacional sumir, essa escrita vazaria
 *     e o teste falharia (é o que os distingue de asserts de contagem vazios).
 *
 * NOTE: o banco de teste liga `PRAGMA foreign_keys = ON` — a MESMA
 * configuração que connection.ts aplica em produção (openSqlite) — para que
 * violações de FK dentro da transação sejam exatamente o que a camada real
 * encontra.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import {
  createLessonRepo,
  type LessonRepo,
} from '../../electron/main/db/repo';

/** Abre um banco em memória com FK ON (espelha o openSqlite de produção). */
function makeRepo(): { repo: LessonRepo; db: DatabaseSync; close: () => void } {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  const repo = createLessonRepo(() => db);
  return { repo, db, close: () => db.close() };
}

function count(db: DatabaseSync, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
  return row.n;
}

/**
 * Banco `:memory:` com FK ON que permite INJETAR uma falha de constraint no
 * MEIO de uma transação. `arm(fragmento)` faz o PRÓXIMO `.run()` do statement
 * cujo SQL contém `fragmento` lançar — DEPOIS que as escritas válidas
 * anteriores da MESMA tx já aconteceram.
 *
 * POR QUE o seam existe: com a API pública atual, NENHUMA violação de FK real
 * acontece depois de uma escrita — toda violação de FK (lessons.subject_id,
 * hint_break_events.challenge_id, etc.) é a PRIMEIRA escrita da sua tx. O
 * único estouro pós-escrita alcançável pela API é o NOT NULL de
 * challenge_hints (testado acima). O seam simula exatamente esse cenário no
 * ponto escolhido, permitindo provar que o ROLLBACK desfaz a escrita válida
 * anterior — se o wrapping transacional de withTransaction sumisse, essa
 * escrita vazaria (ficaria persistida) e o teste falharia.
 */
function makeFaultyRepo(): {
  repo: LessonRepo;
  db: DatabaseSync;
  arm: (sqlFragment: string) => void;
  close: () => void;
} {
  const real = new DatabaseSync(':memory:');
  real.exec('PRAGMA foreign_keys = ON');
  let armedFragment: string | null = null;
  const db = new Proxy(real, {
    get(target, prop) {
      if (prop === 'prepare') {
        return (sql: string): unknown => {
          const stmt = target.prepare(sql);
          if (armedFragment && sql.includes(armedFragment)) {
            // statement "armado": .run() falha (leituras seguem normais).
            return new Proxy(stmt, {
              get(s, p) {
                const m = Reflect.get(s, p, s);
                if (p === 'run') {
                  return (): never => {
                    throw new Error('constraint failed (falha simulada no meio da tx)');
                  };
                }
                return typeof m === 'function' ? m.bind(s) : m;
              },
            });
          }
          return stmt;
        };
      }
      const orig = Reflect.get(target, prop, target);
      return typeof orig === 'function' ? orig.bind(target) : orig;
    },
  });
  return {
    repo: createLessonRepo(() => db),
    db,
    arm: (fragment: string) => {
      armedFragment = fragment;
    },
    close: () => real.close(),
  };
}

describe('withTransaction — COMMIT em sucesso', () => {
  it('aula+desafio+hints gravados na tx ficam visíveis FORA dela', async () => {
    const { repo, db, close } = makeRepo();
    await repo.upsertSubject('algoritmos');
    await repo.createLesson({
      subjectSlug: 'algoritmos',
      title: 'Ordenação',
      body: 'corpo',
      challenge: {
        slug: 's',
        title: 'T',
        language: 'py',
        concept: 'c',
        statement: 'st',
        testCasesJson: '[]',
        solutionJson: '{}',
        hints: [
          { position: 1, hintText: 'h1' },
          { position: 2, hintText: 'h2' },
        ],
      },
    });
    // withTransaction já fez COMMIT: qualquer statement novo enxerga tudo.
    assert.equal(count(db, 'lessons'), 1);
    assert.equal(count(db, 'progress'), 1, 'progress criado junto na mesma tx');
    assert.equal(count(db, 'challenges'), 1);
    assert.equal(count(db, 'challenge_hints'), 2);
    close();
  });
});

describe('withTransaction — ROLLBACK em erro', () => {
  it('erro ANTES de escritas propaga e não deixa nada persistido', async () => {
    const { repo, db, close } = makeRepo();
    await assert.rejects(
      () => repo.consumeHint('chal-inexistente', 'hint'),
      /challenge desconhecido/,
    );
    assert.equal(count(db, 'challenge_hints'), 0);
    assert.equal(count(db, 'progress'), 0);
    close();
  });

  it('erro DEPOIS de inserts restaura TODO o estado original (nada vaza da tx)', async () => {
    const { repo, db, close } = makeRepo();
    await repo.upsertSubject('algoritmos');
    // O 2º hint viola NOT NULL: a falha acontece DENTRO da tx, depois de a
    // lesson, o progress e o challenge (e o 1º hint) já terem sido inseridos.
    await assert.rejects(
      () =>
        repo.createLesson({
          subjectSlug: 'algoritmos',
          title: 'Aula com hint inválido',
          body: 'corpo',
          challenge: {
            slug: 's',
            title: 'T',
            language: 'py',
            concept: 'c',
            statement: 'st',
            testCasesJson: '[]',
            solutionJson: '{}',
            hints: [
              { position: 1, hintText: 'hint válida' },
              { position: 2, hintText: null as unknown as string }, // NOT NULL
            ],
          },
        }),
      /NOT NULL/i,
    );
    // ROLLBACK desfez TODAS as escritas da transação abortada.
    assert.equal(count(db, 'lessons'), 0, 'lesson não pode ter sobrado');
    assert.equal(count(db, 'progress'), 0, 'progress não pode ter sobrado');
    assert.equal(count(db, 'challenges'), 0, 'challenge não pode ter sobrado');
    assert.equal(count(db, 'challenge_hints'), 0, 'hints não podem ter sobrado');
    // e o banco continua utilizável depois do rollback.
    const ok = await repo.createLesson({ subjectSlug: 'algoritmos', title: 'Pós-rollback', body: 'b' });
    assert.ok(await repo.getLessonById(ok));
    close();
  });

  it('violação de FK dentro da tx: erro propaga, nada grava E a conexão segue aceitando transações novas (ROLLBACK efetivo)', async () => {
    const { repo, db, close } = makeRepo();
    await repo.upsertSubject('algoritmos');
    const lessonId = await repo.createLesson({
      subjectSlug: 'algoritmos',
      title: 'A',
      body: 'b',
      challenge: {
        slug: 's',
        title: 'T',
        language: 'py',
        concept: 'c',
        statement: 'st',
        testCasesJson: '[]',
        solutionJson: '{}',
      },
    });
    const chId = (db.prepare('SELECT id FROM challenges LIMIT 1').get() as { id: string }).id;
    // A violação de FK acontece na PRIMEIRA escrita da tx (INSERT
    // hint_break_events com challenge inexistente), então os dois asserts de
    // contagem abaixo são necessários mas NÃO discriminam sozinhos. O que torna
    // o teste NÃO-VACUO é o passo final: se o ROLLBACK do withTransaction não
    // tivesse rodado, a conexão ficaria com uma transação aberta e o PRÓXIMO
    // BEGIN (novo recordHintBreak) falharia com "cannot start a transaction
    // within a transaction" — o teste abaixo falharia nesse ponto.
    await assert.rejects(
      () => repo.recordHintBreak(lessonId, 'chal-inexistente', 'hint-4th', 'nota'),
      /FOREIGN KEY/i,
    );
    assert.equal(count(db, 'hint_break_events'), 0, 'evento abortado não pode persistir');
    assert.equal(count(db, 'progress'), 1, 'só o progress da lesson original (tx anterior)');
    // DISCRIMINANTE: uma NOVA transação no mesmo db precisa abrir e commitar.
    await repo.recordHintBreak(lessonId, chId, 'hint-4th', 'nota');
    assert.equal(count(db, 'hint_break_events'), 1, 'a tx seguinte deve commitar normalmente');
    close();
  });
});

describe('withTransaction — atomicidade sob falha no MEIO da tx (injeção de falha)', () => {
  // Cada um destes testes falharia se o wrapping transacional de
  // recordAnswer/consumeHint/recordHintBreak sumisse: a escrita VÁLIDA feita
  // antes do ponto de falha ficaria persistida (autocommit) e o assert
  // correspondente quebraria.

  it('recordAnswer: falha após o INSERT válido desfaz a resposta (rollback efetivo)', async () => {
    const { repo, db, arm, close } = makeFaultyRepo();
    await repo.upsertSubject('algoritmos');
    const lessonId = await repo.createLesson({ subjectSlug: 'algoritmos', title: 'A', body: 'b' });
    // Falha no UPDATE do progress — DEPOIS do INSERT lesson_answers (válido).
    arm('SET answered = answered + 1');
    await assert.rejects(() => repo.recordAnswer(lessonId, 'resposta'), /constraint failed/);
    // Se o ROLLBACK não desfizesse a escrita anterior, a resposta vazaria:
    assert.equal(count(db, 'lesson_answers'), 0, 'resposta válida anterior à falha foi desfeita');
    assert.equal(count(db, 'progress'), 1, 'só o progress da tx anterior (commitada)');
    close();
  });

  it('consumeHint: falha após marcar used_at desfaz a marcação', async () => {
    const { repo, db, arm, close } = makeFaultyRepo();
    await repo.upsertSubject('algoritmos');
    await repo.createLesson({
      subjectSlug: 'algoritmos',
      title: 'A',
      body: 'b',
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
    });
    const chId = (db.prepare('SELECT id FROM challenges LIMIT 1').get() as { id: string }).id;
    // Falha no UPDATE do progress — DEPOIS do UPDATE challenge_hints (válido).
    arm('SET hint_consumed = hint_consumed + 1');
    await assert.rejects(() => repo.consumeHint(chId, 'ajuda'), /constraint failed/);
    // Se o ROLLBACK não desfizesse a escrita anterior, used_at ficaria marcado:
    const hints = await repo.getHintsForChallenge(chId);
    assert.equal(hints[0].used_at, null, 'marcação de used_at anterior à falha foi desfeita');
    close();
  });

  it('recordHintBreak: falha após o INSERT válido do evento desfaz o evento', async () => {
    const { repo, db, arm, close } = makeFaultyRepo();
    await repo.upsertSubject('algoritmos');
    const lessonId = await repo.createLesson({
      subjectSlug: 'algoritmos',
      title: 'A',
      body: 'b',
      challenge: {
        slug: 's',
        title: 'T',
        language: 'py',
        concept: 'c',
        statement: 'st',
        testCasesJson: '[]',
        solutionJson: '{}',
      },
    });
    const chId = (db.prepare('SELECT id FROM challenges LIMIT 1').get() as { id: string }).id;
    // Falha no UPDATE do progress — DEPOIS do INSERT hint_break_events (válido).
    arm('SET became_lesson_children = became_lesson_children + 1');
    await assert.rejects(
      () => repo.recordHintBreak(lessonId, chId, 'hint-4th', 'nota'),
      /constraint failed/,
    );
    // Se o ROLLBACK não desfizesse a escrita anterior, o evento vazaria:
    assert.equal(count(db, 'hint_break_events'), 0, 'evento válido anterior à falha foi desfeito');
    close();
  });
});

describe('withTransaction — transação vazia', () => {
  it('fn sem escritas (recordAnswer em lesson inexistente) é no-op e não corrompe nada', async () => {
    const { repo, db, close } = makeRepo();
    await repo.upsertSubject('algoritmos');
    await repo.createLesson({ subjectSlug: 'algoritmos', title: 'A', body: 'b' });
    // early-return dentro da tx: BEGIN + COMMIT sem nenhuma escrita.
    await repo.recordAnswer('lesson-inexistente', 'resposta');
    assert.equal(count(db, 'lesson_answers'), 0);
    assert.equal(count(db, 'progress'), 1, 'nada de progress extra criado');
    const totals = await repo.answeredTopicCount('algoritmos');
    assert.deepEqual(totals, { answered: 0, hintConsumed: 0, becameChildren: 0 });
    close();
  });
});

describe('withTransaction — reentrância básica', () => {
  it('duas transações SEQUENCIAIS no mesmo db cometam de forma independente', async () => {
    const { repo, close } = makeRepo();
    await repo.upsertSubject('algoritmos');
    const a = await repo.createLesson({ subjectSlug: 'algoritmos', title: 'A', body: 'a' });
    const b = await repo.createLesson({ subjectSlug: 'algoritmos', title: 'B', body: 'b' });
    assert.notEqual(a, b);
    const list = await repo.listLessonsBySubject('algoritmos');
    assert.equal(list.length, 2);
    assert.deepEqual(list.map((l) => l.title).sort(), ['A', 'B']);
    close();
  });
});
