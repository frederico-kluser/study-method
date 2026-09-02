# Trilha micro `programacao-do-zero` — desenho do currículo

Trilha de **14 aulas** para iniciante absoluto (axioma produtivo vazio). Cada aula
avança **≤1 átomo produtivo novo** e digita **o mínimo absoluto**; o resto do
starter é congelado e declarado em `congelado`.

## Por que esta ordem (cada pré-suposto do feedback é eliminado em algum lugar)

- **Aula 1 não presume função, chamada, parâmetro nem variável.** O aluno digita
  **um número**; todo o invólucro (`export function resposta() { return …; }`) está
  congelado e é ensinado **como leitura** numa seção "como ler o desafio" —
  exatamente a condição que torna o boilerplate S13 lícito: as chaves do
  invólucro entram em `avancos.receptivo` da L1 (`node:FunctionDeclaration`,
  `node:ReturnStatement`), nunca no produtivo. Uma seção de vocabulário ("as
  palavras da caixa") **nomeia como leitura** os quatro conceitos: função (a
  caixa), return (a entrega), **parâmetro** (a janelinha por onde um valor entra
  — `node:Parameter` entra no RECEPTIVO da L1) e **variável** (uma caixa
  nomeada que guarda um valor — conceito nomeado como leitura; escrever
  `let`/`const` continua produtivo nas L7/L10). Nada disso é cobrado
  produtivamente: o produtivo da L1 continua só `node:NumericLiteral`.
- **Função** deixa de ser só leitura na **L3**, mas o primeiro ato produtivo de
  função é a **chamada** (`resposta()`), não a declaração: escrever a declaração
  obrigaria a escrever `return` (que é a L6). A declaração inteira só é escrita
  pelo aluno na **L12** (`node:FunctionDeclaration` produtivo).
- **Parâmetro/argumento**: escrever o parâmetro NUNCA antes da **L5** (o aluno
  digita o nome do parâmetro; o argumento é lido no teste congelado e
  exercitado no esticar). O CONCEITO, porém, é **nomeado como leitura já na L1**
  (decisão do dono: a 1ª aula fala de function, return, parâmetro e variável) —
  `node:Parameter` entra no `avancos.receptivo` da L1 (padrão L1-lê/L5-escreve:
  a L5 o torna produtivo) e a variável, nomeada na L1, é escrita (`decl:let`) na
  L7.
- **Return** (L6) é produtivo quando o aluno escreve a linha de devolução pela
  primeira vez; antes disso ele só o lê (receptivo desde L1).
- **Export** (L4): o aluno digita a palavra mágica que entrega a caixa ao
  conferidor.
- `let`/atribuição = **L7** (a aula da rodada 11 reescrita: `let contador = 0;`
  digitado; `contador = 5;` congelado → `op:assign:=` e `node:BinaryExpression`
  entram no RECEPTIVO). `const` = L10 (contraste com let). String = L8.
  Leitura de estado = L9. Erros = L11. Fechamento = L12–L14.

## Aula × avanço produtivo × o que o aluno digita

| # | slug | avanço produtivo NOVO | fixar (o aluno escreve) |
|---|------|----------------------|--------------------------|
| 1 | como-o-site-confere-seu-codigo | `node:NumericLiteral` | `7` |
| 2 | valor-e-instrucao | — (re) | `42` |
| 3 | funcao-e-chamada | `node:CallExpression` | `resposta()` |
| 4 | export-entrega | `node:ExportKeyword` | `export` |
| 5 | parametro-e-argumento | `node:Parameter` | `x` |
| 6 | return | `node:ReturnStatement` | `return x;` |
| 7 | let-e-atribuicao | `decl:let` (+rec: `op:assign:=`, `node:BinaryExpression`) | `let contador = 0;` |
| 8 | string-como-valor | `node:StringLiteral` | `let mensagem = "oi";` |
| 9 | estado-ler-depois-de-escrever | — (re) | `let contador = 0;` |
| 10 | const | `decl:const` | `let mudavel = 1; const fixa = 2;` |
| 11 | erro-sintaxe-vs-erro-valor | — (re, leitura) | `6` |
| 12 | involucro-completo | `node:FunctionDeclaration` | invólucro inteiro |
| 13 | nomear-bem | — (re) | `const fruta = "abacaxi";` |
| 14 | todas-as-pecas-juntas | — (revisão) | invólucro com const+string |

Progressão produtiva da trilha (9 átomos): `NumericLiteral → CallExpression →
ExportKeyword → Parameter → ReturnStatement → decl:let → StringLiteral →
decl:const → FunctionDeclaration`.

Receptivo (leitura) da L1: o invólucro (`node:FunctionDeclaration`,
`node:ReturnStatement`) + o parâmetro (`node:Parameter`) + o conceito de
variável nomeado em prosa — tudo sem cobertura produtiva (o produtivo da L1 é
só o `7`; escrever parâmetro continua L5 e escrever `let`/`const` continua
L7/L10).

## Reuso e desafio progressivo (A15)

- **Inter-aula (A15b):** toda aula usa ≥1 átomo do avanço da anterior — L3
  reusa o return lido, L5 reusa o export lido, L6 reusa o parâmetro (`return
  x;`), L7 reusa o return, L8 reusa o `let`, L9 reusa assign, L10 reusa `let`,
  L12 reusa tudo, L14 reusa a string.
- **Esticar (A15a):** toda aula com conteúdo tem 2º desafio que reusa o fixar
  + **≤1 átomo novo já demonstrado na teoria** (ex.: L6 `return 3;`, L12 `const`
  no lugar de `let`, L13 número no lugar de string).
- **Quebra micro:** nunca mais de 1 átomo produtivo novo por aula; as aulas de
  leitura pura (9 e 11) avançam só reuso + conceito em `termos_novos`.

## Nota do invólucro (S13)
O harness congela `export function …() { return …; }` e o teste
(`import`/`test`/`assert.equal`). Isso só é lícito porque a **L1 tem a seção
"como ler o desafio"** que ensina o invólucro COMO LEITURA e o declara em
`avancos.receptivo`. Como o contrato A2 ignora átomos já presentes no starter,
o congelado nunca exige cobertura produtiva — só receptiva (seed do harness +
receptivo de L1). A seção "as palavras da caixa" estende essa leitura a
parâmetro e variável, sempre sem cobertura produtiva. Literais e chamada são
seed receptivo e viram produtivo nas aulas certas.

## Observações de desenho para a fase de escrita
- `let x = 0;` emite `decl:*` + `node:VariableStatement/DeclarationList/
  Declaration` (ruído estrutural, coberto por `demonstrado_na_teoria`); a
  atribuição solta `x = 5;` emite `op:assign:=` + `node:BinaryExpression`.
  Recomenda-se promover os três `node:Variable*` a `STRUCTURAL_ALWAYS_ALLOWED`
  na engine (fora do escopo deste artefato).
- Multi-lacuna (L10, L5-esticar) e lacuna-única-palavra (L4: só `export`) são
  mecânicas de starter a implementar na fase de autor.
