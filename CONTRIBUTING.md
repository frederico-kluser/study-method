# Como contribuir

Antes de qualquer coisa: **rode o gate**. Ele é rápido, roda offline, e diz em português o que
quebrou e onde.

---

## A regra de ouro

> ### `docs/00-contratos.md` é a autoridade.
>
> Vocabulário, caminho de arquivo, código de saída, nome de passo, interface de CLI, nome de campo
> de schema: **mudança em qualquer um desses se faz no contrato primeiro**, e só depois no código.
>
> **PR que muda contrato sem tocar em `docs/00-contratos.md` é rejeitada no gate.**

`tests/validate.sh` é a tradução mecânica daquele documento — não é um teste "independente". Se
você mudou um enum, um exit code ou o nome de um script e o `validate.sh` reclamou, a resposta
certa é abrir o contrato, decidir lá, e trazer o gate junto. A resposta errada é afrouxar a
asserção do gate.

Quando dois documentos discordam, o contrato vence. Ele já traz, no §2.2, uma tabela de **nomes
revogados** — e o gate procura por eles em todo `.md` normativo do repositório.

---

## Rodando o gate localmente

Os cinco, nesta ordem — cada um só faz sentido depois do anterior:

```bash
tests/gate-build.sh        # 1. sintaxe e forma
tests/gate-lint.sh         # 2. qualidade de texto e de arquivo
tests/validate.sh          # 3. contrato  (o pesado; é o que decide)
tests/smoke.sh             # 4. integração ponta a ponta
tests/spec-conformance.sh  # 5. o BUILD_SPEC.md ainda descreve o repositório?
```

| Gate | Pergunta que responde | O que NÃO faz |
|---|---|---|
| `gate-build.sh` | O que está no disco é sintaticamente válido e tem a forma que o contrato exige? `bash -n`, `py_compile`, `json.load`, permissões (`lib/` em 0644 sem shebang, executáveis em 0755), shebang, `set -euo pipefail`, CRLF, templates de shell. | Semântica nenhuma. |
| `gate-lint.sh` | Os defeitos baratos que estragam a leitura: frontmatter malformado, link relativo quebrado, placeholder de template órfão, arquivo sem newline final, tabela markdown torta. | Não é contrato nem sintaxe. |
| `validate.sh` | As 43 invariantes de `docs/00-contratos.md` §11 (`I-01`..`I-43`), mais os checks estruturais `G-*` que o §4, o §7, o §9 e o §10 exigem e o §11 não numerou. | Não roda o fluxo: análise estática e fixtures. |
| `smoke.sh` | O fluxo inteiro funciona? Cria setup, abre e fecha 3 sessões, gera e valida um desafio, renderiza um gráfico, prova idempotência, valida todo JSON contra o schema dono. | O modelo **não** está no laço: as respostas do REQUEST/APPLY são sintetizadas mecanicamente. Prova o caminho, não a qualidade do julgamento. |
| `spec-conformance.sh` | O `BUILD_SPEC.md` montado ainda descreve o repositório de verdade? As 11 checagens `SC-01`…`SC-08`: caminhos citados, scripts, funções de `lib/`, schemas, decisões, patterns, enums, exit codes e termos revogados. `docs/12-conformidade.md`. | Não valida contrato nem roda o fluxo: compara o documento com o disco. |

Atalhos úteis:

```bash
tests/validate.sh --list                 # lista os checks que têm cabeçalho de comentário (8 dos 77)
GATE_ONLY=I-14,I-33 tests/validate.sh    # roda só os que começam por esses prefixos
tests/smoke.sh --keep                    # não apaga o diretório de trabalho, para inspeção
STUDY_METHOD_TODAY=2026-08-23 tests/validate.sh   # data fixa (determinismo)
```

O `smoke.sh` roda num diretório temporário com `STUDY_METHOD_HOME` e `STUDY_METHOD_TODAY`
próprios: nada toca o seu `$HOME` real, nada depende do relógio.

**Limitações declaradas.** Cada gate imprime as suas no resumo — limitação conhecida é melhor que
escondida. Hoje: não há `shellcheck` nem PyYAML na máquina de referência (o frontmatter é lido por
`awk`, e a análise de shell se limita a `bash -n`); o verificador de JSON Schema é mínimo, escrito
em stdlib pura; `bubblewrap` ausente derruba o confinamento de escrita. **Se um gate depende de
uma ferramenta que falta, ele degrada declarando o que ficou sem cobertura — não instale nada para
"consertar" isso, e não silencie o aviso.**

---

## Acrescentar uma linguagem nova

Hoje 5 linguagens geram desafio de verdade (`python`, `javascript`, `go`, `rust`, `c`) e 14 estão
documentadas sem implementação. Acrescentar uma é um trabalho de 5 passos, e ele **não** começa no
template.

### 1. O contrato de árvore

Cada linguagem tem um `layout_profile`, e ele não é cosmético — é o que impede o desafio de sair
verde sem rodar teste nenhum:

| `language` | `layout_profile` | Manifesto obrigatório |
|---|---|---|
| `go` | `go_module` | `go.mod` |
| `rust` | `cargo_crate` | `Cargo.toml` |
| `java`, `kotlin` | `java_classfile` | — |
| `csharp` | `dotnet_project` | `.csproj` |
| `elixir` | `mix_project` | `mix.exs` |
| `swift` | `swiftpm` | `Package.swift` |
| `julia` | `julia_project` | `Project.toml` |
| `haskell` | `cabal_project` | `.cabal` |
| `bash` | `bats_suite` | — |
| demais | `generic` | — |

Se a sua linguagem não couber no `generic`, o perfil novo entra **primeiro** no contrato
(`docs/00-contratos.md` §4.3), e o passo 0 do `challenge-verify.sh` passa a exigir o manifesto.

### 2. Os templates

Um diretório em `skills/study-method/assets/templates/challenge/<linguagem>/`, com o stub e o
arquivo de teste. Toda entrada nova precisa de uma linha em
`skills/study-method/assets/templates/MANIFEST.tsv` — caminho, script consumidor, placeholders,
obrigatoriedade. O gate reprova template com placeholder fora da lista, script que consome
template ausente, e placeholder que sobrou em artefato materializado.

Placeholders são `{{` seguido de `NOME_MAIUSCULO_COM_UNDERSCORE` e `}}`. Nenhum outro delimitador
é aceito.

### 3. As marcas de corpo do teste

Duas, e as duas são obrigatórias:

- **guard estático** — o padrão que prova que existe pelo menos uma declaração de teste no
  arquivo (`def test_`, `#[test]`, `func Test[A-Z]`, `@Test`, `assert\s*\(`…);
- **sonda de contagem** (`test_count_probe`) — como extrair `tests_run` e `tests_failed` da saída.
  As existentes: `python_unittest_ran_line`, `node_test_tap_summary`, `go_test_json_run_events`,
  `cargo_test_running_lines`, `junit_console_summary`, `counter_protocol`.

Se a sua linguagem não expõe contagem, a saída é o `counter_protocol` (o teste imprime
`TESTS_RUN=` e `TESTS_FAILED=`). O valor `none` é **rejeitado no passo 0** — sem contagem, o
harness não consegue provar que o teste rodou.

### 4. ⚠️ As armadilhas conhecidas de exit code

Esta é a parte que engana. **Falha é `exit_code != 0`, jamais `== 1`** — e o exit code sozinho não
distingue "passou" de "nada rodou". Antes de declarar uma linguagem suportada, reproduza estes
casos com a sua toolchain e anote o resultado:

| Armadilha | O que acontece |
|---|---|
| Go, layout genérico | `go test ./...` imprime `[no test files]` e sai **0** — falso positivo. O arquivo precisa terminar em `_test.go` e ficar no mesmo diretório e pacote. |
| Node, arquivo de teste vazio | `node --test` conta o **próprio arquivo** como um teste que passou: `ok 1 - tests/stub.test.js`, exit **0**. Ignore todo `ok N - <label>` cujo label seja o caminho passado na linha de comando. |
| Rust, filtro sem qualificar | `cargo test test_add -- --exact` sai **0** com `1 filtered out`. O filtro é por caminho completo (`tests::test_add`). Num desafio de um arquivo, não filtre. |
| Python, zero testes | `unittest` sai **5** — nem 0, nem 1. |
| Java, sem `-ea` | A JVM **remove** as asserções: exit **0** com asserção falsa. Todo comando Java zero-install precisa de `-ea`. |
| R, `testthat::test_dir()` | `stop_on_failure = FALSE` é o padrão: sai **0** com teste quebrado. |
| Rust / C / Elixir / .NET | Falha dá **101**, **134** (SIGABRT), **2** e **2** respectivamente. |
| Timeout, em qualquer linguagem | Não se detecta por exit code. A sandbox mata com `-s KILL`, o que dá **137** — que também é OOM e limite de CPU. **124 nunca acontece.** Meça o tempo decorrido. |

O catálogo completo, com o que foi confirmado executando, está em
[`skills/study-method/references/languages.md`](skills/study-method/references/languages.md).

### 5. Fechar o ciclo

`SM_LANGS_IMPL` em `challenge-new.sh`, a linha na matriz de `references/languages.md`, o exit code
de falha no mapa da linguagem, e o `smoke.sh` gerando e validando um desafio real na linguagem
nova. **Sem esse último passo, a linguagem não está implementada — está documentada.**

---

## Acrescentar uma decisão ao catálogo

O catálogo de decisões abertas vive em **3 camadas sincronizadas**, e a regra é uma só:
**nenhum derivado inventa decisão, opção ou default. Divergência entre derivado e catálogo é bug
do derivado.**

| Camada | Arquivo | Papel |
|---|---|---|
| Máquina (origem de verdade) | `skills/study-method/assets/decisions.json` | Quais decisões existem, quais opções são válidas, para quem, quando, a que custo, onde a resposta é gravada. |
| Humana | `docs/08-decisoes-abertas.md` | Renderização legível do catálogo — as 114 decisões, uma seção por `D-NNN`. **Derivado**, e o gate cobra a cobertura: `G-12c`. |
| Runtime | `skills/study-method/scripts/decisions-ask.sh` | Lê o catálogo e conduz a entrevista. **Derivado**, e o gate cobra: `I-06b`. |

Uma entrada nova precisa de:

- `id` no formato `D-<PREFIXO><NN>` — `A` arquitetura, `M` memória, `P` proficiência, `E` ensino,
  `C` challenge, `V` visualização e linguagem, `B` bootstrap, `S` segurança. **Renomear um id
  depois exige migrar setups já criados**, porque ele é a chave em `setup.json`;
- `question_ptbr` em linguagem de gente — nunca pedindo que o leitor conheça nome de campo de
  schema;
- `why_it_matters` — 1 a 3 linhas dizendo **o que muda de cada lado**. É o campo que cumpre o
  requisito "explicada para o usuário decidir". Nunca repete a pergunta;
- `audience` (`builder` / `student` / `both`), `tier` (1..4), `ask_when` e `reversibility`;
- `options[]` com `id`, `label`, `value` (o dado de máquina, nunca a prosa do label), `pros[]` e
  **`cons[]` obrigatoriamente não vazio, inclusive na opção recomendada** — opção sem custo
  declarado é anúncio, não escolha;
- `default` apontando para o `id` de uma opção **desta** entrada;
- `source` — o `caminho#seção` que sustenta o default.

Depois: `python3 -c 'import json; json.load(open("skills/study-method/assets/decisions.json"))'`,
e o gate valida contra `assets/schemas/decisions.schema.json`.

---

## O que não é aceito em PR

Três coisas, e nenhuma delas tem exceção "só desta vez":

1. **Teste afrouxado para passar.** Se uma asserção do gate reprovou o seu código, ou o código
   está errado, ou o contrato mudou e você mudou o contrato primeiro. Baixar o limiar de mutation
   score, trocar igualdade de contagem por `> 0`, marcar um check como opcional, comentar uma
   invariante: rejeitado. Vale igual para o produto — `DES-8` proíbe afrouxar asserção de teste já
   validado.

2. **Promessa de ganho pedagógico sem fonte.** "Melhora a retenção", "acelera o aprendizado",
   "desenvolve o raciocínio": ou vem com a citação no `docs/research/`, ou não entra. A invariante
   `I-43` reprova mecanicamente um conjunto nomeado dessas frases.

3. **Número sem verificação.** Todo número que aparece em documento, README ou mensagem ao aluno
   tem que ser reproduzível por um comando. Se você escreveu "cobre 12 cenários", diga como
   contou. Se escreveu "o score foi 0,93", diga qual execução produziu isso. `DES-3` proíbe até a
   forma mais tentadora — prometer cobertura completa de erro em vez de dizer quais cenários
   nomeados foram cobertos e qual mutation score foi medido.

Corolários que aparecem com frequência:

- **Limitação escondida.** Se o seu código degrada quando falta uma ferramenta, ele declara a
  degradação na saída. Silenciar é pior que falhar.
- **Rede nos scripts.** Zero, sem exceção (`I-26`). Nem para "checar atualização".
- **Escrita fora dos dois caminhos** (o setup e o `STUDY_METHOD_HOME`): `I-24`, `I-25` e `SEG-8`.
- **Frontmatter YAML em artefato gerado.** Proibido: não há PyYAML na máquina de referência. A
  proveniência é o bloco `<!-- study-method:meta {…} -->` (`I-36`).
- **Caminho absoluto gravado dentro do setup.** O setup pode ser movido (`I-37`).

---

## Fluxo de uma PR

1. Ramo a partir de `main`.
2. Se a mudança toca contrato: `docs/00-contratos.md` **no mesmo commit** que o código.
3. Os 5 gates verdes localmente — ou, se algum já estava vermelho antes, a prova de que você não
   piorou o placar (o resumo de cada gate imprime `N passou · N falhou · N pendente`).
4. Na descrição da PR: o que mudou, qual invariante cobre, e o comando que reproduz o número que
   você citou.

A CI (`.github/workflows/gate.yml`) roda os mesmos 5 scripts em `ubuntu-latest`. Ela não instala
nada que o projeto não exija, então alguns checks degradam lá — o próprio workflow diz quais.
