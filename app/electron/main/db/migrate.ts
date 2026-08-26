/**
 * electron/main/db/migrate.ts — migrator IDEMPOTENTE do banco SQLite.
 *
 * Aplica o schema (`schema.ts`) num arquivo SQLite usando `CREATE TABLE IF NOT
 * EXISTS` / `CREATE INDEX IF NOT EXISTS`, de modo que rodar 2x nunca falha nem
 * duplica. Expõe a versão de migração via user_version do SQLite e cria o
 * diretório do banco quando ele não existe.
 *
 * DI-friendly: `createMigrator(db)` recebe a conexão já aberta (wrapper injetado
 * por `connection.ts`) e retorna `{ migrate, getUserVersion, SCHEMA_VERSION }`.
 * Nunca importa 'electron' aqui.
 */

import { SCHEMA_SQL, SCHEMA_VERSION } from './schema';

/**
 * Interface mínima da conexão — estruturalmente compatível com o `DatabaseSync`
 * do `node:sqlite` (evita importar o tipo concreto aqui). O `get` do
 * `StatementSync` devolve `Record<string, SQLOutputValue> | undefined` nos tipos;
 * aqui a interface o alarga para `unknown`, e quem lê faz o cast para um Record
 * (ver `getUserVersion`).
 */
export interface DbConnectionLike {
  exec(sql: string): void;
  /** prepara uma consulta e devolve a primeira linha como `unknown` (cast no chamador) */
  prepare(sql: string): {
    get(...params: unknown[]): unknown;
  };
}

export interface Migrator {
  /** aplica o schema (idempotente) e grava a versão no user_version */
  migrate(): void;
  /** versão de schema atual registrada em user_version (0 se nunca migrado) */
  getUserVersion(): number;
}

/**
 * Cria o migrator para uma conexão já aberta.
 * Nota: a definição do DEFAULT guard não exige transação externa — cada
 * CREATE ... IF NOT EXISTS é atômico por statement. A gravação de user_version
 * também. Chamar migrate() repetidamente é seguro.
 */
export function createMigrator(db: DbConnectionLike): Migrator {
  return {
    migrate(): void {
      db.exec(SCHEMA_SQL);
      db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    },
    getUserVersion(): number {
      // `db.prepare(...).get()` devolve `unknown` nesta interface → cast para Record.
      const row = db.prepare('PRAGMA user_version').get() as
        | { user_version?: unknown }
        | undefined;
      const raw = row ? Number(row['user_version']) : 0;
      return Number.isFinite(raw) ? raw : 0;
    },
  };
}

/** Conveniência do wrapper de conexão (exporta a versão também por referência). */
export { SCHEMA_VERSION };
