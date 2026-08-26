/**
 * electron/main/db/connection.ts — abertura de conexão SQLite DI-friendly.
 *
 * `openSqlite(path)` devolve um wrapper com `db` (conexão `node:sqlite`),
 * `close()` e `migrate()`. Usado pela fiação (main-setup) para abrir o banco do
 * usuário e em testes para abrir bancos em arquivos tmp.
 *
 * NUNCA importa 'electron' aqui. O caminho é sempre passado por parâmetro — os
 * testes passam um arquivo dentro de mkdtemp. A operação de abertura cria o
 * diretório pai quando ausente e ativa `PRAGMA foreign_keys = ON` para que as
 * FKs declaradas no schema sejam, de fato, enforced em runtime.
 *
 * POR QUE `node:sqlite` (DatabaseSync) em vez de um addon nativo:
 * - `node:sqlite` é EMBUTIDO no Node (>= 22.5, unflagged desde 22.13) E no
 *   Electron (aqui Electron 37, que embute Node 22.16). NÃO é addon nativo:
 *   não há `.node` compilado, não há ABI a casar entre o Node do sistema e o
 *   Node embutido do Electron, e não há pós-install de compilação.
 * - O addon anterior (`better-sqlite3`) é sensível ao ABI do runtime: o prebuild
 *   do Node do sistema segfaultava em silêncio (SIGSEGV) ao ser carregado dentro
 *   do Electron 33 (Node 20 embutido) — segfault não é exceção JS, nenhum
 *   try/catch salva. Com `node:sqlite` o mesmo banco abre nos DOIS runtimes sem
 *   nada disso.
 * - A API usada aqui (`exec`, `prepare().get/run/all`, `close`) mapeia 1:1 para
 *   `DatabaseSync`; `db.pragma(...)` vira `db.exec('PRAGMA ...')`.
 */

import { promises as fsp } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createMigrator, type Migrator } from './migrate';

export interface SqliteConnection {
  db: DatabaseSync;
  /** fecha a conexão subjacente (idempotente quanto a abrir/fechar repetidamente) */
  close(): void;
  /** migrator do schema (aplica + lê user_version) */
  migrate: Migrator;
}

/**
 * Abre um banco SQLite num caminho de arquivo.
 * - Cria o diretório pai quando não existe.
 * - Liga o enforcement de foreign keys.
 * - Não aplica o schema; use `.migrate()` (ou `openMigratedSqlite`) para isso.
 */
export async function openSqlite(dbPath: string): Promise<SqliteConnection> {
  await fsp.mkdir(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON');
  const migrator = createMigrator(db);
  let closed = false;
  return {
    db,
    migrate: migrator,
    close(): void {
      if (closed) return;
      closed = true;
      db.close();
    },
  };
}

/** Abre + aplica o schema numa etapa (conveniência para testes e bootstrap). */
export async function openMigratedSqlite(dbPath: string): Promise<SqliteConnection> {
  const conn = await openSqlite(dbPath);
  conn.migrate.migrate();
  return conn;
}
