# 51 — `challenge-new.sh`: materialização do desafio por `layout_profile`

Contrato do gerador de desafios. Regras e porquês vivem em `docs/00-contratos.md` (§3.2, §4.1,
§5, §8, §11), `docs/05-challenges-tdd.md` (§2, §3, §9.1) e `SK/references/languages.md` (§2, §3).
Aqui está **o que o script recebe, o que ele produz, em que ordem, e o que ele recusa**.

---

## 1. Identidade

| Item | Valor |
|---|---|
| Caminho | `SK/scripts/challenge-new.sh`, modo `0755`, `#!/usr/bin/env bash`, `set -euo pipefail` |
| Invocação | `challenge-new.sh <setup_root> --language <l> --slug <sl> --concept <concept_id> [--difficulty 1..5] [--skill-level beginner\|intermediate\|advanced]` · `--help` |
| stdout | **Só** o caminho relativo do desafio: `challenges/<NNNN>-<slug>`. Log, aviso e diagnóstico vão para stderr. |
| Exit codes | `0` ok · `1` erro de execução (toolchain ausente, template ausente, I/O) · `2` uso incorreto (inclusive linguagem fora do enum ou não implementada) · `3` setup não encontrado · `4` colisão de `NNNN` após 5 tentativas · `5` `meta.json` não valida no schema |
| **Nunca** sai com `10` | Não há REQUEST/APPLY aqui (§8 e I-22): o script é determinístico do começo ao fim. |
| Localização da skill | `${STUDY_METHOD_SKILL_DIR:-<dir do script>/..}` — é a mesma variável que o `runner.sh` gerado usa para achar `lib/sandbox.sh`. |
| Bibliotecas | `lib/common.sh` e `lib/json.sh` por `source`. Ferramentas externas: `jq` e `python3` (checados por `sm_require_cmd`). |

`--language node` é aceito como apelido operacional e normalizado para `javascript` — o enum de
19 de §4.1 não tem `node`, e `meta.json.language` grava sempre `javascript`.

---

## 2. Ordem das operações

Nada é escrito no setup antes do passo 6. Todos os passos 1–5 são recusas baratas.

1. `--help` → uso em stdout, exit 0. Zero argumento → uso em stderr, exit 2.
2. Argumentos: `--language`, `--slug`, `--concept` obrigatórios; `--difficulty` ∈ 1..5;
   `--skill-level` ∈ `beginner|intermediate|advanced`. Violação → **2**.
3. `sm_require_cmd jq python3` → **1** se faltar.
4. Linguagem: fora do enum de 19 → **2**. No enum mas não implementada nesta versão → **2**,
   nomeando as 5 implementadas, o comando de instalação e a linguagem vizinha.
5. **Toolchain**: `command -v <bin>` (`python3` · `node` · `go` · `cargo` · `gcc`). Ausente →
   **1**, com o comando de instalação (nunca executado), a lista das linguagens que rodam **nesta
   máquina agora**, e a razão de não tentar mesmo assim. Nenhum arquivo foi criado.
6. `sm_setup_root <setup_root>` → **3** se não houver `setup.json` legível na raiz nem em
   ancestral. `sm_normalize_slug` / `sm_normalize_concept_id`; normalização que muda o valor é
   avisada em stderr (`sm_log warn`), não é erro.
7. Alocação do `challenge_id` (§3) — **é aqui que o primeiro diretório nasce**.
8. Materialização da árvore do `layout_profile` (§4, §5).
9. `meta.json`: template → merge autoritativo por `jq` → `sm_atomic_write` → `sm_json_validate`.
10. Guardas finais (§9). Sucesso: caminho relativo em stdout, exit 0.

**Desfazimento.** Um `trap … EXIT` remove o diretório do desafio se o script terminar com código
≠ 0 depois do passo 7. O diretório acabou de nascer e não contém nada do aluno; deixar um desafio
meio materializado no `challenges/` é pior que não ter desafio nenhum. Depois do passo 10 o
diretório deixa de ser desfeito.

---

## 3. Alocação do `challenge_id`

`challenge_id` casa `^[0-9]{4}$` e é **o `NNNN`**; o diretório é `<NNNN>-<slug>` (§4.2).

O recurso alocado é um **diretório**, não um arquivo, então a primitiva atômica é `mkdir` (falha
se já existe) no lugar do `>` com `noclobber` de `sm_next_seq` — o mecanismo é o mesmo:

1. `maior` = maior `NNNN` entre os diretórios `challenges/[0-9][0-9][0-9][0-9]-*`.
2. `mkdir "challenges/$(printf %04d $((maior+1+tentativa)))-<slug>"`.
3. Se o `mkdir` venceu, conferir que existe **exatamente um** diretório com aquele prefixo
   `NNNN-` (dois processos com slugs diferentes venceriam `mkdir` no mesmo número); se houver
   mais de um, desfazer com `rmdir` e tentar de novo.
4. 5 tentativas; esgotadas → **4**.

Número purgado nunca é reaproveitado, porque `maior` sai da listagem e a purga **move**, não
apaga (SEG-8). `memory/.session.lock` já serializa a sessão: a corrida do passo 3 é defesa em
profundidade, não o mecanismo principal.

---

## 4. ⭐ `layout_profile` — as 5 árvores

A árvore genérica de `docs/00-contratos.md` §3.2 **não vale para Go nem para Rust**, e o caso do
Go é silencioso. O script escolhe o perfil pela linguagem e nunca aplica o esqueleto genérico às
duas.

| Linguagem | `layout_profile` | `stub_path` | `test_path` | Manifesto | Apoio |
|---|---|---|---|---|---|
| `python` | `generic` | `stub.py` | `tests/test_stub.py` | — | `tests/__init__.py` |
| `javascript` | `generic` | `stub.mjs` | `tests/stub.test.mjs` | — | — |
| `c` | `generic` | `stub.c` | `tests/test_stub.c` | — | `stub.h`, `.build/` |
| `go` | `go_module` | `stub.go` | `stub_test.go` | `go.mod` | — |
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
├── meta.json            👁       ├── reference.go       └── .solution/      🚫
└── .solution/           🚫       ├── reference_alt_recursiva.go
    ├── reference.py             ├── reference_alt_acumulador.go
    ├── reference_alt_recursiva.py└── empty_stub.go
    ├── reference_alt_acumulador.py
    └── empty_stub.py

generic (c): stub.c ✏️ · stub.h 👁 · tests/test_stub.c 👁 · .build/ (binário)
generic (node): stub.mjs ✏️ · tests/stub.test.mjs 👁
```

👁 visível · ✏️ **o único arquivo que o aluno edita** · 🚫 oculto.

**Por que cada desvio existe (verificado por execução, 2026-08-23):**

| Perfil | Regra | Se ignorar |
|---|---|---|
| `go_module` | `go.mod` na raiz; o arquivo de teste precisa do sufixo **`_test.go`** (o prefixo `test_` não significa nada) **e** do **mesmo diretório e pacote** do fonte | `go test ./...` imprime `? desafio [no test files]` / `? desafio/tests [no test files]` e sai **0**: o aluno "passa" sem uma asserção ter rodado |
| `cargo_crate` | `Cargo.toml` na raiz; fonte **dentro de `src/`**; teste de integração **direto** em `tests/` | Sem `Cargo.toml`, exit 101 "could not find Cargo.toml"; com o fonte solto na raiz, exit 101 "cannot find module or crate" |
| `generic` (python) | `tests/` precisa de `__init__.py` | O `unittest` do Python 3.14 recusa a descoberta: `ImportError: Start directory is not importable`, `TESTS_RUN=0` → `count_mismatch` |
| `generic` (c) | `stub.h` com o protótipo | Não há import em C: sem a declaração, o link falha ou o compilador assume declaração implícita |

**`.solution/` começa com ponto e isso é funcional, não cosmético:** tanto o `go tool` quanto o
`cargo` ignoram diretórios iniciados por `.`, então as implementações de referência convivem
dentro do módulo/crate sem entrar no build. Verificado: com `.solution/reference.go` contendo
erro de sintaxe proposital, `go test ./...` nem o menciona.

---

## 5. Artefatos e a semente

### 5.1 Visíveis

| Arquivo | Origem | Conteúdo |
|---|---|---|
| `README.md` | `challenge/README.md.tmpl` | Enunciado, **tabela dos cenários nomeados**, como rodar, tabela dos 4 veredictos, o que editar. Inclui a frase obrigatória "Se você acha que o teste está errado, me diga — testes gerados automaticamente erram, e eu revalido." |
| stub | `challenge/<lang>/stub.*` | Assinatura pronta, corpo vazio entre as marcas `SM_CORPO_INICIO` / `SM_CORPO_FIM` |
| teste | `challenge/<lang>/…test…` | Um caso por cenário, com mensagem de falha didática (cenário + obtido + esperado + porquê) |
| `runner.sh` | `challenge/runner.sh.tmpl`, modo 0755 | §7 |
| `meta.json` | `challenge/meta.json.tmpl` + merge `jq` | §8 |

### 5.2 Ocultos, em `.solution/`

| Arquivo | Como nasce | Para quê |
|---|---|---|
| `empty_stub.<ext>` | **cópia byte a byte** do stub recém-materializado | Reexecutar o passo 1 depois que o aluno já editou o stub, sem destruir o trabalho dele |
| `reference.<ext>` | stub com o corpo trocado pela implementação iterativa | O oráculo real: o valor esperado vem de **executar** isto |
| `reference_alt_recursiva.<ext>` | idem, recursão | Detectar teste acoplado a **uma** implementação |
| `reference_alt_acumulador.<ext>` | idem, laço/fold em outra direção | idem — são **≥2**, corretas e estruturalmente diferentes |

Referência e alternativas são derivadas do **próprio stub materializado**, trocando as linhas
entre `SM_CORPO_INICIO` e `SM_CORPO_FIM` pelo corpo real. Consequência contratual: qualquer uma
delas é copiada **por cima do stub** e compila no lugar dele — que é exatamente como
`challenge-verify.sh` roda os passos 1, 2 e 3. Se o template do stub não tiver as duas marcas, o
script falha com **1** e nomeia a marca ausente.

### 5.3 A semente

`challenge-new.sh` é determinístico: **não inventa semântica**. Ele materializa a semente
canônica — fatorial de inteiro não negativo — com 4 cenários nomeados, coerente ponta a ponta
(stub vazio falha, referência passa, alternativas passam), e nomes derivados do `--slug`:

| Derivação | Regra |
|---|---|
| `FUNC_NAME` | `slug` com `-`→`_` (`fatorial_iterativo`); em Go, CamelCase exportado (`FatorialGo`) |
| `scenario_id` | `<func_snake>_de_{zero,um,cinco,dez}` — casa `^[a-z0-9]+(_[a-z0-9]+)*$` |
| `PKG` / `CRATE` | fixos em `desafio`: são identificadores da linguagem, não podem depender de slug arbitrário |

Cenários: `_de_zero` (`boundary`) · `_de_um`, `_de_cinco`, `_de_dez` (`example`).
`expected_test_count` = 4 = `len(scenarios)`, sempre.

O enunciado nasce marcado `[RASCUNHO]`. O tutor reescreve o conteúdo antes da validação; é por
isso que `challenge_status` nasce `draft`, e DES-2 impede que um `draft` chegue ao aluno.

---

## 6. Templates — resolvidos pelo `MANIFEST.tsv`

Todo template é resolvido por `assets/templates/MANIFEST.tsv`: o script confere que a linha
existe **e** que a coluna `script_consumidor` menciona `challenge-new.sh`. Linha ausente → **1**.
Arquivo ausente → **1**, nomeando o caminho. **Não há template embutido no script**: um fallback
interno significaria dois lugares dizendo o que é um desafio.

| Template | Placeholders (contrato congelado no MANIFEST) | Contexto de inserção |
|---|---|---|
| `challenge/README.md.tmpl` | `CHALLENGE_ID TITLE STATEMENT SCENARIOS_TABLE LANGUAGE RUN_CMD` | `SCENARIOS_TABLE` é uma tabela markdown pronta |
| `challenge/meta.json.tmpl` | `CHALLENGE_ID TITLE LANGUAGE LAYOUT_PROFILE CONCEPT_IDS SCENARIOS_JSON EXPECTED_TEST_COUNT CREATED_AT SCHEMA_VERSION` | `CONCEPT_IDS` e `SCENARIOS_JSON` entram **sem aspas**: são JSON |
| `challenge/runner.sh.tmpl` | `LANGUAGE TEST_CMD EXPECTED_TEST_COUNT COUNT_PROBE` | §7 |
| `challenge/python/stub.py.tmpl` | `FUNC_NAME SIGNATURE DOCSTRING` | corpo entre as marcas |
| `challenge/python/test_stub.py.tmpl` | `FUNC_NAME MODULE SCENARIOS_CODE` | `SCENARIOS_CODE` = métodos com 4 espaços de recuo, dentro de `class TesteDesafio(unittest.TestCase)` |
| `challenge/node/stub.mjs.tmpl` | `FUNC_NAME SIGNATURE` | corpo entre as marcas |
| `challenge/node/stub.test.mjs.tmpl` | `FUNC_NAME MODULE SCENARIOS_CODE` | `SCENARIOS_CODE` = chamadas `test(...)` no topo do módulo; `MODULE` = `../stub.mjs` |
| `challenge/go/go.mod.tmpl` | `PKG GO_VERSION` | `GO_VERSION` = `<major>.<minor>` do `go version` local |
| `challenge/go/stub.go.tmpl` | `FUNC_NAME SIGNATURE PKG` | corpo entre as marcas |
| `challenge/go/stub_test.go.tmpl` | `FUNC_NAME PKG SCENARIOS_CODE` | `SCENARIOS_CODE` = `func Test…(t *testing.T)` no topo, **mesmo `package {{PKG}}` do stub** |
| `challenge/rust/Cargo.toml.tmpl` | `CRATE` | precisa da seção `[lib] path = "src/lib.rs"` |
| `challenge/rust/lib.rs.tmpl` | `FUNC_NAME SIGNATURE` | corpo entre as marcas |
| `challenge/rust/test_stub.rs.tmpl` | `FUNC_NAME CRATE SCENARIOS_CODE` | `use {{CRATE}}::{{FUNC_NAME}};` no topo e `SCENARIOS_CODE` **dentro de `mod tests`** — é o que torna o nome reportado qualificado |
| `challenge/c/stub.c.tmpl` | `FUNC_NAME SIGNATURE` | `#include "stub.h"`; corpo entre as marcas |
| `challenge/c/test_stub.c.tmpl` | `FUNC_NAME SCENARIOS_CODE` | `counter_protocol` completo; `SCENARIOS_CODE` = chamadas `checa_long(...)` dentro de `main` |

`stub.h` (C) e `tests/__init__.py` (Python) não têm template: o script os escreve direto, porque
são derivados mecânicos (o protótipo é a `SIGNATURE`; o `__init__.py` é um comentário).

**Substituição.** Um filtro em `python3` troca `{{NOME}}` (`[A-Z][A-Z0-9_]*`) pelo valor do mapa.
Placeholder sem valor → erro nomeando o template. `{{` remanescente → erro. O conteúdo entra
literal: não passa por `sed`, então `/`, `&` e quebras de linha em `SCENARIOS_CODE` são seguros.

### 6.1 Invariantes duras dos templates

O corpo dos templates é livre **exceto** nestes seis pontos. Quebrar qualquer um deles produz um
desafio que não compila, não roda, ou — pior — passa sem testar:

1. **Todo template de stub** carrega as linhas-marca `SM_CORPO_INICIO` e `SM_CORPO_FIM` em volta
   do corpo vazio. Sem elas o script não deriva `reference`, `reference_alt_*` nem `empty_stub`.
2. **`python/test_stub.py.tmpl`**: `SCENARIOS_CODE` entra dentro de
   `class TesteDesafio(unittest.TestCase)`, e o arquivo insere o diretório-pai em `sys.path`
   antes de `from {{MODULE}} import {{FUNC_NAME}}`.
3. **`go/stub_test.go.tmpl`**: `package {{PKG}}` — o **mesmo** do stub, no mesmo diretório.
4. **`rust/test_stub.rs.tmpl`**: `SCENARIOS_CODE` fica **dentro de `mod tests`**; é isso que faz
   o cargo reportar `tests::<id>` e casa com `scenarios[].test_name`.
5. **`c/test_stub.c.tmpl`**: implementa o `counter_protocol` (`checa_long`, `TESTS_RUN=`,
   `TESTS_FAILED=`), inclui `"../stub.h"` e respeita `getenv("SM_ONLY")`.
6. **`runner.sh.tmpl`**: `{{TEST_CMD}}` aparece **antes** do uso de `TIMEOUT_PADRAO`, e
   `{{COUNT_PROBE}}` **antes** da chamada de `contar_testes` / `mostrar_saida`.

---

## 7. ⭐ O `runner.sh` gerado

Exceção nomeada 1 de §5.2: **`0` passed · `1` failed · `2` count_mismatch · `3` timeout**, mais
**`66`** para infraestrutura. Não é script da skill — é artefato do desafio, lido e rodado pelo
aluno.

Esqueleto (a ordem dos blocos é contratual):

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

### 7.1 As defesas, e o defeito observado que cada uma cobre

| # | Defesa | Defeito observado |
|---|---|---|
| D1 | `cd "$CHALLENGE_DIR" \|\| exit 66` | 66 distingue "o diretório não existe" de "o teste falhou". Não é 1, não é 70. |
| D2 | `set -o pipefail` | `comando \| tail -1` devolve o status do `tail`: verde com teste vermelho. |
| D3 | `set -e` **ausente** | Com `errexit`, o primeiro teste vermelho mataria o runner antes do veredito. |
| D4 | Sandbox só de `lib/sandbox.sh` (`sm_sandbox_run "$CHALLENGE_DIR" -- …`) | Uma segunda pilha de sandbox seria uma segunda verdade sobre o que está ligado. O limite viaja por `SM_SANDBOX_WALL` / `SM_SANDBOX_CPU` / `CHALLENGE_TIMEOUT`, porque a assinatura da lib não tem parâmetro de tempo. |
| D5 | **Piso declarado em stderr**, nunca silencioso | O aluno roda o runner direto do terminal; sem a lib ele fica com relógio e CPU e **precisa saber disso**. As variáveis de proxy do piso são degradação declarada (lombada), não isolamento. |
| D6 | `timeout -s KILL -k 5` no piso | Sem `-s KILL` o SIGTERM chega ao wrapper e **não propaga**: o processo do aluno sobrevive ao timeout. |
| D7 | **Timeout por TEMPO DECORRIDO** | Com `-s KILL` o código é **137**, nunca 124 — e 137 também é OOM e limite de CPU. Medido: laço infinito com `CHALLENGE_TIMEOUT=3` → `EXIT_BRUTO=137`, `DECORRIDO_MS=3002`, `VEREDITO=timeout`. Quem testar `-eq 124` procura para sempre. |
| D8 | **Contagem por IGUALDADE** com `ESPERADO`, jamais `> 0` | Node conta o próprio arquivo de teste vazio (`pass 1`, exit 0); Go com layout errado conta 0 e sai 0; `unittest` sem teste sai 5; `cargo test <nome curto>` sai 0. |
| D9 | Ordem do veredito: tempo → contagem → exit | "seu código não termina", "o desafio está quebrado" e "seu código está errado" são três lições diferentes, nesta precedência. |
| D10 | `EXIT_BRUTO` e `DECORRIDO_MS` ecoados no stdout | A normalização 0/1/2/3 não pode apagar o diagnóstico (134 = SIGABRT, 5 = zero testes, 101 = Rust). |
| D11 | Limpeza de `__pycache__` antes de rodar | Mutante do mesmo tamanho reusaria o `.pyc` antigo. |
| D12 | `--only <cenario>` traduz para o nome **qualificado** e fixa `ESPERADO=1` | O nome curto em Rust devolve "N filtered out" com exit **0**. Cenário inexistente → `66`, nunca um verde. |

### 7.2 `TEST_CMD` e `COUNT_PROBE` por linguagem

`TEST_CMD` define `TIMEOUT_PADRAO`, `traduzir_cenario()` (mapa `scenario_id` → nome reportado,
gerado no script para o runner não precisar de `jq` na máquina do aluno) e `executar_testes()`.
`COUNT_PROBE` define `contar_testes()` e `mostrar_saida()`.

| Linguagem | `test_count_probe` | Comando | Contagem | `timeout_seconds` |
|---|---|---|---|---|
| `python` | `python_unittest_ran_line` | `python3 -B -m unittest discover -s tests -t . -p 'test_*.py' -v` | última linha `^Ran ([0-9]+) tests?` | 15 |
| `javascript` | `node_test_tap_summary` | `node --test --test-reporter=tap tests/stub.test.mjs` | linhas `^\s*(not )?ok N - <rótulo>` **descartando todo rótulo igual a um caminho da linha de comando** | 15 |
| `go` | `go_test_json_run_events` | `go test -json ./...` (com `GOPROXY=off`) | valores **distintos** de `"Test"` em eventos `"Action":"run"`; `mostrar_saida` decodifica os campos `"Output"` para o aluno | 90 |
| `rust` | `cargo_test_running_lines` | `cargo test --offline` (sem filtro) | **soma** de todas as linhas `^running ([0-9]+) tests?` — há uma por binário | 120 |
| `c` | `counter_protocol` | `gcc -std=c11 -g -O0 -Wall -o .build/test_bin stub.c tests/test_stub.c -lm && .build/test_bin` | `^TESTS_RUN=([0-9]+)` impresso pelo próprio teste | 30 |

Filtro de `--only`: `python3 -m unittest tests.test_stub.TesteDesafio.test_<id>` ·
`node --test-name-pattern='^<id>$'` · `go test -run '^Test<Camel>$'` ·
`cargo test tests::<id> -- --exact` · C lê `SM_ONLY` do ambiente dentro do `counter_protocol`.

Go e Rust rodam **offline** (`GOPROXY=off`, `cargo --offline`): SEG-5 manda o teste rodar sem
rede, e a semente não tem dependência.

O `counter_protocol` em C não é preferência de estilo: `assert.h` aborta no **primeiro** erro com
SIGABRT (exit 134) e esconde os demais cenários — inaceitável num teste cujo propósito é
enumerar cenários.

**Registrado, fora do escopo desta onda:** todo comando Java zero-install **precisa de `-ea`**.
Sem a flag a JVM remove as asserções e o desafio sempre passa (exit 0). Quando `java_classfile`
for implementado, `-ea` é obrigatório no `TEST_CMD`.

---

## 8. `meta.json` em `draft`

Nasce do template, recebe merge autoritativo por `jq`, é gravado por `sm_atomic_write` e
**validado** contra `challenge-manifest.schema.json` — falha → **5**, com uma linha por erro em
stderr.

| Campo | Valor no nascimento |
|---|---|
| `challenge_status` | `"draft"` |
| `validation.verdict` | `"not_run"`; os 7 `steps.*.status` = `"skipped"`; `generation_attempts: 0` |
| `integrity` | `{policy: "warn", test_sha256: null, reference_sha256: null}` |
| `scenarios[]` | 4 objetos `{scenario_id, test_name, kind, description}` |
| `scenarios[].test_name` | **o nome como o runner da linguagem o reporta**: `tests::<id>` em Rust, `tests.test_stub.TesteDesafio.test_<id>` em Python, `Test<Camel>` em Go, `<id>` em Node e C |
| `execution.expected_test_count` | `len(scenarios)` = 4 |
| `execution.sandbox` | `{mode: "posix_floor", network_isolated: false, timeout_source: <sondado>}` |
| `execution.failure_exit_codes` | `{policy: "non_zero_is_failure", known_failure_code: 1\|101, timeout_exit_code: 137, requires_output_grep: false}` |
| `artifacts.*` | todos **relativos** à raiz do desafio; nenhum caminho absoluto (I-37) |
| `oracle` | `{strategies: ["reference_impl"], numeric_mode: "exact_int"}` |
| `student_progress` | `{attempts: 0, last_result: "not_run", hint_level_used: 0, solution_revealed: false}` |

⭐ **`integrity.test_sha256` nasce `null`, e isso é regra de correção.** Uma LLM não computa
SHA-256: se o campo fosse obrigatório desde a criação, o modelo escreveria 64 caracteres
hexadecimais que parecem um hash e não são, e a detecção de adulteração passaria a **mentir para
sempre** — o aluno receberia "seu teste foi modificado" já na primeira execução e aprenderia a
ignorar o aviso. Quem calcula é `challenge-verify.sh`, com `sha256sum`, na aprovação. O script
**assere** isso depois de escrever: `test_sha256` diferente de `null` num `draft` → **5**.

---

## 9. Guardas finais

| Guarda | Falha → |
|---|---|
| `meta.json` valida no schema | **5** |
| `integrity.test_sha256` é `null` em `draft` | **5** |
| Nenhum `{{` em nenhum arquivo do desafio materializado | **1**, listando os arquivos |
| `runner.sh` com modo `0755` | — |
| Diretório desfeito se qualquer passo posterior à alocação falhar | — |

---

## 10. Verificações executadas (2026-08-23, nesta máquina)

Python 3.14.7 · Node 24.19.0 · Go 1.26.5 · cargo 1.98.0 · gcc 16.2.1 · coreutils 9.11.

| # | O que | Resultado |
|---|---|---|
| 1 | `bash -n challenge-new.sh` | OK |
| 2 | 5 desafios gerados; runner contra `empty_stub` e contra `reference` | `1` / `0` nas 5 linguagens; as 2 alternativas passam nas 5 |
| 3 | Armadilha do Go | árvore genérica: `[no test files]` + **exit 0**, 0 execuções contadas · árvore `go_module` gerada: **exit 1**, 4 execuções distintas |
| 4 | Armadilha do Rust | `cargo test <nome curto> -- --exact` → `0 passed; 4 filtered out`, **exit 0** · nome qualificado `tests::<id>` do `meta.json` → `running 1 test`, **exit 101** · `./runner.sh --only <id>` → `TESTS_RUN=1 ESPERADO=1`, exit 1 |
| 5 | Armadilha do Node | arquivo de teste esvaziado: `node --test` → `ok 1 - tests/stub.test.mjs`, `# pass 1`, **exit 0** · o mesmo arquivo pelo runner → `TESTS_RUN=0 ESPERADO=4`, `VEREDITO=count_mismatch`, **exit 2** |
| 6 | `meta.json` no schema | 5/5 válidos, `challenge_status=draft`, `test_sha256=null`, `verdict=not_run` |
| 7 | Toolchain ausente | `rust` sem `cargo` no `PATH` → mensagem com instalação + linguagens disponíveis, **exit 1**, nada criado · `ruby` (enum, não implementada) → **exit 2** · `cobol` (fora do enum) → **exit 2** |
| 8 | Placeholders | 0 arquivos com `{{` |
| + | Timeout | laço infinito com `CHALLENGE_TIMEOUT=3` → `EXIT_BRUTO=137`, `DECORRIDO_MS=3002`, `VEREDITO=timeout`, exit **3** |
| + | Piso declarado | sem `STUDY_METHOD_SKILL_DIR`, o aviso de 4 linhas sai em stderr e a execução continua |

---

## 11. Fronteiras

- `challenge-new.sh` **não** valida o desafio: quem julga é `challenge-verify.sh` (DES-1). Ele
  nem sequer preenche campo de `validation` além do estado inicial.
- **Não** grava SHA-256 (§8) e **não** promove `challenge_status`.
- **Não** escreve fora de `<setup_root>/challenges/<NNNN>-<slug>/`.
- **Não** instala toolchain, **não** acessa rede, **não** gera desafio em linguagem não
  confirmada por `command -v`.
- As 14 linguagens restantes do enum ficam **documentadas** em `SK/references/languages.md` e
  recusadas com **2** — nenhuma delas tem árvore implementada nesta versão.
