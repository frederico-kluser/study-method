/**
 * electron/main/db/migrate.ts — migrator IDEMPOTENTE e VERSIONADO do banco SQLite.
 *
 * Estratégia por user_version (leitura do PRAGMA, gravada em cada migrate):
 *   - banco NOVO (user_version 0): aplica o `SCHEMA_SQL` completo (`schema.ts`),
 *     que já contém o schema na versão ATUAL — nasce direto em SCHEMA_VERSION;
 *   - banco ANTIGO (user_version 1..SCHEMA_VERSION-1): aplica apenas os passos
 *     pendentes de `MIGRATIONS` (schema.ts), na ordem, cada um idempotente
 *     (`CREATE TABLE/INDEX IF NOT EXISTS`; ALTER ADD COLUMN via `guardedAlter`,
 *     que só roda quando a coluna ainda não existe) — os dados do usuário
 *     sobrevivem (nada é recriado/descartado);
 *   - banco ATUAL (user_version >= SCHEMA_VERSION): no-op.
 * Rodar migrate() 2x nunca falha nem duplica.
 *
 * CRASH-SAFE (buracos de migração verificados por experimento):
 *   - Caminho A: o v1 antigo gravava o schema e `PRAGMA user_version = 1` em
 *     execs SEPARADOS; um crash entre eles deixa as tabelas v1 criadas com
 *     user_version=0. Aqui, user_version 0 COM a tabela `subjects` existente
 *     (sqlite_master) é tratado como v1 — os passos pendentes são aplicados em
 *     vez de pular para "já é v2" (senão `domain` nunca seria adicionada).
 *   - Caminho B: crash entre o ALTER do `domain` e a gravação de user_version=2
 *     deixa user_version=1 com a coluna JÁ existente. O passo v2 usa
 *     `guardedAlter`: o ALTER só roda se `PRAGMA table_info(subjects)` não
 *     listar `domain` (suportado por node:sqlite E sql.js) — sem o erro
 *     "duplicate column name: domain".
 *   - Os passos pendentes e a gravação de `PRAGMA user_version` rodam DENTRO de
 *     uma ÚNICA transação (BEGIN/COMMIT, ROLLBACK em erro): um crash no meio
 *     não deixa estado parcial. `PRAGMA user_version` é transacional em SQLite
 *     (cabeçalho journalado) nos dois backends.
 *
 * DI-friendly: `createMigrator(db)` recebe a conexão já aberta (wrapper injetado
 * por `connection.ts`) e retorna `{ migrate, getUserVersion, SCHEMA_VERSION }`.
 * Nunca importa 'electron' aqui.
 */

import { MIGRATIONS, SCHEMA_SQL, SCHEMA_VERSION } from './schema';

/**
 * Interface mínima da conexão — estruturalmente compatível com o `DatabaseSync`
 * do `node:sqlite` (evita importar o tipo concreto aqui). O `get`/`all` do
 * `StatementSync` devolve `Record<string, SQLOutputValue>` nos tipos; aqui a
 * interface os alarga para `unknown`/`Record<string, unknown>`, e quem lê faz
 * o cast (ver `getUserVersion`, `hasColumn`).
 */
export interface DbConnectionLike {
  exec(sql: string): void;
  /** prepara uma consulta e devolve linhas como `unknown` (cast no chamador) */
  prepare(sql: string): {
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): Array<Record<string, unknown>>;
  };
}

export interface Migrator {
  /** aplica o schema (idempotente) e grava a versão no user_version */
  migrate(): void;
  /** versão de schema atual registrada em user_version (0 se nunca migrado) */
  getUserVersion(): number;
}

/** true se a tabela existe no banco (via sqlite_master). */
function tableExists(db: DbConnectionLike, table: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .get(table) as { name?: unknown } | undefined;
  return Boolean(row);
}

/** true se a tabela já tem a coluna (via PRAGMA table_info — funciona em
 * node:sqlite e no wrapper sql.js do Electron). */
function hasColumn(db: DbConnectionLike, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: unknown }>;
  return rows.some((r) => r.name === column);
}

/**
 * Cria o migrator para uma conexão já aberta.
 * As pendências de migração + a gravação de user_version rodam numa ÚNICA
 * transação; qualquer erro faz ROLLBACK e o banco volta ao estado anterior
 * (próximo boot simplesmente re-tenta). Chamar migrate() repetidamente é
 * seguro (a versão atual sai pelo early-return antes de tocar em qualquer
 * tabela).
 */
export function createMigrator(db: DbConnectionLike): Migrator {
  const getUserVersion = (): number => {
    // `db.prepare(...).get()` devolve `unknown` nesta interface → cast para Record.
    const row = db.prepare('PRAGMA user_version').get() as
      | { user_version?: unknown }
      | undefined;
    const raw = row ? Number(row['user_version']) : 0;
    return Number.isFinite(raw) ? raw : 0;
  };

  return {
    migrate(): void {
      let current = getUserVersion();
      if (current >= SCHEMA_VERSION) return; // banco já na versão atual: no-op

      // Caminho A: user_version=0 mas as tabelas v1 JÁ existem (o v1 antigo
      // crashou entre o CREATE TABLE e o `PRAGMA user_version = 1`). Trata
      // como v1 e aplica os passos pendentes — senão `domain` ficaria ausente
      // para sempre com o banco rotulado de v2.
      if (current === 0 && tableExists(db, 'subjects')) {
        current = 1;
      }

      // Passos pendentes + gravação da versão, numa ÚNICA transação: crash no
      // meio desfaz tudo (ROLLBACK) em vez de deixar estado parcial.
      db.exec('BEGIN');
      try {
        if (current === 0) {
          // Banco novo de verdade: schema completo da versão ATUAL (nasce em v2).
          db.exec(SCHEMA_SQL);
        } else {
          // Banco antigo: aplica só os passos pendentes, na ordem (idempotentes).
          for (const step of MIGRATIONS) {
            if (current < step.version) {
              // Caminho B: se um boot anterior já adicionou a coluna (crash
              // entre o ALTER e o user_version), pula o ALTER — re-rodá-lo
              // lançaria "duplicate column name: domain".
              if (
                step.guardedAlter &&
                !hasColumn(db, step.guardedAlter.table, step.guardedAlter.column)
              ) {
                db.exec(step.guardedAlter.sql);
              }
              db.exec(step.sql);
            }
          }
        }
        db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
    getUserVersion,
  };
}

/** Conveniência do wrapper de conexão (exporta a versão também por referência). */
export { SCHEMA_VERSION };
