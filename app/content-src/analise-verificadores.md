# Análise de verificadores — gaps e specs A13–A16 (ensino-efetivo, micro-avanço, progressividade, primeira-atividade)

> **Nota de 2026-09-02.** Este documento continua NORMATIVO para as regras A13–A16 (é a spec que
> `app/electron/main/engine/quality/progressao.ts` implementa e que os testes citam). As MEDIÇÕES
> que ele traz — placares, contagens por bateria, o pin de `app/tests/engineAuditPlacar.test.ts` —
> foram feitas sobre a trilha `nodejs-do-zero`, que foi **apagada** nesta data junto com o resto do
> conteúdo gerado (ver `docs/15-trilha-nodejs.md`). Elas ficam como registro; as regras, como
> contrato.

> **Contexto.** Os verificadores determinísticos atuais garantem "o desafio só cobra o que já foi
> ensinado" por **diferença de conjuntos sobre AST** (`docs/16-engine-de-trilha.md` §5). O feedback do
> usuário pede três coisas que essa garantia **não** cobre: (1) construção **usada** numa atividade sem
> ter sido **ensinada** (ex.: chamar função/parâmetro na atividade 1); (2) **avanço micro** — a aula
> introduz demais de uma vez, ou a atividade exige mais do que a aula ensinou + 1 passo; (3)
> **progressividade** do desafio.
>
> **Método.** 0 chamadas de LLM. Leitura do código real (`audit.ts`, `budget.ts`, `extract.ts`,
> `atomKeys.ts`, `theoryCode.ts`, `form/rules.ts`, `phases/f7Theory.ts`, `phases/f8Challenges.ts`,
> `phases/atomicity.ts`, `phases/f2Decompose.ts`, `graph/invariants.ts`, `quality/solvable.ts`,
> `phases/f6Pilot.ts`, `app/tests/engineAuditPlacar.test.ts`, `app/tests/engineBudgetGate.test.ts`,
> `docs/16-engine-de-trilha.md`) e um **probe read-only** (`tsx`, sem escrita) que mede as quatro
> propostas A13–A16 sobre a trilha real `nodejs-do-zero` (118 aulas) no modo `inferred` com harness
> `receptive-seed` — o MESMO caminho do pin do placar (`PIN_PLACAR` 285/96/102). Todos os números de
> impacto abaixo são **medidos**, não estimados por palpite.
>
> **Bateria atual (o que existe no código).** `audit.ts` implementa **A1, A2, A3, A4, A6, A11, DEC**
> (+ estruturais **I12, I14, I15, I16, I17**). `graph/invariants.ts` implementa **I1–I11** sobre a
> visão de ensino **declarada** (conceitos/Q-matrix), não sobre átomos extraídos. **A5, A7, A8, A9,
> A10 e A12 existem SÓ no documento** (§5.1) — grep não encontra nenhuma implementação (A7/A12 têm
> parentes em `phases/atomicity.ts`/`prompts/dossier.ts` para o conteúdo GERADO na F2, nunca no gate
> de conteúdo real). `phases/f7Theory.ts`/`f8Challenges.ts`/`f6Pilot.ts` re-aplicam A1–A4/A6 aos
> drafts na autoria, com os MESMOS furos listados abaixo.

---

## 1. O que cada verificador garante EXATAMENTE hoje

### 1.1 Orçamento por faixas (`budget.ts` + `audit.ts` A1–A4)

Derivação (`docs` §3.2/§3.5), na ordem pedagógica:

```
entrada(0)   = STRUCTURAL_ALWAYS_ALLOWED ∪ HARNESS_RECEPTIVE_SEED   (policy receptive-seed)
entrada(N)   = saida(N−1)
saida(N)     = entrada(N) ∪ introduces(N)
```

O gate garante, por superfície (`audit.ts` §5.1):

| Regra | Garante | Direção do furo |
|---|---|---|
| A1 | `atoms(starterCode) ⊆ saida.receptive` | starter pode **ler** tudo que o orçamento receptivo contém — inclusive o seed |
| A2 | `atoms(solutionCode \ starterCode) ⊆ saida.productive` (diff) | — |
| A3 | `atoms(testsCode) ⊆ ENTRADA.receptive` | teste pode **ler** tudo do orçamento de entrada — **inclui o seed desde a aula 1** |
| A4 | `atoms(teoria, blocos cercados js) ⊆ saida.receptive` | teoria só é checada **para fora** do orçamento; nada checa a direção inversa |
| A6 | `atoms(solutionCode) ∩ introduces.productive ≠ ∅` | direção puxada OK |
| A11 | cenário de erro só exigível com `throw`/`assert.throws` no orçamento | OK |
| DEC | `eval`/`new Function`/`with`/acesso computado não-literal em qualquer nível | OK |

O que isso **garante de fato**: nenhum átomo fora do orçamento cumulativo passa; `firstTaughtIn`
distingue **violação de ORDEM** (construção ensinada em aula posterior) de **lacuna de currículo**
(construção que nenhuma aula ensina) — a distinção que faz o laço de correção convergir (§5.5).

### 1.2 O FURO central do orçamento (medido e reproduzido pelo probe)

`HARNESS_RECEPTIVE_SEED` (`atomKeys.ts`) semeia no receptivo **da aula 1** (e portanto em TODAS):
`node:CallExpression`, `node:ArrowFunction`, `node:Identifier`, `node:StringLiteral`,
`node:PropertyAccessExpression`, `node:NumericLiteral`, `node:Block`, `node:SourceFile`,
`node:ExpressionStatement`, `form:ArrowFunction[body!=Block]`, `form:Parameter[initializer!=null]`,
`import`/`export`/`test`/`assert` inteiros.

Essa semente é um **acomodador do runner** (o aluno lê `import …`, `test('x', () => …)`,
`assert.equal(f(1), 1)` em todo desafio — e ensinar módulos antes de variáveis é absurdo). Mas ela
**perdoa em silêncio exatamente o pecado nº 1 do usuário**: com o seed, `CallExpression` e arrow
entram no orçamento receptivo **sem nenhuma aula ter mostrado uma chamada de função**. Medido:

- O teste do desafio 1 (`cumprimentar`) contém `cumprimentar('Maria')` (chamada + argumento) e
  `() => cumprimentar(42)` (arrow de expressão) — **A1/A3 passam** (seed), e o aluno lê chamada de
  função/parâmetro na primeira atividade sem ter visto chamada nenhuma. O probe A13 isola exatamente
  `node:CallExpression` como o átomo usado-sem-demonstração do 1º desafio.

### 1.3 A4 não distingue "demonstrado" de "só catalogado"

A4 checa `teoria ⊆ receptivo` — direção **para fora**. Não existe, em nenhum modo:

- **declarar não é demonstrar** (inverso de A5): em `declared`, um autor pode declarar
  `introduces: ['node:IfStatement']` e nunca mostrar `if` em nenhum bloco de código; A1/A2/A3/A4
  passam (o orçamento "tem" o `if`) e o aluno é cobrado no desafio por algo que só foi catalogado.
- **demonstrar não é ensinar** (A5 literal): em `inferred`, "a teoria mostrou" = "está ensinado" —
  deliberadamente permissivo (§3.2, "piso"), mas o golpe documentado (colar o `solutionCode` inteiro
  numa seção "Exemplo completo") **conta como demonstração**. O probe mostra consequência concreta:
  a aula 1 tem 16 "novos" porque a seção 3 despeja a solução inteira.

### 1.4 Invariantes I1–I11 não tocam conteúdo

`graph/invariants.ts` consome uma `VisaoDeEnsino` montada em `f3Graph.ts` a partir do **grafo
declarado** (conceitos, Q-matrix `usa`, formas declaradas no grafo) — nunca do AST extraído. I4
(origem antes), I5 (aparece na teoria), I6 (exigida no desafio), I7 (reaparece ≥3) verificam a
**intenção declarada no grafo**, não o que as superfícies reais emitem. Uma trilha com grafo perfeito
e conteúdo "cabeça de penhasco" passa I1–I11 intacta — é o caso real dos módulos 1–6. E I1–I11 rodam
na geração (F3), não no gate de audit sobre conteúdo legado. I12/I14–I17 (audit.ts) são buracos do
**loader** (slug/order/id/path) — não tocam conteúdo, como esperado.

### 1.5 Atomicidade testa introdução vs tempo, não pré-supostos

`phases/atomicity.ts` (§3.6) aplica as quatro réguas (demonstrável/exercitável/orçamentável/
cronometrável) sobre **candidatos declarados** (contagens) em **F2, hora da decomposição** — com
proxy de "aula cheia" (`carga_minima_da_aula`), que o próprio código declara como "revalidado em F4".
O que a atomicidade **não testa**: que os átomos do candidato (ou da aula materializada) já foram
**demonstrados em aulas anteriores** (pré-supostos) — a aresta `desbloqueado_por` é declarada no
grafo, nunca verificada contra o conteúdo. O "exercitável" supõe um span único de lacuna; o teste
físico da co-localização fica para F8/J6. Além disso, nada re-aplica as réguas sobre a aula
**realizada** (a aula 1 com 16 novos passou pela autoria sem teto).

### 1.6 O resto

- `quality/solvable.ts` (J3, aluno simulado) é LLM, por desafio, pré-entrega: prova que o desafio é
  resolvível com o **orçamento produtivo** — não cobre ordem de ensino nem progressividade.
- `f6Pilot.ts::auditarTrilhaDeBrinquedo` e as validações da F7/F8 re-aplicam A1–A4/A6 — mesmos furos.
- `testes`: o pin `engineAuditPlacar` (285/96/102, modo inferred) protege regressão do **extrator/orçamento**;
  `engineBudgetGate` fixa extrator + A1–A6 + I12/I14–I17 + o caso canônico da aula 1; `engineF2Decompose`
  cobre a atomicidade F2; `engineAuthoring` cobre os gates de autoria. Nenhum cobre os furos da seção 1.

---

## 2. Coberto hoje × furo × spec nova

| # | Pedido do usuário | Coberto hoje? | Furo exato | Spec nova |
|---|---|---|---|---|
| 1 | construção **usada** sem ter sido **ensinada** (chamar função/parâmetro na atividade 1) | Parcial — A1/A2/A3 garantem ⊆ orçamento | **Seed do harness** no receptivo desde a aula 1 (CallExpression, ArrowFunction, property access, literais, forms) perdoa sem nenhuma demonstração; em `declared` a **declaração** vale por ensino; em `inferred` "mostrou na teoria" = ensinou | **A13 ENSINO-EFETIVO** (`usado ⊆ demonstrado ∪ introduzido ∪ demonstrado-anterior ∪ axioma ∪ boilerplate-estreito`) + **A13d** (declarar não é demonstrar) |
| 2 | avanço micro: aula introduz demais de uma vez | O teto §3.6/A12/A7 existe **no doc e na F2**, não no gate do conteúdo real | Nada mede o número de átomos **verdadeiramente novos** de uma aula realizada; A14b não existe (combo de novas na mesma linha = lacuna única violada) | **A14a** (teto \|novos\| por aula, >4 erro) e **A14b** (≤1 construção nova por linha da solução) |
| 3 | atividade exige mais do que a aula ensinou + 1 passo | A2/A6 parciais (diff ⊆ produtivo; ≥1 do introduces) | Não há teto de **novidade incremental do desafio** (quantas novas o desafio combina); nenhum gate sobre degraus **entre desafios** da mesma aula nem **entre aulas** | **A14b** + **A15 PROGRESSIVIDADE** (degrau intra-aula; reuso inter-aula) |
| 4 | progressividade do desafio (crescer gradualmente) | I7 (reaparece ≥3) só no grafo declarado; anti-repetição é prompt | Nada verifica reuso/degradação no **conteúdo real**; vale medir que a rede atual **já reusa** (A15: 0/1 violações) — o músculo de progressividade está em A14a/A16 | **A15a** intra-aula (2+ desafios), **A15b** inter-aula (reuso ≥1 anterior), variante módulo |
| 5 | primeira interação/atividade | §7.1 regra 2 é **prompt-only** (nada verifica) | Nenhum gate garante que a 1ª atividade é resolvível com a seção inicial da própria aula | **A16 PRIMEIRA-ATIVIDADE** |

---

## 3. Spec A13 — ENSINO-EFETIVO (proposta)

### 3.1 Regra formal

Definições (todas derivadas por código, zero LLM; `π(k)` = posição da ocorrência do átomo `k`):

```
A(K)          = { átomos emitidos por extractAtoms(K) }            (eixo node/decl/op/global/api/form)
Demo(i)       = ∪ A(bloco js da teoria de i)                        // fences com tag js + section.code js
Cum(i)        = ∪_{j<i} Demo(j)                                     // demonstrado em aulas ANTERIORES
InitDecl(i)   = introduces declarado de i (modo declared)
Init(i)       = InitDecl(i)  (declared)  |  Demo(i) \ Cum(i)  (inferred)
AX            = STRUCTURAL_ALWAYS_ALLOWED ∪ axioma declarado da trilha (default: só o estrutural)
H13           = BOILERPLATE ESTREITO  (abaixo)                       // mecânica do runner + valores
S13(code)     = ocorrências dentro de SPAN mecânico (abaixo)
Escrito(i)    = A(solutionCode_i) \ A(starterCode_i)                 // o que o aluno escreve além do starter
Lido(i)       = A(starterCode_i)
LidoAntes(i)  = A(testsCode_i)                                        // o aluno LÊ o teste antes da aula
```

**As quatro regras (todas erro, exceto onde marcado aviso):**

| | Regra | Conjunto violado |
|---|---|---|
| **A13a** | `Escrito(i) ⊆ Demo(i) ∪ Cum(i) ∪ AX ∪ H13` | `Escrito(i) \ (Demo ∪ Cum ∪ AX ∪ H13)` |
| **A13b** | `Lido(i) ⊆ Demo(i) ∪ Cum(i) ∪ AX ∪ H13` | `Lido(i) \ (...)` |
| **A13c** | `(LidoAntes(i) \ S13) \ H13 ⊆ Demo(i) ∪ Cum(i) ∪ AX` | ocorrências fora do span mecânico nunca demonstradas — a teoria DA MESMA aula também demonstra para o teste (fórmula do §3.2: "demonstrado em teoria (desta/anteriores)"; a L1 real demonstra `resposta()` na seção 1 e o teste do próprio desafio a chama) |
| **A13d** (só `declared`) | `InitDecl(i) ⊆ Demo(i) ∪ Cum(i)` — **declarar não é demonstrar** | chave declarada em `introduces` que não aparece em nenhum bloco de código (desta ou de aulas anteriores) |

**H13 (lista estreita — versão 1, versionada; a semente inteira NÃO entra aqui):**

```
STRUCTURAL_ALWAYS_ALLOWED (SourceFile, Identifier, Block, ExpressionStatement, EndOfFileToken, SyntaxList)
+ ExportKeyword, ImportDeclaration, ImportSpecifier, ImportClause, NamedImports
+ api:node:test, api:node:assert, api:node:assert/strict, api:test
+ api:assert.equal|strictEqual|deepEqual|deepStrictEqual|throws|rejects|doesNotThrow|ok
+ global:assert, global:test
+ PropertyAccessExpression, StringLiteral, NumericLiteral, BooleanLiteral
```

**S13 (spans mecânicos por superfície — a forma de não afogar o sinal na espinha do runner):**
por AST da superfície, spans `[início, fim)` que isentam ocorrências:
1. nó `ImportDeclaration` inteiro;
2. chamada `test('título', …)`: do callee até o começo do **corpo** do callback (a assinatura
   `test('x', () =>` é mecânica; o **corpo** é autoral);
3. chamadas `assert.<método>(…)`: do callee até o **início do 1º argumento** (o 1º argumento é
   conteúdo autoral — `cumprimentar('Maria')` conta);
4. em `assert.throws/rejects/doesNotThrow(…)`: adicionalmente a **assinatura `() =>`** do callback
   (o corpo é autoral).

O que sobra **fora** de `S13 ∪ H13` é conteúdo autoral: chamadas de função, arrows, parâmetros,
qualquer construção — e aí a exigência é `⊆ Demo(i) ∪ Cum(i) ∪ AX` (testes e starter/solução —
a fórmula do §3.2 vale para as TRÊS superfícies; o teste da L1 real chama `resposta()` e a seção 1
da própria L1 demonstra a chamada).

**Severidade (D4 — `docs` §12, calibrar antes de bloquear):** é **erro** para eixos
`node/decl/op/api/form` e `global:` de estrutura; é **aviso** para valores/termos provavelmente
explicados em prosa — lista `AVISO13` = `global:undefined/NaN/Infinity, node:NullKeyword,
node:TrueKeyword, node:FalseKeyword, node:RegularExpressionLiteral,
node:NoSubstitutionTemplateLiteral, node:TemplateExpression(+Head/Middle/Tail),
global:String/Number/Boolean/BigInt/Symbol`.

### 3.2 Falsificabilidade

- Vezes em que a trilha real reprova (medido, modo inferred): **testes 158 ocorrências (127 erro +
  31 aviso-D4) em 65 aulas; starter 3 em 2 aulas (`npm-e-package-json` — parâmetro default congelado
  no starter, `poo/o-que-e-poo`); solução 53 (35 erro + 18 aviso) em 36 aulas**. O 1º desafio viola
  exatamente com `node:CallExpression` — o pecado nº 1 do usuário.
- Teste de aceitação do próprio gate: o caso da aula 1 (`cumprimentar`) **passa no gate atual** (A3
  com seed) e **deve falhar em A13c** — se não falhar, a granularidade de ocorrência quebrou.
- Gatilho de contraste: qualquer teste cuja primeira chamada é `test(...)`/`assert.*(...)` e o corpo
  do callback chama a função-alvo — a espinha sai por S13, a chamada autoral não.

### 3.3 Ponto de integração

1. **`engine/extract.ts` (additivo, obrigatório):** expor **ocorrências completas** — o atual
   `extractAtoms` devolve só a PRIMEIRA ocorrência por chave (`firstSeen`), e A13c precisa saber
   qual ocorrência está dentro de S13. Duas opções equivalentes: (a) flag `todas?: boolean` que
   devolve ocorrências por nó; (b) manter extrator intacto e o gate roda seu próprio walk com `ts`
   (o probe fez exatamente isso). Recomendação: (a), com teste de pin no `engineBudgetGate`.
2. **`engine/qualidade/progressao.ts` (novo, puro):** `auditarProgressao(track, budget, opcoes)`
   com as quatro regras; reusa `extractAtoms`, `collectLessonCode`, `atomKeys`.
3. **`audit.ts`:** `BuildBudgetRule | 'A13' …` na união, merge das violações (mesmo padrão das
   estruturais); novos contadores no report.
4. **`f7Theory.ts::validarDraftDeAula`:** A13d na autoria (o draft tem a teoria em mãos) —
   `introduces` do dossiê ⊆ átomos dos blocos do próprio draft ∪ entradas anteriores.
5. **Placar:** novas métricas + pin (protocolo, §4.5).

### 3.4 Mensagens pt-BR

- A13c (testes): `` `${label}` aparece no teste de `` `ref` ``, que o aluno lê ANTES da aula, e nem a teoria desta aula nem a de nenhuma aula anterior o demonstrou num exemplo de código — o aluno leu uma construção que nunca viu. Demonstre `` `${label}` `` na teoria desta aula ou de uma aula anterior (ou remova a ocorrência do teste) ``
- A13a/A13b: `` `${label}` é exigido/exposto no desafio de `` `ref` ``, mas a teoria desta aula e de TODAS as anteriores nunca mostrou `` `${label}` `` num bloco de código — sem demonstração não há ensino (A13). Reescreva dentro do que já foi demonstrado ou mova a demonstração para cá ``
- A13d: `` `${label}` está declarado em introduces de `` `ref` ``, mas não aparece em NENHUM bloco de código da teoria — declarar não é demonstrar (A5/A13d). Escreva o exemplo ou remova da declaração ``
- Aviso D4: `` `${label}` (um valor/termo) aparece sem demonstração em código — se a prosa já o explica, rebaixe à vontade; caso contrário demonstre num bloco js ``

### 3.5 Testes de exemplo (`app/tests/engineProgressao.test.ts`)

1. **`A13c reprova a aula 1 que manda o aluno LER chamada de função nunca demonstrada`** — trilha
   fixture: aula 1 SEM teoria; challenge com `testsCode` contendo `() => f(1)` (fora de S13). Asserta:
   existe violação `{regra:'A13c', construcao:'node:CallExpression'}`.
2. **`A13c aprova quando a chamada foi demonstrada em aula anterior`** — 2 aulas: aula 1 teoria com
   bloco `f(1)`; aula 2 testes com `f(1)`. Asserta: zero violações A13c de CallExpression.
3. **`A13d reprova introduces declarado sem demonstração (modo declared)`** — aula declara
   `introduces.productive: ['node:IfStatement']` e teoria sem `if`. Asserta violação A13d.
4. **`A13b reprova o starter que congela parâmetro default nunca demonstrado`** — áudio do caso real
   `npm-e-package-json`: starter `export function f(x = 1) {}`, teoria sem bloco com default. Asserta
   violação com `form:Parameter[initializer!=null]`.

---

## 4. Spec A14 — MICRO-AVANÇO (proposta)

### 4.1 Regra formal

```
Novo(i) = (Demo(i) ∪ InitDecl(i)) \ Cum(i) \ (AX ∪ H13)     // "verdadeiramente novos" de i
```

- **A14a — TETO POR AULA** (materializa A7/A12/§3.6 no gate do conteúdo real):
  - `|Novo(i)| == 0` → **aviso** (aula que não ensina nada — a rede tem 14);
  - `|Novo(i)| > tetoNovos` (default **4**, parâmetro do §3.6 “interagindo”; estreitar para 2 quando
    `|Cum(i)|` é pequeno — orçamento quase vazio) → **erro**;
  - em modo `declared`, adicionalmente `|introduces.productive| > 2` → **erro** (a I2/A7 que o audit
    não tem hoje; hoje só o zod do dossiê F5 segura, no conteúdo real nada).
- **A14b — COMBO NA MESMA LINHA** (materializa “exercitável: uma lacuna”, §3.6):
  - para cada linha ℓ do `solutionCode_i` (o diff com starter por posição): se
    `|{ k ∈ Novo(i) : k ocorre em ℓ }| > 1` → **erro** (a lacuna única contém mais de uma construção
    nova; falta degrau).
  - parâmetro `novosPorLinha ≤ 1`; a contagem é por ocorrência-na-linha, não por chave única.

### 4.2 Falsificabilidade (medido na trilha real)

- **A14a: 44 aulas com >4 verdadeiramente novos** (docs: 45 medidos por outra régua — convergem),
  topo `fundamentos-javascript/o-que-e-programacao` com **16**; 71 com >2; **14 com 0** (aviso).
- **A14b: 9 aulas · 17 linhas**; ex.: aula 1 L3 `throw new Error(…)` (3 novos na mesma linha) e L5
  `return 'Olá, ' + nome + '!'` (`ReturnStatement` + `op:binary:+`); `condicionais` L5
  (`op:binary:%` + `op:binary:===`); `dados-em-memoria` L11 (`api:Math.max` + `global:Math`) etc.
- Binário de sanidade: uma aula que introduz só `let` + `op:assign:=` e desafio `let x = 1;` passa
  nas duas; a mesma aula com `let` + `const` + `op:assign:=` e desafio `let x = 1; const y = 2;`
  viola A14a (3 > teto-inicial 2) — é o §3.6 (“variáveis” falha e vira sequência isolada).

### 4.3 Ponto de integração

- A14a: no `audit.ts` (loop por aula, já tem `metrics.novas`) + `f7Theory.ts` na autoria (contar
  sobre o draft, `InitDecl` real).
- A14b: `engine/qualidade/progressao.ts` (caminhar o `solutionCode` por linha); opcionalmente na
  F8 (`ofensasDeOrcamentoDoDesafio`) para nascer validado.
- Placar: contadores próprios + pin (protocolo §4.5).

### 4.4 Mensagens pt-BR

- A14a: `` `ref` introduz ${n} construções verdadeiramente novas — acima do teto de ${teto} (§3.6/A12). O histograma aponta penhasco: divida a aula em ${ceil(n/teto)} (ou reordene o grafo) ``
- A14a-aviso: `` `ref` não introduz NENHUMA construção nova — aula sem incremento; se é aula de revisão, marque `role` adequado, senão falta conteúdo novo (A12) ``
- A14a-declared: `` `ref` declara ${n} construções produtivas em introduces — máximo 2 (A7/I2) ``
- A14b: `` a linha ${ℓ} do solutionCode de `ref` combina ${n} construções novas (${lista}) — a lacuna única do completion problem contém no máximo 1 (exercitável, §3.6). Quebre em linhas/passos separados ``

### 4.5 Testes de exemplo

1. **`A14a reprova aula com 5 construções verdadeiramente novas e aprova com 2`** — fixture trinha
   3 aulas: aula 3 introduz 5 → viola; aula 2 introduz 2 → passa.
2. **`A14b reprova linha com 2 construções novas`** — solução `return a + b;` com `return` e `+`
   novos → viola; `return a;` sozinho → passa.
3. **`A14a-declared reprova introduces.productive > 2 no audit`** — trilha com lesson declarando 3
   produtivas → violação A14a (hoje passa; é a A7 do doc).

---

## 5. Spec A15 — PROGRESSIVIDADE (proposta)

### 5.1 Regra formal

- **A15a — degrau INTRA-aula** (ativa com ≥2 desafios na mesma aula; ordenação = ordem do array
  `challenges`):
  para o k-ésimo desafio (`k ≥ 1`), com `Ant(k) = ∪_{m<k} A(solution_m)`:
  - (i) **reuso**: `A(solution_k) ∩ Ant(k) ≠ ∅` — o degrau usa algo do degrau anterior;
  - (ii) **teto do degrau**: `| A(solution_k) \ Ant(k) \ (Demo(i) ∪ Cum(i) ∪ AX ∪ H13) | ≤ 1` — o
    degrau adiciona no máximo **1** átomo NÃO demonstrado em teoria (senão é "aula inteira nova" no
    meio do caminho; o que não é demonstrado também viola A13).
  - erros nos dois ramos.
- **A15b — arco INTEr-aula**: para `i ≥ 1` (aula 1 é o axioma):
  `A(solution_i) ∩ (Cum(i) \ AX) ≠ ∅` — o desafio da aula N reutiliza ≥1 átomo demonstrado **antes**
  (recuperação espaçada, §7.1 item 12; I7 em versão de conteúdo).
  - parâmetro `mínimoReuso ≥ 1`; parâmetro `predecessorImediato: bool` — no modo estrito, `Cum(i)`
    vira `Demo(i−1)` (a solução precisa reusar algo da aula ANTERIOR IMEDIATA).
- **A15c — capstone de módulo (extensão recomendada, medição futura):** o desafio do módulo (campo
  `challenge` em `module.json`) reutiliza ≥1 átomo introduzido pelas aulas do PRÓPRIO módulo — sem
  isso o capstone é um desafio descolado do arco do módulo. (Depende de o `loadTrack` expor os
  desafios de módulo; medir na próxima rodada.)

### 5.2 Falsificabilidade (medido na trilha real — a parte mais reveladora)

- **A15a: inerte HOJE** — 118 aulas, **0 com 2+ desafios** (o desafio de módulo fica fora da aula);
  a regra nasce para trilhas novas/estendidas.
- **A15b: 0 violações** na versão "qualquer aula anterior"; **1 violação** na versão estrita
  (`especialista/observabilidade`) — **a rede atual JÁ reutiliza** (soluções usam `console.log`/
  `function` etc.). Conclusão medida e honesta: onde o usuário "sente" falta de progressividade hoje
  NÃO é reuso zero — é **penhasco de novidade** (A14a/A16), que são os gates que efetivamente
  reprovam. A15 continua sendo o contrato correto para o caso em que a rede passar a ter desafios
  múltiplos por aula e precisa impedir "ilhas".

### 5.3 Ponto de integração

- A15a/A15b em `engine/qualidade/progressao.ts` + merge no `audit.ts`; A15a exige a ordem dos
  desafios (o array `challenges` já é ordenado).
- Para a F7/F8 (geração): A15a vira validação de draf-sequência quando a onda escrever 2+ desafios
  por aula (hoje a F8 escreve 1); A15b é garantido pelo dossiê (o desafio recebe o orçamento
  INTEIRO — reuso é natural), o gate é defesa.

### 5.4 Mensagens pt-BR

- A15a-i: `` o desafio "${slug_k}" da aula `ref` não usa NENHUM átomo do desafio anterior da própria aula — sem degrau, sem reuso; o aluno não exercita o que acabou de fazer (A15a) `` (idem ii com a lista de átomos).
- A15b: `` o desafio da aula `ref` não reutiliza NENHUM átomo demonstrado em aulas anteriores — não há progressão nem recuperação espaçada (§7.1.12); inclua uma construção antiga no cenário (retrieval) ``

### 5.5 Testes de exemplo

1. **`A15a reprova degrau sem reuso e com 2 novos não demonstrados`** — aula com 2 desafios:
   solução 1 `let x = 1;`, solução 2 `const y = x + 1; const z = y * 2;` onde `const`/`*`/`+` são
   novos não demonstrados → viola (ii); sem `x` em solução 2 → viola (i).
2. **`A15b aprova solução que reutiliza console.log e reprova a que só usa o novo`** — aula 3 cuja
   solução só usa átomos da própria aula + boiler → viola; a mesma com `console.log(...)` → passa.

---

## 6. Spec A16 — PRIMEIRA-ATIVIDADE (proposta)

### 6.1 Regra formal

Contexto normativo: §7.1 item 2 — "a primeira interação do aluno é SEMPRE PREVER a saída de um
programa que não é dele", e a primeira atividade não pode pressupor o que a própria aula ainda não
apresentou. O modelo de conteúdo atual não tem campo de interação estruturado (verificado: 0 aulas
com marcador), então a spec tem dois ramos:

```
DemoSec1(i)   = ∪ A(blocos js da PRIMEIRA seção da teoria de i que tem código)
```

- **A16a (contrato de campo novo, aditivo §10):** se a aula declara `firstInteraction` (bloco de
  código de predição — "qual é a saída?"), então
  `A(firstInteraction) ⊆ DemoSec1(i) ∪ Cum(i) ∪ AX ∪ H13` — a predição inicial só usa axioma + o que
  a seção inicial demonstrou + material anterior. **Erro.**
- **A16b (fallback no modelo atual):** o **primeiro** desafio da aula i:
  `Escrito(1º desafio) ⊆ DemoSec1(i) ∪ Cum(i) ∪ AX ∪ H13` — o aluno consegue resolver a primeira
  atividade com a seção inicial + tudo que veio antes; qualquer construção nova usada no primeiro
  desafio precisa estar demonstrada **na seção inicial**, não em seções posteriores da própria aula.
  **Erro** (configurável: aviso para i > 0).

### 6.2 Falsificabilidade (medido)

- **29 aulas (25%)** reprovam A16b: o 1º desafio exige construção nova que a 1ª seção não demonstra.
  Ex.: `o-que-e-programacao` (1ª seção sem código nenhum; o desafio precisa de `if`/`typeof`/`!==`/
  `return`/`+`/`Error`), `condicionais` (`%`/`===`), `loops` (`<`), `arrays-e-objetos`
  (`Array.isArray`/`!`/unário), `assincronismo/operacoes-lentas` (`await`), `promises`
  (`Promise`/`>`), `http-com-node` (`Object`/propriedades) etc.
- Contraste: uma aula cuja 1ª seção demonstra o átomo do 1º desafio passa; a que demonstra só na 3ª
  seção viola.

### 6.3 Ponto de integração

- `engine/qualidade/progressao.ts`; no modelo atual, usar `lesson.meta.theory` (a 1ª seção com
  código) + desafios; na geração, a F7 já sabe as seções — validar o dossiê nº 2 da §7.1 na autoria.
- Nota de produto: A16b efetivamente **exige** que a primeira seção da teoria demonstre o primeiro
  desafio — a correção natural da trilha real é adiantar a demonstração (não "simplificar o desafio").

### 6.4 Mensagens pt-BR

- A16a: `` a primeira interação da aula `ref` usa ${label}, que a seção inicial não demonstra — a predição inicial (§7.1.2) só pode usar axioma + o que a 1ª seção ensinou + material anterior ``
- A16b: `` o PRIMEIRO desafio de `ref` exige ${label}, demonstrado só na seção "${secao}" — a primeira atividade do aluno tem de ser resolvível com a seção inicial + material anterior (§7.1.2). Adiante a demonstração ou troque o desafio inicial ``

### 6.5 Testes de exemplo

1. **`A16b reprova 1º desafio que exige construção da 2ª seção`** — aula: seção 1 sem código, seção
   2 com `if`; 1º desafio solução `if (x) { return 1; }` → viola com `node:IfStatement`.
2. **`A16b aprova quando a 1ª seção demonstra o exigido`** — seção 1 mostra `if`; mesmo desafio →
   passa.
3. **`A16a reprova firstInteraction que foge da seção inicial`** — aula declara `firstInteraction`
   com `Array.map` sem seção 1 demonstrar → viola.

---

## 7. Impacto agregado no placar (medido — modo inferred, trilha real)

| Bateria | Medição sobre `nodejs-do-zero` (118 aulas) | Severidade |
|---|---|---|
| **A13** testes | **158** ocorrências (127 erro + 31 aviso-D4) em **65** aulas | erro + aviso |
| A13 starter | **3** em 2 aulas (`npm-e-package-json`, `poo/o-que-e-poo`) | erro |
| A13 solução | **53** (35 erro + 18 aviso-D4) em 36 aulas | erro + aviso |
| A13d (declared) | inerte na trilha real (0 aulas declaram `introduces`) — ativo na geração | erro |
| **A14a** | **44** aulas > 4 novos; 71 > 2; **14** == 0 (aviso) | erro + aviso |
| **A14b** | **9** aulas · **17** linhas | erro |
| **A15a** | inerte hoje (0 aulas com 2+ desafios) — vale para trilhas novas | erro |
| **A15b** | **0** (qualquer anterior) / **1** (predecessor imediato: `especialista/observabilidade`) | erro |
| **A16b** | **29** aulas | erro |

**Projeção do pin** (285 violações / 96 desafios / 102 lacunas hoje): somando só os **erros**
A13(165) + A14a(44) + A14b(17) + A15b(1) + A16(29) ≈ **+256 violações** → placar ≈ **540+**; somando
avisos-D4 (49) e avisos A14a (14) fica ≈ **600**; `desafiosComViolacao` deve saturar (96 → ~110 das
118, porque as aulas hoje limpas em grande parte violam A16/A13 — a medir no bump). **O placar
DOBRA** — é exatamente o retrato do feedback do usuário: a trilha atual é estruturalmente culpada
nas quatro dimensões.

**Protocolo de integração (duas fases, recomendado):** (1) medir e **reportar** (novas métricas no
`report.json`, novas colunas no CLI) sem bloquear a integração — a bateria nasce como
`progressividade` no placar com aviso; (2) após a rodada de correção da trilha (adiantar
demonstrações, quebrar penhascos, dividir a aula 1), **promover a erro** e **pinar** — o bump do
`PIN_PLACAR` no MESMO commit que declara o motivo (protocolo da INT-02 do
`engineAuditPlacar.test.ts`; a bateria nova exige estender o pin com os novos contadores, e o teste
continua garantindo "o placar nunca piora sem declaração").

---

## 8. Riscos, limites e decisões abertas

1. **Granularidade do extrator (bloqueante para A13c):** `extractAtoms` registra só a 1ª ocorrência
   por chave (`firstSeen`). A13c exige classificar **cada ocorrência** dentro/fora de S13. É uma
   mudança ADITIVA pequena (flag `todas`) e testável — sem ela, a chamada autoral dentro do corpo do
   `test(...)` desaparece atrás da espinha.
2. **D4 (prosa):** valores/termos (`undefined`, `null`, regex, template literal) podem ser
   "ensinados" em prosa sem bloco js. Por isso A13 tem a lista `AVISO13` (severidade aviso até
   calibrar) — D4 do documento. Sem isso o gate viraria ruído (31+18 ocorrências de ruído medido).
3. **Inferred é piso (documentado):** no modo inferred, "demonstrou no bloco = ensinou" continua
   permissivo — A13a/b dão o mesmo piso dos A1–A4; quem fecha "explicou de verdade" é A13d + o
   revisor (§6 do doc falha-fechado), não o AST. Declarar no placar a limitação (o CLI já imprime o
   aviso de piso).
4. **A15 medido fraco na rede atual:** o probe mostra reuso generalizado — A15 não é o gargalo de
   hoje; A14/A16 são. A15 fica como contrato para trilhas com desafios múltiplos e capstones;
   recomenda-se medir A15c (capstone de módulo) quando o loader expuser os desafios de módulo.
5. **`difficulty` continua fora de gate** (§11): A14/A15 nunca leem `difficulty` — tetos são de
   átomos e reuso, não de rótulo.
6. **Primeira-aula/primeiro-módulo:** A16b não exige nada sobre o STATEMENT do desafio (prosa); o
   enunciado pode citar termos sem código — a checagem é sobre o que o aluno PRECISA ESCREVER/LER em
   código (a regra D4 vale para termos em prosa; enunciados fora do escopo do AST ficam com o
   revisor).

---

## 9. Anexo — saída integral do probe (read-only, `app/_probe-a2.ts` descartado após medição)

Ver §3.2/§4.2/§5.2/§6.2 — todos os números são desta saída. Aula 1, detalhe (penhasco):

```
AULA 1 (fundamentos-javascript/o-que-e-programacao) — novos (demo \ boiler): 16
  api:console.log, form:IfStatement[alternate=null], global:Error, global:console,
  node:BinaryExpression, node:CallExpression, node:FunctionDeclaration, node:IfStatement,
  node:NewExpression, node:Parameter, node:ReturnStatement, node:ThrowStatement,
  node:TypeOfExpression, op:binary:!==, op:binary:+, op:unary:typeof
A13-teste do 1º desafio: chaves fora-de-boiler sem demonstração anterior:
  node:CallExpression        ← o pecado nº 1 do usuário, isolado
```
