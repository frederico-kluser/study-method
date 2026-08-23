# `BUILD_SPEC.md` e as suas fontes

O entregável é **`BUILD_SPEC.md`, na raiz do repositório**: um arquivo único, ~8.200 linhas, que
explica como a skill deve ser construída, em detalhe suficiente para instruir uma LLM. Este
diretório guarda as **fontes** dele.

**Por que um arquivo só.** Foi o pedido do dono do projeto, e há razão técnica: referência aninhada
faz a própria LLM ler pela metade — ela abre o primeiro nível, age com o que leu, e o segundo nível
só é aberto se houver um segundo turno em que alguém se lembre dele. É a mesma razão pela qual a
skill tem um nível só de `references/` (`BUILD_SPEC.md` §8.5).

## As fontes, em duas camadas

| Camada | Onde | O que é |
|---|---|---|
| **Fragmentos** | `NN-*.md` neste diretório | O que cada sub-tarefa da onda 3 entregou sobre **o que acabou de implementar** — quem escreveu o código é quem sabe descrevê-lo sem alucinar. Regra: **contrato, não racional**. |
| **Blocos** | `blocks/*.md` | Os 9 blocos temáticos escritos a partir dos fragmentos, mais a abertura (`_abertura.md`) e o fecho (`_fecho.md`) que costuram o documento. Um bloco = uma Parte. |

| Fragmento | Dono (sub-tarefa) | Cobre |
|---|---|---|
| `10-decisoes.md` | 3.0a/b/c | catálogo de decisões, 3 camadas, protocolo de entrevista |
| `20-skill-md.md` | 3.1 | frontmatter, roteador, regras permanentes |
| `30-lib-setup.md` | 3.3a | `lib/common.sh`, `lib/json.sh`, `setup-init.sh`, `setup-list.sh` |
| `31-sessao-docs.md` | 3.3b | `session-new.sh`, `session-close.sh`, `research-new.sh`, `docs-index.sh` |
| `40-memoria.md` | 3.4a | `memory-index.sh`, `memory-digest.sh`, `memory-compact.sh` |
| `41-progresso-readme.md` | 3.4b | `progress-update.sh`, `readme-sync.sh` |
| `50-sandbox.md` | 3.5a | `lib/sandbox.sh`, `detect-toolchains.sh` |
| `51-challenge-new.md` | 3.5b | `challenge-new.sh`, materialização por `layout_profile` |
| `52-challenge-verify.md` | 3.5c | `challenge-verify.sh`, motor de mutação, REQUEST/APPLY |
| `60-templates.md` | 3.6 | contrato dos templates e placeholders |
| `70-render.md` | 3.7 | `render-plot.py`, spec JSON, 4 saídas |
| `80-gate.md` | 3.8 | `tests/*`, invariantes verificadas |
| `90-researchs.md` | 3.9 | formato do destilado, proveniência |

| Bloco | Vira | Cobre |
|---|---|---|
| `blocks/_abertura.md` | abertura + sumário navegável | o que é o arquivo, o pedido original, por onde começar |
| `blocks/00-intro.md` | **Parte 0** | pedido como critérios de aceitação, as três contradições, ordem de construção, os quatro gates, como ler |
| `blocks/01-arquitetura.md` | **Parte 1** | topologia, árvore canônica, máquina de 9 passos, vocabulários, exit codes, REQUEST/APPLY, interface de `lib/`, registry |
| `blocks/02-memoria.md` | **Parte 2** | as três camadas, memória procedimental, bitemporalidade, digest, compactação, os três schemas verbatim, privacidade |
| `blocks/03-tdd.md` | **Parte 3** | anatomia do desafio, protocolo de validação em 8 passos, catálogo de mutação, armadilhas de falso positivo, sandbox |
| `blocks/04-proficiencia.md` | **Parte 4** | máquina de estados do aluno, sinais, honestidade epistêmica, repetição espaçada, contrato de escrita |
| `blocks/05-viz.md` | **Parte 5** | as 4 saídas obrigatórias, contrato de `render-plot.py`, os 4 bugs do protótipo, acessibilidade |
| `blocks/06-pedagogia.md` | **Parte 6** | `C-*`, `AS-*`, `AN-*`, `ESC-*`, `ERR-*`, `MEM-*`, o que o projeto não afirma, `researchs/`, bootstrap |
| `blocks/07-scripts-templates.md` | **Parte 7** | os 19 scripts, regras de biblioteca, algoritmos determinísticos, contrato dos templates |
| `blocks/08-gate-e-skill.md` | **Parte 8** | `SKILL.md` (frontmatter, corpo, orçamento), os quatro gates, limitações declaradas |
| `blocks/_fecho.md` | fecho | o teste do documento: o que uma LLM reconstrói só com ele, e o que precisa buscar no repositório |

## Como `BUILD_SPEC.md` é produzido a partir dos blocos

Concatenação na ordem `_abertura` → `00` … `08` → `_fecho`, mais três coisas que só existem no
arquivo montado:

1. **O sumário navegável**, derivado dos cabeçalhos `#`/`##` de cada bloco (ignorando o que está
   dentro de bloco de código).
2. **As transições entre partes**, uma linha de citação antes de cada Parte de 1 a 8, dizendo o que
   a anterior fechou e o que a seguinte abre.
3. **O Apêndice A**, gerado de `skills/study-method/assets/decisions.json` filtrando
   `audience ∈ {builder, both}` **e** `status == open` — as mesmas 48 decisões que aparecem como
   marcadores no corpo, agrupadas por momento da construção, com a seção `§` de cada marcador
   resolvida automaticamente.

**Nenhuma substituição textual acontece na montagem.** Os placeholders de template aparecem em
`BUILD_SPEC.md` com os **delimitadores reais** (`{{NOME}}`), iguais aos dos blocos — quem copiar um
template do documento copia a forma que o renderizador reconhece. A convenção anterior, que os
trocava por `«NOME»`, **foi descartada**: ela protegia o gate ensinando a forma errada. O que
sustenta a escolha é a exclusão declarada — `BUILD_SPEC.md` entrou no escopo excluído de `L-03`
(`tests/gate-lint.sh`) e de `G-09` (`tests/validate.sh`) ao lado de `docs/build-spec/**`, com a
mesma justificativa: **documenta a sintaxe, não é artefato materializado**. Os dois gates imprimem
essa exclusão no relatório. Está explicado em `BUILD_SPEC.md` §0.7.5.

## Os 48 marcadores, e a regra de tudo-ou-nada

`BUILD_SPEC.md` carrega **48** marcadores `**PERGUNTE AO USUÁRIO (D-NNN)**`, um por decisão de
`audience ∈ {builder, both}` com `status == open`. A invariante **`G-12d`** de `tests/validate.sh`
verifica isso mecanicamente **sobre `docs/build-spec/`** — por isso os marcadores vivem nos blocos, e
não só no arquivo montado.

⚠ **Marcar pela metade é pior que não marcar**, e o gate reflete isso: com zero marcadores, `G-12d` é
`PEND` ("a passada ainda não começou"); com alguns e não todos, é `FAIL`. Ao acrescentar uma decisão
`builder`/`both` ao catálogo, o marcador dela entra no bloco correspondente **no mesmo commit**.

## Regra de escrita dos fragmentos e dos blocos

**Contrato, não racional.** O que o artefato recebe, o que produz, o algoritmo e as condições de
erro. O porquê vive nos documentos normativos do repositório (`docs/00`…`docs/13`) e é citado **por
caminho**, nunca parafraseado — paráfrase de contrato passa a mentir sobre ele.

✅ **Dívida fechada:** `tests/spec-conformance.sh`, o verificador mecânico documento × disco,
**existe** — é o quinto gate do projeto, com 11 checagens `SC-01`…`SC-08`, descrito em
`docs/12-conformidade.md`. Ele audita o `BUILD_SPEC.md` montado contra o repositório (caminhos
citados, scripts, funções de `lib/`, schemas, decisões, patterns, enums, exit codes e termos
revogados). A leitura humana continua valendo para o que ele não mecaniza — o gate imprime as
próprias limitações no resumo.
