# Reconhecimento — MODELO DE DADOS de aulas e desafios (`study-method`)

> Objetivo: preparar a extensão do schema com uma declaração de **revisão cumulativa**
> (`cumulativeReview: [{ lesson, atom }]`) no `challenge.json`. Relatório só de leitura;
> nenhum ficheiro de código foi alterado. Caminhos relativos à raiz do repo.
> Data: 2026-02 (sessão de reconhecimento).

---

## 0. Os DOIS mundos de schema (leia primeiro)

Há dois "schemas" distintos e é fácil confundi-los:

| Mundo | Ficheiros | Estilo | O que valida |
|---|---|---|---|
| **PRODUTO** (o conteúdo em `app/resources/tracks/**`) | `app/electron/main/content/trackTypes.ts` | interfaces TS + validadores escritos À MÃO (`validate*Source`); **schema ABERTO** — nada rejeita chave extra | `track.json`, `module.json`, `lesson.json`, `challenge.json`, `proficiency.json` no load |
| **ENGINE** (artefatos internos de autoria F0–F12) | `app/electron/main/engine/schemas/*.ts` | **Zod**, INV-04 (ordem) + INV-05 (tudo obrigatório, nunca `.optional()`) | drafts/relatórios da engine geradora (`ChallengeDraftSchema`, `LessonDraftSchema`, …) |

Regras da casa do mundo ENGINE (`engine/schemas/artifacts.ts:28-45`, `artifactsBase.ts:16-26`):

- **INV-04** (`engine/schemas/fieldOrder.ts:162-204`): justificativa/evidência ANTES de decisão em
  todo shape (lint `lintOrdemCampos`; listas `DECISION_FIELD_NAMES` `fieldOrder.ts:36-57` e
  `JUSTIFICATION_FIELD_NAMES` `fieldOrder.ts:62-71`).
- **INV-05** (`fieldOrder.ts:206-236`): TODO campo obrigatório. Ausência válida = valor vazio
  EXPLÍCITO (`[]`, `''`, `null` em união) materializado com `z.preprocess` — **nunca
  `.optional()` nem `.default()`** (o lint `encontrarCamposOpcionais` rejeita `ZodOptional`,
  `ZodDefault` e união-com-undefined).
- **INV-08**: `schemaVersion` do produto **nunca** é bumpado por campos aditivos — comparado por
  igualdade estrita (`TRACK_SCHEMA_VERSION = 1` em `content/trackTypes.ts:69`; a checagem está em
  `validateChallengeSource` `trackTypes.ts:523`, `validateLessonSource` `:702`, `validateModuleSource`
  `:742`, `validateTrackSource` `:764` e ainda na F12 `phases/f12Materialize.ts:527-534`).
- Campos ADITIVOS no PRODUTO são **opcionais** e nunca invalidam trilhas antigas
  (`trackTypes.ts:28-45` — "o schema é ABERTO — nenhum validador rejeita chave extra, o loader faz
  cast (não pick)").

**Lint de build (INV-04/INV-05, o `lint-schemas`)**: `engine/schemas/fieldOrder.ts`
(`lintSchemasDaEngine:265-270`, fail-closed `garantirSchemasValidos:278-297`), invocado pelo CLI
`app/tools/track-engine/cli.ts:2436-2448` (`npm run engine -- lint-schemas`, exit 2 em violação) e
pela geração (`engine/fiacao/geraTrilha.ts:987-992`). Varre o registro REAL
`SCHEMA_REGISTRY` (`engine/schemas/artifactsRegistro.ts:60-79` — 14 nomes pinados em
`app/tests/engineSchemas.test.ts`). Testes do lint: `app/tests/cx-phases-gap-lint-real.test.ts`,
`app/tests/cx-gap-l06-fieldorder-tree.test.ts`, `app/tests/cx-phases-schemas-artifacts.test.ts:695-930`.

---

## 1. `lesson.json` — schema completo

**Layout**: `resources/tracks/<slug>/modules/<modulo>/lessons/<aula>/lesson.json`
(`trackTypes.ts:10-15`). Arquivo único por aula; os desafios vivem em
`challenges/<desafio>/challenge.json` dentro da pasta da aula.

### 1.1 Campos (tipo produto — `TrackLessonSource`, `content/trackTypes.ts:253-278`)

| Campo | Tipo | Obrig. | Notas / linhas |
|---|---|---|---|
| `schemaVersion` | `number` (== 1) | sim | `trackTypes.ts:69,702-704` |
| `slug` | `string` kebab-case `SLUG_RE` | sim | `trackTypes.ts:60`, `validateSlug:500-505` |
| `title` | `string` não vazia | sim | `:706` |
| `summary` | `string` não vazia (1 frase) | sim | `:707` |
| `difficulty` | `number` 1..5 | sim | `:708` |
| `concepts` | `string[]` (concept_ids snake_case) | sim | `:709` |
| `prerequisites` | `string[]` — **slugs de aulas anteriores** (revisão) | sim (pode ser `[]`) | `:710`; integridade em `trackLoader.ts:261-266` |
| `theory` | `TrackTheorySection[]` (≥ 1) | sim | `:713-717`; seção: `{id, title, markdown, code?}` (`trackTypes.ts:168-195`; `validateTheorySection:584-599`) |
| `assertions` | `TrackAssertion[]` (0..3) — ADITIVO | **opcional** | `trackTypes.ts:273`, `validateAssertions:615-695` |
| `sources` | `TrackSourceLink[]` (`{title,url,description}`) | sim | `:711,718-724` |
| `challenges` | `string[]` (slugs de desafios da aula) | sim | `:712`; integridade em `trackLoader.ts:267-271` |

`TrackAssertion` (`trackTypes.ts:203-245`): `id` (kebab, único), `statement`, `question`,
`options` (EXATAMENTE 4, únicas), `answerIndex` (0..3), `feedback`, `sectionId?` (âncora em
`theory[].id`, REPLAN A1), `optionRationales?` (0 OU = options.length). Máx.
`MAX_ASSERTIONS_PER_LESSON = 3` (`trackTypes.ts:602`).

### 1.2 Campos ADITIVOS que existem no DISCO mas NÃO estão no tipo (schema aberto)

Medido em `app/resources/tracks/**/lessons/*/lesson.json` (330 ficheiros):

| Campo | Onde | Shape observado |
|---|---|---|
| `role` | 330/330 | `"regular"` (177) \| `"consolidation"` (145) \| `"integration"` (8) |
| `targetAtom` | 326/330 | chave de átomo, ex. `"global:print"`, `"node:IfElse"` |
| `introduces` | 326/330 | `{productive: AtomKey[], receptive: AtomKey[]}` (197) ou + `derived: [{chave, de}]` (129) |
| `introducesTerms` | 326/330 | `AtomKey[]` do eixo `term:` |
| `notionalMachineDelta` | 111/330 | `string` (prosa) |
| `autoria` | 113/330 (c-iniciante) | `{modulo, moduloTitulo, aula, ensina, presume, quiz, desafio}` — `presume` é prosa livre citando aulas anteriores! |

Estes campos são escritos pela F12 (`phases/f12Materialize.ts:445-477`, tabela de derivação que
inclui `objective`, `introduces`, `introducesTerms`, `foraDeEscopo`, `eiClass`, `role`,
`targetAtom`, `notionalMachineDelta`, `budgetHash`, `budgetVersion`, `status`, `research`,
`assertions`) e NÃO são validados no load (o loader faz cast — `trackLoader.ts:62-72`).

### 1.3 Onde é validado

- **Validador**: `validateLessonSource` (`content/trackTypes.ts:698-735`) + `validateTheorySection`
  (`:584-599`) + `validateAssertions` (`:615-695`, só quando `assertions` presente; `sectionId`
  conferido contra `theory[].id` em `:730-733`).
- **Load**: `loadTrack` (`content/trackLoader.ts:142-303`) — passo 1 lê e valida cada
  `lesson.json` (`:186-201`); passo 2 (`:257-273`) valida integridade de `prerequisites`
  (slug tem de existir em QUALQUER módulo — `lessonExistsAnywhere:305-307`) e `challenges`
  (slug tem de ter `challenges/<slug>/challenge.json`). Qualquer issue → `TrackLoadError`
  (fail-closed, nunca objeto parcial).
- Também validado pela F12 antes de escrever (`f12Materialize.ts` — "validação FINAL da árvore
  com os validadores do produto", comentário `:552-557`) e pelo CLI `tools/track-cli.ts`
  (`track:validate`, mesmo `loadTrack`).

Exemplos REAIS lidos:
- inicial: `app/resources/tracks/python-iniciante/modules/a-tela/lessons/a-primeira-linha/lesson.json`
  (15 chaves; `introduces.derived` presente; `prerequisites: []`; 3 assertions com `sectionId`).
- intermédia: `.../modules/decisao/lessons/se-senao/lesson.json` (`prerequisites: ["se"]`,
  `introducesTerms: ["term:ramo"]`, assertions com `optionRationales`).
- final: `.../modules/dicionarios-e-conjuntos/lessons/percorrer-um-dicionario/lesson.json`
  (`role: "consolidation"`, `prerequisites: ["chave-e-valor-juntos","percorrer-uma-lista"]`).

---

## 2. `challenge.json` — schema completo

**Layout**: `.../lessons/<aula>/challenges/<desafio>/challenge.json` (desafio de aula),
`.../modules/<modulo>/challenges/<desafio>/challenge.json` (desafio de módulo, campo
`module.challenge` — `trackTypes.ts:286-292`) e `resources/tracks/<slug>/proficiency.json`
(proficiência; `trackTypes.ts:67`, `trackLoader.ts:279-300`). Os três usam o MESMO validador.

### 2.1 Campos (tipo produto — `TrackChallengeSource`, `content/trackTypes.ts:133-166`)

| Campo | Tipo | Obrig. | Notas / linhas |
|---|---|---|---|
| `schemaVersion` | `number` (== 1) | sim | `:523` |
| `slug` | kebab-case | sim | `:526` |
| `title` | `string` | sim | `:527` |
| `concept` | `string` snake_case `^[a-z][a-z0-9_]{1,62}$` | sim | `:528-530` (I16: pertence a `lesson.concepts`) |
| `difficulty` | `number` 1..5 | sim | `:531` |
| `language` | token do REGISTRO de adaptadores (`python`/`c`/`rust`/`nodejs`/`javascript`/…) | sim | `:537-542` fail-closed via `adapterIdForChallengeLanguage`; default `'nodejs'` (`:96-99`) |
| `statement` | `string` markdown | sim | `:543` |
| `files?` | `TrackChallengeFileSource[]` `{path, starterCode, solutionCode}` — multi-arquivo (ADITIVO rod. 9) | não | `:144-149`, validação `:548-570`; path seguro `SAFE_FILE_PATH_RE` `:118` |
| `starterCode?` | `string` | sim SEM `files`; opcional COM `files` | `:572` |
| `solutionCode?` | `string` não vazia | sim SEM `files` | `:573` |
| `testsCode` | `string` não vazia (especificação executável) | sim | `:575` |
| `expectedTestCount` | `number` inteiro 1..100 | sim | `:576` — gate de igualdade tripla (§5) |
| `minFirstStarMs?` | `number` 1..3.6e6 | não | `:577-579`; default `DEFAULT_MIN_FIRST_STAR_MS` (`:77`) |

### 2.2 Campos ADITIVOS no disco NÃO tipados (leitura defensiva)

Medido em 326 `challenge.json` reais (python 113 · c 117 · rust 111… mais módulo/proficiência):

| Campo | Cobertura | Shape / validação |
|---|---|---|
| `requirements` | 326/326 | `[{id, teste, descricao}]` — NÃO validado no load; lido defensivamente em `engine/revision/progressivaDesafio.ts:36-49` e `tools/track-engine/cli.ts:1192-1203` (código DUPLICADO de propósito declarado); validado só pela bijeção do CLI `requirements` |
| `outputChannel` | 223/326 | `"impressao"` (127) · `"retorno"` (105) · `"ambos"` (2) · **ausente em 107** — NÃO validado no load (o enum `['retorno','impressao']` só existe no draft da engine, `artifactsDrafts.ts:196`) |

### 2.3 Onde é validado

- **Validador**: `validateChallengeSource` (`content/trackTypes.ts:519-581`).
- **Load**: `trackLoader.ts:204-225` (aula), `:233-253` (módulo), `:279-300` (proficiência) +
  checagem de linguagem vs trilha (`issuesDeLinguagemDoDesafio` `trackLoader.ts:118-135`,
  comparando ADAPTADORES resolvidos, fail-closed).
- **F12** valida a árvore montada antes de escrever (`f12Materialize.ts:552+`).
- **Execução/provas** (ver §5): `services/challengeExec.ts:314` (`runStudentCode`),
  `engine/exec/proofs.ts` (`verifyChallengeProofs`), `engine/exec/harness.ts`.

### 2.4 O "draft" de desafio da ENGINE (`ChallengeDraftSchema`)

`engine/schemas/artifactsDrafts.ts:165-219` (registro: `artifactsRegistro.ts:69`). Campos:
`slug`, `conceito`, `language` (`z.preprocess` → `'nodejs'`, `:187-190`), `statement`,
`starterCode`, `solutionCode`, `testsCode`, `expectedTestCount` (int > 0, `:195`),
`outputChannel` (enum `retorno|impressao`, `:196`), `requires`, `notRequired`, `subgoals`,
`scenarios[]` (`{tipo: exemplo|limite|erro|valido|invalido, derivado_de, descricao}`, `:200-207`),
`taskSkill`, `supportLevel`, `surfaceDomain`, `solutionAlternates`, `wrongSolutions`,
`requirements[]` (`{id, descricao, teste}`, `:213-215`), `justificativa`, `aprovado` (INV-04:
`justificativa:217` antes de `aprovado:218`). Este draft é o que a F12 converte em
`challenge.json` (`phases/f12Materialize.ts:481-526`, `montarDesafioDeProduto` — tabela de
derivação que copia `outputChannel`, `requires`, `requirements`, … verbatim para o produto).

Exemplos REAIS lidos: `python-iniciante/.../a-primeira-linha/challenges/escreva-oi/challenge.json`
(forma `stdout`, `outputChannel: "impressao"`, `requirements[{id:"REQ-1",teste:"test_imprime_oi"}]`);
`.../se-senao/challenges/maior-ou-nao/challenge.json`; `.../percorrer-um-dicionario/challenges/
frases-do-dicionario/challenge.json` (forma `import`, `outputChannel: "retorno"`, 3 requirements
com `id == teste`); `rust-iniciante/.../a-primeira-funcao/challenges/devolva-dois/challenge.json`
(`#[test] fn testa_…`, sem `outputChannel`); `c-iniciante/.../se-senao/challenges/par-ou-impar/
challenge.json` (`SM_TEST(slug)`, `minFirstStarMs`, requirements com `id == slug`).

---

## 3. `requirements[]` — derivação e bijeção

Fachada: `engine/quality/requirements.ts` (só re-exporta; prosa normativa no cabeçalho `:1-98`).

### 3.1 Contrato (`engine/quality/requirementsTipos.ts`)

- `Requirement` (`:14-21`): `{id: 'REQ-<n>', descricao (pt-BR derivada do assert), teste (nome)}`.
- `RequirementCobertura` (`:23-27`): `{requirementId, atoms: AtomKey[]}` — átomos que o aluno
  precisa ESCREVER (funções da solução chamadas pelos asserts; fallback = átomos do trecho do
  assert — `requirements.ts:21-25`).
- `RequirementDeclarado` (`:34-39`): o que vem do `challenge.json` (`{id, descricao?, teste}`).
- `ValidacaoRequirements` (`:46-55`): `{ok, semTeste[], testesSemRequirement[], correspondencias[]}`.

### 3.2 `derivarRequirements` (`engine/quality/requirementsDespacho.ts:108-115`)

Despacha por linguagem via tabela explícita `DERIVACAO_POR_LINGUAGEM` (`:42-61`), fail-closed
(`exigirDerivacao:74-93` lança `EngineLinguagemError` para linguagem sem derivação escrita;
`getAdapter` lança para id desconhecido). Por linguagem:

| Linguagem | Forma de teste reconhecida | deriva | valida |
|---|---|---|---|
| javascript | `test('nome', …)` + `assert.*` (AST TS) | `requirementsJs.ts:331` | `:368` |
| python | `def test_…(self)` + `self.assert*` (AST do adaptador) | `requirementsPy.ts:275` | `:313` |
| c | bloco `SM_TEST(<slug>)` + `checa_*` | `requirementsC.ts:209` | `:243` |
| rust | `#[test] fn` + `assert_eq!` | `requirementsRust.ts:195` | `:233` |

Comportamento: para CADA teste declarado no arquivo de teste gera UM requirement determinístico
(zero LLM) com descrição pt-BR derivada do texto real do assert (`requirementsJs.ts:186`
`descreverAssert`); ids `REQ-<n>` na ordem dos testes (em C o `id` é o próprio slug do `SM_TEST`).
**Fail-closed**: teste que não parseia → `RequirementsParseError` (`requirementsTipos.ts:68-73`),
nunca conjunto vazio silencioso. Limite DECLARADO: em Python na forma `stdout` (o assert chama o
helper `rodar()` do próprio teste) `cobertura[].atoms` sai VAZIA por decisão — o harness nunca é
cobrança (`requirements.ts:70-83`).

### 3.3 `validarRequirements` (`requirementsDespacho.ts:125-131`)

A **BIJEÇÃO** requirements declarados × testes, escrita uma vez em `casarBijecao`
(`requirementsTipos.ts:94-123`): todo `requirements[].teste` precisa casar um nome de teste do
`testsCode` (comparação por nome NORMALIZADO — `normalizarNome:85-87`, trim + colapsa espaços) e
todo teste precisa de requirement declarado. `ok ⇔ semTeste vazio E testesSemRequirement vazio`.
Gaps: `semTeste` (declarado sem teste) e `testesSemRequirement` (teste sem declaração).

**Consumidores**: CLI `npm run engine -- requirements <trilha>` (`tools/track-engine/cli.ts:1208-1270`;
mede e DECLARA, exit 0 mesmo com gaps); revisão progressiva como sinal secundário
(`engine/revision/progressivaDesafio.ts:51-66`); `services/moduleMastery.ts:355-369` (usa
`derivarRequirements` para saber o que o aluno precisa escrever). Testes:
`app/tests/engineRequirements.test.ts`, `engineRequirementsPython.test.ts`,
`cx-langqual-quality-requirements.test.ts`, `cx-services-requirements.test.ts`,
`engineGatesC.test.ts:730-807`, `engineLangRust.test.ts:958-979`, `trilhaCIntegrada.test.ts:578-593`.

---

## 4. Átomos / construções

### 4.1 As chaves (`engine/atomKeys.ts`)

Vocabulário FECHADO de construções, 6 eixos construídos + 1 reconhecido (`atomKeys.ts:1-40`):

```
node:<Nome>          node:IfStatement, node:Call, node:StrLiteral
decl:<kind>          decl:let|const|var
op:<familia>:<op>    op:binary:!==, op:unary:typeof, op:assign:+=
global:<nome>        global:print, global:console
api:<caminho>        api:console.log, api:Array.prototype.push
term:<termo>         term:atribuicao (prosa pt-BR)
form:<seletor>       form:IfStatement[alternate=null] (emitido por form/rules.ts, montado por formKey em engine/form/selector.ts:360)
```

Construtores (a única forma legítima): `nodeKey/declKey/opKey/globalKey/apiKey/termKey`
(`atomKeys.ts:95-115`); validação `ATOM_KEY_RE` (`:120`) + `isAtomKey` (`:122`); eixo via
`axisOf` (`:127`); rótulo humano `humanLabel` (`:150`). Proibições globais por adaptador
(`FORBIDDEN_ALWAYS:192`, `isForbiddenAlways:210` — `eval` etc.); semente receptiva do harness
`HARNESS_RECEPTIVE_SEED:245` (o aluno LÊ em todo teste e nunca escreve), acessada por
`harnessReceptiveSeed()` (`:1036`) e `structuralAlwaysAllowed()` (`:1068`).

### 4.2 Extração (`engine/extract.ts`, 1147 linhas)

`extractAtoms(code, options)` (`:1096`) e `extractAllOccurrences` (`:1087`) — puro, sem LLM.
`options` inclui `language` e `surface` (`'testsCode' | 'theory' | …`); cada ocorrência traz
`{key, line, column, snippet, start, end}`. Duas caminhadas (`CAMINHADA_POR_LINGUAGEM:473-488`):
`ts-node` (javascript/typescript) e `lang-node` genérica (python/c/rust via subprocessos
`vocab/py|c|rs/extract_ast.*`). Especialidades: ante-sala do testsCode de C
(`anteSalaDoTestsCode:829`, preâmbulo `SM_COUNT_PREABULO` rebased por `rebasarParaAutor:938`) e
envelope de fragmento para teoria (`envelopeDeFragmento:888`). Contagem declarada de testes por
AST: `countTestDeclarations` (`:1142` → `adapter.countDeclared`).

### 4.3 Consumo pelos testes/solução

- **Orçamento cumulativo** (`engine/budget.ts`): `entrada(N)=saida(N-1)`, `saida(N)=entrada(N)∪
  introduces(N)` (`budget.ts:10-14`); lê `lesson.introduces` declarado (`readDeclared:136-142`;
  modo `'declared'`) ou infere da teoria (`'inferred'`, legado); `entryAxiom:197` semeia a aula 1
  com o harness; `deriveTrackBudget:216` materializa `byRef: Map<'<modulo>/<aula>', LessonBudget>`
  (ref format `artifactsBase.ts:244-245`).
- **O que o aluno escreve vs o que o teste exige**: `quality/minimal*.ts` sintetiza o CÓDIGO
  MÍNIMO que passa nos testes (zero LLM) e devolve `MinimalVerdict` com `atoms` (o que escrever) e
  `atomsDoTeste` (enriquecimento — VAZIO por decisão em Python/C/Rust: os átomos do teste são
  harness, `minimalPythonSintese.ts:85-90`, `minimalCSintese.ts:91`, `minimalRustSintese.ts:89`;
  em JS traz os átomos do trecho do assert, `minimalSintese.ts:76-85`). Tipos em
  `quality/minimalTipos.ts:26-34`.
- **Requirements**: `cobertura[].atoms` = átomos das funções da solução chamadas pelos asserts
  (`requirementsJs.ts:229,272`).
- **Revisão de desafio** (`revision/progressivaDesafio.ts:128-140`): LACUNA = `atoms(minimal) ⊄
  (productive ∪ receptive)` do orçamento da aula; EXCESSO = `introduces.productive` não usado.
- **Auditoria** (`engine/audit*.ts`): compara átomos de `testsCode`/`solutionCode`/teoria com o
  orçamento (regras A2/A6); `quality/discriminacaoAvaliacao.ts:95-97` usa `atomsDaSolucao`.

---

## 5. Testes por linguagem: layout físico e execução

Tudo vem do ADAPTADOR (`engine/lang/registry.ts` — interface `LanguageAdapter:588-770`, 15
membros: `parse`, `constructKey`, `inventory`, `globals`, `builtins`, `resolveScopes`,
`forbiddenInvariants`, `layout`, `filePathPattern`, `testCommand`, `countDeclared`, `countRun`,
`parseChecks`, `failureExitCodes`, `envScrub`, `detect`). `ChallengeLayout` (`registry.ts:377-406`):
`files[]` na ordem de escrita + `entryPath` + `testPath` + `manifestPath`.

| Linguagem | Arquivos escritos no dir temporário (ordem) | Runner (`testCommand`) |
|---|---|---|
| **python** | `tests/__init__.py` (exit-guard contra `os._exit`/`abort`, `lang/python.ts:637-694`), `solucao.py` (ou `files`), `tests/test_solucao.py` — `pyLayout` `lang/python.ts:706-717` | `python3 -B -m unittest discover -s tests -t . -p 'test_*.py' -v` (`PY_TEST_COMMAND` `lang/python.ts:755-766`) |
| **rust** | `Cargo.toml`, `src/lib.rs` (ou `files`), `tests/desafio.rs` — `rsLayout` `lang/rust.ts:746`; paths `RS_TEST_PATH:685`, `RS_MANIFEST_PATH:687` | `cargo test --offline` (`lang/rust.ts:797`) |
| **c** | `tests/sm_harness.h`, `tests/sm_main.c`, `solucao.c` (ou `files` .c/.h), `tests/test_solucao.c`, `sm_fontes.txt`, `run.sh` — `cLayout` `lang/c.ts:1257-1287`; paths `lang/c.ts:807-811` | `sh run.sh` (`C_TEST_COMMAND` `lang/c.ts:1322` — script gerado que compila com `cc` e roda o counter_protocol) |
| **javascript** | `package.json {type:module}`, `solution.mjs` (ou `files`), `test.mjs` — `jsLayout` `lang/javascript.ts:280` | `node --test --test-reporter=spec test.mjs` (`lang/javascript.ts:153`) |

**Execução**: `services/challengeExec.ts` (`runStudentCode:314`) — ÚNICA implementação do runner,
usada pelo CLI de autoria e pelo main (submissão do aluno); escreve o layout num dir temporário,
roda `adapter.testCommand` com `envScrub` (allowlist, `registry.ts:445-457`) e decide:
`passed = exit-0-segundo-policy && testsRun === expectedTestCount` (cabeçalho `challengeExec.ts:1-30`;
a igualdade tripla **declarado == executado == expectedTestCount** é invariante —
`FailurePolicy.successRequiresCountMatch: true` literal no tipo, `registry.ts:428-438`). Provas F9:
`engine/exec/proofs.ts` (`verifyChallengeProofs`) + `engine/exec/harness.ts` (env endurecido).
Contagens: `adapter.countDeclared` (AST) e `adapter.countRun` (último resumo do runner — defesa
contra relatório forjado).

---

## 6. Campos que já referem aulas/conhecimento anterior

**NÃO existe** nenhum campo chamado `revisoes`/`revisitas`/`cumulative`/`review` (grep em todo
`app/**`: zero hits de schema). O que existe hoje:

1. **`lesson.prerequisites`** (`trackTypes.ts:262-263` — "slugs de aulas ANTERIORES desta trilha —
   **revisão quando o aluno não entender**"): o campo mais perto do pedido. Consumidores: UI
   "Não entendeu? Revisar:" (`app/src/components/course/LessonSidebarHeader.tsx:354-364`, i18n
   `pt-BR/translation.json:200`, ligado em `LessonView.tsx:4010`), tutor (`services/tutorChat.ts:159`),
   análise de domínio (`services/moduleMastery.ts:268` — fraqueza atribuída ao prereq),
   payload da aula (`services/trackService.ts:299-322`, `ipc/track-handlers.ts:539`). Integridade
   no loader: slug tem de existir em qualquer módulo (`trackLoader.ts:261-266`). NOTA: o
   destravamento é SEQUENCIAL (`trackService.ts:108-135`), não depende de `prerequisites`.
2. **`track.entryCriteria`** (`trackTypes.ts:414-424`): o que o aluno já sabe ANTES da trilha;
   usado como base do contexto do validador pedagógico.
3. **Cadeia de cursos** — `track.cadeia`/`nivel`/`cursoAnterior` (`trackTypes.ts:295-457`):
   `ensinadoAntesNaCadeia()` (`engine/graph/cadeia.ts:394`) responde "foi ensinado antes?" com
   endereço `<curso>/<modulo>/<aula>` (`cadeia.ts:261`) — o formato de ref proposto já tem
   precedente aqui e no `ref` do orçamento (`<modulo>/<aula>`, `artifactsBase.ts:244`).
4. **Grafo de conceitos da ENGINE** (`artifactsBase.ts:159-190`): `arestas_duras`
   (`desbloqueado_por`) vs `arestas_de_uso` ("a linha da Q-matrix — orçamento cumulativo",
   comentário `:153-154`); `aulas[].introduz` = concept.ids que a aula introduz.
5. **`lesson.introduces`** (disco) / `targetAtom` / `introducesTerms` — o que ESTA aula acrescenta.
6. **`autoria.presume`** (só c-iniciante, 113 aulas): prosa livre "presume: multiplicar-e-dividir,
   o-numero-com-virgula" — referência a aulas anteriores NÃO tipada, não validada, não consumida.
7. **`challengeContextValidator`** (`services/challengeContextValidator.ts`): `buildChallengeContext`
   (`:157-205`) monta `entryCriteria + previousLessons (todas as anteriores, teoria truncada 1500c,
   `:110-114`) + currentLesson` e a LLM julga teste a teste (`TestVerdict:84-93`, ordem INV-04
   `nome → construcoes_encontradas → motivo → aprovado`). Premissa do produto: "desafio só pode
   cobrar conhecimento JÁ ENSINADO" (`:1-20`). **É aqui que uma declaração `cumulativeReview`
   teria valor imediato.**
8. **Revisão progressiva** (`engine/revision/progressiva*.ts`): compara o mínimo exigido pelos
   testes com o orçamento acumulado da aula (LACUNA/EXCESSO) + bijeção de requirements.

---

## 7. Impacto de adicionar `cumulativeReview: [{ "lesson": "<mod>/<aula>", "atom": "<chave>" }]` ao `challenge.json`

O schema do produto é ABERTO, portanto o campo **carrega sem quebrar nada**; o trabalho é em
validação, integridade, autoria e consumo. Lista de pontos:

### 7.1 Núcleo (obrigatório)

1. **`content/trackTypes.ts`**
   - Novo tipo (ex. `TrackCumulativeReviewEntry { lesson: string; atom: string }`) + campo
     opcional em `TrackChallengeSource` (`:133-166`) — ADITIVO, ausência válida (padrão dos
     `assertions`/`optionRationales`, `:28-45`).
   - Validação em `validateChallengeSource` (`:519-581`): array, refs `<mod>/<aula>` com partes
     `SLUG_RE`, `atom` passa `isAtomKey`, entradas únicas. (Cuidado: `prerequisites` usa slug
     NU de aula; `<mod>/<aula>` é convenção NOVA — alinhar com `budget.ref` e `cadeia.ts:261`.)
2. **`content/trackLoader.ts`** — passo 2 (integridade, `:257-273`): resolver cada `lesson`
   contra os módulos carregados (hoje `lessonExistsAnywhere:305-307` é por slug nu; passo a
   validar o par módulo/aula) e, opcionalmente, que `atom` pertence a
   `lesson.introduces`/`targetAtom` da aula referida (precisa de leitura defensiva do campo
   aditivo, como `budget.ts:136-142`). Falha = `TrackLoadError` (fail-closed).
3. **`engine/schemas/artifactsDrafts.ts`** (`ChallengeDraftSchema:165-219`) — SE a engine passar a
   autoral o campo: entrada OBRIGATÓRIA (INV-05) com `z.preprocess` → `[]` (idioma de
   `assertions` `:135-138` / `language` `:187-190`), item `{lesson, atom}` com strings `.min(1)`.
   O lint INV-04/05 (`fieldOrder.ts`) varre o registro automaticamente (não precisa de registro
   novo; mas `app/tests/engineSchemas.test.ts` fixa os 14 nomes — não muda).
4. **`engine/phases/f12Materialize.ts`** — `montarDesafioDeProduto` (`:481-526`): copiar o campo
   para o produto (tabela de derivação é explícita — esquecer = campo nunca escrito) + prompt/saída
   do autor de desafio (`engine/phases/f8Challenges.ts:304+` `DesafioAuthorOutputSchema`) se a
   autoria for gerada.
5. **`app/shared/ipc-contract.ts`** — SÓ se a UI mostrar: `TrackChallengeSpec:667-693` (o DTO do
   desafio não inclui `requirements` nem `outputChannel` hoje — espelhar o padrão) e builder em
   `ipc/track-handlers.ts`; `services/e2eStubs.ts` (`:567,582` já pinam `prerequisites`) se os
   stubs de e2e precisarem do campo.

### 7.2 Consumidores que devem passar a usá-lo (o valor do campo)

6. **`services/challengeContextValidator.ts`** — `buildChallengeContext:157-205`: incluir os átomos
   declarados no contexto (revisão cumulativa = cobrança legítima de conhecimento anterior).
7. **`engine/revision/progressivaDesafio.ts:128-140`** — a regra "LACUNA = atoms(minimal) ⊄
   orçamento" passa a aceitar átomos de `cumulativeReview` (ou exigir que os átomos declarados
   apareçam nos testes — bijeção-análoga a `validarRequirements`).
8. **CLIs de autoria**: `tools/track-cli.ts` (`challengeTemplate:325-345` — template do
   `track:challenge:new`); `tools/track-engine/cli.ts` (leitor defensivo no estilo
   `lerRequirementsDeclarados:1192-1203` — ATENÇÃO: esse padrão já está duplicado em
   `progressivaDesafio.ts:36-49`; criar UM leitor tipado em vez de uma terceira cópia).

### 7.3 Documentação e receitas de autoria

9. `docs/16-engine-de-trilha.md` §10 (campos aditivos), `docs/00-contratos.md` (tabela de enums),
   `skills/aula-author/references/receita-da-aula.md`, `skills/trilha-author/references/*`
   (contrato de autoria), `app/tools/track-engine/README.md`.

### 7.4 Testes

10. `app/tests/cx-phases-tracktypes.test.ts` (golden master dos validadores — casos novos),
    `trackTypes.optionRationales.test.ts` (PRECEDENTE exato de campo aditivo: ausência ok,
    `[]` ok, shape válido), `trackLoader.test.ts` (fixtures + integridade de referência),
    `engineMaterialize.assertions.test.ts` (PRECEDENTE de materialização aditiva na F12),
    `cx-phases-schemas-artifacts.test.ts:141,473` (shape do `ChallengeDraftSchema`),
    `trilhaCIntegrada.test.ts:578-593` / `pythonTrilhaRoda.test.ts` / `rustTrilhaRoda.test.ts`
    (conteúdo real — continuam verdes; aqui é que se valida a bijeção do novo campo contra os
    testes). Se o validador do produto passar a REJEITAR entradas malformadas, o contrato de
    "não lança, devolve issues" (`TrackValidationIssue[]`) mantém-se.

---

## 8. O que pinna o formato de `challenge.json` na UI e nos testes (o que partiria)

**UI (`app/src`)**: acoplamento mínimo — o renderer recebe `TrackChallengeSpec`
(`app/shared/ipc-contract.ts:667-693`: `slug/title/concept/difficulty/statement/files?/starterCode/
expectedTestCount/minFirstStarMs/timeLimitMs/source/lastVerdict/stars/failedCount`). Único pin
direto de campo: `TrackChallengePanel.tsx:1357` (Chip `challenge.testsCount` com
`spec.expectedTestCount`), testado em `cx-views-gap-track-panel.test.ts:285`. `requirements` e
`outputChannel` NÃO chegam à UI. ⇒ **um campo opcional novo em `challenge.json` não parte a UI**;
partiria só se o DTO ganhar campo obrigatório sem default (o DTO usa `?` para opcionais — padrão
`files?:`, `sectionId?:`).

**Testes (`app/tests`)** — o que pinna o formato hoje:

- `cx-phases-tracktypes.test.ts:197-213` — mensagens exatas do validador (ex.
  `expectedTestCount inválido: 0 (esperado número 1..100)`); golden master.
- `trackServices.test.ts:109-113,762-781` + `challengeExec` — a igualdade tripla
  (`testsRun == declarados == expectedTestCount`); fixtures constroem objetos
  `TrackChallengeSource` por LITERAL (TS excess-property check: escrever o campo novo numa fixture
  ANTES de o tipo o declarar = erro de compilação).
- `engineSchemas.test.ts` / `cx-phases-schemas-artifacts.test.ts` / `cx-phases-gap-lint-real.test.ts`
  — pinam `SCHEMA_REGISTRY` (14 nomes), shapes do `ChallengeDraftSchema` e o lint INV-04/05
  (adicionar campo `.optional()` ao draft da engine = lint vermelho por construção).
- `engineMaterialize.test.ts:137` e `cx-phases-f12.test.ts` — golden master do JSON escrito pela
  F12 (o literal cobre cada campo — campo novo exige atualizar o literal esperado).
- `cx-cli-track-cli.test.ts:288-308` — template do `track:challenge:new` (campos pinados).
- `trilhaCIntegrada.test.ts:533-593`, `engineLangRust.test.ts:1254-1263`, `pythonTrilhaRoda.test.ts`,
  `rustTrilhaRoda.test.ts` — leem `challenge.json` REAIS do disco e pinam
  `requirements == expectedTestCount == countDeclared`.
- `engineExecProofs.test.ts:185-191` / `cx-phases-exec-proofs.test.ts:199-254` — mensagens da
  dupla-igualdade.

**O que partiria com um campo OPCIONAL novo**: quase nada no runtime (schema aberto, loader faz
cast). Quebras reais: (a) golden masters do JSON materializado pela F12 (`engineMaterialize*.test.ts`)
e do template do CLI; (b) fixtures TS tipadas que incluam o campo antes do tipo o ter; (c) se o
campo entrar no `ChallengeDraftSchema` sem o idioma `z.preprocess` (INV-05) o `lint-schemas` reprova
o build; (d) se a validação do produto passar a exigir bijeção do `cumulativeReview` com os testes,
desafios REAIS sem o campo continuam válidos (ausência = []), mas desafios com o campo malformado
passam a reprovar no load — decisão de fail-closed a confirmar.

**Regra de ouro do repo para campos novos** (precedentes `assertions`, `optionRationales`,
`files`, `language`): ADITIVO + OPCIONAL no produto (`trackTypes.ts:28-45`), OBRIGATÓRIO com
valor vazio explícito via `z.preprocess` na engine (INV-05), `schemaVersion` NUNCA muda (INV-08),
e validação estrita só quando PRESENTE.
