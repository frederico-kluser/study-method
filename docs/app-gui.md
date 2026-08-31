# App GUI Electron — Manual pt-BR e Arquitetura Técnica

Este documento é o complemento do `app/README.md` (que mostra *o que é e como rodar*). Aqui:
o **manual do usuário** (fluxo ponta a ponta) e a **arquitetura técnica** da GUI —
processos, fiação IPC, segurança, contratos e o mapa de ondas. Tudo abaixo se refere à pasta
`app/` do repositório (raiz da app Electron).

> Peça principal por domínio:
> - Fluxo de produto, chaves, envs, run/dev → `app/README.md`
> - Manual do usuário, arquitetura, contratos, decisões e limitações → **este documento**
> - Contrato de canais e tipos congelados → `app/shared/ipc-contract.ts`
> - Prompt da **logo** p/ o Nano Banana 2 (fal.ai) → `docs/nano-banana-2-logo-prompt.md`

---

## 1. Manual do usuário (fluxo ponta a ponta)

### 1.1 Visão geral

O tutor study-method ensina **através de código executável**: você digita um **assunto**, o
app gera uma **aula** (com pesquisa e fonte), e dentro dela materializa **desafios
validados por teste**. Você resolve o desafio no **editor**, roda os **testes
determinísticos**, e recebe um **feedback** do **pi coding agent** (DeepSeek) sobre a sua
solução.

### 1.2 Primeiros passos

1. **Rode** (`cwd = app/`): `npm ci && npm run dev` — ou, da raiz do repositório,
   `./install.sh` (instala tudo) e `./run.sh` (sobe a janela).
2. **Configurações** (ícone de engrenagem):
   - Aba **Chaves**: cole `DEEPSEEK_API_KEY` e `BRAVE_API_KEY`. O app valida a chave digitada
     antes de salvar (ícone de status verde/vermelho).
   - Aba **LLM local** (opcional): `Detectar hardware` → a lista recomenda um quant → baixe e
     **ative**; depois selecione **Modelo local** em "Provedor de feedback do desafio". Com o
     modelo ativo, o app usa o modelo local como **avaliador do feedback** do Desafio (sem
     depender do DeepSeek); sem modelo ativo, o feedback usa o DeepSeek.
3. **Primeiro uso:** pós-startup-gate (app liberado) o **quick tour** pode oferecer o tutorial
   (overlay com spotlight + modal). Você pode Concluir/Skip — não reaparece (persistido). Se
   pular, reabra pelo botão de ajuda se houver (ver §2.11).
4. **Tema:** o toggle na AppBar cicla **claro ↔ escuro ↔ sistema** (default segue o SO);
   a escolha fica salva em `localStorage['theme-mode']` (ver §2.9).

### 1.3 Aula (aba Aula)

- Digite um **assunto** (ex.: "closures em JavaScript") e clique em gerar. O
  payload aceita o assunto como string **ou** objeto `{ subject, language?, goal?,
  domain? }` — o `domain` explícito (`'math'` | `'programming'`) vem da Home;
  ausente, o backend resolve por heurística (default `'programming'`).
- Progresso por fases (barra/mensagens): `research` → `authoring` →
  `materializing` → `validating`. Durante a fase `research`, um **checklist de
  pesquisa ao vivo** (canal `study:research-progress`) mostra as sub-perguntas e
  queries por rodada (spinner → ✓ com nº de resultados / ✗ com erro); sem
  chave Brave ou com chave rejeitada a geração é **abortada** com mensagem
  clara. O checklist é aditivo: sem o canal (backend antigo/E2E), a barra de
  fases continua soberana.
- O resultado é a aula curta (markdown) + uma lista de **desafios aprovados**
  (programação) ou um **exercício de matemática** (domínio math). Clique num
  desafio para abrir a aba **Desafio** com ele pré-selecionado. Com
  `pendingLessonId` (vindo da aba **Trilha**), a aula persistida é **aberta por
  id** (`study:get-lesson-by-id`) em vez de gerada.

**Resposta digitada e veredito.** Toda aula tem um input de resposta. O ramo é
decidido pela aula atual:

- **Matemática** (`exercise.kind === 'math'`) — verificação **por execução, sem
  LLM** (`study:check-math-answer`): o main **re-computa** o esperado da
  `mathLib` a partir de `(family, seed)` e compara com o que você digitou.
  Correto → veredito verde e aula marcada concluída; errado → mostra o
  **esperado só após a 1ª tentativa errada**; malformado (não é número
  reconhecível) → mensagem de formato. Cada resposta registra uma tentativa.
- **Interpretação** (sem exercício) — juiz com LLM (`study:judge-answer`):
  DeepSeek primeiro, fallback para o modelo local; devolve veredito
  `correct`/`partial`/`incorrect` + feedback pt-BR específico (nunca elogio
  vazio). `ok:false` é erro de serviço — **nunca** um veredito inventado.

**Regra de avanço.** O veredito é o ponto terminal: `correct` marca a aula
concluída (local + persistência, veredito permanece visível); `partial`/
`incorrect` deixam veredito + feedback visíveis com o escape **"Avançar mesmo
assim"**; o avanço para a próxima aula é **sempre do botão primário**
("Continuar" / "Gerar nova aula"). A `LessonView` publica o estado da sessão
(assunto/fase/status) no `SessionStateProvider` — o quadro do shell e a Home
leem; uma guarda de identidade (token por processo) descarta continuamentos de
gerações antigas. Contrato completo:
[`docs/14-respostas-nunca-repetir.md`](14-respostas-nunca-repetir.md).

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

**Estrelas e cronômetro (requisito do dono, onda R7-1).** Cada desafio começa com
**3 estrelas** e um cronômetro regressivo; o limite é derivado da dificuldade —
`T = 90s + difficulty × 60s` (dificuldade 1..5 → 2min30s a 6min30s; sem
dificuldade exposta, fallback de 5 min). Causas de perda (cada uma no máximo 1×,
saldo nunca abaixo de 0): a janela perdeu o foco (`blur`/`visibilitychange`),
o tempo esgotou antes de concluir, o teste determinístico falhou, e o
**decaimento por velocidade** — ≥ 60% do limite custa 1 estrela, ≥ 85% custa
outra. Passar nos testes dispara uma **rajada curta de confete** que respeita
`prefers-reduced-motion` (desliga a animação) e anuncia o resultado em
`role="status"`; **sem** "Parabéns!" ritualizado (o feedback específico do
provedor é o que vale). Lógica pura em `src/lib/challengeStars.ts` /
`src/lib/confetti.ts`.

**Nunca-repetir.** Eventos terminais do desafio marcam **uma tentativa** via
`study:mark-challenge-attempt`: passou nos testes → `passed` (com estrelas e
duração), tempo esgotado → `timeout`, trocar de desafio sem concluir →
`abandoned` (captura antes da troca). O primeiro teste falho **nunca** marca. O
registro é **otimista** (a UI marca antes do invoke): uma falha transitória de
IPC pode perder um registro na sessão e o desafio reaparece uma vez — limitação
documentada. Após cada mark, a lista é re-buscada: **desafios tentados somem
da seleção** (filtro por slug no `list-challenges`; matemática usa o slug
sintético `math:<subjectSlug>:<family>:<seed>`). Trocar de desafio sem concluir
conta como `abandoned` e o desafio também some da lista — é o design.

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
│   ├─ janela única 1280×800 (min 900×600), claro/escuro (SO)   │
│   ├─ registerIpcHandlers / Register*Handlers (IPC)           │
│   ├─ services: settingsStore, PiAgent, deepseek*, runner,     │
│   │   lesson, brave, research, embeddedLlm                   │
│   └─ utility processes: llm-engine (node-llama-cpp),         │
│       asr-engine (sherpa-onnx STT OOVP)                      │
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
│  OnboardingHost (tutorial) · ThemeToggleButton                │
│  Editor (CodeMirror/Dracula) · Terminal (xterm/Dracula)       │
│  apiBridge · themeModeState                                   │
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
| `listChallenges({setupRoot?})` | `study:list-challenges` | `ChallengeInfo[]` (plano) | usa `lastSetupRoot` se `setupRoot` ausente; **exclui desafios já tentados** (nunca-repetir, por slug) |
| `generateLesson(subject \| {subject,language?,goal?,domain?})` | `study:generate-lesson` | `{ lesson, rejected, lessonId?, subjectId? }` | payload objeto (onda 3/5); + push `lesson-progress` (fases) e `research-progress` (checklist ao vivo) |
| `listTopics()` | `study:list-topics` | `SubjectSummary[]` | matérias persistidas com `domain` e contagens (Home/Trilha) |
| `listLessonsBySubject({subjectSlug})` | `study:list-lessons-by-subject` | `LessonSummary[]` | aula resumida por matéria |
| `getLessonById({lessonId})` | `study:get-lesson-by-id` | `GetLessonByIdResult` | `{ lesson, exercise, domain, subjectSlug, challenge }` — reabre lição persistida (Trilha → Aula) |
| `markChallengeAttempt({subjectId?,subjectSlug?,challengeId,verdict,stars?,durationMs?})` | `study:mark-challenge-attempt` | `MarkChallengeAttemptResult` | uma tentativa por evento terminal; `verdict` `passed\|failed\|timeout\|abandoned`; subject resolvido ou upsert sob demanda |
| `checkMathAnswer({family,seed,answerText})` | `study:check-math-answer` | `MathAnswerCheckResult` | **sem LLM**: main re-computa o esperado da mathLib e compara |
| `judgeAnswer({lessonId?,answerText,context})` | `study:judge-answer` | `JudgeAnswerOutcome` | LLM (deepseek → modelo local); `ok:false` = erro de serviço |
| `onResearchProgress(cb)` | push `study:research-progress` | `ResearchProgressEvent` | eventos `research:*` (plan/query-start/query-done/round-*/done); `errorKind` `brave-missing`/`brave-key-invalid` aborta a geração |
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

As trilhas pré-definidas (rodada 8) têm grupo de canais **próprio e aditivo** —
`TRACK_CHANNELS` (→ `window.api.track.*`) — ver §2.13.

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

### 2.6 Voz local — painel de voz (STT/TTS) e contrato

Tudo on-device, no processo **main**; os utilitários do renderer ficam em
`src/components/voice/` e o hook `src/hooks/useMicSTT.ts`. Nenhum dos dois componentes
está montado numa view ainda — **a onda fecha com eles prontos para a UI plugar**; abaixo, o
contrato de like para montar um painel de voz.

**Canais** (`shared/ipc-contract.ts`):

| Grupo | Caminho (UI) | Canal | O que faz |
|---|---|---|---|
| STT | `stt.streamStart({locale, sessionId})` | `stt:stream-start` | abre UMA sessão (resolvendo o hint de língua por locale) |
| STT | `stt.streamChunk({sessionId, samples})` | `stt:stream-chunk` | frame PCM 16 kHz mono (Float32Array ≤ 48000 amostras) |
| STT | `stt.streamStop(sessionId)` | `stt:stream-stop` | fecha a sessão → `{ text }` final |
| STT | `stt.streamCancel(sessionId)` | `stt:stream-cancel` | abandona a sessão |
| STT | `stt.onStreamPartial(ev)` | push `stt:stream-partial` | parcial CUMULATIVO `{sessionId, text, isFinal}` |
| TTS | `localTts.list()` | `localTts:list` | catálogo de modelos Piper + status |
| TTS | `localTts.generate({requestId, modelId, text, speed, provider:'local'})` | `localTts:generate` | devolve `{ audioBase64, format:'wav', sampleRate }` |
| TTS | `localTts.getPreference()` / `setPreference()` | `localTts:get/set-preference` | preferência persistida no settingsStore (`localTtsPreference`) |

**Montar num botão de STT — `MicButton` (`src/components/voice/MicButton.tsx`):**

```tsx
<MicButton
  locale="pt-BR"
  onTranscribed={(text) => setDraft(text)} // texto final ao parar
  onError={(err) => toast(err)}
/>
```

`MicButton` usa `useMicSTT(locale)` e cuida de todo o ciclo: pede o microfone, abre o
AudioContext, resampleia para 16 kHz mono, streama chunks e fecha. **Segurança de feedback:** o
hook conecta o source a um `GainNode` com **gain 0** (o mic **nunca** sai no alto-falante), e
abre a `stream-start` **antes** de conectar/streamar (nenhum frame é descartado). O hook expõe
`{ transcribing, partial, error, start, stop, cancel }` para quem quiser controlar direto.

**Montar num `SpeakButton` (`src/components/voice/SpeakButton.tsx`)** — para ler texto em voz
alta (TTS Piper): chamar `localTts.generate({ modelId, text, provider: 'local' })` e montar o
resultado num `<audio src="data:audio/wav;base64,...">`. O modelId usa a preferência salva
(`localTts.getPreference`) com fallback para um modelo embutido do catálogo pt-BR/en.

> **Modelos embutidos no installer:** STT em `resources/stt-models/<modelId>`; TTS em
> `resources/tts-models/<modelId>` + engine `resources/tts-engine/<platform>-<arch>/` +
> `resources/espeak-ng-data`. Env overrides para dev/CI: `STUDY_METHOD_STT_MIRROR_BASE`,
> `STUDY_METHOD_TTS_MIRROR_BASE`, `STUDY_METHOD_TTS_ENGINE_BIN`.

### 2.7 Startup-gate

`startup-handlers.ts` registra o canal aditivo `keys:startup-status` (não substitui o
`keys:*` original). A decisão é a função pura `classifyStartup` (testada): sem `DeepSeek` ou
`Brave` no store → `phase:'blocked'` (sem rede); com ambas → valida as duas com timeout ~8 s
(`401/403` → `blocked`; **ambas** por rede → `offline` com aviso e features online gateadas;
uma por rede → `blocked` apontando a que falhou). O renderer reage em `src/gate/AppGate.tsx`
(SetupView quando bloqueado; banner quando offline).

### 2.8 i18n pt-BR/en

`src/i18n/index.ts`: um namespace `translation`, recursos JSON embutidos no bundle (sem
fs-backend — renderer sandboxed), pt-BR default / en fallback. `initI18n()` inicializa a
**instância default** que o `useTranslation()`/`useTranslation().i18n` enxergam via
`getI18n()` do react-i18next (boot em `src/main.tsx`). Troca via `LanguageSwitcher`
(`changeLanguage`); **persistência** automática no `localStorage` (`app-language`) no evento
`languageChanged`, reaplicada no boot. `tests/i18n-wiring.test.ts` trava essa camada (rode via
`bash tools/t.sh tests`; sem jsdom).

### 2.9 Tema MUI v9 (claro + escuro)

O renderer roda sob `<ThemeProvider theme={theme} defaultMode="system">` + `<CssBaseline>`
(`src/main.tsx`, `src/theme.ts`). Desde a **onda 11** o app suporta os **dois** esquemas
(abandonou o dark-only da onda 7):

- **Dois esquemas completos** — `colorSchemes: { light, dark }`, com `primary`
  custom: `#4f8cff` em **dark**, `#1565c0` (WCAG AA) em **light**.
- **Default segue o SO** — `defaultMode="system"` → `prefers-color-scheme`
  (nativeTheme do Electron espelha o SO no Chromium).
- **Toggle manual** — `ThemeToggleButton` na AppBar cicla `light → dark →
  system → light` via `useColorScheme()` do MUI. O `colorSchemeSelector:
  'class'` aplica `.light`/`.dark` no `<html>` (obrigatório: com o default
  `'media'` o `setMode` não teria efeito). Lógica pura do ciclo em
  `src/components/theme/themeModeState.ts` (testável sem jsdom).
- **Persistência** — `modeStorageKey="theme-mode"` → escolha em
  `localStorage['theme-mode']`, lida no boot e gravada no `setMode`; sem valor
  salvo = `system`.
- **Anti-flash** — `cssVariables: true` resolve o scheme sincronamente antes do
  1º paint, e `primeColorSchemeClass()` (bootstrap de `main.tsx`) aplica a
  classe no `<html>` antes do render. Não usamos `InitColorSchemeScript` (só
  anti-flicker SSR e seria bloqueado pelo CSP `script-src 'self'`).
- Componentes (AppBar/Tabs, Stepper, painéis, Select/Menu) são **Material UI v9**
  com style via `sx`; o CSS custom legado em `src/index.css` foi podado para
  variáveis de tema + placeholders (view Início) + CodeMirror/xterm.

### 2.10 Dracula no editor e terminal

Editor CodeMirror usa o tema real Dracula (`@uiw/codemirror-theme-dracula`); o
terminal xterm pinta a saída com a **mesma** paleta via
`src/lib/draculaTheme.ts` (`DRACULA = { ... }` nomeada + `hexToRgb` e
`truecolorForeground` que emitem SGR `38;2;r;g;b` — o xterm ignora o antigo
`\x1b[<hex>m`). A cor `accent` do terminal = roxo Dracula `#bd93f9`; o
azul/ciano da shell = `#4f8cff`/`#8be9fd` (Dracula cyan). Editor e terminal
permanecem **Dracula escuro fixo** nos dois temas da shell (coerência de
ferramenta de código). O módulo é compartilhado para não duplicar hex mágico.

### 2.11 Tutorial / onboarding (onda 12 + montagem na 13)

Quick tour portado do Ondokai e adaptado ao escopo (4 abas), com **overlay com
spotlight** no alvo (`OnboardingOverlay`) e **modal** de seleção na 1ª execução
(`TutorialSelectionModal`).

- **Host** — `OnboardingHost` (`src/features/onboarding/OnboardingHost.tsx`),
  montado em `src/App.tsx`:

  ```tsx
  const isReady = startup.status?.phase === 'ready';
  <OnboardingHost isReady={isReady} activeView={active} />
  ```

  O host aceita `isReady` (fase do startup-gate — onboarding **nunca** abre antes
  do app liberado, nem em `offline`) e `activeView` (aba ativa, p/ a dica de
  navegação e para pular steps cujo alvo não está no DOM).
- **Estados** (`onboarding.types.ts`): `not_started | in_progress | completed |
  skipped`. Steps são informativos (título/corpo por chave i18n `tutorial.*` +
  alvo `data-onboarding-target`), avançados manualmente por "Continuar" (sem
  auto-avanço). Sem áudio (não portado).
- **Storage** (`services/onboardingStorage.service.ts`, localStorage):
  `study-method-onboarding-v1` (progresso + versão), `-offered-v1` (oferta da 1ª
  execução, one-shot) e `-help-hint-v1` (dica pós-tutorial, reservada). Payloads
  corrompidos são descartados. Testado em `tests/onboardingStorage.test.ts`.
- **Reabertura** — `useOnboardingController().openFromHelp()` reabre do início.
- Cobertura E2E: `tests/e2e/e2e-onboarding.spec.ts` (via `E2E_ONBOARDING=1`).

### 2.12 Janela oculta no E2E e como rodar

O harness E2E roda o **Electron real** sobre o build, mas a janela abre
**oculta e não-focável** para não sobrepor o desktop do usuário nem roubar foco
(onda 13). O main lê `STUDY_METHOD_WINDOW_VISIBLE` (`electron/main/index.ts`):
`'0'` ⇒ `BrowserWindow` nasce com `show:false` + `focusable:false` (o
`ready-to-show` só revela quando visível); env ausente ⇒ janela visível/focável.

```bash
npm run build && npm run test:e2e        # 1 worker (Electron não paraleliza)
xvfb-run -a npm run test:e2e            # sem display (CI), após `npm run build`
```

A fixture `tests/e2e/helpers.ts` injeta `STUDY_METHOD_WINDOW_VISIBLE='0'` por
padrão — as duas formas rodam as **mesmas specs**, sem sobrepor o seu desktop.
Não usamos `--headless` (modo não confirmado para `_electron`). Detalhes em
`tests/e2e/README.md`.

### 2.13 Canais TRACK_CHANNELS (IPC aditivo — trilhas)

Desde a **rodada 8** o aluno não gera mais aula: as trilhas (cursos inteiros) são
criadas pelos **autores da ferramenta via CLI** (§2.14) e chegam prontas — o aluno
abre a trilha, escolhe a aula e estuda num chat direto com a IA. Esse fluxo usa um
grupo de canais **próprio e aditivo** ao contrato congelado de `study:*` (§2.3):
`TRACK_CHANNELS` (→ `window.api.track.*`). O contrato de tipos/canais vive em
`shared/ipc-contract.ts`; aqui fica a leitura de produto.

| Canal (`track:*`) | Observação (leitura de produto) |
|---|---|
| `track:list` | lista as trilhas instaladas (Home / aba Trilha) |
| `track:get` | detalhe da trilha: módulos/aulas com estados `done`/`current`/`pending` e **travamento sequencial** |
| `track:lesson` | abre a aula da trilha (teoria em modo chat) |
| `track:lesson-done` | marca a lição concluída (`track_progress`) |
| `track:tutor-chat` | chat com o tutor: base teórica uma SEÇÃO por vez, dúvidas ancoradas no material, recomenda pré-requisitos da trilha; fallback verbatim quando a LLM falha (conteúdo nunca trava) |
| `track:challenge` | desafio do fluxo track (cronômetro/estrelas); o teste de proficiência **só começa depois de ler o enunciado e clicar em "Começar"** — o cronômetro NÃO roda antes |
| `track:challenge-submit` | envia a solução do desafio do fluxo track |
| `track:challenge-regenerate` | "Gerar novo desafio": a LLM recebe TODOS os desafios que o aluno errou naquela aula e não repete; o novo desafio é validado por execução ANTES de chegar (2 tentativas, nunca desafio ruim) |
| `track:proficiency` | teste de proficiência cobrindo TODOS os módulos (`proficiency.json`); passar destrava a trilha inteira |
| `track:proficiency-submit` | envia o veredito da proficiência |

**Aditivo ao congelado:** `study:mark-challenge-attempt` ganhou **`lessonId`
opcional** (nunca-repetir por aula). O schema do SQLite foi para **v4**:
`track_progress` (lições concluídas), `track_proficiency` (veredito),
`generated_challenges` (regenerados) — migração crash-safe.

### 2.14 CLI de autoria e runner de desafios (ondas R8)

**CLI de autoria (admin) — `app/tools/track-cli.ts`, exposta como
`npm run track -- ...`:** `track:new`, `module:new`, `lesson:new`,
`challenge:new`, `proficiency:new`, `challenge:verify`, `validate`, `list`. O
scaffold nasce válido e `track:validate` verifica TODOS os desafios **por
execução** (a solução passa + o starter falha + igualdade de contagem).

**Runner único de desafios nodejs — `electron/main/services/challengeExec.ts`:**
`node --test` em diretório temporário, **gate de IGUALDADE** (exit 0 sozinho
mente), parse de contagens **imune a ANSI** e binário do `node` **correto dentro
do Electron**.

### 2.15 Resolução de resources/ (cadeia resolveResourcesDir)

`electron/main/services/resourcesDir.ts` centraliza a resolução do diretório
`resources/` do app por **cadeia de candidatos com checagem de existência**:

1. **empacotado** → `process.resourcesPath` (ramo preservado);
2. `app.getAppPath()/resources` (dev);
3. **pai** do dir do entry;
4. **pai-do-pai** (a raiz — caso `out/main`);
5. `cwd/resources` como **último recurso** (nunca âncora: o harness roda com
   `cwd=APP_ROOT` e mascararia).

Nenhum candidato existe → fallback pela raiz derivada de `appPath` (ENOENT
tratado em runtime pelos consumidores — nunca erro de resolução). As partes puras
`normalizeEntryDir`/`resolveAppRoot` (walk-up por package.json) são testáveis por
node:test (`app/tests/resourcesDir.test.ts`, 18 testes).

**Consumidores migrados (4):** `getTracksDir` (`track-handlers`),
`sttLocalService.embeddedModelsPath`, `espeakAssets.getEspeakNgDataDir` e
`ttsEnginePaths.resourceRoot`.

**NÃO migrado (documentado):** `LlmProxyService.resolveEngineEntryPath` resolve
por `__dirname` (o `llm-engine.js` vive AO LADO do bundle em `out/main`) —
correto no modo entry, não usa o padrão quebrado. E
`studyMethodRunner.moduleAppRoot` **resolve errado nos dois modos** mas está
**dormente** (nenhuma view chama `study.run`) — se um dia chamar, precisa do
mesmo tratamento do `resourcesDir`.

### 2.16 Causa raiz do Bug 1 (clone limpo)

Com o main lançado por **entry de arquivo** (`electron out/main/index.js` — o
modo do harness E2E e o jeito mais comum de rodar o buildado), o Electron define
`app.getAppPath()` = **diretório do entry** (`<app>/out/main`), não a raiz do
app → `tracksDir` virava `<app>/out/main/resources/tracks` (**inexistente**; as
trilhas reais vivem em `resources/tracks`) → todo `track:*` respondia
`{ ok:false, ENOENT }` em 1-13ms → a seção Trilhas sumia da Home em silêncio e a
aula ficava inalcançável (o relato do "loader infinito"). Em dev (`electron .`)
`getAppPath()` = raiz → "funciona na minha máquina"; o harness E2E **mascarava**
o bug (em `STUDY_METHOD_E2E=1` os handlers de trilha são stubs de `e2eStubs.ts`
que nunca chamam `getTracksDir`). Fix em §2.15; spec de regressão falsificável
`app/tests/e2e/e2e-clean-clone.spec.ts` com `requireBuild()` (sem build, FALHA
com mensagem clara — nunca skip silencioso).

### 2.17 Bootstrap e instalação (clone idempotente)

- **`tools/check-env.sh` (novo)** — fonte única e sourceável (bash 3.2/macOS e
  Linux) com:
  - `require_node_ge_22_13` — node/npm presentes e Node ≥ **22.13**
    (`node:sqlite` unflagged), com erro claro ANTES de qualquer download;
  - `ensure_app_env_local` — cria `app/.env.local` a partir do example se faltar;
    **nunca sobrescreve**; aviso para preencher `DEEPSEEK_API_KEY`/`BRAVE_API_KEY`;
  - `app_node_modules_ok` — prova de instalação COMPLETA = marcador
    `node_modules/.install-ok` (não basta a pasta existir).
- **`run.sh`** — sequência garantida: checa node → garante `.env.local` → sem o
  marcador, roda `install.sh` (única parte com download; a primeira vez pode
  levar minutos) → `exec app/run-dev.sh` (carrega `.env.local` e sobe
  electron-vite, janela visível). **O usuário nunca precisa rodar `./install.sh`
  antes.**
- **`install.sh`** — idempotente: skill só recopia se a origem não está íntegra
  no destino (`src_installed_in`, comparação conteúdo a conteúdo; extras no
  destino não forçam recópia); `npm ci` só sem marcador; **marcador escrito só
  após `npm ci` exit 0** — ci morto no meio (disco lento, queda de rede) deixa a
  pasta pela metade SEM marcador e a próxima execução refaz; fix de bug latente
  `chmod 700 -- dir` → `chmod 700 dir` (no macOS `--` não é aceito e o chmod
  falhava).
- **Testes** `app/tests/runsh-bootstrap.test.ts` (10 casos) — rodam os scripts
  bash REAIS num tmp com **node/npm falsos no PATH** (sem rede, determinístico):
  clone sem node_modules instala tudo e sobe; segunda execução é no-op rápido;
  node velho/ausente → erro claro antes de qualquer npm; npm ci falho → sem
  marcador → refaz e completa; skill com diferença na origem recopia. Smoke real:
  **1 `npm ci` em 3 execuções** (as duas seguintes no-op).

### 2.18 IPC com timeout (anti-spinner — nunca mais loader sem fallback)

- **`src/lib/ipcTimeout.ts` (novo)** — `withTimeout(promise, ms, label)` com
  `IPC_TIMEOUT_MS = 10_000` e `IpcTimeoutError` identificável via
  `isTimeoutError()`; o timer é SEMPRE limpo e a rejeição tardia da chamada
  original é consumida pelo race (sem unhandled rejection).
- **Validação de chaves** — `withFetchTimeout` (AbortController + timer,
  `DEFAULT_VALIDATE_TIMEOUT_MS = 8000`, injetável por opção; `0` desliga) no
  `apiKeyValidator`; o timeout aborta o fetch com reason `timed out after Nms` e
  é classificado como **erro de rede** (`isNetworkError` reconhece
  `/^Network error:/i` e `/timed out/i`) — mensagem "Network error: timed out
  after 8000ms". No renderer (SetupView + KeysPanel), **guarda de 10s com
  settled-flag**: a primeira resposta (erro ou sucesso) encerra o `validating`;
  resposta tardia do IPC NÃO sobrescreve o estado já decidido. String
  `keys.errorTimeout` em pt-BR/en ("Tempo esgotado ao contatar o provedor…").
- **Blindagem dos carregamentos** — LessonView (`loadLesson` extraída com
  timeout + estado de erro + botão **retry**; o `<LinearProgress/>`
  incondicional deixou de ser o único caminho), splash do AppGate (`GateError`
  explícito para timeout de `keys:startup-status` e para rejeição + recheck),
  RoadmapView (`track.get`/`track.list` com timeout, spinner do detalhe sem
  janela branca, retry), TrackChallengePanel (`track:challenge` com timeout +
  retry) e TracksSection da Home (**erro visível com o detalhe real do canal** +
  retry — nunca mais `return null` silencioso; vazio legítimo continua `null`).
- **ResearchChecklist removido** — componente morto (nenhuma view o importava);
  `lesson.research.*` removidas do i18n; `lesson.phase.research` **preservada**.
  `LocalAiPanel` documentado **não-tocado** (progresso de download de modelo
  local tem semântica própria).
- Spec E2E `app/tests/e2e/e2e-setup-timeout.spec.ts` (3 testes): pendura o
  handler do `ipcMain` por ~20s e prova a guarda de 10s do renderer — erro claro
  em ~11s (< 15s), spinner some, botão reabilitado (retry).

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
| Onda 4 | Segurança (CSP/sandbox), alinhamento do autor ao naming por slug, verificação fim-a-fim de assinaturas IPC, docs | `app/index.html` (CSP), `main/index.ts` (sandbox), `deepseekLessonAuthor.ts` |
| Onda 6 | **startup-gate** (`keys:startup-status`, setup bloqueado / offline) + **i18n pt-BR/en** + persistência | `startup-handlers.ts`, `src/i18n/index.ts` |
| Onda 7 | **Shell MUI v9 dark** — AppBar+Tabs, Settings/Aula/Desafio migrados de CSS custom para MUI `sx` | `src/theme.ts`, `src/App.tsx`, `src/views/*` |
| Onda 8 | **Voz local** — STT Nemotron (`stt:*`) + TTS Piper (`localTts:*`), pref persistida no settingsStore | `stt-handlers.ts`, `localTts-handlers.ts`, `src/components/voice/*` |
| Onda 9 | **E2E Playwright** (`STUDY_METHOD_E2E=1` + stubs) — 8 specs verdes | `playwright.config.ts`, `electron/main/services/e2eStubs.ts` |
| Onda 11 | **Tema claro+escuro com toggle** (`ThemeToggleButton`, `defaultMode=system` segue SO, localStorage `theme-mode`, anti-flash, primary `#1565c0` light) + **Dracula** no editor e terminal (`draculaTheme.ts`, SGR truecolor no xterm) | `src/theme.ts`, `src/main.tsx`, `src/lib/draculaTheme.ts`, `src/components/theme/*` |
| Onda 12 | **Tutorial/onboarding** portado do Ondokai (OnboardingHost, overlay+modal, steps, storage localStorage, posicionamento, i18n `tutorial.*`; host montado na Onda 13) | `src/features/onboarding/*` |
| Onda 13 | **Janela oculta/não-focável no E2E** (`STUDY_METHOD_WINDOW_VISIBLE='0'`) + monta `OnboardingHost` (isReady+activeView) + +3 specs E2E (tema/onboarding/dracula) | `electron/main/index.ts`, `src/App.tsx`, `tests/e2e/*` |
| Onda R7-1 | **3 estrelas + cronômetro no desafio** (perda por blur/timeout/erro/decaimento por velocidade; `T = 90s + difficulty×60s`, fallback 300s) + **confete em PASS** (reduced-motion, `role="status"`, sem "Parabéns!") + **schema v2** (`subjects.domain`, `challenge_attempts`) com migração crash-safe | `src/lib/challengeStars.ts`, `src/lib/confetti.ts`, `electron/main/db/schema.ts` |
| Onda R7-2 | **Pesquisa Brave ao vivo por query** (`study:research-progress`: plan/query-*/round-*/done; planner LLM com fallback heurístico; cap 2 rodadas; chave ausente/inválida aborta) + **aba Trilha** (Iniciante 1–2 / Intermediário 3 / Avançado 4–5, done/current/pending, abre lição por id) | `researchPlanner.ts`, `src/views/RoadmapView/`, `src/lib/roadmap.ts`, `src/lib/levels.ts` |
| Onda R7-3 | **Resposta digitada**: ramo math (`study:check-math-answer` SEM LLM — main re-computa da mathLib; esperado só após 1ª tentativa errada; 4 famílias, seed determinístico por tentativa) + ramo interpretação (`study:judge-answer` LLM deepseek→local; correct/partial/incorrect; `ok:false` = erro de serviço) + **checklist de pesquisa na UI** | `mathLib.ts`, `answerJudge.ts`, `src/lib/answerFlow.ts`, `src/lib/researchProgress.ts`, `ResearchChecklist.tsx` |
| Onda R7-4 | **Persistência + nunca-repetir**: matérias/lições/tentativas no SQLite (schema **v3** `exercise_json`); `study:mark-challenge-attempt` (verdict/stars/duração; slug ou `math:<subjectSlug>:<family>:<seed>`); `list-challenges` filtra tentados; **Home por domínio** (seções Programação/Matemática + diálogo de troca com aula em andamento) | `electron/main/db/repo.ts`, `study-handlers.ts`, `lessonOrchestrator.ts`, `src/lib/homeSetup.ts`, `src/lib/pendingSubject.ts` |
| Onda R7-5 | **Aula por id + sessão global**: `study:get-lesson-by-id` com `subjectSlug`/`challenge` (reabertura da Trilha); `publishSession` da LessonView no shell/Home; guarda de identidade de geração (token por processo) | `study-handlers.ts`, `src/lib/sessionState.ts`, `src/lib/lessonGenerationGuard.ts`, `LessonView` |

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
9. **SQLite sem addon nativo (`node:sqlite` no Node; sql.js no Electron)**: o SQL interno usa
   `node:sqlite` (`DatabaseSync`) no Node do sistema (testes/CLI) e, no processo main do
   Electron, o adaptador **sql.js (WASM)** — o Node embutido do Electron NÃO compila
   `node:sqlite` (medido no 37.2.4: `require('node:sqlite')` lança
   `ERR_UNKNOWN_BUILTIN_MODULE` e o app caía no boot). A seleção é em runtime em
   `electron/main/db/connection.ts` (`openSqlite`), e o adaptador (`sqljsAdapter.ts`) expõe a
   mesma superfície (`exec`/`prepare().get/run/all`/`close`) com persistência a cada commit;
   `db.transaction(fn)()` vira o helper `withTransaction` (BEGIN/COMMIT/ROLLBACK) em
   `electron/main/db/repo.ts`. Sem addon nativo: não há `.node` compilado, não há ABI a casar,
   não há pós-install de compilação — o arquivo do banco é SQLite padrão e abre nos dois
   runtimes; `npm ci` basta (sem rebuild, sem alias, sem script de ciclo de vida).
