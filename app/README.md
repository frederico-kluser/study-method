# Study Method — GUI Electron

GUI desktop (Electron + React + Vite) do tutor **study-method**: aprender programação e a
matemática que aparece nela **através de código executável** — com aula, analogia, visualização e
desafio validado por teste. A GUI é construída **por ondas**; nesta versão está apenas o
**esqueleto** (janela, IPC, preload, shell de navegação, tema escuro e testes).

## Como rodar

```bash
npm ci        # instala dependências (manifesto congelado)
npm run dev   # electron-vite dev — abre a janela
```

Produção:

```bash
npm run build   # main + preload + renderer em out/
npm run lint    # tsc --noEmit (tsconfig.json + tsconfig.node.json)
npm test        # bash tools/t.sh tests — node:test + tsx
```

Requisitos: Node ≥ 20 (Node v24 testado), npm ≥ 11. O `.npmrc` libera `allow-scripts` para os
`postinstall` de esbuild/electron que o build exige.

## Arquitetura

```
app/
├─ electron/
│  ├─ main/index.ts          bootstrap: janela única, ciclo de vida, registra handlers
│  ├─ main/ipc/index.ts      buildIpcRegistry (puro) + registerIpcHandlers (ipcMain)
│  ├─ main/services/         stores e serviços do main (settingsStore compartilhado; llm-engine placeholder)
│  ├─ preload/index.ts       entry: liga ipcRenderer ao createExposedApi e expõe window.api
│  └─ preload/api-schema.ts  createExposedApi (puro, testável) + tipagem ApiSchema
├─ shared/ipc-contract.ts    CONTRATO único de canais e tipos (congelado)
├─ src/                      renderer React (shell)
│  ├─ main.tsx  App.tsx  index.css
│  ├─ views/                 registry (index.ts) + componentes .tsx (placeholders)
│  └─ types/global.d.ts      window.api tipado
└─ tests/                    settingsStore / ipc-contract / ipc-shell
```

Três alvos de build (electron-vite): `main` (processo principal + llm-engine), `preload` e
`renderer` (SPA). Camadas:

- **main** — janela (tema escuro, 1280x800, min 900x600), singleton, handlers IPC.
- **preload** — `contextBridge.exposeInMainWorld('api', …)` sobre
  `contextIsolation` (ver `webPreferences` no main).
- **renderer** — shell React com navegação por estado (Início / Settings / Aula / Desafio).

## Contrato IPC

O único fonte de verdade para nomes de canal e tipos é
[`app/shared/ipc-contract.ts`](../app/shared/ipc-contract.ts) — **não duplicar strings soltas**.
Grupos: `settings:*`, `keys:*`, `pi:*`, `localAi:*`, `study:*`.

Convenções do preload (`electron/preload/api-schema.ts`):

- Canais de **requisição** (`invoke`): o renderer chama `window.api.<grupo>.<metodo>(args)` → `Promise`.
- Canais de **evento** (push main→renderer): métodos `onXxx(cb)` devolvem um unsubscribe
  (`const stop = window.api.pi.onStreamEvent(cb); stop()`).
- Nome de método derivado do canal: `pi:stream-event` → `onStreamEvent`;
  `localAi:download-progress` → `onDownloadProgress`; `study:lesson-progress` → `onLessonProgress`;
  `study:test-answer-event` → `onTestAnswerEvent`.

## Registrar um handler novo (para as ondas 2+)

Dentro de uma onda futura, substitua o placeholder no registro (`buildIpcRegistry` em
`electron/main/ipc/index.ts`) por um handler real, OU registe num módulo próprio e chame de
`registerIpcHandlers()`. Os canais `keys:*` são propriedade da onda1-pi
(`electron/main/ipc/keys-handlers.ts`) e **não** são registrados aqui.

## Status: já existe × ondas seguintes

| Área | Estado |
|---|---|
| Janela principal, ciclo de vida, single-instance | ✅ onda 1 (scaffold) |
| Registro IPC (`settings:*` reais; `pi/localAi/study` placeholders de "em construção") | ✅ onda 1 |
| Preload `window.api` tipado (todos os canais do contrato) | ✅ onda 1 |
| Shell React com navegação e tema escuro | ✅ onda 1 |
| settingsStore persistente (compartilhado) | ✅ (PREP) |
| pi coding agent (`pi:*`, `keys:*`) | 🔜 onda1-pi / onda1 |
| LLM local node-llama-cpp (`localAi:*`, llm-engine real) | 🔜 onda de LLM local |
| Pesquisa Brave (`study:*` pesquisa) | 🔜 onda de pesquisa |
| Aulas (geração de aula, markdown) | 🔜 onda de aulas |
| Editor (CodeMirror) + terminal (xterm) | 🔜 onda de editor |