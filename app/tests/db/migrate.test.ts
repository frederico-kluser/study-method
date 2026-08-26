/**
 * tests/db/migrate.test.ts — unidade do migrator (electron/main/db/migrate.ts)
 * com DatabaseSync PURO do `node:sqlite`, SEM o wrapper connection.ts.
 *
 * O schema.test.ts já cobre o caminho integrado via openSqlite/openMigratedSqlite
 * (aplicar 2x, user_version 0→SCHEMA_VERSION, tabelas). Aqui o foco é o contrato
 * de `createMigrator(db)` recebendo o `DatabaseSync` diretamente — exatamente
 * como a fiação real monta (connection.ts chama `createMigrator(db)`):
 *   - getUserVersion() = 0 em banco novo (nunca migrado);
 *   - migrate() aplica o schema e grava user_version;
 *   - migrate() 2x é idempotente e a versão fica estável (não reseta);
 *   - o schema está de fato aplicado (tabelas + índices);
 *   - dados existentes sobrevivem a um segundo migrate();
 *   - user_version persiste no ARQUIVO entre close/reopen (DatabaseSync puro).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';

import { createMigrator, SCHEMA_VERSION as MIGRATE_SCHEMA_VERSION } from '../../electron/main/db/migrate';
import { SCHEMA_VERSION, TABLE_NAMES } from '../../electron/main/db/schema';
import { mkTempDir, rmrf } from '../_helpers/fs';

describe('createMigrator — banco novo (DatabaseSync puro)', () => {
  it('getUserVersion() devolve 0 num banco que nunca foi migrado', () => {
    const db = new DatabaseSync(':memory:');
    const migrator = createMigrator(db);
    assert.equal(migrator.getUserVersion(), 0);
    db.close();
  });

  it('migrate() aplica o schema e grava user_version = SCHEMA_VERSION', () => {
    const db = new DatabaseSync(':memory:');
    const migrator = createMigrator(db);
    migrator.migrate();
    assert.equal(migrator.getUserVersion(), SCHEMA_VERSION);
    db.close();
  });

  it('migrate() 2x é idempotente: não falha e a versão fica ESTÁVEL', () => {
    const db = new DatabaseSync(':memory:');
    const migrator = createMigrator(db);
    migrator.migrate();
    const v1 = migrator.getUserVersion();
    // 2ª rodada sobre banco já migrado: CREATE ... IF NOT EXISTS → no-op seguro.
    assert.doesNotThrow(() => migrator.migrate());
    assert.equal(migrator.getUserVersion(), v1, 'user_version não pode mudar após re-migrate');
    db.close();
  });

  it('todas as tabelas do schema existem após migrate', () => {
    const db = new DatabaseSync(':memory:');
    createMigrator(db).migrate();
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
      name: string;
    }[];
    const names = new Set(rows.map((r) => r.name));
    for (const t of TABLE_NAMES) {
      assert.ok(names.has(t), `tabela esperada e ausente após migrate: ${t}`);
    }
    db.close();
  });

  it('índices do schema existem após migrate', () => {
    const db = new DatabaseSync(':memory:');
    createMigrator(db).migrate();
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as {
      name: string;
    }[];
    const names = new Set(rows.map((r) => r.name));
    for (const idx of ['idx_lessons_subject_id', 'idx_challenges_lesson_id', 'idx_challenge_hints_pos']) {
      assert.ok(names.has(idx), `índice esperado e ausente: ${idx}`);
    }
    db.close();
  });

  it('dados inseridos após migrate sobrevivem a um segundo migrate() (idempotência não apaga nada)', () => {
    const db = new DatabaseSync(':memory:');
    const migrator = createMigrator(db);
    migrator.migrate();
    db.prepare('INSERT INTO subjects (id, name, slug) VALUES (?, ?, ?)').run('s1', 'Teste', 'teste');
    migrator.migrate(); // re-rodar o schema não pode destruir dados
    const n = db.prepare('SELECT COUNT(*) AS n FROM subjects').get() as { n: number };
    assert.equal(n.n, 1);
    db.close();
  });
});

describe('createMigrator — user_version persistida em ARQUIVO', () => {
  it('migrar num arquivo real, fechar e REABRIR com DatabaseSync puro mantém a versão', async () => {
    const dir = await mkTempDir('migrate-file-');
    try {
      const file = join(dir, 'mig.db');
      const db1 = new DatabaseSync(file);
      const m1 = createMigrator(db1);
      assert.equal(m1.getUserVersion(), 0, 'arquivo recém-criado começa em 0');
      m1.migrate();
      db1.close();

      const db2 = new DatabaseSync(file); // reabre o MESMO arquivo
      const m2 = createMigrator(db2);
      assert.equal(m2.getUserVersion(), SCHEMA_VERSION, 'versão precisa sobreviver ao reopen');
      db2.close();
    } finally {
      await rmrf(dir);
    }
  });
});

describe('createMigrator — consistência do re-export', () => {
  it('SCHEMA_VERSION exportado por migrate.ts é o mesmo de schema.ts', () => {
    assert.equal(MIGRATE_SCHEMA_VERSION, SCHEMA_VERSION);
  });
});
