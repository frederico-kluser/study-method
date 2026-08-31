# Análise "usado × ensinado" — trilha real `nodejs-do-zero`, aulas 1–3 do módulo `fundamentos-javascript`

> Sub-agente a3 (trilha real) · worktree `a3-trilha-real` · base `main@4803f5e`
> Lente do a1 aplicada ao produto: "a primeira atividade presume função/parâmetro sem ensinar".
> Fonte dos dados: gate determinístico da engine — `npm run engine -- audit nodejs-do-zero` (modos
> `inferred` e `declared`, política `receptive-seed`) + script tsx read-only com
> `loadTrack`/`deriveTrackBudget`/`extractAtoms`/`collectLessonCode` reais
> (`app/electron/main/engine/{budget,audit,theoryCode,atomKeys,extract}.ts`).

## 0. Como o gate lê as 3 aulas

Ordem pedagógica (fonte: `modules/fundamentos-javascript/module.json` → `lessons[]`):

| # | Aula (slug) | Conceito declarado | Desafio |
|---|---|---|---|
| 1 | `o-que-e-programacao` | `programacao` | `cumprimentar` |
| 2 | `variaveis-e-tipos` | `variaveis` | `somar` |
| 3 | `funcoes` | `funcoes` | `dobro-do-numero` |

Faixas declaradas (`introduces`): **nenhuma das 118 aulas da trilha declara `introduces`** —
o orçamento só existe em modo `inferred` (o que o código da teoria mostra) e, em modo `declared`,
`introduces(aula)=∅` para todas. Axioma de entrada (aula 1, cumulative(0)): `STRUCTURAL_ALWAYS_ALLOWED`
(6 átomos estruturais, nas duas faixas) + `HARNESS_RECEPTIVE_SEED` (29 átomos do runner, só no
receptivo: `export`/`import`/`test`/`assert.*`/arrow/`CallExpression`/literais/etc.).

Assimetria das quatro superfícies (regras A1–A4/A11):
`testsCode ⊆ entrada.receptivo` · `starterCode|teoria ⊆ saida.receptivo` · `solutionCode ⊆ saida.produtivo`
(o aluno só é cobrado pelo **diff** solução−starter, nunca pelo `export` que não digita).

## 1. Placar da trilha (contexto)

| Métrica | valor |
|---|---|
| Aulas / desafios | 118 / 118 |
| Desafios com violação (modo padrão `inferred`) | **96 (81%)** |
| Violações | 285 (A3: 167 · A2: 52 · A6: 45 · DEC: 17 · I16: 2 · A1: 2) |
| Lacunas de currículo | 102 |
| Modo `declared` (introduces declarado = ∅ em tudo) | 9.707 violações, 9.705 lacunas |

## 2. Por aula: superfícies de atividade × ensinado × fonte

Legenda de fonte: **A** = axioma/seed (política, não aula) · **E** = ensinado pela teoria
**desta** aula (em `inferred` = o que o bloco js da teoria mostra) · **C** = coberto
cumulativamente por aula anterior (em `inferred`) · **L** = lacuna (não ensinado em aula nenhuma
em `declared`; sem aula dona). "Presumido pelo aluno escrever" = átomo no **diff** solução−starter
fora do axioma produtivo. A seed cobre o runner; **nenhum** átomo de conteúdo abaixo está na seed.

### Aula 1 — `o-que-e-programacao` / desafio `cumprimentar` (0 violações em `inferred`)

| Átomo | Usado em | Ensinado (prosa) | Fonte |
|---|---|---|---|
| `console.log` + `global:console` | teoria + statement | **P1/P2**: "comando de imprimir", parênteses, aspas, `;` | E (esta aula) |
| `node:FunctionDeclaration` | starter + solution | P5 "Passo 1 — crie uma função… bloco de instruções com nome" | E (esta aula, em `inferred`) · **L** em `declared` |
| `node:Parameter` | starter + solution | "Passo 2 — entre os parênteses fica o **parâmetro**" | E (esta aula) · **L** em `declared` |
| `node:CallExpression` | theory (ex.) | "Passo 5 — chamamos `cumprimentar('Maria')`" | E (esta aula, `inferred`) · **L** em `declared` |
| `node:ReturnStatement` | solution (diff) | "Passo 4 — o `return` entrega o resultado" | E (esta aula) · **L** em `declared` |
| `node:IfStatement` + `form:IfStatement[alternate=null]` | solution (diff) | só no código do exemplo, sem prosa própria | E (código da teoria, `inferred`) · **L** em `declared` |
| `op:unary:typeof` + `node:TypeOfExpression` | solution (diff) | "Conferimos com `typeof` — ele diz o tipo" | E (esta aula) · **L** em `declared` |
| `op:binary:!==` | solution (diff) | só no código do exemplo | E (código) · **L** em `declared` |
| `node:ThrowStatement` + `global:Error` + `node:NewExpression` | starter + solution + theory | "lançamos um erro com `throw`" (prosa: uma frase) | E (esta aula) · **L** em `declared` (A11 no starter) |
| `op:binary:+` (concatenação) | solution (diff) | "O sinal de `+` junta textos" | E (esta aula) · **L** em `declared` |
| `export` | starter (assinatura congelada) | não ensinado | **A** (seed, só receptivo) |
| `import`/`test`/`assert`/arrow/`CallExpression`/`PropertyAccess`/literais | testsCode (18 átomos) | não ensinado | **A** (seed — 18/18 cobertos, 0 violação A3) |

**Diff que o aluno precisa escrever (8 átomos):** `form:IfStatement[alternate=null]`,
`node:BinaryExpression`, `node:IfStatement`, `node:ReturnStatement`, `node:TypeOfExpression`,
`op:binary:!==`, `op:binary:+`, `op:unary:typeof` — todos fora do axioma e **nenhum** na seed.

Por que passou em `inferred` e o que isso esconde: a seção **"Exemplo completo"** da teoria é a
**solução literal do desafio colada** (o próprio repo documenta o padrão: `budget.ts:33` "colou o
solutionCode inteiro numa seção chamada 'Exemplo completo'" e `theoryCode.ts:6-8` "a aula 1 da
trilha atual despeja `function`, `if`, `typeof`, `!==`, `throw`, `new Error` e `return` numa única
seção"). O modo `declared` (à prova de fraude) marca na aula 1: **A4=17, A1=4, A2=8, A11=1 (30
violações, todas lacuna)** — ou seja, 100% do conteúdo que o aluno escreve na atividade 1 não tem
aula dona.

### Aula 2 — `variaveis-e-tipos` / desafio `somar` (4 violações em `inferred`: A2=1, A3=2, A6=1)

Conteúdo nominal da aula (o que a teoria ENSINA em prosa): `let`/`const`, tabela de tipos
string/number/boolean, `typeof`, template literal `${...}` (crases), `console.log`. Em `inferred`,
`introduces =(decl:let, decl:const, VariableDeclaration*, Template*, op:assign:=, node:NumericLiteral)`.

| Átomo | Usado em | Ensinado (prosa) | Fonte |
|---|---|---|---|
| `decl:let`, `decl:const` | teor. | "caixinhas com nome… `let idade = 25;`", "com `const` o valor não pode ser trocado" | E (esta aula) |
| `node:TemplateExpression`/`TemplateHead/Span/Tail` | teor. | "texto com crases… dentro de `${...}` é calculado" | E (esta aula) |
| `op:unary:typeof` | teor. + solution diff | "Para conferir o tipo de um valor, existe o comando `typeof`" | E (esta aula) |
| `node:FunctionDeclaration` + `node:Parameter` (a,b) | starter (assinatura) | não nesta aula | C (aula 1) |
| `node:ReturnStatement` / `ThrowStatement` / `global:Error` / `NewExpression` | solution diff | não nesta aula | C (aula 1) |
| `node:IfStatement` / `!==` / `BinaryExpression` | solution diff | não nesta aula | C (aula 1) |
| **`op:logical:\|\|`** | **solution diff** (`typeof a !== 'number' \|\| …`) | **não nesta aula** | **L/viol. A2** — só ensinado na **aula 3** (`funcoes`) |
| `node:PrefixUnaryExpression` + `op:unary:-` | **testsCode** (`somar(-4, 10)`) | **não em aula nenhuma do módulo** | **L/viol. A3** — literal negativo; `op:unary:-` só em `testes-e-qualidade` (ordem), `PrefixUnaryExpression` só em `arrays-e-objetos` |
| **A6** | solution | — | **o desafio não usa NADA do que esta aula introduziu** (let/const/template não aparecem no diff) |

**Diff (9 átomos):** o aluno escreve o envelope inteiro da aula 1 (if/typeof/`!==`/return/throw) +
`||` que ainda não existe — e **nada** de variáveis, o assunto da aula. A violação A6 ("direção
puxada") documenta o degrau vazio: a atividade 2 exercita a aula 1 (inclusive `||` da aula 3), não
a aula 2.

### Aula 3 — `funcoes` / desafio `dobro-do-numero` (2 violações em `inferred`: A3=2)

Conteúdo nominal: função (nome/parâmetros/corpo/retorno), `return` (valor + encerra; sem `return` →
`undefined`), metadidática "os desafios testam o que a função devolve, não o que ela imprime".
`introduces` em `inferred` = apenas `op:binary:*`, `op:logical:||`, `node:TemplateMiddle` — **a aula
de "Funções" não introduz `FunctionDeclaration` nem `Parameter`**: eles já foram "introduzidos" pelo
dump da aula 1.

| Átomo | Usado em | Ensinado (prosa) | Fonte |
|---|---|---|---|
| `op:binary:*` (dobro) | solution diff | exemplo `function dobro(numero){ return numero * 2; }` | E (esta aula) |
| `op:logical:\|\|` | solution diff | exemplo `apresentar()` (só no código) | E (esta aula, código) |
| `node:FunctionDeclaration`/`Parameter`/`ReturnStatement`/`if`/`typeof`/`throw`/`!==` | solution diff / starter | **prosa da aula explica função/retorno**, mas como conteúdo repetido da aula 1 | C (aula 1) — em `declared`, **L** |
| `node:PrefixUnaryExpression` + `op:unary:-` | testsCode (`dobroDoNumero(-3)`) | não ensinado | **L/viol. A3** (mesmo par da aula 2) |
| `export`/`import`/`assert`/`test`/arrow | starter + tests | não ensinado | **A** (seed) |

**Diff (9 átomos):** mesmo envelope já exigido nas aulas 1-2, trocando `+` por `*`.

### Resumo quantitativo (pergunta 3 do pedido)

"Quantos átomos de atividade estão fora de `introduces(aula) ∪ cumulative(0)=∅`, sem estar na seed?"

| Aula | `introduces` declarado | Axioma (seed+estrutural) | Átomos de atividade **fora do axioma** | …fora do axioma **e fora da seed** |
|---|---|---|---|---|
| 1 | ∅ | 35 (receptivo) / 6 (produtivo) | starter 5 + solution 8 = **13** | **13 (100%)** — função, parâmetro, if, typeof, `!==`, return, throw, `Error`, `+` |
| 2 | ∅ | idem | starter 5 + solution 9 + tests 2 = **16** | **16 (100%)** — os 13 da aula 1 + `\|\|` + unário `-`/prefixo |
| 3 | ∅ | idem | starter 5 + solution 8 + tests 2 = **15** | **15 (100%)** — os da aula 1 (com `*`) + unário `-`/prefixo |

Nenhum átomo de atividade não-axiomático está na seed do harness (a seed cobre só o runner:
`export`/`import`/`test`/`assert`/arrow/chamadas/literais). **Todo o conteúdo de linguagem que o
aluno precisa escrever nas aulas 1-3 é conteúdo sem aula dona declarada** — passa no modo `inferred`
porque o código da teoria da aula 1 é a solução colada; no modo `declared` as 3 aulas somam
**120 violações (A4=75, A1=12, A2=26, A3=4, A11=3), todas lacunas de currículo**.

## 3. Retrato do problema (3 linhas)

As **3 primeiras aulas presumem função/parâmetro/retorno/validação de entrada** — nenhuma declara
`introduces`, e no único modo à prova de fraude (`declared`) todo átomo que o aluno escreve na
atividade 1 (função, parâmetro, if, typeof, `!==`, return, throw, `Error`) é lacuna de currículo; o
"pass" no modo padrão vem de a aula 1 colar a solução literal na seção "Exemplo completo" — o golpe
que o próprio repo documenta (`budget.ts:33`, `theoryCode.ts:6-8`). A aula 2 agrava: exige escrever
o envelope da aula 1 **mais `||` que só a aula 3 ensina** (A2) e **não exercita nada** do que ela
mesma ensina (A6, let/const/template jamais usados no desafio); a aula 3 é a de "Funções", mas já
não introduz função — só `*` e `||`. O invólucro do teste (`export`/`import`/`assert`/`test`/arrow)
é lícito desde a aula 1 apenas por política da engine (`HARNESS_RECEPTIVE_SEED`) — **nenhuma aula o
ensina**, sequer como leitura.

## 4. Sugestão da aula 1 (invólucro) — como a trilha MICRO dependeria do harness

O harness já resolve metade do problema: `export`/`import`/`test`/`assert.*`/arrow/`CallExpression`
nascem **semeados no orçamento receptivo** (regra A3 dos testes = 0 violação nas aulas 1-3). Falta
o produto converter a **licença** em **didática** e parar de cobrar conteúdo sem aula dona:

1. **Ensinar a LEITURA do invólucro na aula 1** (prosa didática, sem o aluno escrever): uma seção
   "como ler um desafio" que (a) nomeia a linha congelada `export function cumprimentar(nome)` —
   "assinatura que você não precisa digitar; o corpo é seu", (b) apresenta o arquivo de teste como
   **máquina que confere** — `import` = o encaixe que entrega sua função à máquina, `test('…')` = uma
   verificação, `assert.equal/throws` = a régua (igual / "tem que dar erro"), (c) declara esses
   átomos em `introduces.receptive` da aula 1 (licença explícita, não só seed). Essa é a metade
   "involucro" que o modo `declared` exige para A1/A3 ficarem verdes.
2. **Declarar `introduces.productive` da aula 1 = só o que a atividade 1 cobra do aluno** — ex.
   `node:FunctionDeclaration`, `node:Parameter`, `node:ReturnStatement`, `op:binary:+` (concatenação),
   `api:console.log`. O resto do envelope atual (if/`typeof`/`!==`/`throw`/`new Error`) **sai da
   primeira atividade**: ou a guarda vira um segundo desafio da aula de condicionais (onde `if` e
   `!==` têm aula dona), ou o cenário de erro entra sem `throw` por parte do aluno (a régua
   `assert.throws` continua seedada para o teste, mas a solução não precisa lançar erro na aula 1 —
   nada de A11 derivado). Assim o diff do aluno cai de 8 átomos não-axiomáticos para 4 átomos
   introduzidos pela própria aula → A1/A2/A4 verdes em `declared`.
3. **Alternativa de produto (a "máquina que confere" opaca)**: o runner mostra o invólucro como
   caixa-fechada — o aluno vê o teste rodando e o resultado (verde/vermelho + mensagem), e o arquivo
   de teste/assinatura nem aparece no editor (wrapper gerado pelo runner, a alternativa que o doc
   16 §3.2 já lista; hoje rejeitada por exigir mexer em `challengeExec.ts`). Com o invólucro fora do
   editor, a superfície produtiva nem contém `export`/`import`/`assert` — o problema desaparece por
   construção, e a aula 1 não precisa ensinar nada do harness além de "o que a máquina responde".
4. **O gate como contrato do gerador MICRO**: a trilha micro nasceria com `introduces` declarado por
   aula e o harness seedado por política; toda atividade seria validada pelas 4 desigualdades
   (A1-A4) + A6 (o diff precisa exercitar a aula) + A11 (erro só se o orçamento tiver `throw`)
   ANTES de o aluno vê-la — não depois, como hoje (96/118 desafios da trilha real falham o gate).

**Ordem de custo-benefício**: (1) + (2) são mudança de conteúdo (`lesson.json`/`challenge.json` das
3 aulas + `introduces`), sem tocar no runner; (3) é mudança de produto (`challengeExec.ts`), maior.
Para a trilha real, (1)+(2) já zerariam A1/A2/A4 e as lacunas de `function`/`parâmetro`/`return` da
aula 1; (3) eliminaria o invólucro do alcance do aluno de vez.