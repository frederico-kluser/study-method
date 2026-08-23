# 52 — `challenge-verify.sh` · motor de mutação · REQUEST/APPLY

Contrato do harness que decide se um teste chega ao aluno. **O LLM autora, o harness julga.** Nenhum
veredito daqui vem de opinião: vem de exit code, de contagem de casos executados e de aritmética
sobre um catálogo fixo de mutantes. Há **uma** exceção, e ela é o ciclo REQUEST/APPLY do §5.

| Caminho | Modo | O que é |
|---|---|---|
| `SK/scripts/challenge-verify.sh` | `0755` | O harness. Passos 0–7. |
| `SK/scripts/lib/_mutate.py` | `0755` | Motor de mutação do catálogo fixo v1.0. Auxiliar; o `_` inicial o mantém fora da tabela canônica de CLI (`docs/00` §8). |

## 1. CLI

```
challenge-verify.sh <challenge_dir> [--sample-size N] [--n-rep N]
                    [--threshold X] [--apply <resposta.json>]
```

`<challenge_dir>` default `$PWD` · `--sample-size` roda só os **primeiros N** mutantes da ordem
canônica · `--n-rep` default `3` (20 em desafio de concorrência) · `--threshold` default `0.90` ·
`--apply` retoma o protocolo com a classificação dos sobreviventes.

**stdout**: exit `0` → `{"verdict","mutation_score","killed","survived","rejections"}`;
exit `10` → o envelope de PEDIDO de `docs/00` §6.1.

**Exit codes** (tabela única de `docs/00` §5.1; nenhum outro é produzido):

| | Quando |
|---|---|
| `0` | O protocolo terminou. **`weak` e `rejected` também saem 0** — reprovar um desafio não é erro do script; o veredito está no stdout. |
| `1` | Erro de execução: I/O, dependência ausente, `sm_request` fora de contrato. |
| `2` | Uso incorreto — inclusive resposta de `--apply` semanticamente recusada. |
| `3` | `<challenge_dir>` inexistente ou sem `meta.json` legível. |
| `5` | Falha de schema: `meta.json` de entrada, `meta.json` que seria gravado, ou o envelope da resposta. |
| `10` | `needs_model_input`: o passo 4 achou sobreviventes. O PEDIDO está em stdout e **nada foi alterado em disco**. |

⚑ `docs/05` §3.4 e `SK/references/challenge-protocol.md` dizem "`5` = weak/rejected". Vale
`docs/00` §8, a fonte única: **weak/rejected saem 0**; o `5` fica para falha de schema.

## 2. `executar()` — a função única

Toda execução de teste passa por ela; nada roda fora dela.
`executar(implementação) -> {exit_code, tests_run, tests_failed, wall_ms, out}`.

1. **instala** a implementação em `artifacts.stub_path` — o stub do aluno é salvo antes do passo 1 e
   restaurado no `trap EXIT`, **inclusive em caminho de erro**;
2. **limpa o cache de bytecode**: `__pycache__`, `*.pyc`, `.pytest_cache` sob o desafio (§6);
3. **exporta o ambiente**: `LC_ALL`, `LANG`, `TZ`, `PYTHONHASHSEED`, `PYTHONDONTWRITEBYTECODE=1`,
   `NODE_COMPILE_CACHE=""`, `SOURCE_DATE_EPOCH`, `CHALLENGE_TIMEOUT`, `CHALLENGE_EXPECTED_TESTS`,
   mais `execution.env`;
4. **endurece o argv**: interpretador Python sem `-B` → o harness **insere `-B`**. A proteção não
   pode depender do que `challenge-new.sh` escreveu no manifesto;
5. roda `execution.build_command` (se houver) por `sm_sandbox_run`; build vermelho encerra a
   execução com o exit code do build e contagens zeradas;
6. roda `execution.test_command` como **argv, sem shell**, por
   `sm_sandbox_run "<challenge_dir>/<working_dir>" -- <argv…>`, medindo o tempo com `date +%s%N`;
7. extrai `tests_run`/`tests_failed` pelo `execution.test_count_probe`.

**Regra 1** falha é `exit_code != 0`, **jamais** `== 1` · **Regra 1b** `timeout` é decidido por
**tempo decorrido ≥ `timeout_seconds`**, nunca por exit code · **Regra 3** `set -euo pipefail`.

**Probes de contagem** — `python_unittest_ran_line`: última `^Ran (N) tests?`, falhas = `0` se houver
`^OK`, senão soma de `(failures|errors)=N` · `node_test_tap_summary`: `^# tests (N)` / `^# fail (N)` ·
`go_test_json_run_events`: `"Test"` distintos em `"Action":"run"` / `"fail"` · `cargo_test_running_lines`:
**soma** de `^running (N) tests?` (há uma por binário) e de `(N) failed` · `junit_console_summary`:
`N tests successful` / `N tests failed` · `counter_protocol`: `^TESTS_RUN=` / `^TESTS_FAILED=` ·
`none`: **rejeitado no passo 0**.

**Probes de nomes** (insumo do 6.2) — Python: reexecuta com `-v` no argv e lê `^(\w+) \(` · Node:
`^(not )?ok \d+ - (.+)$` · Go: `"Test"` distintos · Cargo: `^test (\S+) \.\.\.` · `counter_protocol`
e `none` não expõem nomes: o 6.2 cai para igualdade de contagem e **registra isso em `detail`**.

## 3. Os 8 passos

### PASSO 0 — build e sanidade → `build_failed`

0.1 `meta.json` valida contra `challenge-manifest.schema.json` (falha → **exit 5**, não é rejeição
do desafio) · 0.2 todo caminho de `artifacts` existe (`statement`, `stub`, `test`, `runner`,
`reference`, `empty_stub`, cada `reference_alt_paths[]`, `working_dir`) · 0.3
`len(scenarios) == execution.expected_test_count` · 0.4 `layout_profile` é o exigido pela `language`
e o manifesto do layout existe (`go.mod` · `Cargo.toml` · `mix.exs` · `Project.toml`) · 0.5 havendo
`build_command`, **o stub vazio compila** · 0.6 `test_count_probe != "none"`.

`empty_stub_path` ausente é rejeição: sem ele o passo 1 não tem contra o que rodar depois que o
aluno editou o stub.

`language → layout_profile`: `go`→`go_module` · `rust`→`cargo_crate` · `java`/`kotlin`→`java_classfile` ·
`csharp`→`dotnet_project` · `elixir`→`mix_project` · `swift`→`swiftpm` · `julia`→`julia_project` ·
`haskell`→`cabal_project` · demais →`generic`.

### PASSO 1 — o teste DEVE FALHAR contra o stub vazio

Exige `tests_run == expected_test_count`, `exit_code != 0` e `tests_failed >= 1`.

| Observado | Código |
|---|---|
| `tests_run == 0` | `zero_tests_executed` |
| `tests_run != expected` | `test_count_mismatch` |
| `exit_code == 0` | `passes_on_empty_stub` — o teste é tautológico |
| `exit_code != 0` e `tests_failed == 0` | `test_malformed` — o teste não carregou |

### PASSO 2 — o teste DEVE PASSAR contra a referência

Exige contagem igual, `exit_code == 0`, `tests_failed == 0`, `wall_ms < timeout_seconds*1000`.
`wall_ms` estourado → `timeout_on_reference` · contagem → `test_count_mismatch` · vermelho →
`fails_on_reference` (o teste impossível).

### ⭐ PASSO 3 — o teste DEVE ACEITAR referências alternativas corretas

**Este é o passo que detecta over-specification por execução, e não por opinião**: em vez de pedir a
um segundo modelo que "perceba" o acoplamento, roda-se o teste contra uma implementação
comprovadamente correta e estruturalmente diferente. Resposta binária.

- `reference_alt_paths` vazia → `status: not_applicable`, e o `detail` diz **por que** não há
  alternativa estrutural plausível. Omissão registrada não é aprovação silenciosa.
- Alternativa reprovada → entra em `steps.step_3_alternatives.alternatives_rejected[]` com `path`,
  `failing_test_names[]` (que nomeiam **exatamente a asserção acoplada**) e `resolution`, e rejeita
  com **`rejects_correct_alternative`**.
- O harness grava `resolution: "unresolved"`. Afrouxar a asserção culpada (`assertion_relaxed`) ou
  regerar o teste (`test_regenerated`) é ação de autoria; quem edita reexecuta o protocolo **desde o
  passo 0**. `unresolved` é **incompatível** com `approved` — o 6.3 fecha isso.

### ⭐ PASSO 4 — o teste DEVE MATAR o catálogo fixo → `mutation_score_below_threshold`

4.1 Gera `M1..Mk` com o catálogo fixo do §4, **uma mutação por mutante**. Determinístico: mesma `R`
→ mesma lista, mesma ordem. **Os mutantes nunca são pedidos a um modelo** — o mesmo viés que gerou o
teste geraria os mutantes.

4.2 Para cada `Mi`, `executar(Mi)`: `tests_run != expected_test_count` (não compilou, não carregou)
→ **inválido**, fora do denominador e **não** conta como morto · `exit_code != 0` → **morto** ·
`exit_code == 0` → **sobrevivente**, com `operator`, `file`, `line`, `before`, `after`,
`classification: "unclassified"`.

4.3 `valid = killed + survived`; `score_bruto = killed / valid`. **`valid == 0` é `build_failed`**:
referência que nenhuma mutação mecânica altera não sustenta desafio.

4.4 `survived > 0` **e** passos 0–3 todos não-`failed` → **para** e emite o PEDIDO (§5). Se um passo
obrigatório já reprovou, o veredito já é `rejected` e a classificação não pode mudá-lo: segue o
caminho degradado de `docs/00` §6.4 — todo sobrevivente fica `unclassified` e conta como `test_gap`.

4.5 `equivalent_count = |{s : s.classification == "equivalent"}|`;
`score = killed / (valid - equivalent_count)`.
⭐ **Guarda**: `valid - equivalent_count == 0` **não** é score 1,0 — é `build_failed`.
`score >= threshold` → aprovado; `score < threshold` → `weak`. **Nunca** aprovar direto.

**Amostragem** (`--sample-size`, ou automática quando há `build_command` e
`k × tempo > 120 s`): os **primeiros** da ordem canônica, **nunca sorteados** — duas execuções sobre
a mesma referência têm que dar a mesma amostra, senão o score deixa de ser comparável entre
tentativas. Amostrar reduz a força do passo 4 e vai no `detail`; **não** reduz o limiar.

### PASSO 5 — determinismo → `nondeterministic`

3 execuções contra `R` **variando o ambiente**: (`C`, `UTC`, `0`) · (`pt_BR.UTF-8`,
`America/Sao_Paulo`, `1`) · (`C.UTF-8`, `Asia/Tokyo`, `524287`), para `LC_ALL`, `TZ` e
`PYTHONHASHSEED`. Exige `(exit_code, tests_run, tests_failed)` **idêntico** nas três. `env_matrix[]`
grava as combinações como string; `stable` grava o resultado. **Limitação declarada no `detail`**:
pega *Time*, *Randomness*, *Unordered Collections* e *Platform Dependency*; **não** pega *Async-Wait*
nem *Concurrency*.

### PASSO 6 — contagens e consistência → `test_count_mismatch`

6.1 `tests_run == expected_test_count` em todas as execuções dos passos 1, 2, 3 e 5 · 6.2 os nomes
reportados cobrem **exatamente** `{scenarios[].test_name}`, nem a mais nem a menos (nome igual ao
caminho do arquivo de teste é reportado como o **envelope de arquivo do `node:test`**) · 6.3 nenhum
`alternatives_rejected[].resolution == "unresolved"` · 6.4 `numeric_mode == "float_tolerance"` exige
`rel_tol` **ou** `abs_tol`.

### PASSO 7 — veredito e selagem

```
SE algum de {0,1,2,3,5,6} = failed         -> rejected
SENÃO SE passo 4 = failed por build_failed -> rejected
SENÃO SE passo 4 = failed                  -> weak
SENÃO                                      -> approved
```

`approved` → `challenge_status: validated` e o **harness** calcula `integrity.test_sha256` e
`reference_sha256` com `sha256sum`. `weak`/`rejected` com tentativa disponível → `draft`, hashes
`null`. Tentativa 3 esgotada → `rejected` + rejeição `attempt_limit_reached`.
`validation.generation_attempts` sobe a cada execução; máximo **3**.

**Os SHA-256 são sempre do harness e só na aprovação.** Uma LLM não computa SHA-256: hash inventado
mente para sempre, o aviso de adulteração dispara já na primeira rodada, e o aluno aprende a ignorar
o mecanismo inteiro. `null` é o valor correto até a aprovação.

**Ordem de gravação**: o documento inteiro é montado em memória, **validado contra o schema** e só
então gravado por `sm_atomic_write`. Validar depois de gravar deixaria em disco um `meta.json` que a
próxima execução recusa a ler — o desafio ficaria travado pelo próprio harness. Falha → **exit 5**,
nada é alterado.

⚑ Reconciliações com `docs/05` §4.1, a favor do schema (que é a autoridade): `mutation.score_bruto`
não existe no schema (`additionalProperties: false`) → vai por extenso no `mutation.detail`, junto da
conta que produziu o `score` · `mutation.sample_size` é `integer` ("igual a `valid` quando todos
rodaram"), não `null` → grava `valid`, e a ausência de amostragem é dita no `detail` ·
`steps.step_5.env_matrix[]` é `string`, não objeto → uma string por repetição.

## 4. O catálogo FIXO de mutação — v1.0 (`lib/_mutate.py`)

Aplicação: **texto do fonte, uma mutação por mutante**, com strings e comentários **mascarados**
antes de qualquer regex casar (o `404` de `"erro 404"` não é literal mutável; o `<` de uma docstring
não é operador). Nenhum AST.

**A regra que fecha a ambiguidade**: um caractere de operador que faça parte de um **operador
composto de atribuição** (`+=`, `-=`, `*=`, `/=`, `%=`, `//=`, `**=`, `&=`, `|=`, `^=`, `<<=`, `>>=`)
**não é mutado**; `**`, `//`, `<<`, `>>` e `->` também não. Implementação: o tokenizador casa
operadores **gulosamente por comprimento decrescente**, então `*=` nunca é visto como `*` e `**`
nunca como dois `*`. A regra deixa de ser lista de exceções e vira propriedade do casamento.

| ID | Transformação | Quantos |
|---|---|---|
| **ROR** | `<`↔`<=` · `>`↔`>=` · `==`↔`!=` | 1 por ocorrência |
| **AOR** | `+`↔`-` · `*`→`/` · `/`→`*` · `%`→`*` | 1 por ocorrência **não composta** |
| **LCR** | `and`↔`or` · `&&`↔`\|\|` | 1 por ocorrência |
| **UOI** | remove `not ` · remove `!` antes de identificador | 1 por ocorrência |
| **CRP** | cada literal inteiro `n` vira `n+1` **e** `n-1` | **2 por literal** |
| **SDL** | linha executável elegível → no-op (`pass` / `;`) | 1 por linha elegível |
| **RVR** | corpo inteiro da função → `return <valor-zero>` | **1 por função que devolve valor** |
| **SVR** | leitura de local → outra local ligada | **1 por ocorrência de leitura** |

**Ordem canônica**: ROR → AOR → LCR → UOI → CRP → SDL → RVR → SVR; dentro de cada operador, por
linha e coluna crescentes. É também a ordem de amostragem.
**`mutant_id`** = `<OP>@L<linha>C<coluna>`, 1-based nos dois. **CRP acrescenta `+`/`-`** porque produz
dois mutantes no mesmo sítio; sem o sufixo os ids colidem e o pareamento pedido/resposta quebra.
Nenhum outro operador produz mais de um mutante no mesmo sítio.

**SDL — linhas elegíveis**: toda linha executável que **não** seja assinatura (`def`/`class`/
decorador), `return`, `import`/`from`, `global`/`nonlocal`, linha que **abre bloco** (termina em `:`
na família Python, ou começa com `if`/`for`/`while`/`else`/`try`/`with`/`except`/`finally`/`match`/
`case`), ou linha que já é no-op. Deletar linha que abre bloco produz mutante que não compila —
ruído no denominador; `return` é território do RVR.

**RVR — 1 por função que devolve valor**: exige ao menos um `return <expr>` com expressão. Função só
de efeito colateral gera **0** — o mutante seria idêntico à referência, equivalente por construção, e
equivalente por construção não entra no denominador para depois sair dele. Valor-zero inferido do
fonte: literal numérico → `0` · texto → `""` · lista → `[]` · mapa → `{}` · booleano/comparação →
`False` · nome nu → resolvido pela atribuição **simples** àquele nome no corpo (a composta aritmética
já implica numérico) · nada inferível → `None`.

**SVR — 1 por ocorrência de leitura, não por par** (com 3 locais e 4 leituras, "todos os pares" dá 8;
esta regra dá 4). *Ocorrência elegível* = leitura de nome local; **nunca** alvo de atribuição —
inclusive o alvo de atribuição composta (`acc` em `acc *= i`) e a variável de laço na própria linha
do `for`; nome de função em chamada, atributo depois de `.` e palavra reservada também não.
*Ligados naquele ponto* = parâmetros da assinatura + nomes ligados por atribuição ou `for` em linhas
**estritamente anteriores**, com a variável de laço contando a partir do corpo; menos de 2 ligados →
a linha não gera mutante. *Substituição* = o **nome imediatamente anterior na ordem de ligação**,
ciclicamente. Um mutante por ocorrência, determinístico, sem sorteio.

**Contagem de referência, verificada** — fatorial iterativo de 7 linhas com guarda de negativo:
**Total 17 · ROR 1 · AOR 1 · LCR 0 · UOI 0 · CRP 8 · SDL 3 · RVR 1 · SVR 3.**
ROR 1 = única comparação · **AOR 1 = só o `+` de `n + 1`; `acc *= i` é composto e não muta** ·
CRP 8 = 4 literais (`0`,`1`,`2`,`1`) × 2 · SDL 3 = L3 `raise`, L4 `acc = 1`, L6 `acc *= i` (L1
assinatura, L2 e L5 abrem bloco, L7 é `return`) · RVR 1 = 1 função que devolve valor ·
SVR 3 = L5 `n`→`acc`, L6 `i`→`acc`, L7 `acc`→`n` (L2 tem só `n` ligado).

**CLI do motor**: `_mutate.py list|apply|count <fonte> [<mutant_id>] [--language L] [--json]`.
Exit `0` · `1` fonte ilegível · `2` `mutant_id` desconhecido ou ausente. Perfis `python` e
`c_family`; entre perfis muda o marcador de comentário, o delimitador de string, os conectores
lógicos e a forma do no-op — o motor é o mesmo.

## 5. ⭐ REQUEST/APPLY — a única etapa em que o modelo opina

Um sobrevivente tem duas explicações: **`test_gap`** (falta um cenário) ou **`equivalent`**
(idêntico à referência; nenhum teste poderia matá-lo). Decidir é julgamento, e **script de shell não
conversa com modelo**.

```
1. o script roda até onde é determinístico;
2. escreve o PEDIDO em STDOUT e sai com EXIT 10 — SEM ALTERAR NADA EM DISCO;
3. o modelo lê, produz a RESPOSTA e re-invoca com --apply <resposta.json>;
4. o script VALIDA a resposta e SÓ ENTÃO aplica.
```

**RA-1 verificada**: no exit 10 o `meta.json` está byte a byte como antes e o stub do aluno foi
restaurado. Não existe estado "meio validado" para alguém encontrar depois.

**O PEDIDO** é o envelope de `docs/00` §6.1 produzido por `sm_request`, com
`kind = "classify_survivor"` e `response_schema = urn:study-method:schema:challenge-verify-response:1`.
O **`payload` é uma instância de `challenge-verify.request.schema.json`**: `schema_version`,
`request_kind`, `challenge_id`, `language`, `operators_version`, `score` (o bruto), `threshold`,
`valid`, `survived`, `reference_excerpt` e `survivors[]` com `mutant_id`, `operator`, `file`, `line`,
`before`, `after`.

⚑ **`generated_at` não entra no cálculo do `request_id`.** O `request_id` é o sha256 canônico do
payload; se o carimbo entrasse, o id mudaria a cada segundo e o `--apply` nunca reconheceria o
próprio pedido. O carimbo vive no envelope e é injetado no payload só na hora de imprimir, para que o
objeto impresso valide contra o schema.

`--apply` **recomputa** o `request_id` rodando os passos 0–4 de novo (todos determinísticos) sobre o
estado atual em disco. Mudou o teste ou a referência entre as fases → o id não bate → **exit 5**
(RA-2). Não há arquivo de pedido pendente em lugar nenhum: a fase de PEDIDO não escreve.

**A RESPOSTA** é aceita em duas formas. *Envelope* (`docs/00` §6.2, detectada por `.protocol`):
`sm_apply_read <arquivo> classify_survivor <request_id>` confere `protocol`, `protocol_version`,
`kind` e `request_id`; `.items` são as classificações. *Nativa* (sem `.protocol`): `sm_json_validate`
contra `challenge-verify.response.schema.json`, confere `request_kind` e `challenge_id`;
`.classifications` são as classificações.

**O que o `--apply` valida antes de gravar** — envelope ou schema nativo → **5** · `challenge_id`
diverge → **5** · conjunto de `mutant_id` não é **exatamente** o dos sobreviventes, nem a mais
(inventado) nem a menos (sem veredito) → **2** · `justification` vazia, ou < **40 caracteres** quando
`equivalent` → **2** · `classification` fora de {`equivalent`, `not_equivalent`, `test_gap`,
`unclassified`} → **2**.

**Normalização**: `not_equivalent` e `unclassified` viram **`test_gap`** no manifesto — é o enum de
`challenge-manifest.schema.json` e é o lado conservador. Errar para `test_gap` custa uma regeneração;
errar para `equivalent` entrega ao aluno um teste que aprova código errado. Aprovado, o script grava
`classification` e `justification`, recalcula `equivalent_count` e `score`, e retoma em 4.5. **RA-6**:
no máximo 2 ciclos por invocação lógica.

## 6. ⭐ O cache de bytecode falsifica o mutation score

O CPython invalida o `.pyc` por **(mtime, tamanho)** do fonte, com granularidade de **1 segundo**.
Mutantes de troca de operador têm **exatamente o mesmo tamanho** que a referência e são escritos em
sucessão rápida no **mesmo diretório de trabalho** — que é o que o harness faz, porque `executar()`
instala a implementação no `stub_path`. Sem proteção, o mutante roda o bytecode do anterior:

```
nu            validos=17 mortos=17 sobreviventes=0  score_bruto=17/17=1.0000  []
protegido     validos=17 mortos=16 sobreviventes=1  score_bruto=16/17=0.9412  [CRP@L5C20-]
```

**É a diferença entre aprovar e reprovar um teste fraco.** Um kill loop que criasse um diretório
temporário por mutante nunca veria o bug.

**Regra normativa** — `executar()` DEVE, antes de **cada** execução: (1) remover recursivamente
`__pycache__`, `*.pyc` e `.pytest_cache` sob o desafio; (2) exportar `PYTHONDONTWRITEBYTECODE=1`
**e** garantir `python3 -B` no argv (o harness insere o `-B` se o manifesto não trouxer);
(3) exportar `NODE_COMPILE_CACHE=""` (o cache do Node é opt-in por essa variável); (4) para
linguagem compilada, garantir rebuild real e usar um diretório de trabalho por mutante quando houver
`build_command`. `cargo` recompila corretamente e `gcc` não tem cache — a armadilha é do bytecode.

## 7. Oráculo matemático sem `sympy`

`sympy` não está instalado e o PEP 668 bloqueia `pip install` fora de venv.

> **Regra absoluta**: o valor esperado de um teste de matemática **nunca** é um número que o modelo
> calculou de cabeça. Vem de (a) executar a referência, ou (b) uma propriedade que dispensa o valor.

| Família | `oracle.strategies` | Forma |
|---|---|---|
| Derivada numérica × analítica | `invariant_property` | diferença central `(f(x+h)-f(x-h))/(2h)`, `h=1e-5`, N pontos com seed fixa |
| A inversa desfaz a direta | `invariant_property` | `abs(inversa(direta(x)) - x)` relativo |
| Identidade conhecida | `invariant_property` | `sen²+cos²-1` |
| TFC: Riemann × primitiva | `invariant_property` | soma do ponto médio contra `F(b)-F(a)` |
| Relação metamórfica | `metamorphic_relation` | `area(k·r) == k²·area(r)`, sem saber nenhuma área |
| Conferência contra a stdlib | `trusted_stdlib` | `statistics.fmean`, `math` |
| Aritmética exata | `exact_arithmetic` | `Fraction` / `Decimal` |
| Casos-âncora do enunciado | `anchor_cases_from_statement` | pares entrada→saída do texto, em chamada separada |

O harness cobra: `oracle.numeric_mode` obrigatório, e `float_tolerance` **exige** `rel_tol` ou
`abs_tol` (o 6.4 rejeita) · `==` entre `float` é proibido, e onde o resultado puder ser exato vem
`Fraction`/`Decimal` antes de tolerância · toda amostragem tem **seed fixa** em
`oracle.invariants[].seed`, sem o que o passo 5 reprova por `nondeterministic` · `reference_impl` é
obrigatória em todo desafio e, para desafio matemático, **mais uma** das demais.

**Limitação que nenhum passo cobre**: se `R` estiver errada e `T` herdar a mesma premissa errada, os
sete passos passam e o veredito é `approved` com os dois errados. Mitigações: invariantes checadas
sobre `R` isoladamente, conferência contra biblioteca confiável, casos-âncora do enunciado — nenhuma
suficiente sozinha.

## 8. Conformidade verificada

| Verificação | Resultado |
|---|---|
| `bash -n`, `py_compile` | limpos |
| Catálogo sobre a referência canônica | **17 mutantes**, ids idênticos aos de `docs/05` §5.4 |
| Teste **forte** (5 cenários) | 8 passos, 17 válidos, 16 mortos, 1 sobrevivente (`CRP@L5C20-`, equivalente), bruto 0,9412 → `score` **1,0000** → `approved` |
| Teste **fraco** (1 cenário) | passa nos passos 1 e 2; **12/17 = 0,7059** bruto, **12/16 = 0,7500** corrigido → `weak`, exit **0** |
| Cache de bytecode | nu **17/17 = 1,0000** × protegido **16/17 = 0,9412** |
| Over-specification | teste que espia `co_varnames` passa contra `R` e é reprovado no passo 3 pelas duas alternativas; `failing_test_names` nomeia a asserção culpada |
| Tautológico · impossível | `passes_on_empty_stub` no passo 1 · `fails_on_reference` no passo 2 |
| Contagem | 1 caso × `expected` 5 → `test_count_mismatch`; nome fora de `scenarios[]` com contagem certa → só o passo 6 pega |
| REQUEST/APPLY | pedido → **10** sem tocar em disco; sem `justification`, justificativa curta, mutante inventado, sobrevivente sem veredito → **2**; `request_id` ou `kind` errado → **5**; resposta válida (envelope **e** nativa) → **0** |
| Determinismo | teste dependente de `TZ` reprovado por `nondeterministic` |
| Desafio matemático | validado só por propriedades invariantes (zero `assertEqual` com valor fixado); 9 mutantes, 9 mortos, `score` 1,0000 → `approved` |
