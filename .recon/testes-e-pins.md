# Reconhecimento — testes automatizados e pins de conteúdo (study-method)

> Objetivo: preparar (a) adicionar testes de **revisão cumulativa** aos desafios de TODOS os
> cursos e (b) acrescentar uma **camada de validação nova** ao motor. Este relatório mapeia o
> que os testes de hoje pinam (contagens, textos, nº de testes por desafio) e onde recalibrar.
> Reconhecimento somente-leitura; nenhum código foi alterado.
> Data da varredura: 2026-09 (HEAD do workspace `app/`, `tests/`, `evals/`, `tools/`).

---

## 1. Inventário dos suites

### 1.1 Suíte principal do app — `app/tests/` (node:test + tsx)

**Como correr:** `cd app && npm test` → `bash tools/t.sh tests`
(`app/package.json:16`; runner em `app/tools/t.sh` — coleta recursiva `*.test.ts`/`*.test.tsx`
com `find`, tem **empty-glob guard**: nenhum arquivo casado = exit 1, nunca verde silencioso).
Um arquivo só: `bash tools/t.sh tests/<arquivo>.test.ts`. Compor: `npm test -- tests/foo*`
(na prática: `bash tools/t.sh tests/engineBarra.test.ts`).
Escala: **343** `*.test.ts` em `app/tests/` + 4 em `app/tests/ui/` + 1 em `app/tests/tools/`
+ **27** specs Playwright em `app/tests/e2e/`. Fixtures de conteúdo sintético em
`app/tests/fixtures/tracks/` (8 trilhas mínimas: `trilha-minima`, `trilha-python-minima`,
`trilha-python-valor`, `trilha-python-nao-medivel`, `trilha-c-minima`, `trilha-rust-minima`,
`trilha-typescript-minima`, `trilha-corpus`).

Agrupamentos (pelo que cobrem):

| Grupo | Exemplos | Cobre | Depende de conteúdo real? |
|---|---|---|---|
| Motor/engine (fases F0–F12, schemas, provas, audit, barra) | `engineExecProofs`, `cx-phases-*`, `engineFreeze`, `engineAudit2Laco`, `engineSchemas`, `cx-langqual-*` | lógica da engine com fixtures em memória | Não (fixtures próprias) |
| **Conteúdo real do disco** | `trilhaCIntegrada`, `pythonTrilhaRoda`, `rustTrilhaRoda`, `trackTypes.optionRationales`, `quizOptionOrder`, `quizOptionLeak`, `lessonQuizKeyCoherence`, `lessonTypewriterReadingSpeed`, `typewriterSegments`, `engineBarra`, `engineBarraQuiz`, `moduleMastery`, `challengeReviewInjection`, `engineCadeia`, `engineLangRegistry` | o produto contra `app/resources/tracks/*` | **SIM — pins detalhados na §2** |
| CLIs de autoria/engine | `trackCli`, `cx-cli-track-cli`, `cx-cli-engine-modos`, `cx-cli-engine-medicao`, `engineRepairCli`, `engineCoverageCli`, `engineFiacaoCli`, `engineLimiteMedicaoCli` | `npm run track` / `npm run engine` (spawn real, fixtures temporárias; nunca tocam `resources/tracks` real, exceto cópia com slug único + limpeza em `trackCli.test.ts`/`cx-cli-track-cli.test.ts`) | Não |
| UI/React (render estático) | `quizOverlayRender`, `quizOptionLeak`, `typewriterSegments`, `chatBubbleWidth`, `cx-views-*`, `tests/ui/*` | componentes via `react-dom/server` | Algumas usam `lesson.json` real (§2) |
| Estado/domínio puro | `trackLessonState`, `lessonProgress`, `moduleMastery`, `sessionState`, `roadmapUnlockDiff`, `navigationGuard` | regras puras | `moduleMastery` e `challengeReviewInjection` usam 1 caso real |
| DB/IPC | `db/repo.test.ts`, `db/persistence.test.ts`, `ipc/study-persist.test.ts`, `track-handlers`, `study-handlers` | sql.js + handlers | Não |
| Integração opt-in | `lesson-orchestrator.integration.test.ts` | orquestrador com juiz FAKE (sem LLM), gated por `STUDY_METHOD_INTEGRATION_TESTS=1` (`lesson-orchestrator.integration.test.ts:33-40`) | Não |
| Meta (testam o runner) | `tests/tools/t-sh-collect.test.ts` | coleta/empty-glob do `t.sh` | Não |

### 1.2 E2E Playwright — `app/tests/e2e/` (`app/playwright.config.ts`)

**Como correr (mock; o README fala em "18 specs mock" — há 27 `*.spec.ts` no disco,
incluindo os 3 `real-*` e `more-flows`/`perf-settings`):**
```bash
cd app && npm run build && npm run test:e2e     # ou: xvfb-run -a npm run test:e2e
```
- App Electron REAL sobre o build (`out/main`), renderer de produção, modo stub
  `STUDY_METHOD_E2E=1` (`app/electron/main/services/e2eStubs.ts`): **sem rede, sem LLM,
  sem GPU** — determinístico. 1 worker, timeout 90 s, retries 0
  (`app/playwright.config.ts:23-30`).
- `tests/e2e/README.md` documenta as envars de stub (`E2E_GATE`, `E2E_KEYS`, `E2E_NETWORK`,
  `E2E_QUIZ_AI`, `E2E_ONBOARDING`…).

**Como correr (real, com rede):**
```bash
export OPENROUTER_API_KEY=sk-or-... ; export BRAVE_API_KEY=BSAq...
cd app && npm run build && npm run test:e2e:real   # app/tools/run-e2e-real.sh
```
Roda só `real-lesson.spec.ts`, `real-didactics.spec.ts`, `real-search.spec.ts`
(`app/tools/run-e2e-real.sh:32-35`); sem chaves o script falha com mensagem
(`run-e2e-real.sh:20-30`) — a suíte mock continua verde.

**Dependência de conteúdo:** `e2e-clean-clone.spec.ts` abre a trilha/aula REAL do disco
(pins na §2). As demais specs usam stubs/fixture própria (`cadeadoFixture.ts`,
`quizFixture.ts`, `e2eStubs.ts` com `expectedTestCount: 3/1/3` em `e2eStubs.ts:615,634,678`).

### 1.3 Gates da raiz — `tests/` (bash; contrato da SKILL `study-method`, NÃO do app)

**Como correr** (a partir da raiz do repo):
```bash
tests/gate-build.sh        # sintaxe e forma (bash -n, py_compile, JSON, permissões, CRLF)
tests/gate-lint.sh         # qualidade de texto (frontmatter, links, tabelas, newline)
tests/validate.sh          # 43 invariantes de docs/00-contratos.md (I-01..I-43) + G-*
tests/smoke.sh             # integração ponta a ponta (setup/sessões/desafio/gráfico)
tests/spec-conformance.sh  # BUILD_SPEC.md × repositório (SC-01..SC-08)
tests/gate-bash32.sh       # anti-regressão bash 3.2
```
Determinísticos, offline (o `smoke.sh` sintetiza respostas; o modelo não entra no laço —
`tests/smoke.sh:14`). Varrem `skills/study-method/`, `docs/`, schemas do contrato —
**não leem `app/resources/tracks`** (confirmado por grep: só `tools/check-trilha-c.mjs` e
`tools/estado-dos-cursos.sh` tocam conteúdo de curso).

### 1.4 Evals — `evals/`

**Como correr:** `bash evals/run-evals.sh [--strict] [--only E-01,E-04] [--list]`
(`evals/run-evals.sh:21`). Verificador **estático** de coerência da skill `study-method`
com `docs/00-contratos.md` (checks E-01..E-07+; casos em `evals/cases/`, roteamento em
`evals/routing/`, transcrições gravadas em `evals/transcripts/`). Offline; a parte
comportamental é ENUMERADA como manual. **Não depende do conteúdo dos cursos.**

### 1.5 Tools de conteúdo — `tools/` (raiz) e `app/tools/`

| Comando | O que faz | Rede/chave? |
|---|---|---|
| `bash tools/estado-dos-cursos.sh [slug]` | os 6 gates por curso: `audit`, `barra`, `requirements`, `coverage`, `track:validate` (4 provas), `convergir` (+ `check-trilha-c.mjs` para c-iniciante) (`tools/estado-dos-cursos.sh:20-27`) | Não (spawna toolchains) |
| `node tools/check-trilha-c.mjs [doc] [--so-doc] [--disco DIR]` | contrato docs/20 × disco (D1–D7; ESTRUTURA = 7 módulos com 21+12+13+15+21+16+17 = **115 aulas**, `tools/check-trilha-c.mjs:30`) | Não |
| `cd app && npm run track -- <comando>` | CLI de autoria (`app/tools/track-cli.ts:102-117`) | `track:challenge:context` exige `OPENROUTER_API_KEY`; resto não |
| `cd app && npm run engine -- <comando>` | engine F0–F12 + medição (`app/tools/track-engine/cli.ts:170-470`) | `generate`/`repair --aplicar`/`gap --aplicar` exigem chave; `audit`/`barra`/`coverage`/`requirements`/`discrimination`/`revise`/`reorder`/`convergir`/`lint-schemas` são zero-LLM |
| `bash tools/check-env.sh`, `tools/emulador-ambiente.sh` | ambiente/instalação (Node ≥ 22.13; emulador Docker de toolchain) | Docker para o emulador |

---

## 2. Lista exata de PINS que reagem a mudanças em challenge.json / lesson.json / testes dos desafios

### 2.1 Pins de CONTAGEM e ESTRUTURA de curso (quebram se nº de aulas/módulos mudar)

| Pin | Valor | Onde | Onde ajustar |
|---|---|---|---|
| c-iniciante: nº de módulos | `7` | `app/tests/trilhaCIntegrada.test.ts:290` | atualizar literal |
| c-iniciante: nº de aulas | `115` (`total`) | `app/tests/trilhaCIntegrada.test.ts:295` | idem |
| c-iniciante: nº de `lesson.json` no disco | `115` | `app/tests/trilhaCIntegrada.test.ts:297` e `:339` (bijeção disco × module.json) | idem |
| c-iniciante: bijeção por módulo vs docs/20 | contagens por célula da tabela "7 módulos, 115 aulas" do `docs/20-trilha-c.md` | `app/tests/trilhaCIntegrada.test.ts:609-611` (docs/20 é fixture READ-ONLY) | docs/20 **e** teste juntos |
| c-iniciante: ESTRUTURA por módulo | `21+12+13+15+21+16+17 = 115` | `tools/check-trilha-c.mjs:30` | ferramenta + docs/20 |
| c-iniciante: aula 1 | slug `primeira-tela`, `prerequisites: []` | `app/tests/trilhaCIntegrada.test.ts:361-362` | literal |
| c-iniciante: recorte "aulas completas" | `primeira-tela`, `o-esqueleto` (M1 `a-tela`) | `app/tests/trilhaCIntegrada.test.ts:80-83` | literal |
| c-iniciante: recorte "desafios com prova real" | `a-tela/primeira-tela/tres-linhas`, `a-tela/o-esqueleto/sua-primeira-janela` | `app/tests/trilhaCIntegrada.test.ts:87-90` | literal |
| python-iniciante: nº mínimo de aulas | `>= 45` (a-tela 20 + decisao 12 + repeticao 13), todas com **0 issues** em `validateLessonSource` | `app/tests/trackTypes.optionRationales.test.ts:164-177` | literal + validação |
| python-iniciante: módulo legado `a-tela` | exatamente `20` aulas e **SEM** `optionRationales` | `app/tests/trackTypes.optionRationales.test.ts:199-212` | literal (só se o módulo mudar) |
| python-iniciante: nº mínimo de afirmações de quiz | `>= 119` (a-tela 44 + decisao 36 + repeticao 39) | `app/tests/quizOptionOrder.test.ts:133` | literal |
| python-iniciante: barra pedagógica | `0` erros A17–A23, `0` blocos não-parseiam, `>= 100` aulas medidas | `app/tests/engineBarra.test.ts:538-540` | limiar |
| python-iniciante: nº de afirmações da aula 1 (`a-primeira-linha`) | exatamente `3`, todas com `sectionId`, `2` na mesma seção | `app/tests/lessonQuizKeyCoherence.test.ts:119-125`; `app/tests/quizOneAtATime.test.ts:154` ("o gate segue vendo as duas") | literal |
| Track title/aula 1 na UI real | `"Python Iniciante: do primeiro print ao programa completo"`; aula `"A primeira linha"` | `app/tests/e2e/e2e-clean-clone.spec.ts:298-320` | literal (o próprio comentário diz "trocar os literais preserva o que o teste prova") |
| Slugs pinados de desafios reais | `python-iniciante/a-tela/a-primeira-linha/escreva-oi` (`pythonTrilhaRoda.test.ts:57-70`); `rust-iniciante/a-tela/a-primeira-funcao/devolva-dois` (`rustTrilhaRoda.test.ts:65-68`); `python-iniciante/modules/a-tela/challenges/rachando-a-conta` (`moduleMastery.test.ts:323`); aula real p/ revisão (`challengeReviewInjection.test.ts:32,86`) | — | literals de slug |
| Tags de código reais da teoria | `js` (148), `javascript` (20), `http` (1), `json` (1) — todas classificáveis | `app/tests/engineLangRegistry.test.ts:173-177` | se surgir tag nova na teoria, adicionar ao teste |
| DEFAULT de `challenge.language` | `'nodejs'` ("as 112 trilhas do disco") | `app/tests/engineLangRegistry.test.ts:152-155` | só muda com migração de conteúdo |

### 2.2 Pins de NÚMERO DE TESTES POR DESAFIO (`expectedTestCount`)

O gate central é a **dupla-igualdade** `declarado (AST) == executado (relatório) ==
expectedTestCount` (`app/electron/main/engine/exec/proofsCore.ts:334-368`;
`app/electron/main/services/challengeExec.ts:368,489-498`). Portanto **cada desafio que
ganhar testes novos tem de ter `expectedTestCount` bumpado no MESMO commit**, senão reprova:

- `npm run track -- track:validate <slug>` inteiro (exit 1);
- `npm run track -- track:challenge:verify …` e o submit do aluno
  (`pythonTrilhaRoda.test.ts:113` "solução → passed:true"; `rustTrilhaRoda.test.ts:137`);
- as 4 provas reais de `trilhaCIntegrada.test.ts:496-522` + a **tripla igualdade**
  `expectedTestCount == nº de blocos SM_TEST == countDeclared` (`:533-550`);
- `npm run engine -- coverage|requirements|discrimination|revise` (todos spawnam o runner).

Pins literais de contagem de testes de desafio específico:

| Pin | Valor | Onde | Onde ajustar |
|---|---|---|---|
| `rachando-a-conta` (desafio de módulo python) | `1` teste, chamado `test_imprime_o_recibo_completo`, cobertura derivada `[]` | `app/tests/moduleMastery.test.ts:318-335` | **quebra se este desafio ganhar testes** — reajustar `evidence.length` e o nome |
| Fixtures de trilha (`app/tests/fixtures/tracks/**/challenge.json`) | `expectedTestCount` 1–2 por desafio | ex.: `trilha-rust-minima/.../dobre-o-numero/challenge.json:16` | só se as fixtures mudarem |
| Stubs E2E | `expectedTestCount: 3/1/3` | `app/electron/main/services/e2eStubs.ts:615,634,678` | se a UI de teste chip mudar |
| Cap do regenerador LLM | `expectedTestCount` inteiro em `1..20` | `app/electron/main/services/challengeRegenerator.ts:319` | se desafios passarem a ter >20 testes |
| Cap do validador de conteúdo | `expectedTestCount` em `1..100` | `app/electron/main/content/trackTypes.ts:576` | só se estourar 100 |
| Draft da aula (autoria LLM) | `expectedTestCount == scenarios.length` (default deriva dos cenários) | `app/electron/main/services/lessonAuthor.ts:137,186,379-380`; teste `app/tests/lessonAuthor.test.ts:333` | testes de revisão sem cenário correspondente reprovariam o draft — alinhar `scenarios[]` |

### 2.3 Pins de QUIZ (ordem de opções, rationales, formato)

| Pin | Valor | Onde | Onde ajustar |
|---|---|---|---|
| `answerIndex` sempre `0` no corpus (histórico: 44/44) — a permutação de exibição de-vaza | distribuição medida nas chaves REAIS; `dist[0] < REAL.length`; teto de repetição entre gerações | `app/tests/quizOptionOrder.test.ts:120-135,201,255` | testes novos de quiz entram na medição automaticamente (varre `lesson.json`); mudanças bruscas de distribuição podem derrubar os tetos |
| Cada afirmação real tem `4` opções | `assert.equal(a.options.length, 4)` por afirmação real | `app/tests/quizOptionOrder.test.ts:125` | se algum quiz novo tiver ≠4 opções |
| Vazamento por COMPRIMENTO (A24) | nenhuma aula vaza em TODAS as afirmações nos 3 cursos (medições de referência: python 58/320=18%, c 36/138=26%, rust 173/235=73% — cabeçalho `engineBarraQuiz.test.ts:8-12`) | `app/tests/engineBarraQuiz.test.ts:242,252,257` | quiz novos com correta sempre a mais longa reprova |
| `optionRationales` | opcional; se presente, **1 por opção**; no `AssertionDraftSchema` da engine: ausente→`[]` ou **EXATAMENTE 4** | `app/tests/trackTypes.optionRationales.test.ts:148-212`; `app/tests/quizContract.test.ts:141-146,264-270` | se novas afirmações declararem rationales, manter 4/4 |
| `optionRationales > 0` em conteúdo real (contrato novo vivo) | `declarados > 0` | `app/tests/trackTypes.optionRationales.test.ts:196` | — |
| Vazamento por POSIÇÃO na tela | nenhuma pílula nasce distinguível; `answerIndex` só no `onSelect` | `app/tests/quizOptionLeak.test.ts:292-301,345-350` | — (renderiza `lesson.json` real) |
| Chave do quiz `sectionId::assertionId` | aula real com 3 assertions / 2 na mesma seção | `app/tests/lessonQuizKeyCoherence.test.ts:119-125` | se a-primeira-linha mudar de quiz |
| Prompt de quiz remedial não herda viés de posição | `"answerIndex": <posição sorteada>` | `app/tests/quizRemediation.test.ts:712-730` | — |

### 2.4 Pins de TEXTO/VELOCIDADE da teoria (quebram se lesson.json ganhar texto novo)

| Pin | Valor | Onde | Onde ajustar |
|---|---|---|---|
| Velocidade da teoria | `TYPEWRITER_TPS.theory = 7` (28 chars/s) | `app/tests/lessonTypewriterReadingSpeed.test.ts:118-133` | — |
| Teto de paciência | **nenhuma seção de nenhuma trilha** > `21 s` (varre TODOS os `lesson.json`) | `app/tests/lessonTypewriterReadingSpeed.test.ts:175-191` | seção nova longa demais reprova |
| Seção mais longa da aula 1 | entre `14 s` e `21 s` | `app/tests/lessonTypewriterReadingSpeed.test.ts:160-169` | literal de faixa |
| Cortes ofensores de markdown cru | `565` cortes, `41` ofensores (ANTIGO), `45` crases/asteriscos, fence em `394`, `206`/`169`/`4` — "SE A AULA MUDAR, RE-MEÇA" (comentário no próprio teste) | `app/tests/typewriterSegments.test.ts:455-501` | **remeça e atualize os números** (e os 3 cabeçalhos de `src/` que os citam) |
| Aula 1 tem blocos ```` ```c``` ```` etc. | recortes por aula completa | `app/tests/trilhaCIntegrada.test.ts:446-451` | — |

### 2.5 Pins de COERÊNCIA docs × código (afetados por camada nova de validação)

- `app/tests/engineDocsCoerencia.test.ts:112-152` — todo gate citado em `docs/16` existe como
  comando/teste; todo `npm run <script>` citado em docs/16 existe em `app/package.json`;
  caminhos citados em docs/16 e research/07 existem no disco. **Uma camada nova de validação
  citada em docs/16 sem comando/teste dedicado reprova aqui.**
- `tests/spec-conformance.sh` (SC-01..SC-08) — BUILD_SPEC.md × repo (se a camada nova for
  transcrita no BUILD_SPEC).
- `app/tests/cx-phases-schemas-artifacts.test.ts:195-246,567+` — INV-04 (ordem EXATA de campos
  no shape) e INV-05 (inventário de campos opcionais de TODO o `SCHEMA_REGISTRY`, 14 schemas,
  pela régua do lint real `encontrarCamposOpcionais`). Ver §5(b).

### 2.6 O pin que MORREU (não assustar)

`PIN_PLACAR` = 717 violações · 112 desafios · 249 lacunas (trilha `nodejs-do-zero`) **já não
existe**: a trilha foi apagada e o `tests/engineAuditPlacar.test.ts` saiu junto. Hoje os
números `717/112/249/118` em `app/tests/engineReport.test.ts:398` são fixture ARBITRÁRIA que
prova apenas a derivação do placar (INT-02/P-30). O protocolo P-30 ("placar nunca piora sem
declaração; bump de PIN_PLACAR no mesmo commit") continua em
`app/electron/main/engine/modes/repair.ts:1634-1635` para o futuro.

---

## 3. As "4 provas de execução" por desafio, em massa

As 4 provas (`docs/16-engine-de-trilha.md` §5.4): 1) solução passa; 2) starter falha;
3) contagem bate com `expectedTestCount`; 4) stub vazio falha — núcleo em
`app/electron/main/engine/exec/proofsCore.ts:19-30` (há ainda uma 5ª opcional por linguagem,
`typesCheck`, em `exec/typesCheck.ts`).

**Comandos de massa:**

```bash
# Uma trilha inteira (proficiência + desafios de módulo + desafios de aula):
cd app && npm run track -- track:validate <slug>
#   → imprime "verificado ✓ / NÃO VERIFICADO ✗" por desafio + placar
#     "verificados: N · reprovados: M"; exit 1 se M > 0 (fail-closed desde a onda 2,
#     app/tools/track-cli.ts:621-690)

# Um desafio só (multi-arquivo OK):
cd app && npm run track -- track:challenge:verify <slug> <moduleSlug> <lessonSlug> <challengeSlug>

# TODOS os cursos do disco, com os 6 gates (inclui track:validate):
bash tools/estado-dos-cursos.sh              # raiz do repo
SEM_EXECUCAO=1 bash tools/estado-dos-cursos.sh   # pula os gates que spawnam runner
```

**Nuance importante:** o `track:validate` roda `verifyChallengePair`
(`app/electron/main/services/challengeExec.ts:460-505`) = provas 1–3 (com a igualdade de
contagem embutida na prova 1). A **prova 4 (stub vazio)** só roda no orquestrador
`verifyChallengeProofs` da engine (`exec/proofs.ts`), que é o que `trilhaCIntegrada` usa
in-process. Para as 4 provas completas em massa, hoje: `npm run engine -- coverage <slug>`
(spawna o prover real por desafio) + `track:validate`.

**Há teste automatizado que rode as provas para a trilha INTEIRA real? NÃO.**
- `app/tests/trilhaCIntegrada.test.ts:496-522` — 4 provas REAIS (exec real de C) nos **2**
  desafios de `c-iniciante` (`DESAFIOS_REAIS`, :87-90) + tripla igualdade SM_TEST (:533-550);
- `app/tests/pythonTrilhaRoda.test.ts:288-316` — `track:validate` sobre **fixture de 1
  desafio** copiada para `resources/tracks` (não a trilha real); o caso real é só o desafio
  `escreva-oi` (:101-165);
- `app/tests/rustTrilhaRoda.test.ts:125-190` — idem para `devolva-dois` (exige `cargo`,
  fail-closed sem toolchain :91-96);
- o resto das provas é com fixtures (`engineExecProofs.test.ts`, `cx-phases-exec-proofs.test.ts`
  com ExecFn fake, `engineLangC/engineGatesC/engineMinimalC`).
→ O "provar a trilha inteira" real é o **script** `tools/estado-dos-cursos.sh`, não um teste.

---

## 4. Comandos — tudo do app, e o que é determinístico

### Tudo de uma vez (app)

```bash
cd app
npm run lint                       # tsc --noEmit (2 tsconfigs) — app/package.json:15
npm test                           # 348 arquivos node:test (343+4+1; unit+integração), app/package.json:16
npm run build && npm run test:e2e  # 18 specs Playwright mock (xvfb-run -a se sem display)
npm run test:e2e:real              # 3 specs REAIS — EXIGE chaves (ver abaixo)
```
Extra (não é "teste" mas roda junto nas entregas):
```bash
tests/gate-build.sh && tests/gate-lint.sh && tests/validate.sh && tests/spec-conformance.sh
bash evals/run-evals.sh
bash tools/estado-dos-cursos.sh    # gates de conteúdo dos cursos
```

### Determinísticos — SEM rede, SEM chave de API (todos verdes offline)

| Comando | Observação |
|---|---|
| `cd app && npm test` | 100% offline. **Exige toolchains locais** para alguns arquivos: `python3` (`pythonTrilhaRoda` FALHA sem ele de propósito, `engineLangPython`, `engineDiscriminacao`, `engineBarra` — estes skipam), `cargo` (`rustTrilhaRoda` FALHA sem, `engineLangRust` skipa), `cc`/`clang` (`trilhaCIntegrada` e `engineLangC` skipam com `{ skip: !TEM_C }`), `tsc` (`engineLangTypescript:869` skipa). Fixtures usam `node --test` + tsx. |
| `cd app && npm run lint` | só TypeScript. |
| `cd app && npm run build && npm run test:e2e` | stubs determinísticos (`STUDY_METHOD_E2E=1`); precisa de display ou `xvfb-run`; Electron real. |
| `tests/gate-*.sh`, `tests/validate.sh`, `tests/smoke.sh`, `tests/spec-conformance.sh` | bash puro + python3 stdlib; `STUDY_METHOD_TODAY` fixa para determinismo. |
| `bash evals/run-evals.sh` | estático. |
| `npm run engine -- audit|barra|coverage|requirements|discrimination|revise|reorder|convergir|lint-schemas` e `npm run track -- track:validate|track:challenge:verify` | zero LLM (coverage/requirements/revise spawna runners das linguagens). |
| `bash tools/estado-dos-cursos.sh` | zero LLM; spawna runners. |

### QUE EXIGEM rede/chave de API

| Comando | Exige |
|---|---|
| `cd app && npm run test:e2e:real` | `OPENROUTER_API_KEY` + `BRAVE_API_KEY` (`app/tools/run-e2e-real.sh:20-30`) |
| `npm run track -- track:challenge:context …` | `OPENROUTER_API_KEY` (validação semântica por LLM; os testes cobrem só a RECUSA sem chave: `app/tests/cx-cli-track-cli.test.ts:453-465`, `app/tests/trackCli.test.ts:237-252`) |
| `npm run engine -- generate …`, `repair --aplicar`, `gap --aplicar` | `OPENROUTER_API_KEY` + `--modelo-revisor` |
| `lesson-orchestrator.integration.test.ts` | gated por `STUDY_METHOD_INTEGRATION_TESTS=1`; usa juiz FAKE (sem rede) mas requer a skill instalada (`STUDY_METHOD_SKILL_DIR`) |
| `tools/emulador-ambiente.sh` | Docker (ubuntu/arch) |

Nenhum teste da suíte principal faz chamada de rede real — os caminhos LLM são testados com
clientes fake/injetados (`engineCallLlm`, `lessonOrchestrator`, `quizRemediation`).

---

## 5. Riscos — o que parte em cada cenário

### (a) Cada desafio ganha +2..4 testes novos (revisão cumulativa)

1. **`expectedTestCount` tem de subir em cada `challenge.json`** — é igualdade estrita
   (`proofsCore.ts:346-368`). Sem bump: `track:validate` (inteiros cursos) exit 1, submit do
   aluno reprova, `pythonTrilhaRoda`/`rustTrilhaRoda`/`trilhaCIntegrada` reprovam. COM bump:
   a maioria dos testes é flexível (usa o valor do JSON).
2. **`app/tests/moduleMastery.test.ts:318-335` QUEBRA de certeza** se `rachando-a-conta`
   ganhar testes: fixa `evidence.length === 1` e o nome `test_imprime_o_recibo_completo`.
3. **Bijection `requirements[]` × testes**: `npm run engine -- requirements <slug>` reprova
   (exit 1) teste sem requirement e vice-versa; `trilhaCIntegrada.test.ts:562+` exige
   `requirements[].id == slug do SM_TEST` (C). Testes novos de revisão exigem
   `requirements[]` novos no `challenge.json` (e, no draft da autoria, `scenarios[]` novos —
   `lessonAuthor.ts:186` cobra `expectedTestCount == scenarios.length`).
4. **Orçamento cumulativo**: testes de revisão que cobrem aulas anteriores passam a exigir
   átomos de fora do contexto imediato. O `audit` (A1–A6) e o `coverage` ("LACUNA = teste cobra
   construção que a aula não oferece") podem acusar **LACUNA/ORDEM**; o `revise` marca
   candidato a SPLIT; o `discrimination` (J5) só avisa. Risco real de vermelho em
   `engineBarra.test.ts:538` (python-iniciante com 0 erros) se as regras A20/A21 passarem a
   olhar os testes novos (hoje olham teoria/atoms).
5. **A24 (comprimento do quiz)** e ordem de opções: os testes novos de revisão, se virarem
   quiz, entram nas medições de `quizOptionOrder`/`engineBarraQuiz` — manter 4 opções,
   rationales 4/4 e evitar "correta sempre a mais longa".
6. Caps: `expectedTestCount` ≤ 20 no regenerador LLM (`challengeRegenerator.ts:319`), ≤ 100
   no validador (`trackTypes.ts:576`) — 2–4 testes a mais cabem; mas se um desafio passar de
   20 testes a regeneração por LLM passa a devolver `null` (draft rejeitado).
7. **Não-testes que reagem**: `tools/estado-dos-cursos.sh` e `coverage` spawnam o runner por
   desafio — +2..4 testes × ~200 desafios aumenta o tempo do gate (não o veredito).

### (b) O schema de challenge.json ganha um campo opcional novo

1. **Boa notícia**: o loader NÃO rejeita chaves extra — "nenhum validador rejeita chave extra,
   o loader faz cast (não pick)" (`app/electron/main/content/trackTypes.ts:29`);
   `validateChallengeSource` (`trackTypes.ts:519`) não reprova campo desconhecido. Conteúdo
   existente continua a validar.
2. **Cuidado com os schemas da ENGINE (zod)**: se o campo entrar em `ChallengeDraftSchema`
   (`app/electron/main/engine/schemas/artifactsDrafts.ts:195`) ou em qualquer um dos 14 do
   `SCHEMA_REGISTRY`, os pins INV-04/INV-05 de
   `app/tests/cx-phases-schemas-artifacts.test.ts:195-246,567+` reagem: a régua fixa a
   **posição exata** dos campos (INV-04: `justificativa` antes de `decisão`/`aprovado`) e o
   **inventário de campos opcionais** de toda a árvore. Novo campo opcional ⇒ atualizar o
   inventário e posicionar na ordem certa; `npm run engine -- lint-schemas` é o preflight.
3. `mutantsValidacao.ts:24` lista `'expectedTestCount'` entre campos copiados — se o campo
   novo tiver de viajar nos mutantes/rascunhos, tocar também `minimalTipos.ts`,
   `progressivaDesafio.ts:118`, `f12Materialize.ts:511`, `trackService.ts:615,642`,
   `db/repo.ts:101` (linha SQL de persistência — novo campo não persiste sem migração).
4. Precedente a seguir: `optionRationales` foi um campo aditivo opcional **sem bump de
   `schemaVersion`** (`trackTypes.optionRationales.test.ts:1-30`) — o padrão que os testes
   esperam de campos novos (ausente ⇒ 0 issues).
5. `challengeRegenerator.ts:310-327` faz parse manual do JSON do LLM: campo novo é ignorado
   (não reprova) até ser explicitamente lido.

### (c) A validação de aula ganha uma camada nova que pode reprovar conteúdo existente

Os testes que exigem **0 issues/0 erros sobre o conteúdo real** partem juntos se a camada
nova for fiada no validador existente (ou reprovar o que hoje passa):

| Teste | O que reprova hoje passa |
|---|---|
| `app/tests/trackTypes.optionRationales.test.ts:164-177` | 45 aulas de python-iniciante com `validateLessonSource == []` |
| `app/tests/trilhaCIntegrada.test.ts:314-339,389-424` | bijeção 115 aulas, `validateAssertions == []`, optionRationales 4/4, typewriter 21 s, URLs de fontes |
| `app/tests/engineBarra.test.ts:536-540` | python-iniciante com 0 erro de barra e 0 blocos não-parseiam |
| `app/tests/engineBarraQuiz.test.ts:242-257` | nenhum vazamento de comprimento nos 3 cursos |
| `app/tests/lessonTypewriterReadingSpeed.test.ts:175-191` | nenhuma seção > 21 s em nenhum lesson.json |
| `app/tests/engineCadeia.test.ts` (caso 6) | `track.json` reais resolvem cadeia |
| `app/tests/challengeReviewInjection.test.ts:86-105` | seleção de revisão sobre trilha real (teto 3 itens, só conhecimento anterior) |
| `app/tests/moduleMastery.test.ts:318-335` | caso real parseia |

Estratégias para não partir tudo de uma vez:
- implementar a camada como **gate novo separado** (ex.: comando `npm run engine -- <novo>`)
  com teste próprio, e só depois fiá-la no `validateLessonSource`;
- ou fazer a camada **opt-in** (flag/modo) até o conteúdo existente ser limpo;
- se reprovar conteúdo real de propósito, os números pinados da §2.1/§2.4 (115 aulas, 45 aulas,
  119 afirmações, 565/41 cortes de typewriter) e os literals de slug têm de ser revistos no
  MESMO commit — é exatamente o protocolo P-30 (`repair.ts:1634`) para placares.

---

## 6. Cheatsheet — "onde mexi no conteúdo, o que correr primeiro"

```bash
cd app
# 1. barato e offline (pega a maioria dos pins de conteúdo):
bash tools/t.sh tests/trackTypes.optionRationales.test.ts tests/quizOptionOrder.test.ts \
     tests/lessonQuizKeyCoherence.test.ts tests/lessonTypewriterReadingSpeed.test.ts
# 2. provas de execução por desafio (spawna toolchains):
npm run track -- track:validate <slug>
# 3. gates pedagógicos completos:
npm run engine -- audit <slug> --limite 0 && npm run engine -- barra <slug> --limite 0 \
  && npm run engine -- requirements <slug> && npm run engine -- coverage <slug>
# 4. tudo de uma vez:
npm test && npm run build && npm run test:e2e
# 5. estado de TODOS os cursos (raiz):
bash tools/estado-dos-cursos.sh
```
