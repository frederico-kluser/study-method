/**
 * electron/main/db/connection.ts — abertura de conexão SQLite DI-friendly.
 *
 * `openSqlite(path)` devolve um wrapper com `db` (conexão aberta), `close()` e
 * `migrate()`. Usado pela fiação (main-setup) para abrir o banco do usuário e
 * em testes para abrir bancos em arquivos tmp.
 *
 * BACKEND SELECIONADO EM RUNTIME (este era o bug do crash do app):
 * - Node do sistema (testes, CLI): `node:sqlite` (DatabaseSync, >= 22.13).
 * - Electron main: o Node embutido NÃO compila `node:sqlite` — medido no
 *   Electron 37.2.4: `require('node:sqlite')` lança
 *   `ERR_UNKNOWN_BUILTIN_MODULE` e o app caía no boot (import de topo no
 *   bundle). Aqui usamos o adaptador sql.js (WASM) de `sqljsAdapter.ts`, que
 *   expõe a MESMA superfície.
 * Nenhum dos dois é addon nativo: sem `.node` compilado, sem ABI a casar, sem
 * pós-install de compilação (o addon anterior, better-sqlite3, segfaultava em
 * silêncio dentro do Electron — SIGSEGV não é exceção JS, try/catch não salva).
 *
 * NUNCA importa 'electron' aqui. O caminho é sempre passado por parâmetro. A
 * operação de abertura cria o diretório pai quando ausente e ativa
 * `PRAGMA foreign_keys = ON` para que as FKs declaradas no schema sejam, de
 * fato, enforced em runtime.
 */

import { promises as fsp } from 'node:fs';
import { dirname } from 'node:path';
import { createMigrator, type Migrator } from './migrate';
import { openSqlJsDatabase, type SqlJsDb } from './sqljsAdapter';

/** Superfície mínima de statement usada pela camada de dados (repo/migrate).
 * `changes`/`lastInsertRowid` podem vir como bigint no node:sqlite (leitura
 * default) e number no wrapper sql.js — quem consome compara ou casta. */
export interface SqliteStmtLike {
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Array<Record<string, unknown>>;
}

/** Superfície mínima de conexão — satisfeita pelo `DatabaseSync` do
 * `node:sqlite` E pelo wrapper sql.js. `repo.ts` e `migrate.ts` dependem só
 * disto (nunca importam os backends). */
export interface SqliteDbLike {
  exec(sql: string): void;
  prepare(sql: string): SqliteStmtLike;
  close(): void;
}

export interface SqliteConnection {
  db: SqliteDbLike;
  /** fecha a conexão subjacente (idempotente quanto a abrir/fechar repetidamente) */
  close(): void;
  /** migrator do schema (aplica + lê user_version) */
  migrate: Migrator;
}

/**
 * Resolve o módulo `node:sqlite` se o runtime atual o tiver compilado.
 * - Node do sistema (>= 22.13): existe → devolve o módulo.
 * - Electron: não é compilado no Node embutido → `process.getBuiltinModule`
 *   devolve undefined e o `require` lança ERR_UNKNOWN_BUILTIN_MODULE
 *   (capturado) → devolve undefined, e o caller cai para o backend sql.js.
 */
function getNodeSqlite(): typeof import('node:sqlite') | undefined {
  try {
    const getBuiltin = (process as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule;
    const mod = getBuiltin ? getBuiltin('node:sqlite') : undefined;
    if (mod) return mod as typeof import('node:sqlite');
    return require('node:sqlite') as typeof import('node:sqlite');
  } catch {
    return undefined;
  }
}

/**
 * Abre um banco SQLite num caminho de arquivo.
 * - Cria o diretório pai quando não existe.
 * - Backend: node:sqlite quando disponível (Node do sistema); sql.js (WASM)
 *   dentro do Electron (ver `getNodeSqlite`).
 * - Liga o enforcement de foreign keys.
 * - Não aplica o schema; use `.migrate()` (ou `openMigratedSqlite`) para isso.
 */
export async function openSqlite(dbPath: string): Promise<SqliteConnection> {
  await fsp.mkdir(dirname(dbPath), { recursive: true });
  const sqliteMod = getNodeSqlite();
  if (sqliteMod) {
    const db = new sqliteMod.DatabaseSync(dbPath);
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
  // Electron: node:sqlite não existe → backend sql.js (WASM).
  return openSqliteSqlJs(dbPath);
}

/**
 * Abre um banco com o backend sql.js (WASM) — o caminho que o Electron main
 * usa em runtime (node:sqlite não é compilado lá). Exportada para os testes
 * exercitarem EXATAMENTE o caminho do app: `openSqlite` escolhe esta função em
 * runtime quando não há node:sqlite (ver `getNodeSqlite`).
 */
export async function openSqliteSqlJs(dbPath: string): Promise<SqliteConnection> {
  await fsp.mkdir(dirname(dbPath), { recursive: true });
  const js = await openSqlJsDatabase(dbPath);
  js.db.exec('PRAGMA foreign_keys = ON');
  const migrator = createMigrator(js.db);
  return {
    db: js.db,
    migrate: migrator,
    close(): void {
      js.close();
    },
  };
}

/** Abre + aplica o schema numa etapa (conveniência para testes e bootstrap). */
export async function openMigratedSqlite(dbPath: string): Promise<SqliteConnection> {
  const conn = await openSqlite(dbPath);
  conn.migrate.migrate();
  return conn;
}
