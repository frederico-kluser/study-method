/**
 * electron/main/db/sqljsAdapter.ts — backend SQLite via sql.js (WASM), o caminho
 * que o processo main do Electron usa em runtime.
 *
 * POR QUE EXISTE: o `node:sqlite` (DatabaseSync) existe no Node do sistema
 * (testes, CLI) mas NÃO é compilado no Node embutido do Electron — medido no
 * Electron 37.2.4: `require('node:sqlite')` lança
 * `ERR_UNKNOWN_BUILTIN_MODULE: No such built-in module: node:sqlite` e o app
 * caía no boot. O `sql.js` é o SQLite compilado para WASM: roda no Node do
 * sistema E no Electron, sem build nativo, sem ABI, sem `electron-rebuild` —
 * a mesma razão pela qual o addon anterior (`better-sqlite3`) foi descartado
 * (SIGSEGV no main do Electron 33).
 *
 * Para NÃO reescrever a camada de acesso (`repo.ts`, `migrate.ts`, `schema.ts`)
 * nem os ~1200 testes, expomos aqui a MESMA superfície usada no projeto, por
 * cima do sql.js:
 *   - `Database` (sync): `exec`, `prepare` → Statement, `close`, `export`;
 *   - `Statement`: `run(...) → { changes, lastInsertRowid }`, `get(...) → objeto
 *     | undefined`, `all(...) → objeto[]`.
 *
 * PERSISTÊNCIA — e o TRUQUE do sql.js: sql.js é em-memória; o único caminho de
 * volta pro arquivo é `db.export()` (os bytes do SQLite). O `export()` do
 * sql.js NÃO serializa "em cima": ele FECHA a conexão e REABRE do bytes
 * (medido no 1.14.2: close + serialize + deserialize). Consequências, todas
 * validadas empiricamente:
 *   - um flush no MEIO de uma transação a mata (o COMMIT seguinte falha com
 *     "cannot commit - no transaction is active");
 *   - pragmas de CONEXÃO se perdem — em particular `PRAGMA foreign_keys = ON`
 *     (o build do sql.js nasce com FK OFF), por isso o flush o re-aplica;
 *   - statements preparados vivos são liberados (aqui nunca há: o wrapper
 *     dá `free()` ao fim de cada get/all/run, e o flush só roda entre operações).
 *
 * POLÍTICA DE FLUSH (`openSqlJsDatabase`): nada de flush a cada statement.
 *   - fora de transação: cada exec/run persiste ao fim (escritas standalone,
 *     migrations, e o COMMIT/ROLLBACK de uma tx — o estado da tx inteira vai
 *     pro arquivo de uma vez);
 *   - dentro de uma transação (após `BEGIN`): NADA de flush até o
 *     COMMIT/ROLLBACK — um crash no meio da tx é rollback, como em SQLite de
 *     disco (nenhum dado commitado se perde);
 *   - `close()` persiste e fecha.
 * O volume é pequeno (progresso de estudo), então exportar o arquivo inteiro
 * por commit é barato.
 *
 * O caminho do WASM resolve via `require.resolve('sql.js/dist/sql-wasm.wasm')`
 * — o campo `exports` do pacote libera `./dist/*`; `sql.js/package.json` NÃO é
 * subpath exportado e `require.resolve` dele quebraria (ERR_PACKAGE_PATH_NOT
 * _EXPORTED). O WASM é lido de forma SINCRONA no primeiro uso (`getSqlJs` é
 * singleton no processo) e passado como `wasmBinary` para o init — sem depender
 * de `locateFile`.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import initSqlJs, {
  type BindParams,
  type Database as SqlDatabase,
  type SqlJsStatic,
  type Statement,
} from 'sql.js';

// Caminho absoluto do WASM — robusto ao bundler do main (electron-vite
// externaliza deps, então o require.resolve acha o arquivo real no node_modules).
const WASM_PATH = require.resolve('sql.js/dist/sql-wasm.wasm');

let _Sql: SqlJsStatic | null = null;

/** Carrega a instância do sql.js (singleton — o init é assíncrono, aguardado aqui). */
export async function getSqlJs(): Promise<SqlJsStatic> {
  if (_Sql) return _Sql;
  const wasmBinary = readFileSync(WASM_PATH);
  // `wasmBinary` pronto evita race de I/O e não depende do locateFile.
  _Sql = await initSqlJs({ wasmBinary });
  return _Sql;
}

export interface SqlJsDb {
  exec(sql: string): unknown[];
  prepare(sql: string): SqlJsStatement;
  close(): void;
}

export interface SqlJsStatement {
  run(...params: unknown[]): { changes: number; lastInsertRowid: number };
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Array<Record<string, unknown>>;
}

export interface SqlJsOpenDb {
  /** conexão wrapper (superfície igual à do node:sqlite usada na camada de dados) */
  db: SqlJsDb;
  /** exporta os bytes atuais do banco para o arquivo (persiste o estado commitado) */
  flush(): void;
  /** persiste (flush) e fecha a conexão subjacente (idempotente) */
  close(): void;
}

/** Estado compartilhado entre o wrapper e o flush (ver política no topo). */
interface SqlJsState {
  /** verdadeiro entre `BEGIN` e `COMMIT`/`ROLLBACK` — suprime o flush no meio */
  inTransaction: boolean;
}

/**
 * Abre um banco sql.js PERSISTENTE num caminho de arquivo.
 * - Arquivo existente não-vazio → carrega os bytes;
 * - ausente ou vazio (0 bytes, ex.: touch) → banco novo;
 * - flush fora de transação (a cada exec/run standalone e em COMMIT/ROLLBACK)
 *   e no `close()` — ver política no topo do módulo;
 * - `close()` persiste e fecha (idempotente).
 */
export async function openSqlJsDatabase(path: string): Promise<SqlJsOpenDb> {
  const Sql = await getSqlJs();
  const onDisk = existsSync(path) ? readFileSync(path) : null;
  const raw: SqlDatabase =
    onDisk && onDisk.length > 0 ? new Sql.Database(onDisk) : new Sql.Database();

  const state: SqlJsState = { inTransaction: false };
  let closed = false;
  const writeOut = (): void => {
    // export() fecha e REABRE a conexão: re-aplicamos o pragma de conexão do
    // contrato desta camada (foreign_keys ON — o build do sql.js nasce OFF).
    writeFileSync(path, Buffer.from(raw.export()));
    raw.exec('PRAGMA foreign_keys = ON');
    state.inTransaction = false;
  };
  return {
    db: wrapSqlJs(raw, writeOut, state),
    flush: writeOut,
    close(): void {
      if (closed) return;
      closed = true;
      writeOut();
      raw.close();
    },
  };
}

/**
 * Envolve um `Database` do sql.js numa superfície tipo node:sqlite/better-sqlite3.
 * - `statement.get()` → objeto posicionalmente rotulado pelas colunas;
 * - `statement.run()` → { changes, lastInsertRowid } via SQL `changes()`/`last_insert_rowid()`;
 * - `onWrite` (quando dado) roda a cada exec e a cada run — mas NUNCA dentro de
 *   uma transação aberta (`state.inTransaction`): o export do sql.js fecharia a
 *   conexão e mataria a tx. O flush em BEGIN/COMMIT é decidido por quem abre
 *   (ver `openSqlJsDatabase`).
 */
export function wrapSqlJs(raw: SqlDatabase, onWrite?: () => void, state: SqlJsState = { inTransaction: false }): SqlJsDb {
  const isTransactionBoundary = (sql: string): 'begin' | 'end' | null => {
    const s = sql.trim();
    if (/^BEGIN\b/i.test(s)) return 'begin';
    if (/^(COMMIT|ROLLBACK|END)\b/i.test(s)) return 'end';
    return null;
  };

  return {
    exec(sql: string): unknown[] {
      const boundary = isTransactionBoundary(sql);
      const out = raw.exec(sql); // lança em erro (ex.: FK) — sem flush
      if (boundary === 'begin') state.inTransaction = true;
      if (boundary === 'end') state.inTransaction = false;
      if (!state.inTransaction) onWrite?.();
      return out;
    },

    prepare(sql: string): SqlJsStatement {
      return wrapStatement(raw.prepare(sql), raw, onWrite, state);
    },

    close(): void {
      raw.close();
    },
  };
}

function wrapStatement(
  stmt: Statement,
  raw: SqlDatabase,
  onWrite: (() => void) | undefined,
  state: SqlJsState,
): SqlJsStatement {
  return {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number } {
      let result: { changes: number; lastInsertRowid: number };
      try {
        stmt.reset();
        if (params.length > 0) stmt.bind(params as BindParams);
        stmt.step(); // lança em erro (ex.: FK) — o finally libera, sem flush
        stmt.reset();
        const changesRaw = raw.exec('SELECT changes() AS c')[0]?.values?.[0]?.[0];
        const rowidRaw = raw.exec('SELECT last_insert_rowid() AS l')[0]?.values?.[0]?.[0];
        result = {
          changes: Number(changesRaw ?? 0),
          lastInsertRowid: Number(rowidRaw ?? 0),
        };
      } finally {
        stmt.free();
      }
      if (!state.inTransaction) onWrite?.();
      return result;
    },

    get(...params: unknown[]): Record<string, unknown> | undefined {
      stmt.reset();
      if (params.length > 0) stmt.bind(params as BindParams);
      const names = stmt.getColumnNames();
      const has = stmt.step();
      const row = has ? stmt.getAsObject() : undefined;
      stmt.free();
      if (!has || !row) return undefined;
      // getAsObject usa os nomes das colunas como chaves; normaliza para garantir
      // as MESMAS chaves sempre (e o shape objeto esperado pela camada de repo).
      const out: Record<string, unknown> = {};
      for (const n of names) out[n] = row[n];
      return out;
    },

    all(...params: unknown[]): Array<Record<string, unknown>> {
      stmt.reset();
      if (params.length > 0) stmt.bind(params as BindParams);
      const names = stmt.getColumnNames();
      const rows: Array<Record<string, unknown>> = [];
      const seen: string[] = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
        if (seen.length === 0) seen.push(...(stmt.getColumnNames() ?? names));
      }
      stmt.free();
      const colNames = seen.length > 0 ? seen : names;
      return rows.map((r) => {
        const out: Record<string, unknown> = {};
        for (const n of colNames) out[n] = r[n];
        return out;
      });
    },
  };
}
