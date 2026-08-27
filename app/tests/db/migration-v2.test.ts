/**
 * tests/db/migration-v2.test.ts — migração VERSIONADA v1 → v2 (onda1-db-schema-v2).
 *
 * Cobre os dois caminhos de criação definidos em migrate.ts:
 *   - banco v1 EXISTENTE (user_version=1, como o study.db do usuário) → migra
 *     para v2 SEM perder dados: subjects ganha `domain` (ALTER ADD COLUMN com
 *     DEFAULT 'programming' — as linhas antigas herdam o default) e nasce a
 *     tabela challenge_attempts;
 *   - banco NOVO (user_version=0) → nasce direto em SCHEMA_VERSION=2, com o
 *     CHECK de domain no schema e os CHECKs de verdict/stars da nova tabela.
 *
 * A fixture v1 é criada num ARQUIVO REAL (DatabaseSync do node:sqlite) e a
 * migração é exercitada pelos DOIS backends: openSqlite (node:sqlite — Node do
 * sistema) e openSqliteSqlJs (sql.js WASM — o caminho do Electron main em
 * runtime). O formato do arquivo é o mesmo SQLite, então a mesma fixture serve
 * aos dois.
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

/** Schema v1 EXATO (como existia antes da onda v2): subjects SEM domain,
 * SEM challenge_attempts. Usado para montar a fixture de um banco de usuário
 * antigo. */
const V1_DDL = `
CREATE TABLE IF NOT EXISTS subjects (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
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
`;

/** Insere os dados de usuário da fixture v1 (subject + lesson + answer +
 * challenge + progress). */
function insertV1Data(db: DatabaseSync): void {
  db.prepare(
    `INSERT INTO subjects (id, name, slug, created_at) VALUES (?, ?, ?, ?)`,
  ).run('sub-v1', 'Programação', 'programacao', '2026-01-01T10:00:00.000Z');
  db.prepare(
    `INSERT INTO lessons (id, subject_id, title, body, difficulty, created_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run('les-v1', 'sub-v1', 'Aula antiga', 'Corpo da aula antiga.', 1, '2026-01-01T10:01:00.000Z', null);
  db.prepare(
    `INSERT INTO lesson_answers (id, lesson_id, answer_text, created_at) VALUES (?, ?, ?, ?)`,
  ).run('ans-v1', 'les-v1', 'resposta do usuário', '2026-01-01T10:02:00.000Z');
  db.prepare(
    `INSERT INTO challenges
       (id, lesson_id, challenge_slug, title, language, concept, difficulty,
        statement, test_cases_json, solution_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    'chal-v1', 'les-v1', 'soma-pares', 'Soma de pares', 'python', 'loops', 2,
    'Some os pares.', '[]', '{}', '2026-01-01T10:03:00.000Z',
  );
  db.prepare(
    `INSERT INTO progress (subject_id, lesson_id, answered, hint_consumed, became_lesson_children)
     VALUES (?, ?, ?, ?, ?)`,
  ).run('sub-v1', 'les-v1', 3, 1, 0);
}

/**
 * Cria num arquivo REAL um banco no estado v1 (user_version=1) com dados de
 * usuário: subject + lesson + answer + challenge + progress.
 */
function createV1Fixture(file: string): void {
  const db = new DatabaseSync(file);
  db.exec(V1_DDL);
  db.exec('PRAGMA user_version = 1');
  insertV1Data(db);
  db.close();
}

/**
 * Caminho A: banco com as tabelas v1 MAS SEM a gravação de user_version. O v1
 * antigo gravava o schema e `PRAGMA user_version = 1` em execs SEPARADOS — um
 * crash entre eles deixa exatamente este estado (tabelas v1 + user_version=0).
 */
function createV1UnstampedFixture(file: string): void {
  const db = new DatabaseSync(file);
  db.exec(V1_DDL);
  insertV1Data(db);
  db.close();
}

/**
 * Caminho B: banco v1 onde o ALTER do `domain` JÁ rodou — um boot anterior
 * crashou ENTRE o ALTER e a gravação de `PRAGMA user_version = 2`. Re-migrar
 * sem o guard de coluna lançaria "duplicate column name: domain".
 */
function createV1DomainAddedFixture(file: string): void {
  const db = new DatabaseSync(file);
  db.exec(V1_DDL);
  db.exec(`ALTER TABLE subjects ADD COLUMN domain TEXT NOT NULL DEFAULT 'programming';`);
  db.exec('PRAGMA user_version = 1');
  insertV1Data(db);
  db.close();
}

/** Conta linhas de uma tabela (helper de verificação de preservação). */
function countRows(db: SqliteConnection['db'], table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
  return Number(row.n);
}

let dir = '';

before(async () => {
  dir = await mkTempDir('migration-v2-');
});

after(async () => {
  if (dir) await rmrf(dir);
});

function dbPath(name: string): string {
  return join(dir, `${name}.db`);
}

/** Verificações comuns do estado pós-migração (usadas pelos dois backends).
 * Assume a fixture v1 (sub-v1/les-v1/chal-v1) já presente. */
function assertMigratedState(conn: SqliteConnection): void {
  const db = conn.db;
  // versão
  assert.equal(conn.migrate.getUserVersion(), SCHEMA_VERSION);

  // dados v1 preservados
  assert.equal(countRows(db, 'subjects'), 1);
  assert.equal(countRows(db, 'lessons'), 1);
  assert.equal(countRows(db, 'lesson_answers'), 1);
  assert.equal(countRows(db, 'challenges'), 1);
  assert.equal(countRows(db, 'progress'), 1);
  const sub = db
    .prepare('SELECT id, name, slug FROM subjects WHERE id = ?')
    .get('sub-v1') as { id: string; name: string; slug: string };
  assert.equal(sub.name, 'Programação');
  assert.equal(sub.slug, 'programacao');
  assert.equal(
    (db.prepare('SELECT answer_text FROM lesson_answers WHERE id = ?').get('ans-v1') as { answer_text: string })
      .answer_text,
    'resposta do usuário',
  );
  assert.equal(
    (db.prepare('SELECT challenge_slug FROM challenges WHERE id = ?').get('chal-v1') as { challenge_slug: string })
      .challenge_slug,
    'soma-pares',
  );

  // coluna nova com DEFAULT aplicado às linhas antigas
  const cols = db.prepare('PRAGMA table_info(subjects)').all() as Array<{ name: string }>;
  const colNames = cols.map((c) => c.name);
  assert.ok(colNames.includes('domain'), 'subjects deveria ter a coluna domain após migrar');
  assert.equal(
    (db.prepare('SELECT domain FROM subjects WHERE id = ?').get('sub-v1') as { domain: string }).domain,
    'programming',
    'linhas antigas devem herdar o DEFAULT do domain',
  );

  // tabela nova criada e utilizável
  for (const t of TABLE_NAMES) {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
      .get(t) as { name: string } | undefined;
    assert.ok(row, `tabela ${t} deveria existir após migrar`);
  }
  const attempt = db
    .prepare(
      `INSERT INTO challenge_attempts
         (id, subject_id, lesson_id, challenge_id, verdict, stars, duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run('att-v1', 'sub-v1', 'les-v1', 'chal-v1', 'passed', 2, 1500, '2026-02-01T00:00:00.000Z');
  assert.equal(attempt.changes, 1);
}

describe('migração v1 → v2 (backend node:sqlite — openSqlite)', () => {
  it('banco v1 com dados → migra sem perder nada e ganha domain + challenge_attempts', async () => {
    const file = dbPath('v1-node');
    createV1Fixture(file);

    const conn = await openSqlite(file);
    try {
      assert.equal(conn.migrate.getUserVersion(), 1, 'fixture deveria nascer em v1');
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

describe('migração v1 → v2 (backend sql.js WASM — openSqliteSqlJs, caminho do Electron)', () => {
  it('a MESMA fixture v1 migrada pelo backend do Electron preserva dados e vira v2', async () => {
    const file = dbPath('v1-sqljs');
    createV1Fixture(file); // fixture criada por node:sqlite em formato SQLite padrão

    const conn = await openSqliteSqlJs(file);
    try {
      assert.equal(conn.migrate.getUserVersion(), 1);
      conn.migrate.migrate();
      assertMigratedState(conn);
      assert.doesNotThrow(() => conn.migrate.migrate()); // idempotente
    } finally {
      conn.close();
    }
  });
});

describe('banco NOVO — nasce direto em v2 (SCHEMA_SQL completo)', () => {
  it('openMigratedSqlite num arquivo novo já entrega SCHEMA_VERSION sem passar por v1', async () => {
    const conn = await openMigratedSqlite(dbPath('novo'));
    try {
      assert.equal(conn.migrate.getUserVersion(), SCHEMA_VERSION);
      // ONDA4: a versão atual é 3 (migration-v3.test.ts cobre o passo v2→v3;
      // este teste cobre a cadeia v1→v2 e o banco novo nasce na versão ATUAL).
      assert.equal(SCHEMA_VERSION, 3, 'o SCHEMA_VERSION desta onda é 3');
      const db = conn.db;
      // todas as tabelas (v1 + challenge_attempts) existem de cara
      for (const t of TABLE_NAMES) {
        const row = db
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
          .get(t) as { name: string } | undefined;
        assert.ok(row, `tabela ${t} deveria existir em banco novo`);
      }
      // domain existe com DEFAULT 'programming' em CREATE TABLE
      const cols = db.prepare('PRAGMA table_info(subjects)').all() as Array<{ name: string }>;
      assert.ok(cols.map((c) => c.name).includes('domain'));
      const ins = db
        .prepare("INSERT INTO subjects (id, name, slug) VALUES ('s-fresh', 'Cálculo', 'calculo')")
        .run();
      assert.equal(ins.changes, 1);
      assert.equal(
        (db.prepare('SELECT domain FROM subjects WHERE id = ?').get('s-fresh') as { domain: string }).domain,
        'programming',
      );
      // challenge_attempts utilizável de cara
      const att = db
        .prepare(
          `INSERT INTO challenge_attempts
             (id, subject_id, lesson_id, challenge_id, verdict, stars, duration_ms, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('att-fresh', 's-fresh', 'les-x', 'chal-x', 'timeout', 1, 900, '2026-02-01T00:00:00.000Z');
      assert.equal(att.changes, 1);
    } finally {
      conn.close();
    }
  });

  it('CHECK do domain vale no caminho de criação nova (banco v2 de fábrica)', async () => {
    const conn = await openMigratedSqlite(dbPath('novo-check'));
    try {
      assert.throws(
        () =>
          conn.db
            .prepare(
              "INSERT INTO subjects (id, name, slug, domain) VALUES ('s-bad', 'X', 'x', 'physics')",
            )
            .run(),
        /CHECK/i,
        'domain fora do enum deve ser rejeitado pelo CHECK (criação nova)',
      );
      // valor válido passa
      const ok = conn.db
        .prepare(
          "INSERT INTO subjects (id, name, slug, domain) VALUES ('s-ok', 'Matemática', 'matematica', 'math')",
        )
        .run();
      assert.equal(ok.changes, 1);
    } finally {
      conn.close();
    }
  });

  it('CHECKs de verdict/stars de challenge_attempts valem no banco novo', async () => {
    const conn = await openMigratedSqlite(dbPath('novo-check2'));
    try {
      conn.db
        .prepare(
          "INSERT INTO subjects (id, name, slug) VALUES ('s-ok', 'Algoritmos', 'algoritmos')",
        )
        .run();
      const base = `INSERT INTO challenge_attempts
         (id, subject_id, lesson_id, challenge_id, verdict, stars, duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
      const args = ['a-bad', 's-ok', 'les-x', 'chal-x', 'maybe', 0, 0, '2026-02-01T00:00:00.000Z'];
      assert.throws(() => conn.db.prepare(base).run(...args), /CHECK/i, 'verdict inválido');
      assert.throws(
        () => conn.db.prepare(base).run('a-bad2', 's-ok', 'les-x', 'chal-x', 'passed', 5, 0, '2026-02-01T00:00:00.000Z'),
        /CHECK/i,
        'stars fora de 0..3',
      );
    } finally {
      conn.close();
    }
  });
});

/**
 * Caminhos de CRASH (A e B) e re-migrate de v2 — os três estados anômalos que
 * o migrator crash-safe precisa absorver, exercitados nos DOIS backends
 * (node:sqlite e sql.js WASM, o caminho do Electron). Cada `it` usa um arquivo
 * próprio (sequência única) para nunca colidir entre os backends.
 */
type Opener = (file: string) => Promise<SqliteConnection>;

let crashSeq = 0;

/** Registra o MESMO cenário nos dois backends, cada um com arquivo próprio. */
function itBothBackends(label: string, run: (open: Opener, file: string) => Promise<void>): void {
  it(`${label} — node:sqlite`, () => run(openSqlite, dbPath(`crash-node-${crashSeq++}`)));
  it(`${label} — sql.js (WASM, Electron)`, () => run(openSqliteSqlJs, dbPath(`crash-sqljs-${crashSeq++}`)));
}

describe('Caminho A — tabelas v1 com user_version=0 (crash do v1 antigo entre schema e stamp)', () => {
  itBothBackends(
    'migra aplicando os passos pendentes: domain presente, dados preservados, user_version=2',
    async (open, file) => {
      createV1UnstampedFixture(file);
      const conn = await open(file);
      try {
        assert.equal(conn.migrate.getUserVersion(), 0, 'fixture Path A nasce com user_version=0');
        // O bug antigo NUNCA adicionaria domain (virava "no such column" no listSubjects).
        assert.doesNotThrow(() => conn.migrate.migrate(), 'migrar um v1 sem stamp não pode lançar');
        assertMigratedState(conn); // domain + challenge_attempts + dados v1 preservados + v2
      } finally {
        conn.close();
      }
    },
  );
});

describe('Caminho B — domain JÁ adicionado com user_version=1 (crash entre ALTER e stamp v2)', () => {
  itBothBackends(
    'migra SEM "duplicate column name": user_version=2, coluna única, dados preservados',
    async (open, file) => {
      createV1DomainAddedFixture(file);
      const conn = await open(file);
      try {
        assert.equal(conn.migrate.getUserVersion(), 1);
        // O bug antigo lançava "duplicate column name: domain" e o index.ts
        // engolia, desabilitando a persistência permanentemente.
        assert.doesNotThrow(() => conn.migrate.migrate(), 're-rodar o passo v2 não pode lançar');
        assertMigratedState(conn);
        const cols = conn.db.prepare('PRAGMA table_info(subjects)').all() as Array<{ name: string }>;
        const domains = cols.filter((c) => c.name === 'domain');
        assert.equal(domains.length, 1, 'domain deve existir uma única vez');
      } finally {
        conn.close();
      }
    },
  );
});

describe('re-migrate de banco v2 — no-op', () => {
  itBothBackends('migrar um banco já em v2 não lança, não muda a versão nem os dados', async (open, file) => {
    const conn = await open(file);
    try {
      conn.migrate.migrate(); // nasce direto em v2
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
});
