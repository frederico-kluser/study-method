# 14 — Respostas digitadas e o nunca-repetir

> Contrato das features de **resposta digitada** (matemática por execução e
> interpretação por LLM), da **persistência de matérias/lições/tentativas** no
> SQLite e do **nunca-repetir** (desafios tentados saem da lista). Complementa o
> `docs/app-gui.md` (§1.3/§1.4/§2.3) com os shapes exatos de canais e as regras
> de semântica — a fonte de verdade de tipos é `app/shared/ipc-contract.ts`
> (congelado); este documento é a leitura de produto das decisões.

---

## 1. Regra-mestra: o esperado nunca vem de cabeça

O valor esperado de um exercício de matemática **nunca** é um número calculado
"de cabeça" pelo LLM, pela UI ou por constante fixa. Ele é **computado pela
execução da `mathLib`** (regra DES-6 do tutor):

| Camada | O que faz | Nunca faz |
|---|---|---|
| **mathLib** (`electron/main/services/mathLib.ts`) | Gera o problema e **computa** o esperado com aritmética racional exata (`{num, den}` canônica, reduzida por mdc); mesma `(family, seed)` ⇒ exatamente o mesmo prompt e esperado (PRNG mulberry32 semeado) | Não usa `Date.now`/`Math.random`; não tem constantes fixas — os números saem do seed |
| **lesson-orchestrator** (caminho `math`) | Re-computa `(family, seed)` **antes** de gerar a aula e **re-verifica** na validação; se a re-computação divergir do prompt/esperado anexado, a aula é **abortada** | O LLM só recebe o `prompt` do exercício no contexto — **sem** o esperado |
| **handler `check-math-answer`** | Re-computa o esperado de `(family, seed)` **no main** e compara com o que o aluno digitou | **Nunca confia no renderer**: a UI envia `family`/`seed` (que vêm do `exercise` da lição), nunca o esperado |
| **UI (LessonView, ramo math)** | Mostra o esperado **somente após a 1ª tentativa errada** (pedagogia) | Não revela a solução antes de o aluno tentar |

### 1.1 Famílias da mathLib e vocabulário de resposta

| Família | O que gera | Esperado |
|---|---|---|
| `arithmetic` | 4 operações com inteiros pequenos (`+`, `−`, `×`, `÷` — a divisão é sempre exata por construção) | inteiro |
| `fractions` | soma/subtração de frações próprias (denominadores 2..9), resultado nunca negativo | racional canônico (`5/6`) |
| `percentages` | `X% de Y`, aumento de `X%`, desconto de `X%` | racional exato |
| `linear-equations` | `ax + b = c` (a ≠ 0), solução inteira OU fracionária | `x` exato |

**Vocabulário aceito na resposta digitada** (`parseMathAnswer`): inteiros
(`-12`, `+12`), decimais com vírgula pt-BR **ou** ponto (`12,5`, `12.5`, `.5`),
frações com espaços só em volta da barra (`1/2`, ` 1 / 2 `). **Malformado** (nunca
adivinhado): número misto (`1 1/2`), notação científica, sufixo `%`, divisão por
zero. Formas equivalentes passam: `1/2` ≡ `2/4` ≡ `0.5`; decimais truncados com
tolerância `1e-9`.

### 1.2 Resultado de `check-math-answer`

| Campo | Tipo | Semântica |
|---|---|---|
| `correct` | `boolean` | resposta parseada e equivalente ao esperado re-computado |
| `expectedNormalized` | `string \| null` | esperado canônico (`'7'` \| `'5/6'`) re-computado no main; `null` só quando não computável |
| `reason` | `'wrong' \| 'malformed'` (ausente quando correto) | `wrong` = número válido mas diferente; `malformed` = não é número reconhecível |

---

## 2. Os dois ramos de resposta digitada

A `LessonView` roteia a resposta pelo ramo da aula atual:

| Ramo | Quando | Canal | Verificação | Veredito |
|---|---|---|---|---|
| **Matemática** | lição com `exercise.kind === 'math'` | `study:check-math-answer` | **por execução, SEM LLM** (mathLib re-computa no main) | `correct` (avança) / `wrong` (revela o esperado) / `malformed` (mensagem de formato) / `error` (serviço) |
| **Interpretação** | lição sem exercício (aula de conceito) | `study:judge-answer` | **LLM**: deepseek primeiro, fallback para o modelo local (`embeddedLlm`); temperatura 0; JSON estrito `{"verdict","feedback"}` | `correct` / `partial` / `incorrect` + feedback pt-BR |

### 2.1 `judge-answer` — cadeia de provedores e erros

| Situação | Resultado |
|---|---|
| deepseek responde JSON válido | `{ ok: true, verdict, feedback, provider: 'deepseek' }` |
| deepseek falha (sem chave, rede, content vazio, rate limit) | tenta o **modelo local** ativo |
| modelo local responde JSON válido | `{ ok: true, verdict, feedback, provider: 'embedded' }` |
| **falha total** (nenhum provedor ou JSON inutilizável) | `{ ok: false, error: { code } }` — **nunca inventa veredito** |

Códigos de erro estruturados: `ANSWER_JUDGE_INVALID_INPUT` (payload sem
`answerText`/contexto), `ANSWER_JUDGE_UNAVAILABLE` (transporte falhou nos dois
provedores), `ANSWER_JUDGE_UNPARSEABLE` (provedores responderam sem JSON
utilizável). Feedback em pt-BR segue as regras anti-bajulação do tutor (AS-1/AS-2):
específico, nunca elogio vazio, nunca inventa acerto.

### 2.2 Regra de avanço (veredito terminal)

| Veredito | Avança? | Comportamento |
|---|---|---|
| sem veredito (não julgado) | **não** | o veredito é pré-requisito do avanço |
| `correct` | **sim** | marca a aula concluída (local + persistência) e o veredito **permanece visível** |
| `partial` / `incorrect` | **não automaticamente** | veredito + feedback ficam visíveis; o escape é o botão **"Avançar mesmo assim"** (mesmo caminho do `correct`, persistindo a última resposta) |
| `ok: false` (erro de serviço) | **não** | mensagem de serviço, sem veredito inventado |

O **avanço para a próxima aula é sempre do botão primário** ("Continuar" quando
há aula pendente, senão "Gerar nova aula") — o usuário nunca fica travado nem
perde o veredito num encadeamento automático.

---

## 3. Nunca-repetir (desafios tentados somem da lista)

Duas vias, ambas passando por `study:mark-challenge-attempt`:

| Via | Identidade do desafio (`challengeId`) | O que o filtro esconde |
|---|---|---|
| **Programação** | **slug estável** do desafio (basename do diretório **sem** o prefixo `NNNN`: `0007-fatorial-recursivo` → `fatorial-recursivo`) | o desafio some do `study:list-challenges` do mesmo subject (filtro por `listAttemptedChallengeSlugs`) |
| **Matemática** | **slug sintético** `math:<subjectSlug>:<family>:<seed>` | cada tentativa registrada (certa ou errada) **incrementa a contagem do subject**; na próxima geração o salt `assunto#n` muda o seed → **"errou → o próximo problema é outro"** |

### 3.1 Regras do registro (`mark-challenge-attempt`)

| Regra | Detalhe |
|---|---|
| **Só em eventos terminais** | `passed` (testes passaram), `timeout` (tempo esgotado sem passar), `abandoned` (troca de desafio sem concluir) — **nunca** no primeiro teste falho (o usuário ainda está trabalhando no desafio; o filtro não pode escondê-lo) |
| **Idempotente por desafio** | o 1º evento terminal vence (`alreadyMarked` ⇒ não marca de novo); a UI registra antes do invoke e após `ok: true` re-busca a lista (o filtro esconde o desafio tentado) |
| **Semântica da troca = `abandoned`** | trocar de desafio sem concluir **é** um evento terminal: o desafio tentado some da lista — é o design (a captura acontece **antes** da troca; a guarda de identidade descarta o resultado do teste em voo) |
| **`verdict` válidos** | `passed` \| `failed` \| `timeout` \| `abandoned` (o `failed` da matemática é registrado por tentativa errada no ramo math) |
| **`stars` e `durationMs`** | inteiros, `0..3` e `>= 0` (default 0); o handler valida e rejeita payload inválido |
| **Resolução do subject** | `subjectId` explícito > `findSubjectBySlug(subjectSlug)` > `upsertSubject` sob demanda (a FK `subject_id` é NOT NULL); sem `subjectId`/`subjectSlug` no payload, responde `{ ok: false }` |

### 3.2 Limitação documentada: o mark é otimista

O registro da tentativa é **otimista**: a UI marca o desafio como "já tentado"
**antes** do `invoke` (idempotência local), e o `markChallengeAttempt` é
`fire-and-forget` com `.catch()` silencioso. Uma **falha transitória de IPC**
pode, portanto, perder **um** registro na sessão — o banco não recebe a linha e
o desafio **reaparece uma vez** na lista (a próxima tentativa terminal re-grava).
É a troca aceita entre nunca bloquear o fluxo do desafio por persistência e a
exatidão do filtro.

---

## 4. Persistência (SQLite, schema v3)

| Camada | O que guarda |
|---|---|
| `subjects` | matérias com `domain` (`'programming'` \| `'math'`, default `'programming'`) e `slug` único |
| `lessons` | aulas persistidas, `difficulty`, árvore (`parent_lesson_id`/`origin_lesson_id`), `completed_at` e **`exercise_json`** (v3 — o exercício de matemática serializado) |
| `lesson_answers` | respostas do aluno à aula (encadeiam/avançam) |
| `challenges` | o desafio **fundido** da lição (1 por lição no fluxo atual): statement, `test_cases_json`, `solution_json` |
| `challenge_attempts` | **uma linha por tentativa** de desafio: `subject_id` (FK), `lesson_id`, `challenge_id`, `verdict`, `stars`, `duration_ms`, `created_at` |

**Migração v1 → v2 → v3 crash-safe e sem perda de dados** (`db/migrate.ts`):

| Garantia | Como |
|---|---|
| idempotente | banco atual ⇒ no-op; rodar 2× nunca falha nem duplica |
| passo a passo | bancos antigos sobem `version` a `version` pela lista `MIGRATIONS` (v2: `subjects.domain` + `challenge_attempts`; v3: `lessons.exercise_json`) |
| crash entre CREATE e `user_version` (v1) | user_version 0 **com** tabela `subjects` existente é tratado como v1 — os passos pendentes rodam |
| crash entre ALTER e `user_version` | `guardedAlter` só roda se `PRAGMA table_info` não listar a coluna (sem "duplicate column" ao re-tentar) |
| transacional | passos pendentes + gravação da versão numa **única transação** (BEGIN/COMMIT, ROLLBACK em erro); `user_version` é transacional no SQLite |

A persistência da lição acontece na geração (`generateLesson`): subject upsert
(idempotente) + `createLesson` com o exercício (math) ou o 1º desafio aprovado
(programming). **Falha de persistência não derruba a geração** — a aula segue
sem ids (comportamento das ondas anteriores).

---

## 5. Canais novos — shapes

### 5.1 `study:research-progress` (push, durante `generateLesson`)

Ordem de emissão fixa por rodada: `research:plan` → (`research:round-start` →
(`research:query-start` → `research:query-done`)* → `research:round-done`)* →
`research:done`.

| Evento | Campos principais |
|---|---|
| `research:plan` | `subQuestions[]` (`id`, `question`), `queries[]` (`id`, `q`, `sub`, `category`), `maxRounds` |
| `research:query-start` | `queryId`, `q` |
| `research:query-done` | `queryId`, `q`, `ok`, `provider: 'brave'`, `hits?`, `latencyMs?`, `error?` (`code`: `BRAVE_KEY_MISSING` \| `BRAVE_KEY_INVALID` \| `BRAVE_RATE_LIMIT` \| `BRAVE_SERVER_ERROR`) |
| `research:round-start` / `round-done` | `round`, `totalRounds`; no done: `ok`, `failed`, `uniqueSources` (dedup por url) |
| `research:done` | `sources`, `rounds`, `stopReason`; `errorKind?`: `'brave-missing'` (chave ausente — **aborta a geração**) \| `'brave-key-invalid'` (chave rejeitada 401/403 em todas as queries sem nenhuma fonte — **aborta a geração**) |

Categorias fixas de query: `official-docs` · `practice` · `common-errors` ·
`comparison` · `exercises`. O canal é **aditivo**: `study:lesson-progress` por
fases continua sendo emitido intacto (retrocompat).

### 5.2 `study:get-lesson-by-id` (reabertura de lição persistida)

| Campo | Tipo | Semântica |
|---|---|---|
| `lesson` | `LessonRow \| null` | a lição completa (inclui `exercise` parseado de `exercise_json`; parse **defensivo** — nunca lança) |
| `exercise` | `LessonExercise \| null` | exercício de matemática persistido |
| `domain` | `'programming' \| 'math' \| null` | domínio do subject (JOIN) |
| `subjectSlug` | `string \| null` | slug do subject — a UI usa para resolver o setupRoot ao reabrir |
| `challenge` | `{ slug, title } \| null` | o desafio fundido da lição — a UI reabre pelo slug; `null` para lições math/sem desafio |

### 5.3 `study:generate-lesson` — payload objeto

Além da string avulsa (`subject`), o payload aceita **objeto**
`{ subject, language?, goal?, domain? }` — `domain` explícito (`'math'` |
`'programming'`) da Home/UI; ausente, o backend resolve por heurística de
palavras-chave no assunto (default `'programming'`). O resultado ganha
`lessonId`/`subjectId` reais quando a persistência funcionou.

---

## 6. Fluxo na UI (resumo)

1. **Home** (seções Programação/Matemática): clicar numa matéria com aula em
   andamento de **outra** matéria abre o diálogo de aviso ("não dá para trocar
   de matéria no meio da aula — a avaliação da aula atual é feita pela LLM").
2. **Aula**: geração com checklist de pesquisa ao vivo (deltas por rodada,
   término garantido); com `pendingLessonId` (vindo da Trilha), abre a lição
   persistida por `getLessonById`.
3. **Resposta digitada**: ramo math (`checkMathAnswer`, sem LLM) ou
   interpretação (`judgeAnswer`, LLM) — ver §2; veredito terminal decide o
   avanço (§2.2).
4. **Desafio**: 3 estrelas + cronômetro (ver `docs/app-gui.md` §1.4); eventos
   terminais marcam a tentativa (§3) e o desafio some da lista.

Detalhes de implementação e números de teste: [`docs/app-gui.md`](app-gui.md) e
[`docs/relatorio-rodada7.md`](relatorio-rodada7.md).
