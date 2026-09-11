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

## 7. O teto do passo (P-MICRO)

| Régua | Valor |
|---|---|
| Construções produtivas novas por aula | ≤ 2, nunca 3 (contadas pela regra do par) |
| Elementos novos que **interagem** | ≤ 4; ≤ 2 enquanto o orçamento está quase vazio |
| Elementos **não** interativos | até ~7 |
| Tempo de resolução do desafio | ≤ 120 s para quem fez tudo antes |

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

Nenhuma aula sai por leitura: a sequência é `audit` 0 violações → `coverage` 0 lacunas →
`requirements` em bijeção → `track:validate` ok (comandos em `validacao.md`). Se o gate reprova,
o defeito é do conteúdo ou do grafo — nunca do gate.