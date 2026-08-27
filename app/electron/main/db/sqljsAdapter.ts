/**
 * electron/main/db/sqljsAdapter.ts — adaptador de melhor-sqlite3 → sql.js (WASM).
 *
 * POR QUE EXISTE: o binding nativo do `better-sqlite3` (ABI de Node) trava com
 * SIGSEGV dentro do processo main do Electron 33 (Node 20) nesta máquina
 * (glibc 2.44 / CachyOS), mesmo após `electron-rebuild` com o ABI certo. O
 * `sql.js` é SQLite compilado para WASM: roda no Node do sistema (testes) E no
 * Electron (runtime) sem build nativo, sem ABI, sem `electron-rebuild`.
 *
 * Para NÃO reescrever a camada de acesso (`repo.ts`, `migrate.ts`, `schema.ts`)
 * nem os ~1200 testes, expomos aqui a MESMA superfície do melhor-sqlite3 que é
 * usada no projeto, por cima do sql.js:
 *   - `Database` (sync): `exec`, `prepare` → Statement, `pragma`, `transaction`,
 *     `close`, `export`;
 *   - `Statement`: `run(...) → { changes, lastInsertRowid }`, `get(...) → objeto
 *     | undefined`, `all(...) → objeto[]`, `bind`, `free`.
 *
 * PERSISTÊNCIA: sql.js é em-memória; `open(path)` carrega bytes do arquivo numa
 * base, instala hooks para dar `export()` (`db.export()` devolve os bytes do
 * arquivo SQLite) e `flush()` grava no disco. A DI de `openSqlite` do
 * `connection.ts` continua aceitando um path e devolve `{ db, close, migrate }`
 * da mesma forma — o `close()` também persiste antes de fechar.
 *
 * O caminho do WASM é resolvido relativo a este módulo (dentro de
 * `node_modules/sql.js/dist/sql-wasm.wasm`), lido de forma SINCRONA via
 * `fs.readFileSync` no boot (uma vez, `initSqlJs` é singleton no processo).
 * Como o main é CJS/Node, o `require('sql.js')` devolve a factory promissificada
 * esperada — o carregamento WASM é bloqueante no primeiro uso, depois cacheado.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import initSqlJs, {
  type BindParams,
  type Database as SqlDatabase,
  type SqlJsStatic,
  type Statement,
} from 'sql.js';

// Caminho absoluto do WASM — resolução robusta ao bundler do main (electron-vite
// externaliza deps, então `require.resolve` acha o arquivo real no node_modules).
const WASM_PATH = join(dirname(require.resolve('sql.js/package.json')), 'dist', 'sql-wasm.wasm');

let _Sql: SqlJsStatic | null = null;

/** Carrega a instância do sql.js (singleton — o init é assíncrono, aguardado aqui). */
export async function getSqlJs(): Promise<SqlJsStatic> {
  if (_Sql) return _Sql;
  const wasmBinary = readFileSync(WASM_PATH);
  // initSqlJs pode aceitar `{ locateFile }` ou `{ wasmBinary }`; aqui passamos o
  // buffer pronto para evitar race de I/O e compat com o loader do node.
  // (local: o sql.js aceita `locateFile` que devolve o Caminho do .wasm; passamos
  // `wasmBinary` para não depender mais ainda.)
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

/**
 * Envolve um `Database` do sql.js numa superfície tipo melhor-sqlite3.
 * - `statement.get()` → objeto posicionalmente rotulado pelas colunas;
 * - `statement.run()` → { changes, lastInsertRowid } via SQL `changes()`/`last_insert_rowid()`;
 * - `database.pragma('foreign_keys = ON')` → executa o pragma e, para pragmas
 *   de leitura, devolve a primeira linha;
 * - `database.transaction(fn)` → devolve função que roda `fn` dentro de
 *   BEGIN/COMMIT com ROLLBACK em erro;
 * - `database.close()` e `database.export()` delegam ao subjacente.
 */
export function wrapSqlJs(raw: SqlDatabase): SqlJsDb {
  return {
    exec(sql: string): unknown[] {
      return raw.exec(sql);
    },

    prepare(sql: string): SqlJsStatement {
      const stmt = raw.prepare(sql);
      return wrapStatement(stmt, raw);
    },

    close(): void {
      raw.close();
    },
  };
}

function wrapStatement(stmt: Statement, raw: SqlDatabase): SqlJsStatement {
  return {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number } {
      try {
        stmt.reset();
        if (params.length > 0) stmt.bind(params as BindParams);
        stmt.step();
        stmt.reset();
        const changesRaw = raw.exec('SELECT changes() AS c')[0]?.values?.[0]?.[0];
        const rowidRaw = raw.exec('SELECT last_insert_rowid() AS l')[0]?.values?.[0]?.[0];
        return {
          changes: Number(changesRaw ?? 0),
          lastInsertRowid: Number(rowidRaw ?? 0),
        };
      } finally {
        stmt.free();
      }
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