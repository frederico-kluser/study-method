/**
 * tests/db/migration-v5.test.ts — migração VERSIONADA v4 → v5
 * (onda1-contrato-quiz: quiz_attempts + quiz_remediations).
 *
 * Mesmo desenho de migration-v2/v3.test.ts: a fixture do banco da versão
 * ANTERIOR é montada num ARQUIVO REAL com o DDL v4 EXATO, e a migração é
 * exercitada pelos DOIS backends — `openSqlite` (node:sqlite, o Node do
 * sistema) e `openSqliteSqlJs` (sql.js WASM, o caminho do Electron main).
 *
 * O que este arquivo PROVA:
 *   - banco v4 EXISTENTE (o study.db de quem já usa o app) → sobe para v5 SEM
 *     perder NENHUMA linha: as duas tabelas do quiz são CRIADAS, nada é
 *     recriado nem descartado (o passo v5 não tem ALTER — só CREATE IF NOT
 *     EXISTS, então dispensa `guardedAlter`);
 *   - migrar DUAS VEZES é idempotente (não lança, versão e dados estáveis);
 *   - banco NOVO (user_version=0) nasce direto em SCHEMA_VERSION=5, com as
 *     duas tabelas e os dois índices já no SCHEMA_SQL;
 *   - os CHECKs das colunas novas valem no caminho de criação NOVA (`correct`
 *     só 0/1; `quiz_origin` só 'authored'/'remedial') — e valem TAMBÉM no
 *     banco migrado, porque as tabelas nascem por CREATE TABLE (é o mesmo
 *     motivo pelo qual a v2 pôde manter os CHECKs de challenge_attempts e não
 *     pôde manter o de `subjects.domain`, que veio por ALTER).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';

import {
  openSqlite,
  openSqliteSqlJs,
  openMigratedSqlite,
  type SqliteConnection,
} from '../../electron/main/db/connection';
import { SCHEMA_VERSION, TABLE_NAMES } from '../../electron/main/db/schema';
import { mkTempDir, rmrf } from '../_helpers/fs';

/** Schema v4 EXATO (estado após a rodada 8 — trilhas), SEM as tabelas do quiz. */
const V4_DDL = `
CREATE TABLE IF NOT EXISTS subjects (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  domain     TEXT NOT NULL DEFAULT 'programming' CHECK (domain IN ('programming','math')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS lessons (
  id               TEXT PRIMARY KEY,
  subject_id       TEXT NOT NULL REFERENCES subjects(id),
  title            TEXT NOT NULL,
  body             TEXT NOT NULL,
  difficulty       INTEGER NOT NULL DEFAULT 1,
  parent_lesson_id TEXT REFERENCES lessons(id),
  origin_lesson_id TEXT REFERENCES lessons(id),
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at     TEXT,
  exercise_json    TEXT
);
CREATE TABLE IF NOT EXISTS lesson_answers (
  id          TEXT PRIMARY KEY,
  lesson_id   TEXT NOT NULL REFERENCES lessons(id),
  answer_text TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS challenges (
  id               TEXT PRIMARY KEY,
  lesson_id        TEXT NOT NULL REFERENCES lessons(id),
  challenge_slug   TEXT,
  title            TEXT,
  language         TEXT,
  concept          TEXT,
  difficulty       INTEGER,
  statement        TEXT,
  test_cases_json  TEXT,
  solution_json    TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS challenge_hints (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id TEXT NOT NULL REFERENCES challenges(id),
  position     INTEGER NOT NULL,
  hint_text    TEXT NOT NULL,
  used_at      TEXT
);
CREATE TABLE IF NOT EXISTS hint_break_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id TEXT REFERENCES challenges(id),
  lesson_id    TEXT REFERENCES lessons(id),
  reason       TEXT,
  note         TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS progress (
  subject_id             TEXT NOT NULL REFERENCES subjects(id),
  lesson_id              TEXT NOT NULL REFERENCES lessons(id),
  answered               INTEGER NOT NULL DEFAULT 0,
  hint_consumed          INTEGER NOT NULL DEFAULT 0,
  became_lesson_children INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (subject_id, lesson_id)
);
CREATE TABLE IF NOT EXISTS challenge_attempts (
  id           TEXT PRIMARY KEY,
  subject_id   TEXT NOT NULL REFERENCES subjects(id),
  lesson_id    TEXT NOT NULL,
  challenge_id TEXT NOT NULL,
  verdict      TEXT NOT NULL CHECK (verdict IN ('passed','failed','timeout','abandoned')),
  stars        INTEGER NOT NULL DEFAULT 0 CHECK (stars BETWEEN 0 AND 3),
  duration_ms  INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS track_progress (
  track_slug   TEXT NOT NULL,
  lesson_id    TEXT NOT NULL,
  completed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (track_slug, lesson_id)
);
CREATE TABLE IF NOT EXISTS track_proficiency (
  track_slug TEXT PRIMARY KEY,
  verdict    TEXT NOT NULL CHECK (verdict IN ('passed','failed')),
  stars      INTEGER NOT NULL DEFAULT 0 CHECK (stars BETWEEN 0 AND 3),
  passed_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS generated_challenges (
  id                  TEXT PRIMARY KEY,
  track_slug          TEXT NOT NULL,
  lesson_id           TEXT NOT NULL,
  challenge_id        TEXT NOT NULL,
  statement           TEXT NOT NULL,
  starter_code        TEXT NOT NULL,
  tests_code          TEXT NOT NULL,
  solution_code       TEXT NOT NULL,
  expected_test_count INTEGER NOT NULL,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

/** Dados de usuário da fixture v4 (matéria + aula + tentativa + estado de trilha). */
function insertV4Data(db: DatabaseSync): void {
  db.prepare(`INSERT INTO subjects (id, name, slug, domain, created_at) VALUES (?, ?, ?, ?, ?)`).run(
    'sub-v4', 'Python', 'python', 'programming', '2026-05-01T10:00:00.000Z',
  );
  db.prepare(
    `INSERT INTO lessons (id, subject_id, title, body, difficulty, created_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run('les-v4', 'sub-v4', 'Aula v4', 'Corpo da aula v4.', 2, '2026-05-01T10:01:00.000Z', null);
  db.prepare(
    `INSERT INTO challenge_attempts
       (id, subject_id, lesson_id, challenge_id, verdict, stars, duration_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('att-v4', 'sub-v4', 'lesson:les-v4', 'imprimir-oi', 'failed', 1, 4200, '2026-05-02T00:00:00.000Z');
  db.prepare(`INSERT INTO track_progress (track_slug, lesson_id, completed_at) VALUES (?, ?, ?)`).run(
    'python', 'les-v4', '2026-05-02T00:05:00.000Z',
  );
  db.prepare(`INSERT INTO track_proficiency (track_slug, verdict, stars, passed_at) VALUES (?, ?, ?, ?)`).run(
    'python', 'passed', 3, '2026-05-03T00:00:00.000Z',
  );
  db.prepare(
    `INSERT INTO generated_challenges
       (id, track_slug, lesson_id, challenge_id, statement, starter_code, tests_code,
        solution_code, expected_test_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('gen-v4', 'python', 'les-v4', 'dobro', 'st', 'sc', 'tc', 'sol', 3, '2026-05-04T00:00:00.000Z');
}

/** Banco no estado v4 (user_version=4) com dados de usuário, num arquivo real. */
function createV4Fixture(file: string): void {
  const db = new DatabaseSync(file);
  db.exec(V4_DDL);
  db.exec('PRAGMA user_version = 4');
  insertV4Data(db);
  db.close();
}

function countRows(db: SqliteConnection['db'], table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
  return Number(row.n);
}

let dir = '';

before(async () => {
  dir = await mkTempDir('migration-v5-');
});

after(async () => {
  if (dir) await rmrf(dir);
});

function dbPath(name: string): string {
  return join(dir, `${name}.db`);
}

/** Estado esperado depois de migrar a fixture v4 (usado pelos dois backends). */
function assertMigratedState(conn: SqliteConnection): void {
  const db = conn.db;
  assert.equal(conn.migrate.getUserVersion(), SCHEMA_VERSION);

  // NADA se perdeu (o passo v5 não recria nem descarta tabela alguma).
  assert.equal(countRows(db, 'subjects'), 1);
  assert.equal(countRows(db, 'lessons'), 1);
  assert.equal(countRows(db, 'challenge_attempts'), 1);
  assert.equal(countRows(db, 'track_progress'), 1);
  assert.equal(countRows(db, 'track_proficiency'), 1);
  assert.equal(countRows(db, 'generated_challenges'), 1);
  assert.equal(
    (db.prepare('SELECT verdict FROM challenge_attempts WHERE id = ?').get('att-v4') as { verdict: string }).verdict,
    'failed',
  );

  // As tabelas NOVAS existem e nascem vazias.
  assert.equal(countRows(db, 'quiz_attempts'), 0);
  assert.equal(countRows(db, 'quiz_remediations'), 0);
  for (const t of TABLE_NAMES) {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
      .get(t) as { name: string } | undefined;
    assert.ok(row, `tabela ${t} deveria existir após migrar`);
  }

  // E são USÁVEIS (com os CHECKs, porque vieram por CREATE TABLE).
  db.prepare(
    `INSERT INTO quiz_attempts
       (id, track_slug, lesson_id, section_key, assertion_id, selected_index, correct,
        attempt_no, quiz_origin, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('qa-1', 'python', 'les-v4', 'o-que-e-print', 'print-mostra', 2, 0, 1, 'authored', '2026-05-05T00:00:00.000Z');
  assert.equal(countRows(db, 'quiz_attempts'), 1);
  assert.throws(
    () =>
      db
        .prepare(
          `INSERT INTO quiz_attempts
             (id, track_slug, lesson_id, section_key, assertion_id, selected_index, correct,
              attempt_no, quiz_origin, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('qa-2', 'python', 'les-v4', 's', 'a', 0, 7, 1, 'authored', 'x'),
    /CHECK|constraint/i,
    'correct só aceita 0/1 mesmo em banco MIGRADO',
  );
  assert.throws(
    () =>
      db
        .prepare(
          `INSERT INTO quiz_attempts
             (id, track_slug, lesson_id, section_key, assertion_id, selected_index, correct,
              attempt_no, quiz_origin, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('qa-3', 'python', 'les-v4', 's', 'a', 0, 1, 1, 'chutado', 'x'),
    /CHECK|constraint/i,
    'quiz_origin só aceita authored/remedial',
  );
  db.prepare('DELETE FROM quiz_attempts').run(); // não polui as contagens de quem chamar depois
}

describe('migração v4 → v5 (backend node:sqlite — openSqlite)', () => {
  it('banco v4 com dados → migra sem perder nada e ganha quiz_attempts + quiz_remediations', async () => {
    const file = dbPath('v4-node');
    createV4Fixture(file);

    const conn = await openSqlite(file);
    try {
      assert.equal(conn.migrate.getUserVersion(), 4, 'fixture deveria nascer em v4');
      conn.migrate.migrate();
      assertMigratedState(conn);

      // IDEMPOTENTE: re-migrar não lança, não muda versão nem dados.
      assert.doesNotThrow(() => conn.migrate.migrate());
      assert.equal(conn.migrate.getUserVersion(), SCHEMA_VERSION);
      assert.equal(countRows(conn.db, 'subjects'), 1);
    } finally {
      conn.close();
    }
  });
});

describe('migração v4 → v5 (backend sql.js WASM — o caminho do Electron)', () => {
  it('a MESMA fixture v4 migrada pelo backend do Electron preserva dados e vira v5', async () => {
    const file = dbPath('v4-sqljs');
    createV4Fixture(file);

    const conn = await openSqliteSqlJs(file);
    try {
      assert.equal(conn.migrate.getUserVersion(), 4);
      conn.migrate.migrate();
      assertMigratedState(conn);
      assert.doesNotThrow(() => conn.migrate.migrate());
    } finally {
      conn.close();
    }
  });
});

describe('banco NOVO — nasce direto em v5 (SCHEMA_SQL completo)', () => {
  it('openMigratedSqlite num arquivo novo entrega SCHEMA_VERSION=5 com as tabelas e os índices do quiz', async () => {
    const conn = await openMigratedSqlite(dbPath('novo'));
    try {
      assert.equal(conn.migrate.getUserVersion(), SCHEMA_VERSION);
      assert.equal(SCHEMA_VERSION, 5, 'o SCHEMA_VERSION desta onda é 5 (v5: quiz adaptativo)');
      const db = conn.db;
      for (const t of TABLE_NAMES) {
        const row = db
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
          .get(t) as { name: string } | undefined;
        assert.ok(row, `tabela ${t} deveria existir em banco novo`);
      }
      const indices = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as Array<{ name: string }>;
      const nomes = new Set(indices.map((i) => i.name));
      assert.ok(nomes.has('idx_quiz_attempts_track_lesson'), 'índice (track_slug, lesson_id) de quiz_attempts');
      assert.ok(nomes.has('idx_quiz_remediations_track_lesson'), 'índice (track_slug, lesson_id) de quiz_remediations');

      // round-trip mínimo direto no SQL (a repo tem o seu próprio teste).
      db.prepare(
        `INSERT INTO quiz_remediations
           (id, track_slug, lesson_id, section_key, origin_assertion_id, generation,
            explanation, quiz_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run('rem-1', 'python', 'aula-1', 'o-que-e-print', 'print-mostra', 1, 'Você escolheu…', '{"id":"q1"}', '2026-05-06T00:00:00.000Z');
      const lida = db.prepare('SELECT explanation, quiz_json FROM quiz_remediations WHERE id = ?').get('rem-1') as {
        explanation: string;
        quiz_json: string;
      };
      assert.equal(lida.explanation, 'Você escolheu…');
      assert.equal(lida.quiz_json, '{"id":"q1"}');
    } finally {
      conn.close();
    }
  });
});

describe('re-migrate de banco v5 — no-op', () => {
  it('migrar um banco já em v5 não lança, não muda a versão nem os dados', async () => {
    const conn = await openSqlite(dbPath('nomig'));
    try {
      conn.migrate.migrate(); // nasce direto em v5
      assert.equal(conn.migrate.getUserVersion(), SCHEMA_VERSION);
      conn.db
        .prepare(
          `INSERT INTO quiz_attempts
             (id, track_slug, lesson_id, section_key, assertion_id, selected_index, correct,
              attempt_no, quiz_origin, created_at)
           VALUES ('qa-keep', 'python', 'aula-1', 'sec', 'a1', 0, 1, 1, 'remedial', '2026-05-07T00:00:00.000Z')`,
        )
        .run();
      const antes = conn.migrate.getUserVersion();
      assert.doesNotThrow(() => conn.migrate.migrate());
      assert.equal(conn.migrate.getUserVersion(), antes, 'user_version não pode mudar no no-op');
      assert.equal(countRows(conn.db, 'quiz_attempts'), 1, 'dados intactos após re-migrate');
    } finally {
      conn.close();
    }
  });
});
