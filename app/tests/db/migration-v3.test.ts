/**
 * tests/db/migration-v3.test.ts — migração VERSIONADA v2 → v3
 * (onda4-desafio-persistencia: lessons.exercise_json).
 *
 * Cobre os dois caminhos de criação definidos em migrate.ts (mesmo padrão do
 * migration-v2.test.ts):
 *   - banco v2 EXISTENTE (user_version=2, como o study.db do usuário após a
 *     onda 2) → migra para v3 SEM perder dados: lessons ganha `exercise_json`
 *     (ALTER ADD COLUMN nullable — as linhas antigas herdam NULL);
 *   - banco NOVO (user_version=0) → nasce direto em SCHEMA_VERSION=3, com a
 *     coluna exercise_json já no CREATE TABLE de lessons;
 *   - re-migrate de banco já em v3 → no-op (versão e dados intactos);
 *   - caminho de CRASH: exercise_json JÁ adicionada com user_version=2 (boot
 *     anterior crashou entre o ALTER e o stamp v3) → re-migrar não lança
 *     "duplicate column name".
 *
 * A fixture v2 é criada num ARQUIVO REAL (DatabaseSync do node:sqlite) e a
 * migração é exercitada pelos DOIS backends: openSqlite (node:sqlite — Node do
 * sistema) e openSqliteSqlJs (sql.js WASM — o caminho do Electron main em
 * runtime).
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

/** Schema v2 EXATO (estado após a onda 2): subjects COM domain, lessons SEM
 * exercise_json, challenge_attempts presente. Usado para montar a fixture de um
 * banco de usuário da versão anterior. */
const V2_DDL = `
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
  completed_at     TEXT
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
`;

/** Insere os dados de usuário da fixture v2 (subject + lesson + answer +
 * challenge + progress + 1 tentativa). */
function insertV2Data(db: DatabaseSync): void {
  db.prepare(
    `INSERT INTO subjects (id, name, slug, domain, created_at) VALUES (?, ?, ?, ?, ?)`,
  ).run('sub-v2', 'Programação', 'programacao', 'programming', '2026-02-01T10:00:00.000Z');
  db.prepare(
    `INSERT INTO subjects (id, name, slug, domain, created_at) VALUES (?, ?, ?, ?, ?)`,
  ).run('sub-math', 'Frações', 'fracoes', 'math', '2026-02-01T10:00:00.000Z');
  db.prepare(
    `INSERT INTO lessons (id, subject_id, title, body, difficulty, created_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run('les-v2', 'sub-v2', 'Aula v2', 'Corpo da aula v2.', 2, '2026-02-01T10:01:00.000Z', null);
  db.prepare(
    `INSERT INTO lesson_answers (id, lesson_id, answer_text, created_at) VALUES (?, ?, ?, ?)`,
  ).run('ans-v2', 'les-v2', 'resposta do usuário v2', '2026-02-01T10:02:00.000Z');
  db.prepare(
    `INSERT INTO challenges
       (id, lesson_id, challenge_slug, title, language, concept, difficulty,
        statement, test_cases_json, solution_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    'chal-v2', 'les-v2', 'soma-pares', 'Soma de pares', 'python', 'loops', 2,
    'Some os pares.', '[]', '{}', '2026-02-01T10:03:00.000Z',
  );
  db.prepare(
    `INSERT INTO progress (subject_id, lesson_id, answered, hint_consumed, became_lesson_children)
     VALUES (?, ?, ?, ?, ?)`,
  ).run('sub-v2', 'les-v2', 3, 1, 0);
  db.prepare(
    `INSERT INTO challenge_attempts
       (id, subject_id, lesson_id, challenge_id, verdict, stars, duration_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('att-v2', 'sub-v2', 'les-v2', 'chal-v2', 'passed', 2, 1500, '2026-02-02T00:00:00.000Z');
}

/**
 * Cria num arquivo REAL um banco no estado v2 (user_version=2) com dados de
 * usuário (subject + lesson + answer + challenge + progress + attempt).
 */
function createV2Fixture(file: string): void {
  const db = new DatabaseSync(file);
  db.exec(V2_DDL);
  db.exec('PRAGMA user_version = 2');
  insertV2Data(db);
  db.close();
}

/**
 * Caminho B: banco v2 onde o ALTER do `exercise_json` JÁ rodou — um boot
 * anterior crashou ENTRE o ALTER e a gravação de `PRAGMA user_version = 3`.
 * Re-migrar sem o guard de coluna lançaria "duplicate column name: exercise_json".
 */
function createV2ColumnAddedFixture(file: string): void {
  const db = new DatabaseSync(file);
  db.exec(V2_DDL);
  db.exec(`ALTER TABLE lessons ADD COLUMN exercise_json TEXT;`);
  db.exec('PRAGMA user_version = 2');
  insertV2Data(db);
  db.close();
}

/** Conta linhas de uma tabela (helper de verificação de preservação). */
function countRows(db: SqliteConnection['db'], table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
  return Number(row.n);
}

let dir = '';

before(async () => {
  dir = await mkTempDir('migration-v3-');
});

after(async () => {
  if (dir) await rmrf(dir);
});

function dbPath(name: string): string {
  return join(dir, `${name}.db`);
}

/** Verificações comuns do estado pós-migração (usadas pelos dois backends).
 * Assume a fixture v2 (sub-v2/les-v2/chal-v2/att-v2) já presente. */
function assertMigratedState(conn: SqliteConnection): void {
  const db = conn.db;
  // versão
  assert.equal(conn.migrate.getUserVersion(), SCHEMA_VERSION);

  // dados v2 preservados (nada é recriado/descartado)
  assert.equal(countRows(db, 'subjects'), 2);
  assert.equal(countRows(db, 'lessons'), 1);
  assert.equal(countRows(db, 'lesson_answers'), 1);
  assert.equal(countRows(db, 'challenges'), 1);
  assert.equal(countRows(db, 'progress'), 1);
  assert.equal(countRows(db, 'challenge_attempts'), 1);
  const sub = db
    .prepare('SELECT id, name, domain FROM subjects WHERE id = ?')
    .get('sub-v2') as { id: string; name: string; domain: string };
  assert.equal(sub.name, 'Programação');
  assert.equal(sub.domain, 'programming');
  assert.equal(
    (db.prepare('SELECT answer_text FROM lesson_answers WHERE id = ?').get('ans-v2') as { answer_text: string })
      .answer_text,
    'resposta do usuário v2',
  );
  assert.equal(
    (db.prepare('SELECT verdict FROM challenge_attempts WHERE id = ?').get('att-v2') as { verdict: string })
      .verdict,
    'passed',
  );

  // coluna nova com NULL nas linhas antigas (nullable — sem DEFAULT)
  const cols = db.prepare('PRAGMA table_info(lessons)').all() as Array<{ name: string }>;
  const colNames = cols.map((c) => c.name);
  assert.ok(colNames.includes('exercise_json'), 'lessons deveria ter a coluna exercise_json após migrar');
  const ex = db
    .prepare('SELECT exercise_json FROM lessons WHERE id = ?')
    .get('les-v2') as { exercise_json: string | null };
  assert.equal(ex.exercise_json, null, 'linhas antigas ficam com exercise_json NULL');

  // todas as tabelas continuam existindo e utilizáveis
  for (const t of TABLE_NAMES) {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
      .get(t) as { name: string } | undefined;
    assert.ok(row, `tabela ${t} deveria existir após migrar`);
  }
}

describe('migração v2 → v3 (backend node:sqlite — openSqlite)', () => {
  it('banco v2 com dados → migra sem perder nada e ganha exercise_json', async () => {
    const file = dbPath('v2-node');
    createV2Fixture(file);

    const conn = await openSqlite(file);
    try {
      assert.equal(conn.migrate.getUserVersion(), 2, 'fixture deveria nascer em v2');
      conn.migrate.migrate();
      assertMigratedState(conn);

      // idempotência: re-migrar não falha nem muda a versão
      assert.doesNotThrow(() => conn.migrate.migrate());
      assert.equal(conn.migrate.getUserVersion(), SCHEMA_VERSION);
    } finally {
      conn.close();
    }
  });
});

describe('migração v2 → v3 (backend sql.js WASM — openSqliteSqlJs, caminho do Electron)', () => {
  it('a MESMA fixture v2 migrada pelo backend do Electron preserva dados e vira v3', async () => {
    const file = dbPath('v2-sqljs');
    createV2Fixture(file); // fixture criada por node:sqlite em formato SQLite padrão

    const conn = await openSqliteSqlJs(file);
    try {
      assert.equal(conn.migrate.getUserVersion(), 2);
      conn.migrate.migrate();
      assertMigratedState(conn);
      assert.doesNotThrow(() => conn.migrate.migrate()); // idempotente
    } finally {
      conn.close();
    }
  });
});

describe('banco NOVO — nasce direto em v3 (SCHEMA_SQL completo)', () => {
  it('openMigratedSqlite num arquivo novo já entrega SCHEMA_VERSION=3 com exercise_json no CREATE TABLE', async () => {
    const conn = await openMigratedSqlite(dbPath('novo'));
    try {
      assert.equal(conn.migrate.getUserVersion(), SCHEMA_VERSION);
      assert.equal(SCHEMA_VERSION, 3, 'o SCHEMA_VERSION desta onda é 3');
      const db = conn.db;
      for (const t of TABLE_NAMES) {
        const row = db
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
          .get(t) as { name: string } | undefined;
        assert.ok(row, `tabela ${t} deveria existir em banco novo`);
      }
      const cols = db.prepare('PRAGMA table_info(lessons)').all() as Array<{ name: string }>;
      assert.ok(cols.map((c) => c.name).includes('exercise_json'));
      // a coluna é utilizável: INSERT com e sem exercício.
      db.prepare("INSERT INTO subjects (id, name, slug) VALUES ('s-fresh', 'Frações', 'fracoes')").run();
      const ins = db
        .prepare(
          `INSERT INTO lessons (id, subject_id, title, body, exercise_json)
           VALUES ('les-fresh', 's-fresh', 'A', 'b', ?)`,
        )
        .run(JSON.stringify({ kind: 'math', family: 'fractions', seed: 1, prompt: 'p', expectedNormalized: '1/2' }));
      assert.equal(ins.changes, 1);
      const ex = db
        .prepare('SELECT exercise_json FROM lessons WHERE id = ?')
        .get('les-fresh') as { exercise_json: string };
      assert.ok(ex.exercise_json.includes('"family":"fractions"'));
    } finally {
      conn.close();
    }
  });
});

/**
 * Caminho de CRASH (B) do v3: exercise_json JÁ adicionada com user_version=2
 * (boot anterior crashou entre o ALTER e o stamp v3). Exercitado nos DOIS
 * backends.
 */
describe('Caminho B — exercise_json JÁ adicionada com user_version=2 (crash entre ALTER e stamp v3)', () => {
  it('migra SEM "duplicate column name": user_version=3, coluna única, dados preservados — node:sqlite', async () => {
    const file = dbPath('crash-node');
    createV2ColumnAddedFixture(file);
    const conn = await openSqlite(file);
    try {
      assert.equal(conn.migrate.getUserVersion(), 2);
      assert.doesNotThrow(() => conn.migrate.migrate(), 're-rodar o passo v3 não pode lançar');
      assertMigratedState(conn);
      const cols = conn.db.prepare('PRAGMA table_info(lessons)').all() as Array<{ name: string }>;
      assert.equal(cols.filter((c) => c.name === 'exercise_json').length, 1, 'exercise_json deve existir uma única vez');
    } finally {
      conn.close();
    }
  });

  it('migra SEM "duplicate column name" — sql.js (WASM, Electron)', async () => {
    const file = dbPath('crash-sqljs');
    createV2ColumnAddedFixture(file);
    const conn = await openSqliteSqlJs(file);
    try {
      assert.equal(conn.migrate.getUserVersion(), 2);
      assert.doesNotThrow(() => conn.migrate.migrate());
      assertMigratedState(conn);
      const cols = conn.db.prepare('PRAGMA table_info(lessons)').all() as Array<{ name: string }>;
      assert.equal(cols.filter((c) => c.name === 'exercise_json').length, 1);
    } finally {
      conn.close();
    }
  });
});

describe('re-migrate de banco v3 — no-op', () => {
  it('migrar um banco já em v3 não lança, não muda a versão nem os dados — node:sqlite', async () => {
    const conn = await openSqlite(dbPath('nomig-node'));
    try {
      conn.migrate.migrate(); // nasce direto em v3
      assert.equal(conn.migrate.getUserVersion(), SCHEMA_VERSION);
      conn.db.prepare("INSERT INTO subjects (id, name, slug) VALUES ('s-r', 'Re', 're')").run();
      const before = conn.migrate.getUserVersion();
      assert.doesNotThrow(() => conn.migrate.migrate());
      assert.equal(conn.migrate.getUserVersion(), before, 'user_version não pode mudar no no-op');
      const n = conn.db.prepare('SELECT COUNT(*) AS n FROM subjects').get() as { n: number };
      assert.equal(n.n, 1, 'dados intactos após re-migrate');
    } finally {
      conn.close();
    }
  });

  it('migrar um banco já em v3 não lança, não muda a versão nem os dados — sql.js (WASM)', async () => {
    const conn = await openSqliteSqlJs(dbPath('nomig-sqljs'));
    try {
      conn.migrate.migrate();
      assert.equal(conn.migrate.getUserVersion(), SCHEMA_VERSION);
      conn.db.prepare("INSERT INTO subjects (id, name, slug) VALUES ('s-r2', 'Re2', 're2')").run();
      const before = conn.migrate.getUserVersion();
      assert.doesNotThrow(() => conn.migrate.migrate());
      assert.equal(conn.migrate.getUserVersion(), before);
      const n = conn.db.prepare('SELECT COUNT(*) AS n FROM subjects').get() as { n: number };
      assert.equal(n.n, 1);
    } finally {
      conn.close();
    }
  });
});
