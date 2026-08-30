# Engine de trilhas

A ferramenta que produz e verifica o conteúdo didático. O contrato normativo — princípios, fases,
gates, prompts e proibições — vive em [`docs/16-engine-de-trilha.md`](../../../docs/16-engine-de-trilha.md).
Este arquivo é só o **o que é e como rodar**.

## O problema que ela resolve

Um desafio não pode cobrar o que nenhuma aula ensinou. Hoje o único gate do repositório prova
**forma** (schema válido, solução passa, starter falha) e passa verde numa trilha em que o desafio da
primeira aula exige `function`, parâmetro, `if`, `typeof`, `!==`, `throw`, `new Error`, `return` e
concatenação — numa aula chamada "O que é programação".

A engine transforma essa proibição numa **diferença de conjuntos sobre AST**: cada aula tem um
orçamento cumulativo de construções, e cada superfície de cada desafio é conferida contra ele. Roda
em milissegundos, sem rede e sem chave de API.

## Comandos

```bash
npm run engine -- audit <slug> [opções]
```

| Opção | O que faz |
|---|---|
| `--modo declared\|inferred` | de onde vem o orçamento. Sem a flag: `declared` se alguma aula declara `introduces`, senão `inferred` |
| `--harness receptive-seed\|none` | se o harness de teste (`import`, `export`, `assert.*`) entra no orçamento receptivo da aula 1. Default `receptive-seed` |
| `--limite N` | quantas violações imprimir (`0` = nenhuma, só o placar) |
| `--so-lacunas` | mostra apenas as lacunas de currículo — construção que **nenhuma** aula ensina |
| `--json` | relatório completo em JSON, para outra ferramenta consumir |

Exit codes, na convenção do repositório: **0** sem violação · **1** violações encontradas · **2** uso
incorreto.

`generate` e `repair` — os modos que chamam a LLM — ainda não estão implementados. A ordem de
construção (§14 do documento normativo) põe o gate determinístico primeiro de propósito: ele é o
teste de aceitação de todo o resto.

## Os dois modos de orçamento

**`declared`** — a aula declara o campo aditivo `introduces` no `lesson.json`. É o modo da engine
geradora e o único à prova de fraude: colar a solução dentro da teoria **não** amplia o orçamento.

**`inferred`** — o orçamento é lido do código que a teoria mostra. É o único modo possível sobre
conteúdo legado, que não tem `introduces`, e é deliberadamente **permissivo**: tudo que a teoria
exibe conta como ensinado. Toda violação encontrada em modo inferido é, portanto, um **piso** — o
número real é maior, nunca menor.

## O estado do conteúdo hoje

Reproduza com:

```bash
cd app && npm run engine -- audit nodejs-do-zero --limite 0
```

| Medição | Valor |
|---|---|
| Aulas | 118 |
| Desafios | 118 |
| Desafios com ao menos uma violação | 96 (81%) |
| Violações | 285 |
| Delas, lacunas de currículo (construção que nenhuma aula ensina) | 102 |
| Aulas que não introduzem construção nenhuma | 12 |
| Blocos de código sem tag de linguagem | 68 |
| Blocos marcados como `js` que não parseiam | 4 |

Só as lacunas de currículo:

```bash
cd app && npm run engine -- audit nodejs-do-zero --so-lacunas --limite 30
```

## O histograma

A saída humana termina com a distribuição de construções novas por aula. É o gráfico que denuncia o
defeito de **distribuição** — penhasco na primeira aula, platô no resto — que é o defeito real da
trilha atual, e que nenhum contador de aulas mostra.

## Testes

```bash
cd app && bash tools/t.sh tests/engineBudgetGate.test.ts
```

32 testes, sem rede e sem disco: fixtures de trilha em memória. Os dois que mais importam são
`REPROVA o caso canônico` (a aula 1 cobrando `typeof` e `throw` sem ter ensinado) e
`APROVA uma trilha coerente` — um gate que só reprova é tão inútil quanto um que só aprova.

## Onde o código vive

| Arquivo | Responsabilidade |
|---|---|
| `app/electron/main/engine/atomKeys.ts` | o vocabulário fechado de construções, em seis eixos |
| `app/electron/main/engine/extract.ts` | o extrator determinístico sobre o AST do TypeScript |
| `app/electron/main/engine/theoryCode.ts` | separar código de prosa dentro da teoria |
| `app/electron/main/engine/budget.ts` | derivação do orçamento cumulativo, nas duas faixas |
| `app/electron/main/engine/audit.ts` | a bateria de gates e o relatório de violações |
| `app/tools/track-engine/cli.ts` | a entrada de linha de comando |

Nenhum deles chama LLM. A engine não escreve aula: quem escreve conteúdo é o autor-LLM, nos modos
`generate` e `repair`, recebendo o orçamento congelado como restrição dura. O código aqui produz o
orçamento, verifica o resultado e aponta o defeito.
