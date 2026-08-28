# Relatório da Rodada 10 — clone limpo funciona: trilhas alcançáveis + bootstrap que instala sozinho

Relatório da **décima rodada** de desenvolvimento da GUI Electron do study-method
(`app/`). O usuário reportou que, ao clonar o projeto em outro computador, clicar
em uma aula ficava em **loader infinito que nunca resolve** — e pediu que
`./run.sh` garantisse **sempre** a instalação/configuração do projeto. A rodada
descobriu a causa raiz (diretório das trilhas resolvido para um caminho
inexistente fora do modo dev, mascarado pelo harness E2E), corrigiu-a, blindou
todos os pontos de "loading sem fallback" da UI com timeout + erro visível +
retry, e tornou o bootstrap do clone **idempotente e auto-instalante**
(node/npm checados, `.env.local` criado, `npm ci` garantido pelo `run.sh`).

---

## O que foi feito (ondas R10-1..R10-3)

| Onda | Feature | Onde vive |
|---|---|---|
| 1 | **Diagnóstico com repro REAL** — clone limpo simulado (`--user-data-dir` novo, sem chaves) nos DOIS modos de lançamento; causa raiz PROVADA por medição de IPC e dump de UI; spec de regressão falsificável `e2e-clean-clone` (falha hoje no modo entry, verde após o fix); relatório `docs/relatorio-rodada10-diag.md` | `app/tests/e2e/e2e-clean-clone.spec.ts`, `docs/relatorio-rodada10-diag.md` |
| 2a | **Fix do Bug 1** — `getTracksDir` e os 3 consumidores irmãos de `resources/` migrados para `resolveResourcesDir()`: cadeia de candidatos com checagem de existência (isPackaged → `process.resourcesPath`; appPath; pai; pai-do-pai; cwd como último recurso) — trilhas, STT local, espeak-ng e TTS engine agora resolvem certo no modo buildado lançado por entry | `electron/main/services/resourcesDir.ts` (novo), `index.ts`, `track-handlers.ts`, `localStt/sttLocalService.ts`, `localTts/espeakAssets.ts`, `localTts/ttsEnginePaths.ts` |
| 2b | **Timeout na validação de chaves** — `withFetchTimeout` (AbortController + timer de 8s, injetável) no `apiKeyValidator`; timeout classificado como erro de rede ("Network error: timed out after Nms"); guarda de 10s no SetupView/KeysPanel com settled-flag (resposta tardia não sobrescreve erro); string `keys.errorTimeout` pt-BR/en; spec novo `e2e-setup-timeout` | `electron/main/services/apiKeyValidator.ts`, `src/gate/SetupView.tsx`, `src/views/SettingsView/KeysPanel.tsx`, `app/tests/e2e/e2e-setup-timeout.spec.ts` |
| 2c | **Blindagem anti-spinner** — helper `withTimeout` (10s) + `IpcTimeoutError` blindando TODOS os carregamentos: LessonView (loadLesson extraída com timeout + retry), splash do AppGate (GateError de timeout/rejeição + recheck), RoadmapView (track.get/list com timeout, spinner do detalhe sem janela branca, retry), TrackChallengePanel (timeout + retry) e TracksSection da Home com **erro visível e retry** (nunca mais silêncio); ResearchChecklist morto removido; LocalAiPanel documentado não-tocado | `src/lib/ipcTimeout.ts` (novo), `src/views/LessonView/LessonView.tsx`, `src/gate/AppGate.tsx`, `src/views/RoadmapView/RoadmapView.tsx`, `src/views/ChallengeView/TrackChallengePanel.tsx`, `src/views/placeholders.tsx` |
| 3 | **Bootstrap idempotente** — `run.sh` passa a GARANTIR: node/npm ≥ 22.13 (erro claro antes de qualquer download) → `app/.env.local` (cria do example se faltar, nunca sobrescreve, aviso para preencher chaves) → `npm ci` se faltar o marcador `app/node_modules/.install-ok` → delega para `app/run-dev.sh`; `install.sh` idempotente (skill só recopia se a origem não está íntegra no destino; npm ci só sem marcador; marcador escrito só após `npm ci` exit 0 — ci morto no meio refaz na próxima execução); fix `chmod 700 -- dir` → `chmod 700 dir` (bug latente no macOS); 10 testes com node/npm FALSOS no PATH (sem rede) + smoke real | `run.sh`, `install.sh`, `tools/check-env.sh` (novo), `app/tests/runsh-bootstrap.test.ts` (novo) |
| — | **Integração e documentação** — squash-merge das ondas, limpeza do symlink `app/node_modules` commitado por engano (target absoluto do dev quebraria clones), este relatório consolidado | `docs/relatorio-rodada10.md` |

---

## O problema (relato do usuário)

> "quando clono esse projeto em outro computador e clico em uma aula ele fica num loader infinito que nunca resolve."

Interpretação de trabalho: clone limpo (userData do Electron novo, sem
settingsStore, sem `.env.local`, primeiro boot) → abrir uma aula da trilha →
spinner que não resolve. Pedido adicional: `./run.sh` deve garantir **sempre**
a instalação e configuração do projeto (instalar sozinho no clone).

## Diagnóstico (Onda 1) — resumo

O diagnóstico completo, com metodologia, medições e repro passo a passo, está em
[`docs/relatorio-rodada10-diag.md`](relatorio-rodada10-diag.md). O essencial:

### Bug 1 (PROVADO empiricamente — a quebra real do "outro computador")

- `electron/main/index.ts:202-209`: `getTracksDir` usava `app.getAppPath()` no
  ramo não-empacotado. Quando o main é lançado por **entry de arquivo**
  (`electron out/main/index.js` — o jeito mais comum de rodar o buildado), o
  Electron define `app.getAppPath()` = **diretório do entry** (`<app>/out/main`),
  não a raiz do app → tracksDir = `out/main/resources/tracks` (**inexistente**;
  as trilhas reais vivem em `resources/tracks`) → todo `track:*` respondia
  `{ ok:false, ENOENT }` em 1-13ms → a seção Trilhas da Home **sumia em
  silêncio** e a aula ficava inalcançável.
- Em dev (`electron .`), `getAppPath()` = raiz → caminho correto → "funciona na
  minha máquina", quebra no clone.
- **O harness E2E mascarava o bug**: em `STUDY_METHOD_E2E=1` os handlers de
  trilha são stubs (`e2eStubs.ts`) que nunca chamam `getTracksDir` — a fiação
  real (com o path quebrado) ficava fora do harness.
- **Não há loader infinito literal na abertura de aula no código atual** (as
  chamadas de trilha são disco+SQLite, resolvem em ms) — o relato literal casa
  com o fluxo pré-rodada-8 (geração de aula por LLM ao vivo, já removido da UI).

### O único spinner genuinamente sem timeout que sobrava

- `keys:validate-*` (botão "Validar" do SetupView — **obrigatório no clone
  limpo** — e KeysPanel): fetch puro no `apiKeyValidator`, **sem AbortSignal e
  sem timeout**. Em rede que engole pacotes (VPN/firewall sem RST), o spinner
  gira indefinidamente.

### Lista dos pontos de "loading sem fallback" (para a Onda 2 blindar)

Onda 1 entregou a varredura exaustiva (8 pontos): LessonView (alvo principal),
splash do AppGate, "Validar" do SetupView, KeysPanel, RoadmapView,
TrackChallengePanel, ResearchChecklist (morto — sem chamador) e LocalAiPanel
(semântica própria de download, fora de escopo).

---

## Correções (Onda 2)

### 2a — trilhas alcançáveis no modo buildado

- **`electron/main/services/resourcesDir.ts` (novo)** — `resolveResourcesDir()`
  por **cadeia de candidatos** com checagem de existência do diretório
  `resources/`: (a) empacotado → `process.resourcesPath` (ramo preservado); (b)
  `app.getAppPath()/resources` (dev); (c) pai do entry dir; (d) pai-do-pai (a
  raiz — caso `out/main`); (e) `cwd/resources` como **último recurso** (nunca
  âncora: o harness roda com cwd=APP_ROOT e mascararia). Nenhum candidato existe
  → fallback pela raiz derivada de `appPath` (ENOENT tratado em runtime, nunca
  erro de resolução). Parte pura de `normalizeEntryDir`/`resolveAppRoot`
  (walk-up por package.json) testável por node:test.
- **Migrados 4 consumidores**: `getTracksDir` (track-handlers), 
  `sttLocalService.embeddedModelsPath`, `espeakAssets.getEspeakNgDataDir` e
  `ttsEnginePaths.resourceRoot`.
- **NÃO migrado (documentado)**: `LlmProxyService.resolveEngineEntryPath`
  resolve por `__dirname` (o llm-engine.js vive AO LADO do bundle em
  `out/main`) — correto no modo entry, não usa o padrão quebrado;
  `studyMethodRunner.moduleAppRoot` resolve errado nos dois modos mas está
  **dormente** (nenhuma view chama study.run).
- **Spec `e2e-clean-clone` endurecido**: pré-condição `requireBuild()` (sem
  build fresco, os testes FALHAM com mensagem clara "rode npm run build" —
  **nunca skip silencioso/verde falso**); 3 testes: (1) primeiro boot sem chaves
  → SetupView rápido; (2/3) gate ready → Home → trilha → **aula abre**.

### 2b — timeout na validação de chaves

- **`apiKeyValidator`**: `withFetchTimeout` (AbortController + timer,
  `DEFAULT_VALIDATE_TIMEOUT_MS = 8000`, injetável por opção; `0` desliga). O
  timeout aborta o fetch com reason `timed out after Nms` e é classificado como
  **erro de rede** (`isNetworkError` reconhece `/^Network error:/i` e
  `/timed out/i`) — mensagem "Network error: timed out after 8000ms".
- **Renderer (SetupView + KeysPanel)**: guarda de **10s** com **settled-flag**
  — a primeira resposta (erro ou sucesso) encerra o `validating`; uma resposta
  tardia do IPC NÃO sobrescreve o estado já decidido. String `keys.errorTimeout`
  em pt-BR/en ("Tempo esgotado ao contatar o provedor…").
- **Spec novo `e2e-setup-timeout` (3 testes)**: intercepta `keys:validate-*` no
  `ipcMain` do app via `app.evaluate` pendurando a resposta por ~20s (o harness
  stub responde imediato — a interceptação prova o contrato real da UI): erro
  claro aparece em ~11s (< 15s), spinner some, botão reabilitado (retry);
  segundo caso: chave inválida com resposta rápida → mensagem clara sem espera;
  terceiro: pendurada no KeysPanel das Settings.

### 2c — blindagem anti-spinner (nunca mais loader sem fallback)

- **`src/lib/ipcTimeout.ts` (novo)** — `withTimeout(promise, ms, label)` com
  `IPC_TIMEOUT_MS = 10_000`, `IpcTimeoutError` identificável via
  `isTimeoutError()`; o timer é SEMPRE limpo e a rejeição tardia da chamada
  original é consumida pelo race (sem unhandled rejection).
- **LessonView** — `loadLesson` extraída e blindada com timeout + estado de
  erro + botão **retry** (o `<LinearProgress/>` incondicional de
  `lesson===null` deixou de ser o único caminho).
- **AppGate (splash)** — `GateError` explícito para timeout (`keys:startup-status`
  que não resolve) e para rejeição; botão recheck.
- **RoadmapView** — `track.get` e `track.list` com timeout; o spinner do detalhe
  não deixa mais janela branca; retry.
- **TrackChallengePanel** — `track:challenge` com timeout + retry.
- **TracksSection (Home, `placeholders.tsx`)** — falha de `track:list` agora
  mostra **erro visível com o detalhe real do canal** + retry (nunca mais
  `return null` silencioso); vazio legítimo continua `null`.
- **ResearchChecklist removido** — componente morto (nenhuma view o importava);
  `lesson.research.*` removidas do i18n; `lesson.phase.research` **preservada**.
- **LocalAiPanel documentado não-tocado** — progresso de download de modelo
  local tem semântica própria (download), fora do escopo do relato.

## Correções (Onda 3) — bootstrap idempotente

- **`tools/check-env.sh` (novo)** — fonte única e sourceável (bash 3.2/macOS e
  Linux) com: `require_node_ge_22_13` (node/npm presentes e Node ≥ 22.13 —
  `node:sqlite` unflagged — com erro claro ANTES de qualquer download),
  `ensure_app_env_local` (cria `app/.env.local` do example se faltar; **nunca
  sobrescreve**; aviso para preencher `DEEPSEEK_API_KEY`/`BRAVE_API_KEY`) e
  `app_node_modules_ok` (prova de instalação COMPLETA = marcador
  `node_modules/.install-ok`, não só a pasta existir).
- **`run.sh`** — sequência garantida: checa node → garante `.env.local` → se
  sem marcador, roda `install.sh` (única parte com download; primeira vez pode
  levar minutos) → `exec app/run-dev.sh` (carrega `.env.local` e sobe
  electron-vite, janela visível). **O usuário nunca precisa rodar `./install.sh`
  antes.**
- **`install.sh`** — idempotente: skill só recopia se a origem não está íntegra
  no destino (`src_installed_in`, comparação conteúdo a conteúdo; extras no
  destino não forçam recópia); `npm ci` só sem marcador; **marcador escrito só
  após `npm ci` exit 0** — ci morto no meio (disco lento, queda de rede) deixa a
  pasta pela metade SEM marcador e a próxima execução refaz; fix do bug latente
  `chmod 700 -- dir` → `chmod 700 dir` (no macOS, `--` não é aceito e o chmod
  falhava).
- **Testes `app/tests/runsh-bootstrap.test.ts` (10 casos)** — rodam os scripts
  bash REAIS copiados para um tmp com **node/npm FALSOS no PATH** (sem rede,
  determinístico): clone sem node_modules instala tudo e sobe; segunda execução
  é no-op rápido; node velho/ausente → erro claro antes de qualquer npm; npm ci
  falho → sem marcador → próxima execução refaz e completa; run.sh com
  node_modules pela metade refaz antes de subir; skill com diferença na origem
  recopia. Smoke real adicional: **1 `npm ci` em 3 execuções** (as duas
  seguintes no-op).

---

## Integração

Squash-merge na branch principal da rodada, nesta ordem:

| Commit | Conteúdo |
|---|---|
| `19ea305` | Onda 1 diag: causa raiz + spec `e2e-clean-clone` falsificável + `relatorio-rodada10-diag.md` |
| `28c315d` | Fix de lint das specs e2e (padrão RendererDom) + remoção das sondas de instrumentação |
| `2d8946c` | Onda 2a: `resourcesDir.ts` + migração dos 4 consumidores + clean-clone verde (3/3 nos dois modos) |
| `7fe7774` | Onda 2b: timeout na validação de chaves + spec `e2e-setup-timeout` |
| `6f5b9dc` | Onda 2c: blindagem anti-spinner + ResearchChecklist removido |
| `23ff31d` | Onda 3: bootstrap idempotente (run.sh/install.sh/check-env.sh + 10 testes) |
| `6e3c00f` | Limpeza de integração: remove o symlink `app/node_modules` commitado por engano no 23ff31d (target **absoluto do dev** — quebraria qualquer clone) |

Nota de integração: o acidente do symlink em `app/node_modules` (apontando para
o node_modules absoluto da máquina do dev) destruiu/danificou o node_modules
local durante a limpeza; ele foi **reconstruído com `npm ci`** antes do gate
final.

---

## Gates e verificação

Gates intermediários (reportados pelos agentes de cada onda, com a suíte
unitária rodando naquele momento):

| Onda | Unit da onda | Suíte completa | E2E |
|---|---|---|---|
| 2a | `resourcesDir.test.ts` **18/18** | 1696-1699 pass / 0 fail | `e2e-clean-clone` **3/3** no modo entry E no modo `CLEAN_CLONE_LAUNCH_MODE=dot` |
| 2b | `apiKeyValidatorTimeout.test.ts` **8/8** | (ver gate final) | `e2e-setup-timeout` **3/3** (erro em ~11s < 15s; spinner some; botão reabilitado) |
| 2c | `ipcTimeout.test.ts` **8/8** | **1697** pass / 0 fail | — |
| Onda 3 | `runsh-bootstrap.test.ts` **10/10** | (ver gate final) | — (sem rede, node/npm falsos) |

**Gate final** (suíte unitária ~1700 testes / 0 fail + `e2e-clean-clone` 3/3 nos
dois modos + `e2e-setup-timeout` 3/3 + lint verde + build verde): roda na raiz
do projeto após a reconstrução do node_modules — **gate final em BASE_DIR
(a confirmar no COMMIT-FINAL)**.

Ressalva metodológica: a suíte unitária varia levemente entre execuções
(1696/1697/1699 pass reportados em momentos diferentes — os 2-3 testes de
diferença correspondem à contagem dos arquivos de teste adicionados ao longo
das ondas; todas as execuções com 0 fail).

---

## Como o usuário verifica

1. `git clone <repo>` em outro computador (sem instalar nada antes).
2. `./run.sh` → instala sozinho (checa node, cria `.env.local`, `npm ci` na
   primeira vez) e sobe o app com a janela visível.
3. Na Home, a seção **Trilhas aparece** (também no modo buildado lançado por
   entry) → clica na aula → **teoria na hora**, sem loader infinito.
4. Sem chaves configuradas → SetupView com botão **"Validar"** que falha em
   **≤10s** com mensagem clara ("Tempo esgotado ao contatar o provedor…") e
   botão reabilitado para tentar de novo — nunca mais spinner eterno.
5. Qualquer falha de carregamento de trilha/aula agora mostra **erro visível
   com retry**, nunca silêncio nem spinner preso.
6. Rodar `./run.sh` de novo é rápido: com tudo instalado, nada é refeito
   (idempotência).

---

## Pendências

- **Gate final em BASE_DIR (a confirmar no COMMIT-FINAL)** — a suíte completa
  e os specs e2e precisam rodar por último na raiz, com o node_modules
  reconstruído (ver §Gates).
- `studyMethodRunner.moduleAppRoot` continua dormente e resolve errado nos dois
  modos — documentado no handoff; se um dia uma view chamar `study.run`, precisa
  do mesmo tratamento do `resourcesDir`.
- Sem chaves reais no ambiente de CI, o caminho de validação com rede real
  continua coberto pelos `real-*` specs existentes quando o dev exporta as
  chaves (pré-existente).

## Arquivos tocados (principais)

- `app/electron/main/services/resourcesDir.ts` — **novo**: resolução robusta de
  `resources/` por cadeia de candidatos (`resolveResourcesDir`,
  `normalizeEntryDir`, `resolveAppRoot`).
- `app/electron/main/index.ts`, `app/electron/main/ipc/track-handlers.ts` —
  `getTracksDir` via `resolveResourcesDir`.
- `app/electron/main/services/localStt/sttLocalService.ts`,
  `app/electron/main/services/localTts/espeakAssets.ts`,
  `app/electron/main/services/localTts/ttsEnginePaths.ts` — migrados para o
  mesmo helper.
- `app/electron/main/services/apiKeyValidator.ts` — `withFetchTimeout`
  (AbortController, 8s injetável) + classificação de timeout como erro de rede.
- `app/src/lib/ipcTimeout.ts` — **novo**: `withTimeout` 10s + `IpcTimeoutError`.
- `app/src/views/LessonView/LessonView.tsx`, `app/src/gate/AppGate.tsx`,
  `app/src/views/RoadmapView/RoadmapView.tsx`,
  `app/src/views/ChallengeView/TrackChallengePanel.tsx`,
  `app/src/views/placeholders.tsx` — timeout + erro visível + retry.
- `app/src/gate/SetupView.tsx`, `app/src/views/SettingsView/KeysPanel.tsx` —
  guarda de 10s com settled-flag.
- `app/src/views/LessonView/ResearchChecklist.tsx` — removido (morto);
  `lesson.research.*` removidas do i18n (pt-BR/en); `lesson.phase.research`
  preservada.
- `run.sh`, `install.sh`, `tools/check-env.sh` — bootstrap idempotente que
  garante instalação/configuração (node ≥ 22.13, `.env.local`, `npm ci` com
  marcador `.install-ok`).
- Testes novos: `app/tests/resourcesDir.test.ts` (18), 
  `app/tests/apiKeyValidatorTimeout.test.ts` (8), `app/tests/ipcTimeout.test.ts`
  (8), `app/tests/runsh-bootstrap.test.ts` (10), `app/tests/e2e/e2e-clean-clone.spec.ts`
  (3, com `requireBuild`), `app/tests/e2e/e2e-setup-timeout.spec.ts` (3).
- Docs: `docs/relatorio-rodada10-diag.md` (diagnóstico completo), este relatório
  consolidado.
