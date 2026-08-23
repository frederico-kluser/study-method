# Fecho — o teste deste documento

## F.1 A pergunta, feita sem rodeio

> **Uma LLM sem este repositório conseguiria reconstruir a skill só com este documento?**

O critério **M1** de §0.2.1 diz que sim. A resposta honesta é **"quase, e o 'quase' tem nome e
endereço"** — e é isso que esta seção entrega, porque um documento honesto sobre os próprios limites
é mais útil que um que se declara completo. Um documento que se declara completo faz a construtora
**inventar** o que falta, em silêncio, com aparência de contrato.

## F.2 O que ela reconstrói fielmente, só com este arquivo

Tudo o que atravessa fronteira entre artefatos está **transcrito**, não resumido:

| Reconstrutível sem consultar nada | Onde está |
|---|---|
| A topologia inteira, a árvore canônica do repositório e do setup, e as três entidades que nunca se confundem | §0.1, §1.1, §1.2 |
| A máquina de estados de 9 passos, com os **dois condicionais** e as guardas literais | §1.3 |
| Os vocabulários controlados **completos** (todo enum, todo pattern de identificador) | §1.4.1, §1.4.2 |
| A tabela de exit codes, as duas exceções nomeadas e os códigos observados do ambiente | §1.5 |
| O protocolo REQUEST/APPLY: os dois envelopes verbatim, `RA-1`…`RA-7`, os dois vocabulários de `kind`, os quatro usuários e seus caminhos degradados | §1.6 |
| A interface de `lib/` função a função (26 funções), e os algoritmos determinísticos das que não podem variar | §1.7, §7.6.1, §7.9, §7.10 |
| Os três schemas de memória, **byte a byte** | §2.9 |
| O algoritmo do digest em 15 passos, a escada de truncamento e todos os casos de borda | §2.5 |
| O protocolo de validação de desafio em 8 passos, com o código de rejeição de cada um | §3.4 |
| O catálogo fixo de 8 operadores de mutação e as três regras de contagem que mudam o denominador | §3.5 |
| A máquina de estados de proficiência: 3 estados, 8 transições, a ordem de avaliação determinística | §4.4 |
| O contrato de `render-plot.py`: CLI, `spec` campo a campo, JSON de stdout, exit codes | §5.3 |
| As regras de conversa, anti-bajulação, analogia, escada de dicas e resposta a erro, **transcritas** | §6.2 a §6.6 |
| A árvore de decisão do bootstrap, folha a folha, e as ≤6 perguntas do dia zero | §6.10 |
| O contrato dos templates, das marcas de corpo e do `runner.sh` gerado | §7.11 a §7.13 |
| A estrutura obrigatória do `SKILL.md` e o que cada gate verifica | §8.4, §8.9 |

Uma construtora que siga a ordem de §0.4 e pare nos 48 marcadores produz um sistema que **passa nos
quatro gates** e cujo comportamento é o descrito aqui. É isso que o critério M1 quer dizer na prática.

## F.3 O que ela **não** reconstrói — e o que buscar no repositório, por quê

Nove coisas. Cada linha diz **o caminho exato** e **por que a paráfrase não serve** — porque
paráfrase de contrato passa a mentir sobre ele (critério **M2**, §0.2.1).

| # | O que falta aqui | Buscar em | Por que não dá para inventar |
|---|---|---|---|
| 1 | **9 dos 12 schemas JSON**, verbatim. Estão aqui só `session`, `index` e `profile` (§2.9); `setup-manifest`, `registry`, `progress`, `progress-event`, `challenge-manifest`, `plot-spec`, `docs-index` e os 4 pares de `requests/` aparecem como **lista de campos e regras**, não byte a byte | `SK/assets/schemas/*.json` | Cada `description` de propriedade **faz parte do contrato** (invariante `G-02`) e é lida em runtime. Reescrevê-las produz um schema que valida os mesmos dados e **instrui o modelo de outro jeito** — a divergência não aparece em teste nenhum |
| 2 | **O texto literal de `PRIV-1`…`PRIV-7` e `SEG-1`…`SEG-8`.** As outras 75 regras estão transcritas (§6.2–§6.6, §6.10.6, §3.15.1, §5.9); estas 15 aparecem citadas por ID e por efeito | `docs/00-contratos.md` §9.3 | São **11 das 11 regras `†`** (não rebaixáveis) mais 4 vizinhas. Uma regra crítica de segurança reescrita "com o mesmo sentido" é exatamente o modo de falha que o marcador `†` existe para impedir |
| 3 | **O corpo do `SKILL.md`**, palavra por palavra | `SK/SKILL.md` | Este documento fixa a **estrutura**, a ordem normativa, o orçamento de linhas e o conteúdo obrigatório de cada seção (§8.4, §8.6, §8.7) — não a prosa. E a prosa é o que o harness carrega |
| 4 | **O conteúdo das 8 `references/`** — em especial `analogy-bank.md` (o banco de analogias com mapeamento e fronteira de cada uma), `languages.md` (a matriz das 19 linguagens, comando de teste e sonda de contagem por linguagem) e `troubleshooting.md` | `SK/references/*.md` | A tabela de roteamento diz **qual abrir em cada passo** (§8.5.1); o que há dentro de cada uma é conteúdo, não contrato de fronteira |
| 5 | **O código-fonte dos 19 scripts** | `SK/scripts/**` | Este documento diz **o que** cada um faz e **como** — algoritmo, entradas, saídas, erros. Colar ~1.000 linhas de bash tornaria o documento não auditável sem torná-lo mais reconstruível (§0.6) |
| 6 | **Os templates byte a byte** e o `MANIFEST.tsv` | `SK/assets/templates/**` | O `MANIFEST.tsv` é a **fonte de verdade** sobre quais placeholders existem (§7.11); e este documento escreve os placeholders com a convenção `«NOME»` de §0.7.5, não com os delimitadores reais |
| 7 | **A pesquisa auditada** — as fontes primárias, com as correções de autoria e de número que a auditoria fez | `docs/research/01`…`06` | É a base factual do racional. Sem ela, a construtora não consegue **verificar** as afirmações de §6.8 ("o que este projeto não afirma"), e uma afirmação derrubada que volta ao texto reprova o gate (`I-43`) |
| 8 | **Os 15 casos de eval** e o `patterns.tsv` | `evals/cases/**` | São o único teste das regras de **comportamento** (`C-*`, `AS-*`, `AN-*`, `ESC-*`): o gate verifica que os IDs existem no `SKILL.md`, não que o tutor os obedece |
| 9 | **As outras 66 entradas do catálogo de decisões** — as 46 de `audience: student` (perguntadas ao aluno em runtime) e as 20 já arbitradas, com a opção recusada nomeada | `SK/assets/decisions.json` | Este documento marca **48**, que são as de quem constrói. As `student` são insumo de `decisions-ask.sh`, e as arbitradas registram **o que foi recusado e por quê** — informação que só existe ali |

Duas ausências a mais, que não são "conteúdo que ficou de fora" e sim **dívida declarada**:

- ⏳ **`tests/spec-conformance.sh` não existe.** É o verificador mecânico documento × disco previsto em
  `docs/build-spec/README.md`. Enquanto ele não existir, a auditoria deste documento contra o
  repositório é **leitura humana** contra os caminhos citados — e é por isso que toda afirmação que
  envelhece está marcada com ⏳ e com o que foi verificado (§0.7.3).
- ⏳ **O racional de cada decisão** — o argumento com bibliografia — vive em `docs/01`…`docs/13` do
  repositório, deliberadamente (§0.6). Este documento diz *o quê* e *como*; aqueles dizem *por quê*.
  Misturá-los faria o contrato ficar longo demais para ser conferido.

## F.4 O veredito, em três linhas

1. **A arquitetura, os contratos, os algoritmos e as regras de comportamento: sim.** Uma LLM
   reconstrói tudo isso só com este arquivo, e o resultado passa nos quatro gates.
2. **Os artefatos de prosa — schemas com `description`, `references/`, corpo do `SKILL.md`,
   templates: não.** Ela precisa buscá-los, e a tabela de §F.3 diz exatamente onde e por quê.
3. **A diferença entre os dois grupos é o que este documento chama de contrato × conteúdo.** Contrato
   é o que atravessa fronteira entre artefatos, e está aqui inteiro. Conteúdo é o que vive dentro de
   um artefato só, e está no repositório — citado **por caminho**, nunca parafraseado.

## F.5 Como saber, a qualquer momento, se este documento ainda diz a verdade

Rode os quatro gates na ordem de §8.15. Eles não verificam este arquivo — verificam **o repositório
que ele descreve** —, e é exatamente por isso que servem: se o gate está verde e este documento
descreve outra coisa, quem está errado é o documento.

⏳ **Estado do repositório quando este documento foi fechado (2026-08-23):** `gate-build`, `gate-lint`
e `smoke` verdes; `validate` com duas pendências declaradas e nomeadas — `I-06b` (`decisions-ask.sh`
está no contrato e ainda não existe em disco) e a higiene da suíte de avaliação (`I-43`, cuja
ocorrência restante é a **lista literal de afirmações proibidas** que o próprio verificador de
`evals/` precisa conter para procurá-las). Nenhuma das duas é divergência entre este documento e o
disco: as duas estão declaradas aqui e no resumo do gate.

