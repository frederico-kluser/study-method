# 05 — Desafios com TDD validado: o protocolo `validar_teste`

> Este documento especifica o coração técnico da skill: como um desafio nasce, quais artefatos
> ele tem, e **como o teste do desafio é provado correto antes de o aluno ver**. Ele mora no
> `docs/` **do repositório** (não confundir com o `docs/` **do setup**, que é criado no projeto
> de estudo do aluno junto de `memory/`, `researchs/` e `challenges/`).
>
> A pesquisa `04-tdd-actor-critic.md` (no `docs/research/` do repositório) estabeleceu *por que*
> essa validação é necessária e propôs o algoritmo em 6 passos; a pesquisa `06-toolchains.md`
> (mesmo lugar) estabeleceu *onde a árvore de arquivos quebra por linguagem*. Aqui esses dois
> resultados viram um contrato normativo, implementável literalmente por `challenge-new.sh` e
> `challenge-verify.sh`.
>
> Marcações: **[VERIFICADO]** = confirmado executando nesta máquina durante a redação deste
> documento (CachyOS, Python 3.14.7, Node 24.19.0, Rust 1.98.0, Go 1.26.5, gcc 16.2.1, GNU
> coreutils 9.11, jq 1.8.2). **[DERIVADO]** = consequência direta de um fato verificado ou de um
> achado com fonte na pesquisa 04/06. **[DECISÃO]** = escolha de design deste documento.

---

## 1. O pedido original, e o que é honestamente entregável

O pedido literal foi:

> "a skill deve propor desafios, que o usuário completa e testa. Para cada desafio, que ficará em
> `challenges/`, terá um TDD do desafio, cujo teste é a validação que devolve todos os possíveis
> cenários de erro — assim o usuário só roda o teste pra saber se passou. Todo teste criado é
> validado primeiro pelo agente de código pra saber se não tem bugs."

Duas partes desse pedido não sobrevivem ao contato com a realidade na forma literal. Reformular é
obrigação, não licença para entregar menos.

### 1.1 "Devolve todos os possíveis cenários de erro"

**Isso é literalmente impossível.** É o *test oracle problem* (Barr et al., IEEE TSE 2015, citado
na pesquisa 04 §2): decidir o resultado esperado de todo caso de teste possível, e decidir se a
saída observada bate com ele, é indecidível no caso geral. Para uma função `f(n: int) -> int` o
espaço de entrada já é infinito; um teste não pode enumerá-lo. Qualquer sistema que prometa
"todos os cenários de erro" está mentindo ou redefinindo "todos".

**O que é possível, e é o que este produto entrega** — três coisas concretas, cada uma
verificável:

1. **Enumeração fechada e nomeada.** O desafio declara, no campo `scenarios[]` do `meta.json`,
   a lista explícita dos cenários que cobre: cada um com `scenario_id`, `test_name`, um `kind`
   (`example`, `boundary`, `error`, `property`, `metamorphic`, `regression`) e uma `description`
   em pt-BR. O aluno pode ler essa lista e saber exatamente o que está sendo cobrado. Não é "todos
   os cenários" — é "estes cenários, nomeados, e nenhum outro é cobrado".
2. **Mensagem de falha didática por cenário.** Cada cenário vermelho devolve entrada, esperado,
   obtido e **a propriedade violada em linguagem do domínio** (§9). O aluno "só roda o teste pra
   saber se passou" — essa parte do pedido é atendida integralmente, e mais: quando não passou,
   ele sabe *o que* não passou e *por quê*.
3. **Cobertura medida, não prometida.** Quanto o conjunto nomeado realmente cobre não é uma
   afirmação do tutor; é um número que sai de execução: o **mutation score** (§6). Um teste com
   score 0,64 e três mutantes sobreviventes não é "completo" — e o `meta.json` diz isso, com os
   mutantes sobreviventes listados um a um.

Uma classe inteira de cenários fica coberta melhor que por enumeração: as **propriedades
invariantes** (`kind: property`). `fatorial(n) == fatorial(n-1) * n` para todo `n` de 1 a 7 é um
único caso de teste que cobre sete pontos, e uma propriedade que cobre uma *família* de entradas
em vez de um ponto. É o mais perto que se chega de "todos os cenários" sem mentir.

**[DECISÃO]** O produto nunca escreve, nem para o usuário nem no enunciado, a frase "todos os
cenários de erro". A formulação canônica é: *"o teste cobre estes N cenários nomeados; o mutation
score medido foi X%"*.

### 1.2 "Validado pelo agente de código"

A leitura intuitiva desse pedido é "um segundo LLM lê o teste e diz se está bom". A pesquisa 04
§3 mostra por que isso é sinal fraco:

- Huang et al. (arXiv 2310.01798, ICLR 2024): em autocorreção **intrínseca** — sem feedback
  externo de ground truth, ferramenta ou ambiente — os modelos falham em se autocorrigir e, em
  alguns casos, **pioram** o resultado.
- SELF-[IN]CORRECT (arXiv 2404.04298): modelos têm dificuldade sistemática em distinguir, entre
  duas respostas que eles mesmos geraram, qual é a correta.
- Mesmo CriticGPT (OpenAI, arXiv 2407.00215) — um crítico **treinado com RLHF especificamente**
  para a tarefa — produz bugs alucinados que exigem revisão humana para filtrar. E o cenário
  deste produto é pior que o dele: é o mesmo modelo, sem treino especializado, relendo a própria
  geração.

**[DECISÃO — inegociável]** A separação de papéis é rígida:

> **O LLM AUTORA. O HARNESS JULGA.**
>
> O tutor (LLM) escreve o enunciado, o stub, o teste, a implementação de referência e as
> alternativas. **O tutor nunca decide se o teste está bom.** Quem decide é
> `challenge-verify.sh`: um harness de execução determinístico, cujo veredito vem de exit codes,
> contagens de teste e diffs — nada que dependa de o modelo julgar a si mesmo.
>
> Nenhum campo de `validation` no `meta.json` pode ser preenchido por julgamento de modelo. O
> schema força isso: `validation.harness` é um enum de um único valor, `"challenge-verify.sh"`.

Isso é exatamente o que TestGen-LLM (Meta, arXiv 2402.09171) faz em produção: não pergunta ao
modelo se o teste é bom, filtra por critérios executáveis. Os números daquele estudo justificam o
rigor: de todos os testes gerados brutos, **75% compilavam, 57% passavam de forma confiável, 25%
aumentavam cobertura**, e a razão de aproveitamento até virar candidato aceito foi de **1:20 em
cenário real de produção**.

Uma segunda passada de LLM continua permitida para o que execução não mede — clareza didática da
mensagem de falha, qualidade do texto do enunciado. **Nunca** como gate de correção.

---

## 2. Anatomia de um desafio

### 2.1 Os artefatos obrigatórios e por que cada um existe

| Artefato | Existe para | Sem ele, o que quebra |
|---|---|---|
| **Enunciado** (`README.md`) | Dizer o que resolver, em linguagem de domínio, e listar os cenários nomeados | O aluno não sabe o que está sendo cobrado e interpreta a falha como arbitrária |
| **Stub** (`stub.<ext>`) | O único arquivo que o aluno edita: assinatura pronta, corpo vazio | O aluno gasta esforço adivinhando nome/assinatura em vez de resolver o problema; e o passo 1 do protocolo não tem contra o que rodar |
| **Teste** (`tests/test_stub.<ext>`) | A especificação executável — o que o aluno lê e contra o que coda | Não há desafio |
| **Implementação de referência** (`.solution/reference.<ext>`, **oculta**) | Ser o oráculo real. O valor esperado vem de *executar* a referência, não de o modelo calcular de cabeça | Volta o modo de falha mais grave da pesquisa 04 §1.6: o próprio LLM erra a conta e o teste vira impossível |
| **Referências alternativas** (`.solution/reference_alt_*.<ext>`, **ocultas**) | Detectar over-specification por execução: corretas, mas estruturalmente diferentes | O teste pode estar acoplado a *uma* solução e reprovar o aluno que achou outra igualmente válida |
| **Stub vazio canônico** (`.solution/empty_stub.<ext>`, **oculto**) | Permitir reexecutar o passo 1 depois que o aluno já editou o stub | Revalidar um desafio em andamento passa a ser impossível sem destruir o trabalho do aluno |
| **Mutantes** (gerados em disco temporário, **nunca versionados**) | Medir se o teste detecta defeito de verdade | O teste pode ser tautológico e ninguém saber |
| **Runner** (`runner.sh`) | Único ponto de entrada: aplica sandbox, fixa `cwd` e ambiente, normaliza exit code e **extrai a contagem de testes** | Cada linguagem vaza suas idiossincrasias de exit code e layout para o resto do sistema |
| **Manifesto** (`meta.json`) | Registrar identidade, cenários, resultado da validação, mutation score, progresso | Nada é auditável nem retomável entre sessões |

### 2.2 A árvore, e o que o aluno vê

Layout genérico — **válido para Python, Node/JS/TS, Ruby, C, C++, Lua, PHP e Bash**:

```
challenges/0007-fatorial-iterativo/
├── README.md                 # 👁 enunciado, cenários nomeados, como rodar
├── stub.py                   # ✏️ ÚNICO arquivo que o aluno edita
├── tests/
│   └── test_stub.py          # 👁 o aluno LÊ (é a especificação); não deve editar
├── runner.sh                 # 👁 ponto de entrada: ./runner.sh
├── meta.json                 # 👁 manifesto (o aluno pode ler; é onde os cenários estão)
└── .solution/                # 🚫 OCULTO — o tutor nunca mostra sem pedido explícito
    ├── reference.py
    ├── reference_alt_recursiva.py
    ├── reference_alt_reduce.py
    └── empty_stub.py
```

- 👁 **visível**: enunciado, stub, teste, runner, manifesto.
- ✏️ **editável pelo aluno**: só o stub.
- 🚫 **oculto**: tudo sob `.solution/`.

**[DECISÃO]** O diretório oculto chama-se `.solution/` (com ponto). O ponto faz `ls` comum não
listá-lo e `git status` tratá-lo normalmente, o que reduz revelação acidental sem exigir
mecanismo nenhum. O manifesto registra o caminho em `artifacts.hidden_dir`, e a regra operacional
é: **o tutor jamais lê, cita ou parafraseia conteúdo de `.solution/` numa resposta ao aluno**,
exceto no caminho explícito do último degrau da escada de dicas.

O `meta.json` é visível de propósito: é lá que mora a lista de cenários nomeados, que é
justamente o que o aluno tem direito de saber. Os campos de validação também são visíveis — que o
aluno veja um mutation score de 0,93 e um mutante sobrevivente classificado como equivalente é
transparência, não vazamento (o mutante sobrevivente descreve uma mudança na *referência*, não a
referência inteira). **[DECISÃO]** Quando o mutante sobrevivente for revelador demais para um
desafio específico (ex.: o `after` do mutante é praticamente a solução), o campo `before`/`after`
do sobrevivente é gravado como `"<omitido: revelaria a solução>"` e a justificativa fica em
`.solution/`.

### 2.3 Adaptação obrigatória por linguagem

A pesquisa 06 §6.1 provou por execução que o layout genérico **quebra** em Go, Rust e Java — e
que o caso do Go é silencioso. `challenge-new.sh` escolhe o `layout_profile` conforme a
linguagem; ele nunca aplica o esqueleto genérico às três linguagens abaixo.

| `layout_profile` | Linguagens | O que muda | Se ignorar |
|---|---|---|---|
| `generic` | python, javascript, typescript, ruby, c, cpp, lua, php, bash | Nada — o esqueleto vale | — |
| `go_module` | go | `go.mod` na raiz; stub e teste **no mesmo diretório e mesmo pacote**; arquivo de teste com sufixo **`_test.go`** | `go test ./...` imprime `[no test files]` e sai com **EXIT=0** — falso positivo silencioso, o aluno "passa" sem nada ter rodado **[VERIFICADO]** |
| `cargo_crate` | rust | `Cargo.toml` na raiz; stub **dentro de `src/`**; teste de integração direto em `tests/`; filtro por nome **qualificado** | Sem `Cargo.toml`, EXIT=101 "could not find Cargo.toml"; com stub solto na raiz, EXIT=101 "cannot find module or crate" **[VERIFICADO na pesquisa 06]** |
| `java_classfile` | java, kotlin | Nome do arquivo = nome exato da classe pública (regra do `javac`, não do JUnit) | Não compila |
| `dotnet_project` | csharp | `.csproj` obrigatório | Não compila |
| `mix_project` | elixir | `mix.exs`; código em `lib/`, teste em `test/` com sufixo `_test.exs` | `mix test` não descobre |
| `swiftpm` / `julia_project` / `cabal_project` / `bats_suite` | swift / julia / haskell / bash+bats | Manifesto próprio; ver pesquisa 06 §6.2 | Ver pesquisa 06 §6.2 |

Armadilha específica do Rust, **[VERIFICADO nesta máquina]** — um teste dentro de
`#[cfg(test)] mod tests { ... }` filtrado pelo nome curto:

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

Por isso o campo `scenarios[].test_name` do `meta.json` guarda o **nome como o runner o reporta**
— em Rust, o caminho qualificado `tests::nome`, nunca o nome curto.

---

## 3. A regra dura: **testes executados > 0** nunca é opcional

Esta é a defesa que impede o modo de falha mais perigoso do produto inteiro — o aluno recebendo
"passou" sem que uma única asserção tenha sido avaliada.

**Regra 1 — exit code.** A leitura é sempre `!= 0`, **jamais** `== 1`. Exit codes de falha
verificados/documentados: Python 1 (**5** quando zero testes foram coletados **[VERIFICADO]**),
Node 1, Go 1, Java 1, Rust **101** **[VERIFICADO]**, Elixir **2**, .NET com MTP **2**, C/C++ com
`assert.h`/`<cassert>` **134** (SIGABRT), R **0 mesmo com falha** por padrão. GNU `timeout` mata
com **EXIT=124** **[VERIFICADO]** — que o harness trata como veredito `timeout`, distinto de
`failed`. `ulimit -t` estourado mata o processo e o shell reporta **137** **[VERIFICADO]**.

**Regra 2 — contagem.** O harness **DEVE** extrair da saída o número de casos efetivamente
executados e comparar com `execution.expected_test_count` (que é igual a `len(scenarios)`). Não
basta `> 0`: veja a Regra 2b. A divergência é rejeição, com o código `test_count_mismatch` ou
`zero_tests_executed`.

**Regra 2b — `> 0` sozinho é insuficiente em Node.** **[VERIFICADO nesta máquina, achado novo,
não presente nas pesquisas 04/06]**: um arquivo de teste sem nenhuma chamada a `test()` faz
`node --test` tratar **o próprio arquivo** como um teste que passa:

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

Ou seja: zero asserções, e mesmo assim `# tests 1` e `EXIT=0`. Uma assertiva ingênua de
`tests_run > 0` **não pega isso**. É por isso que o contrato é igualdade com
`expected_test_count`, e por isso o harness também rejeita quando o nome de um caso executado é
igual ao caminho do arquivo de teste (assinatura do envelope de arquivo do `node:test`).

**Regra 3 — o pipe mascara o exit code.** **[VERIFICADO]**: `comando | tail -1` devolve o status
do `tail`, não do comando — `EXIT=0` mesmo com o teste vermelho. Em `runner.sh` e
`challenge-verify.sh` (ambos `#!/usr/bin/env bash`), use `set -o pipefail` ou `${PIPESTATUS[0]}`,
ambos confirmados funcionando em bash nesta máquina. Preferível: redirecionar para arquivo e ler
o status direto, sem pipeline.

### 3.1 Como extrair a contagem, por runner — `execution.test_count_probe`

Todos verificados nesta máquina, exceto onde indicado.

| `test_count_probe` | Runner | Como extrair | Evidência |
|---|---|---|---|
| `python_unittest_ran_line` | `python3 -m unittest` | Última linha `^Ran ([0-9]+) tests?` em **stderr** | `Ran 2 tests in 0.000s` **[VERIFICADO]**; zero testes → `Ran 0 tests` + `NO TESTS RAN` + **EXIT=5** **[VERIFICADO]** |
| `node_test_tap_summary` | `node --test --test-reporter=tap` | Linhas `^# tests (\d+)`, `^# pass`, `^# fail` | **[VERIFICADO]**. O reporter padrão (`spec`) usa `ℹ tests N` — fixar `--test-reporter=tap` para ter formato estável |
| `go_test_json_run_events` | `go test -json ./...` | Contar valores distintos de `"Test"` em eventos `"Action":"run"` | **[VERIFICADO]**: 2 testes → 2 distintos; layout quebrado → **0 distintos e EXIT=0** |
| `cargo_test_running_lines` | `cargo test` | **Somar** todas as linhas `^running (\d+) tests?` — há uma por binário de teste | **[VERIFICADO]**: `running 0 tests` (target lib) + `running 2 tests` (target de integração) → total 2 |
| `junit_console_summary` | JUnit ConsoleLauncher | `tests successful` / `tests failed` do sumário | pesquisa 06 §6.1 |
| `counter_protocol` | C, C++, Lua, Bash, Haskell — qualquer runner sem contagem legível | O próprio teste imprime em **stdout** `TESTS_RUN=<n>` e `TESTS_FAILED=<n>` e retorna 0/1 | **[VERIFICADO]** — ver §3.2 |
| `none` | — | Proibido em desafio entregue ao aluno; só válido em rascunho | — |

### 3.2 O `counter_protocol`, para linguagens sem contagem

**[DECISÃO]** Onde o runner nativo não expõe quantos casos rodaram, o arquivo de teste gerado
**deve** implementar este protocolo mínimo. Isso também resolve o problema do `assert.h`, que
aborta no primeiro erro com SIGABRT (EXIT=134) e esconde todos os outros cenários — inaceitável
num teste cujo propósito é enumerar cenários. **[VERIFICADO em C nesta máquina]**:

```c
static int total = 0, falhas = 0;

static void checa_long(const char *cenario, long obtido, long esperado, const char *porque) {
    total++;
    if (obtido != esperado) {
        falhas++;
        fprintf(stderr, "FALHOU [%s]: obtido %ld, esperado %ld. %s\n",
                cenario, obtido, esperado, porque);
    }
}

int main(void) {
    checa_long("fatorial_de_zero", fatorial(0), 1L,
               "O fatorial de 0 e o produto vazio, que por definicao vale 1.");
    checa_long("fatorial_de_cinco", fatorial(5), 120L,
               "fatorial(5) e o produto 1*2*3*4*5 = 120.");
    printf("TESTS_RUN=%d\nTESTS_FAILED=%d\n", total, falhas);
    return falhas == 0 ? 0 : 1;
}
```

Saída observada com o stub vazio: `TESTS_RUN=2` / `TESTS_FAILED=2` em stdout, as duas mensagens
didáticas em stderr, **EXIT=1** — determinístico, contável, e sem abortar no primeiro erro.

### 3.3 O esqueleto de `runner.sh` — **[VERIFICADO ponta a ponta]**

Este esqueleto foi escrito e executado nesta máquina, e os quatro vereditos saíram corretos. É o
contrato literal para `challenge-new.sh` gerar (aqui no perfil `generic`/Python; a única parte
que muda por linguagem são as três linhas do comando e do probe de contagem).

```bash
#!/usr/bin/env bash
set -u -o pipefail                          # pipefail: pipe mascara exit code

DESAFIO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DESAFIO_DIR" || exit 70                # cwd FIXO — nunca herdar de quem chamou

TIMEOUT_S="${CHALLENGE_TIMEOUT:-15}"; CPU_S="${CHALLENGE_CPU:-20}"
SAIDA="$(mktemp)"; trap 'rm -f "$SAIDA"' EXIT

# ambiente determinístico (passo 5)
export LC_ALL="${LC_ALL:-C.UTF-8}" TZ="${TZ:-UTC}"
export PYTHONHASHSEED="${PYTHONHASHSEED:-0}" PYTHONDONTWRITEBYTECODE=1
export NODE_COMPILE_CACHE=""
export http_proxy=http://127.0.0.1:1 https_proxy=http://127.0.0.1:1 no_proxy=""

# cache de bytecode: mutante de mesmo tamanho reusaria o .pyc antigo (§4.5)
find "$DESAFIO_DIR" -type d -name __pycache__ -prune -exec rm -rf {} + 2>/dev/null

com_timeout() {
  if   command -v timeout  >/dev/null 2>&1; then timeout  "$TIMEOUT_S" "$@"
  elif command -v gtimeout >/dev/null 2>&1; then gtimeout "$TIMEOUT_S" "$@"
  else perl -e 'alarm shift; exec @ARGV' "$TIMEOUT_S" "$@"; fi
}

( ulimit -t "$CPU_S" 2>/dev/null; ulimit -f 65536 2>/dev/null
  com_timeout python3 -B -m unittest discover -s tests -p 'test_*.py' ) >"$SAIDA" 2>&1
EXIT_BRUTO=$?

# probe python_unittest_ran_line
TESTS_RUN=$(grep -Eo '^Ran [0-9]+ tests?' "$SAIDA" | tail -1 | grep -Eo '[0-9]+')
TESTS_RUN="${TESTS_RUN:-0}"; ESPERADO="${CHALLENGE_EXPECTED_TESTS:-5}"

cat "$SAIDA"; echo "---"
echo "TESTS_RUN=$TESTS_RUN  ESPERADO=$ESPERADO  EXIT_BRUTO=$EXIT_BRUTO"

# exit normalizado: 0 passou · 1 falhou · 2 contagem errada · 3 timeout
if   [ "$EXIT_BRUTO" -eq 124 ];        then echo "VEREDITO=timeout";         exit 3
elif [ "$TESTS_RUN" -ne "$ESPERADO" ]; then echo "VEREDITO=count_mismatch";  exit 2
elif [ "$EXIT_BRUTO" -ne 0 ];          then echo "VEREDITO=failed";          exit 1
else                                        echo "VEREDITO=passed";          exit 0
fi
```

Resultado observado nos quatro casos:

| Cenário | `TESTS_RUN` | `EXIT_BRUTO` | Veredito |
|---|---|---|---|
| stub vazio | 5 | 1 | `failed` (exit 1) — como o passo 1 exige |
| referência | 5 | 0 | `passed` (exit 0) — como o passo 2 exige |
| teste esvaziado (0 casos) | 0 | **5** | `count_mismatch` (exit 2) — o falso positivo pego pela contagem |
| stub com `while True: pass` | 0 | **124** | `timeout` (exit 3) — distinto de falha de teste |

A normalização (0/1/2/3) é o que permite `challenge-verify.sh` ser **uma** implementação para
todas as linguagens: o orquestrador nunca vê 101, 134, 2 ou 5.

---

---

## 4. ⭐ O protocolo `validar_teste` — normativo

Especialização do algoritmo da pesquisa 04 §4. É o contrato que `challenge-verify.sh` implementa
literalmente. **Nenhum desafio chega ao aluno com `challenge_status` diferente de `validated`.**

### 4.1 Entradas e saídas

```
ENTRADAS
  D            diretório do desafio (challenges/<NNNN>-<slug>/)
  M            D/meta.json, já preenchido pelo tutor (scenarios, execution, artifacts, oracle)
  T            M.artifacts.test_path            — o teste
  R            M.artifacts.reference_path       — a referência correta, oculta
  E            M.artifacts.empty_stub_path      — o stub vazio canônico
  R_ALT        M.artifacts.reference_alt_paths  — alternativas corretas (pode ser vazia)
  OPERADORES   catálogo FIXO de mutação, versão 1.0 (§5) — nunca pedido a um modelo
  N_REP        3       (repetições do passo 5; ver limitação em 4.4)
  LIMIAR       0.90    (mutation score mínimo; ver D-C03)
  T_MAX        M.execution.timeout_seconds

SAÍDAS  (gravadas em M.validation)
  verdict ∈ { approved, weak, rejected, not_run }
  steps.step_0..step_6, cada um com status ∈ { passed, failed, skipped, not_applicable }
  mutation.{score, killed, survived, survivors[]}
  rejections[] — código + mensagem em pt-BR, o insumo do prompt de regeneração
```

**Invariante global do harness**: toda execução de teste passa por uma função única
`executar(implementação) -> {exit_code, tests_run, tests_failed, stdout, stderr, wall_ms}`, que
(a) instala `implementação` no `stub_path`, (b) **limpa qualquer cache de bytecode** (§4.5),
(c) roda `execution.build_command` se houver, (d) roda `execution.test_command` como **argv, sem
shell**, com `cwd = execution.working_dir`, ambiente de `execution.env` e sandbox de
`execution.sandbox`, (e) extrai a contagem pelo `test_count_probe`. O stub original do aluno é
salvo e restaurado ao fim, sempre — inclusive em caminho de erro.

### 4.2 Os passos

---

**PASSO 0 — Build e sanidade estrutural.**
*Entrada*: `D`, `M`. *Saída*: `steps.step_0_build`.

0.1 Validar `meta.json` contra `assets/schemas/challenge-manifest.schema.json`.
0.2 Verificar que todo caminho declarado em `artifacts` existe em disco.
0.3 Verificar que `len(scenarios) == execution.expected_test_count`.
0.4 Verificar que `layout_profile` é o exigido pela `language` (tabela §2.3) e que os
    `manifest_paths` correspondentes existem (`go.mod` para `go_module`, `Cargo.toml` para
    `cargo_crate`, ...).
0.5 Se houver `build_command`, compilar `E` — o stub vazio precisa compilar.

**Rejeita se**: schema inválido · caminho ausente · contagem divergente · `layout_profile` errado
para a linguagem · o stub vazio não compila.
**Código**: `build_failed`.

---

**PASSO 1 — O teste deve FALHAR contra o stub vazio.**
*Entrada*: `T`, `E`. *Saída*: `steps.step_1_empty_stub`.

1.1 `r = executar(E)`.
1.2 Exigir `r.tests_run == expected_test_count`.
1.3 Exigir `r.exit_code != 0` **e** `r.tests_failed >= 1`.

**Rejeita se**: `r.exit_code == 0` → `passes_on_empty_stub`, o teste é tautológico (pesquisa 04
§1.1) · `r.tests_run != expected_test_count` → `zero_tests_executed` ou `test_count_mismatch` ·
o teste nem carregou apesar de `E` compilar → `test_malformed`.

*Por que este passo existe*: sozinho, elimina a classe inteira de asserções vazias
(`assert x is not None`, `expect(Array.isArray(r)).toBe(true)`). É o passo mais barato e o de
maior retorno.

---

**PASSO 2 — O teste deve PASSAR contra a referência.**
*Entrada*: `T`, `R`. *Saída*: `steps.step_2_reference`.

2.1 `r = executar(R)`.
2.2 Exigir `r.tests_run == expected_test_count`.
2.3 Exigir `r.exit_code == 0` e `r.tests_failed == 0`.
2.4 Exigir `r.wall_ms < T_MAX * 1000`.

**Rejeita se**: vermelho contra a referência → `fails_on_reference` — é o teste impossível da
pesquisa 04 §1.2, o modo de falha mais destrutivo pedagogicamente (o aluno "corrige" um código
já correto até quebrá-lo) · estouro de tempo → `timeout_on_reference`.

---

**PASSO 3 — O teste deve ACEITAR referências alternativas corretas.**
*Entrada*: `T`, `R_ALT`. *Saída*: `steps.step_3_alternatives`.

3.1 Se `R_ALT` vazia: `status = not_applicable`, registrar em `detail` **por que** não há
    alternativa estrutural plausível, e seguir. Omissão registrada não é aprovação silenciosa.
3.2 Para cada `R_alt`: `r = executar(R_alt)`. Se `r.exit_code != 0`, registrar em
    `alternatives_rejected[]` com os `failing_test_names`.
3.3 Se houve rejeição, **exatamente uma** destas ações, nunca a aprovação direta:
    - **(a)** a(s) asserção(ões) culpada(s) é(são) isolável(is) — espiona contagem de chamadas,
      nome de variável interna, ordem de operação não observável externamente: remover/afrouxar
      **só** essa asserção, marcar `resolution: assertion_relaxed`, e **reexecutar o protocolo
      inteiro desde o passo 0** com o teste editado.
    - **(b)** a falha é estrutural: rejeitar o teste inteiro
      (`rejects_correct_alternative`), marcar `resolution: test_regenerated`, e regerar.
3.4 `resolution: unresolved` é **incompatível** com `verdict: approved`.

*Por que este passo existe*: é a resposta executável ao modo de falha 1.3 (over-specification) da
pesquisa 04 — em vez de pedir a um segundo LLM que "perceba" o acoplamento, roda-se o teste contra
uma implementação comprovadamente correta e diferente. Resposta binária, sem alucinação possível.

**Quantas alternativas.** **[DECISÃO]** Mínimo **2** quando existir mais de uma estratégia
idiomática (iterativa × recursiva × built-in/`reduce`; busca linear × binária; tabela ×
recorrência). 0 é aceitável só quando o desafio realmente admite uma estratégia só, e o motivo
fica escrito no `detail`.

---

**PASSO 4 — O teste deve MATAR o catálogo fixo de mutantes.**
*Entrada*: `T`, `R`, `OPERADORES`. *Saída*: `steps.step_4_mutation` + `validation.mutation`.

4.1 Gerar `M1..Mk` aplicando o catálogo **fixo** de §5 sobre `R`, **uma mutação por mutante**, por
    transformação sintática mecânica. Determinístico: mesma `R` → mesma lista, mesma ordem.
4.2 Para cada `Mi`: `r = executar(Mi)`.
    - `r` não compilou/não carregou, **ou** `r.tests_run != expected_test_count` → `invalid`.
      Mutante inválido não entra no denominador nem conta como morto.
    - `r.exit_code != 0` → **morto**.
    - `r.exit_code == 0` → **sobrevivente**, gravado com `operator`, `file`, `line`, `before`,
      `after`, `classification: unclassified`.
4.3 `score = killed / valid` (`valid = killed + survived`). Se `valid == 0`, é rejeição por
    `build_failed` — um catálogo que não produz nenhum mutante válido significa que a referência
    é trivial demais para o desafio.
4.4 Classificar sobreviventes. Um sobrevivente tem exatamente duas explicações possíveis:
    - **`test_gap`** — falta um cenário. Ação: regerar o teste com o mutante no prompt.
    - **`equivalent`** — o mutante é comportamentalmente idêntico a `R`; nenhum teste poderia
      matá-lo. Exige `justification` escrita. Mutantes equivalentes **saem do denominador**:
      `score = killed / (valid - equivalentes)`.
    A classificação é a **única** etapa do protocolo em que o LLM opina — e opina apenas sobre um
    diff de uma linha, com o ônus de escrever a justificativa no manifesto, auditável. Um
    sobrevivente `unclassified` é tratado como `test_gap` (o lado conservador).
4.5 `score >= LIMIAR` → passo aprovado. `score < LIMIAR` → `verdict: weak` e código
    `mutation_score_below_threshold`; **nunca** aprovar direto.

*Demonstração executada nesta máquina.* Referência: fatorial iterativo com guarda de negativo.
Catálogo fixo gerou **14 mutantes válidos**.

- Teste **forte** (5 cenários: `n=0`, `n=1`, `n=5`, propriedade `f(n)==f(n-1)*n`, `ValueError`
  em `n=-1`): **score 13/14 = 92%**, um único sobrevivente —
  `for i in range(2, n + 1)` → `for i in range(1, n + 1)`, classificado **`equivalent`**
  (multiplicar por 1 antes do resto não muda saída nenhuma). Score corrigido: 13/13.
- Teste **fraco** (só `assert fatorial(5) == 120`): passa nos passos 1 e 2 sem problema — falha
  contra o stub, passa contra a referência — mas o passo 4 dá **score 9/14 = 64%**, com 5
  sobreviventes que apontam exatamente os cenários faltantes:

```
ROR@L2  if n < 0:                  -> if n <= 0:
CRP@L2  if n < 0:                  -> if n < 1:
CRP@L2  if n < 0:                  -> if n < -1:
CRP@L5  for i in range(2, n + 1):  -> for i in range(1, n + 1):
SDL@L3  raise ValueError(...)      -> pass
```

Isto é a prova operacional de que os passos 1 e 2 **não bastam**, e de que o passo 4 devolve
material acionável e não só um número.

---

**PASSO 5 — O teste deve ser DETERMINÍSTICO.**
*Entrada*: `T`, `R`, `N_REP`. *Saída*: `steps.step_5_determinism`.

5.1 Executar `T` contra `R` `N_REP = 3` vezes, **variando o ambiente a cada repetição**:

| # | `LC_ALL` | `TZ` | `PYTHONHASHSEED` (ou equivalente) |
|---|---|---|---|
| 1 | `C` | `UTC` | `0` |
| 2 | `pt_BR.UTF-8` | `America/Sao_Paulo` | `1` |
| 3 | `C.UTF-8` | `Asia/Tokyo` | `524287` |

5.2 Exigir que `(exit_code, tests_run, tests_failed)` seja **idêntico** nas três.
5.3 Para a linguagem que expuser ordenação de casos, randomizar a ordem numa das repetições.

**Rejeita se**: qualquer divergência → `nondeterministic`.

*Por que variar ambiente e não só repetir.* Bug dependente de locale/timezone é **determinístico
dado um ambiente fixo** — rodar 10× na mesma máquina no mesmo ambiente nunca o exporia.
**[VERIFICADO nesta máquina]** o mesmo script devolve `1.234,50` sob locale pt-BR e `1234.50` sob
`LC_ALL=C`; `02:40 -03` sob `TZ=America/Sao_Paulo` e `05:40 UTC` sob `TZ=UTC`; e a ordem de
iteração de um `set` de strings muda por completo a cada `PYTHONHASHSEED` (`seed=0` →
`['pera','uva','banana',...]`, `seed=3` → `['figo','maca','banana',...]`) e é **aleatória por
processo** quando a variável não está fixada.

**Limitação honesta**: `N_REP = 3` com matriz de ambiente pega as categorias *Time*, *Randomness*,
*Unordered Collections*, *Platform Dependency* e boa parte de *Test Order Dependency* da taxonomia
de Luo et al. (FSE 2014). **Não pega** *Async Wait* (45% dos casos daquele estudo) nem
*Concurrency* (20%), que dependem de interleaving probabilístico e podem não se manifestar nem em
10 repetições. **[DECISÃO]** Desafios cujo conceito-alvo é concorrência/assincronia sobem `N_REP`
para 20 e, mesmo assim, o `meta.json` grava `detail` avisando que a detecção é parcial.

---

**PASSO 6 — Contagens e consistência final.**
*Entrada*: todos os resultados anteriores. *Saída*: `steps.step_6_counts`.

6.1 Em **todas** as execuções dos passos 1, 2, 3 e 5: `tests_run == expected_test_count`.
6.2 Os nomes reportados pelo runner cobrem exatamente `{s.test_name for s in scenarios}` — nem
    a mais, nem a menos. Isso pega o envelope de arquivo do `node:test` (§3, Regra 2b) e pega o
    teste que o modelo escreveu mas esqueceu de declarar em `scenarios`.
6.3 Nenhum `alternatives_rejected[].resolution == "unresolved"`.
6.4 Se `oracle.numeric_mode == "float_tolerance"`, exigir `rel_tol` ou `abs_tol` preenchido.

**Rejeita se**: qualquer item falhar → `test_count_mismatch`.

---

**PASSO 7 — Veredito e selagem.**

```
SE algum passo obrigatório (0,1,2,3,5,6) = failed  → verdict = rejected
SENÃO SE score < LIMIAR                            → verdict = weak
SENÃO                                              → verdict = approved
```

- `approved` → `challenge_status = "validated"`; gravar `integrity.test_sha256` e
  `integrity.reference_sha256`; o desafio pode ir ao aluno.
- `weak` e `rejected` → `challenge_status = "draft"` enquanto houver tentativa disponível;
  regerar com o `rejections[]` no prompt. Esgotadas as tentativas (**máx. 3**, §4.3),
  `challenge_status = "rejected"` — e o tutor **propõe outro desafio**, nunca entrega este.

### 4.3 Regeneração dirigida

**[DECISÃO]** Máximo de **3 tentativas** por desafio (`validation.generation_attempts`). Cada
regeneração recebe no prompt: o motivo estruturado (`rejections[].code` + `message`), os nomes dos
testes que falharam, e — no caso do passo 4 — o **diff exato de cada mutante sobrevivente**. Isso
não é "pedir ao LLM para se criticar" (sinal fraco, §1.2): é dar ao autor um **sinal externo
observável** sobre o que exatamente não funcionou, o único regime em que Self-Refine/Reflexion
demonstram ganho (pesquisa 04 §3).

Esgotadas as 3 tentativas, o harness grava uma última entrada em `rejections[]` com o código
`attempt_limit_reached`, o tutor descarta e propõe outro desafio do mesmo conceito, e o
`meta.json` do descartado fica em disco com `challenge_status: "rejected"` — é material de
diagnóstico, não lixo.

### 4.4 Custo

Execuções por validação: 1 (passo 1) + 1 (passo 2) + |R_ALT| (passo 3) + k (passo 4) + 3
(passo 5). Com k ≈ 14 e |R_ALT| = 2, são ~21 execuções. Para Python/Node/Lua cada uma custa
dezenas de milissegundos. Para Rust/Go/Java/C, o `build_command` domina — **[DECISÃO]** nessas
linguagens o harness reaproveita o diretório de build entre mutantes (`target/` do cargo,
cache do Go), e o passo 4 pode ser **amostrado** (`sample_size` do catálogo) quando
`k * tempo_de_build > 120 s`; a amostragem é registrada em `mutation.detail` e reduz o `LIMIAR`
de confiança declarada, nunca é escondida.

### 4.5 A armadilha do cache de bytecode — **[VERIFICADO, achado novo]**

Este é o bug que faria o passo 4 aprovar testes fracos silenciosamente, e ele não está em
nenhuma das duas pesquisas.

O `__pycache__` do CPython invalida o `.pyc` por **mtime + tamanho** do fonte, com granularidade
de 1 segundo. Mutantes gerados por troca de operador têm quase sempre **exatamente o mesmo
tamanho** que a referência, e são escritos em rápida sucessão. Resultado observado nesta máquina:

```
A = "def fatorial(n):\n    return 1 if n < 1 else n * fatorial(n - 1)\n"   # 64 bytes
B = "def fatorial(n):\n    return 9 if n < 1 else n * fatorial(n - 9)\n"   # 64 bytes

# sem proteção:                A -> 120   B -> 120     ← B rodou o .pyc de A!
# com PYTHONDONTWRITEBYTECODE: A -> 120   B -> 45      ← correto
# com python3 -B:              A -> 120   B -> 45      ← correto
```

Sem a proteção, o kill loop deste documento reportou **mutation score 14/14 = 100%** — falso.
Com `python3 -B` mais remoção de `__pycache__` entre execuções, o mesmo teste reportou **13/14 =
92%**, e o único sobrevivente foi o mutante genuinamente equivalente. **A diferença entre aprovar
e reprovar um teste fraco estava num diretório de cache.**

**Regra normativa**: `executar()` **DEVE**, antes de cada execução:
1. Remover recursivamente todo `__pycache__` sob o diretório do desafio.
2. Exportar `PYTHONDONTWRITEBYTECODE=1` e invocar `python3 -B`.
3. Exportar `NODE_COMPILE_CACHE=` vazio (o cache de compilação do Node existe como API desde a
   v22 mas é opt-in via essa variável — **[VERIFICADO]** ela está vazia por padrão nesta máquina).
4. Para linguagens compiladas, garantir rebuild real. **[VERIFICADO]** o `cargo` **não** tem esse
   problema: reescrevendo `src/lib.rs` com o mesmo número de bytes no mesmo segundo, o
   `cargo test` recompilou e observou o valor novo. `gcc`/`g++` não têm cache. Mesmo assim, o
   harness usa um diretório de trabalho por mutante quando o `build_command` existe.

---

## 5. ⭐ O catálogo FIXO de operadores de mutação — versão 1.0

**Por que fixo é essencial.** Se os mutantes forem "pedidos ao modelo", o mesmo viés que gerou o
teste gera os mutantes: o modelo propõe os defeitos que ele já imaginava, o teste já os cobre, e o
score sobe sem que a suíte tenha ficado melhor. MuTAP reporta 93,57% de mutation score usando um
LLM para gerar mutantes — número real, mas que mede "o teste pega os bugs que *este modelo*
imaginou", não bugs em geral; e o estudo de replicação arXiv:2607.22880 questiona exatamente essa
correlação. O catálogo abaixo é **mecânico, determinístico e independente de qualquer modelo**.

Aplicação: **texto do fonte, uma mutação por mutante**, apenas em linhas que não são vazias nem
comentário, com fronteiras de token respeitadas (as *lookarounds* das regex existem para não
transformar `<=` em `<==`, `+=` em `-=`, `**` em `*/`, `->` em `+>`). Strings literais e
comentários são pulados. **Nenhum AST é necessário** — o motor é o mesmo para todas as linguagens,
mudando só o marcador de comentário e o conjunto de operadores lógicos (`and`/`or` × `&&`/`||`).

| ID | Nome | Transformação | Bug real que representa |
|---|---|---|---|
| **ROR** | Relational Operator Replacement | `<`↔`<=` · `>`↔`>=` · `==`↔`!=` | Erro de borda: incluir ou excluir o extremo do intervalo |
| **AOR** | Arithmetic Operator Replacement | `+`↔`-` · `*`→`/` · `/`→`*` · `%`→`*` | Fórmula trocada |
| **LCR** | Logical Connector Replacement | `and`↔`or` · `&&`↔`\|\|` | Condição composta errada |
| **UOI** | Unary Operator Insertion/Removal | remove `not ` · remove `!` antes de identificador | Condição invertida |
| **CRP** | Constant Replacement | cada literal inteiro `n` vira `n+1` e `n-1` (dois mutantes) | Off-by-one clássico: `range(2,n+1)` → `range(1,n+1)`; `if n < 0` → `if n < 1` |
| **SDL** | Statement Deletion | substitui uma linha executável por no-op (`pass`, `;`, `{}`) — pula assinaturas, `return`, imports e linhas que abrem bloco | Passo esquecido; validação removida |
| **RVR** | Return Value Replacement | substitui o corpo inteiro da função pelo valor-zero do tipo (`0`, `""`, `[]`, `None`, `false`) | O caso degenerado: se sobrevive, o teste é tautológico — redundante com o passo 1, e é isso que se quer |
| **SVR** | Scalar Variable Replacement | troca uma referência a variável local por outra do mesmo escopo, na mesma linha | Variável errada usada por engano |

**Ordem de aplicação**: ROR → AOR → LCR → UOI → CRP → SDL → RVR → SVR, e dentro de cada operador,
por linha crescente e coluna crescente. Cada mutante recebe um `mutant_id` estável
`<OP>@L<linha>C<coluna>` — reproduzível, comparável entre execuções, e é a chave usada em
`mutation.survivors[].mutant_id`.

**Números observados nesta máquina** para uma referência de 7 linhas (fatorial iterativo com
guarda): **14 mutantes válidos, 0 inválidos**. A distribuição foi ROR 1, AOR 2, CRP 8, SDL 3 —
CRP domina porque gera dois mutantes por literal inteiro, o que é desejável: off-by-one é o bug
mais comum em desafio de iniciante.

**Mutantes inválidos** (não compilam, ou zeram a contagem de testes) são **descartados**, não
contados como mortos — contá-los como mortos inflaria o score exatamente onde ele deveria doer.

**Mutantes equivalentes** são o custo conhecido de mutation testing e não têm solução automática.
O tratamento aqui é: sai do denominador, mas **só** com `classification: "equivalent"` e uma
`justification` escrita, gravadas no `meta.json` e auditáveis pelo usuário. O caso real observado
— `range(2, n+1)` → `range(1, n+1)` — é um exemplo perfeito: multiplicar o acumulador por 1 antes
do resto não muda saída nenhuma, para nenhum `n`.

**Extensão**. Novos operadores podem entrar em versões futuras (`operators_version` bumped), o que
invalida comparação de score entre versões. O `meta.json` grava a versão usada exatamente por
isso. Mutantes gerados por LLM continuam **proibidos como fonte primária**; se algum dia forem
usados, é como camada *adicional*, com contagem separada, nunca misturada neste score.

---

## 6. ⭐ Oráculo matemático sem `sympy`

Restrição real desta máquina: `sympy` não está instalado e PEP 668 bloqueia `pip install` fora de
venv. Desafios de matemática são justamente onde o modelo mais erra — GSM-Symbolic (Apple, 2024)
mostra queda de desempenho quando só os *valores numéricos* do enunciado mudam, e de até 65%
quando se adiciona uma cláusula irrelevante. Portanto:

> **REGRA ABSOLUTA**: o valor esperado de um teste de matemática **nunca** é um número que o
> modelo calculou de cabeça e digitou no arquivo. Ele vem de (a) executar a implementação de
> referência, ou (b) uma propriedade que não precisa do valor.

Sem álgebra simbólica, sobram seis famílias de oráculo — **todas verificadas por execução**, com
os números de erro observados abaixo. A coluna "detecta erro?" mostra o mesmo oráculo aplicado a
uma variante **errada**, para provar que o teste discrimina.

| # | Propriedade | Como se escreve | Erro observado (correto) | Detecta erro? |
|---|---|---|---|---|
| P1 | **Derivada numérica confere com a analítica** | diferença central `(f(x+h)-f(x-h))/(2h)`, `h=1e-5`, em 200 pontos amostrados com seed fixa | `1,18e-10` | `f'=3x²-1` em vez de `3x²-2` → erro **1,0e+00** |
| P2 | **A inversa desfaz a direta** | `abs(inversa(direta(x)) - x)` relativo, 500 pontos | `1,11e-16` (`exp`/`log`) | qualquer inversa errada explode |
| P3 | **Identidade conhecida** | `sen²(t)+cos²(t)-1`, 500 pontos | `2,22e-16` | — |
| P4 | **TFC: integral numérica × primitiva** | soma de Riemann do ponto médio (n=200 000) vs `F(b)-F(a)` | `5,63e-11` para `∫₀³x²dx = 9` | primitiva errada explode |
| P5 | **Relação metamórfica (homogeneidade)** | `area(k·r) == k²·area(r)`, sem saber nenhuma área | `3,07e-15` | fórmula `2πr` em vez de `πr²` → erro **6,0e+00** |
| P6 | **Conferência contra a stdlib** | minha média × `statistics.fmean` em 300 amostras | `0,0e+00` | qualquer divergência aparece |
| P7 | **Aritmética exata** | `Fraction(1,3)+Fraction(1,6) == Fraction(1,2)` → `True`; `Decimal("0.1")+Decimal("0.2") == Decimal("0.3")` → `True`; `0.1+0.2 == 0.3` → **`False`** | exato | — |

A separação entre certo (`1e-10`) e errado (`1e+00`) é de dez ordens de grandeza — o teste
discrimina com folga, e a tolerância não é um chute.

### 6.1 Como isso vira um desafio

Para um desafio "implemente a derivada de `f(x) = x³ - 2x + 1`", o teste **não** contém
`assert derivada(2) == 10`. Ele contém:

```python
import random

def derivada_numerica(f, x, h=1e-5):
    return (f(x + h) - f(x - h)) / (2 * h)

def test_derivada_confere_com_a_numerica(self):
    f = lambda x: x**3 - 2*x + 1
    rng = random.Random(20260823)          # seed FIXA — determinismo (passo 5)
    for _ in range(200):
        x = rng.uniform(-5, 5)
        esperado = derivada_numerica(f, x)
        obtido = derivada(x)
        escala = max(1.0, abs(esperado))
        self.assertLess(
            abs(obtido - esperado) / escala, 1e-6,
            f"Em x={x:.4f}, sua derivada devolveu {obtido:.6f}, mas a inclinação real da "
            f"curva f(x)=x³-2x+1 nesse ponto é {esperado:.6f} (medida numericamente, pela "
            f"diferença central). A derivada tem que bater com a inclinação da curva em "
            f"TODO ponto, não só nos que você testou."
        )
```

O valor esperado nunca foi digitado por um modelo: ele é **medido** a partir da própria `f`, que
está no enunciado. Se o modelo tivesse errado a derivada analítica, o teste continuaria certo — é
a `f` do enunciado que manda.

### 6.2 Regras derivadas

- **`oracle.strategies`** registra quais famílias foram usadas, e mapeia 1:1 na tabela acima:
  `reference_impl` (obrigatória em todo desafio — o oráculo primário) · `invariant_property`
  (P1, P2, P3, P4) · `metamorphic_relation` (P5) · `trusted_stdlib` (P6) · `exact_arithmetic`
  (P7) · `anchor_cases_from_statement` (§10.1, mitigação 3).
- **`oracle.numeric_mode`** é obrigatório no `meta.json` e determina a forma de comparação:
  `exact_int` (igualdade), `fraction`/`decimal` (igualdade exata em `Fraction`/`Decimal`),
  `float_tolerance` (tolerância obrigatória, `rel_tol` ou `abs_tol` preenchidos — o passo 6.4
  rejeita se faltarem), `not_numeric`.
- **`==` em `float` é proibido.** `0.1 + 0.2 == 0.3` é `False` **[VERIFICADO]**. Onde o resultado
  puder ser exato, prefira `Fraction`/`Decimal` a tolerância — `Decimal("0.1")+Decimal("0.2") ==
  Decimal("0.3")` é `True` **[VERIFICADO]**.
- **Toda amostragem tem seed fixa e escrita no manifesto** (`oracle.invariants[].seed`).
- **Toda invariante é checada contra `R` isoladamente**, antes do passo 4, e o pior erro
  observado é gravado em `oracle.invariants[].worst_error`. Isso é a mitigação da limitação de
  §10: uma invariante violada em `R` denuncia um bug na referência mesmo que `T` concorde
  inteiramente com ela.
- **Property-based testing (Hypothesis/fast-check/proptest) permanece fora do padrão.** A
  pesquisa 04 §6 é clara: escrever um bom gerador é habilidade mais avançada que resolver o
  exercício, e contra-exemplo encolhido é confuso para iniciante. As propriedades acima são
  escritas com `random.Random(seed)` da stdlib e um laço — zero dependência, zero API nova para o
  aluno aprender. Ver **D-C04**.

---

## 7. ⭐ Mensagem de falha como material didático

A mensagem de falha é o principal canal de feedback do produto. Uma boa mensagem tem **quatro
componentes obrigatórios**:

1. **A entrada** que foi usada.
2. **O valor esperado**.
3. **O valor obtido**.
4. **A propriedade violada, em linguagem do domínio** — o componente que ensina, e o único que um
   runner não gera sozinho.

O quarto é o que separa "reprovar" de "ensinar". `assert 100 == 90` tem os três primeiros e não
tem o quarto — e por isso não ensina nada.

### 7.1 Python — ruim × bom

```python
# ❌ RUIM — o unittest mostra "100 != 90", e o aluno não sabe o que é 100, o que é 90,
#           nem por que 90 seria certo.
def test_desconto(self):
    self.assertEqual(calcular_preco_final(100, 0.1), 90)

# ❌ AINDA PIOR — tautológico: passa com um stub que retorna qualquer coisa não-nula.
#    O passo 1 do protocolo rejeita este teste automaticamente.
def test_desconto(self):
    self.assertIsNotNone(calcular_preco_final(100, 0.1))

# ✅ BOM — os quatro componentes, e a regra do domínio explicitada.
def test_desconto_de_dez_por_cento_sobre_cem(self):
    preco_base, desconto, esperado = 100, 0.1, 90
    obtido = calcular_preco_final(preco_base, desconto)
    self.assertEqual(
        obtido, esperado,
        f"calcular_preco_final({preco_base}, {desconto}) devolveu {obtido}, "
        f"mas deveria devolver {esperado}. "
        f"A regra é: um desconto de {desconto:.0%} tira {desconto:.0%} do preço base, "
        f"ou seja preco_base - (preco_base * desconto) = "
        f"{preco_base} - ({preco_base} * {desconto}) = {esperado}."
    )
```

Comparação real de saída, **[VERIFICADO]**, com o stub vazio:

```
# sem mensagem:   AssertionError: None != 120
# com mensagem:   AssertionError: None != 120 : fatorial(5) devolveu None.
#                 Deveria ser o produto 1*2*3*4*5 = 120.
```

### 7.2 JavaScript — ruim × bom

```javascript
// ❌ RUIM — o matcher mostra "Expected: 90, Received: 100" e nada mais.
test('preco final com desconto', () => {
  assert.strictEqual(calcularPrecoFinal(100, 0.1), 90);
});

// ✅ BOM — node:assert aceita a mensagem como 3º argumento de strictEqual.
test('desconto de dez por cento sobre cem', () => {
  const precoBase = 100, desconto = 0.1, esperado = 90;
  const obtido = calcularPrecoFinal(precoBase, desconto);
  assert.strictEqual(
    obtido, esperado,
    `calcularPrecoFinal(${precoBase}, ${desconto}) devolveu ${obtido}, ` +
    `mas deveria devolver ${esperado}. A regra é: o desconto de ` +
    `${desconto * 100}% tira ${desconto * 100}% do preço base, ou seja ` +
    `precoBase - (precoBase * desconto) = ${precoBase} - (${precoBase} * ${desconto}).`
  );
});
```

**Armadilha de framework, da pesquisa 04 §7**: no **Vitest**, `expect(valor, mensagem)` aceita
mensagem como 2º argumento; no **Jest**, esse argumento é **silenciosamente ignorado** — o mesmo
código copiado para um projeto Jest volta a produzir a mensagem genérica sem nenhum aviso. Em
Jest, use `expect.extend` ou lance um `Error` com a mensagem. **[DECISÃO]** O padrão do produto
para JS é **`node:test` + `node:assert`**, cujo 3º argumento de `strictEqual`/`deepStrictEqual`
funciona sem ambiguidade e **[VERIFICADO]** aparece na saída — evitando a divergência
Jest/Vitest por construção. Quando o desafio precisar de vitest/jest, `test_framework` registra
qual, e o tutor gera o padrão correspondente.

### 7.3 Regras normativas

- Toda asserção do produto carrega mensagem customizada. Sem exceção.
- A mensagem **não** usa jargão de implementação ("o loop não incrementou") e sim linguagem do
  enunciado ("o fatorial de 5 é o produto de 1 até 5").
- Comparação com tolerância **nomeia a tolerância** na mensagem, para o aluno entender que
  arredondamento pequeno não é o que está sendo cobrado.
- Cada cenário do `meta.json` tem um `failure_message_template` — a mensagem é conteúdo
  planejado, não improviso na hora de escrever o código.
- Helpers de asserção repetidos (`checa_long` do §3.2, `assert_desconto_aplicado(...)`) são
  fatorados: garantem consistência didática entre cenários e entre desafios.
- Em C/C++, o `counter_protocol` (§3.2) é também o que permite mensagem por cenário: `assert.h`
  puro aborta no primeiro erro e o aluno só vê um cenário de cada vez.

---

## 8. O ciclo do aluno: vermelho → verde → refatorar

| Fase | O que o aluno faz | O que o tutor faz | O que o tutor **não** faz |
|---|---|---|---|
| **0. Proposta** | Lê o enunciado e a lista de cenários | Propõe um desafio calibrado ao estado do conceito; entrega já `validated` | Entregar teste não validado. Propor algo desconectado do que o aluno errou antes |
| **1. 🔴 Vermelho** | Roda `./runner.sh` **antes de escrever qualquer código** e vê os N cenários falharem | Explica que o vermelho inicial é o ponto de partida, e que a lista de cenários vermelhos é o mapa do que resolver | Pular esta fase. Ver o vermelho inicial é o que torna o verde final significativo |
| **2. ✏️ Implementação** | Edita **só** o stub, roda de novo, itera | Fica em silêncio produtivo. Quando o aluno pede ajuda ou trava, entrega **um** degrau da escada de dicas | Entregar código. Consertar o stub sem o aluno pedir. Pular degraus da escada |
| **3. 🟢 Verde** | Todos os cenários passam | Confirma, atualiza `student_progress` e o estado de proficiência do conceito | Encerrar sem perguntar o que o aluno entendeu — o verde é evidência de comportamento, não de compreensão |
| **4. 🔧 Refatorar** | Melhora o código com a rede de segurança verde | Sugere **uma** melhoria concreta e pede que o aluno rode o teste de novo depois | Reescrever o código do aluno. Transformar refatoração em nova avaliação |

### 8.1 Não entregar a solução cedo demais

A escada de dicas é definida em outro documento; aqui ficam apenas as amarrações do lado do
desafio, que não redefinem os degraus:

- O tutor sobe **um degrau por vez**, e só depois de o aluno ter feito **ao menos uma tentativa
  nova** desde o degrau anterior — `student_progress.attempts` tem que ter aumentado. Isso é
  verificável no manifesto, não é julgamento.
- `student_progress.hint_level_used` guarda o degrau mais alto já entregue. O tutor lê esse campo
  antes de responder, o que faz a escada sobreviver a trocas de sessão.
- **`.solution/` só é revelada no último degrau, e só quando o aluno pede explicitamente.**
  Revelação marca `solution_revealed: true` e `solution_revealed_at`; o desafio conta como
  ensinado, não como resolvido, para efeito de proficiência.
- `student_progress.failing_scenario_ids` diz **quais** cenários estão vermelhos — a dica é
  dirigida ao cenário que falhou, não genérica. Um aluno travado só no `caso_base_zero` recebe
  dica sobre o produto vazio, não uma aula sobre laços.

---

## 9. Integridade: o aluno pode editar o teste para passar

Ele pode, e nada impede — o arquivo está no disco dele, com permissão dele. As opções técnicas e
o que cada uma realmente faz:

| Mecanismo | O que faz | O que **não** faz | Custo |
|---|---|---|---|
| Diretório separado (`tests/`) | Reduz edição acidental | Não impede edição deliberada | Zero — já está no layout |
| `chmod 444` no teste | Sinaliza intenção; atrapalha edição casual | `chmod` de volta é um comando | Baixo, mas atrapalha quem legitimamente quer experimentar com o teste para entendê-lo |
| **SHA-256 gravado no manifesto** | **Detecta** que o arquivo mudou | Não diz quem nem por quê; não impede | Baixo — um `sha256sum` por execução |
| Harness recusa contabilizar "passou" com hash divergente | Eleva o esforço de burlar acima de "editar um assert" | Contornável por quem edite o `meta.json` também | Médio, e cria atrito com o aluno que customiza um desafio de propósito |
| Ofuscação, telemetria de edição, sandbox adversarial | — | — | Alto, e o "adversário" é a própria pessoa que pediu para aprender |

**[DECISÃO — padrão]** `integrity.policy = "warn"`. O harness grava `test_sha256` na aprovação,
confere antes de cada execução, e quando diverge **avisa e continua**:

> *"O arquivo de teste foi modificado desde que este desafio foi validado. Sem problema se foi de
> propósito — mas vale lembrar: o teste é a especificação do desafio. Mudá-lo muda o que está
> sendo cobrado, não te ensina a resolver. Quer que eu restaure o original?"*

O raciocínio é o da pesquisa 04 §8: não há nota, prova nem credencial em jogo; quem edita o teste
só prejudica a si mesmo; e policiamento adversarial cobra um preço de UX real (arquivo travado
atrapalha quem quer ler o teste para entendê-lo, que é justamente o comportamento que se quer
incentivar). A política vira `block` no dia em que o produto for usado em contexto avaliativo —
aí a estratégia muda de "desencorajar" para "detectar e invalidar", que está fora deste escopo.
Ver **D-C01**.

---

## 10. Limitações honestas

### 10.1 Se a referência estiver errada, o protocolo aprova os dois

**A limitação central, e ela não tem cura dentro do algoritmo.** Todos os sete passos assumem que
`R` está correta. Se `R` tem um bug e `T` herdou a mesma premissa errada — cenário plausível
quando ambos saem do mesmo modelo, no mesmo turno, da mesma leitura equivocada do enunciado —,
então `T` falha contra o stub (passo 1 ✔), passa contra `R` (passo 2 ✔), passa contra as
alternativas geradas com o mesmo raciocínio errado (passo 3 ✔), mata os mutantes (passo 4 ✔) e é
determinístico (passo 5 ✔). **Veredito: `approved`. E os dois estão errados.**

Nenhum passo detecta isso, porque nenhum usa fonte de verdade independente de `R`. As três
mitigações, nenhuma suficiente sozinha:

1. **Invariantes checadas sobre `R` isoladamente** (§6.2). Um bug em `R` que viole uma propriedade
   do próprio domínio aparece mesmo que `T` concorde inteiramente com `R`. É a mitigação mais
   barata e a única sempre aplicável — por isso `oracle.strategies` exige no mínimo
   `reference_impl` **+ uma** das demais para desafios matemáticos.
2. **Conferência contra biblioteca confiável** (`statistics`, `math`, `Fraction`, `Decimal` — tudo
   stdlib, tudo disponível). Troca "o LLM escreveu `R` certo" por "uma biblioteca madura
   confirma `R`" — fonte genuinamente independente.
3. **Casos-âncora derivados do enunciado, não da referência**
   (`oracle.strategies: anchor_cases_from_statement`): pares entrada→saída extraídos do texto do
   enunciado, idealmente numa chamada separada com contexto diferente do que gerou `R` e `T`.
   Quebra o acoplamento porque a origem do valor não passou pelo mesmo raciocínio.

**[DECISÃO]** Para desafio de **alto risco pedagógico** — poucos cenários, domínio numérico em que
o aluno não consegue conferir a resposta na mão, `skill_level: beginner` — pelo menos uma das três
é **obrigatória** antes de `approved`. Para os demais, o risco residual é aceito, e o `meta.json`
registra quais estratégias foram usadas.

E existe uma mitigação que não é técnica: o aluno é uma fonte de verdade independente. Um aluno
que diz "acho que o teste está errado" deve ser **levado a sério**, com o tutor reexecutando o
protocolo e revisando `R` — não convencido de que o teste está certo. **[DECISÃO]** O enunciado
gerado sempre inclui a frase: *"Se você acha que o teste está errado, me diga — testes gerados
automaticamente erram, e eu revalido."*

### 10.2 As outras

- **Mutation score não é cobertura de bugs reais.** O estudo de replicação arXiv:2607.22880
  questiona a correlação entre score de suítes geradas por LLM e efetividade real. O score aqui
  é um **piso de sanidade** ("o teste distingue a referência de 14 variações mecânicas dela"),
  não um certificado.
- **Mutantes equivalentes não são detectáveis automaticamente.** Tratamento em §5.
- **`N_REP = 3` não detecta flakiness de concorrência.** §4.2, passo 5.
- **O piso de sandbox não é isolamento real.** `timeout` + `ulimit` + `cwd` fixo rodam no mesmo
  kernel; `ulimit -v` é pouco confiável no macOS; isolamento de rede sem privilégio só existe no
  Linux e depende de user namespaces habilitados. O modelo de ameaça é "aluno resolvendo
  exercício", não "atacante". Docker permanece **opt-in** (`sandbox.mode: docker_strict`) — ver
  **D-C02**.
- **`timeout` não existe no macOS por padrão.** O runner tenta `timeout` (`coreutils_timeout`)
  → `gtimeout` (`coreutils_gtimeout`, via Homebrew) → `perl -e 'alarm shift; exec @ARGV'`
  (`perl_alarm`) → timeout nativo do harness (`language_runtime`), e grava em
  `sandbox.timeout_source` qual usou. **Nesta máquina [VERIFICADO]**: GNU coreutils 9.11,
  `timeout 2 <loop infinito>` → **EXIT=124**; `ulimit -t 2` estourado → **EXIT=137**.
- **A amostragem de mutantes em linguagens compiladas** (§4.4) reduz a força do passo 4; fica
  registrada, nunca escondida.

---

## 11. Resumo executável para a onda 3

`challenge-new.sh` deve: escolher `layout_profile` pela linguagem (§2.3) · materializar a árvore
(§2.2) · gerar `meta.json` conforme o schema · **nunca** aplicar o esqueleto genérico a Go, Rust
ou Java.

`challenge-verify.sh` deve: implementar os passos 0–7 (§4) na ordem · usar o catálogo fixo de
mutação v1.0 (§5) · limpar cache de bytecode antes de **cada** execução (§4.5) · extrair a
contagem de testes pelo `test_count_probe` e exigir igualdade com `expected_test_count` (§3) ·
ler exit code como `!= 0` e tratar 124 como `timeout` · usar `set -o pipefail` · gravar tudo em
`meta.json` · **nunca** aprovar por julgamento de modelo.

---

## Decisões abertas geradas aqui

| ID | Pergunta ao usuário | Opções | Default sugerido | Reversibilidade |
|----|---------------------|--------|------------------|-----------------|
| D-C01 | Integridade do teste: o que fazer quando o aluno edita o arquivo de teste? | `off` (ignorar) · `warn` (detectar por SHA-256, avisar e continuar) · `block` (recusar contabilizar como resolvido) | `warn` — o aluno estuda por vontade própria; policiar cobra UX e o "adversário" é quem pediu para aprender | cheap — é um campo do `meta.json` (`integrity.policy`) |
| D-C02 | Docker no sandbox: exigir, oferecer ou ignorar? | `posix_floor` sempre · `posix_floor` com `docker_strict` opt-in · exigir Docker | `posix_floor` com `docker_strict` opt-in — não bloquear o produto atrás de uma instalação; oferecer o modo forte a quem já tem, e a quem está no macOS e quer as garantias que o Linux dá de graça | moderate — muda `runner.sh` e a detecção de ambiente |
| D-C03 | Limiar de mutation score para aprovar (`LIMIAR`) | 0,80 (permissivo) · **0,90** · 1,00 (zero sobreviventes não classificados) | 0,90 — com equivalentes fora do denominador; 1,00 gera regeneração infinita em desafios com muitos mutantes equivalentes, e 0,80 deixou passar o teste fraco de 5 cenários faltantes na demonstração da §4.2 | cheap — uma constante |
| D-C04 | Property-based testing (Hypothesis/fast-check/proptest) entra? | nunca · opcional só para `advanced` e desafios de propriedade · padrão para matemática | opcional para `advanced` — escrever um bom gerador é habilidade mais avançada que resolver o exercício, e contra-exemplo encolhido confunde iniciante; as invariantes da §6 dão o mesmo poder com `random.Random(seed)` e zero dependência | moderate — exige instalar biblioteca e ensinar a API |
| D-C05 | Quantos desafios por sessão de estudo? | 1 · 2–3 · ilimitado, o aluno decide | 2–3, com o primeiro calibrado em conceito `fragile` e o último num conceito novo; ilimitado sob pedido explícito | cheap — política do tutor |
| D-C06 | Quando o aluno pode ver `.solution/`? | nunca · só depois de resolver · a pedido, no último degrau da escada de dicas · a qualquer momento | a pedido, no último degrau, com `solution_revealed` gravado e o desafio contando como ensinado, não resolvido | cheap — regra do tutor + campo já no schema |
| D-C07 | E se o toolchain da linguagem escolhida não estiver instalado? | abortar · propor a instalação e esperar · **propor a mesma ideia de desafio numa das 6 linguagens que rodam sem instalar nada** · gerar mesmo assim e deixar quebrar | propor a mesma ideia numa linguagem disponível, dizendo o motivo, e oferecer o comando de instalação como alternativa. Nesta máquina rodam sem instalar nada: Python, Node, Rust, Go, C, C++ | cheap — decisão no momento da proposta |
| D-C08 | Amostragem de mutantes em linguagens compiladas (§4.4) | nunca amostrar (validação lenta) · amostrar acima de 120 s de build total · limitar sempre a k=8 | amostrar acima de 120 s, registrando `sample_size` em `mutation.detail`; um desafio Rust com 30 mutantes × 4 s de build seriam 2 minutos só no passo 4 | cheap — constante + campo |
| D-C09 | Mutantes sobreviventes ficam visíveis no `meta.json` que o aluno pode ler? | sempre visíveis · `before`/`after` omitidos quando revelarem a solução · manifesto inteiro oculto | omitir `before`/`after` quando revelador, mantendo o score visível — transparência sobre a qualidade do teste sem entregar a resposta | cheap — regra na escrita do manifesto |
| D-C10 | Limite de tentativas de regeneração antes de desistir do desafio | 1 · **3** · 5 · sem limite | 3 — TestGen-LLM mostra aproveitamento de 1:20 em produção; insistir além disso custa tempo do aluno esperando, e propor outro desafio do mesmo conceito é mais barato que consertar um ruim | cheap — constante |
