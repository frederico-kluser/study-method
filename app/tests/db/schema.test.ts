/**
 * tests/db/schema.test.ts — fundação SQL: schema, migrator idempotente e
 * conexão DI. Abre um banco real em arquivo tmp (mkdtemp), roda o migrator 2x
 * e confirma idempotência, existência de todas as tabelas, FKs/PKs e o round
 * trip de INSERT+SELECT de uma linha completa do domínio.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { openSqlite, openMigratedSqlite, type SqliteConnection } from '../../electron/main/db/connection';
import {
  TABLE_NAMES,
  SCHEMA_VERSION,
} from '../../electron/main/db/schema';

/** Diretório tmp único deste run (criado em `before`, removido em `after`). */
let tmpRoot = '';
let dbConn: SqliteConnection | undefined;

async function cleanupConn() {
  if (dbConn) {
    try {
      dbConn.close();
    } catch {
      /* já fechada */
    }
    dbConn = undefined;
  }
}

before(async () => {
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'study-schema-'));
});

after(async () => {
  await cleanupConn();
  await fsp.rm(tmpRoot, { recursive: true, force: true });
});

function dbPath(name: string): string {
  return path.join(tmpRoot, name, 'study.db');
}

describe('migrator idempotente', () => {
  it('aplica o schema 2x sem falhar (abre e fecha entre as rodadas)', async () => {
    const p = dbPath('idem');
    const conn1 = await openSqlite(p);
    conn1.migrate.migrate();
    conn1.close();

    // 2ª abertura num bancos já migrado: migrate() pode rodar de novo sem erro.
    const conn2 = await openSqlite(p);
    conn2.migrate.migrate();
    assert.equal(conn2.migrate.getUserVersion(), SCHEMA_VERSION);
    conn2.close();

    // 3ª abertura lendo (sem re-migrar) também respeita a versão.
    const conn3 = await openSqlite(p);
    assert.equal(conn3.migrate.getUserVersion(), SCHEMA_VERSION);
    conn3.close();
  });

  it('user_version é 0 antes de migrar e vira SCHEMA_VERSION depois', async () => {
    const p = dbPath('version');
    const conn = await openSqlite(p);
    assert.equal(conn.migrate.getUserVersion(), 0);
    conn.migrate.migrate();
    assert.equal(conn.migrate.getUserVersion(), SCHEMA_VERSION);
    await cleanupConn();
  });
});

describe('schema aplicado — tabelas e restrições', () => {
  before(async () => {
    dbConn = await openMigratedSqlite(dbPath('full'));
  });

  it('todas as tabelas de schema.ts existem após migrate', () => {
    const rows = dbConn!.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    const names = new Set(rows.map((r) => r.name));
    for (const t of TABLE_NAMES) {
      assert.ok(names.has(t), `tabela esperada e ausente: ${t}`);
    }
  });

  it('PRAGMA foreign_keys está ON na conexão migrada', () => {
    const row = dbConn!.db.prepare('PRAGMA foreign_keys').get() as {
      [key: string]: unknown;
    };
    assert.equal(Number(row['foreign_keys']), 1);
  });

  it('lessons declara FK para subjects e FKs/pai-origem internas', () => {
    const row = dbConn!.db
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='lessons'")
      .get() as { sql: string } | undefined;
    assert.ok(row, 'tabela lessons ausente');
    const sql = row.sql.toLowerCase();
    for (const needle of [
      'references subjects(id)',
      'references lessons(id)',
      'parent_lesson_id',
      'origin_lesson_id',
    ]) {
      assert.ok(sql.includes(needle), `lessons.sql não contém "${needle}"`);
    }
  });

  it('progress tem PK composta (subject_id, lesson_id)', () => {
    const row = dbConn!.db
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='progress'")
      .get() as { sql: string } | undefined;
    assert.ok(row, 'tabela progress ausente');
    const sql = row.sql.toLowerCase();
    assert.ok(sql.includes('primary key (subject_id, lesson_id)'), 'PK composta ausente');
  });

  it('índice único de hint (challenge_id, position) existe', () => {
    const row = dbConn!.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_challenge_hints_pos'",
      )
      .get() as { name: string } | undefined;
    assert.equal(row?.name, 'idx_challenge_hints_pos');
  });
});

describe('round trip de uma linha completa do domínio', () => {
  before(async () => {
    dbConn = await openMigratedSqlite(dbPath('crud'));
  });

  it('insere subject + lesson + answer + challenge + hint + break_event + progress e lê de volta', () => {
    const db = dbConn!.db;

    const sub = db
      .prepare('INSERT INTO subjects (id, name, slug) VALUES (?, ?, ?)')
      .run('sub-1', 'Programação', 'programacao');
    assert.equal(sub.changes, 1);

    const parent = db
      .prepare('INSERT INTO lessons (id, subject_id, title, body) VALUES (?, ?, ?, ?)')
      .run('les-0', 'sub-1', 'Raiz', '**Parágrafo 1** de markdown.');
    assert.equal(parent.changes, 1);

    const lesson = db
      .prepare(
        `INSERT INTO lessons
           (id, subject_id, title, body, difficulty, parent_lesson_id, origin_lesson_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('les-1', 'sub-1', 'Loops', 'Aula curta sobre for.', 2, 'les-0', 'les-0');
    assert.equal(lesson.changes, 1);

    const ans = db
      .prepare('INSERT INTO lesson_answers (id, lesson_id, answer_text) VALUES (?, ?, ?)')
      .run('ans-1', 'les-1', 'o laço executa enquanto a condição é verdadeira');
    assert.equal(ans.changes, 1);

    const chal = db
      .prepare(
        `INSERT INTO challenges
           (id, lesson_id, challenge_slug, title, language, concept, difficulty, statement,
            test_cases_json, solution_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'chal-1',
        'les-1',
        'soma-pares',
        'Soma de pares',
        'typescript',
        'loops',
        3,
        'Some os pares de 1 a N.',
        JSON.stringify([{ input: 'N=4', expected: '6' }]),
        JSON.stringify({ fn: 'somaPares(n) {}' }),
      );
    assert.equal(chal.changes, 1);

    const hint = db
      .prepare(
        'INSERT INTO challenge_hints (challenge_id, position, hint_text) VALUES (?, ?, ?)',
      )
      .run('chal-1', 0, 'Pense em % 2.');
    assert.equal(hint.changes, 1);

    const brk = db
      .prepare(
        'INSERT INTO hint_break_events (challenge_id, lesson_id, reason, note) VALUES (?, ?, ?, ?)',
      )
      .run('chal-1', 'les-1', 'hint-4th', 'não consigo lembrar de divisão inteira');
    assert.equal(brk.changes, 1);

    const prog = db
      .prepare(
        `INSERT INTO progress (subject_id, lesson_id, answered, hint_consumed, became_lesson_children)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run('sub-1', 'les-1', 1, 2, 0);
    assert.equal(prog.changes, 1);

    // ————— leitura de volta —————
    assert.equal(
      (db.prepare('SELECT id, slug FROM subjects WHERE id = ?').get('sub-1') as any)?.slug,
      'programacao',
    );

    const les = db
      .prepare('SELECT title, difficulty, parent_lesson_id, origin_lesson_id FROM lessons WHERE id = ?')
      .get('les-1') as any;
    assert.equal(les.title, 'Loops');
    assert.equal(les.difficulty, 2);
    assert.equal(les.parent_lesson_id, 'les-0');
    assert.equal(les.origin_lesson_id, 'les-0');

    assert.equal(
      (db.prepare('SELECT answer_text FROM lesson_answers WHERE id = ?').get('ans-1') as any)
        ?.answer_text,
      'o laço executa enquanto a condição é verdadeira',
    );

    const chalRow = db
      .prepare('SELECT challenge_slug, test_cases_json FROM challenges WHERE id = ?')
      .get('chal-1') as any;
    assert.equal(chalRow.challenge_slug, 'soma-pares');
    assert.deepEqual(JSON.parse(chalRow.test_cases_json), [{ input: 'N=4', expected: '6' }]);

    assert.equal(
      (db.prepare('SELECT hint_text FROM challenge_hints WHERE id = ?').get(hint.lastInsertRowid as number) as any)
        ?.hint_text,
      'Pense em % 2.',
    );
    assert.equal(
      (db.prepare('SELECT reason, note FROM hint_break_events WHERE id = ?').get(brk.lastInsertRowid as number) as any)
        ?.reason,
      'hint-4th',
    );

    const progRow = db
      .prepare('SELECT answered, hint_consumed FROM progress')
      .get() as any;
    assert.equal(progRow.answered, 1);
    assert.equal(progRow.hint_consumed, 2);
  });

  it('FK enforcement rejeita lesson_answers órfã (sem lesson) e progress órfão', () => {
    const db = dbConn!.db;
    assert.throws(
      () =>
        db
          .prepare('INSERT INTO lesson_answers (id, lesson_id, answer_text) VALUES (?, ?, ?)')
          .run('ans-orphan', 'les-nonexist', 'texto'),
      /FOREIGN KEY/i,
    );
    assert.throws(
      () =>
        db
          .prepare('INSERT INTO progress (subject_id, lesson_id) VALUES (?, ?)')
          .run('sub-x', 'les-y'),
      /FOREIGN KEY/i,
    );
  });
});
