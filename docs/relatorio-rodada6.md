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

O mesmo `node_modules` serve **dois runtimes com ABIs diferentes**:

| Runtime | Node embutido | `process.versions.modules` | NAPI |
|---|---|---|---|
| Electron 33.2.0 | 20.18 | **130** | **9** |
| Node do sistema (v24) | 24.x | **137** | **10** |

- O `npm ci` instala `better-sqlite3` 13.0.3 com **prebuild do Node do sistema** (NAPI 10).
  O v13 **hardcoda `NAPI_VERSION=10`** no `binding.gyp`.
- Carregar esse addon dentro do Electron → **SIGSEGV silencioso** (segfault não é exceção JS —
  nenhum try/catch salva). Recompilar o v13 contra os headers do Electron **também** crasha: o
  runtime NAPI 9 do Electron não implementa NAPI v10.
- O `better-sqlite3` **12.11.1** (V8-ABI clássico, loader `bindings` → `build/Release/*.node`),
  compilado para o ABI do Electron, **funciona** (validado empiricamente com probe real dentro do
  Electron 33.2.0).

## Solução

1. **Alias npm** `better-sqlite3-electron` → `npm:better-sqlite3@12.11.1` (mantendo o
   `better-sqlite3` 13.0.3 canônico para os testes sob o Node do sistema).
2. **`tools/ensure-native-abi.sh`** (idempotente, via marker): compila o alias para o ABI do
   Electron (`node-gyp rebuild --target=<electron> --dist-url=https://electronjs.org/headers`),
   rodando automaticamente em `postinstall`/`predev`/`pretest:e2e*`.
3. **Loader lazy** em `electron/main/db/connection.ts`: `pickSqlitePackageName(electronRuntime)`
   escolhe o pacote por runtime e o addon é carregado por `require(nomeDinâmico)` **na primeira
   abertura** — sem import estático, o main do Electron não segfaulta no boot.

## Validação

- `bash tools/ensure-native-abi.sh` 2× — a 2ª execução é instantânea (fast path via marker).
- **Probe Electron** (`node_modules/.bin/electron probe-sqlite.cjs`): `require('better-sqlite3-electron')`
  + abrir `:memory:` + exec/prepare/run/get/transaction/pragma/close → **OK, exit 0** (sem segfault).
- **Probe Node**: `require('better-sqlite3')` canônico v13 → `SELECT 1` → **1** (caminho íntegro).
- `npm run lint` verde; `npm test` (~729 testes) verde; `npm run build` verde.

## Arquivos tocados

- `app/package.json` — dependência aliased + scripts de ciclo de vida.
- `app/package-lock.json` — lock atualizado pelo `npm install`.
- `app/tools/ensure-native-abi.sh` — novo script de build do ABI do Electron.
- `app/electron/main/db/connection.ts` — loader lazy + `pickSqlitePackageName`.
- `app/tests/db/sqlite-loader.test.ts` — testes novos (função pura + caminho Node).
- `app/README.md`, `docs/app-gui.md`, `docs/relatorio-rodada6.md` — docs.

Detalhes técnicos em [`app/README.md`](../app/README.md) e [`docs/app-gui.md`](app-gui.md).
