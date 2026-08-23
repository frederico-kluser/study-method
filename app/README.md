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
npm run test:e2e  # Playwright `_electron` sobre o build (veja § E2E)
```

> Os gates desta app (verdes antes de considerar concluído) são: `bash tools/t.sh tests` ·
> `npm run lint` · `npm run build` · `npm run test:e2e` (8 specs verdes).

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

## Interface (MUI v9, dark) e idioma

- **Material UI v9 + tema escuro (dark-only)**. O renderer inteiro roda dentro de um
  `<ThemeProvider theme={theme} defaultMode="dark">` + `<CssBaseline>` (único ponto onde o
  fundo escuro é aplicado no `<body>`), definido em `src/main.tsx` e `src/theme.ts`. Não há
  toggle claro/escuro — o app é escuro por padrão.
- **Componentes:** AppBar + Tabs (shell), Stepper (fases da aula), painéis/Select/Menu do
  Desafio e Settings. O CSS custom legado (`src/index.css`) ficou só para variáveis de tema,
  os placeholders (view Início) e os estilos de CodeMirror/xterm; as views reais usam MUI `sx`.
- **i18n pt-BR/en** (`src/i18n/`): um namespace único `translation`, chaveada via
  `t('translation:<chave>')`. **pt-BR é o default**; `en` é o fallback. Recursos JSON
  embutidos no bundle (sem fs-backend — o renderer roda sandboxed).
- **Troca de idioma:** `LanguageSwitcher` (dropdown/ícone na AppBar) chama `changeLanguage`.
  A **persistência** é automática — o núcleo grava no `localStorage` (chave `app-language`)
  no evento `languageChanged`, e no boot reaplica a escolha salva. O gate e o boot chamam
  `initI18n()` (inicializa a instância default que o `useTranslation()`/`getI18n()` usam).
- Teste de **wiring** dessa camada: `tests/i18n-wiring.test.ts` (sem jsdom, roda no
  `bash tools/t.sh tests`).

## Startup-gate (chaves DeepSeek + Brave)

Ao abrir, o app valida as chaves **antes de liberar a UI** (canal `keys:startup-status`):

- **Sem chaves** (ou só com uma) → tela de **Setup** bloqueada (`setup blocked`): não mexe
  na rede, apenas pede para configurar as duas chaves em Configurações.
- **Chaves presentes** → valida **as duas** com timeout curto (~8 s) a cada boot:
  - `401/403` → chave inválida → bloqueado com a chave apontada;
  - **ambas** falharem por **erro de rede** → **modo offline** (`offline`): o app inicia com
    um aviso e as features online ficam gateadas (dá para navegar/ver o que é local);
  - uma válida + outra por rede-falhou → não é offline (exige **ambas** por rede) → bloqueado
    apontando a que falhou.

O gate vive em `src/gate/AppGate.tsx` + `electron/main/ipc/startup-handlers.ts`; a decisão
`classifyStartup` é uma função pura testada em `tests/startup-handlers.test.ts`.

## Voz (STT local + TTS Piper)

Tudo local e on-device, no **processo main** (o renderer só vê canais `stt:*`/`localTts:*`):

- **STT (transcrição)** — `sherpa-onnx-node` (Nemotron streaming) num **utility process**
  (`asr-engine`). O modelo embutido viaja no instalador em `resources/stt-models/<modelId>`.
  Os botões `MicButton` (captura) usam o hook `useMicSTT` (`src/hooks/useMicSTT.ts`), que
  resampleia o microfone para 16 kHz mono e abre a sessão **antes** de alimentar frames.
- **TTS (síntese)** — o binário `sherpa-onnx-offline-tts` (Piper, GPL isolado num processo
  filho) gera WAV; modelos Piper viajam em `resources/tts-models/<modelId>` e o engine em
  `resources/tts-engine/<platform>-<arch>/` (+ `resources/espeak-ng-data`). `SpeakButton`
  monta o áudio da síntese.
- **Env overrides (dev/CI):**
  - `STUDY_METHOD_TTS_ENGINE_BIN` — caminho explícito do binário do engine TTS;
  - `STUDY_METHOD_TTS_MIRROR_BASE` — base URL de download dos modelos Piper;
  - `STUDY_METHOD_STT_MIRROR_BASE` — base URL de download dos modelos de STT.
- A preferência de voz (modelId/voz/speed) é **persistida** no settingsStore (chave
  `localTtsPreference`) via `localTts:set-preference`/`get-preference`.

## E2E (Playwright)

Aceita o app **Electron real** sobre o build de release (`out/`), com o main em **modo stub**
(`STUDY_METHOD_E2E=1`): **sem rede real, sem GPU de inferência, sem LLM/GGUF/STT/TTS** — os
handlers devolvem fixtures determinísticas (`electron/main/services/e2eStubs.ts`); o renderer
é exatamente o de produção.

```bash
npm run build && npm run test:e2e        # 1 worker (Electron não paraleliza)
xvfb-run -a npm run test:e2e            # sem display (CI), após `npm run build`
```

Envars de controle do stub (lidas pelo main em modo E2E): `E2E_GATE` (`blocked|invalid|offline|ready`),
`E2E_KEYS=invalid`, `E2E_NETWORK=offline`, `E2E_WORKSPACE_ROOT` (raiz dos workspaces). Detalhes em
`tests/e2e/README.md`.

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
│  │  └─ localStt/ + localTts/ STT Nemotron (utility process asr-engine) e TTS Piper
│  ├─ preload/index.ts         contextBridge → expõe window.api
│  └─ preload/api-schema.ts    createExposedApi (puro) + tipagem ApiSchema
├─ shared/ipc-contract.ts      CONTRATO único de canais e tipos (congelado)
├─ src/                        renderer React
│  ├─ views/                   Settings / Aula (LessonView) / Desafio (ChallengeView)
│  ├─ components/  editor, terminal (xterm), CodeMirror, voice (MicButton/SpeakButton)
│  └─ lib/                     lógica pura + apiBridge (porta única para window.api)
└─ tests/                      ~550+ testes (node:test, sem jsdom) + tests/e2e (Playwright)
```

Três alvos de build (electron-vite): `main` (inclui os processos `llm-engine` e `asr-engine`), `preload` e
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
soltas nem renomear canais. Grupos: `settings:*`, `keys:*`, `pi:*`, `localAi:*`, `study:*`,
`stt:*` (voz/transcrição), `localTts:*` (voz/síntese), `keys:startup-status` (gate).

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