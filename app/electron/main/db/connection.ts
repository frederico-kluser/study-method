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
 *
 * CARREGAMENTO LAZY DO ADDON NATIVO: este módulo NÃO importa 'better-sqlite3'
 * estaticamente. O mesmo node_modules serve dois runtimes com ABIs diferentes:
 * - Node do sistema → `better-sqlite3` canônico (13.x, prebuild NAPI do sistema);
 * - Electron 33 (Node 20 embutido, NAPI 9) → alias `better-sqlite3-electron`
 *   (12.11.1) compilado para o ABI do Electron por tools/ensure-native-abi.sh.
 * Um import estático carregaria o addon errado no boot do main (SIGSEGV silencioso
 * — segfault não é exceção JS, nenhum try/catch salva). Aqui o addon é resolvido
 * por NOME em variável na primeira abertura, então o pacote certo é escolhido
 * conforme o runtime antes de qualquer require.
 */

import { promises as fsp } from 'node:fs';
import { dirname } from 'node:path';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { createMigrator, type Migrator } from './migrate';

/** Nome do pacote npm que carrega o addon sqlite no runtime em questão. */
export function pickSqlitePackageName(electronRuntime: boolean): 'better-sqlite3' | 'better-sqlite3-electron' {
  return electronRuntime ? 'better-sqlite3-electron' : 'better-sqlite3';
}

/**
 * Módulo do addon carregado preguiçosamente. `typeof import('better-sqlite3')` é
 * o tipo do construtor (o @types usa `export =`), logo é newable.
 */
let sqliteModule: typeof import('better-sqlite3') | null = null;

function getSqliteModule(): typeof import('better-sqlite3') {
  if (!sqliteModule) {
    // Resolve por NOME em variável: o `require` dinâmico impede o TypeScript de
    // resolver o módulo aliased e escolhe o pacote certo conforme o runtime.
    const pkg = pickSqlitePackageName(!!process.versions.electron);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sqliteModule = require(pkg as string) as typeof import('better-sqlite3');
  }
  return sqliteModule;
}

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
 * O addon é carregado lazy (getSqliteModule) — sem import estático, o main do
 * Electron não segfaulta no boot. O acelerador de locking do WAL não é usado aqui.
 */
export async function openSqlite(dbPath: string): Promise<SqliteConnection> {
  await fsp.mkdir(dirname(dbPath), { recursive: true });
  const db = new (getSqliteModule())(dbPath);
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
