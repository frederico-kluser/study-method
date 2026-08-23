# Parte 3 — Desafios com TDD validado

## Sumário da Parte 3

Este bloco é o coração técnico do produto: como um desafio nasce, quais artefatos ele tem, e **como
o teste é provado correto por execução antes de o aluno vê-lo**. Contém a reformulação honesta do
pedido original (a promessa de "todos os cenários de erro" é o *test oracle problem* e não é
entregável), a separação rígida **o LLM autora / o harness julga**, o protocolo de validação de 8
passos com o código de rejeição nomeado de cada um, o catálogo fixo de 8 operadores de mutação com
a contagem de referência verificada, e cinco armadilhas de falso positivo medidas — cada uma um
"passou" sem que uma asserção tenha rodado. Fecha com o oráculo matemático sem álgebra simbólica, o
contrato de sandbox, e a limitação que o algoritmo não cura.

---

## 3.0 O que envelhece aqui

Tudo marcado **[VERIFICADO]** foi medido executando, nesta máquina, em **2026-08-23**. Trocar
qualquer linha da tabela abaixo obriga a remedir — em particular §3.6 (cache de bytecode), §3.7 (as
cinco armadilhas) e §3.5.6 (a contagem de 17 mutantes).

| Componente | Versão verificada |
|---|---|
| SO / kernel | CachyOS, Linux 7.2.0-1-cachyos |
| Python | 3.14.7 |
| Node | 24.19.0 |
| Go | 1.26.5 (`go version go1.26.5-X:nodwarf5 linux/amd64`) |
| Rust / cargo | 1.98.0 |
| gcc | 16.2.1 (20260810) |
| GNU coreutils | 9.11 · `jq` 1.8.2 · util-linux 2.42.2 · bubblewrap 0.11.2 |

Contratos citados: `docs/00-contratos.md` (autoridade; §5 exit codes, §6 REQUEST/APPLY, §8 CLI, §9.5
regras DES-1..DES-9, §11 invariantes) · `docs/05-challenges-tdd.md` (racional completo) ·
`docs/11-seguranca-privacidade.md` §2 (garantias G1..G9) · fragmentos
`docs/build-spec/{50-sandbox,51-challenge-new,52-challenge-verify,60-templates}.md`.

---

## 3.1 O pedido do usuário, e o que é honestamente entregável

### 3.1.1 O pedido literal

> "a skill deve propor desafios, que o usuário completa e testa. Para cada desafio, que ficará em
> `challenges/`, terá um TDD do desafio, cujo teste é a validação que devolve todos os possíveis
> cenários de erro — assim o usuário só roda o teste pra saber se passou. Todo teste criado é
> validado primeiro pelo agente de código pra saber se não tem bugs."

Duas partes desse pedido não sobrevivem à realidade na forma literal. Reformular é obrigação, não
licença para entregar menos.

### 3.1.2 "Devolve todos os possíveis cenários de erro" é impossível

É o *test oracle problem* (Barr et al., IEEE TSE 2015): decidir o resultado esperado de todo caso de
teste possível, e decidir se a saída observada bate com ele, é **indecidível no caso geral**. Para
uma função `f(n: int) -> int` o espaço de entrada já é infinito; um teste não pode enumerá-lo.
Qualquer sistema que prometa "todos os cenários de erro" está mentindo ou redefinindo "todos".

**O que se entrega no lugar** — três coisas concretas, cada uma verificável:

| # | O que é entregue | Onde vive | Como se verifica |
|---|---|---|---|
| 1 | **Enumeração fechada e nomeada.** O desafio declara a lista explícita dos cenários que cobre: `scenario_id`, `test_name`, `kind` ∈ {`example`, `boundary`, `error`, `property`, `metamorphic`, `regression`}, `description` em pt-BR | `meta.json` → `scenarios[]`, e a tabela do `README.md` do desafio | o aluno lê a lista; é "estes cenários, nomeados, e nenhum outro é cobrado" |
| 2 | **Mensagem de falha didática por cenário.** Cada cenário vermelho devolve entrada, esperado, obtido e **a propriedade violada em linguagem do domínio** | o arquivo de teste; `scenarios[].failure_message_template` planeja a mensagem | o aluno "só roda o teste pra saber se passou" — e, quando não passou, sabe *o quê* e *por quê* |
| 3 | **Cobertura medida, não prometida.** Quanto o conjunto nomeado cobre é um **número que sai de execução**: o mutation score | `meta.json` → `validation.mutation` | score 0,64 com três sobreviventes não é "completo", e o manifesto diz isso, listando cada sobrevivente |

Uma classe inteira fica coberta melhor que por enumeração: as **propriedades invariantes**
(`kind: property`). `fatorial(n) == fatorial(n-1) * n` para todo `n` de 1 a 7 é um único caso que
cobre uma *família* de entradas. É o mais perto que se chega de "todos os cenários" sem mentir.

### 3.1.3 A formulação canônica, e a proibição que o gate verifica

> **DES-3** — nunca prometa "todos os cenários de erro". A frase canônica é:
> *"o teste cobre estes N cenários nomeados; o mutation score medido foi X%"*.

**I-42** verifica isso mecanicamente: nenhum documento nem template do repositório contém a string
"todos os cenários de erro" como promessa. O `grep` é cego — a frase não pode aparecer **nem dentro
de uma negação** no `README.md.tmpl` do desafio.

### 3.1.4 "Validado pelo agente de código" — a leitura intuitiva é sinal fraco

Ver §3.2. A visão de conjunto das três contradições entre o pedido e a realidade está em §0.3.

---

## 3.2 ⭐ O LLM autora, o harness julga

### 3.2.1 Por que uma segunda chamada de modelo não serve de juiz

A leitura intuitiva de "validado pelo agente de código" é "um segundo LLM lê o teste e diz se está
bom". A evidência contra:

| Fonte | Achado |
|---|---|
| Huang et al., arXiv 2310.01798 (ICLR 2024) | em autocorreção **intrínseca** — sem feedback externo de ground truth, ferramenta ou ambiente — os modelos falham em se autocorrigir e, em alguns casos, **pioram** o resultado |
| SELF-[IN]CORRECT, arXiv 2404.04298 | modelos têm dificuldade sistemática em distinguir, entre duas respostas que eles mesmos geraram, qual é a correta |
| CriticGPT, OpenAI arXiv 2407.00215 | mesmo um crítico **treinado com RLHF especificamente** para a tarefa produz bugs alucinados que exigem revisão humana para filtrar |

E o cenário deste produto é pior que o do CriticGPT: é **o mesmo modelo, sem treino especializado,
relendo a própria geração**.

### 3.2.2 A separação de papéis — inegociável

> **O LLM AUTORA. O HARNESS JULGA.**
>
> O tutor (LLM) escreve o enunciado, o stub, o teste, a implementação de referência e as
> alternativas. **O tutor nunca decide se o teste está bom.** Quem decide é `challenge-verify.sh`:
> um harness de execução determinístico, cujo veredito vem de **exit codes, contagens de casos
> executados e aritmética sobre um catálogo fixo de mutantes** — nada que dependa de o modelo
> julgar a si mesmo.

Três amarrações que tornam a regra verificável, e não uma frase de efeito:

| Amarração | Onde |
|---|---|
| Nenhum campo de `validation` no `meta.json` pode ser preenchido por julgamento de modelo | o schema força: `validation.harness` é enum de **um único valor**, `"challenge-verify.sh"` |
| Nada chega ao aluno sem `verdict: approved` **e** `challenge_status: "validated"` | **DES-2**; `weak` e `rejected` não saem |
| A única opinião do modelo no protocolo inteiro é a classificação de um sobrevivente de mutação, sobre um diff de **uma linha**, com justificativa escrita e auditável | §3.11 (REQUEST/APPLY) |

É o que TestGen-LLM (Meta, arXiv 2402.09171) faz em produção: não pergunta ao modelo se o teste é
bom, **filtra por critérios executáveis**. Os números daquele estudo justificam o rigor — dos testes
gerados brutos, **75% compilavam, 57% passavam de forma confiável, 25% aumentavam cobertura**, e a
razão de aproveitamento até virar candidato aceito foi de **1:20** em produção real.

### 3.2.3 O que uma segunda passada de LLM continua podendo fazer

Continua permitida para o que execução **não mede**: clareza didática da mensagem de falha,
qualidade do texto do enunciado, adequação da analogia. **Nunca** como gate de correção.

---

## 3.3 Anatomia de um desafio

### 3.3.1 Os artefatos obrigatórios

| Artefato | Existe para | Sem ele, o que quebra |
|---|---|---|
| **Enunciado** `README.md` | dizer o que resolver, em linguagem de domínio, e listar os cenários nomeados | o aluno não sabe o que está sendo cobrado e lê a falha como arbitrária |
| **Stub** `stub.<ext>` | o **único** arquivo que o aluno edita: assinatura pronta, corpo vazio | o aluno gasta esforço adivinhando nome/assinatura; e o passo 1 do protocolo não tem contra o que rodar |
| **Teste** `tests/test_stub.<ext>` | a especificação executável — o que o aluno lê e contra o que coda | não há desafio |
| **Referência** `.solution/reference.<ext>` (oculta) | ser o oráculo real: o valor esperado vem de **executar** isto | volta o modo de falha mais grave — o LLM erra a conta e o teste vira impossível |
| **Alternativas** `.solution/reference_alt_*.<ext>` (ocultas) | detectar over-specification **por execução**: corretas e estruturalmente diferentes | o teste pode estar acoplado a *uma* solução e reprovar quem achou outra igualmente válida |
| **Stub vazio canônico** `.solution/empty_stub.<ext>` (oculto) | reexecutar o passo 1 depois que o aluno já editou o stub | revalidar um desafio em andamento vira impossível sem destruir o trabalho do aluno |
| **Mutantes** (disco temporário, **nunca versionados**) | medir se o teste detecta defeito de verdade | o teste pode ser tautológico e ninguém saber |
| **Runner** `runner.sh` | ponto de entrada **único**: chama `sm_sandbox_run`, fixa `cwd` e ambiente, normaliza exit code e **extrai a contagem** | cada linguagem vaza suas idiossincrasias de exit code e layout para o resto do sistema |
| **Manifesto** `meta.json` | identidade, cenários, resultado da validação, mutation score, progresso do aluno | nada é auditável nem retomável entre sessões |

### 3.3.2 O que o aluno vê e o que fica oculto

```
challenges/0007-fatorial-iterativo/
├── README.md                 # 👁 enunciado, cenários nomeados, como rodar
├── stub.py                   # ✏️ ÚNICO arquivo que o aluno edita
├── tests/
│   ├── __init__.py
│   └── test_stub.py          # 👁 o aluno LÊ (é a especificação); não deve editar
├── runner.sh                 # 👁 ponto de entrada: ./runner.sh
├── meta.json                 # 👁 manifesto — é onde os cenários estão
└── .solution/                # 🚫 OCULTO
    ├── reference.py
    ├── reference_alt_recursiva.py
    ├── reference_alt_acumulador.py
    └── empty_stub.py
```

👁 visível · ✏️ **o único arquivo que o aluno edita** · 🚫 oculto.

| Regra | Conteúdo |
|---|---|
| **O ponto de `.solution/` é funcional, não cosmético** | `ls` comum não lista, `git status` trata normalmente, **e** tanto o `go tool` quanto o `cargo` ignoram diretórios iniciados por `.` — as referências convivem dentro do módulo/crate sem entrar no build. **[VERIFICADO]**: com `.solution/reference.go` contendo erro de sintaxe proposital, `go test ./...` nem o menciona |
| **DES-7** | o tutor jamais lê, cita ou parafraseia conteúdo de `.solution/` numa resposta — nem "só a ideia geral". A revelação ocorre só no último degrau da escada de dicas, a pedido explícito, marcando `solution_revealed: true` e `solution_revealed_at`; o desafio passa a contar como **ensinado**, não resolvido |
| **`meta.json` é visível de propósito** | é lá que mora a lista de cenários nomeados, que é o que o aluno tem direito de saber. Os campos de validação também: ver um mutation score de 0,93 com um sobrevivente classificado como equivalente é **transparência**, não vazamento — o sobrevivente descreve uma mudança de uma linha na referência, não a referência |
| **Exceção do sobrevivente revelador** | quando o `after` do mutante é praticamente a solução, `before`/`after` são gravados como `"<omitido: revelaria a solução>"` e a justificativa fica em `.solution/`. O score continua visível |

> **PERGUNTE AO USUÁRIO (D-C09)** — Os mutantes sobreviventes ficam visíveis no manifesto que o aluno pode ler?
> O mutante sobrevivente é um bug que o teste não pegou — e mostrar o código dele às vezes entrega a solução de bandeja.
> **Opções:** **(a)** omitir `before`/`after` quando revelarem a solução, mantendo o score visível — transparência sobre a qualidade do teste sem entregar a resposta; exige julgar caso a caso o que é revelador · **(b)** sempre visíveis — transparência total, e ler o manifesto vira atalho para a solução · **(c)** manifesto inteiro oculto — zero vazamento, e o aluno não consegue nem saber se o teste dele era bom
> **Default:** **(a)** · **Custo de mudar depois: cheap**

### 3.3.3 Por que as alternativas existem, e quantas

A referência sozinha responde "o teste passa contra uma implementação correta?". Ela **não** responde
"o teste passa contra *qualquer* implementação correta?". A diferença é a *over-specification*: um
teste que espia contagem de chamadas, nome de variável interna, ou ordem de operação não observável
externamente passa contra a referência e **reprova o aluno que resolveu de outro jeito**.

Detectar isso por leitura é opinião. Detectar por execução é binário: roda-se o teste contra uma
implementação **comprovadamente correta e estruturalmente diferente**, e a resposta é o exit code.

| Regra | Valor |
|---|---|
| Mínimo de alternativas | **2**, quando existir mais de uma estratégia idiomática (iterativa × recursiva × `reduce`/built-in; busca linear × binária; tabela × recorrência) |
| 0 alternativas | aceitável **só** quando o desafio realmente admite uma estratégia só, e o motivo fica escrito em `steps.step_3_alternatives.detail`. Omissão registrada não é aprovação silenciosa |
| Nomes na semente canônica | `reference_alt_recursiva` (recursão) e `reference_alt_acumulador` (laço/fold em outra direção) |

### 3.3.4 Como referência, alternativas e stub vazio nascem

Todos são derivados **do próprio stub materializado**, trocando as linhas entre as marcas
`SM_CORPO_INICIO` e `SM_CORPO_FIM` pelo corpo real.

| Arquivo | Como nasce |
|---|---|
| `empty_stub.<ext>` | **cópia byte a byte** do stub recém-materializado |
| `reference.<ext>` | stub com o corpo trocado pela implementação iterativa |
| `reference_alt_recursiva.<ext>` | idem, recursão |
| `reference_alt_acumulador.<ext>` | idem, laço/fold em outra direção |

**Consequência contratual**: qualquer uma delas é copiada **por cima do stub** e compila no lugar
dele — que é exatamente como `challenge-verify.sh` roda os passos 1, 2 e 3. Se o template do stub
não tiver as duas marcas, `challenge-new.sh` falha com **exit 1** e nomeia a marca ausente.

### 3.3.5 O manifesto no nascimento — `draft`

`meta.json` nasce do template, recebe merge autoritativo por `jq`, é gravado por `sm_atomic_write` e
**validado** contra `challenge-manifest.schema.json` (falha → **exit 5**, uma linha por erro em
stderr). Os 19 campos de topo obrigatórios são `schema_version`, `challenge_id`, `slug`, `title`,
`created_at`, `updated_at`, `language`, `layout_profile`, `skill_level`, `difficulty`,
`target_concepts`, `challenge_status`, `artifacts`, `execution`, `scenarios`, `oracle`, `validation`,
`integrity`, `student_progress`.

| Campo | Valor no nascimento |
|---|---|
| `challenge_status` | `"draft"` |
| `validation.harness` | `"challenge-verify.sh"` (enum de um valor) |
| `validation.verdict` | `"not_run"`; os **7** `steps.*.status` = `"skipped"`; `generation_attempts: 0` |
| `validation.steps.*` | `step_0_build` · `step_1_empty_stub` · `step_2_reference` · `step_3_alternatives` · `step_4_mutation` · `step_5_determinism` · `step_6_counts` |
| `integrity` | `{policy: "warn", test_sha256: null, reference_sha256: null}` |
| `scenarios[]` | 4 objetos `{scenario_id, test_name, kind, description}` na semente canônica |
| `scenarios[].test_name` | **o nome como o runner da linguagem o reporta** — `tests::<id>` em Rust, `tests.test_stub.TesteDesafio.test_<id>` em Python, `Test<Camel>` em Go, `<id>` em Node e C |
| `execution.expected_test_count` | `len(scenarios)` — sempre |
| `execution.sandbox` | `{mode: "posix_floor", network_isolated: false, timeout_source: <sondado>}` |
| `execution.failure_exit_codes` | `{policy: "non_zero_is_failure", known_failure_code: 1\|101, timeout_exit_code: 137, requires_output_grep: false}` |
| `artifacts.*` | todos **relativos** à raiz do desafio; nenhum caminho absoluto (**I-37**) |
| `oracle` | `{strategies: ["reference_impl"], numeric_mode: "exact_int"}` na semente |
| `student_progress` | `{attempts: 0, last_result: "not_run", hint_level_used: 0, solution_revealed: false}` |

O enunciado nasce marcado `[RASCUNHO]`. O tutor reescreve o conteúdo antes da validação; é por isso
que `challenge_status` nasce `draft`, e **DES-2** impede que um `draft` chegue ao aluno.

---

## 3.4 ⭐ O protocolo de validação, passo a passo

É o contrato que `challenge-verify.sh` implementa literalmente. **Nenhum desafio chega ao aluno com
`challenge_status` diferente de `validated`.**

### 3.4.0 Entradas, saídas e a função única

```
ENTRADAS
  D            diretório do desafio (challenges/<NNNN>-<slug>/)
  M            D/meta.json, já preenchido pelo tutor
  T            M.artifacts.test_path            — o teste
  R            M.artifacts.reference_path       — a referência correta, oculta
  E            M.artifacts.empty_stub_path      — o stub vazio canônico
  R_ALT        M.artifacts.reference_alt_paths  — alternativas corretas (pode ser vazia)
  OPERADORES   catálogo FIXO de mutação, versão 1.0 (§3.5) — nunca pedido a um modelo
  N_REP        3       (repetições do passo 5; 20 em desafio de concorrência)
  LIMIAR       0.90    (mutation score mínimo — D-C03)
  T_MAX        M.execution.timeout_seconds

SAÍDAS  (gravadas em M.validation)
  verdict ∈ { approved, weak, rejected, not_run }
  steps.step_0..step_6, cada um com status ∈ { passed, failed, skipped, not_applicable }
  mutation.{ operators_version, generated, valid, invalid, killed, survived,
             score, threshold, equivalent_count, sample_size, detail, survivors[] }
  rejections[] — { attempt, code, message } — o insumo do prompt de regeneração

SAÍDA INTERMEDIÁRIA  (stdout, exit 10, nada gravado em disco)
  o PEDIDO de classificação dos sobreviventes (§3.11)
```

**Invariante global**: toda execução de teste passa por uma função única
`executar(implementação) -> {exit_code, tests_run, tests_failed, wall_ms, out}`. Nada roda fora dela.

1. **instala** a implementação em `artifacts.stub_path` — o stub do aluno é salvo antes e restaurado
   no `trap EXIT`, **inclusive em caminho de erro**;
2. **limpa o cache de bytecode**: `__pycache__`, `*.pyc`, `.pytest_cache` sob o desafio (§3.6);
3. **exporta o ambiente**: `LC_ALL`, `LANG`, `TZ`, `PYTHONHASHSEED`, `PYTHONDONTWRITEBYTECODE=1`,
   `NODE_COMPILE_CACHE=""`, `SOURCE_DATE_EPOCH`, `CHALLENGE_TIMEOUT`, `CHALLENGE_EXPECTED_TESTS`,
   mais `execution.env`;
4. **endurece o argv**: interpretador Python sem `-B` → o harness **insere `-B`**. A proteção não
   pode depender do que `challenge-new.sh` escreveu no manifesto;
5. roda `execution.build_command` (se houver) por `sm_sandbox_run`; build vermelho encerra a execução
   com o exit code do build e contagens zeradas;
6. roda `execution.test_command` como **argv, sem shell**, por
   `sm_sandbox_run "<challenge_dir>/<working_dir>" -- <argv…>`, medindo o tempo com `date +%s%N`;
7. extrai `tests_run`/`tests_failed` pelo `execution.test_count_probe`.

**Três regras de leitura, sem exceção:**

| Regra | Enunciado |
|---|---|
| **Regra 1** | falha é `exit_code != 0`, **jamais** `== 1` |
| **Regra 1b** | `timeout` é decidido por **tempo decorrido ≥ `timeout_seconds`**, nunca por exit code |
| **Regra 3** | `set -euo pipefail`; `comando \| tail -1` devolve o status do `tail` — verde com teste vermelho |

**Probes de contagem** (`execution.test_count_probe`):

| Probe | Extração de `tests_run` | Extração de `tests_failed` |
|---|---|---|
| `python_unittest_ran_line` | última `^Ran ([0-9]+) tests?` | `0` se houver `^OK`, senão soma de `(failures\|errors)=N` |
| `node_test_tap_summary` | `^# tests (N)` | `^# fail (N)` |
| `go_test_json_run_events` | valores **distintos** de `"Test"` em `"Action":"run"` | idem em `"Action":"fail"` |
| `cargo_test_running_lines` | **soma** de `^running (N) tests?` (há uma por binário) | soma de `(N) failed` |
| `junit_console_summary` | `N tests successful` | `N tests failed` |
| `counter_protocol` | `^TESTS_RUN=` | `^TESTS_FAILED=` |
| `none` | — | **rejeitado no passo 0** |

**Probes de nomes** (insumo do 6.2): Python reexecuta com `-v` no argv e lê `^(\w+) \(` · Node
`^(not )?ok \d+ - (.+)$` · Go `"Test"` distintos · Cargo `^test (\S+) \.\.\.` · `counter_protocol` e
`none` **não expõem nomes**: o 6.2 cai para igualdade de contagem e **registra isso em `detail`**.

### 3.4.1 PASSO 0 — build e sanidade estrutural

| Item | Conteúdo |
|---|---|
| **Entrada** | `D`, `M` |
| **Saída** | `steps.step_0_build` |
| **Verificações** | 0.1 `meta.json` valida contra `challenge-manifest.schema.json` (falha → **exit 5**, não é rejeição do desafio) · 0.2 todo caminho de `artifacts` existe (`statement`, `stub`, `test`, `runner`, `reference`, `empty_stub`, cada `reference_alt_paths[]`, `working_dir`) · 0.3 `len(scenarios) == execution.expected_test_count` · 0.4 `layout_profile` é o exigido pela `language` e o manifesto do layout existe · 0.5 havendo `build_command`, **o stub vazio compila** · 0.6 `test_count_probe != "none"` |
| **Código de rejeição** | `build_failed` |

`empty_stub_path` ausente **é rejeição**: sem ele o passo 1 não tem contra o que rodar depois que o
aluno editou o stub.

Mapa `language → layout_profile` cobrado em 0.4: `go`→`go_module` · `rust`→`cargo_crate` ·
`java`/`kotlin`→`java_classfile` · `csharp`→`dotnet_project` · `elixir`→`mix_project` ·
`swift`→`swiftpm` · `julia`→`julia_project` · `haskell`→`cabal_project` · demais →`generic`.

### 3.4.2 PASSO 1 — o teste DEVE FALHAR contra o stub vazio

| Item | Conteúdo |
|---|---|
| **Entrada** | `T`, `E` |
| **Saída** | `steps.step_1_empty_stub` |
| **Exige** | `tests_run == expected_test_count` · `exit_code != 0` · `tests_failed >= 1` |

| Observado | Código de rejeição |
|---|---|
| `tests_run == 0` | `zero_tests_executed` |
| `tests_run != expected` | `test_count_mismatch` |
| `exit_code == 0` | `passes_on_empty_stub` — o teste é **tautológico** |
| `exit_code != 0` e `tests_failed == 0` | `test_malformed` — o teste não carregou |

*Por que existe*: sozinho, elimina a classe inteira de asserções vazias (`assert x is not None`,
`expect(Array.isArray(r)).toBe(true)`). É o passo mais barato e o de maior retorno.

### 3.4.3 PASSO 2 — o teste DEVE PASSAR contra a referência

| Item | Conteúdo |
|---|---|
| **Entrada** | `T`, `R` |
| **Saída** | `steps.step_2_reference` |
| **Exige** | contagem igual · `exit_code == 0` · `tests_failed == 0` · `wall_ms < timeout_seconds × 1000` |

| Observado | Código de rejeição |
|---|---|
| vermelho contra `R` | `fails_on_reference` — o **teste impossível**, o modo de falha mais destrutivo pedagogicamente: o aluno "corrige" um código já correto até quebrá-lo |
| `wall_ms` estourado | `timeout_on_reference` |
| contagem divergente | `test_count_mismatch` |

### 3.4.4 ⭐ PASSO 3 — o teste DEVE ACEITAR referências alternativas corretas

**Este é o primeiro dos dois passos que o senso comum não teria.** Ele detecta over-specification
**por execução, e não por opinião**: em vez de pedir a um segundo modelo que "perceba" o acoplamento,
roda-se o teste contra uma implementação comprovadamente correta e estruturalmente diferente.
Resposta binária, sem alucinação possível.

| Item | Conteúdo |
|---|---|
| **Entrada** | `T`, `R_ALT` |
| **Saída** | `steps.step_3_alternatives` |
| **Código de rejeição** | `rejects_correct_alternative` |

| Situação | Comportamento |
|---|---|
| `R_ALT` vazia | `status: not_applicable`, e o `detail` diz **por que** não há alternativa estrutural plausível. Omissão registrada não é aprovação silenciosa |
| Alternativa reprovada | entra em `steps.step_3_alternatives.alternatives_rejected[]` com `path`, `failing_test_names[]` (que nomeiam **exatamente a asserção acoplada**) e `resolution` |
| Resolução | o harness grava `resolution: "unresolved"`. Afrouxar a asserção culpada (`assertion_relaxed`) ou regerar o teste (`test_regenerated`) é **ação de autoria**; quem edita reexecuta o protocolo **desde o passo 0** |
| Fechamento | `unresolved` é **incompatível** com `approved` — o 6.3 cobra isso |

**[VERIFICADO]**: um teste que espia `co_varnames` passa contra `R` e é reprovado no passo 3 pelas
duas alternativas; `failing_test_names` nomeia a asserção culpada.

### 3.4.5 ⭐ PASSO 4 — o teste DEVE MATAR o catálogo fixo de mutantes

**Este é o segundo passo que o senso comum não teria.** Os passos 1 e 2 aprovam um teste de um único
`assertEqual`; o passo 4 é quem descobre que ele é fraco, e **devolve material acionável** — cada
sobrevivente nomeia um cenário ausente.

| Item | Conteúdo |
|---|---|
| **Entrada** | `T`, `R`, `OPERADORES` |
| **Saída** | `steps.step_4_mutation` + `validation.mutation` |
| **Código de rejeição** | `mutation_score_below_threshold` (→ `weak`) · `build_failed` (nos dois casos degenerados abaixo) |

| Sub-passo | Regra |
|---|---|
| **4.1** | gera `M1..Mk` com o catálogo fixo do §3.5, **uma mutação por mutante**. Determinístico: mesma `R` → mesma lista, mesma ordem. **Os mutantes nunca são pedidos a um modelo** |
| **4.2** | para cada `Mi`, `executar(Mi)`: `tests_run != expected_test_count` (não compilou, não carregou) → **inválido**, fora do denominador e **não** conta como morto · `exit_code != 0` → **morto** · `exit_code == 0` → **sobrevivente**, com `operator`, `file`, `line`, `before`, `after`, `classification: "unclassified"` |
| **4.3** | `valid = killed + survived`; `score_bruto = killed / valid`. ⭐ **`valid == 0` é `build_failed`**: referência que nenhuma mutação mecânica altera não sustenta desafio |
| **4.4** | `survived > 0` **e** passos 0–3 todos não-`failed` → **para** e emite o PEDIDO (§3.11). Se um passo obrigatório já reprovou, o veredito já é `rejected` e a classificação não pode mudá-lo: segue o caminho degradado — todo sobrevivente fica `unclassified` e conta como `test_gap` |
| **4.5** | `equivalent_count = \|{s : s.classification == "equivalent"}\|`; `score = killed / (valid - equivalent_count)`. ⭐ **Guarda**: `valid - equivalent_count == 0` **não** é score 1,0 — é `build_failed`. `score >= threshold` → aprovado; `score < threshold` → `weak`. **Nunca** aprovar direto |

**Amostragem** (`--sample-size`, ou automática quando há `build_command` e `k × tempo > 120 s`): os
**primeiros** da ordem canônica, **nunca sorteados** — duas execuções sobre a mesma referência têm
que dar a mesma amostra, senão o score deixa de ser comparável entre tentativas de regeneração.
Amostrar reduz a força do passo 4 e isso vai no `detail`; **não** reduz o limiar.

> **PERGUNTE AO USUÁRIO (D-C03)** — Qual é o limiar de mutation score para aprovar um desafio gerado?
> É o controle de qualidade do gabarito: o motor estraga o código de propósito e vê se o teste percebe. Exigir 100% gera regeneração infinita, porque alguns estragos não mudam comportamento nenhum.
> **Opções:** **(a)** 0,90, com os mutantes equivalentes fora do denominador — separa com folga o teste fraco (0,750) do forte (1,000) e reprova quem perdeu dois cenários em 17; ainda deixa passar uma suíte com um cenário a menos · **(b)** 0,80 — menos regeneração, e não reprova uma suíte que perdeu dois cenários · **(c)** 1,00 — rigor máximo, e regeneração infinita em desafios com muitos mutantes equivalentes
> **Default:** **(a)** · **Custo de mudar depois: cheap**

> **PERGUNTE AO USUÁRIO (D-C08)** — Amostragem de mutantes em linguagens compiladas: quando parar de testar todos?
> Cada mutante compilado é um build inteiro. Um desafio Rust com 17 mutantes a 4 segundos de build passa de um minuto só nesse passo, e o aluno fica olhando o cursor.
> **Opções:** **(a)** amostrar acima de 120 s de build total, com amostra determinística — mesmo desafio, mesmo score, sempre, e o critério fica gravado em pt-BR; o score amostrado não é comparável com o completo · **(b)** nunca amostrar — score sempre completo, ao custo de minutos de espera em qualquer desafio compilado · **(c)** limitar sempre a k=8 — custo previsível, e amostra até quando testar tudo custaria 3 segundos
> **Default:** **(a)** · **Custo de mudar depois: cheap**

### 3.4.6 PASSO 5 — o teste DEVE ser DETERMINÍSTICO

| Item | Conteúdo |
|---|---|
| **Entrada** | `T`, `R`, `N_REP = 3` |
| **Saída** | `steps.step_5_determinism` |
| **Código de rejeição** | `nondeterministic` |

3 execuções contra `R` **variando o ambiente**:

| # | `LC_ALL` | `TZ` | `PYTHONHASHSEED` (ou equivalente) |
|---|---|---|---|
| 1 | `C` | `UTC` | `0` |
| 2 | `pt_BR.UTF-8` | `America/Sao_Paulo` | `1` |
| 3 | `C.UTF-8` | `Asia/Tokyo` | `524287` |

Exige `(exit_code, tests_run, tests_failed)` **idêntico** nas três. `env_matrix[]` grava as
combinações como **string** (uma por repetição); `stable` grava o resultado.

*Por que variar ambiente e não só repetir*: bug dependente de locale/timezone é **determinístico dado
um ambiente fixo** — rodar 10× no mesmo ambiente nunca o exporia. **[VERIFICADO]** o mesmo script
devolve `1.234,50` sob locale pt-BR e `1234.50` sob `LC_ALL=C`; `02:40 -03` sob
`TZ=America/Sao_Paulo` e `05:40 UTC` sob `TZ=UTC`; e a ordem de iteração de um `set` de strings muda
por completo a cada `PYTHONHASHSEED`, sendo **aleatória por processo** quando a variável não está
fixada.

**Limitação declarada no `detail`**: pega *Time*, *Randomness*, *Unordered Collections*,
*Platform Dependency* e boa parte de *Test Order Dependency* (taxonomia de Luo et al., FSE 2014).
**Não pega** *Async-Wait* (45% dos casos daquele estudo) nem *Concurrency* (20%). Desafio cujo
conceito-alvo é concorrência/assincronia sobe `N_REP` para **20** e ainda assim grava o aviso.

### 3.4.7 PASSO 6 — contagens e consistência final

| Item | Conteúdo |
|---|---|
| **Entrada** | todos os resultados anteriores |
| **Saída** | `steps.step_6_counts` |
| **Código de rejeição** | `test_count_mismatch` |

| Sub-passo | Verificação |
|---|---|
| 6.1 | `tests_run == expected_test_count` em **todas** as execuções dos passos 1, 2, 3 e 5 |
| 6.2 | os nomes reportados cobrem **exatamente** `{scenarios[].test_name}`, nem a mais nem a menos. Nome igual ao caminho do arquivo de teste é reportado como o **envelope de arquivo do `node:test`** (§3.7). Pega também o teste que o modelo escreveu e esqueceu de declarar em `scenarios` |
| 6.3 | nenhum `alternatives_rejected[].resolution == "unresolved"` |
| 6.4 | `oracle.numeric_mode == "float_tolerance"` exige `rel_tol` **ou** `abs_tol` |

### 3.4.8 PASSO 7 — veredito e selagem

```
SE algum de {0,1,2,3,5,6} = failed         -> rejected
SENÃO SE passo 4 = failed por build_failed -> rejected
SENÃO SE passo 4 = failed                  -> weak
SENÃO                                      -> approved
```

| Veredito | Efeito |
|---|---|
| `approved` | `challenge_status: "validated"`; o **harness** calcula `integrity.test_sha256` e `reference_sha256` com `sha256sum`; o desafio pode ir ao aluno |
| `weak` / `rejected` com tentativa disponível | `challenge_status: "draft"`, hashes `null`; regerar com `rejections[]` no prompt |
| Tentativa 3 esgotada | `challenge_status: "rejected"` + rejeição `attempt_limit_reached`; o tutor **descarta e propõe outro desafio do mesmo conceito** (**DES-9**) |

`validation.generation_attempts` sobe a cada execução; máximo **3** (D-C10 — TestGen-LLM mostra
aproveitamento de 1:20 em produção; insistir além disso custa tempo do aluno esperando).

> **PERGUNTE AO USUÁRIO (D-C10)** — Quantas tentativas de regeneração antes de desistir de um desafio ruim?
> É quantas vezes vale reescrever a mesma prova antes de trocar de prova. A pesquisa em produção mostra aproveitamento perto de 1 em 20 nesse tipo de geração.
> **Opções:** **(a)** 3 — corta a espera antes de ela virar minutos, e trocar de desafio no mesmo conceito custa menos que consertar um ruim; às vezes a quarta tentativa teria dado certo · **(b)** 1 — espera mínima, e descarta desafio que sairia bom na segunda · **(c)** 5 — mais chance de aproveitar a ideia original, com o aluno esperando · **(d)** sem limite — nunca desiste, e pode não terminar nunca
> **Default:** **(a)** · **Custo de mudar depois: cheap**

**Ordem de gravação**: o documento inteiro é montado em memória, **validado contra o schema** e só
então gravado por `sm_atomic_write`. Validar depois de gravar deixaria em disco um `meta.json` que a
próxima execução recusa a ler — o desafio ficaria travado pelo próprio harness. Falha → **exit 5**,
nada é alterado.

⚑ **Três reconciliações com `docs/05-challenges-tdd.md` §4.1, a favor do schema (que é a autoridade),
porque `challenge-manifest.schema.json` tem `additionalProperties: false`:**

| Campo | O que o schema aceita | O que o harness grava |
|---|---|---|
| `mutation.score_bruto` | **não existe** | vai **por extenso** no `mutation.detail`, junto da conta que produziu o `score`. Score sem `equivalent_count` e sem a conta ao lado é score que não dá para auditar |
| `mutation.sample_size` | `integer` ("igual a `valid` quando todos rodaram"), **não `null`** | grava `valid`; a **ausência** de amostragem é dita no `detail` |
| `steps.step_5.env_matrix[]` | `string`, **não objeto** | **uma string por repetição** |

Os 12 campos de `validation.mutation` são exatamente: `operators_version`, `generated`, `valid`,
`invalid`, `killed`, `survived`, `score`, `threshold`, `equivalent_count`, `sample_size`, `detail`,
`survivors`. Os 11 códigos de `rejections[].code` são: `build_failed`, `passes_on_empty_stub`,
`test_malformed`, `fails_on_reference`, `timeout_on_reference`, `rejects_correct_alternative`,
`zero_tests_executed`, `test_count_mismatch`, `nondeterministic`, `mutation_score_below_threshold`,
`attempt_limit_reached`.

### 3.4.9 Os exit codes de `challenge-verify.sh`

Tabela única de `docs/00-contratos.md` §5.1; nenhum outro código é produzido.

| Código | Quando |
|---|---|
| `0` | o protocolo terminou. ⚑ **`weak` e `rejected` também saem 0** — reprovar um desafio não é erro do script; o veredito está no stdout |
| `1` | erro de execução: I/O, dependência ausente, `sm_request` fora de contrato |
| `2` | uso incorreto — inclusive resposta de `--apply` semanticamente recusada |
| `3` | `<challenge_dir>` inexistente ou sem `meta.json` legível |
| `5` | falha de schema: `meta.json` de entrada, `meta.json` que seria gravado, ou o envelope da resposta |
| `10` | `needs_model_input`: o passo 4 achou sobreviventes. O PEDIDO está em stdout e **nada foi alterado em disco** |

⚑ `docs/05-challenges-tdd.md` §3.4 e `SK/references/challenge-protocol.md` dizem "`5` = weak/rejected".
Vale `docs/00-contratos.md` §8, a fonte única: **weak/rejected saem 0**; o `5` fica para falha de
schema.

**CLI**: `challenge-verify.sh <challenge_dir> [--sample-size N] [--n-rep N] [--threshold X]
[--apply <resposta.json>]` — `<challenge_dir>` default `$PWD`, `--n-rep` default `3`, `--threshold`
default `0.90`. stdout em exit 0: `{"verdict","mutation_score","killed","survived","rejections"}`.

### 3.4.10 Custo e regeneração dirigida

Execuções por validação: 1 (passo 1) + 1 (passo 2) + |R_ALT| (passo 3) + k (passo 4) + 3 (passo 5).
Com k = 17 e |R_ALT| = 2 são **24 execuções**. Em Python/Node/Lua cada uma custa dezenas de
milissegundos; em Rust/Go/Java/C o `build_command` domina — daí a amostragem de 4.5 e o reaproveitamento
do diretório de build entre mutantes (`target/` do cargo, cache do Go).

Cada regeneração recebe no prompt: o motivo estruturado (`rejections[].code` + `message`), os nomes
dos testes que falharam, e — no caso do passo 4 — o **diff exato de cada mutante sobrevivente**. Isso
não é "pedir ao LLM para se criticar" (§3.2): é dar ao autor um **sinal externo observável** sobre o
que exatamente não funcionou, o único regime em que Self-Refine/Reflexion demonstram ganho.

### 3.4.11 Conformidade verificada do protocolo

| Verificação | Resultado |
|---|---|
| `bash -n`, `py_compile` | limpos |
| Catálogo sobre a referência canônica | **17 mutantes**, ids idênticos aos de `docs/05` §5.4 |
| Teste **forte** (5 cenários) | 8 passos, 17 válidos, 16 mortos, 1 sobrevivente (`CRP@L5C20-`, equivalente), bruto 0,9412 → `score` **1,0000** → `approved` |
| Teste **fraco** (1 cenário) | passa nos passos 1 e 2; **12/17 = 0,7059** bruto, **12/16 = 0,7500** corrigido → `weak`, exit **0** |
| Cache de bytecode | nu **17/17 = 1,0000** × protegido **16/17 = 0,9412** |
| Over-specification | teste que espia `co_varnames` passa contra `R` e é reprovado no passo 3 pelas duas alternativas |
| Tautológico · impossível | `passes_on_empty_stub` no passo 1 · `fails_on_reference` no passo 2 |
| Contagem | 1 caso × `expected` 5 → `test_count_mismatch`; nome fora de `scenarios[]` com contagem certa → só o passo 6 pega |
| REQUEST/APPLY | pedido → **10** sem tocar em disco; sem `justification`, justificativa curta, mutante inventado, sobrevivente sem veredito → **2**; `request_id` ou `kind` errado → **5**; resposta válida (envelope **e** nativa) → **0** |
| Determinismo | teste dependente de `TZ` reprovado por `nondeterministic` |
| Desafio matemático | validado só por propriedades invariantes (zero `assertEqual` com valor fixado); 9 mutantes, 9 mortos, `score` 1,0000 → `approved` |

---

## 3.5 ⭐ O catálogo FIXO de mutação — versão 1.0

Motor: `SK/scripts/lib/_mutate.py`, modo `0755`. O `_` inicial o mantém fora da tabela canônica de
CLI (`docs/00-contratos.md` §8) — é auxiliar, não comando da skill.

### 3.5.1 Por que fixo, e por que nunca pedido ao modelo

Se os mutantes forem "pedidos ao modelo", **o mesmo viés que gerou o teste gera os mutantes**: o
modelo propõe os defeitos que ele já imaginava, o teste já os cobre, e o score sobe sem que a suíte
tenha ficado melhor. MuTAP reporta 93,57% de mutation score usando um LLM para gerar mutantes —
número real, que mede "o teste pega os bugs que *este modelo* imaginou", não bugs em geral; o estudo
de replicação arXiv:2607.22880 questiona exatamente essa correlação.

**DES-5** fecha a regra: o catálogo é **fixo e mecânico** (ROR AOR LCR UOI CRP SDL RVR SVR); nunca
peça mutantes a um modelo. Mutantes gerados por LLM ficam **proibidos como fonte primária**; se um
dia forem usados, é como camada *adicional*, com contagem separada, nunca misturada neste score.

### 3.5.2 A regra de aplicação

Aplicação: **texto do fonte, uma mutação por mutante**, apenas em linhas que não sejam vazias nem
comentário, com fronteiras de token respeitadas. Strings literais e comentários são **mascarados**
antes de qualquer regex casar — o `404` de `"erro 404"` não é literal mutável, e o `<` de uma
docstring não é operador. **Nenhum AST.** O motor é o mesmo para todas as linguagens; entre perfis
(`python` e `c_family`) muda o marcador de comentário, o delimitador de string, os conectores lógicos
e a forma do no-op. O único operador que precisa de mais que regex de linha é o SVR, e o que ele
precisa é uma **tabela de nomes** montada por varredura, não uma árvore sintática.

⭐ **A regra que fecha a ambiguidade da contagem — operadores compostos não são mutáveis:**

> Um caractere de operador que faça parte de um **operador composto de atribuição** (`+=`, `-=`,
> `*=`, `/=`, `%=`, `//=`, `**=`, `&=`, `|=`, `^=`, `<<=`, `>>=`) **não é mutado**. Também não são
> mutados `**`, `//`, `<<`, `>>` e `->`, que não são operadores deste catálogo.
>
> **Implementação**: o tokenizador casa operadores **gulosamente por comprimento decrescente**, então
> `*=` nunca é visto como `*` e `**` nunca como dois `*`. A regra deixa de ser lista de exceções e
> vira **propriedade do casamento**.

Por que isso importa mais do que parece: `acc *= i` → `acc /= i` **muda o resultado**, então esse
mutante seria válido e provavelmente morto — ou seja, incluí-lo **infla numerador e denominador ao
mesmo tempo**, e o mutation score, que é o portão de aprovação em 0,90, muda de valor conforme a
implementação decida. Duas implementações do "mesmo" catálogo com denominadores diferentes é o
defeito que esta regra existe para eliminar. Quem quiser cobrir a troca em atribuição composta usa
AOR na forma expandida (`acc = acc * i`), que é o que uma referência legível costuma escrever.

### 3.5.3 A tabela dos 8 operadores

| ID | Nome | Transformação | Quantos mutantes | Bug real que representa |
|---|---|---|---|---|
| **ROR** | Relational Operator Replacement | `<`↔`<=` · `>`↔`>=` · `==`↔`!=` | 1 por ocorrência | erro de borda: incluir ou excluir o extremo do intervalo |
| **AOR** | Arithmetic Operator Replacement | `+`↔`-` · `*`→`/` · `/`→`*` · `%`→`*` | 1 por ocorrência **não composta** | fórmula trocada |
| **LCR** | Logical Connector Replacement | `and`↔`or` · `&&`↔`\|\|` | 1 por ocorrência | condição composta errada |
| **UOI** | Unary Operator Insertion/Removal | remove `not ` · remove `!` antes de identificador | 1 por ocorrência | condição invertida |
| **CRP** | Constant Replacement | cada literal inteiro `n` vira `n+1` **e** `n-1` | **2 por literal inteiro** | off-by-one clássico |
| **SDL** | Statement Deletion | linha executável elegível → no-op (`pass` / `;` / `{}`) | 1 por linha **elegível** | passo esquecido; validação removida |
| **RVR** | Return Value Replacement | corpo **inteiro** da função → `return <valor-zero>` | **1 por função que devolve valor** | o caso degenerado: se sobrevive, o teste é tautológico |
| **SVR** | Scalar Variable Replacement | troca uma **leitura** de local por outra local já ligada | **1 por ocorrência de leitura elegível** | variável errada usada por engano |

### 3.5.4 As três regras de contagem que mudam o denominador

Estas regras **mudam o denominador do mutation score**, que é o portão de aprovação. São normativas.

**SDL — linhas elegíveis.** É elegível toda linha **executável** que **não** seja: assinatura
(`def`/`class`/`func`/decorador), `return`, `import`/`from … import`, `global`/`nonlocal`, linha que
**abre bloco** (termina em `:` na família Python, ou começa com
`if`/`for`/`while`/`else`/`try`/`with`/`except`/`finally`/`match`/`case`), ou linha que já é no-op
(`pass`). Deletar linha que abre bloco produz mutante que **não compila** — inválido, ruído no
denominador. `return` fica de fora porque é território do RVR.

**RVR — exatamente 1 por função que devolve valor.** Condição: a função tem ao menos um
`return <expr>` com expressão. Função só de efeito colateral gera **0** — o mutante seria idêntico à
referência, **equivalente por construção**, e equivalente por construção não entra no denominador
para depois sair dele. Valor-zero inferido do fonte:

| Tipo aparente | Valor-zero |
|---|---|
| literal numérico | `0` |
| texto | `""` |
| lista / sequência | `[]` |
| mapa | `{}` |
| booleano / comparação | `False` |
| nome nu | resolvido pela atribuição **simples** àquele nome no corpo (a composta aritmética já implica numérico) |
| nada inferível | `None` |

**SVR — 1 por ocorrência de leitura, não por par.** É a regra que impede a explosão combinatória:
com 3 locais e 4 leituras, "todos os pares" dá **8** mutantes; esta regra dá **4**.

| Conceito | Definição |
|---|---|
| *Ocorrência elegível* | leitura de nome local. **Nunca** alvo de atribuição — inclusive o alvo de atribuição composta (`acc` em `acc *= i`) e a variável de laço na própria linha do `for`. Nome de função em chamada, atributo depois de `.`, nome global/importado e palavra reservada também não |
| *Ligados naquele ponto* | parâmetros da assinatura + nomes ligados por atribuição ou `for` em linhas **estritamente anteriores**, com a variável de laço contando a partir do corpo. Menos de 2 ligados → a linha não gera mutante |
| *Substituição* | o **nome imediatamente anterior na ordem de ligação**, ciclicamente dentro do conjunto de ligados. Um mutante por ocorrência, determinístico, sem sorteio |
| *Como a tabela de nomes é montada* | três regex sobre o texto já mascarado — lista de parâmetros da assinatura, `<nome> =` / `<nome> op=`, e `for <nome> in`. Continua sem AST |

### 3.5.5 Ordem canônica e `mutant_id`

**Ordem canônica**: ROR → AOR → LCR → UOI → CRP → SDL → RVR → SVR; dentro de cada operador, por
**linha e coluna crescentes**. É também a ordem de amostragem (§3.4.5).

**`mutant_id`** = `<OP>@L<linha>C<coluna>`, **1-based nos dois**. ⭐ **CRP acrescenta o sinal da
direção** (`CRP@L2C12+` para `n+1`, `CRP@L2C12-` para `n-1`) porque produz **dois** mutantes no mesmo
sítio; sem o sufixo os ids colidem e o pareamento pedido/resposta do §3.11 quebra. **Nenhum outro
operador produz mais de um mutante no mesmo sítio.**

**Mutantes inválidos** (não compilam, ou fazem `tests_run != expected_test_count`) são
**descartados**, não contados como mortos — contá-los como mortos inflaria o score exatamente onde
ele deveria doer.

### 3.5.6 A contagem de referência, verificada por execução

Referência canônica (`.solution/reference.py`, 7 linhas):

```python
def fatorial(n):
    if n < 0:
        raise ValueError("fatorial nao e definido para inteiro negativo")
    acc = 1
    for i in range(2, n + 1):
        acc *= i
    return acc
```

Os **17** mutantes gerados, na ordem canônica:

```
ROR@L2C10   if n < 0:                 -> if n <= 0:
AOR@L5C25   for i in range(2, n + 1): -> for i in range(2, n - 1):
CRP@L2C12+  if n < 0:                 -> if n < 1:
CRP@L2C12-  if n < 0:                 -> if n < -1:
CRP@L4C11+  acc = 1                   -> acc = 2
CRP@L4C11-  acc = 1                   -> acc = 0
CRP@L5C20+  for i in range(2, n + 1): -> for i in range(3, n + 1):
CRP@L5C20-  for i in range(2, n + 1): -> for i in range(1, n + 1):
CRP@L5C27+  for i in range(2, n + 1): -> for i in range(2, n + 2):
CRP@L5C27-  for i in range(2, n + 1): -> for i in range(2, n + 0):
SDL@L3C9    raise ValueError(...)     -> pass
SDL@L4C5    acc = 1                   -> pass
SDL@L6C9    acc *= i                  -> pass
RVR@L2C1    <corpo de fatorial>       -> return 0
SVR@L5C23   for i in range(2, n + 1): -> for i in range(2, acc + 1):
SVR@L6C16   acc *= i                  -> acc *= acc
SVR@L7C12   return acc                -> return n
```

**Total 17 · ROR 1 · AOR 1 · LCR 0 · UOI 0 · CRP 8 · SDL 3 · RVR 1 · SVR 3.** De onde sai cada
número:

| Operador | Conta | De onde |
|---|---|---|
| ROR 1 | `n < 0` → `n <= 0` | única comparação do fonte |
| **AOR 1** | `n + 1` → `n - 1` | **`acc *= i` é composto e não muta** — é aqui que uma contagem ingênua chegaria a 2 |
| CRP 8 | 4 literais (`0`, `1`, `2`, `1`) × 2 | o `0` do `range(2, n + 0)` é `1-1`, não um literal do fonte |
| SDL 3 | L3 `raise`, L4 `acc = 1`, L6 `acc *= i` | L1 assinatura, L2 e L5 abrem bloco, L7 é `return` — inelegíveis |
| **RVR 1** | `fatorial` devolve valor | 1 função, 1 mutante |
| **SVR 3** | L5 `n`→`acc`, L6 `i`→`acc`, L7 `acc`→`n` | L2 tem só `n` ligado (< 2 nomes); `acc` em `acc *= i` é alvo; `i` no `for` é alvo |

**O kill loop**, com `python3 -B` e remoção de `__pycache__` entre execuções:

| Suíte | válidos | mortos | sobreviventes | `score_bruto` | `equivalent_count` | `score` | veredito |
|---|---|---|---|---|---|---|---|
| Teste **forte** (5 cenários) | 17 | 16 | 1 | 16/17 = **0,941** | 1 | 16/16 = **1,000** | `approved` |
| Teste **fraco** (1 cenário) | 17 | 12 | 5 | 12/17 = **0,706** | 1 | 12/16 = **0,750** | `weak` |

Zero mutantes inválidos nos dois casos. O único sobrevivente do teste forte é `CRP@L5C20-`, o
genuinamente equivalente. Os cinco sobreviventes do teste fraco **nomeiam os cenários que faltam**:

```
ROR@L2C10   if n < 0:                  -> if n <= 0:                  (falta o caso n == 0)
CRP@L2C12+  if n < 0:                  -> if n < 1:                   (falta o caso n == 0)
CRP@L2C12-  if n < 0:                  -> if n < -1:                  (falta o caso n == -1)
CRP@L5C20-  for i in range(2, n + 1):  -> for i in range(1, n + 1):   (equivalente)
SDL@L3C9    raise ValueError(...)      -> pass                        (falta o cenário de erro)
```

Isto é a prova operacional de que os passos 1 e 2 **não bastam**, e de que o passo 4 devolve material
acionável, não só um número.

**Por que três leituras do mesmo catálogo davam três denominadores** — a fresta que §3.5.2 e §3.5.4
fecham: uma contagem que mutasse `*=` e ignorasse RVR/SVR dava **14**; uma que lesse SVR "por par de
variáveis" dava **30**. Com o portão de aprovação em 0,90, isso é a diferença entre entregar e
reprovar o mesmo teste. A aritmética fecha: 14 = 17 − 1 (RVR) − 3 (SVR) + 1 (o `*=` indevido).

**Mutantes equivalentes** são o custo conhecido de mutation testing e **não têm solução automática**.
O tratamento: saem do denominador, mas **só** com `classification: "equivalent"` e uma
`justification` escrita, gravadas no `meta.json` e auditáveis — e a classificação chega ali pelo
protocolo REQUEST/APPLY (§3.11), nunca por palpite do script.

**Extensão.** Operadores novos entram em versões futuras com `operators_version` incrementada, o que
**invalida comparação de score entre versões**. O `meta.json` grava a versão usada por isso.

### 3.5.7 CLI do motor

```
_mutate.py list|apply|count <fonte> [<mutant_id>] [--language L] [--json]
```

Exit `0` ok · `1` fonte ilegível · `2` `mutant_id` desconhecido ou ausente. Perfis: `python` e
`c_family`.

---

## 3.6 ⭐ A armadilha do cache de bytecode

Este é o bug que faria o passo 4 aprovar testes fracos **em silêncio**, e ele não estava em nenhuma
das pesquisas de base.

**O mecanismo.** O CPython invalida o `.pyc` por **(mtime, tamanho)** do fonte, com granularidade de
**1 segundo**. Mutantes de troca de operador têm **exatamente o mesmo tamanho** que a referência e são
escritos em sucessão rápida no **mesmo diretório de trabalho** — que é o que o harness faz, porque
`executar()` instala a implementação no `stub_path`. Sem proteção, o mutante roda o bytecode do
anterior.

Demonstração mínima, **[VERIFICADO]**:

```
A = "def fatorial(n):\n    return 1 if n < 1 else n * fatorial(n - 1)\n"   # 64 bytes
B = "def fatorial(n):\n    return 9 if n < 1 else n * fatorial(n - 9)\n"   # 64 bytes

# sem proteção:                A -> 120   B -> 120     ← B rodou o .pyc de A!
# com PYTHONDONTWRITEBYTECODE: A -> 120   B -> 45      ← correto
# com python3 -B:              A -> 120   B -> 45      ← correto
```

**Os números medidos sobre o catálogo da §3.5.6**, mesmo teste, mesmo diretório, mesmo catálogo:

```
nu            validos=17 mortos=17 sobreviventes=0  score_bruto=17/17=1,0000  []
protegido     validos=17 mortos=16 sobreviventes=1  score_bruto=16/17=0,9412  [CRP@L5C20-]
```

⭐ **É a diferença entre aprovar e reprovar um teste fraco.** Um score falso de 100% aprova qualquer
suíte; 94,1% com o sobrevivente listado é o resultado correto e auditável. A armadilha só aparece
quando o harness reusa **o mesmo diretório de trabalho** entre mutantes — um kill loop que criasse um
diretório temporário por mutante **nunca veria o bug**, e é por isso que ele passou despercebido.

**Regra normativa** — `executar()` **DEVE**, antes de **cada** execução:

| # | Defesa |
|---|---|
| 1 | remover recursivamente `__pycache__`, `*.pyc` e `.pytest_cache` sob o diretório do desafio |
| 2 | exportar `PYTHONDONTWRITEBYTECODE=1` **e** garantir `python3 -B` no argv — o harness **insere** o `-B` se o manifesto não trouxer; a proteção não pode depender do que o gerador escreveu |
| 3 | exportar `NODE_COMPILE_CACHE=""` — o cache de compilação do Node existe desde a v22 e é **opt-in por essa variável** (**[VERIFICADO]** vazia por padrão nesta máquina) |
| 4 | para linguagem compilada, garantir rebuild real e usar um **diretório de trabalho por mutante** quando houver `build_command` |

**[VERIFICADO]** `cargo` **não** tem esse problema: reescrevendo `src/lib.rs` com o mesmo número de
bytes no mesmo segundo, o `cargo test` recompilou e observou o valor novo. `gcc`/`g++` não têm cache.
**A armadilha é do bytecode.**

O `runner.sh` gerado carrega a mesma defesa (§3.9, D11): `PYTHONDONTWRITEBYTECODE=1`,
`NODE_COMPILE_CACHE=""` e um `find … -name __pycache__ -prune -exec rm -rf` antes de rodar.

---

## 3.7 ⭐ As 5 armadilhas de falso positivo, por linguagem

Cada uma é uma forma **verificada** de o runner dizer "passou" sem que uma única asserção tenha sido
avaliada. É o modo de falha mais perigoso do produto inteiro.

### 3.7.1 As cinco

**(1) Go — layout genérico devolve exit 0 sem rodar teste.**

```
$ go test ./...
?   desafio         [no test files]
?   desafio/tests   [no test files]
EXIT=0
```

O `go test` só reconhece arquivo com **sufixo** `_test.go`, no **mesmo diretório e pacote** do fonte.
O prefixo `test_` não significa nada, e `tests/` como subdiretório não é descoberto. Resultado: **0
eventos `"Action":"run"` e exit 0** — o aluno "passa" sem uma asserção ter rodado. É a mais perigosa
das cinco porque é **silenciosa**: não há mensagem de erro nenhuma.

**(2) Rust — filtro por nome curto descarta tudo e sai 0.**

```
$ cargo test test_f -- --exact          # nome curto — ERRADO
running 0 tests
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 1 filtered out
EXIT=0                                   # ← passou sem rodar nada

$ cargo test tests::test_f -- --exact   # nome qualificado — CORRETO
running 1 test
test result: FAILED. 0 passed; 1 failed
EXIT=101
```

Um teste dentro de `#[cfg(test)] mod tests { … }` é reportado como `tests::<id>`. Filtrar pelo nome
curto casa zero testes, e "zero testes filtrados" é **sucesso** para o cargo.

**(3) Python `unittest` — zero testes coletados sai 5.**

```
$ python3 -m unittest discover -s tests -t . -p 'test_*.py'
Ran 0 tests in 0.000s
NO TESTS RAN
EXIT=5
```

Aqui o exit não é 0, mas é **5** — um código que nenhuma tabela ingênua de "1 = falhou" reconhece.
Quem testar `exit_code == 1` para falha lê isso como sucesso. Causa comum: `tests/` sem
`__init__.py`, que faz o Python 3.14 recusar a descoberta com
`ImportError: Start directory is not importable`.

**(4) Node — o próprio arquivo de teste vira um teste que passou.**

```
$ node --test --test-reporter=tap vazio/test_nada.js
TAP version 13
# Subtest: vazio/test_nada.js
ok 1 - vazio/test_nada.js
1..1
# tests 1
# pass 1
# fail 0
EXIT=0
```

Um arquivo de teste **sem nenhuma chamada a `test()`** faz `node --test` tratar **o próprio arquivo**
como um teste que passa. Zero asserções, `# tests 1`, `EXIT=0`. ⭐ **Uma assertiva de
`tests_run > 0` não pega isso** — é por isso que o contrato é **igualdade** com `expected_test_count`,
e por isso o harness também rejeita quando o nome de um caso executado é igual ao caminho do arquivo
de teste (a assinatura do envelope de arquivo do `node:test`).

**(5) Java — asserção desabilitada por padrão.**

A JVM **remove as asserções** quando `-ea` não é passado. O teste roda inteiro, nenhuma asserção é
avaliada, e o processo sai **0**. Registrado como obrigação para quando `java_classfile` for
implementado: **todo comando Java zero-install precisa de `-ea` no `TEST_CMD`.**

Resumo em uma tabela:

| # | Linguagem | Comando | Saída real | Exit | Por que é falso positivo |
|---|---|---|---|---|---|
| 1 | Go | `go test ./...` (layout genérico) | `? desafio [no test files]` | **0** | sufixo `_test.go` e mesmo pacote são obrigatórios; 0 eventos `run` |
| 2 | Rust | `cargo test test_f -- --exact` | `0 passed; … 1 filtered out` | **0** | nome curto filtra tudo; "zero filtrados" é sucesso |
| 3 | Python | `python3 -m unittest discover …` | `Ran 0 tests` + `NO TESTS RAN` | **5** | exit atípico que `== 1` não reconhece |
| 4 | Node | `node --test --test-reporter=tap <vazio>` | `ok 1 - <caminho>` · `# tests 1` | **0** | o arquivo conta como teste; `> 0` não pega |
| 5 | Java | `java <runner>` sem `-ea` | teste roda, asserções removidas | **0** | a JVM desliga `assert` por padrão |

Duas outras formas verificadas de "passou sem rodar", pelo mesmo mecanismo, registradas em
`docs/00-contratos.md` §5.3: **`testthat` em R** sai **0 mesmo com falha** por padrão; e o **`assert.h`
em C** aborta no **primeiro** erro com SIGABRT (**134**) e esconde os demais cenários — inaceitável
num teste cujo propósito é enumerar cenários, e a razão de o `counter_protocol` ser obrigatório lá.

### 3.7.2 A defesa que cobre as cinco

Uma só, e ela é dupla:

> **DES-4** — o gate é **igualdade** `tests_run == expected_test_count`, **nunca `> 0`**; e a leitura
> de exit code é sempre `!= 0`, **jamais `== 1`**.

| Armadilha | O que a igualdade faz |
|---|---|
| Go (0 rodou, exit 0) | `0 != 4` → `count_mismatch` |
| Rust (0 rodou, exit 0) | `0 != 1` no modo `--only` (que fixa `ESPERADO=1`) → `count_mismatch` |
| Python (`Ran 0 tests`, exit 5) | `0 != 4` → `count_mismatch`; e `5 != 0` já seria falha pela Regra 1 |
| Node (1 "teste" fantasma) | `1 != 4` → `count_mismatch`; e o 6.2 rejeita o nome igual ao caminho do arquivo |
| Java (asserções removidas) | o `TEST_CMD` obrigatoriamente traz `-ea`; sem ele o passo 1 acusaria `passes_on_empty_stub` |

**[VERIFICADO]** com o `runner.sh` gerado: arquivo de teste Node esvaziado → `node --test` sozinho dá
`ok 1 - tests/stub.test.mjs`, `# pass 1`, **exit 0**; **o mesmo arquivo pelo runner** dá
`TESTS_RUN=0 ESPERADO=4`, `VEREDITO=count_mismatch`, **exit 2**. E a árvore Go gerada com
`layout_profile: go_module` dá **exit 1** com **4 execuções distintas**, contra `[no test files]` +
exit 0 da árvore genérica.

---

## 3.8 A árvore por linguagem — `layout_profile`

A árvore genérica **não vale para Go nem para Rust**, e o caso do Go é silencioso (§3.7.1).
`challenge-new.sh` escolhe o perfil pela linguagem e **nunca** aplica o esqueleto genérico às duas.

### 3.8.1 As 5 linguagens implementadas

| Linguagem | `layout_profile` | `stub_path` (✏️) | `test_path` | Manifesto exigido | Apoio |
|---|---|---|---|---|---|
| `python` | `generic` | `stub.py` | `tests/test_stub.py` | — | `tests/__init__.py` |
| `javascript` | `generic` | `stub.mjs` | `tests/stub.test.mjs` | — | — |
| `c` | `generic` | `stub.c` | `tests/test_stub.c` | — | `stub.h`, `.build/` |
| `go` | `go_module` | `stub.go` | `stub_test.go` (**raiz, mesmo pacote**) | `go.mod` | — |
| `rust` | `cargo_crate` | `src/lib.rs` | `tests/test_stub.rs` | `Cargo.toml` | `target/` |

```
generic (python)              go_module (go)            cargo_crate (rust)
0001-<slug>/                  0003-<slug>/              0004-<slug>/
├── README.md            👁   ├── go.mod           👁   ├── Cargo.toml       👁
├── stub.py              ✏️   ├── stub.go          ✏️   ├── src/lib.rs       ✏️
├── tests/                    ├── stub_test.go     👁   ├── tests/
│   ├── __init__.py           ├── runner.sh        👁   │   └── test_stub.rs 👁
│   └── test_stub.py     👁   ├── meta.json        👁   ├── runner.sh        👁
├── runner.sh            👁   └── .solution/       🚫   ├── meta.json        👁
├── meta.json            👁                             └── .solution/       🚫
└── .solution/           🚫
```

**Por que cada desvio existe** (verificado por execução):

| Perfil | Regra | Se ignorar |
|---|---|---|
| `go_module` | `go.mod` na raiz; arquivo de teste com **sufixo `_test.go`** (o prefixo `test_` não significa nada) **e** no **mesmo diretório e pacote** do fonte | `go test ./...` imprime `[no test files]` e sai **0** — armadilha 1 |
| `cargo_crate` | `Cargo.toml` na raiz; fonte **dentro de `src/`**; teste de integração **direto** em `tests/`; `[lib] path = "src/lib.rs"` no `Cargo.toml` | sem `Cargo.toml`, exit 101 "could not find Cargo.toml"; com o fonte solto na raiz, exit 101 "cannot find module or crate" |
| `generic` (python) | `tests/` precisa de `__init__.py` | `unittest` do Python 3.14 recusa a descoberta: `ImportError: Start directory is not importable`, `TESTS_RUN=0` → `count_mismatch` |
| `generic` (c) | `stub.h` com o protótipo | não há import em C: sem a declaração, o link falha ou o compilador assume declaração implícita |
| `generic` (node) | `MODULE` = `../stub.mjs`, import relativo explícito | módulo não resolve |

### 3.8.2 Convenções de nome que o manifesto precisa carregar

| Item | Regra |
|---|---|
| `FUNC_NAME` | `slug` com `-`→`_` (`fatorial_iterativo`); em **Go, CamelCase exportado** (`FatorialGo`) |
| `scenario_id` | casa `^[a-z0-9]+(_[a-z0-9]+)*$` |
| `PKG` / `CRATE` | fixos em `desafio` — são **identificadores da linguagem**, não podem depender de slug arbitrário. `CRATE` em snake_case, nunca kebab: serve ao mesmo tempo como `package.name` do `Cargo.toml` e como identificador em `use {{CRATE}}::{{FUNC_NAME}};` |
| `scenarios[].test_name` | **o nome como o runner reporta** — `tests::<id>` (Rust) · `tests.test_stub.TesteDesafio.test_<id>` (Python) · `Test<Camel>` (Go) · `<id>` (Node e C) |
| `{{SIGNATURE}}` | Python/Node: só os parâmetros · Go: parâmetros + `) (retorno nomeado)` · Rust: parâmetros + `) -> tipo` · C: **protótipo inteiro** (`long fatorial(long n)`), porque em C o tipo de retorno vem antes do nome |

⚠️ **Armadilha do Go, segunda camada**: se o stub sinaliza "não implementado" com `panic()`, o
**primeiro** teste que falha derruba o binário inteiro (`[recovered, repanicked]`) e os testes
seguintes **nunca rodam** — mesmo defeito do `assert.h` em C, só que em Go. A correção é **retorno
nomeado + `return` nu**: devolve o zero-value do tipo, uma resposta sempre errada, sem abortar o
processo.

### 3.8.3 As 14 linguagens restantes do enum

O enum `language` do `challenge-manifest.schema.json` tem **19** entradas. Apenas 5 têm árvore
implementada nesta versão. As outras são **documentadas** em `SK/references/languages.md` e recusadas
por `challenge-new.sh` com **exit 2**, nomeando as 5 implementadas, o comando de instalação e a
linguagem vizinha. `--language node` é apelido operacional normalizado para `javascript`;
`meta.json.language` grava sempre `javascript`.

Se o toolchain da linguagem escolhida não estiver instalado (D-C07), a resposta é **propor a mesma
ideia de desafio numa das linguagens que rodam sem instalar nada**, dizendo o motivo e oferecendo o
comando de instalação como alternativa — nunca gerar mesmo assim e deixar quebrar.

> **PERGUNTE AO USUÁRIO (D-V16)** — Linguagem com toolchain parcial (Java sem Maven/Gradle, C++ sem cmake): caminho zero-install ou pedir o build system?
> Para compilar uma função, `javac` e `g++` bastam. A primeira execução de `mvn test` baixa meia internet para um exercício de vinte linhas — e o aluno só queria testar um fatorial.
> **Opções:** **(a)** zero-install (`-ea`, `g++` direto), mencionando o build system só se o aluno pedir — funciona na máquina como ela está hoje; não ensina o build system que ele vai encontrar em projeto real · **(b)** pedir Maven/Gradle/cmake de saída — mais parecido com projeto real, ao custo de minutos de download antes do primeiro teste
> **Default:** **(a)** · **Custo de mudar depois: cheap**

> **PERGUNTE AO USUÁRIO (D-V17)** — A detecção de toolchains roda uma vez no setup ou a cada sessão?
> Um `command -v` custa milissegundos e pega os dois casos que quebram a aula: "instalei ontem" e "desinstalei sem lembrar". Redetectar tudo a cada sessão seria varrer 19 linguagens para confirmar uma.
> **Opções:** **(a)** no setup, revalidando só a linguagem em uso a cada sessão — milissegundos por sessão e pega os dois casos sem varrer tudo; a matriz completa pode ficar velha até a próxima varredura · **(b)** uma vez no setup — custo zero por sessão, e a aula quebra no dia em que a linguagem sumiu · **(c)** a cada sessão, tudo — sempre atual, e varre 19 linguagens para usar uma
> **Default:** **(a)** · **Custo de mudar depois: cheap**

---

## 3.9 O `runner.sh` gerado — ponto de entrada único

**Exceção nomeada 1** de `docs/00-contratos.md` §5.2: `0` passed · `1` failed · `2` count_mismatch ·
`3` timeout, mais **`66`** para infraestrutura. Não é script da skill — é artefato do desafio, lido e
rodado pelo aluno, e 0/1/2/3 é o vocabulário do TDD, não o da skill.

```bash
#!/usr/bin/env bash
set -u -o pipefail                       # -e FORA: o exit bruto do teste é dado, não acidente
CHALLENGE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$CHALLENGE_DIR" || exit 66           # 66 = infraestrutura, nunca falha de teste
# argumentos: [--only <cenario>] [--help]
{{TEST_CMD}}                             # TIMEOUT_PADRAO · traduzir_cenario() · executar_testes()
TIMEOUT_S="${CHALLENGE_TIMEOUT:-$TIMEOUT_PADRAO}"
ESPERADO="${CHALLENGE_EXPECTED_TESTS:-{{EXPECTED_TEST_COUNT}}}"
SAIDA="$(mktemp)"; trap 'rm -f -- "$SAIDA"' EXIT
export LC_ALL=C.UTF-8 TZ=UTC PYTHONHASHSEED=0 PYTHONDONTWRITEBYTECODE=1 NODE_COMPILE_CACHE=""
find "$CHALLENGE_DIR" -type d -name __pycache__ -prune -exec rm -rf -- {} + 2>/dev/null
# sandbox: sm_sandbox_run de lib/sandbox.sh, ou PISO DECLARADO em voz alta
{{COUNT_PROBE}}                          # contar_testes() · mostrar_saida()
# --only -> traduzir_cenario -> SM_FILTRO (nome QUALIFICADO) e ESPERADO=1
export CHALLENGE_TIMEOUT="$TIMEOUT_S" SM_SANDBOX_WALL="$TIMEOUT_S" SM_SANDBOX_CPU="$((TIMEOUT_S+5))"
T0=$(date +%s%N); executar_testes >"$SAIDA" 2>&1; EXIT_BRUTO=$?
T1=$(date +%s%N); DECORRIDO_MS=$(( (T1-T0)/1000000 ))
TESTS_RUN="$(contar_testes)"; mostrar_saida
echo "SANDBOX=$SANDBOX_MODO TESTS_RUN=$TESTS_RUN ESPERADO=$ESPERADO EXIT_BRUTO=$EXIT_BRUTO DECORRIDO_MS=$DECORRIDO_MS"
if   [ "$DECORRIDO_MS" -ge $(( TIMEOUT_S * 1000 )) ]; then echo "VEREDITO=timeout";       exit 3
elif [ "$TESTS_RUN" -ne "$ESPERADO" ];               then echo "VEREDITO=count_mismatch"; exit 2
elif [ "$EXIT_BRUTO" -ne 0 ];                        then echo "VEREDITO=failed";         exit 1
else                                                      echo "VEREDITO=passed";         exit 0
fi
```

### 3.9.1 As 12 defesas, e o defeito observado que cada uma cobre

| # | Defesa | Defeito observado |
|---|---|---|
| D1 | `cd "$CHALLENGE_DIR" \|\| exit 66` | 66 distingue "o diretório não existe" de "o teste falhou". Não é 1, não é 70 |
| D2 | `set -o pipefail` | `comando \| tail -1` devolve o status do `tail`: verde com teste vermelho |
| D3 | `set -e` **ausente** | com `errexit`, o primeiro teste vermelho mataria o runner antes do veredito |
| D4 | sandbox **só** de `lib/sandbox.sh` (`sm_sandbox_run "$CHALLENGE_DIR" -- …`) | uma segunda pilha de sandbox seria uma segunda verdade sobre o que está ligado. O limite viaja por `SM_SANDBOX_WALL` / `SM_SANDBOX_CPU` / `CHALLENGE_TIMEOUT` |
| D5 | **piso declarado em stderr**, nunca silencioso | o aluno roda o runner direto do terminal; sem a lib ele fica com relógio e CPU e **precisa saber disso** |
| D6 | `timeout -s KILL -k 5` no piso | sem `-s KILL` o SIGTERM chega ao wrapper e **não propaga**: o processo do aluno sobrevive ao timeout |
| D7 | **timeout por TEMPO DECORRIDO** | com `-s KILL` o código é **137**, nunca 124 — e 137 também é OOM e limite de CPU. Medido: laço infinito com `CHALLENGE_TIMEOUT=3` → `EXIT_BRUTO=137`, `DECORRIDO_MS=3002`, `VEREDITO=timeout`. Quem testar `-eq 124` procura para sempre |
| D8 | **contagem por IGUALDADE**, jamais `> 0` | as cinco armadilhas do §3.7 |
| D9 | ordem do veredito: **tempo → contagem → exit** | "seu código não termina", "o desafio está quebrado" e "seu código está errado" são três lições diferentes, nesta precedência |
| D10 | `EXIT_BRUTO` e `DECORRIDO_MS` ecoados no stdout | a normalização 0/1/2/3 não pode apagar o diagnóstico (134 = SIGABRT, 5 = zero testes, 101 = Rust) |
| D11 | limpeza de `__pycache__` antes de rodar | mutante do mesmo tamanho reusaria o `.pyc` antigo (§3.6) |
| D12 | `--only <cenario>` traduz para o nome **qualificado** e fixa `ESPERADO=1` | o nome curto em Rust devolve "N filtered out" com exit **0**. Cenário inexistente → `66`, nunca um verde |

> **PERGUNTE AO USUÁRIO (D-V15)** — O guard "testes executados > 0" roda sempre, ou só quando o exit for 0?
> É conferir se a prova tinha questões antes de comemorar a nota. Uma suíte que não rodou teste nenhum sai com exit 0 em várias linguagens — e um `grep` custa nada.
> **Opções:** **(a)** sempre, antes e depois — única defesa contra a suíte vazia que sai com sucesso, ao custo de duas verificações · **(b)** só quando o exit for 0 — metade do custo, e perde o caso do erro que mascarou uma suíte vazia · **(c)** só na geração do desafio — verifica uma vez só, e não pega o dia em que o aluno quebrou a descoberta de testes
> **Default:** **(a)** · **Custo de mudar depois: cheap**

### 3.9.2 `TEST_CMD` e `COUNT_PROBE` por linguagem

`TEST_CMD` define `TIMEOUT_PADRAO`, `traduzir_cenario()` (mapa `scenario_id` → nome reportado, gerado
no script para o runner não precisar de `jq` na máquina do aluno) e `executar_testes()`.
`COUNT_PROBE` define `contar_testes()` e `mostrar_saida()`.

| Linguagem | `test_count_probe` | Comando | Contagem | `timeout_seconds` |
|---|---|---|---|---|
| `python` | `python_unittest_ran_line` | `python3 -B -m unittest discover -s tests -t . -p 'test_*.py' -v` | última linha `^Ran ([0-9]+) tests?` | 15 |
| `javascript` | `node_test_tap_summary` | `node --test --test-reporter=tap tests/stub.test.mjs` | linhas `^\s*(not )?ok N - <rótulo>`, **descartando todo rótulo igual a um caminho da linha de comando** | 15 |
| `go` | `go_test_json_run_events` | `go test -json ./...` (com `GOPROXY=off`) | valores **distintos** de `"Test"` em `"Action":"run"` | 90 |
| `rust` | `cargo_test_running_lines` | `cargo test --offline` (sem filtro) | **soma** de todas as `^running ([0-9]+) tests?` | 120 |
| `c` | `counter_protocol` | `gcc -std=c11 -g -O0 -Wall -o .build/test_bin stub.c tests/test_stub.c -lm && .build/test_bin` | `^TESTS_RUN=([0-9]+)` impresso pelo próprio teste | 30 |

Filtro de `--only`: `python3 -m unittest tests.test_stub.TesteDesafio.test_<id>` ·
`node --test-name-pattern='^<id>$'` · `go test -run '^Test<Camel>$'` ·
`cargo test tests::<id> -- --exact` · C lê `SM_ONLY` do ambiente dentro do `counter_protocol`.

Go e Rust rodam **offline** (`GOPROXY=off`, `cargo --offline`): a fase de teste roda sem rede, e a
semente não tem dependência.

### 3.9.3 O `counter_protocol`

Onde o runner nativo não expõe quantos casos rodaram, o arquivo de teste gerado **deve** implementar
este protocolo mínimo. Ele também resolve o `assert.h`, que aborta no primeiro erro com SIGABRT
(exit 134) e esconde os demais cenários. Contrato do protocolo, **[VERIFICADO em C]**:

| Elemento | Obrigação |
|---|---|
| Contadores | dois `static int`, `total` e `falhas`, no escopo do arquivo |
| Helper por tipo | `checa_<tipo>(const char *cenario, <tipo> obtido, <tipo> esperado, const char *porque)` — incrementa `total`, e em divergência incrementa `falhas` e imprime em **stderr** `FALHOU [<cenario>]: obtido …, esperado …. <porque>` |
| Nunca aborta | não usa `assert.h`; um cenário vermelho não impede os seguintes de rodar |
| Contagem em **stdout** | ao final, `printf("TESTS_RUN=%d\nTESTS_FAILED=%d\n", total, falhas)` |
| Exit | `return falhas == 0 ? 0 : 1` |
| Filtro | respeita `getenv("SM_ONLY")` para o `--only` do runner |

Saída observada com o stub vazio (2 cenários): `TESTS_RUN=2` / `TESTS_FAILED=2` em stdout, as duas
mensagens didáticas em stderr, **EXIT=1** — determinístico, contável, e **sem abortar no primeiro
erro**. Código completo em `docs/05-challenges-tdd.md` §3.2.

⚑ **O `meta.json` declara `execution.test_count_probe: "counter_protocol"` mesmo quando a sonda
interna é outra**, porque `runner.sh` sempre reemite a contagem no formato `TESTS_RUN=<n>`. Quem lê a
saída de `runner.sh` de fora nunca precisa saber que por dentro havia `python_unittest_ran_line` ou
`go_test_json_run_events`.

---

## 3.10 ⭐ Oráculo matemático sem álgebra simbólica

`sympy` **não está instalado** nesta máquina e o PEP 668 bloqueia `pip install` fora de venv.
Desafios de matemática são justamente onde o modelo mais erra — GSM-Symbolic (Apple, 2024) mostra
queda de desempenho quando só os *valores numéricos* do enunciado mudam, e de até 65% quando se
adiciona uma cláusula irrelevante.

### 3.10.1 A regra dura

> **REGRA ABSOLUTA (DES-6)**: o valor esperado de um teste de matemática **nunca** é um número que o
> modelo calculou de cabeça e digitou no arquivo. Ele vem de **(a)** executar a implementação de
> referência, ou **(b)** uma propriedade que dispensa o valor.

### 3.10.2 As famílias de propriedade invariante

Todas **verificadas por execução**. A coluna "detecta erro?" aplica o mesmo oráculo a uma variante
**errada**, para provar que o teste discrimina.

| # | Família | `oracle.strategies` | Forma | Erro observado (correto) | Detecta erro? |
|---|---|---|---|---|---|
| P1 | **Derivada numérica × analítica** | `invariant_property` | diferença central `(f(x+h)-f(x-h))/(2h)`, `h=1e-5`, N pontos com seed fixa | `1,18e-10` | `f'=3x²-1` em vez de `3x²-2` → erro **1,0e+00** |
| P2 | **A inversa desfaz a direta** | `invariant_property` | `abs(inversa(direta(x)) - x)` relativo, 500 pontos | `1,11e-16` (`exp`/`log`) | qualquer inversa errada explode |
| P3 | **Identidade conhecida** | `invariant_property` | `sen²(t)+cos²(t)-1`, 500 pontos | `2,22e-16` | — |
| P4 | **TFC: Riemann × primitiva** | `invariant_property` | soma do ponto médio (n=200 000) contra `F(b)-F(a)` | `5,63e-11` para `∫₀³x²dx = 9` | primitiva errada explode |
| P5 | **Relação metamórfica** | `metamorphic_relation` | `area(k·r) == k²·area(r)`, **sem saber nenhuma área** | `3,07e-15` | fórmula `2πr` em vez de `πr²` → erro **6,0e+00** |
| P6 | **Conferência contra a stdlib** | `trusted_stdlib` | minha média × `statistics.fmean` em 300 amostras | `0,0e+00` | qualquer divergência aparece |
| P7 | **Aritmética exata** | `exact_arithmetic` | `Fraction(1,3)+Fraction(1,6) == Fraction(1,2)` → `True`; `Decimal("0.1")+Decimal("0.2") == Decimal("0.3")` → `True`; `0.1+0.2 == 0.3` → **`False`** | exato | — |
| P8 | **Casos-âncora do enunciado** | `anchor_cases_from_statement` | pares entrada→saída extraídos do **texto do enunciado**, idealmente numa chamada separada | — | quebra o acoplamento com `R` |

A separação entre certo (`1e-10`) e errado (`1e+00`) é de **dez ordens de grandeza** — o teste
discrimina com folga, e a tolerância não é um chute.

### 3.10.3 Como isso vira um desafio

Para "implemente a derivada de `f(x) = x³ - 2x + 1`", o teste **não** contém
`assert derivada(2) == 10`. Ele contém, em uma única asserção: `f` copiada do enunciado, uma
`random.Random(<seed fixa>)`, N pontos, `esperado = (f(x+h) - f(x-h)) / (2h)` com `h=1e-5`, e
`assertLess(abs(obtido - esperado) / max(1.0, abs(esperado)), 1e-6, <mensagem didática>)`. Exemplo
completo, com a mensagem de falha inteira: `docs/05-challenges-tdd.md` §6.1.

O valor esperado **nunca foi digitado por um modelo**: ele é **medido** a partir da própria `f`, que
está no enunciado. Se o modelo tivesse errado a derivada analítica, o teste continuaria certo — é a
`f` do enunciado que manda.

### 3.10.4 O que o harness cobra

| Regra | Cobrança |
|---|---|
| `oracle.numeric_mode` é obrigatório | valores: `exact_int` (igualdade) · `fraction` / `decimal` (igualdade exata) · `float_tolerance` · `not_numeric` |
| `float_tolerance` **exige** `rel_tol` ou `abs_tol` | o passo 6.4 rejeita se faltarem |
| `==` entre `float` é **proibido** | `0.1 + 0.2 == 0.3` é `False` **[VERIFICADO]**. Onde o resultado puder ser exato, `Fraction`/`Decimal` **antes** de tolerância |
| Toda amostragem tem **seed fixa** | gravada em `oracle.invariants[].seed`; sem ela o passo 5 reprova por `nondeterministic` |
| Toda invariante é checada contra `R` **isoladamente**, antes do passo 4 | o pior erro observado vai em `oracle.invariants[].worst_error` — é a mitigação do §3.14 |
| `reference_impl` é obrigatória em **todo** desafio | e, para desafio matemático, **mais uma** das demais famílias |
| Property-based testing (Hypothesis/fast-check/proptest) fica **fora do padrão** | escrever um bom gerador é habilidade mais avançada que resolver o exercício, e contra-exemplo encolhido confunde iniciante. As invariantes acima usam `random.Random(seed)` da stdlib e um laço — zero dependência, zero API nova. Opcional só para `advanced` (D-C04) |

> **PERGUNTE AO USUÁRIO (D-C04)** — Testes baseados em propriedade (Hypothesis, fast-check, proptest) entram nos desafios?
> É a diferença entre "testei com 2 e com 7" e "testei com dez mil números que a máquina inventou". Poderoso — e escrever um bom gerador é mais difícil que resolver o exercício.
> **Opções:** **(a)** opcional, só para nível avançado e desafios de propriedade — as invariantes com semente fixa dão quase o mesmo poder com zero dependência; exige instalar biblioteca e ensinar a API quando ligado · **(b)** nunca — zero dependência sempre, e fecha uma ferramenta legítima para quem já sabe usá-la · **(c)** padrão para desafios de matemática — casa bem com invariantes, e o iniciante encontra contraexemplo encolhido sem entender o que aconteceu
> **Default:** **(a)** · **Custo de mudar depois: moderate**

---

## 3.11 ⭐ REQUEST/APPLY — a única etapa em que o modelo opina

### 3.11.1 O problema, e por que "o script pergunta ao modelo" é inimplementável

O passo 4.4 precisa de uma decisão que só um leitor de código toma: este sobrevivente é
**`equivalent`** (comportamentalmente idêntico a `R`; nenhum teste poderia matá-lo) ou **`test_gap`**
(falta um cenário)? Isso é julgamento — e **`challenge-verify.sh` é um processo de shell**: não tem
canal com o modelo, não bloqueia esperando resposta, e não existe um `ask()` para ele chamar. Uma
especificação que diz "o script pergunta" é uma especificação que ninguém implementa — e quem tentar
vai improvisar, provavelmente deixando o script **chutar** a classificação, que é exatamente o que
arruína o denominador do mutation score.

### 3.11.2 O padrão

Os quatro passos, os dois envelopes e as regras `RA-1`…`RA-7` estão em **§1.6** e valem sem alteração
aqui. O que segue é o que é **específico do desafio**.

| Propriedade | Como se sustenta |
|---|---|
| **Atômico** | **RA-1 verificada**: no exit 10 o `meta.json` está byte a byte como antes e o stub do aluno foi restaurado. Não existe estado "meio validado" para alguém encontrar depois |
| **Retomável** | o pedido carrega tudo que a resposta precisa referenciar. Uma sessão que morra entre o pedido e o `--apply` é retomada rodando o script de novo, do zero |
| **Auditável** | o julgamento entra no manifesto como dado nomeado, com `justification` escrita, não como um número que apareceu do nada |
| **Verificável** | o script recusa resposta malformada, incompleta, ou que fale de mutantes que ele não pediu |

### 3.11.3 O PEDIDO

É o envelope de `docs/00-contratos.md` §6.1 produzido por `sm_request`, com
`kind = "classify_survivor"` e `response_schema = urn:study-method:schema:challenge-verify-response:1`.
O **`payload` é uma instância de `challenge-verify.request.schema.json`**: `schema_version`,
`request_kind` (`challenge_verify`), `challenge_id`, `language`, `operators_version`, `score` (o
bruto), `threshold`, `valid`, `survived`, `reference_excerpt` e `survivors[]` com `mutant_id`,
`operator`, `file`, `line`, `before`, `after`.

⚑ **`generated_at` não entra no cálculo do `request_id`.** O `request_id` é o sha256 canônico do
payload; se o carimbo entrasse, o id mudaria a cada segundo e o `--apply` nunca reconheceria o
próprio pedido. O carimbo vive no envelope e é injetado no payload só na hora de imprimir, para que o
objeto impresso valide contra o schema.

`--apply` **recomputa** o `request_id` rodando os passos 0–4 de novo (todos determinísticos) sobre o
estado atual em disco. Mudou o teste ou a referência entre as fases → o id não bate → **exit 5**
(RA-2). **Não há arquivo de pedido pendente em lugar nenhum**: a fase de PEDIDO não escreve.

### 3.11.4 A RESPOSTA e o que o `--apply` valida

Aceita em **duas formas**:

| Forma | Detecção | Validação |
|---|---|---|
| *Envelope* (§6.2) | tem `.protocol` | `sm_apply_read <arquivo> classify_survivor <request_id>` confere `protocol`, `protocol_version`, `kind` e `request_id`; `.items` são as classificações |
| *Nativa* | sem `.protocol` | `sm_json_validate` contra `challenge-verify.response.schema.json`, confere `request_kind` e `challenge_id`; `.classifications` são as classificações |

| Verificação | Falha → |
|---|---|
| envelope ou schema nativo inválido | **5** |
| `challenge_id` diverge | **5** |
| conjunto de `mutant_id` não é **exatamente** o dos sobreviventes — nem a mais (inventado), nem a menos (sem veredito) | **2** |
| `justification` vazia, ou **< 40 caracteres** quando `equivalent` | **2** |
| `classification` fora de {`equivalent`, `not_equivalent`, `test_gap`, `unclassified`} | **2** |

**Normalização**: `not_equivalent` e `unclassified` viram **`test_gap`** no manifesto — é o enum de
`challenge-manifest.schema.json` e é o lado conservador. **Errar para `test_gap` custa uma
regeneração; errar para `equivalent` entrega ao aluno um teste que aprova código errado.**

Aprovado, o script grava `classification` e `justification`, recalcula `equivalent_count` e `score`,
e retoma em 4.5. **RA-6**: no máximo 2 ciclos por invocação lógica (obrigação do chamador — ver a
limitação L-2 de `docs/00-contratos.md` §6.5).

### 3.11.5 O que este protocolo NÃO é

Não é brecha na regra do §3.2. O modelo continua sem decidir se o teste está bom. Ele decide **uma
coisa só, sobre um diff de uma linha**, e o script continua sendo quem calcula o score, compara com o
limiar e emite o veredito. Se aparecer um segundo ponto assim no produto, ele ganha um `kind` próprio,
um par de schemas em `assets/schemas/requests/`, e reusa o mesmo exit 10 e a mesma flag `--apply`.

---

## 3.12 Sandbox: a pilha, a degradação e a honestidade obrigatória

Contrato completo em `docs/11-seguranca-privacidade.md` §2 (garantias G1..G9) e no fragmento
`docs/build-spec/50-sandbox.md`. Aqui fica o que o desafio precisa saber.

### 3.12.1 A pilha canônica, camada a camada

De fora para dentro. Cada camada é **sondada antes de entrar** e **pulada se faltar**. A ordem não
pode ser invertida.

```bash
timeout -s KILL -k 5 "$WALL"                                   # G1
  systemd-run --user --scope -q                                # G7/G8
    -p MemoryMax="$MEM" -p MemorySwapMax=0
    -p TasksMax="$TASKS" -p OOMPolicy=continue
    bash -c '<wrapper>' _ "$STATEFILE" "$KILLGRP" "$READCG"     # leitor de OOM / matador de grupo
      bwrap --die-with-parent --unshare-all …                   # G3/G4/G6   (preferido)
      unshare --user --net --pid --fork --map-current-user --   # G3/G4      (sem bwrap)
        bash -c 'ulimit -t "$1"; ulimit -f "$2";
                 [ "$3" = - ] || ulimit -v "$3";
                 cd "$4" || exit 66; shift 4; exec "$@"'        # G2/G9/G5
```

**Por que o wrapper existe**: é o único ponto que está **dentro** do cgroup e **fora** dos namespaces.
Ali, depois que o comando morre, dá para ler `memory.events` do próprio cgroup — que é o que
desambigua o 137 — e matar o grupo de processos quando não há PID namespace.

**Duas fases**, decisão de projeto: `prepare` roda **com** rede (resolver dependências, com
confirmação do aluno e mostrando o que baixa); `test` roda **sem** rede, **sempre**.

⏳ **Quatro parâmetros da pilha são medidos, não escolhidos por gosto:**

| Parâmetro | Valor canônico | O que a medição mostrou |
|---|---|---|
| `TasksMax` | **512** (`SM_SANDBOX_TASKS`) | `128` **derruba `go test`**: o cgroup conta *threads*, e o Go abre um processo de compilação por CPU |
| `OOMPolicy` | **`continue`** — obrigatório | Sem ele o systemd para o **escopo inteiro** no OOM: o código vira **143** e `memory.events.oom_kill` some antes de ser lido, então a desambiguação do 137 perde a evidência do estouro. Existe a partir do systemd 243, e por isso é sondado à parte: ausente, a camada entra sem ele e **o relato ao aluno declara a perda** |
| confinamento de escrita | **`bwrap --unshare-all`** substitui `unshare` quando presente | `--unshare-all` já traz os namespaces que o `unshare` trazia; o `unshare` sozinho **não confina escrita** (o processo grava em `$HOME` sem erro). `bwrap` exige os quatro `--symlink` (`usr/bin`, `usr/sbin`, `usr/lib`, `usr/lib64`) ou a sonda falha calada |
| caches de toolchain | remapeados para **`/sm/…`**, com a variável reapontada (`CARGO_HOME`, `RUSTUP_HOME`, `GOMODCACHE`, `npm_config_cache`) | Montar no **caminho original** faz o `bwrap` **criar `/home/<aluno>` dentro do sandbox**, e o diretório criado é **gravável**: o aluno vê a escrita em `$HOME` funcionar e leva a lição errada. Com o remapeamento, `/home` não existe lá dentro e a tentativa falha com "arquivo não encontrado" — que é a verdade. **Nada é montado sob `/home`** |


### 3.12.2 A degradação, por plataforma

| Camada | Linux completo | Linux sem systemd/delegação | Linux sem user namespace | macOS |
|---|---|---|---|---|
| Relógio (G1) | `timeout -s KILL -k 5` | idem | idem | `gtimeout` → `perl -e 'alarm shift; exec @ARGV'` (exit 142) → só com consentimento |
| CPU (G2) | `ulimit -t` | `ulimit -t` | `ulimit -t` | `ulimit -t` |
| Netos (G3) | PID namespace | PID namespace | grupo de processos + `kill -- -PGID` (**não cobre `setsid`**) | idem, risco residual declarado |
| Rede (G4) | `unshare --net` / `bwrap` | idem | variáveis de proxy | variáveis de proxy |
| cwd (G5) | `cd \|\| exit 66` | idem | idem | idem |
| Escrita (G6) | `bwrap` | `bwrap` | `bwrap` se houver | **nenhuma** sem Docker |
| Memória (G7) | `MemoryMax` + `MemorySwapMax=0` | `ulimit -v` **só** para `c`, `cpp`, `python`, `go` | idem | **nenhuma** |
| Processos (G8) | `TasksMax` | PID namespace | nada | nada |
| Arquivo (G9) | `ulimit -f` | idem | idem | idem |

Sem `--language`, `ulimit -v` **não** é aplicado: aplicá-lo às cegas quebraria Node e JVM
(**[VERIFICADO]**: Node 24 falha com `-v 512M` e `-v 1G`, exit 133; só sobe com 2G). **Ausência de
ferramenta nunca vira instalação: degrada e declara.**

> **PERGUNTE AO USUÁRIO (D-S11)** — Como limitar a memória do processo de teste no Linux?
> É o disjuntor: um laço que aloca sem parar não pode derrubar a máquina inteira do aluno. `ulimit -v` funciona para algumas linguagens e quebra outras — Node e JVM reservam espaço virtual enorme na largada e morrem antes de começar. Verificado quebrando.
> **Opções:** **(a)** `systemd-run --user --scope -p MemoryMax=` quando disponível, com `ulimit -v` só para C/C++/Python/Go — limita memória de verdade sem quebrar runtime nenhum; depende de systemd, e fora dele cai para o fallback parcial · **(b)** `ulimit -v` para todos — funciona em qualquer shell POSIX, e Node e JVM morrem na largada · **(c)** sem limite fora do Docker — nada quebra, e um exercício com vazamento trava a máquina do aluno
> **Default:** **(a)** · **Custo de mudar depois: cheap**

> **PERGUNTE AO USUÁRIO (D-S08)** — Usar `bwrap` no Linux quando disponível — ele confina a escrita, mas isola o `$HOME`?
> `bwrap` é a sala com paredes: o código do exercício não alcança o resto da máquina. O problema é que algumas linguagens guardam o cache delas no `$HOME`, e a sala também isola isso — o compilador some junto.
> **Opções:** **(a)** usar só nas linguagens que não dependem de cache no `$HOME` (Python, C, C++, Node sem dependências), migrando conforme os binds forem validados — ganho real onde já funciona hoje e nenhuma linguagem quebra em silêncio; isolamento desigual entre linguagens até lá · **(b)** usar sempre, montando os caches read-only — isolamento uniforme, e errar um bind quebra o desafio sem diagnóstico claro · **(c)** não usar — nada quebra, e descarta a única camada de isolamento disponível sem instalar nada
> **Default:** **(a)** · **Custo de mudar depois: cheap**

### 3.12.3 A honestidade obrigatória — o que não está protegido é dito em voz alta

`sm_sandbox_report` imprime **uma linha em pt-BR**, dita ao aluno:

```
Sandbox: tempo OK · memória OK (cgroup) · rede isolada OK · escrita confinada NÃO (instale bubblewrap ou use --docker)
```

| Item | Valores possíveis |
|---|---|
| tempo | `OK` · `OK (gtimeout)` · `OK (perl alarm)` · `SÓ de CPU (ulimit -t; loop que dorme não é morto)` · `NÃO` |
| memória | `OK (cgroup)` · `parcial (ulimit -v, só C/C++/Python/Go)` · `NÃO` |
| rede isolada | `OK` · `NÃO (só variáveis de proxy: lombada, não muro)` |
| escrita confinada | `OK (bubblewrap)` · `NÃO (rode com --docker para confinar)` · `NÃO (instale bubblewrap ou use --docker)` |

Um quinto item, `· netos NÃO contidos (pode sobrar processo após o teste)`, é inserido **antes** do
item de escrita **somente quando é má notícia**.

> ⭐ **A linha só cresce para declarar o que não está protegido; nunca para se elogiar.**

A mesma regra vale no `runner.sh`: sem `lib/sandbox.sh` ao alcance, ele imprime em **stderr** o aviso
de 4 linhas do **PISO DECLARADO** e continua. As variáveis de proxy inválidas do piso são
**degradação declarada, não isolamento** — são lombada, não muro: não impedem socket bruto nem
runtime que as ignore, e o runner diz isso em voz alta.

**O modelo de ameaça é "aluno resolvendo exercício", não "atacante".** Docker permanece **opt-in**
(`sandbox.mode: docker_strict`, decisão **D-S03**, antes rotulada `D-C02`).

> **PERGUNTE AO USUÁRIO (D-S03)** — Docker é requisito para rodar desafio, ou modo estrito opcional para quem já tem?
> Docker é o cofre: se o código do aluno fizesse algo perigoso, ele segura. Exigir o cofre para estudar fatorial afasta exatamente o público que este projeto quer.
> **Opções:** **(a)** piso POSIX sempre, com modo estrito por Docker opt-in — não bloqueia o produto atrás de uma instalação, e oferece ao macOS as garantias que o Linux dá de graça; o piso POSIX é mais fraco que um container de verdade · **(b)** obrigatório — isolamento forte sempre, e mata a adoção · **(c)** obrigatório só no macOS — compensa o sandbox mais fraco de lá, e vira dois produtos diferentes em dois sistemas
> **Default:** **(a)** · **Custo de mudar depois: cheap**

---

## 3.13 Integridade: o aluno pode editar o teste para passar

Ele pode, e nada impede — o arquivo está no disco dele, com permissão dele.

| Mecanismo | O que faz | O que **não** faz | Custo |
|---|---|---|---|
| Diretório separado (`tests/`) | reduz edição acidental | não impede edição deliberada | zero — já está no layout |
| `chmod 444` no teste | sinaliza intenção | `chmod` de volta é um comando | atrapalha quem legitimamente quer experimentar com o teste para entendê-lo |
| **SHA-256 no manifesto** | **detecta** que o arquivo mudou | não diz quem nem por quê; não impede | baixo — um `sha256sum` por execução |
| Harness recusa "passou" com hash divergente | eleva o esforço de burlar acima de "editar um assert" | contornável por quem edite o `meta.json` também | médio; cria atrito com quem customiza de propósito |
| Ofuscação, telemetria, sandbox adversarial | — | — | alto, e o "adversário" é a própria pessoa que pediu para aprender |

### 3.13.1 ⭐ `integrity.test_sha256` nasce `null`, e isso é regra de correção

> `integrity.test_sha256` e `integrity.reference_sha256` aceitam **`null`**. São obrigatórios
> (não-nulos) **apenas** quando `challenge_status` ∈ {`validated`, `solved`}. Em `draft` ou
> `rejected`, `null` é o valor correto.
>
> Quem calcula é **`challenge-verify.sh`**, com `sha256sum`, no passo 7, na aprovação. **O tutor
> nunca escreve esse campo.**

O motivo é fatal se ignorado: **uma LLM não computa SHA-256.** Se o schema exigir o campo desde a
criação, o modelo preenche com 64 caracteres hexadecimais que **parecem** um hash e não são. A partir
daí a detecção de adulteração **mente para sempre**: toda execução compara o arquivo real com um hash
inventado, diverge, e o aluno recebe "seu teste foi modificado" **já na primeira rodada, sem ter
tocado em nada**. Em pouco tempo ele aprende a ignorar o aviso, e o mecanismo inteiro vira ruído.

Hash ausente é **honesto**: significa "ainda não há linha de base". Hash inventado é **pior que
ausente**, porque afirma uma coisa que não é verdade.

`challenge-new.sh` **assere** isso depois de escrever: `test_sha256` diferente de `null` num `draft`
→ **exit 5**. E se `test_sha256` for `null` num desafio `validated`, isso é **defeito do harness**,
não do aluno — o desafio volta para `draft` e é revalidado.

### 3.13.2 A política default é `warn`

`integrity.policy = "warn"` (D-C01). O harness grava o hash na aprovação, confere antes de cada
execução, e quando diverge **avisa e continua**: *"O arquivo de teste foi modificado desde que este
desafio foi validado. Sem problema se foi de propósito — mas vale lembrar: o teste é a especificação
do desafio. Mudá-lo muda o que está sendo cobrado, não te ensina a resolver. Quer que eu restaure o
original?"* Não há nota, prova nem credencial em jogo; quem edita o teste só prejudica a si mesmo.
Com `null`, não há o que conferir e a execução segue sem aviso nenhum. A política vira `block` no dia
em que o produto for usado em contexto avaliativo — fora deste escopo.

---

## 3.14 ⭐ A limitação que não tem cura

### 3.14.1 Se a referência estiver errada, o protocolo aprova os dois

**É a limitação central, e ela não tem cura dentro do algoritmo.** Todos os oito passos assumem que
`R` está correta. Se `R` tem um bug e `T` herdou a **mesma premissa errada** — cenário plausível
quando os dois saem do mesmo modelo, no mesmo turno, da mesma leitura equivocada do enunciado —,
então:

| Passo | Resultado |
|---|---|
| 1 — falha contra o stub vazio | ✔ |
| 2 — passa contra `R` | ✔ |
| 3 — passa contra as alternativas, geradas com o mesmo raciocínio errado | ✔ |
| 4 — mata os mutantes | ✔ |
| 5 — determinístico | ✔ |
| 6 — contagens batem | ✔ |
| **Veredito** | **`approved`. E os dois estão errados.** |

Nenhum passo detecta isso, porque **nenhum usa fonte de verdade independente de `R`**.

### 3.14.2 As três mitigações técnicas, nenhuma suficiente sozinha

| # | Mitigação | Por que ajuda | Limite |
|---|---|---|---|
| 1 | **Invariantes checadas sobre `R` isoladamente** (§3.10.4) | um bug em `R` que viole uma propriedade do próprio domínio aparece **mesmo que `T` concorde inteiramente com `R`** | só pega bug que viole a invariante escolhida |
| 2 | **Conferência contra biblioteca confiável** (`statistics`, `math`, `Fraction`, `Decimal` — tudo stdlib) | troca "o LLM escreveu `R` certo" por "uma biblioteca madura confirma `R`" — fonte genuinamente independente | só existe onde há função equivalente na stdlib |
| 3 | **Casos-âncora derivados do enunciado, não da referência** (`anchor_cases_from_statement`) | pares entrada→saída extraídos do **texto**, idealmente numa chamada separada com contexto diferente do que gerou `R` e `T` — quebra o acoplamento porque a origem do valor não passou pelo mesmo raciocínio | depende de o enunciado trazer valores |

**Regra**: para desafio de **alto risco pedagógico** — poucos cenários, domínio numérico em que o
aluno não consegue conferir a resposta na mão, `skill_level: beginner` — **pelo menos uma das três é
obrigatória** antes de `approved`. Nos demais, o risco residual é aceito e o `meta.json` registra
quais estratégias foram usadas.

### 3.14.3 ⭐ A mitigação que não é técnica

> **O aluno é uma fonte de verdade independente.** Um aluno que diz "acho que o teste está errado"
> deve ser **levado a sério** — com o tutor reexecutando o protocolo e revisando `R` —, **não
> convencido de que o teste está certo** (**DES-8**).

Por isso o enunciado gerado sempre inclui, como frase fixa do `README.md.tmpl`:

> *"Se você acha que o teste está errado, me diga — testes gerados automaticamente erram, e eu
> revalido."*

### 3.14.4 As outras limitações declaradas

| Limitação | Conteúdo |
|---|---|
| **Mutation score não é cobertura de bugs reais** | o estudo de replicação arXiv:2607.22880 questiona a correlação entre score de suítes geradas por LLM e efetividade real. O score aqui é um **piso de sanidade** — "o teste distingue a referência de 17 variações mecânicas dela" —, não um certificado |
| **Mutantes equivalentes não são detectáveis automaticamente** | tratamento em §3.5.6 e §3.11 |
| **`N_REP = 3` não detecta flakiness de concorrência** | §3.4.6 |
| **O piso de sandbox não é isolamento real** | §3.12; roda no mesmo kernel, `ulimit -v` é pouco confiável no macOS, isolamento de rede sem privilégio só existe no Linux |
| **`timeout` não existe no macOS por padrão** | três fontes de timeout, três códigos (`137` / `142` / `137` de `ulimit -t`) — mais uma razão para o veredito sair do **tempo decorrido** |
| **A amostragem de mutantes em linguagens compiladas** | reduz a força do passo 4; fica registrada em `mutation.detail`, nunca escondida |

---

## 3.15 Fronteiras dos dois scripts

| Script | O que faz | O que **não** faz |
|---|---|---|
| `challenge-new.sh` | materializa a árvore do `layout_profile`, deriva referência/alternativas/`empty_stub` do stub, escreve `meta.json` em `draft` e valida contra o schema | **não** valida o desafio (DES-1) · **não** grava SHA-256 · **não** promove `challenge_status` · **não** escreve fora de `<setup_root>/challenges/<NNNN>-<slug>/` · **não** instala toolchain · **não** acessa rede · **não** gera desafio em linguagem não confirmada por `command -v` · **nunca** sai com `10` (é determinístico do começo ao fim) |
| `challenge-verify.sh` | os 8 passos, o catálogo fixo, o kill loop, o REQUEST/APPLY, os SHA-256 na aprovação | **nunca** aprova por julgamento de modelo · **nunca** pede mutantes a um modelo · **nunca** deduz timeout de exit code · **nunca** grava `meta.json` sem validar antes |

### 3.15.1 As 9 regras permanentes de desafio (`docs/00-contratos.md` §9.5)

| ID | Regra |
|---|---|
| DES-1 | **Você autora, o harness julga**: nunca decida por leitura se o teste está bom, nunca preencha campo de `validation` de cabeça |
| DES-2 | Nada chega ao aluno sem `verdict: approved` e `challenge_status: "validated"`; `weak` e `rejected` não saem |
| DES-3 | Nunca prometa "todos os cenários de erro": diga "cobre estes N cenários nomeados; o mutation score medido foi X%" |
| DES-4 | O gate é **igualdade** `tests_run == expected_test_count`, nunca `> 0`; exit code sozinho mente em Go, Rust, Node, Java e `unittest` |
| DES-5 | O catálogo de mutação é **fixo e mecânico** (ROR AOR LCR UOI CRP SDL RVR SVR); nunca peça mutantes a um modelo |
| DES-6 | Valor esperado de matemática nunca é número calculado de cabeça: vem de **executar a referência** ou de uma propriedade que dispensa o valor |
| DES-7 | `.solution/` nunca é mostrada, citada ou parafraseada — nem "só a ideia geral"; a revelação só ocorre no último degrau, a pedido explícito, marcando `solution_revealed` |
| DES-8 | Nunca conserte o código do aluno sem ele pedir, nunca afrouxe asserção de teste já validado, e **leve a sério quem diz "acho que o teste está errado"** — revalide e revise a referência |
| DES-9 | Máximo **3** tentativas de regeneração; esgotadas, `challenge_status: "rejected"`, descarte e proponha **outro** desafio do mesmo conceito |
