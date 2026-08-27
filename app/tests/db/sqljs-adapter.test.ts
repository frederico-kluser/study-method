/**
 * tests/db/sqljs-adapter.test.ts — o backend sql.js (WASM), o caminho que o
 * processo main do Electron usa em runtime.
 *
 * O `node:sqlite` NÃO é compilado no Node embutido do Electron (medido no
 * 37.2.4: `require('node:sqlite')` lança ERR_UNKNOWN_BUILTIN_MODULE e o app
 * caía no boot). O app abre o banco com `openSqliteSqlJs` (connection.ts), que
 * usa o adaptador `sqljsAdapter.ts`. Este arquivo exercita EXATAMENTE esse
 * caminho: migração, FKs, CRUD via repo, persistência em arquivo (flush a cada
 * escrita) e round-trip close/reopen — inclusive lendo o arquivo gravado com o
 * `node:sqlite` do Node para provar que o formato é um SQLite padrão.
 *
 * (Aqui no Node do sistema o `node:sqlite` existe, então `openSqlite` escolhe
 * ele — a cobertura do caminho Electron é feita chamando `openSqliteSqlJs`
 * diretamente.)
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';

import { openSqliteSqlJs } from '../../electron/main/db/connection';
import { SCHEMA_VERSION, TABLE_NAMES } from '../../electron/main/db/schema';
import { createLessonRepo } from '../../electron/main/db/repo';
import { mkTempDir, rmrf, fileExists } from '../_helpers/fs';

let dir = '';

before(async () => {
  dir = await mkTempDir('sqljs-adapter-');
});

after(async () => {
  if (dir) await rmrf(dir);
});

/** Caminho de banco único por teste (evita interferência entre casos). */
function dbPath(name: string): string {
  return join(dir, `${name}.db`);
}

describe('openSqliteSqlJs — migração e superfície do wrapper', () => {
  it('migra um banco novo: schema completo + user_version', async () => {
    const conn = await openSqliteSqlJs(dbPath('migra'));
    try {
      conn.migrate.migrate();
      assert.equal(conn.migrate.getUserVersion(), SCHEMA_VERSION);
      const names = (conn.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>).map((r) => r.name);
      for (const t of TABLE_NAMES) assert.ok(names.includes(t), `tabela ${t} deveria existir`);
    } finally {
      conn.close();
    }
  });

  it('getUserVersion devolve 0 antes de migrar', async () => {
    const conn = await openSqliteSqlJs(dbPath('sem-migra'));
    try {
      assert.equal(conn.migrate.getUserVersion(), 0);
    } finally {
      conn.close();
    }
  });

  it('close() é idempotente (2x não explode)', async () => {
    const conn = await openSqliteSqlJs(dbPath('close-2x'));
    conn.migrate.migrate();
    conn.close();
    conn.close();
  });

  it('banco vazio (0 bytes) abre como banco novo', async () => {
    const p = dbPath('vazio');
    await (await import('node:fs/promises')).writeFile(p, '');
    const conn = await openSqliteSqlJs(p);
    try {
      conn.migrate.migrate();
      assert.equal(conn.migrate.getUserVersion(), SCHEMA_VERSION);
    } finally {
      conn.close();
    }
  });
});

describe('openSqliteSqlJs — FK enforcement (PRAGMA aplicado na abertura)', () => {
  it('lesson com subject_id inexistente → erro FOREIGN KEY', async () => {
    const conn = await openSqliteSqlJs(dbPath('fk'));
    try {
      conn.migrate.migrate();
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
});

describe('openSqliteSqlJs — repo CRUD por cima do wrapper (como o app usa)', () => {
  it('upsertSubject → createLesson → listLessonsBySubject', async () => {
    const conn = await openSqliteSqlJs(dbPath('repo'));
    try {
      conn.migrate.migrate();
      const repo = createLessonRepo(() => conn.db);

      await repo.upsertSubject('algoritmos');
      const lessonId = await repo.createLesson({
        subjectSlug: 'algoritmos',
        title: 'Busca binária',
        body: 'Dividir para conquistar.',
        parentLessonId: null,
      });

      const lessons = await repo.listLessonsBySubject('algoritmos');
      assert.equal(lessons.length, 1);
      assert.equal(lessons[0].id, lessonId);
      assert.equal(lessons[0].title, 'Busca binária');
    } finally {
      conn.close();
    }
  });

  it('changes e lastInsertRowid via wrapper (INSERT e UPDATE)', async () => {
    const conn = await openSqliteSqlJs(dbPath('changes'));
    try {
      conn.migrate.migrate();
      const ins = conn.db
        .prepare("INSERT INTO subjects (id, name, slug) VALUES ('s-1', 'Álgebra', 'algebra')")
        .run();
      assert.equal(ins.changes, 1);
      assert.equal(ins.lastInsertRowid, 1, 'primeiro rowid');
      const ins2 = conn.db
        .prepare("INSERT INTO subjects (id, name, slug) VALUES ('s-2', 'Cálculo', 'calculo')")
        .run();
      assert.equal(ins2.lastInsertRowid, 2, 'rowid incrementa');
      const upd = conn.db.prepare("UPDATE subjects SET name = 'Algebra' WHERE id = 's-1'").run();
      assert.equal(upd.changes, 1);
    } finally {
      conn.close();
    }
  });
});

describe('openSqliteSqlJs — persistência em arquivo (flush a cada escrita)', () => {
  it('dado escrito já está no arquivo ANTES do close (flush-on-write)', async () => {
    const p = dbPath('flush-write');
    const conn = await openSqliteSqlJs(p);
    conn.migrate.migrate();
    conn.db.prepare("INSERT INTO subjects (id, name, slug) VALUES ('s-1', 'X', 'x')").run();
    // SEM close: o arquivo já deve conter a linha (lido com node:sqlite do Node,
    // provando também que o formato gravado é um SQLite padrão).
    const probe = new DatabaseSync(p);
    try {
      const row = probe.prepare("SELECT name FROM subjects WHERE slug = 'x'").get() as
        | { name: string }
        | undefined;
      assert.equal(row?.name, 'X', 'flush-on-write deveria persistir sem fechar');
    } finally {
      probe.close();
      conn.close();
    }
  });

  it('round-trip: fecha, reabre e o dado continua (close persiste)', async () => {
    const p = dbPath('roundtrip');
    const conn1 = await openSqliteSqlJs(p);
    conn1.migrate.migrate();
    conn1.db
      .prepare("INSERT INTO subjects (id, name, slug) VALUES ('s-rt', 'Persistido', 'persistido')")
      .run();
    conn1.close();

    const conn2 = await openSqliteSqlJs(p);
    try {
      assert.equal(conn2.migrate.getUserVersion(), SCHEMA_VERSION, 'user_version sobrevive');
      const row = conn2.db
        .prepare("SELECT name FROM subjects WHERE slug = 'persistido'")
        .get() as { name: string } | undefined;
      assert.equal(row?.name, 'Persistido');
    } finally {
      conn2.close();
    }
  });

  it('arquivo do banco existe após a primeira escrita', async () => {
    const p = dbPath('existe');
    const conn = await openSqliteSqlJs(p);
    try {
      conn.migrate.migrate();
      conn.db.prepare("INSERT INTO subjects (id, name, slug) VALUES ('s-1', 'Y', 'y')").run();
      assert.ok(await fileExists(p));
    } finally {
      conn.close();
    }
  });
});
