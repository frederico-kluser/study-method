# Análise semântica — aula `let-e-atribuicao` (auditoria do feedback do usuário)

> **Tipo:** auditoria semântica (USADO × ENSINADO) — sub-agente de análise, worktree
> `a1-semantica-aula` (branch `do/study-method/20260831-001523-66870/a1-semantica-aula`).
> **Base lida (read-only):** `main` @ `4803f5e`.
> **Ferramenta:** extrator determinístico real da engine (`app/electron/main/engine/extract.ts`,
> `extractAtoms`), executado via `tsx` (node_modules da worktree) sobre cada superfície; leitura
> integral da prosa da teoria. **Zero chamadas de LLM para medição.**
> **Artefatos auditados:** `trilha/modules/fundamentos-js/lessons/let-e-atribuicao/lesson.json`
> (teoria), `…/challenges/contador-com-let/challenge.json` (atividade), e os drafts
> `lesson-draft.json` / `challenge-draft.json` (conteúdo idêntico ao materializado — diferença só de
> formato de campo).

---

## 1. O feedback do usuário, em uma frase

> «logo na primeira atividade fala de chamar a função, sem nem explicar o que é isso; já pressupõe
> que a pessoa sabe o que é um parâmetro»

**Veredito medido: o usuário está certo no substantivo, e a violação é a mais severa possível — ela
atinge a PRIMEIRA interação da aula, antes de qualquer ensino.** «Chamar a função» (CallExpression) é
usado e **nunca ensinado**, e a predição exigida na primeira atividade («o que `x()` devolve?»)
demanda modelo mental que a aula não entrega. Quanto a «parâmetro»: a palavra **não ocorre** em
nenhum texto voltado ao aluno, mas a **mecânica de parâmetros/argumentos está codificada no código
da primeira atividade** (`assert.equal(x(), 1)` chama `assert.equal` com **dois argumentos**, um dos
quais é outra chamada `x()`; `test('a previsão', () => {…})` passa uma **função como argumento**).
Ou seja: para ler a primeira atividade o aluno precisa saber o que são argumentos/parâmetros, mesmo
sem a palavra aparecer. Detalhamento com spans na §7.

---

## 2. Método e régua

- **Medido com o extrator real** (`extractAtoms`) sobre as 4 superfícies: `starterCode`,
  `testsCode`, `solutionCode` (atividade) e os 2 blocos ```js da primeira seção da teoria
  (`predicao`). Cada superfície emite seu conjunto de chaves de átomo (eixos `node:`, `decl:`, `op:`,
  `api:`, `global:`, `form:`); o cruzamento com os budgets do contrato (`contrato.json`) mostra que
  **nenhuma superfície viola o budget** — o problema não é de gate, é de currículo.
- **Grade U/E/A** (régua estrita): só conta como **E** (ensinado) o que tem **prosa didática
  explícita** (definição/analogia/explicação), nunca a mera aparição num bloco ```js. **U** = usado
  sem prosa didática. **A** = axioma legítimo. **Para iniciante absoluto, o conjunto de axiomas
  legítimos é VAZIO** (§6) — logo toda construção usada-e-não-ensinada é violação (U), com gradação
  de severidade na §8.
- A coluna «ensinado?» usa três níveis: **não** / **parcial** (há gloss ou menção que carrega parte
  do sentido, mas não explica a construção) / **sim**.

**Observação de método:** as 3 violações A2 do audit derivado (nós-envelope da declaração, limite de
engine documentado no contrato) **não** são o objeto desta auditoria. O objeto é o descompasso
semântico construção-usada × construção-ensinada, que os checks determinísticos (9/9 verdes) **não
medem**: nenhuma das 18 regras do §7.1 verifica «o aluno consegue entender a predição da aula 1 sem
conhecer a seed». O revisor humano (Fase 2) também não apontou isso — ver §9.

---

## 3. Inventário por superfície (medido, extrator real)

### 3.1 `starterCode` (challenge.json:9) — linhas 1–5

```
L1: export function iniciar() {
L2:   // LACUNA: declare a variável `contador` com `let`, com um valor inicial
L3:   contador = 5;
L4:   return contador;
L5: }
```

Atoms emitidos: `node:BinaryExpression`, `node:Block`, `node:EndOfFileToken`, `node:ExportKeyword`,
`node:ExpressionStatement`, `node:FunctionDeclaration`, `node:Identifier`, `node:NumericLiteral`,
`node:ReturnStatement`, `op:assign:=`. → **0 fora do `budget_receptivo`** (o gate passa).

### 3.2 `testsCode` (challenge.json:10) — linhas 1–8

```
L1: import { test } from 'node:test';
L2: import assert from 'node:assert/strict';
L3: import { iniciar } from './solution.mjs';
L5: test('declara com let; a atribuição decide o valor final', () => {
L6:   assert.equal(iniciar(), 5);
L7: });
```

Atoms emitidos: `api:assert.equal`, `api:node:assert/strict`, `api:node:test`, `node:ArrowFunction`,
`node:Block`, `node:CallExpression` (2×: L5 e L6), `node:ExpressionStatement`, `node:Identifier`,
`node:ImportClause`, `node:ImportDeclaration` (3×: L1–L3), `node:ImportSpecifier`,
`node:NamedImports`, `node:NumericLiteral`, `node:PropertyAccessExpression`, `node:StringLiteral`.
→ **0 fora do `budget_teste`** (gate passa).

### 3.3 `solutionCode` (challenge.json:11) — linhas 1–5

```
L1: export function iniciar() {
L2:   let contador = 0;
L3:   contador = 5;
L4:   return contador;
L5: }
```

Atoms emitidos: os mesmos do starter **+** `decl:let`, `node:VariableDeclaration`,
`node:VariableDeclarationList`, `node:VariableStatement` (as 3 A2 conhecidas). → **0 fora do
`budget_produtivo`** (gate passa, com o limite de engine já documentado).

### 3.4 `predicao` — bloco-função (lesson.json:15), linhas 1–3

```
L1: export function x() {
L2:   return 1;
L3: }
```

Atoms: `node:Block`, `node:EndOfFileToken`, `node:ExportKeyword`, `node:FunctionDeclaration`,
`node:Identifier`, `node:NumericLiteral`, `node:ReturnStatement`.

### 3.5 `predicao` — bloco-teste (lesson.json:15), linhas 1–7

```
L1: import { test } from 'node:test';
L2: import assert from 'node:assert/strict';
L3: import { x } from './solution.mjs';
L5: test('a previsão', () => {
L6:   assert.equal(x(), 1);
L7: });
```

Atoms: idênticos ao `testsCode` (§3.2), com `assert.equal(x(), 1)` na L6.

**Constatação estrutural importante (medida):** em NENHUMA superfície existe nó `node:Parameter` —
todas as funções e arrows são de zero parâmetros. O pré-suposto de «parâmetro» não vem de um
parâmetro declarado: vem da **sintaxe de chamada** e dos **argumentos das chamadas** (`assert.equal`
recebe 2 argumentos; `test` recebe 2 argumentos, sendo um uma arrow-function; `x()` usa os
parênteses de chamada).

---

## 4. Tabela principal — construção × onde aparece × usado-para-quê × ensinado?

Legenda U/E/A: **U** = usado e não ensinado (violação do feedback; «parcial» conta como U leve) ·
**E** = ensinado · **A** = axioma legítimo (para iniciante absoluto: **nenhum**, §6).

| # | Construção (chaves de átomo) | Onde aparece (evidência) | Usado para quê | Ensinado? (evidência na teoria) | U/E/A |
|---|---|---|---|---|---|
| 1 | **Função** — `node:FunctionDeclaration` + `node:Block` (`function`, nome, `{ }`) | Todas as superfícies + todos os 15 blocos da teoria. Primeira aparição: predicao bloco-função L1 | A moldura que o harness «lê»; o corpo `{ }` emoldura tudo | **não** — a prosa diz «Esta é a função que o harness vai ler» e «as funções que você exporta» (predicao), mas nunca define o que é uma função nem o `{ }` | **U** |
| 2 | **Export** — `node:ExportKeyword` | Todas as superfícies + teoria (predicao L1; blocos de exemplo) | Tornar a função visível para o harness | **não** — «as funções que você exporta» (predicao) pressupõe o conceito | **U** |
| 3 | **Chamada de função** — `node:CallExpression` (`x()`, `iniciar()`, `assert.equal(…)`, `test(…)`) | predicao bloco-teste L5–L6; testsCode L5–L6; prosa «as chama» (predicao); challenge.json:8 «quando o teste chamar `iniciar()`» | «Chamar» é a interação central de toda a trilha: o harness chama, o teste chama, o aluno prevê | **não** — verbo «chama/chamar» usado sem nenhuma explicação | **U** ⚠ |
| 4 | **Parâmetro/argumento** — mecânica dos parênteses e argumentos (sem nó Parameter) | predicao bloco-teste L5–L6; testsCode L5–L6 | `assert.equal(x(), 1)`: chamada com **2 argumentos**, um deles outra chamada; `test('…', () => {…})`: função como argumento; `x()`: parênteses de chamada | **não** — a palavra «parâmetro» não ocorre em NENHUM texto do aluno; a mecânica existe só no código | **U** ⚠ |
| 5 | **Return / valor de retorno** — `node:ReturnStatement` | Todas as superfícies + todos os blocos de exemplo; prosa «devolve…» | Entregar o valor que o teste compara («o que `x()` devolve?») | **parcial** — gloss recorrente «devolve» / «ler-valor: devolver o nome devolve o valor preso agora» (modelo-mental, lesson.json:20) e «a linha 3 **lê** o valor atual e o devolve»; nunca explica a construção `return` nem o papel do valor de retorno | **U** (leve) |
| 6 | **Instrução** — `node:ExpressionStatement` | starter L3/L4; solution L2–L4; todos os blocos | «Uma linha que roda» — o corpo da função é uma sequência de instruções | **não** — o conceito «instrução» não é ensinado em lugar nenhum | **U** |
| 7 | **Comentário** — `//` | starter L2 (a **LACUNA é um comentário**); todos os blocos (instruções didáticas dentro do código) | Marcador da lacuna; canal das instruções didáticas (R7) | **não** — nunca se diz que `//` é ignorado pelo computador; o desafio depende de o aluno tratar o comentário como «a lacuna» | **U** |
| 8 | **Import / módulo** — `node:ImportDeclaration` + `ImportClause`/`NamedImports`/`ImportSpecifier` + `api:node:test`, `api:node:assert/strict` | predicao bloco-teste L1–L3; testsCode L1–L3 | Puxar `test`, `assert` e a solução do aluno | **não** — prosa «ele as importa» (predicao) pressupõe o conceito | **U** |
| 9 | **test() / node:test** — `api:node:test`, `global:test`, chamada `test(…)` | predicao bloco-teste L5; testsCode L5 | Definir o que o harness roda e julga | **não** — «E este é o teste que ele roda sobre ela» (predicao); «o teste roda/passa/falha»; o que É um teste nunca é explicado | **U** |
| 10 | **Arrow-function callback** — `node:ArrowFunction` (`() => {…}`) | predicao bloco-teste L5; testsCode L5 | Função passada como argumento do `test` | **não** | **U** |
| 11 | **Caminho de arquivo** — `'./solution.mjs'` | predicao bloco-teste L3; testsCode L3 | A noção de «arquivo do aluno importado pelo teste» | **não** | **U** |
| 12 | **assert.equal / comparação com valor esperado** — `api:assert.equal` + `node:PropertyAccessExpression` | predicao bloco-teste L6; testsCode L6; prosa dos worked examples («o teste `assert.equal(placar(), 0)` passa») | Comparar o valor devolvido com o esperado — o eixo inteiro de verificação | **parcial** — prosa da predicao: «o teste compara o que a função devolve com um valor fixo» e «O `assert.equal(x(), 1)` está comparando o quê?» — glosa o **papel**, não a construção (o que é `assert`, o que é o método, a sintaxe) | **U** (leve) |
| 13 | **Literal numérico** — `node:NumericLiteral` | starter L3 (`5`); solution L2/L3 (`0`, `5`); testes L6 (`5`); predicao L2 (`1`) | Escrever/ler valores numéricos | **parcial** — o conceito «valor» é ensinado; «qualquer número vale» (challenge.json:8) usa o número; a escrita de literal como construção é pressuposta | **U** (leve) |
| 14 | **Literal de string** — `node:StringLiteral` | testes L1/L2/L5; exemplo-string; referência | Texto como valor; caminhos de módulo | **sim** — «texto entre aspas é um valor, e `let` declara a variável do mesmo jeito» (exemplo-string, lesson.json:30) | **E** |
| 15 | **Variável / nome** — `node:Identifier` | Todas as superfícies | Nome da etiqueta; nomes de função | **sim** — modelo-mental: «um nome dentro do programa que guarda um valor por vez» + analogia da etiqueta (lesson.json:20) | **E** |
| 16 | **Declarar** — `decl:let` + `node:VariableStatement/VariableDeclaration/VariableDeclarationList` | solution L2; modelo-mental; WEs; referência; refutações; drill | Criar a variável com valor inicial | **sim** — prosa didática completa (modelo-mental + WEs incrementais + referência com as duas formas sintáticas) | **E** |
| 17 | **Atribuir** — `op:assign:=` + `node:BinaryExpression` | starter L3; solution L3; teoria inteira | Trocar o valor guardado (o eixo do átomo receptivo) | **sim** — analogia da etiqueta + WEs + 3 refutações com âncora na spec | **E** |
| 18 | **Ler-valor** — uso do nome como expressão | modelo-mental; WEs; drill | Usar o nome onde um valor é esperado | **sim** — «usar o nome em um lugar onde um valor é esperado é **ler** o valor» + perguntas «qual é o estado agora?» | **E** |
| 19 | **Termo «harness»** | predicao prosa (lesson.json:15) | Nome do sistema que testa | **não** — termo de produto vazando para o aluno, nunca definido | **U** |
| 20 | **Termos «módulo»/«módulos» + «strict mode»** | refutacoes 3 (lesson.json:35) | Explicar o ReferenceError de atribuir sem declarar | **não** — «o código roda como módulo e módulos rodam em strict mode» pressupõe ambos | **U** |
| 21 | **Termos «ReferenceError» / «SyntaxError»** | refutacoes 2 e 3 (lesson.json:35) | Nomear os erros citados | **não** — citados sem explicação (o contrato, aliás, veda cenário de erro A11) | **U** |
| 22 | **Conceito «valor»** | modelo-mental; WEs | O que a variável guarda | **sim** | **E** |

**Resumo da régua estrita:** E = 6 · U = 16 (13 fortes + 3 leves/parciais — return, assert.equal,
literal numérico) · **A = 0**.

---

## 5. A cadeia de pré-supostos da primeira atividade (o que o aluno teria de JÁ SABER)

Para a primeira atividade (predicao → desafio `contador-com-let`) funcionar, o iniciante absoluto
precisaria saber, nesta ordem de fundação:

| # | Pré-suposto | Onde aparece (evidência literal) |
|---|---|---|
| P1 | Que um programa é um **texto que alguém executa e que produz um resultado** | predicao, lesson.json:15 — «Antes de escrever qualquer coisa nesta trilha, uma leitura»; «sem rodar nada» (a noção de «rodar» é pressuposta) |
| P2 | Que **função** é um pedaço nomeado de programa que devolve um valor | predicao — «as funções que você exporta… o que cada uma **devolve**»; «Esta é a função que o harness vai ler»; bloco-função L1 |
| P3 | Que **chamar** uma função (nome + parênteses) a executa e entrega o valor | predicao — «ele as importa, **as chama**…»; pergunta «o que `x()` devolve?»; challenge.json:8 — «quando o teste **chamar** `iniciar()`» |
| P4 | Que uma função recebe **valores entre os parênteses** (parâmetro/argumento) | predicao bloco-teste L6 — `assert.equal(x(), 1)` (2 argumentos; um é outra chamada); L5 — `test('a previsão', () => {…})` (função como argumento); `x()` (parênteses de chamada) |
| P5 | Que **`return`** encerra devolvendo um valor | predicao bloco-função L2 — `return 1;`; starter L4; challenge.json:8 — «`return contador;` — devolve o que está guardado» |
| P6 | Que **`export`** torna a função visível a quem importa | predicao bloco-função L1; starter L1 |
| P7 | Que um **teste** roda a função e compara o devolvido com um **valor esperado** («passa/falha») | predicao — «este é o teste que ele roda sobre ela»; «o teste passa ou falha?»; bloco-teste L5–L6 |
| P8 | Que **`import … from …`** puxa código de outro lugar (módulo/arquivo) | predicao bloco-teste L1–L3; testsCode L1–L3 |
| P9 | Que um **comentário `//`** é ignorado pelo computador | starter L2 — a lacuna É um comentário; todos os blocos com rótulos `// declarar/…` |
| P10 | Que uma **instrução** é uma linha que roda (e que as linhas rodam em ordem) | starter L3/L4; solution L2–L4 |
| P11 | Que **`{ }`** delimita o corpo da função | starter L1/L5; solution L1/L5 |
| P12 | Que um **número escrito no código é um valor** comparável | starter L3 (`5`); testsCode L6 (`5`); predicao bloco-função L2 (`1`) |
| P13 | O vocabulário do produto: **harness**, **módulo**, **strict mode**, **ReferenceError**, **SyntaxError** | predicao (harness); refutacoes 2–3 (módulo/strict/erros) |

**P2→P7 é o núcleo do feedback:** a predicao não apenas expõe a função/chamada/return — ela
**interroga** o modelo mental do aluno sobre eles («quando o teste roda, o que `x()` devolve? O
`assert.equal(x(), 1)` está comparando o quê?») **antes de qualquer explicação**, e ainda afirma uma
posse que o público-alvo não tem: *«Esse formato já é seu — ele aparece em toda tarefa»* (predicao,
lesson.json:15). Para quem nunca viu uma função, nenhuma das três perguntas tem resposta possível —
não por falta de capacidade, mas porque o modelo mental que as responderia é exatamente o que a aula
deveria construir e não constrói.

---

## 6. Axiomas: por que o conjunto legítimo é VAZIO para iniciante absoluto

O design desta aula **tentou** axiomizar três grupos, e os três falham para o público-alvo:

1. **Envelope `export function` como `frozenRegion`** (contrato: «são leitura herdada do harness»;
   docs §3.2). Um axioma de *forma* serviria se a aula dissesse «esta moldura é fixa; você ainda não
   precisa entender cada peça». Em vez disso, a predicao **exige predição semântica** sobre a moldura
   (P2/P3/P5). **Axioma interrogado no primeiro exercício não é axioma — é dívida didática.**
2. **Seed do harness** (`import`, `node:test`, `assert.equal`, arrow — política `receptive-seed`,
   §3.2). A política transforma «o aluno lê antes de aprender» em «o aluno entende antes de
   aprender». Para quem já programa, a seed é leitura; para o iniciante absoluto, é a primeira
   parede de código da vida dele — sem enunciado que a decodifique.
3. **A «ordinariedade» de nomes e números** (identificadores, literais). Nomes de variável são
   ensinados (etiqueta); números como valores são o pior tipo de pressuposto: parecem óbvios *para
   quem escreveu a aula*.

Conclusão da régua: **A = 0 construção**. Todo o resto que a primeira atividade exige entender é
conteúdo que precisa de aula própria (ou de declaração explícita de andaime sem interrogação).

---

## 7. Resposta literal ao feedback do usuário

**«Fala de chamar a função» — confirmado, na primeira seção da teoria (predicao).** Onde exatamente:

- lesson.json:15 (e lesson-draft.json:40), prosa: *«O harness testa as funções que você exporta: ele
  as importa, **as chama** e compara o que cada uma **devolve** com um valor esperado.»* — três
  verbos (importar, chamar, devolver) que definem a mecânica inteira da trilha, nenhum explicado.
- lesson.json:15, bloco 1, L1–L2: `export function x() { return 1; }` — apresentado como «a função que
  o harness vai ler», sem definir função/export/return.
- lesson.json:15, bloco 2, L5–L6: `test('a previsão', () => { assert.equal(x(), 1); });` — sem
  definir teste, arrow, assert.
- lesson.json:15, perguntas da predicao: *«quando o teste roda, o que `x()` devolve? O
  `assert.equal(x(), 1)` está comparando o quê? O teste passa ou falha?»*
- challenge.json:8 (statement do desafio): *«quando o teste **chamar** `iniciar()`, que valor a
  função devolve?»* e *«`return contador;` — **devolve** o que está guardado na variável»* — a
  tarefa que o aluno vai executar repete os mesmos termos não ensinados.

**«Já pressupõe que a pessoa sabe o que é um parâmetro» — confirmado na forma estrutural, não
textual.** A palavra «parâmetro»/«argumento» **não aparece** em nenhum texto do aluno (verificado por
grep em todos os artefatos). Mas a mecânica está no código desde a primeira linha da atividade:
`assert.equal(x(), 1)` requer entender que `equal` aceita **dois valores** (o real e o esperado),
`soma` de dois números seria função com parâmetros… e `test('a previsão', () => {…})` requer
entender uma função passada **como argumento** de outra. A percepção do usuário está correta no que
importa: para ler a primeira atividade, o aluno precisa do conceito de parâmetro/argumento —
pressuposto como se já fosse dele, quando nunca foi ensinado nem mencionado.

---

## 8. Violações ordenadas por severidade (o que quebra a experiência do iniciante absoluto primeiro)

| Sev. | Violação | Por que quebra primeiro | Evidência |
|---|---|---|---|
| **S1** | Presumir **função + chamada + return** na primeira interação, com pergunta de **predição semântica** sobre eles | A aula 1 abre pedindo previsão («o que `x()` devolve?») sobre construções cujo modelo mental nunca foi entregue, e ainda afirma posse falsa («Esse formato já é seu»). O aluno não tem NADA com que prever: a primeira tarefa da trilha é impossível por princípio. | §5 P2/P3/P5; §7 |
| **S2** | Presumir o **aparato inteiro do teste** como leitura (import, node:test, assert.equal, arrow, `./solution.mjs`) | É o mesmo primeiro bloco da predicao; sem entender o teste, o enunciado nem é legível. | §5 P4/P7/P8; §7 |
| **S3** | Exigir o vocabulário de **função/chamar/devolver** no **statement do desafio de avaliação** | A tarefa que o aluno VAI executar («quando o teste chamar iniciar()») depende dos mesmos conceitos não ensinados — o desafio avalia a lacuna de let, mas cobra leitura de toda a moldura. | challenge.json:8 |
| **S4** | Presumir **instrução, `{}`, comentário e `export`** como ruído transparente no starter | Para preencher a lacuna o aluno precisa identificar (a) o comentário como lacuna, (b) as linhas que «não se mexem», (c) que `contador = 5;` é uma linha que roda. Três mini-conceitos não ensinados dentro da tarefa. | starter L1–L5 |
| **S5** | Usar **módulo / strict mode / ReferenceError / SyntaxError** nas refutações | Carga conceitual tardia (depois dos WEs), mas ainda assim: a refutação de «atribuir sem declarar» explica o erro com dois termos não ensinados. | refutacoes, lesson.json:35 |
| **S6** | Gloss insuficiente de **return («devolve»)**, **assert.equal (papel do comparar)** e **literal numérico** | Há prosa que carrega parte do sentido, mas nenhuma explica a construção — o aluno decora a palavra, não o mecanismo. | §4 linhas 5, 12, 13 |

---

## 9. Por que a validação determinística não pegou isso (contexto)

A validação da aula passou **9/9** checagens e **18/18** regras do autor (§7.1; relatorio-validacao.md;
revisao-drafts.md), inclusive R2/R11 — que **mandam** a aula 1 abrir com a predição do harness
`export function x() { return 1; }` (substituto do retrieval quando não há aula ancestral). O defeito
apontado pelo usuário está **fora do alcance do gate**: nenhuma das 18 regras verifica se a predição
exige modelo mental de construção da seed. R1 («ler antes de escrever») é satisfeita — mas «ler»,
aqui, foi interpretado como «olhar», não como «entender»: a predicao pede **predição** (que exige
modelo mental) sobre **leitura** de seed. Recomendação de régua para a engine (não implementada —
registro apenas): *«predição semântica só sobre construções com aula ancestral, ou sobre andaime
explicitamente declarado como tal, sem interrogação»*.

---

## 10. Recomendações de quebra micro — sequência de aulas que evita cada pré-suposto

Princípios do desenho: (a) cada aula = **1 incremento mínimo** (1 construção nova por vez, na ordem
«ler semântica → escrever sintaxe»); (b) a moldura `export function … { }` permanece **congelada no
starter**, mas é **declarada como andaime** («estas peças ainda não são desta aula; você escreve
nelas mais adiante») — nunca mais um andaime **interrogado**; (c) **parâmetro chega só depois de
função e chamada** (correção direta do feedback); (d) a aula atual (`let-e-atribuicao`) passa a ser
**θ**, quando toda a cadeia já é ancestral — e aí a predicao vira retrieval legítimo (R11 real).

| Aula | Incremento mínimo (o que ensina) | Pré-suposto eliminado | Formato da atividade |
|---|---|---|---|
| **α** — «Um valor» | Literal numérico e conceito de **valor** («um número escrito no código é um valor») | P12, base de P1 | Moldura congelada; lacuna única = o número dentro de `return __;`; teste espera o literal |
| **β** — «Instrução» | O que é **uma linha que roda**; ordem de cima para baixo; `{ }` como corpo; noção mínima de **`return`** («devolve o valor e encerra») | P5, P10, P11 | Prever a ordem de execução; preencher a única linha restante |
| **β2** — «O veredito» | Como **ver o resultado**: o teste «passa/falha» é o canal de observação (ou, se aprovado em produto: `console.log` como saída — exige liberar `global:console` no orçamento) | P7 (parcial), transforma o oráculo em instrumento | Prever passa/falha; ajustar o literal até passar |
| **γ** — «Função e chamada» | O que é uma **função** (pedaço nomeado de programa) e o que é **chamar** (nome + `()` executa e devolve o valor) | **P2, P3** — o núcleo do feedback | Escrever a chamada (`x()`) e/ou o corpo da função |
| **δ** — «Export» | O que é **`export`** (entregar a função a quem testa) | P6 | Adicionar/quitar `export`; a moldura vira posse do aluno |
| **ε** — «Parâmetro e argumento» — **lá na frente** | Função **com parâmetro**; chamada **com argumentos** (`soma(2, 3)`) | **P4** — o «parâmetro» do feedback vira AULA, posicionado depois de função/chamada | Preencher o corpo de função com parâmetro e argumentar a chamada |
| **η** — «O teste por dentro» | **`import`/`from`**, `node:test`, **`assert.equal`** (o harness compara valor devolvido × valor esperado) | P8, resto de P7, P13 (parcial) | Ler e prever veredito; escrever nada de teste (assert fica receptivo) |
| **θ** — «Let e atribuição» (a aula atual reordenada) | `decl:let` + `op:assign:=` — o conteúdo que já está pronto | **Todos os pré-supostos da §5** — a cadeia inteira vira ancestral | A predicao atual («preveja o que o teste vê») deixa de ser pressuposição e vira **retrieval sobre aulas passadas**; o desafio `contador-com-let` entra intacto, adicionando só as 2 construções novas |

Depois de θ, a trilha existente (const, escopo, `+=`/`++`, etc., conforme o `foraDeEscopo`/docs §3.6)
segue sem nenhuma correção: cada aula futura já parte do vocabulário completo.

**Nota contra a objeção esperada:** ensino de módulos **antes** de variáveis foi rejeitado pelo
próprio docs §3.2 («absurdo pedagógico») — correto. A sequência acima **não** faz isso: módulos vêm
em **η**, depois de função; e ela ataca o problema real — não «ensinar módulos cedo», mas **parar de
interrogar o aluno sobre construções que nunca foram ensinadas** a partir da aula α.

---

## 11. Ficha-resumo

- **Medição:** `extractAtoms` real (typescript 5.8.3) sobre starter/tests/solution + 2 blocos da
  predicao; 0 violações de budget (o defeito é de currículo, não de gate).
- **Construções avaliadas:** 22 · **E = 6** (variável/nome, declarar, atribuir, ler-valor, valor,
  literal de string) · **U = 16** (13 fortes: função, export, chamada, parâmetro/argumento,
  instrução, comentário, import/módulo, test(), arrow-callback, caminho de arquivo, harness,
  módulo/strict mode, ReferenceError/SyntaxError; 3 leves/parciais: return, assert.equal, literal
  numérico) · **A = 0** (axioma legítimo para iniciante absoluto: vazio).
- **Feedback confirmado:** «chamar a função» sem ensinar — predicao (lesson.json:15) e statement do
  desafio (challenge.json:8); «parâmetro» — pressuposto estrutural no código (argumentos de
  `assert.equal(x(), 1)` e `test(…, () => {…})`), a palavra nunca ocorre.
- **Correção mínima:** sequência α→β→β2→γ→δ→ε→η→θ (§10); reordenar a aula atual como dernier degrau
  e declarar andaime em vez de interrogar seed.