/**
 * tests/db/fk-enforcement.test.ts — enforcement REAL de foreign keys.
 *
 * O schema (schema.ts) DECLARA as FKs; quem as faz valer em runtime é o
 * `PRAGMA foreign_keys = ON` aplicado por connection.ts na abertura
 * (openSqlite). O schema.test.ts já cobre lesson_answers órfã e progress
 * órfão; aqui entram as lacunas:
 *   - lessons com subject_id inexistente;
 *   - lessons com parent_lesson_id / origin_lesson_id inexistentes;
 *   - challenges com lesson_id inexistente;
 *   - challenge_hints com challenge_id inexistente;
 * via WRAPPER (openMigratedSqlite — a configuração real de produção) E via
 * repo (com FK ON, como o app usa).
 *
 * ISOLAMENTO das FKs: os casos de parent_lesson_id e origin_lesson_id criam
 * ANTES um subject VÁLIDO — sem isso, a linha seria rejeitada pelo FK do
 * subject_id e o teste não distinguiria qual FK falhou. Para origin_lesson_id
 * há também um CONTROLE (origin NULL insere) que prova que o subject é válido
 * e que a ÚNICA diferença no caso de erro é o origin inexistente.
 *
 * Inclui também o teste de CONTRASTE documentando o comportamento do
 * node:sqlite: o `DatabaseSync` já liga `PRAGMA foreign_keys = ON` POR PADRÃO
 * (medido em Node 24) — ou seja, as FKs valem mesmo sem o PRAGMA explícito, e
 * o `PRAGMA foreign_keys = ON` do openSqlite é redundante mas inofensivo
 * (idempotente).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';

import { openMigratedSqlite } from '../../electron/main/db/connection';
import { SCHEMA_SQL } from '../../electron/main/db/schema';
import { createLessonRepo, type LessonRepo } from '../../electron/main/db/repo';
import { mkTempDir, rmrf } from '../_helpers/fs';

let dir = '';

before(async () => {
  dir = await mkTempDir('fk-enforce-');
});

after(async () => {
  if (dir) await rmrf(dir);
});

/** Caminho de banco migrado único por teste (evita interferência entre casos). */
function migratedPath(name: string): string {
  return join(dir, `${name}.db`);
}

describe('FK enforcement via WRAPPER (openMigratedSqlite + SQL cru)', () => {
  it('lessons com subject_id inexistente → erro FOREIGN KEY', async () => {
    const conn = await openMigratedSqlite(migratedPath('lesson-subject'));
    try {
      assert.throws(
        () =>
          conn.db
            .prepare(
              "INSERT INTO lessons (id, subject_id, title, body) VALUES ('l-x', 'sub-inexistente', 'T', 'B')",
            )
            .run(),
        /FOREIGN KEY/i,
      );
    } finally {
      conn.close();
    }
  });

  it('parent_lesson_id ISOLADO: subject válido + parent inexistente → erro FOREIGN KEY', async () => {
    const conn = await openMigratedSqlite(migratedPath('lesson-parent'));
    try {
      // subject VÁLIDO criado antes: sem isso a rejeição poderia ser do FK do
      // subject_id, e o teste não isolaria a FK de parent_lesson_id.
      conn.db
        .prepare("INSERT INTO subjects (id, name, slug) VALUES ('sub-a', 'Álgebra', 'algebra')")
        .run();
      assert.throws(
        () =>
          conn.db
            .prepare(
              `INSERT INTO lessons (id, subject_id, title, body, parent_lesson_id)
               VALUES ('l-x', 'sub-a', 'T', 'B', 'pai-inexistente')`,
            )
            .run(),
        /FOREIGN KEY/i,
      );
    } finally {
      conn.close();
    }
  });

  it('origin_lesson_id ISOLADO: subject válido + origin inexistente → erro FOREIGN KEY', async () => {
    const conn = await openMigratedSqlite(migratedPath('lesson-origin'));
    try {
      // subject VÁLIDO criado antes (mesma razão do parent_lesson_id).
      conn.db
        .prepare("INSERT INTO subjects (id, name, slug) VALUES ('sub-a', 'Álgebra', 'algebra')")
        .run();
      assert.throws(
        () =>
          conn.db
            .prepare(
              `INSERT INTO lessons (id, subject_id, title, body, origin_lesson_id)
               VALUES ('l-x', 'sub-a', 'T', 'B', 'origem-inexistente')`,
            )
            .run(),
        /FOREIGN KEY/i,
      );
    } finally {
      conn.close();
    }
  });

  it('origin_lesson_id — CONTROLE: subject válido + origin NULL insere com sucesso', async () => {
    const conn = await openMigratedSqlite(migratedPath('lesson-origin-control'));
    try {
      conn.db
        .prepare("INSERT INTO subjects (id, name, slug) VALUES ('sub-a', 'Álgebra', 'algebra')")
        .run();
      // Controle do isolamento: o MESMO subject válido, com origin NULL (sem
      // origem), insere — prova que a ÚNICA diferença no caso de erro é o
      // origin_lesson_id inexistente, não o subject_id.
      const res = conn.db
        .prepare(
          `INSERT INTO lessons (id, subject_id, title, body, origin_lesson_id)
           VALUES ('l-ctrl', 'sub-a', 'T', 'B', NULL)`,
        )
        .run();
      assert.equal(res.changes, 1, 'origin NULL (aula sem origem) deve inserir');
    } finally {
      conn.close();
    }
  });

  it('challenges com lesson_id inexistente → erro FOREIGN KEY', async () => {
    const conn = await openMigratedSqlite(migratedPath('challenge-lesson'));
    try {
      assert.throws(
        () =>
          conn.db
            .prepare(
              `INSERT INTO challenges
                 (id, lesson_id, challenge_slug, title, language, concept, statement, test_cases_json, solution_json)
               VALUES ('c-x', 'lesson-inexistente', 's', 'T', 'py', 'c', 'st', '[]', '{}')`,
            )
            .run(),
        /FOREIGN KEY/i,
      );
    } finally {
      conn.close();
    }
  });

  it('challenge_hints com challenge_id inexistente → erro FOREIGN KEY', async () => {
    const conn = await openMigratedSqlite(migratedPath('hint-challenge'));
    try {
      assert.throws(
        () =>
          conn.db
            .prepare(
              "INSERT INTO challenge_hints (challenge_id, position, hint_text) VALUES ('c-inexistente', 1, 'hint')",
            )
            .run(),
        /FOREIGN KEY/i,
      );
    } finally {
      conn.close();
    }
  });
});

describe('FK enforcement via REPO (FK ON, como o app usa)', () => {
  function makeRepo(): { repo: LessonRepo; db: DatabaseSync; close: () => void } {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    return { repo: createLessonRepo(() => db), db, close: () => db.close() };
  }

  it('createLesson com parentLessonId inexistente rejeita com FK e nada persiste', async () => {
    const { repo, db, close } = makeRepo();
    await repo.upsertSubject('algoritmos');
    await assert.rejects(
      () =>
        repo.createLesson({
          subjectSlug: 'algoritmos',
          title: 'T',
          body: 'B',
          parentLessonId: 'pai-inexistente',
        }),
      /FOREIGN KEY/i,
    );
    // a transação abortada não deixou a lesson nem o progress.
    const lessons = db.prepare('SELECT COUNT(*) AS n FROM lessons').get() as { n: number };
    const progress = db.prepare('SELECT COUNT(*) AS n FROM progress').get() as { n: number };
    assert.equal(lessons.n, 0);
    assert.equal(progress.n, 0);
    close();
  });
});

describe('CONTRASTE — comportamento do node:sqlite (FK por padrão)', () => {
  it('DatabaseSync puro já nasce com `PRAGMA foreign_keys = ON` (default do node:sqlite)', () => {
    const db = new DatabaseSync(':memory:');
    // Nenhum PRAGMA foi executado: o default do node:sqlite é FK ON.
    const row = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: unknown };
    assert.equal(Number(row['foreign_keys']), 1, 'node:sqlite deveria ligar FK por padrão');
    db.close();
  });

  it('por isso a linha órfã é rejeitada MESMO sem o PRAGMA explícito (FK real do schema)', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(SCHEMA_SQL); // sem PRAGMA nenhum — o default do node:sqlite já enforced
    assert.throws(
      () =>
        db
          .prepare(
            "INSERT INTO lessons (id, subject_id, title, body) VALUES ('l-x', 'sub-inexistente', 'T', 'B')",
          )
          .run(),
      /FOREIGN KEY/i,
    );
    db.close();
  });

  it('o PRAGMA explícito do openSqlite é idempotente (repetir com FK já ON não quebra)', async () => {
    const conn = await openMigratedSqlite(migratedPath('pragma-idempotente'));
    try {
      // openSqlite roda `PRAGMA foreign_keys = ON` mesmo com o default já ON.
      const row = conn.db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: unknown };
      assert.equal(Number(row['foreign_keys']), 1);
    } finally {
      conn.close();
    }
  });
});
