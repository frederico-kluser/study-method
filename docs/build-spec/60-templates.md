# 60 — Templates: contrato dos placeholders e da materialização

> Fragmento da sub-tarefa 3.6. Contrato, não racional — o porquê está em `docs/00-contratos.md`
> §3.5, `docs/05-challenges-tdd.md` e no `MANIFEST.tsv` que este fragmento apenas descreve.
> Fonte de verdade sobre caminho/script/placeholder é sempre
> `skills/study-method/assets/templates/MANIFEST.tsv` — se este documento divergir dele, o
> `MANIFEST.tsv` vence.

## 1. Sintaxe e regras gerais

- Placeholder: `{{NOME_MAIUSCULO}}`, `^[A-Z0-9_]+$`. Nenhum outro delimitador.
- Todo placeholder usado num template está na coluna 3 do `MANIFEST.tsv` para aquele caminho;
  o inverso não vale — um template pode deixar de usar um placeholder que o `MANIFEST` permite.
- Depois da substituição não pode sobrar `{{` nem `}}` no artefato. É a checagem do gate.
- `setup.json`, `session.json` e `meta.json` materializados validam contra
  `setup-manifest.schema.json`, `session.schema.json` e `challenge-manifest.schema.json`
  respectivamente, com o verificador mínimo em Python stdlib (`docs/00-contratos.md` §4.3).
- Comentários dos templates em pt-BR (o aluno lê o artefato final); identificadores em inglês.
- `runner.sh` é materializado com modo `0755`; os demais artefatos não precisam de bit de
  execução.

### 1.1 ⭐ As marcas de corpo dos stubs — contrato que **não** é placeholder

Além dos `{{…}}`, os **5 templates de stub** carregam um segundo contrato, e ele é **obrigatório**:
duas **linhas-marca**, escritas no comentário da própria linguagem, em volta do corpo vazio.

| Template de stub | Marca de abertura | Marca de fechamento |
|---|---|---|
| `challenge/python/stub.py.tmpl` | `# SM_CORPO_INICIO` | `# SM_CORPO_FIM` |
| `challenge/node/stub.mjs.tmpl` | `// SM_CORPO_INICIO` | `// SM_CORPO_FIM` |
| `challenge/go/stub.go.tmpl` | `// SM_CORPO_INICIO` | `// SM_CORPO_FIM` |
| `challenge/rust/lib.rs.tmpl` | `// SM_CORPO_INICIO` | `// SM_CORPO_FIM` |
| `challenge/c/stub.c.tmpl` | `/* SM_CORPO_INICIO … */` | `/* SM_CORPO_FIM */` |

Regras:

- **Não são placeholders.** Não usam `{{ }}`, não entram na coluna 3 do `MANIFEST.tsv`, e
  **sobrevivem** à substituição: continuam no artefato entregue ao aluno, onde servem de instrução
  ("escreva a sua implementação entre estas duas marcas").
- `challenge-new.sh` deriva do stub **já materializado**, trocando as linhas **entre** as duas
  marcas pelo corpo real. É assim que nascem os três oráculos: `.solution/reference.<ext>`,
  `.solution/reference_alt_recursiva.<ext>` e `.solution/reference_alt_acumulador.<ext>`.
  (`.solution/empty_stub.<ext>` é cópia **byte a byte** do stub — e por isso também carrega as
  marcas.)
- Faltando **qualquer uma** das duas — ou vindo a de fechamento **antes** da de abertura — o script
  **aborta com exit 1**, nomeia as duas marcas e **remove o desafio parcial**. Não há caminho
  degradado: sem as marcas não existe onde enxertar o corpo, e um desafio sem oráculo não pode ser
  gerado. Verificado por execução: template de stub sem `SM_CORPO_FIM` → exit 1 e
  `challenges/NNNN-<slug>/` apagado.
- Uma marca por linha, sozinha no seu comentário. O texto **depois** de `SM_CORPO_INICIO` é livre
  (é o que o aluno lê); o script procura a **linha** que contém a marca, e usa a **última**
  ocorrência de cada uma.
- **Quem escrever o 6º template de stub tem de trazer as duas.** Este requisito vivia só dentro do
  `challenge-new.sh`; agora está aqui, no `MANIFEST.tsv` e em
  `docs/build-spec/51-challenge-new.md` §5.2/§6.1.

## 2. `setup/`

| Template | Placeholders | Nota |
|---|---|---|
| `setup.json.tmpl` | `SETUP_ID, SETUP_NAME, SUBJECT, LANGUAGE, SESSION_MINUTES, THEORY_SOURCE, CREATED_AT, SCHEMA_VERSION` | Ver §2.1 |
| `README.md.tmpl` | `SETUP_NAME, SUBJECT, SETUP_ID, CREATED_AT` | 8 seções entre marcadores, §2.2 |
| `gitignore.tmpl` | nenhum (`-` no MANIFEST) | Contém `memory/` (I-40) |

### 2.1 `setup.json.tmpl` — campos sem placeholder

`setup-manifest.schema.json` exige `title`, `taxonomy`, `updated_at`, `session_count`,
`decisions` além dos oito campos com placeholder. Nenhum deles tem placeholder próprio no
`MANIFEST` — decisão já congelada, então o template resolve assim:

- `title` reaproveita `{{SETUP_NAME}}` (o schema não impõe padrão kebab-case a `title`, só
  comprimento; fica sem acento até o aluno editar o `README.md`, que é onde o título de verdade
  aparece em prosa).
- `taxonomy` nasce `[]` (o schema não exige `minItems`).
- `updated_at` reaproveita `{{CREATED_AT}}` (na criação, os dois carimbos coincidem).
- `session_count` nasce `0`; `decisions` nasce `{}` — literais, não placeholders.
- `language` é objeto (`{"name": "{{LANGUAGE}}"}`); os campos opcionais dele
  (`runtime_version`, `detected_at`, `chosen_at`) ficam de fora, sem placeholder para preenchê-los.

### 2.2 `README.md.tmpl` — os 8 marcadores

Ordem fixa (`docs/00-contratos.md` §3.5, I-41): `identidade` · `taxonomia` · `base-teorica` ·
`destilados` · `desafios` · `linha-do-tempo` · `pontes` · `estado-atual`. Cada seção:
`<!-- study-method:begin <secao> -->` … `<!-- study-method:end <secao> -->`. `readme-sync.sh`
reescreve só o interior; o template inclui, antes da primeira seção, um comentário HTML (fora de
qualquer marcador, portanto nunca reescrito) explicando ao aluno que tudo fora dos marcadores é
dele. O conteúdo inicial de cada seção é um placeholder textual em pt-BR ("ainda sem X") — não é
um placeholder `{{ }}` do gate, é prosa estática que `readme-sync.sh` substitui na primeira
sincronização real.

## 3. `session/`

`session.json.tmpl` — placeholders `SESSION_ID, SETUP_ID, DATE, STARTED_AT, SCHEMA_VERSION`.
`status` nasce `"in_progress"` (literal, não placeholder — é regra de negócio, não dado
variável). `one_line_summary` é obrigatório pelo schema e nasce com o valor provisório literal
"Sessão em andamento — resumo ainda não escrito.", reescrito por `session-close.sh` no
fechamento.

## 4. `challenge/` — templates comuns

| Template | Placeholders |
|---|---|
| `README.md.tmpl` | `CHALLENGE_ID, TITLE, STATEMENT, SCENARIOS_TABLE, LANGUAGE, RUN_CMD` |
| `meta.json.tmpl` | `CHALLENGE_ID, TITLE, LANGUAGE, LAYOUT_PROFILE, CONCEPT_IDS, SCENARIOS_JSON, EXPECTED_TEST_COUNT, CREATED_AT, SCHEMA_VERSION` |
| `runner.sh.tmpl` | `LANGUAGE, TEST_CMD, EXPECTED_TEST_COUNT, COUNT_PROBE` |

### 4.1 `README.md.tmpl`

Enunciado + `{{SCENARIOS_TABLE}}` (blob Markdown pré-formatado, uma tabela `cenário/tipo/o que
cobre`) + como rodar. Duas frases fixas, sem placeholder, carimbadas por decisão normativa
(`docs/05-challenges-tdd.md` §1.1 e §10.1): a recusa explícita a prometer cobertura de toda
entrada imaginável (a frase que I-42 proíbe, verificada por `grep` cego, nunca aparece no
template — nem dentro de uma negação) e o convite a duvidar do teste ("se você acha que o teste
está errado, me diga...").

### 4.2 `meta.json.tmpl` — campos sem placeholder e por quê

`challenge-manifest.schema.json` exige 19 campos de topo; só 9 têm placeholder. Os demais nascem
literais, coerentes com `challenge_status: "draft"` (nada foi validado ainda):

| Campo | Valor | Razão |
|---|---|---|
| `slug` | `{{CHALLENGE_ID}}` | Sem placeholder próprio de slug no MANIFEST; `challenge_id` (4 dígitos) já casa o pattern kebab-case. O slug legível do **diretório** (`challenges/<NNNN>-<slug>/`) é decidido por `challenge-new.sh`, fora deste template. |
| `updated_at` | `{{CREATED_AT}}` | Coincidem na criação. |
| `skill_level` | `"beginner"` | Default conservador; refinável por `challenge-new.sh` via `jq` a partir do `setup.json` do aluno, fora do contrato de placeholder. |
| `difficulty` | `1` | Idem. |
| `artifacts.*` | nomes lógicos **sem extensão** (`stub`, `tests/test_stub`, `.solution/reference`, `README.md`, `runner.sh`, `.solution`) | Não há placeholder de extensão de arquivo, e a extensão real depende só de `language` (que o script já conhece). Gravar `stub.py` fixo no template contradiria `layout_profile` para go/rust. `challenge-new.sh` corrige estes quatro campos por `jq` depois de decidir `layout_profile`; o schema não valida correspondência entre estes caminhos e o disco. |
| `execution.test_command` | `["./runner.sh"]` | `runner.sh` é o único ponto de entrada (§5); quem sabe invocar `python3`/`cargo`/`go test`/`gcc` é o `runner.sh` já materializado com `{{TEST_CMD}}`, não o `meta.json`. |
| `execution.working_dir` | `"."` | `runner.sh` já fixa o próprio `cwd`. |
| `execution.timeout_seconds` | `15` | Casa o default de `runner.sh.tmpl` (`CHALLENGE_TIMEOUT:-15`). |
| `execution.test_count_probe` | `"counter_protocol"` | `runner.sh` sempre reemite a contagem no formato `TESTS_RUN=<n>` (mesmo quando a sonda **interna** usada foi outra) — é exatamente o protocolo `counter_protocol`. Quem lê a saída de `runner.sh` de fora nunca precisa saber que por dentro havia `python_unittest_ran_line` ou `go_test_json_run_events`; isso é interno ao `runner.sh` (§5.3), não ao consumidor do `meta.json`. |
| `execution.failure_exit_codes` | `{"policy": "non_zero_is_failure"}` | Único campo obrigatório do subobjeto. |
| `oracle.strategies` / `oracle.numeric_mode` | `["reference_impl"]` / `"not_numeric"` | Scaffold neutro; depende do conteúdo específico do desafio, que este template genérico não conhece. Refinado por `challenge-new.sh`. |
| `validation.*` | `verdict: "not_run"`, `generation_attempts: 0`, os 7 `steps.*.status: "skipped"` | Nada rodou ainda — "draft" honesto, nunca inventa um veredito. |
| `integrity.policy` | `"warn"` | Default canônico (D-C01, `docs/05` §9.1). |
| `integrity.test_sha256` | `null` | Obrigatório ser `null` até `challenge-verify.sh` aprovar (§9.1) — o tutor nunca calcula SHA-256. |
| `student_progress.*` | `attempts: 0`, `last_result: "not_run"`, `hint_level_used: 0`, `solution_revealed: false` | Estado inicial, nenhum aluno tentou ainda. |

`target_concepts` (`{{CONCEPT_IDS}}`) e `scenarios` (`{{SCENARIOS_JSON}}`) são **blobs JSON
inteiros pré-formatados**, inseridos crus: `challenge-new.sh` monta o array de objetos completo
(com `label`/`role` para conceitos, `scenario_id`/`test_name`/`kind`/`description` por cenário) e
o template só faz `"target_concepts": {{CONCEPT_IDS}}` / `"scenarios": {{SCENARIOS_JSON}}`. Não
há como um template de substituição simples (sem laço) gerar N objetos a partir de uma lista de
IDs; por isso os dois placeholders carregam o array já serializado, não uma lista crua de nomes.
`len(scenarios)` deve ser igual a `{{EXPECTED_TEST_COUNT}}` — não checado pelo schema (sem
validação cruzada no verificador mínimo), é responsabilidade de `challenge-new.sh`.

## 5. `runner.sh.tmpl` — o executor

Transcrição do esqueleto verificado em `docs/05-challenges-tdd.md` §3.3, com duas correções
sobre a versão daquele documento porque `docs/00-contratos.md` §7.3 (que vence) já define a
interface real de `lib/sandbox.sh`:

- a função da lib chamada é **`sm_sandbox_run <challenge_dir> -- <argv…>`** (não
  `sandbox_exec`, que era o nome do rascunho em `docs/05`); `runner.sh.tmpl` embrulha isso num
  `sandbox_exec()` local só para manter o resto do esqueleto idêntico ao verificado.
- o cálculo de `DECORRIDO_MS` e a comparação com `TIMEOUT_S` continuam feitos **no próprio
  `runner.sh`**, não delegados a `sm_sandbox_classify_exit` — a função existe no contrato da lib
  mas `runner.sh` não depende dela para o veredito de timeout, porque isso mantém `runner.sh`
  corretamente testável mesmo com uma `lib/sandbox.sh` ainda incompleta (é exatamente o estado
  da onda em que o `runner.sh` foi escrito, e a independência ficou de propósito). Hoje
  `lib/sandbox.sh` está implementada — 800 linhas e 26 funções `sm_sandbox*`.

Defesas presentes, todas exercitadas na verificação (§6 abaixo):

1. **Piso declarado**: se `${STUDY_METHOD_SKILL_DIR}/scripts/lib/sandbox.sh` não é legível,
   `runner.sh` avisa em stderr ("PISO DECLARADO... sem isolamento de rede, sem confinamento de
   escrita, sem limite de memória") e define um `sandbox_exec` local com `ulimit` + proxy inválido
   degradado + `timeout -s KILL -k 5`.
2. **`timeout -s KILL -k 5 "$TIMEOUT_S"`** — sempre SIGKILL, nunca `timeout` simples (que trava
   dentro da pilha real em vez de matar).
3. **Timeout por tempo decorrido**, nunca por exit code: `T0`/`T1` via `date +%s%N`,
   `DECORRIDO_MS >= TIMEOUT_S*1000` decide, checado **antes** de olhar `EXIT_BRUTO`. Comprovado
   com um stub `while True: pass`: `EXIT_BRUTO=137`, nunca 124, e o veredito ainda assim é
   `timeout` (exit 3) porque veio do relógio.
4. **`cd "$DESAFIO_DIR" || exit 66`** — infraestrutura, nunca confundido com falha de teste.
5. **`set -u -o pipefail`** — nenhum pipeline no script; ainda assim presente por hábito seguro
   (o `cat "$SAIDA"; echo "---"` não é pipe).
6. **Igualdade de contagem** (`[ "$TESTS_RUN" -ne "$ESPERADO" ]`), nunca `-eq 0` nem `> 0`.

`{{TEST_CMD}}` é atribuído entre **aspas simples** (`TEST_CMD='{{TEST_CMD}}'`), de propósito: se
fossem aspas duplas, qualquer `$`/crase dentro do valor substituído seria expandido **na hora da
atribuição**, cedo demais — antes de `TEST_CMD` ser passado para o `bash -c` que efetivamente
executa o comando. Consequência prática para quem gera `TEST_CMD`: nunca usar aspas simples
*dentro* do valor (usar aspas duplas quando precisar citar algo).

`{{COUNT_PROBE}}` seleciona, por `case`, qual sonda de `docs/05-challenges-tdd.md` §3.1 extrai
`TESTS_RUN` de `$SAIDA`: `python_unittest_ran_line` (`grep` da linha `Ran N tests`),
`node_test_tap_summary` (`grep` de `# tests N`), `go_test_json_run_events` (`jq` contando `Test`
únicos com `Action:"run"`), `cargo_test_running_lines` (soma de todas as linhas `running N
tests`), `counter_protocol` (`grep` de `TESTS_RUN=N` em stdout). `jq` é ferramenta garantida
(LIB-6), sem fallback.

## 6. Árvore por linguagem e verificação por execução

Todas as 5 verificadas nesta máquina (Python 3.14.7, Node 24.19.0, Go 1.26.5, Rust 1.98.0, gcc
16.2.1): stub vazio materializado → `./runner.sh` → **falha real** (nunca erro de sintaxe, nunca
passa), com `TESTS_RUN == ESPERADO` em todos os casos.

```
python (generic):  stub.py · tests/test_stub.py                    TEST_CMD: python3 -B -m unittest discover -s tests -p "test_*.py"
node   (generic):  stub.mjs · tests/stub.test.mjs                   TEST_CMD: node --test --test-reporter=tap tests/stub.test.mjs
go     (go_module): go.mod · stub.go · stub_test.go (raiz, mesmo pacote)  TEST_CMD: go test -json ./...
rust   (cargo_crate): Cargo.toml · src/lib.rs · tests/test_stub.rs   TEST_CMD: cargo test
c      (generic):  stub.c · tests/test_stub.c (#include "../stub.c") TEST_CMD: gcc ... tests/test_stub.c && ./bin
```

### 6.1 Armadilha do Go — resolvida em dois pontos

`stub_test.go.tmpl` tem **sufixo** `_test.go` (nunca prefixo) e vive na **raiz**, mesmo
diretório/pacote de `stub.go.tmpl` — não em `tests/`. Comprovado por execução: uma árvore com o
mesmo conteúdo salvo como `test_stub.go` (prefixo) na raiz dá `go test` → `"? fatorial [no test
files]"` com **exit 0** (o falso positivo silencioso). A árvore correta (`stub_test.go`, sufixo)
gera 2 eventos `"Action":"run"` e falha de verdade.

Segunda armadilha, encontrada durante a verificação desta onda, não estava em nenhum documento
prévio: se `stub.go.tmpl` sinaliza "não implementado" com `panic()`, o **primeiro** teste que
falha derruba o binário de teste inteiro (`[recovered, repanicked]`) e os testes seguintes **nunca
rodam** — mesmo defeito do `assert.h` em C que `docs/05-challenges-tdd.md` §3.2 já advertia, só
que em Go. Corrigido trocando `panic()` por **retorno nomeado + `return` nu**
(`{{SIGNATURE}}` = `"n int) (resultado int)"` → `func Fatorial(n int) (resultado int) { return
}`): devolve o zero-value do tipo, uma resposta sempre errada, sem abortar o processo. Com a
correção, os 2 testes rodam e falham independentemente (`TESTS_RUN=2 ESPERADO=2`).

### 6.2 Convenção de `{{SIGNATURE}}` por linguagem

Não há placeholder de tipo de retorno separado — `SIGNATURE` carrega semânticas diferentes por
template porque cada `.tmpl` já decide a pontuação ao redor dele:

| Linguagem | Template usa | `{{SIGNATURE}}` contém |
|---|---|---|
| Python | `def {{FUNC_NAME}}({{SIGNATURE}}):` | só os parâmetros (`"n"`) |
| Node | `export function {{FUNC_NAME}}({{SIGNATURE}}) {` | só os parâmetros |
| Go | `func {{FUNC_NAME}}({{SIGNATURE}} {` | parâmetros + `) (retorno nomeado)` — sem retorno nomeado, `panic` seria a única opção de stub e reintroduz a armadilha de 6.1 |
| Rust | `pub fn {{FUNC_NAME}}({{SIGNATURE}} {` | parâmetros + `) -> tipo` |
| C | `{{SIGNATURE}} {` | protótipo **inteiro** (`"long fatorial(long n)"`) — em C o tipo de retorno vem antes do nome, então não dá para reaproveitar o mesmo padrão `NOME(SIGNATURE)` dos demais |

`{{MODULE}}` (Python/Node) é o caminho de import visto de dentro do arquivo de teste:
`"stub"` em Python (roda de `tests/`, mas `unittest discover -s tests` mantém a raiz do desafio
em `sys.path`, verificado por execução) e `"../stub.mjs"` em Node (import relativo explícito).

`{{CRATE}}` (Rust) deve ser **snake_case**, não kebab-case: é usado ao mesmo tempo como
`package.name` do `Cargo.toml` (aceita underscore) e como identificador em
`use {{CRATE}}::{{FUNC_NAME}};` no teste de integração — um nome kebab-case exigiria a conversão
hífen→underscore que o `cargo` faz por baixo dos panos, e o template não tem como replicá-la sem
processamento.

## 7. Verificação executada nesta onda

Script único em `/scratchpad/verify.py` (Python 3 stdlib): parseia o `MANIFEST.tsv`, materializa
cada template com valores plausíveis, confere ausência de `{{`, valida os três `.json` contra os
schemas com o verificador mínimo (`/scratchpad/minival.py`), roda `bash -n` no `runner.sh`
materializado de cada linguagem, monta as 5 árvores reais e executa `./runner.sh` contra o stub
vazio (sem `STUDY_METHOD_SKILL_DIR`, exercitando deliberadamente o piso declarado), e monta o
contraste Go correto×quebrado. Resultado: `TUDO OK`, sem falhas.
