# Relatório da Rodada 6 — execução orquestrada (GUI Electron study-method)

Relatório da **sexta rodada** de desenvolvimento da GUI Electron do study-method (`app/`).
Foco: corrigir o **crash silencioso no boot do Electron** causado por incompatibilidade de ABI
do addon nativo `better-sqlite3`.

---

## Problema

`./run.sh` buildava e abria o Electron, mas o processo **morria em silêncio** (SIGSEGV no boot):
nenhum erro JS, nenhum log — só os crash reports `.ips` do macOS apontando
`node_module_register → napi_register_module_v1` na imagem `darwin-arm64.node`.

## Causa raiz

O mesmo `node_modules` servia **dois runtimes com ABIs diferentes**:

| Runtime | Node embutido | ABI de módulo nativo |
|---|---|---|
| Electron 33.2.0 | 20.18 | **v9** |
| Node do sistema (v24) | 24.x | **v10+** |

- O `npm ci` instalava `better-sqlite3` 13.0.3 com **prebuild do Node do sistema** (ABI v10).
  O v13 **hardcoda a versão 10 do ABI** no `binding.gyp`.
- Carregar esse addon dentro do Electron → **SIGSEGV silencioso** (segfault não é exceção JS —
  nenhum try/catch salva). Recompilar o v13 contra os headers do Electron **também** crashava: o
  runtime ABI v9 do Electron não implementa a versão v10.

## Solução — duas ondas

### Onda 1 (primeira tentativa — mantida, depois substituída)

Mantinha o addon nativo, contornando a incompatibilidade de ABI com um **alias npm** do
`better-sqlite3` 12.11.1 + um **script de pós-install** (`postinstall`/`predev`) que o
recompilava para o ABI do Electron, + um **loader lazy** que escolhia o pacote por runtime.
Funcionava, MAS exigia compilação nativa pós-install (download de headers + rebuild) — justamente
o que o usuário pediu para eliminar ("troque o sqlite por algo que funcione" **sem** isso).

### Onda 2 (solução definitiva — esta entrega)

Substituiu o addon nativo por **`node:sqlite`** (`DatabaseSync`), o módulo SQLite **embutido** no
Node e no Electron — **zero dependência nativa, zero compilação pós-install** — e subiu o Electron
de 33.2.0 para **37.2.4** (Node 22.16 embutido, onde `node:sqlite` é unflagged):

1. **`node:sqlite`** no lugar do addon: `db.exec`, `db.prepare().get/run/all`, `db.close` mapeiam
   1:1 para `DatabaseSync`; `db.pragma(...)` vira `db.exec('PRAGMA ...')` e `db.transaction(fn)()`
   vira o helper `withTransaction` (BEGIN/COMMIT/ROLLBACK com try/catch).
2. **Electron 37** garante Node ≥ 22.13 embutido → `node:sqlite` sem flag, nos dois runtimes.
3. **Remoção do mecanismo da onda 1**: alias npm, script de pós-install e loader lazy foram
   removidos (e os testes que os cobriam, apagados).

O mesmo banco abre no Node do sistema E no Electron sem rebuild, sem alias e sem script de
ciclo de vida — o problema de ABI desaparece por construção (não há `.node` compilado).

## Validação

- `npm ci` limpo, **sem** pós-install de compilação (o script da onda 1 não existe mais).
- **Probe Electron 37** (`node_modules/.bin/electron probe`): `require('node:sqlite')` → `new
  DatabaseSync(':memory:')` → exec/prepare/run/get/all/PRAGMA foreign_keys/close → **OK, exit 0**
  (sem segfault, sem flag). Repetido com `ELECTRON_RUN_AS_NODE=1` e com `node` (sistema) — os três
  funcionam.
- `npm run lint` verde; `npm test` (~1216 testes) verde; `npm run build` verde; `npm run
  test:e2e` (Playwright, ~15 testes) verde — valida o bump do Electron 37 de ponta a ponta.

## Arquivos tocados

- `app/package.json` — Electron 37.2.4; removidos `better-sqlite3` (+ `@types`), o alias e os
  scripts de ciclo de vida da onda 1.
- `app/package-lock.json` — lock regenerado (`npm install` + `npm ci`).
- `app/electron/main/db/connection.ts` — `node:sqlite` (`DatabaseSync`), sem loader lazy.
- `app/electron/main/db/repo.ts` — `DatabaseSync` + helper `withTransaction`.
- `app/electron/main/db/migrate.ts` — `DbConnectionLike`/`getUserVersion` ajustados ao tipo do
  `StatementSync.get` (`unknown` → cast).
- Testes adaptados (`repo.test.ts`, `repo.edge.test.ts`, `study-persist.test.ts`,
  `connection-edges.test.ts`); apagados os testes do loader de alias e do script de build do ABI
  (2 arquivos) e o próprio script de build do ABI do Electron.
- `app/README.md`, `docs/app-gui.md`, `docs/relatorio-rodada6.md` — docs.

Detalhes técnicos em [`app/README.md`](../app/README.md) e [`docs/app-gui.md`](app-gui.md).
