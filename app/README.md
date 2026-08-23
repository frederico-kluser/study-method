# Study Method — GUI Electron

GUI desktop (Electron + React + Vite + TypeScript) do tutor **study-method**: aprender
programação e a matemática que aparece nela **através de código executável** — com aula,
analogia, visualização e desafio validado por teste. A GUI é a frente interativa da skill
[`skills/study-method`](../skills/study-method); todo o trabalho pesado (aulas, desafios,
validação, pesquisa) é feito pelos scripts e pelo lesson-orchestrator do processo **main**.

Este README cobre o **o que é, como rodar e o fluxo principal**. Um documento pt-BR detalhado —
manual do usuário + arquitetura técnica + mapa de contratos — vive em
[`docs/app-gui.md`](../docs/app-gui.md) (complemento, não duplicação).

## Como rodar

Requisitos: Node ≥ 20 (Node v24 testado), npm ≥ 11. O `.npmrc` libera `allow-scripts` para os
`postinstall` de esbuild/electron que o build exige.

```bash
npm ci        # instala dependências (manifesto/package-lock congelados)
npm run dev   # electron-vite dev — abre a janela
```

Produção / checagens:

```bash
npm run build   # main + preload + renderer em out/
npm run lint    # tsc --noEmit (tsconfig.json + tsconfig.node.json)
npm test        # bash tools/t.sh tests — node:test + tsx (suite completa)
```

> Os gates desta app (verdes antes de considerar concluído) são exatamente os três comandos
> acima com cwd em `app/`: `bash tools/t.sh tests` · `npm run lint` · `npm run build`.

## Fluxo principal (produto)

1. **Configurações** (aba Settings): cadastre as chaves de API e, opcionalmente, baixe um
   modelo **LLM local**.
2. **Aula** (aba Aula): digite um **assunto** → o app pesquisa (Brave), autora a aula
   (DeepSeek), materializa um `setup` e **valida os desafios** antes de mostrá-los.
3. **Desafio** (aba Desafio): edite o stub no editor (CodeMirror), salve (Ctrl+S ou ⌘S),
   e clique **Testar resposta**.
   - Fase **determinística**: rodam os testes do desafio no workspace (resultado PASS/FAIL,
     contagem de testes, saída no terminal).
   - Fase **pi coding agent** (DeepSeek): o app monta um prompt com o código + saída dos
     testes e envia ao `pi` para um **feedback** revisto por LLM, com streaming
     (texto/raciocínio/ferramentas) em painel colapsável.

## Onde estão as chaves

As chaves são cadastradas na aba **Settings** e persistidas localmente (settingsStore, no
processo main). Não vão para o código nem para o git. Também podem vir do ambiente:

- `DEEPSEEK_API_KEY` — autoria de aulas, juiz do desafio e o coding agent `pi`.
- `BRAVE_API_KEY` — pesquisa de fontes para a aula.

Variáveis de caminho/execução:

- `STUDY_METHOD_SKILL_DIR` — diretório da skill study-method (com `scripts/`). Se ausente, o
  runner resolve procurando a árvore a partir dos próprios parent dirs da app; em produção
  recomenda-se definir explicitamente.
- `STUDY_METHOD_SETUPS_DIR` — onde os `setups/` (aula por aula) são criados. Default:
  `~/.local/share/study-method/setups`.
- `STUDY_METHOD_LLM_IN_PROCESS` — `=1` roda o motor LLM local no processo principal (dev);
  sem ela o motor sobe num **utility process** dedicado (`llm-engine`).

## LLM local

Na aba Settings → LLM local o app detecta o hardware, recomenda um quant, **baixa
automaticamente os binários** (node-llama-cpp + pesos) e ativa um modelo. Escolha no painel o
**provedor de feedback do desafio**:

- **DeepSeek (nuvem)** (default) — o coding agent `pi` avalia a resposta, com streaming.
- **Modelo local** — o modelo local vira o **avaliador/juiz do feedback**: quando selecionado
  E há um modelo local ativo, a fase de feedback do Desafio roda a inferência localmente (sem
  depender do DeepSeek), com o mesmo prompt pedagógico pt-BR. Sem modelo ativo, o feedback
  volta automaticamente ao DeepSeek.

> **Primeiro-run local:** o download baixa o modelo (e o backend nativo do node-llama-cpp)
> automaticamente na primeira ativação; pode demorar e consumir banda/GPU conforme o tamanho.
> A inferência local é **um bloco único (sem streaming)**; modelos grandes podem demorar mais
> para responder.

## Arquitetura (resumo)

```
app/
├─ electron/
│  ├─ main/index.ts            bootstrap: janela única, CSP/sandbox, registra handlers IPC
│  ├─ main/main-setup.ts       buildMainSetup: ORDEM fixa de registro (ipc→keys→localAi→pi→study)
│  ├─ main/ipc/                handlers por grupo: settings/keys/localAi/pi/study (+safeHandle)
│  ├─ main/services/           stores e serviços do main
│  │  ├─ PiAgentService.ts     coding agent `pi` (SDK @mariozechner/pi-*)
│  │  ├─ deepseekClient.ts     cliente DeepSeek one-shot
│  │  ├─ deepseekLessonAuthor.ts  autor de aulas (prompt pt-BR + validação de draft)
│  │  ├─ deepseekLlmJudge.ts   juiz LLM do protocolo REQUEST/APPLY
│  │  ├─ lessonOrchestrator.ts cadeia assunto→pesquisa→autoria→materialização→validação
│  │  ├─ studyMethodRunner.ts  runner dos scripts da skill (createSetup/createChallenge/verify)
│  │  ├─ braveSearchService.ts + researchPlanner.ts   pesquisa de fontes
│  │  └─ embeddedLlm/          motor LLM local (node-llama-cpp) em utility process
│  ├─ preload/index.ts         contextBridge → expõe window.api
│  └─ preload/api-schema.ts    createExposedApi (puro) + tipagem ApiSchema
├─ shared/ipc-contract.ts      CONTRATO único de canais e tipos (congelado)
├─ src/                        renderer React
│  ├─ views/                   Settings / Aula (LessonView) / Desafio (ChallengeView)
│  ├─ components/  editor, terminal (xterm), CodeMirror
│  └─ lib/                     lógica pura + apiBridge (porta única para window.api)
└─ tests/                      ~366+ testes (node:test, sem jsdom)
```

Três alvos de build (electron-vite): `main` (inclui processo `llm-engine`), `preload` e
`renderer` (SPA com `base: './'` para rodar sobre `file://`). Camadas:

- **main** — janela (1280×800, min 900×600, tema escuro), ciclo de vida, instance-lock,
  handlers IPC, e **todo o tráfego de rede** (DeepSeek/Pi/Brave/download de modelo). O
  renderer não fala com a internet; só com o main via IPC.
- **preload** — `contextBridge.exposeInMainWorld('api', …)`, `contextIsolation: true`,
  `sandbox: true`, `nodeIntegration: false`.
- **renderer** — shell React por estado; lê a API exclusivamente por
  `src/lib/apiBridge.ts` (`getApi()` — testável sem jsdom).

## Segurança

- **CSP** estrita no `app/index.html` (`default-src 'self'`; `script-src 'self'`; somente o
  necessário para o editor/terminal injetarem estilos inline). Sem `unsafe-eval`. Ver
  `docs/app-gui.md → Segurança`.
- **`sandbox: true`** nas webPreferences (preload enxuto que só `require('electron')`).
- `webSecurity: true` (default) e links externos `http(s)` abrem no navegador do sistema.
- Operações de **workspace** (`read/write/delete`) são restritas ao `workspaceDir` por
  contenção de path (`resolveContainedWorkspacePath`); traversal é rejeitado.

## Contrato IPC

O único fonte de verdade para nomes de canal e tipos é
[`app/shared/ipc-contract.ts`](./shared/ipc-contract.ts) — congelado; não duplicar strings
soltas nem renomear canais. Grupos: `settings:*`, `keys:*`, `pi:*`, `localAi:*`, `study:*`.

Convenções do preload (`electron/preload/api-schema.ts`):

- **Requisição** (`invoke`): `window.api.<grupo>.<metodo>(args)` → `Promise<R>`.
- **Evento** (push main→renderer): método `onXxx(cb)` devolve unsubscribe (`stop()`).
  Nome derivado do canal: `pi:stream-event` → `onStreamEvent`;
  `study:lesson-progress` → `onLessonProgress`; `study:test-answer-event` → `onTestAnswerEvent`.

Onde o renderer chama um método do `ApiSchema` ainda tipado sem parâmetros (placeholders), o
padrão aceito é o **cast local** no ponto de uso (ex.: `api.study.readWorkspaceFile` cast para
`(a: ReadArgs) => Promise<string>`). A verificação fim-a-fim de assinatura (payload da UI ×
handler) está coberta por testes de wiring em `tests/study-wiring.test.ts`.

## Limitações conhecidas

- **Primeiro-run do LLM local** baixa o modelo/binários automaticamente (ver acima).
- **Chat local é um bloco único (sem streaming)** — a inferência do modelo local no feedback
  do desafio não streama deltas (diferente do pi/DeepSeek); o primeiro uso pode baixar os
  binários do node-llama-cpp automaticamente, e modelos grandes têm tempo de resposta maior.
- **Erro de chat local não vira fallback automático** — se a inferência local falhar no
  runtime, o app mostra o erro no painel com a dica de ativar o modelo local em Configurações
  ou trocar o provedor para DeepSeek; não re-dispara o pi sozinho.
- **Verificação de desafio é rígida** (regras DES-1/DES-4): o desafio só entra na aula se a
  referência/alternativas passarem e o juiz aprovar; `not_run` ≠ sucesso e tem diagnóstico
  honesto de porquê.
- **Naming de função derivado do slug**: a função principal do desafio deve seguir o nome que
  a semente do `challenge-new.sh` deriva do slug (ex.: slug `fatorial-recursivo` →
  `fatorial_recursivo` em python/js/rust/c e `FatorialRecursivo` em go). Se o modelo desviar,
  a validação rejeita.
- **Persistência de seleção em Desafio** não é restaurada entre sessões (ver `docs/app-gui.md`).

Detalhes, arquitetura técnica e o manual pt-BR completo: [`docs/app-gui.md`](../docs/app-gui.md).