# Qualidade da aula — o que a pedagogia da engine exige

Regras de execução para o `desenhar_grafo` e para a escrita de teoria, quiz e testes. São a
tradução operacional do prompt central do autor (docs/16 §7.1) e das cláusulas de justiça
(docs/16 §9.1). A leitura de fundo é `docs/02-pedagogia.md` do repositório — não precisa ser
relida em runtime.

## 1. A ordem das habilidades, sem exceção

Ler semântica → escrever sintaxe → ler template → escrever template (*read before write;
semantics before templates*). O estágio de template é opcional por construção (regra 1 do autor).
Toda aula inteira segue a mesma ordem: primeiro o aluno lê e prevê, depois escreve.

## 2. A primeira interação é PREVER a saída

O aluno nunca começa num editor em branco: a primeira interação é prever a **saída** de um
programa que não é dele — pergunta o **quê**, jamais o **como**; não conta para nada; e é seguida
da execução que a confronta (regra 2). A posse é monotônica: não é meu → parcialmente meu → meu.

## 3. Trabalho modelado, não produto pronto

O worked example é **orientado a processo**: o código é construído em incrementos que **rodam** —
escreve poucas linhas → roda → mostra a saída ou o **erro real** → lê a mensagem → corrige → roda
de novo (regra 7). As instruções ficam **dentro** do código como comentários, nunca ao lado. Ao
menos **2 worked examples por construção nova**, variando o contexto e mantendo a estrutura.

## 4. Duas formas sintáticas para construção nova

Nunca introduza a construção nova só com o código mais simples imaginável: ela aparece em pelo
menos **duas formas sintaticamente distintas** (argumento como literal **e** como expressão
composta; condição como comparação **e** como booleano pronto — regra 8). Mostrar um caso só faz o
aluno induzir uma regra restrita demais. (E a primeira aparição é sempre a forma mais simples — I9:
`if/else` antes de ternário; mudar a forma de algo já ensinado exige aula própria — I11.)

## 5. Refutação, estado, retrieval e os três slots

- **Refute explicitamente** (regra 9): para cada concepção errada do dossiê, o par errado/certo
  ancorado na spec — tocar num território sem refutar a concepção pode **reforçá-la**.
- **Pergunta de estado** (regra 10): inclua ao menos um item cujo problema seja "qual é o estado
  agora?", não só "qual é a saída?" — é onde moram as concepções erradas.
- **Comece com retrieval** (regra 11): uma pergunta sobre uma aula ancestral declarada.
- **Três slots** (regra 12): teoria (modelo mental, antes e apartada do desafio), referência
  just-in-time (sintaxe e assinatura, colada ao desafio) e drill (opcional). Construção ensinada há
  muitas aulas e não visível **entra** na referência just-in-time.

## 6. O que o desafio provoca — e como escrever teste que discrimina

O desafio não repete: ele **puxa** (A6: `atomos(solutionCode) ∩ introduces.productive ≠ ∅` — o
gate positivo; sem ele a aula pode só repetir o que o aluno já sabia) e **discrimina** (J5: o
código mínimo que passa no teste contém a construção-alvo; e C6: não é resolvível por `return`
constante). O defeito típico, medido na trilha atual (docs/16 §9.1): dos 21 desafios avaliados, em
20 medidos o código mínimo que passa é um único `print("<saída esperada>")` — o teste não derruba
quem não usou a construção em **17 das 20 aulas medidas**, e só 5 dos 34 alvos presentes nas
soluções são forçados pelo teste.

Receita concreta para o teste:

1. **Nunca** aceite resposta que é só um literal impresso/devolvido: o teste assere um valor
   **computado** — a construção-alvo tem de estar no caminho do resultado.
2. A **lacuna única** (A14b) contém no máximo 1 construção nova; `throw new Error(…)` numa linha
   é 3, `let x = 1;` é 1.
3. Com 2+ desafios na aula, o degrau reusa algo do anterior e adiciona ≤1 átomo não demonstrado
   (A15a); a aula N reutiliza ≥1 átomo demonstrado antes (A15b — recuperação espaçada).
4. O **1º desafio** é resolvível com a **1ª seção da teoria** + cumulativo + boilerplate (A16) —
   "demonstrado só na 3ª seção" viola.
5. Cada solução errada catalogada falha em ≥1 teste, e nenhum par de soluções erradas falha no
   mesmo conjunto (J5, parte executável) — escreva o teste de modo que errar A e errar B produzam
   mensagens diferentes.
6. A mensagem de falha diz para onde vai, o que deu e o próximo passo — **escrito dentro do
   orçamento** (J8), zero mensagem dirigida à pessoa.

## 7. O teto do passo (P-MICRO) — e QUEM CONTA cada linha

| Régua | Valor | Quem conta |
|---|---|---|
| Construções produtivas novas por aula | ≤ 2, nunca 3 (regra do par já aplicada) | **gate**: `npm run engine -- barra <slug>`, regra **A17** (erro) |
| Primeira aula do curso | ≤ 1 produtiva nova, e toda chave lida com demonstração própria | **gate**: **A18** (erro) |
| Novas totais (produtivas ∪ receptivas) | ≤ 4, e seções de teoria ≥ max(2, ⌈novas/2⌉) | **gate**: **A21** (erro) |
| Cada chave nova demonstrada em bloco cercado com tag | obrigatório nesta aula | **gate**: **A19** (erro) |
| Duas formas sintáticas por chave produtiva | ≥ 2 ocorrências distintas | **gate**: **A22** (aviso com contagem — não é verde) |
| Elementos novos que **interagem** | ≤ 4; ≤ 2 enquanto o orçamento está quase vazio | leitura (sem gate) |
| Elementos **não** interativos | até ~7 | leitura (sem gate) |
| Tempo de resolução do desafio | ≤ 120 s para quem fez tudo antes | leitura (sem gate) |

**A regra do par é MECÂNICA agora, não prosa.** Declare-a no `lesson.json` e o gate confere:

```jsonc
"introduces": {
  "productive": ["global:print", "node:Call", "node:StrLiteral"],
  "derived": [
    { "chave": "node:Call", "de": "global:print" },
    { "chave": "node:StrLiteral", "de": "global:print" }
  ]
}
```

**A23** só aceita a derivada quando (i) a chave e o pai estão os DOIS em `introduces.productive`,
(ii) não há cadeia de derivadas e (iii) existe uma **LINHA de um bloco de código desta aula em que os
dois ocorrem juntos** — é o que "a mesma construção produz inevitavelmente" quer dizer
(`print("bom dia")` emite as três na mesma linha). Sem co-ocorrência é erro e a chave conta **cheia**
em A17/A21. Ampliar `introduces` para calar o gate é o defeito com outro nome (P-AUTO).

Os quatro testes de atomicidade, todos obrigatórios: **demonstrável** (cabe num worked example
completo), **exercitável** (cabe num completion problem com uma lacuna cujo span contém o
átomo-alvo), **orçamentável** (o `element_count` soma no teto), **cronometrável** (o desafio cabe
em 120 s). "Variáveis" falha nos quatro e não é átomo; vira `let` + atribuição, reatribuição,
`const`, escopo, nomenclatura. Número de aulas é **saída, não entrada** — sem teto global.
Composição ("`if` dentro de função com `return` em cada ramo") é nó próprio com aula própria,
marcada `role: "integration"` (A9: profundidade de composição > 1 exige nó declarado).

## 8. Formato segue o tipo de conhecimento

Fato → enunciado direto e drill, **não explique**; categoria/conceito → exemplos contrastantes
positivos e negativos, deixe induzir; regra/habilidade → worked example e prática; princípio →
explicação com rationale obrigatória; integrativo → explicação obrigatória, exemplo sozinho não
basta (regra 4). E a interatividade inverte a receita (regra 5): elementos que só fazem sentido
juntos (`for` com condição, incremento e corpo) exigem worked example antes do primeiro desafio;
elementos aprendíveis isoladamente (nomes de tipos, métodos de array, o que é `NaN`) tornam
worked example completo um **defeito** — deixe o aluno gerar e receber feedback.

## 9. Onda semântica e limites

- Toda explicação percorre a onda completa: nomeie o termo → desempacote (palavra comum, analogia
  concreta) → **reempacote dentro do código**, mostrando a analogia aplicada linha a linha → diga
  **onde a analogia quebra** (regra 6). Só termo é *flatlining* alto; só analogia é *flatlining*
  baixo.
- **Orçamento é lei** (regra 3): construção fora das listas é proibida em qualquer lugar; se você
  acha que precisa de algo fora do orçamento, **isso é defeito do grafo, não licença** — devolva o
  que falta ao grafo e pare; não improvise, não ensine pré-requisito de passagem, não "explique
  rapidinho".
- Não re-explique com andaime de novato o que já está consolidado no orçamento — é reversão de
  expertise e tem a **mesma severidade** que cobrar fora do orçamento (regra 14).
- Entregue o escopo pedido e pare (regra 15); nada de `obj[expr]` com chave não-literal nem alias
  de função (regra 16); termo novo fora da lista é lacuna de currículo, não licença (regra 17).
- Fim de autoria: **checksum** — repita a lista de construções permitidas e confira (regra 18);
  o prompt termina pedindo isso porque a máquina compara.

## 10. O veredito

Nenhuma aula sai por leitura: a sequência é `audit` 0 violações → `barra` 0 erros (A17–A24) →
`coverage` 0 lacunas → `requirements` em bijeção → `track:validate` ok → `convergir` em **PONTO-FIXO**
(comandos em `validacao.md`; o laço em `recursao.md`). Se o gate reprova, o defeito é do conteúdo ou do
grafo — nunca do gate. E quando o defeito é o **tamanho do passo** (A17/A18/A21), a ação prescrita não é
argumentar: é **quebrar a aula** pelo procedimento de `recursao.md` §6 — o excedente é aula própria.

## 11. As invariantes I1–I17 fora do pipeline — quem roda e o contador de bolso

⚑ **A promessa que esta referência fazia era falsa.** "O grafo roda nas invariantes I1–I17 antes de
existir prosa" vale **dentro** do pipeline `generate`: **I1–I11** moram em `engine/graph/invariants.ts` e
o único chamador de `checkInvariants` é `engine/phases/f3Graph.ts:843` — fase F3, que exige chave de API
(`grep -rn "graph/invariants" --include='*.ts' electron tools` devolve 1 importador). **I12/I14–I17**
rodam no `audit` (`engine/audit.ts:60`, `type StructureRule = 'I12' | 'I14' | 'I15' | 'I16' | 'I17'`) e
**I13 não roda em lugar nenhum** (`grep -rn "I13" --include='*.ts' electron tools` → vazio; o contrato a
declara em docs/16 §5.2). Autoria manual, fora do `generate`, tem estes substitutos — e três invariantes
sem substituto nenhum, o que é declarado, nunca prometido:

| # | Exige | Quem roda hoje | Contador de bolso (offline, de `app/`) |
|---|---|---|---|
| I1 | DAG e todo referenciado existe | F3 (com chave) | `comm -13 <(jq -r '.slug' resources/tracks/<slug>/modules/*/lessons/*/lesson.json \| sort -u) <(jq -r '.prerequisites[]?' resources/tracks/<slug>/modules/*/lessons/*/lesson.json \| sort -u) \| wc -l` → medido **0** em `rust-iniciante` |
| I2 | ≤2 produtivas por aula | **`barra` A17** (exato, com colapso) | `npm run engine -- barra <slug>` |
| I3 | unicidade de origem | F3 (com chave) | `jq -r '[.introduces.productive[]?]\|unique\|.[]' resources/tracks/<slug>/modules/*/lessons/*/lesson.json \| sort \| uniq -d \| wc -l` → **21** em python, **36** em rust. **Não é 0 no curso bom**: consolidação re-declara o `targetAtom` (`jq -r '.role // "regular"' … \| sort \| uniq -c` → 34 `consolidation` em python). É SINAL, não gate |
| I4 | origem existe e vem antes | **`audit` A1–A4 + `primeiraAulaQueEnsina`** (exato) | `npm run engine -- audit <slug> --limite 0` |
| I5 | demonstrada na própria aula | **`barra` A19** (exato para o declarado) | `npm run engine -- barra <slug>` |
| I6 | exigida no desafio da própria aula | **`audit` A6** (exato) | `npm run engine -- audit <slug> --limite 0` |
| I7 | reaparece em ≥3 artefatos posteriores | ninguém | `grep -rlF '<token>' resources/tracks/<slug>/modules/*/lessons/*/challenges/*/challenge.json \| wc -l` → medido **12** para `for ` em rust. Não confere posterioridade nem faixa |
| I8 | sem 3 aulas consecutivas da mesma família | ninguém | **sem substituto**: "família sintática" é resolvida pelo adaptador dentro do run. O que existe é o HISTOGRAMA em ordem de orçamento do `npm run engine -- barra <slug>` — olhar é humano |
| I9 | 1ª aparição é a forma mais simples | ninguém | **sem substituto** |
| I10 | ≥1 desafio resolvível com o orçamento vigente | **`coverage` (LACUNA) + `barra` A20** | `npm run engine -- coverage <slug>` · `barra <slug>` |
| I11 | mudar a forma exige aula dedicada | só dentro do `reorder`, e só quando há movimento a verificar | **sem substituto** |
| I12 · I14 · I15 · I16 · I17 | slug único · `order` único · `theory[].id` único · conceito do desafio na aula · `files[].path` não reservado | **`audit`** (roda) | `npm run engine -- audit <slug> --limite 0` |
| I13 | `slug === basename(dir)` | **ninguém** | `for d in resources/tracks/<slug>/modules/*/lessons/*/; do [ "$(jq -r .slug "$d/lesson.json")" = "$(basename "$d")" ] \|\| echo "$d"; done` |

Regra de execução: I8, I9, I11 e I13 entram na **lista de limitações declaradas** da sua entrega
(`recursao.md` §5, o campo `limitacoesDeclaradas` do ledger). Limitação declarada é honestidade; o mesmo
buraco **não declarado** é aprovação por omissão (P-NAO-MEDIDO).
