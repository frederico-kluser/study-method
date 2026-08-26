/**
 * electron/main/db/connection.ts — abertura de conexão SQLite DI-friendly.
 *
 * `openSqlite(path)` devolve um wrapper com `db` (conexão better-sqlite3),
 * `close()` e `migrate()`. Usado pela fiação (main-setup) para abrir o banco do
 * usuário e em testes para abrir bancos em arquivos tmp.
 *
 * NUNCA importa 'electron' aqui. O caminho é sempre passado por parâmetro — os
 * testes passam um arquivo dentro de mkdtemp. A operação de abertura cria o
 * diretório pai quando ausente e ativa `PRAGMA foreign_keys = ON` para que as
 * FKs declaradas no schema sejam, de fato, enforced em runtime.
 */

import { promises as fsp } from 'node:fs';
import { dirname } from 'node:path';
import Database, { type Database as SqliteDatabase } from 'better-sqlite3';
import { createMigrator, type Migrator } from './migrate';

export interface SqliteConnection {
  db: SqliteDatabase;
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
 *
 * Módulo 'better-sqlite3' é CJS com bind nativo; o default export é a função de
 * construção. O acelerador de locking do WAL não é usado aqui (arquivo simples).
 */
export async function openSqlite(dbPath: string): Promise<SqliteConnection> {
  await fsp.mkdir(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
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
