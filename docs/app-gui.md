# App GUI Electron — Manual pt-BR e Arquitetura Técnica

Este documento é o complemento do `app/README.md` (que mostra *o que é e como rodar*). Aqui:
o **manual do usuário** (fluxo ponta a ponta) e a **arquitetura técnica** da GUI —
processos, fiação IPC, segurança, contratos e o mapa de ondas. Tudo abaixo se refere à pasta
`app/` do repositório (raiz da app Electron).

> Peça principal por domínio:
> - Fluxo de produto, chaves, envs, run/dev → `app/README.md`
> - Manual do usuário, arquitetura, contratos, decisões e limitações → **este documento**
> - Contrato de canais e tipos congelados → `app/shared/ipc-contract.ts`

---

## 1. Manual do usuário (fluxo ponta a ponta)

### 1.1 Visão geral

O tutor study-method ensina **através de código executável**: você digita um **assunto**, o
app gera uma **aula** (com pesquisa e fonte), e dentro dela materializa **desafios
validados por teste**. Você resolve o desafio no **editor**, roda os **testes
determinísticos**, e recebe um **feedback** do **pi coding agent** (DeepSeek) sobre a sua
solução.

### 1.2 Primeiros passos

1. **Rode** (`cwd = app/`): `npm ci && npm run dev`.
2. **Configurações** (ícone de engrenagem):
   - Aba **Chaves**: cole `DEEPSEEK_API_KEY` e `BRAVE_API_KEY`. O app valida a chave digitada
     antes de salvar (ícone de status verde/vermelho).
   - Aba **LLM local** (opcional): `Detectar hardware` → a lista recomenda um quant → baixe e
     **ative**; depois selecione **Modelo local** em "Provedor de feedback do desafio". Com o
     modelo ativo, o app usa o modelo local como **avaliador do feedback** do Desafio (sem
     depender do DeepSeek); sem modelo ativo, o feedback usa o DeepSeek.

### 1.3 Aula (aba Aula)

- Digite um **assunto** (ex.: "closures em JavaScript") e clique em gerar.
- Progresso por fases (barra/mensagens): `research` → `authoring` → `materializing` →
  `validating`.
- O resultado é um arquivo markdown da aula + uma lista de **desafios aprovados**.
- Clique num desafio para abrir a aba **Desafio** com ele pré-selecionado.

### 1.4 Desafio (aba Desafio)

Layout em três painéis:

- **Enunciado** (esquerda): o `README.md` do desafio renderizado (markdown), com a tabela de
  cenários que o teste cobre.
- **Editor** (centro): árvore de arquivos do workspace (FileExplorer) + abas de edição
  (CodeMirror). Somente o arquivo stub é o que você edita; salve com **Ctrl+S**/**⌘S** ou o
  botão **Salvar**.
- **Testes + Feedback** (direita/inferior):

Botão **Testar resposta** — duas fases:

1. **Determinística**: roda os testes do desafio no workspace. Bandeira **PASS/FAIL**, linha
   `TESTS_RUN / ESPERADOS` e a saída real no terminal (xterm).
2. **Feedback (provedor decidido)**: o app monta um prompt com o seu código + a saída
   determinística e o envia ao provedor selecionado em Configurações → LLM local → "Provedor
   de feedback":
   - **DeepSeek (nuvem)** (default): o coding agent `pi` avalia, streamando em tempo real
     (texto / raciocínio / ferramentas) num painel colapsável (`Raciocínio…`). Mostra o
     veredito ao final.
   - **Modelo local**: a inferência roda localmente em **um bloco único (sem streaming)** e o
     painel de feedback mostra o texto do modelo. Se o chat local falhar, o app mostra o erro
     com a dica de ativar o modelo em Configurações ou trocar o provedor para DeepSeek (não
     re-dispara o pi automaticamente).

O painel de feedback informa qual provedor executou a última avaliação (badge "modelo local" /
"DeepSeek").

Botão **Abortar** interrompe a execução do pi (guarda o `sessionId` no `pi:abort`); não se
aplica ao bloco único do modelo local.

### 1.5 Verificação de desafio — regras rígidas

Um desafio só chega à aula se passar a validação (DES-1/DES-4):
a referência e as **alternativas** (`reference_alt_*`) passam; o `empty_stub` falha nos
testes; a contagem de cenários bate; e o **juiz LLM** aprova a qualidade (veredito
`approved`). `not_run` ≠ sucesso e vem com motivos honestos (ex.: protocolo malformado,
juiz ausente, apply esgotado).

> **Naming de função derivado do slug.** A função principal que o desafio pede é derivada do
> **slug** do desafio (a semente do `challenge-new.sh`): `slug` kebab → `snake_case` em
> python/javascript/rust/c, e `PascalCase` em go (função exportada). Ex.: slug
> `fatorial-recursivo` → `fatorial_recursivo` (python) / `FatorialRecursivo` (go). O autor de
> aulas instrui o modelo a usar exatamente esse nome no stub/teste/referência; quando o
> modelo desvia, o harness (que copia a semente canônica) quebra na importação e o desafio é
> **rejeitado na validação**. Um desafio em que `empty_stub`/`reference_alt_*` ficam da
> semente é **intencional**: são os vetores que o passo 1/3 da validação usa.

---

## 2. Arquitetura técnica

### 2.1 Processos

```
┌────────────────────────── PRODUÇÃO ──────────────────────────┐
│  Electron main  (processo principal)                          │
│   ├─ janela única 1280×800 (min 900×600), tema escuro         │
│   ├─ registerIpcHandlers / Register*Handlers (IPC)           │
│   ├─ services: settingsStore, PiAgent, deepseek*, runner,     │
│   │   lesson, brave, research, embeddedLlm                   │
│   └─ utility process: llm-engine (node-llama-cpp)            │
└───────────────┬───────────────────────────────────────────────┘
                │ contextBridge (window.api) — contextIsolation:true, sandbox:true
┌───────────────▼───────────────────────────────────────────────┐
│  Preload (CJS enxuto, só require('electron'))                 │
│  createExposedApi(ipc) — grupos settings/keys/pi/localAi/study│
└───────────────┬───────────────────────────────────────────────┘
                │ window.api (renderer lê via apiBridge.ts)
┌───────────────▼───────────────────────────────────────────────┐
│  Renderer React (SPA sobre file://)                           │
│  Views: Settings / LessonView / ChallengeView                 │
│  Editor (CodeMirror) · Terminal (xterm) · apiBridge           │
└───────────────────────────────────────────────────────────────┘
```

**Todo tráfego de rede roda no main** (DeepSeek, Pi, Brave, download de modelo local). O
renderer só fala com o main via IPC — o que permite a CSP estrita (abaixo).

### 2.2 Fiação IPC e ordem de registro

`electron/main/main-setup.ts` → `buildMainSetup` registra os handlers na ordem fixa:

1. `registerIpc` (settings:* reais + placeholders de study/pi/localAi)
2. `registerKeys` (keys:*)
3. `registerLocalAi` (localAi:* — via `safeHandle`, substitui placeholder)
4. `registerPi` (pi:* — via `safeHandle`)
5. `registerStudy` (study:* — via `safeHandle`)

`safeHandle` (`ipc/safeHandle.ts`) permite re-registro idempotente (remove+handle) e é usado
por todos os grupos específicos. O contrato de canais/tipos é **único e congelado** em
`shared/ipc-contract.ts`; os grupos (`API_GROUPS`, canais de evento) e a tipagem
`ApiSchema` do preload derivam dele — nunca duplicar strings soltas.

### 2.3 Contrato de canais principais (UI ↔ main)

| Caminho (UI) | Canal (`study:*`) | Handler devolve | Observação |
|---|---|---|---|
| `listChallenges({setupRoot?})` | `study:list-challenges` | `ChallengeInfo[]` (plano) | usa `lastSetupRoot` se `setupRoot` ausente |
| `testAnswer({challengeDir})` | `study:test-answer` | `TestAnswerResult` | + evento `test-answer-event` com `phase: started\|done` |
| `listWorkspaceFiles({workspaceDir})` | `study:list-workspace-files` | `WorkspaceFile[]` (plano) | restrito ao `workspaceDir` (contenção de path) |
| `readWorkspaceFile({workspaceDir,path})` | `study:read-workspace-file` | `string` (conteúdo) | |
| `writeWorkspaceFile({workspaceDir,path,content})` | `study:write-workspace-file` | `{ ok }` | cria dirs aninhados |
| `deleteWorkspaceFile({workspaceDir,path})` | `study:delete-workspace-file` | `{ ok }` | |

| Caminho (UI) | Canal (`pi:*`) | Handler devolve | Observação |
|---|---|---|---|
| `execute({prompt,workingDirectory?,modelConfig,skillSystemPrompt?,additionalContext?})` | `pi:execute` | `PiExecuteResult` | shape inválido NÃO lança (resultado estruturado de erro); streama `pi:stream-event` |
| `abort(sessionId)` | `pi:abort` | `{ ok }` | sem `sessionId` → `{ok:false,error}` |

Os testes `tests/study-wiring.test.ts` provam esse casamento de assinatura (payload exato da
UI → handler), incluindo os retornos planos (`string`, `WorkspaceFile[]`, `ChallengeInfo[]`).

### 2.4 O lesson-orchestrator (cadeia de geração)

`lessonOrchestrator.ts` (no main) orquestra:

```
ASSUNTO → research.plan (Brave) → author ({subject,findings,memory}) → LessonDraft
→ createSetup (slug do assunto) → newSession → createChallenge (por desafio do draft)
→ sobrescreve stub/teste/referência/enunciado nos paths de meta.artifacts.*
→ verifyChallenge (só approved entra em lesson.challenges; not_run tem motivo honesto)
```

O autor (`deepseekLessonAuthor.ts`) valida o `LessonDraft` (estrutura + cenários
example/boundary/error) e agora **instrui o modelo a nomear a função principal pelo slug**
(ver `slugifyToFunctionName` e §1.5). A materialização respeita o layout EXATO da linguagem
(usando os paths que o `challenge-new.sh` gravou em `meta.json.artifacts.*`).

### 2.5 LLM local (embeddedLlm)

`embeddedLlm/`:
- `hardware.ts` (detecta backend/VRAM/CPU) → `recommend.ts` (quant recomendado)
- `modelStore.ts` (lista/baixa/exclui modelos de HF)
- `EmbeddedLlmService.ts` + `LlmProxyService.ts` + `llmEngine.process.ts` (motor)
- `STUDY_METHOD_LLM_IN_PROCESS=1` roda o motor no main (dev); sem ela sobe no utility process
  `llm-engine`.

**Inferência como avaliador do feedback:** o canal `localAi:chat` (`app/shared/ipc-contract.ts`)
executa `engine.chat({modelId, prompt})` — modelo `modelId` explícito ou o **ativo**
(`set-active`) como fallback — e devolve `{text}` em um bloco. O `ChallengeView` usa
`src/lib/feedbackProvider.ts` (`resolveFeedbackProvider`) para decidir entre modelo local e
pi/DeepSeek, e o painel "Provedor de feedback" do Settings (`LocalAiPanel`) persiste
`defaultModelProvider` em `settings:set`. Sem modelo ativo/baixado, o handler devolve
`{success:false, error}` estruturado e o app sugere voltar ao DeepSeek (sem fallback
automático de re-inferência).

---

## 3. Segurança

- **CSP** (`app/index.html`):
  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'
  data:; font-src 'self'; connect-src 'self'`.
  - **`style-src 'unsafe-inline'`** é necessário: o **CodeMirror** e o **xterm** injetam
    estilos via atributo `style` (highlight/gutter, cursor, seleção). Sem ele, editor e
    terminal perdem cor/posicionamento.
  - **Sem `unsafe-eval`**: o CodeMirror é compilado e não usa eval/new Function (a extensão
    de autocomplete está desligada nesta onda).
  - **`connect-src 'self'`** basta porque todo o tráfego de rede (DeepSeek, Pi, Brave,
    download de modelo) roda no **main**, não no renderer.
- **Sandbox**: `sandbox: true` nas `webPreferences` do `BrowserWindow` (`main/index.ts`); o
  preload é um bundle CJS que só `require('electron')` — compatível com o sandbox de preload.
- **`webSecurity: true`** (default) + links externos `http(s)` abrem no navegador do sistema
  (`setWindowOpenHandler`).
- **Workspace FS**: `resolveContainedWorkspacePath` rejeita traversal; nunca se lê/escreve
  fora do `workspaceDir`.

---

## 4. Mapa de ondas / contratos

| Onda | Entregue | Contrato de referência |
|---|---|---|
| PREP | settingsStore persistente; ipc-contract congelado | `shared/ipc-contract.ts` |
| Onda 1 | janela, ciclo de vida, instance-lock, skeleton, theme | `electron/main/index.ts` |
| Onda 1-pi | `pi:*` + `keys:*` (PiAgentService, apiKeyValidator, settings chaves) | `pi-handlers.ts`, `keys-handlers.ts` |
| Onda 2 | runner (createSetup/newSession/createChallenge/verify/testStudentAnswer) | `studyMethodRunner.ts` |
| Onda 3 | lesson-orchestrator, autor DeepSeek, juiz, pesquisa Brave, pesquisa | `lessonOrchestrator.ts`, `deepseekLessonAuthor.ts`, `researchPlanner.ts` |
| Onda 3-ui | Settings, Aula, Desafio/editor + fiação IPC completa (`buildMainSetup`) | `main-setup.ts`, `api-schema.ts` |
| Onda 4 (esta) | Segurança (CSP/sandbox), alinhamento do autor ao naming por slug, verificação fim-a-fim de assinaturas IPC, docs | `app/index.html` (CSP), `main/index.ts` (sandbox), `deepseekLessonAuthor.ts` |

**Contratos congelados (não editar sem atualizar juntos):** `shared/ipc-contract.ts`,
`eletron/preload/*` (FROZEN), `package.json`/lock, `.npmrc`, `electron.vite.config.ts`.

---

## 5. Decisões e limitações conhecidas

1. **`sandbox: true`** mantido após verificação: o `out/preload/index.js` é um bundle CJS de
   3 kB que só faz `require("electron")` (contextBridge/ipcRenderer + api-schema embutido),
   plenamente compatível com o sandbox do preload do Electron. `webSecurity` segue `true`.
2. **`style-src 'unsafe-inline'`**: necessário para CodeMirror/xterm (ver §3). Não
   abrimos `unsafe-eval`.
3. **Naming por slug**: o autor instrui o modelo; se ele desviar, a validação rígida rejeita
   o desafio (a semente canônica `empty_stub`/`reference_alt_*` vem com o nome derivado do
   slug e é o que o harness usa). Conceitos cujo slug não represente a função desejada podem
   cair na verificação rígida.
4. **Persistência da seleção do Desafio** (guardar o último `challengeDir` em `settings:set`)
   não foi implementado: exigiria estender `AppSettings` em `shared/ipc-contract.ts`
   (congelado). O `setupRoot`/`lastSetupRoot` em memória do `study-handlers` já permite que
   `listChallenges`/workspace funcionem durante a sessão, mas a seleção não sobrevive a um
   restart.
5. **Primeiro-run do LLM local** baixa modelo/binários automaticamente (§1.2/§2.5).
6. **Chat local sem streaming**: a inferência do modelo local no feedback dos desafios é um
   **bloco único** (sem deltas, diferente do pi/DeepSeek); modelos grandes podem demorar mais
   e o primeiro uso pode baixar os binários do node-llama-cpp. **Erro de chat local NÃO**
   re-dispara o pi: o app mostra o erro no painel com a dica de ativar o modelo em
   Configurações ou trocar o provedor para DeepSeek.
7. **Verificação de desafio é rígida** (DES-1/DES-4): somente `approved` entra na aula;
   `not_run` tem motivo honesto (JSON do REQUEST malformado, setup não encontrado (exit 3),
   recurso travado (exit 4), apply esgotado, ou juiz ausente).
8. **ApiSchema com alguns métodos `study.*` tipados sem parâmetros** (placeholders da onda
   inicial): o runtime já espera os payloads; o padrão aceito é o **cast local** no renderer.
   A verificação fim-a-fim de assinatura está coberta em `tests/study-wiring.test.ts`.