/**
 * tests/db/connection-edges.test.ts — lacunas do wrapper de conexão (connection.ts).
 *
 * Complementa (sem duplicar) o que já está coberto:
 *   - tests/db/schema.test.ts → migrator idempotente, tabelas, FKs e round trip
 *     sobre conexão MIGRADA.
 *
 * Aqui ficam os edges do wrapper em si: criação recursiva do diretório pai,
 * `close()` idempotente e o estado de uma conexão recém-aberta SEM migrate
 * (foreign_keys ON já na abertura — o `node:sqlite` abre um banco real).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openSqlite } from '../../electron/main/db/connection';

/** Cria um diretório tmp e devolve um caminho de banco dentro dele. */
async function makeDbPath(prefix: string): Promise<{ dir: string; db: string }> {
  const dir = await fsp.mkdtemp(join(tmpdir(), prefix));
  return { dir, db: join(dir, 'edge.db') };
}

describe('connection.ts — edges do wrapper', () => {
  it('openSqlite cria o diretório pai recursivamente (mkdir -p)', async () => {
    const root = await fsp.mkdtemp(join(tmpdir(), 'conn-edge-'));
    try {
      // caminho com 3 níveis ainda inexistentes
      const deep = join(root, 'a', 'b', 'c');
      const conn = await openSqlite(join(deep, 'nested.db'));
      const stat = await fsp.stat(deep);
      assert.ok(stat.isDirectory(), 'diretório pai aninhado não foi criado');
      conn.close();
    } finally {
      await fsp.rm(root, { recursive: true, force: true });
    }
  });

  it('close() é idempotente (chamar 2x não lança)', async () => {
    const { dir, db } = await makeDbPath('conn-close-');
    try {
      const conn = await openSqlite(db);
      conn.close();
      // a 2ª chamada é um no-op protegido pela flag `closed` do wrapper.
      assert.doesNotThrow(() => conn.close(), '2ª close() deveria ser no-op');
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  it('openSqlite (sem migrate) abre banco real com foreign_keys ON já na abertura', async () => {
    const { dir, db } = await makeDbPath('conn-fk-');
    try {
      const conn = await openSqlite(db);
      // node:sqlite abre o banco real e liga foreign_keys já na abertura.
      const row = conn.db.prepare('PRAGMA foreign_keys').get() as {
        foreign_keys: unknown;
      };
      assert.equal(Number(row['foreign_keys']), 1, 'foreign_keys deveria estar ON na abertura');
      conn.close();
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });
});
