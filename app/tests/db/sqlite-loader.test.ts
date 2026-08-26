/**
 * tests/db/sqlite-loader.test.ts — loader lazy do addon sqlite (connection.ts).
 *
 * Cobre a função pura `pickSqlitePackageName` e o caminho Node do
 * `openMigratedSqlite` (loader default), confirmando que o caminho canônico segue
 * íntegro. Roda sob o Node do sistema (node:test + assert, convenção do repo).
 *
 * IMPORTANTE: NÃO faz require de 'better-sqlite3-electron' — em Node o build do
 * alias pode já ter sido recompilado para o ABI do Electron pelo
 * tools/ensure-native-abi.sh, com ABI incompatível com o Node. Só a função pura e
 * o caminho canônico (`better-sqlite3`) são exercitados aqui; o caminho do
 * Electron é validado pelo probe em separado (fora dos testes).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  pickSqlitePackageName,
  openMigratedSqlite,
} from '../../electron/main/db/connection';

describe('pickSqlitePackageName', () => {
  it('escolhe o better-sqlite3 canônico fora do Electron', () => {
    assert.equal(pickSqlitePackageName(false), 'better-sqlite3');
  });

  it('escolhe o alias better-sqlite3-electron no runtime do Electron', () => {
    assert.equal(pickSqlitePackageName(true), 'better-sqlite3-electron');
  });
});

describe('openMigratedSqlite (caminho Node)', () => {
  it('abre em tmp, aplica o schema e faz CRUD básico com o loader default', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sqlite-loader-'));
    const dbPath = join(dir, 'probe.db');
    try {
      const conn = await openMigratedSqlite(dbPath);
      const { db } = conn;

      // schema aplicado (user_version gravado pelo migrator)
      assert.ok(conn.migrate.getUserVersion() >= 1, 'user_version deve estar >= 1');

      // CRUD básico sobre a tabela `subjects` do schema (INSERT + SELECT)
      db.prepare('INSERT INTO subjects (id, name, slug) VALUES (?, ?, ?)').run(
        's1',
        'Algoritmos',
        'algoritmos',
      );
      const row = db.prepare('SELECT slug, name FROM subjects WHERE id = ?').get('s1') as {
        slug: string;
        name: string;
      };
      assert.equal(row.slug, 'algoritmos');
      assert.equal(row.name, 'Algoritmos');

      conn.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
