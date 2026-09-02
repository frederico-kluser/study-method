# Em quais linguagens dá para criar aulas com a trava determinística

Pesquisa de 2026-08-30. Máquina de referência: CachyOS/Arch, `node v24.19.0`, `npm 11.17.0`,
`python3 3.14.7`, `go1.27.0`, `rustc 1.98.0`, `openjdk 17.0.19`, `dotnet 8.0.130`, `gcc 16.2.1`,
`clang 22.1.8`, `lua 5.5.1`, `perl 5.42.2`. Reproduza o inventário da máquina com:

```bash
for b in node npm python3 go rustc cargo java dotnet gcc clang lua perl ruby php \
         elixir dart ghc Rscript julia swift kotlinc scala zig bats prove; do
  printf '%-10s ' "$b"; command -v "$b" >/dev/null 2>&1 && command -v "$b" || echo AUSENTE
done
```

---

## 1. O que é a trava determinística

A trava é uma regra de conjunto, verificada por código, sobre o material didático:
**nenhum artefato de uma aula pode usar uma construção da linguagem que a trilha ainda não ensinou.**
Cada aula declara o que ela `introduces` em duas faixas — **produtivo** (o que o aluno tem de
escrever) e **receptivo** (o que ele só precisa ler; receptivo ⊇ produtivo). O orçamento cumulativo
da aula N é derivado por código, `cumulative(N) = ⋃ introduces(M)` para M ≤ N na ordem topológica do
grafo de pré-requisitos. Um gate estático parseia teoria, `starterCode`, `testsCode` e `solutionCode`
por AST e cobra três direções: contenção receptiva (`constructs(tudo) ⊆ cumulative_receptivo(N)`),
contenção produtiva (`constructs(solutionCode) ⊆ cumulative_produtivo(N)`) e **puxada**
(`constructs(solutionCode) ∩ introduces(N) ≠ ∅` — a aula cujo desafio só repete o que o aluno já
sabia é reprovada). A violação sai com `arquivo:linha:coluna`, o tipo de nó ofensor e
`primeiraAulaQueEnsina`: se for `null`, é lacuna de currículo (cria-se aula nova); se não for, é
violação de ordem (reordena-se ou reescreve-se). Além do gate estático, todo desafio é provado por
**execução**: a solução de referência passa, o starter falha, e o número de testes executados bate
com o declarado.

**O exemplo que originou tudo.** A primeira aula da trilha `nodejs-do-zero` chama-se
"o que é programação". O desafio dela exige treze construções distintas — inclusive `typeof`,
`!==`, `throw new Error` e concatenação — antes de a trilha ter ensinado qualquer uma:

```bash
cd app && node -e '
const {parse} = require("@babel/parser");
const c = require("./resources/tracks/nodejs-do-zero/modules/fundamentos-javascript/lessons/o-que-e-programacao/challenges/cumprimentar/challenge.json");
const ast = parse(c.solutionCode, {sourceType:"module", plugins:["estree"]});
const s = new Set();
JSON.stringify(ast, (k,v) => {
  if (v && typeof v === "object" && typeof v.type === "string" && v.type !== "File") {
    s.add(v.operator ? v.type + "[" + v.operator + "]" : v.type);
  }
  return v;
});
console.log(s.size); console.log([...s].sort().join(" "));'
```

Saída (medida): `13` e
`BinaryExpression[!==] BinaryExpression[+] BlockStatement ExportNamedDeclaration FunctionDeclaration Identifier IfStatement Literal NewExpression Program ReturnStatement ThrowStatement UnaryExpression[typeof]`.
O mesmo comando trocando `solutionCode` por `testsCode` dá 11 tipos de nó, e por `starterCode` dá 9 —
conjuntos quase disjuntos, que é a evidência de que **receptivo e produtivo precisam ser faixas
separadas**: proibir o que o arquivo de teste usa inviabiliza o harness; liberar tudo torna a trava
inútil. O arquivo é
o `challenge.json` da aula 1 daquela trilha (`modules/fundamentos-javascript/lessons/o-que-e-programacao/challenges/cumprimentar/`), apagado com ela em 2026-09-02 — ver [`../15-trilha-nodejs.md`](../15-trilha-nodejs.md).

Tamanho do problema hoje, medido na pesquisa anterior desta sessão (dossiês
`dim-controlled-vocabulary.md` e `dim-atomic-decomposition-js.md`, no scratchpad, com os scripts
`extract.mjs`/`track.mjs` ao lado): **43 de 136 desafios (32%)** cobram construção nunca ensinada
pelo scanner de teoria, e **55 de 118 aulas (47%)** pelo critério de AST cumulativo; **84 de 118
aulas (71%)** não introduzem construção nenhuma; a aula 1 sozinha introduz **24** construções. Os
denominadores são reproduzíveis no repo:

```bash
cd app/resources/tracks/nodejs-do-zero
find . -name module.json | wc -l      # 18
find . -name lesson.json | wc -l      # 118
find . -name challenge.json | wc -l   # 136
```

---

## 2. As quatro portas

Este é o critério para julgar **qualquer** linguagem nova, inclusive uma que apareça amanhã. Uma
linguagem só é Tier A se passa nas quatro.

### Porta 1 — parser com AST acessível a partir de Node/TypeScript

A engine é um CLI Node (vai viver em `app/tools/track-engine/`, que ainda não existe no disco). O
gate precisa rodar **dentro** da etapa de geração, antes de existir projeto lintável. Três formas
aceitáveis, em ordem de preferência:

1. **biblioteca npm em JS puro ou WASM** — sem toolchain externa, sem `child_process`. Ex.: `acorn`
   (JS), `@ruby/prism` (Ruby, WASM), `php-parser` (PHP, JS puro).
2. **binário da própria toolchain que emite AST serializado** — exige a toolchain instalada, mas a
   AST é a oficial, a mesma que o compilador usa. Ex.: `python3 -c "import ast, json; ..."`,
   um programa auxiliar em Go sobre `go/ast`, um host `dotnet` sobre Roslyn.
3. **tree-sitter** (`web-tree-sitter` + a grammar em `.wasm`) — existe grammar para quase tudo, mas
   entrega CST, não AST semântica; ver §4, Tier C.

Perguntas de aceitação: o pacote existe de fato no registry? qual versão, licença e data da última
publicação? está mantido? a AST tem **posição** (linha/coluna) por nó? o parser **falha** em código
inválido (tree-sitter nunca falha — ver §4)?

### Porta 2 — inventário de construções enumerável e estável

Sem lista fechada não há allowlist, e sem allowlist não há trava: as ferramentas de restrição do
mundo real (`no-restricted-syntax`, queries `.scm`, `ast-grep`) são todas **denylist**, então a
engine tem de **materializar o complemento**: `deny = INVENTÁRIO_FECHADO − cumulative(N)`. Em JS o
inventário canônico é `Object.keys(require('eslint-visitor-keys').KEYS)` e o pacote `globals`.

Perguntas de aceitação: existe uma lista canônica de tipos de nó ou de regras da gramática,
publicada e versionada? existe um comando que a imprime (não uma lista digitada à mão)? como se
enumera a biblioteca padrão e os built-ins? o inventário **muda de nome** entre versões? (em
tree-sitter muda — ver §4.)

### Porta 3 — decidibilidade

Quais construções destroem a promessa estática e por isso precisam virar **invariante global
proibido**, em qualquer nível da trilha. Se o código pode montar nomes em tempo de execução, nenhuma
promessa estática se sustenta. Em JS a lista é `eval`, `new Function`, `arguments`, `with`,
`MemberExpression[computed=true][property.type!='Literal']` (o `obj[expr]` dinâmico) e o alias de
função. Toda linguagem tem a sua: `exec`/`getattr` em Python, `send`/`method_missing` em Ruby,
macros em Elixir/Julia/Rust, o pré-processador em C, referência simbólica em Perl, expansão em shell.

Pergunta de aceitação: consigo **enumerar** essas construções e proibi-las estaticamente sem
inviabilizar a linguagem para ensino? Se a proibição corta o idioma normal da linguagem (shell sem
substituição de comando, Elixir sem macro), a porta está reprovada.

### Porta 4 — execução do desafio

Precisa provar três coisas por execução: **a solução de referência passa**, **o starter falha** e
**o número de testes executados bate com o declarado**. A implementação de referência está em
[`challengeExec.ts`](../../app/electron/main/services/challengeExec.ts) e documenta armadilhas reais:
exit code sozinho mente; `NODE_TEST_CONTEXT` herdado faz o filho pular tudo e sair 0; ANSI no
relatório quebra a contagem; timeout com `SIGKILL` dá 137, que também é OOM.

Perguntas de aceitação: existe runner **nativo** da toolchain (sem gerenciador de pacotes)? a saída
é parseável para **contar** testes executados — com qual flag exata? qual é o exit code de falha
(quase nunca é 1)? existe o caso "zero testes rodaram e saiu 0"? qual o tempo de arranque e o
footprint de instalação? dá para embarcar (WASM) em vez de exigir toolchain?

A base de fatos de Porta 4 já existe no repo, verificada por execução:
[`references/languages.md`](../../skills/study-method/references/languages.md) (matriz de 9
linguagens marcada `[V]`, mais 9 que exigem instalação) e
[`docs/research/06-toolchains.md`](../../docs/research/06-toolchains.md).

---

## 3. Tabela-resumo

Legenda: ✔ = a porta fecha com o que existe hoje · parcial = fecha com ressalva declarada ·
✘ = não fecha.

| Linguagem | P1 parser | P2 inventário | P3 decidibilidade | P4 execução | Tier |
|---|---|---|---|---|---|
| JavaScript (Node) | ✔ | ✔ | ✔ | ✔ | A |
| TypeScript (Node) | ✔ | ✔ | ✔ | ✔ | A |
| Python (CPython) | ✔ | ✔ | ✔ | ✔ | A |
| Ruby | ✔ | ✔ | parcial | parcial | B |
| Go | ✔ | ✔ | ✔ | ✔ | B |
| Rust | ✔ | parcial | ✔ | parcial | B |
| PHP | ✔ | ✔ | parcial | parcial | B |
| C# / .NET | parcial | ✔ | ✔ | parcial | B |
| Java | parcial | ✔ | parcial | ✔ | B |
| Lua | parcial | ✔ | parcial | parcial | B |
| SQL (dialeto SQLite) | ✔ | parcial | ✔ | ✔ | B |
| HTML | ✔ | ✔ | ✔ | parcial | B |
| CSS | ✔ | ✔ | ✔ | parcial | B |
| C | ✔ | parcial | ✘ | ✔ | C |
| C++ | ✔ | ✘ | ✘ | ✔ | C |
| Swift | parcial | ✔ | parcial | ✔ | C |
| Elixir | parcial | parcial | ✘ | ✔ | C |
| Julia | parcial | parcial | ✘ | parcial | C |
| Dart | parcial | parcial | parcial | ✔ | C |
| Scala | ✘ | parcial | parcial | parcial | C |
| Bash / POSIX sh | parcial | ✔ | ✘ | ✔ | C |
| Kotlin | parcial | ✘ | parcial | parcial | C |
| Objective-C | parcial | parcial | parcial | ✘ | C |
| Groovy | parcial | ✘ | ✘ | parcial | C |
| MATLAB / Octave | parcial | ✘ | parcial | parcial | C |
| Solidity | ✔ | parcial | parcial | parcial | C |
| Scheme (BiwaScheme) | parcial | parcial | parcial | parcial | C |
| Zig | parcial | parcial | parcial | parcial | D |
| Haskell | parcial | ✘ | parcial | parcial | D |
| R | ✘ | parcial | ✘ | ✘ | D |
| Perl | ✘ | ✘ | ✘ | ✔ | D |
| OCaml | ✘ | ✘ | parcial | ✘ | D |
| F# | ✘ | parcial | parcial | ✘ | D |
| Clojure | ✘ | parcial | ✘ | ✘ | D |
| Prolog | parcial | parcial | ✘ | parcial | D |
| Nim | ✘ | ✘ | ✘ | ✘ | D |
| Crystal | ✘ | ✘ | ✘ | ✘ | D |
| V (vlang) | ✘ | ✘ | ✘ | ✘ | D |
| Fortran | ✘ | ✘ | parcial | ✘ | D |
| COBOL | parcial | parcial | parcial | ✘ | D |
| Ada | ✘ | ✘ | parcial | ✘ | D |
| Visual Basic .NET | parcial | ✔ | ✔ | parcial | D |
| Erlang | parcial | parcial | parcial | ✔ | D |
| Assembly (x86-64 / ARM) | ✘ | ✘ | ✘ | ✘ | D |
| Scratch / Blockly | ✔ | ✔ | ✔ | parcial | D |

Contagem: **3 em Tier A · 10 em Tier B · 14 em Tier C · 18 em Tier D** — 45 linguagens avaliadas.

Duas leituras da tabela que não são óbvias. **Quatro ✔ não bastam para Tier A**: Go tem as quatro
portas fechadas e mesmo assim é Tier B, porque exige escrever e versionar um binário auxiliar em Go —
o critério de Tier A é "nenhuma peça nova", não "nenhuma ressalva". E **o Tier não é a média das
portas**: Zig tem o mesmo perfil de quatro "parcial" que várias linguagens de Tier C e cai em Tier D
por um motivo que não cabe em nenhuma coluna — a linguagem é pré-1.0 e quebra o inventário a cada
poucos meses.

---

## 4. Os tiers, e o trabalho que cada um custa

### Tier A — trava completa e execução já viável hoje

Critério operacional: passa nas quatro portas **e** a única peça que falta é código da engine —
nenhum binário auxiliar novo, nenhuma toolchain além do interpretador que já é pressuposto. Parser,
resolução de escopo, inventário e runner vêm todos da biblioteca padrão ou de pacotes npm de JS/WASM.

**JavaScript · TypeScript · Python.** Ficha completa em §5.

Ressalva honesta que vale para os três: mesmo o Tier A não é "zero-install". O runner atual já
depende de um `node` **externo** no PATH, porque o binário do Electron não entende `--test` —
`nodeBinary()` em [`challengeExec.ts`](../../app/electron/main/services/challengeExec.ts) devolve
`process.env.npm_node_execpath || 'node'` quando `process.versions.electron` está setado. Ou seja,
o problema de "detectar toolchain do aluno" já existe para a linguagem nº 1; adicionar a linguagem
nº 2 é mais barato do que parece, porque a estrutura de detecção e degradação já foi desenhada
(`detect-toolchains.sh` e a §6 de
[`references/languages.md`](../../skills/study-method/references/languages.md)).

### Tier B — viável com trabalho moderado

Passa nas quatro portas, mas exige **uma peça nova, nomeada e limitada**. O trabalho, por linguagem:

| Linguagem | A peça que falta |
|---|---|
| Go | Escrever e versionar um binário auxiliar em Go que serializa `go/ast` em JSON, e decidir se a resolução de nomes usa `go/types` ou fica só sintática. |
| Rust | Escrever um binário auxiliar em Rust com `syn` + `syn-serde`, e decidir entre `cargo test` (texto, com a armadilha dos três blocos) e `cargo-nextest` (JSON, mas experimental e mais um install). |
| Ruby | Escrever o runner (Minitest não tem saída estruturada) e a lista de invariantes globais de metaprogramação; decidir entre exigir `ruby` instalado ou embarcar `@ruby/wasm-wasi`. |
| PHP | Empacotar o PHAR do PHPUnit e parsear `--log-junit`/`--log-otr`; PHP precisa estar instalado. |
| C# | Escrever um host `dotnet` que roda Roslyn e emite JSON; parsear `trx` ou adotar `JunitXml.TestLogger`; absorver o custo de restore/build. |
| Java | Escolher entre `tree-sitter-java-orchard` (WASM, ativo) e `java-parser` (CST rico, órfão) e aceitar que não há resolução de nomes; parsear o banner do JUnit console launcher. |
| Lua | Fixar a versão da linguagem (o parser npm para em 5.3; a máquina tem 5.5.1) e inventar a convenção de contagem de testes, que `assert()` nativo não dá. |
| SQL | Escolher o dialeto (recomendado: SQLite, por causa de `node:sqlite`) e escrever os testes em JS — o que faz o desafio consumir **dois** orçamentos. |
| HTML | Escrever os testes em JS sobre a árvore do `parse5`; mesmo efeito de dois orçamentos. |
| CSS | Idem HTML, com `css-tree` + `mdn-data`; layout real só com Playwright, o que é caro. |

### Tier C — trava parcial

Tipicamente só tree-sitter, sem escopo nem resolução de nomes. **O que a trava ainda pega:**
presença sintática de construção com marca própria — `class`, `async`/`await`, comprehension,
`match`, ternário, loop, generator. Isso cobre o grosso de um currículo introdutório, e o
`node-types.json` de cada grammar dá o inventário enumerável.

**O que ela deixa passar**, e é por isso que Tier C não pode ser vendido como Tier A:

- **Nome ambíguo.** `const map = new Map(); map.set(...)` e `[1,2,3].map(...)` produzem o mesmo par
  `member_expression` + `call_expression` com o identificador `map`. A trava não distingue "método
  `.map` de Array, ainda não ensinado" de "variável local chamada `map`". O mecanismo `locals.scm`
  do tree-sitter existe só para colorir sintaxe: casa referência com definição por texto dentro de
  escopos marcados à mão, sem noção de import, tipo ou fluxo de dados
  (<https://tree-sitter.github.io/tree-sitter/3-syntax-highlighting.html>).
- **Sem tipos.** `x.foo()` não diz o que é `x`. Um `.then()` de Promise antes da aula de
  assincronismo passa batido.
- **Nunca falha.** O tree-sitter sempre devolve uma árvore, inserindo nós `ERROR` e `MISSING`. Código
  com erro de sintaxe grave "parseia" e escapa de uma varredura ingênua. É obrigatório checar
  `tree.rootNode.hasError` em todo caminho antes de aceitar o resultado
  (<https://tree-sitter.github.io/tree-sitter/using-parsers/6-static-node-types.html>).
- **Inventário instável entre versões**, comprovado empiricamente: entre a tag `v0.20.4` e o `master`
  de `tree-sitter-python`, o node type `except_group_clause` sumiu e `tuple_expression` apareceu.
  Um orçamento escrito contra nomes de uma versão pode ficar **permissivo demais** depois de um bump.

```bash
# comprovação da instabilidade e das contagens de node types
curl -sL https://raw.githubusercontent.com/tree-sitter/tree-sitter-python/master/src/node-types.json \
  | jq '[.[] | select(.named==true)] | length'   # 129 nomeados (218 no total)
curl -sL https://raw.githubusercontent.com/tree-sitter/tree-sitter-go/master/src/node-types.json \
  | jq '[.[] | select(.named==true)] | length'   # 112 nomeados (188 no total)
curl -sL https://raw.githubusercontent.com/tree-sitter/tree-sitter-java/master/src/node-types.json \
  | jq '[.[] | select(.named==true)] | length'   # 151 nomeados (265 no total)
curl -sL https://raw.githubusercontent.com/tree-sitter/tree-sitter-ruby/master/src/node-types.json \
  | jq '[.[] | select(.named==true)] | length'   # 149 nomeados (253 no total)
```

Estado das peças, verificado com `npm view <pacote> version license time.modified`:
`web-tree-sitter` 0.26.13 MIT 2026-08-23 · `tree-sitter` (binding nativo, exige `node-gyp` quando
falta prebuild) 0.25.1 MIT 2025-07-28 · `tree-sitter-wasms` 0.1.13 Unlicense 2025-10-07, que embala
**36** grammars em `.wasm` (bash, c, c_sharp, cpp, css, dart, elixir, elm, go, html, java,
javascript, json, kotlin, lua, objc, ocaml, php, python, ruby, rust, scala, solidity, swift,
typescript, zig, entre outras) — e **não** embala Haskell, R, Julia, Perl nem SQL.

Armadilha adicional dos pacotes individuais: várias grammars estão paradas no npm mesmo com o
repositório vivo. `tree-sitter-lua` 2.1.3 (2022), `tree-sitter-zig` 0.2.0 (2022),
`tree-sitter-dart` 1.0.0 (2023), e `tree-sitter-r` está publicado apenas como *security holding
package* (`0.0.1-security`, 2025-05-01) — ou seja, **R não tem grammar utilizável via npm**.
Reproduza com:

```bash
for p in tree-sitter-elixir tree-sitter-lua tree-sitter-zig tree-sitter-dart \
         tree-sitter-haskell tree-sitter-r tree-sitter-julia; do
  printf '%-22s ' "$p"; npm view "$p" version license time.modified | tr '\n' ' '; echo
done
```

**C e C++ são um caso especial de Tier C**, e por um motivo diferente do tree-sitter: o parser é
ótimo, mas a Porta 3 é irrecuperável. `clang -Xclang -ast-dump=json -fsyntax-only` existe e funciona
(a flag está listada em `clang -cc1 -help` como "Build ASTs and then debug dump them in the specified
format. Supported formats include: default, json"), dá AST **semântica** — melhor que tree-sitter —
e ainda emite JSON parcial quando o código está quebrado, o que serve para diagnosticar o starter.
Mas o pré-processador roda **antes** do parse, e o resultado é que a construção que o aluno escreveu
simplesmente não existe na árvore. Medido nesta máquina:

```bash
cat > mac.c <<'EOF'
#define QUADRADO(x) ((x) * (x))
int main(void) { return QUADRADO(3); }
EOF
clang -Xclang -ast-dump=json -fsyntax-only mac.c | grep -c QUADRADO   # 0
clang -E mac.c                                   | grep -c QUADRADO   # 0
clang -E -dM mac.c                               | grep -c QUADRADO   # 1
```

Uma aula que ainda não ensinou macro **não tem como saber** que o aluno usou uma: o nome desaparece
do AST e do preprocessado, e só sobrevive na lista de macros definidas. Some-se a isso a explosão de
volume, também medida: um arquivo de 2 linhas dá 10.295 bytes de JSON; com `#include <stdio.h>` vai a
652.047 (63×), e em C++ com `#include <vector>` o subagente mediu 58,5 MB. Dá para mitigar filtrando
por `loc.file`, mas `-ast-dump-filter` **não** serve: ele faz *substring match* (buscar `add` casa
`__daddr_t` dos headers) e emite vários objetos JSON concatenados, que não formam um documento
válido. Em compensação, a Porta 4 de C e C++ é boa: `CMocka` 2.0.2 (Apache-2.0, 310,8 KiB instalado)
dá contagem estruturada só com uma variável de ambiente
(`CMOCKA_MESSAGE_OUTPUT=XML|TAP|SUBUNIT|STANDARD`, <https://cmocka.org/>), `Check` 0.15.2
(LGPL-2.1-or-later, 187,6 KiB) fala TAP e XML (<https://libcheck.github.io/check/>), e em C++ o
Catch2 v3 tem `--reporter junit|xml|json|tap`
(<https://github.com/catchorg/Catch2/blob/devel/docs/reporters.md>) e o GoogleTest tem
`--gtest_output="json:path"`
(<https://github.com/google/googletest/blob/main/docs/advanced.md>). Com `assert.h` puro não há
contagem nenhuma e o exit de falha é **134** (SIGABRT).

### Tier D — não recomendado hoje

| Linguagem | Motivo |
|---|---|
| Perl | "Only perl can parse Perl" — a própria doc do PPI (<https://metacpan.org/pod/PPI>) declara que o objetivo não é parsear código Perl, e sim documentos Perl. `perl -MO=Deparse -e 'my $x = 1 + 2;'` devolve `my $x = 3;`: o *constant folding* já aconteceu, a árvore não é fiel ao fonte. Sem inventário estável. Ironia: a Porta 4 é a melhor de todas, porque o TAP nasceu em Perl. |
| Zig | Pré-1.0, e a instabilidade é o motivo, não a falta de peça: `std.zig.Ast.parse` funciona de dentro de um binário auxiliar Zig (testado sobre o tarball 0.16.0 de <https://ziglang.org/download/0.16.0/>, 52,9 MiB) e `Node.Tag` tem 164 a 165 variantes — mas boa parte são duplicatas por aridade (`array_init_one`, `array_init_one_comma`, `array_init_dot_two`). Não há serializador JSON pronto; `zig ast-check` só valida; a flag `-t` (ZIR em texto) só existe em build *debug* do compilador, e o binário oficial recusa com `-t option only available in builds of zig with debug extensions`. `zig test` escreve em stderr, sem JSON nem TAP. A 0.16 removeu `@Type` e reescreveu toda a stdlib de I/O — qualquer binário auxiliar quebra a cada poucos meses. |
| Haskell | As extensões de GHC mudam a própria gramática por arquivo, então não existe inventário fixo. Sem caminho JS/WASM, e o parser de referência trocou de dono: o Hackage do `haskell-src-exts` diz que ele está "on life support" e aponta para `ghc-lib-parser` (9.14.1.20251220). |
| R | Sem grammar npm utilizável (`tree-sitter-r` é *security holding package*), e o runner **mente**: `testthat::test_dir()` tem `stop_on_failure = FALSE` e sai com 0 mesmo com teste quebrado (registrado na §5 de [`references/languages.md`](../../skills/study-method/references/languages.md)). Existe uma saída lateral não explorada: `webr` 0.6.0 (2026-05-19), "the statistical programming language R compiled into WASM ... for node" — daria para rodar `parse()` + `getParseData()` sem toolchain nativa. Não testado. |
| OCaml, F#, Clojure, Nim, Crystal, V, Fortran, Ada | Sem parser acessível de Node verificado, e runner que exige toolchain inteira. |
| COBOL, Visual Basic .NET, Erlang, Groovy, Objective-C | Existe um caminho (ponte JVM, host Roslyn, `erl_parse`, tree-sitter), mas nenhuma peça pronta de fábrica; o custo é o de uma linguagem Tier B sem o público que justifique. |
| Assembly | Não há AST: é lista linear de mnemônicos, e não há framework de teste. O pior caso avaliado. |
| Prolog | `tau-prolog` 0.3.4 BSD-3-Clause, sem publicação desde 2022-08-03; API de AST não confirmada. |
| Scratch / Blockly | Não é falta de trava, é **outro modelo de trava**: não há sintaxe textual, e sim um grafo de blocos com `opcode` finito. A allowlist vira a paleta do toolbox, o que é até mais forte — mas exige um modelo de artefato inteiramente novo no schema. |

---

## 5. Fichas — Tier A e Tier B

### JavaScript (Node) — Tier A

- **Parser.** `acorn` 8.18.0, MIT, publicado 2026-07-28. Alternativas ESTree-compatíveis: `espree`
  11.2.0 BSD-2-Clause, `oxc-parser` 0.147.0 MIT. Configuração fixa: `ecmaVersion: 'latest'`,
  `sourceType: 'module'`, `locations: true` — nunca use `ecmaVersion` como mecanismo de restrição
  (o erro vira "unexpected token" em vez de mensagem didática). Não use o `esprima@4.0.1` que está
  em `app/node_modules`: é de 2018 e não parseia optional chaining, nullish, class fields nem
  top-level await.
- **Resolução de nomes.** `eslint-scope` 9.1.2 BSD-2-Clause: `globalScope.through` é, por definição,
  o conjunto de referências não resolvidas — todo global usado, sem heurística de nome
  (<https://eslint.org/docs/latest/extend/scope-manager-interface>). É esta peça que separa Tier A
  de Tier C.
- **Inventário.** `eslint-visitor-keys` 5.0.1 Apache-2.0 — as chaves são declaradamente congeladas.
  `globals` 17.11.0 MIT para os globais. Seletores: `esquery` 1.7.0 BSD-3-Clause.

```bash
npm view acorn version license time.modified
npm view eslint-visitor-keys version license time.modified
npm view globals version license time.modified
curl -sL https://raw.githubusercontent.com/eslint/js/main/packages/eslint-visitor-keys/lib/visitor-keys.js -o evk.js
grep -cE '^\t[A-Za-z]+: \[' evk.js            # 89 tipos de nó
grep -cE '^\tJSX[A-Za-z]+:' evk.js            # 15 são JSX
grep -cE '^\tExperimental[A-Za-z]+:' evk.js   # 2 são Experimental*  -> 72 no núcleo
curl -sL https://raw.githubusercontent.com/sindresorhus/globals/main/globals.json -o globals.json
node -e "const g=require('./globals.json');console.log(Object.keys(g).length, Object.keys(g.builtin).length, Object.keys(g.nodeBuiltin).length)"
# 59 ambientes, 65 globais em builtin, 76 em nodeBuiltin
```

  O tipo de nó puro **não basta**: `BinaryExpression` cobre `+` e `!==` igualmente,
  `VariableDeclaration` cobre `let` e `var`. O orçamento tem de ser expresso em seletores com
  atributo (`BinaryExpression[operator='!==']`, `VariableDeclaration[kind='let']`,
  `MemberExpression[computed=true]`) — a gramática está em
  <https://eslint.org/docs/latest/extend/selectors>.
- **Invariantes globais a proibir.** `eval`, `new Function(...)`, `arguments`, `with`,
  `WithStatement`, `DebuggerStatement`, `SequenceExpression`, `LabeledStatement`,
  `MemberExpression[computed=true][property.type!='Literal']` e o alias de função
  (`const imprimir = console.log`). Justificativa: se o código monta nomes em runtime, nenhuma
  promessa estática se sustenta.
- **Runner.** `node --test --test-reporter=spec test.mjs`. Contagem: a linha `ℹ tests N` do relatório
  spec, **depois** de remover os escapes ANSI. Gate de igualdade duplo, já implementado em
  [`challengeExec.ts`](../../app/electron/main/services/challengeExec.ts): `exit === 0` **e**
  `testsRun === expectedTestCount` **e** `declared === expectedTestCount`. Ele é obrigatório porque
  um arquivo de teste **vazio** sai 0 reportando um teste que passou:

```bash
mkdir -p /tmp/vazio && cd /tmp/vazio && printf '{"type":"module"}' > package.json && : > test.mjs
node --test --test-reporter=tap test.mjs; echo "EXIT=$?"
# ok 1 - test.mjs / # tests 1 / # pass 1 / EXIT=0   (Node v24.19.0)
```

- **Custo de bootstrap.** Nenhum além do `node` externo já exigido. Tempo medido de uma suíte de
  2 testes: 2474 ms na primeira execução, 535 ms e 259 ms nas seguintes —
  `for i in 1 2 3; do s=$(date +%s%N); node --test --test-reporter=spec test.mjs >/dev/null 2>&1; e=$(date +%s%N); echo "$(( (e-s)/1000000 )) ms"; done`.

### TypeScript (Node) — Tier A

- **Parser.** O compilador oficial, `typescript`. **Fixe a versão em 5.9.x** — `typescript@latest`
  hoje é `7.0.2` (Apache-2.0, publicado 2026-08-30), que é o *native port* em Go e move a API de AST
  para `typescript/unstable/ast`, explicitamente marcada instável. O ecossistema ESTree ainda não
  acompanhou: `@typescript-eslint/typescript-estree` 8.68.0 MIT declara
  `peerDependencies: { typescript: ">=4.8.4 <6.1.0" }`. O repo já tem `typescript` 5.8.3 em
  `app/node_modules`.
- **Inventário.** `ts.SyntaxKind`, enumerável e estável dentro de uma major:

```bash
cd app && node -e "const ts=require('typescript');console.log(ts.version, Object.keys(ts.SyntaxKind).filter(k=>isNaN(Number(k))).length, new Set(Object.values(ts.SyntaxKind).filter(v=>typeof v==='number')).size)"
# 5.8.3 395 359   -> 395 nomes (inclui aliases e marcadores), 359 valores distintos
npm view typescript version license time.modified
npm view @typescript-eslint/typescript-estree version license time.modified peerDependencies
```

- **Por que a trava é MAIS forte aqui.** O type checker (`ts.createProgram(...).getTypeChecker()`)
  resolve estaticamente o que em JS é impossível: dado `x.foo()`, ele diz o tipo de `x`. Isso fecha
  exatamente o buraco do Tier C descrito em §4. A trava passa a ter duas camadas decidíveis —
  sintática por `SyntaxKind` e semântica por tipo.
- **Invariantes globais.** Os mesmos do JavaScript, mais: proibir `any`, `as unknown as` e
  `@ts-ignore`/`@ts-expect-error`, que anulam a camada semântica.
- **Runner.** `node --test --test-reporter=spec test.ts` — **sem flag nenhuma** no Node 24. Medido:

```bash
node --test --test-reporter=spec test.ts   # ℹ pass 2, EXIT=0 no Node v24.19.0
# tempo quente: 287 / 273 / 291 ms (mesmo laço de medição da ficha de JavaScript)
```

  **Armadilha crítica, medida:** o Node **remove** os tipos, não os confere.
  `const x: number = "isto e uma string"; console.log(x);` roda e imprime a string, com exit 0. Logo
  o gate de tipos precisa de um `tsc --noEmit` separado — que o repo já roda em `npm run lint`
  (ver `scripts.lint` em `app/package.json`). A doc do comportamento está em
  <https://nodejs.org/api/typescript.html>.

### Python (CPython) — Tier A

- **Parser.** Módulo `ast` da biblioteca padrão, via subprocesso que emite JSON com posição. Testado:

```bash
python3 - <<'PY' <<< 'def f(x):
    if not isinstance(x, str):
        raise ValueError("nao e texto")
    return "Ola, " + x'
import ast, json, sys
def to_dict(n):
    if isinstance(n, ast.AST):
        d = {"_type": type(n).__name__}
        for f in n._fields: d[f] = to_dict(getattr(n, f, None))
        for a in ("lineno", "col_offset"):
            if hasattr(n, a): d[a] = getattr(n, a)
        return d
    if isinstance(n, list): return [to_dict(x) for x in n]
    return n
print(json.dumps(to_dict(ast.parse(sys.stdin.read()))))
PY
```

  Tempo medido de uma invocação completa: 73 / 89 / 106 ms. `ast.dump(tree, include_attributes=True)`
  também serve, mas as posições **não** saem por padrão
  (<https://docs.python.org/3/library/ast.html>).
- **Resolução de nomes.** `symtable`, também da stdlib — é o análogo exato do `eslint-scope`.
  Verificado: para `def f(x): y = x + 1; return len(y)` ele classifica `x` e `y` como `local` e `len`
  como `global`. É esta peça que coloca Python em Tier A e não em Tier B.

```bash
python3 -c "
import symtable
st = symtable.symtable('def f(x):\n    y = x + 1\n    return len(y)\n', '<m>', 'exec')
for t in [st] + st.get_children():
    print(t.get_type(), t.get_name(), [(s.get_name(), s.is_local(), s.is_global()) for s in t.get_symbols()])"
```

- **Inventário.**

```bash
python3 -c "import ast; print(len([n for n in dir(ast) if isinstance(getattr(ast,n),type) and issubclass(getattr(ast,n),ast.AST)]))"   # 133 (inclui ast.AST)
python3 -c "import builtins; print(len([n for n in dir(builtins) if not n.startswith('_')]))"                                          # 150
python3 -c "import keyword; print(len(keyword.kwlist), keyword.softkwlist)"                                                            # 35 e ['_','case','match','type']
python3 -c "import sys; print(len(sys.stdlib_module_names))"                                                                           # 297
```

  Ressalva: o número muda por versão do CPython (o 3.14 acrescentou `TemplateStr`/`Interpolation` do
  PEP 750), então o inventário tem de ser **gerado** contra a versão pinada, nunca digitado.
- **Invariantes globais a proibir.** `eval`, `exec`, `compile`, `getattr`/`setattr` com nome não
  literal, `__import__`, `importlib.import_module`, `globals()`/`locals()` mutáveis, e os dunders de
  atributo dinâmico (`__getattr__`, `__getattribute__`)
  (<https://docs.python.org/3/library/functions.html>).
- **Runner.** `python3 -m unittest discover -s tests -p "test_*.py"`. Contagem: `Ran (\d+) tests` na
  **stderr**. Exit 1 em falha e **exit 5 quando nada rodou** — não 0, o que já protege parcialmente.
  Medido:

```bash
python3 -m unittest discover -s tests -p "test_*.py"      # "Ran 2 tests" / OK / exit 0
python3 -m unittest discover -s vazio -p "test_*.py"      # "Ran 0 tests" / NO TESTS RAN / exit 5
# tempo quente: 155 / 165 / 159 ms
```

  Ressalva: `unittest` **não tem** saída estruturada. `python3 -m unittest -h` não lista `--junit-xml`
  nem TAP. Se quiser XML, é `pytest --junit-xml=report.xml` (atributo `tests="N"` no `<testsuite>`),
  mas o pytest não é stdlib e custa mais tempo de arranque (0,26 s contra 0,06 s do unittest, medido
  com `time` em venv isolada).
- **Custo de bootstrap.** Só o interpretador. Alternativa embarcada: `pyodide` 314.0.6 MPL-2.0
  (2026-08-25) — CPython em WASM; o asset `pyodide-core` tem 6.758.172 bytes e o completo
  350.203.134 bytes (`gh api repos/pyodide/pyodide/releases`). O tempo de boot do Pyodide **não foi
  medido**.

### Ruby — Tier B

- **Parser.** `@ruby/prism` 1.9.0, MIT, publicado 2026-03-16. É o Prism — desde o Ruby 3.4 o **parser
  padrão do CRuby** (<https://www.ruby-lang.org/en/news/2024/12/25/ruby-3-4-0-released/>) —
  compilado para WASM e mantido pelo próprio core do Ruby (`hsbt@ruby-lang.org`, `mametter`,
  `tenderlove`, `kddeisz`, `kateinoigakukun`). Roda em Node sem Ruby instalado, via `node:wasi`.

```bash
npm view @ruby/prism version license time.modified maintainers
curl -sL "$(npm view @ruby/prism dist.tarball)" -o prism.tgz
tar xzf prism.tgz package/src/nodes.js package/src/prism.wasm
grep -cE '^export class [A-Za-z]+Node ' package/src/nodes.js   # 151 classes de nó
ls -l package/src/prism.wasm                                   # 491965 bytes (~484 KB)
```

- **Inventário.** As 151 classes de `nodes.js`, geradas automaticamente do `config.yml` oficial do
  repo `ruby/prism`. O pacote traz também um `visitor.js` — o análogo do `eslint-visitor-keys`.
- **Invariantes globais a proibir.** É a pior superfície de metaprogramação das linguagens Tier B:
  `Kernel#eval`, `BasicObject#instance_eval`, `Module#class_eval`/`module_eval`,
  `Object#send`/`__send__`/`public_send`, `method_missing`, `define_method` com nome dinâmico,
  `Object#const_get`, `Kernel#binding`, e monkey patching de classe do core
  (<https://docs.ruby-lang.org/en/3.4/Kernel.html>, <https://docs.ruby-lang.org/en/3.4/BasicObject.html>).
- **Runner.** Minitest, que vem como default gem (6.0.6, MIT, 2026-05-01, em
  <https://rubygems.org/gems/minitest>): `ruby -Ilib -Itest test/x_test.rb`, exit **1** em falha.
  Não há saída estruturada nativa — JUnit vem de gem de terceiro. Para RSpec, o
  `rspec_junit_formatter` está em 0.6.0 e **sem release desde 2022-09-29**, o que é risco real
  (<https://rubygems.org/gems/rspec_junit_formatter>).
- **Custo de bootstrap.** Ruby não está instalado nesta máquina. Alternativa embarcada:
  `@ruby/wasm-wasi` 2.10.1 MIT (2026-08-30), "WebAssembly port of CRuby with WASI" — permitiria
  rodar o desafio sem toolchain. **Não testado.**

### Go — Tier B

- **Parser.** `go/parser` + `go/ast` + `encoding/json` num binário auxiliar. Testado de verdade nesta
  máquina (`go version go1.27.0`): um programa de ~30 linhas com `ast.Inspect` e `reflect.TypeOf`
  emite o histograma de tipos de nó e a posição via `fset.Position(...)`. Saída real para uma função
  de 8 linhas: `{"nodeTypes":{"*ast.BasicLit":3,"*ast.BinaryExpr":2, ... },"posOf1stDecl":"in.go:3:1"}`.
- **Inventário.** O `go/ast` é o menor inventário canônico entre as linguagens avaliadas — contra 133
  do Python, 239 do Java, 395 do TypeScript e 581 do C#. Duas contagens, ambas medidas, com a
  divergência declarada: **56** tipos que implementam `ast.Node` (têm método `Pos()`) e **60** structs
  exportados no pacote — a diferença são structs que não são nó (`Object`, `Scope`, `CommentMap`) e
  os recém-chegados `Directive`/`DirectiveArg`. Use a primeira como orçamento e a segunda como cerca:

```bash
grep -oE '^func \([a-z]+ \*[A-Za-z]+\) Pos\(\) token\.Pos' "$(go env GOROOT)/src/go/ast/ast.go" \
  | sed -E 's/.*\*([A-Za-z]+)\).*/\1/' | sort -u | wc -l    # 56
go doc go/ast | grep -cE "^type .* struct"                  # 60
go list std | wc -l                                         # 383 pacotes na stdlib
du -sh "$(go env GOROOT)"                                   # 269M
```

  Os builtins pré-declarados (`len`, `append`, `nil`, `error`, ...) saem do próprio compilador —
  **44** deles, o análogo exato do pacote `globals` do JavaScript:

```bash
cat > uni.go <<'EOF'
package main

import (
	"fmt"
	"go/types"
)

func main() { fmt.Println(len(types.Universe.Names())) }
EOF
go run uni.go    # 44
```

- **Invariantes globais a proibir.** `reflect` (todo o pacote), `unsafe`, `go:linkname`, `plugin`,
  `text/template`/`html/template` com template montado em runtime, e `go` (goroutine)/`select`/`chan`
  até a aula de concorrência.
- **Runner.** `go test -json ./...`, que é o formato mais limpo de todos: um evento JSON por linha
  com `Action` em `run`/`pass`/`fail` e o campo `Test`. Contagem exata sem regex de texto. Medido:

```bash
go test -json ./... | python3 -c "
import sys, json
runs=set(); passes=set(); fails=set()
for l in sys.stdin:
    try: e=json.loads(l)
    except: continue
    t=e.get('Test')
    if not t: continue
    {'run':runs,'pass':passes,'fail':fails}.get(e['Action'], set()).add(t)
print('run:', len(runs), 'pass:', len(passes), 'fail:', len(fails))"
# run: 2 pass: 2 fail: 0 ; tempo quente 511 / 199 / 233 ms
```

- **Armadilha de layout, verificada no repo.** O arquivo de teste **tem de** terminar em `_test.go`
  (o prefixo `test_` não significa nada) e ficar no **mesmo diretório e mesmo pacote**; senão
  `go test ./...` imprime `[no test files]` e sai **0** — falso positivo. Está documentado na §2.1 de
  [`references/languages.md`](../../skills/study-method/references/languages.md).
- **Custo de bootstrap.** Toolchain Go instalada (269 MiB) e um `go.mod` por desafio. Tempo medido:
  **12,6 s** a frio depois de `go clean -cache -testcache`, **0,53 a 0,7 s** com cache quente.
  O formato do `-json` está especificado em <https://pkg.go.dev/cmd/test2json>.

### Rust — Tier B

- **Parser.** Não há caminho JS/WASM: `syn-wasm`, `rust-syn-wasm` e `@rustwasm/syn` retornam 404 no
  registry. O caminho é o (b): um binário auxiliar em Rust com a crate `syn` (v3.0.4) e a crate
  satélite **`syn-serde`** (v0.3.2, `Apache-2.0 OR MIT`, atualizada 2026-02-27,
  <https://crates.io/api/v1/crates/syn-serde>), que serializa `syn::File` em JSON:
  `syn::parse_file(src)` seguido de `syn_serde::json::to_string_pretty(&file)`. Ressalva medida:
  `syn-serde` está travado em `syn 2.x` enquanto o `syn` livre já é 3.0.4, então as duas versões
  coexistem na árvore de dependências.
- **A toolchain não ajuda.** Confirmado nesta máquina, em `rustc 1.98.0`:

```bash
rustc -Zunpretty=ast-tree /tmp/x.rs
# error: the option `Z` is only accepted on the nightly compiler
```

  E `-Z ast-json` foi **removido de vez**, não apenas restrito ao nightly: em `rustc 1.100.0-nightly`
  a resposta é `error: unknown unstable option: 'ast-json'` (PR de remoção:
  <https://github.com/rust-lang/rust/pull/85993>). O substituto nightly `-Z unpretty=ast-tree`
  existe, mas emite o `Debug` do Rust, não JSON
  (<https://doc.rust-lang.org/unstable-book/compiler-flags/unpretty.html>).
- **Inventário.** Não há um "eslint-visitor-keys" oficial. O análogo mais próximo, contável, é o
  trait `syn::visit::Visit`, com **377** métodos `visit_*` no `syn 3.0.4` (eram 375 no 2.0.117) —
  `grep -c "fn visit_"` no fonte baixado pelo cargo. Por isso a Porta 2 fica **parcial**: é uma lista
  derivada de uma crate de terceiro, não um artefato publicado pelo projeto da linguagem.
- **Sem recuperação de erro.** `syn::parse_file` em código quebrado devolve `Err` puro, sem AST
  parcial (`cannot parse string into token stream`). Isso é pior que o clang para diagnosticar um
  starter propositalmente incompleto. A alternativa é a crate `ra_ap_syntax` (CST tolerante a erro,
  do rust-analyzer, `max_version 0.0.349`, 2026-08-24), que exige o mesmo binário auxiliar.
- **Invariantes globais a proibir.** `unsafe`, `mem::transmute`, `extern "C"`, `macro_rules!` e
  proc-macros (código Rust arbitrário rodando em tempo de compilação — o `eval` do Rust, invisível no
  fonte original), `include!()` e `build.rs`.
- **Runner.** O caminho estável é `cargo test` com saída de texto. **Não** existe JSON no stable, e a
  confusão comum tem de ser evitada: `--message-format json` é sobre a **compilação**, não sobre os
  testes. Medido nesta máquina:

```bash
cargo test -- --format json
# error: The "json" format is only accepted on the nightly compiler with -Z unstable-options
cargo test --message-format json
# só {"reason":"compiler-artifact",...} e {"reason":"build-finished",...};
# as linhas "test x ... ok/FAILED" continuam em TEXTO PURO
```

  **Armadilha de contagem, medida:** `cargo test` num crate com `src/lib.rs` e `tests/` imprime
  **três** blocos `running N tests` — unit tests da lib, testes de integração e doc-tests. Um regex
  ingênuo pega o primeiro, que costuma ser `running 0 tests`. Saída real do experimento:
  `running 0 tests` (lib), `running 2 tests` (integração), `running 0 tests` (doc-tests). O exit code
  de falha é **101**, não 1.
  A alternativa com JSON é `cargo-nextest` (v0.9.143) com
  `NEXTEST_EXPERIMENTAL_LIBTEST_JSON=1` e `--message-format libtest-json`, que funciona em **stable**
  mas é declaradamente experimental (<https://nexte.st/docs/machine-readable/libtest-json/>).
- **Custo de bootstrap.** O maior de todo o Tier B: `~/.rustup` = **1,5 GiB** e `~/.cargo` = **263 MiB**;
  o diretório `target/` de um crate trivial já ocupa **15M** (`du -sh target`). Tempo quente de
  `cargo test`: 134 / 110 / 116 ms.

### PHP — Tier B

- **Parser.** `php-parser` 3.7.0, BSD-3-Clause, publicado 2026-06-10, JS puro, sem dependências, com
  `types.d.ts`. As posições são **opt-in**: sem `new engine({ ast: { withPositions: true } })` o
  campo `loc` vem `undefined`.
- **Inventário.** Cada arquivo de `src/ast/` declara um `const KIND`:

```bash
npm view php-parser version license time.modified
curl -sL "$(npm view php-parser dist.tarball)" | tar xz
grep -rhoE 'const KIND = "[a-z0-9_]+"' package/src/ast/*.js | sort -u | wc -l   # 112 kinds
```

- **Invariantes globais a proibir.** `eval`, *variable variables* (`$$x`), *variable functions*
  (`$func()`), `call_user_func`/`call_user_func_array`, `extract`, `$obj->$prop` com propriedade
  dinâmica, `include`/`require` com caminho dinâmico. O próprio manual do PHP registra que variable
  variables quebram análise estática
  (<https://www.php.net/manual/en/language.variables.variable.php>) e cita Rasmus Lerdorf sobre
  `eval` (<https://www.php.net/manual/en/function.eval.php>).
- **Runner.** PHPUnit 13.3.2, BSD-3-Clause, publicado 2026-08-27 (<https://packagist.org/packages/phpunit/phpunit>),
  distribuído como PHAR — sem Composer. Saída parseável: `--log-junit <file>` (marcado *legacy* na
  doc atual) ou `--log-otr <file>` (Open Test Reporting, *recommended*). Contagem pelos atributos
  `tests=`/`failures=` do `<testsuite>`. TAP não existe mais nas versões modernas
  (<https://docs.phpunit.de/en/12.5/textui.html>).
- **Custo de bootstrap.** PHP não está instalado nesta máquina; o PHAR do PHPUnit é um arquivo só.

### C# / .NET — Tier B

- **Parser.** Roslyn (`Microsoft.CodeAnalysis.CSharp`) via um host `dotnet` auxiliar que chama
  `CSharpSyntaxTree.ParseText` e serializa `SyntaxNode.Kind()` + posição em JSON. **Não existe
  binding npm** — `npm view roslyn`, `roslyn-wasm` e `csharp-parser` retornam 404.
- **Inventário.** O enum `SyntaxKind`, com **581** membros na tabela oficial de
  <https://learn.microsoft.com/en-us/dotnet/api/microsoft.codeanalysis.csharp.syntaxkind>
  (contagem feita sobre as linhas da seção "Fields" da página, moniker `roslyn-dotnet-5.3.0`).
- **Invariantes globais a proibir.** `dynamic`, `unsafe`, reflexão (`Type.GetMethod`,
  `Activator.CreateInstance`, `MethodInfo.Invoke`), `System.Reflection.Emit`, e `CSharpScript`
  (o `eval` do .NET).
- **Runner.** `dotnet test --logger trx` — `trx` é o único logger nativo; **não há logger JSON** no
  SDK 8.0.130 (verificado com `dotnet test --help`). Para XML JUnit, `JunitXml.TestLogger` 8.0.0 MIT,
  publicado 2026-01-09 (<https://www.nuget.org/packages/JunitXml.TestLogger>), usado como
  `dotnet test --logger:"junit;LogFilePath=results.xml"`. Exit **1** em VSTest clássico e **2** em
  Microsoft.Testing.Platform.
- **Custo de bootstrap.** `du -sh /usr/share/dotnet` = **438M**; `time dotnet --version` = **0,562 s**
  só de cold-start do CLI, antes de restore/build/JIT do test host.

### Java — Tier B

- **Parser.** Duas opções, ambas com defeito nomeado. (a) `java-parser` 3.0.1 Apache-2.0, publicado
  2025-08-07 — CST rico do Chevrotain, com visitor gerado e `validateVisitor()` que **falha em build
  time** se uma regra não for coberta (excelente para a trava), mas o projeto que o mantinha migrou
  para tree-sitter no PR <https://github.com/jhipster/prettier-java/pull/811> (merge em 2026-03-08),
  então o pacote está órfão. (b) `tree-sitter-java-orchard` 0.5.15 MIT, publicado 2026-08-11, com
  `.wasm` e `src/node-types.json` inclusos — ativo, mas é fork de nicho.

```bash
npm view java-parser version license time.modified
curl -sL "$(npm view java-parser dist.tarball)" | tar xz
grep -rhoE '\$\.RULE\("[A-Za-z0-9]+"' package/src/productions/*.js | sort -u | wc -l   # 239 regras
grep -cE 'createToken\(' package/src/tokens.js                                        # 75 tokens
```

- **Inventário.** As 239 regras acima, ou os 153 tipos nomeados do `node-types.json` do
  tree-sitter-java. A gramática canônica da linguagem é o capítulo 19 da JLS
  (<https://docs.oracle.com/javase/specs/jls/se21/html/jls-19.html>).
- **Por que P1 é "parcial".** Nenhuma das duas opções faz **resolução de nomes ou de tipos**. Java
  herda a limitação do Tier C descrita em §4, com o agravante de que a linguagem é fortemente
  orientada a método (`obj.metodo()` em todo lugar).
- **Invariantes globais a proibir.** `java.lang.reflect` inteiro, `Class.forName`, `MethodHandles`,
  proxies dinâmicos, `sun.misc.Unsafe`, e carregamento dinâmico de classe.
- **Runner.** JUnit console standalone, série **6.1.3** (o versionamento Platform/Jupiter unificou em
  JUnit 6 — se houver lógica assumindo "5.x", ela quebra). O jar tem 2.997.949 bytes
  (`curl -sI https://repo1.maven.org/maven2/org/junit/platform/junit-platform-console-standalone/6.1.3/junit-platform-console-standalone-6.1.3.jar`).
  Comando: `java -jar junit-platform-console-standalone-6.1.3.jar execute --scan-classpath --reports-dir=out --details=tree`.
  Contagem: o banner do console já sai grep-ável — `[ N tests found ]`, `[ N tests successful ]`,
  `[ N tests failed ]` — e `--reports-dir` grava XML JUnit clássico.
- **Armadilha verificada no repo.** No caminho zero-install (sem JUnit), `assert` da JVM é
  **desabilitado por padrão**: sem `-ea`, o desafio sempre "passa". Está na §2.5 de
  [`references/languages.md`](../../skills/study-method/references/languages.md).
- **Custo de bootstrap.** `du -sh /usr/lib/jvm/java-17-openjdk` = **426M**; `time java -version` =
  **0,164 s**.

### Lua — Tier B

- **Parser.** `luaparse` 0.3.1 MIT — mas publicado em **2022-06-19** e limitado às versões 5.1, 5.2 e
  5.3, enquanto o `lua` sem sufixo desta máquina é **5.5.1**. Esse descasamento é o trabalho a fazer:
  ou se fixa a trilha em 5.3 (e se invoca o binário certo, já que `lua5.1` e `lua5.4` também estão
  instalados), ou se troca o parser por tree-sitter ou `wasmoon`.

```bash
npm view luaparse version license time.modified
curl -sL "$(npm view luaparse dist.tarball)" | tar xz
grep -oE "type: '[A-Za-z]+'" package/luaparse.js | sort -u | wc -l   # 30 tipos de nó
grep -oE "'5\.[0-9]'" package/luaparse.js | sort -u | tr '\n' ' '    # '5.1' '5.2' '5.3'
lua -v                                                               # Lua 5.5.1
```

- **Inventário.** É o menor de todas as linguagens avaliadas: a gramática **completa** cabe numa
  página do manual (seção 9). Mas o inventário **não é estável entre versões menores**, e isso é o
  achado mais instrutivo desta ficha: Lua 5.4 tem **25** produções BNF e Lua 5.5 tem **26** (entrou
  `varargparam`); e a lista de palavras reservadas passou de 22 para 23, com `global` virando
  palavra-chave. Ou seja, "Lua" não é uma gramática só — a trilha tem de fixar a versão exata.

```bash
for v in 5.4 5.5; do printf '%s: ' "$v"; curl -s https://www.lua.org/manual/$v/manual.html | python3 -c "
import re,sys
h=sys.stdin.read(); i=h.find('The Complete Syntax of Lua')
txt=re.sub(r'<[^>]+>','',h[i:i+9000])
p=re.findall(r'^\s*(\w+)\s*::=', txt, re.M); print(len(p))"; done
# 5.4: 25   5.5: 26   (a nova é varargparam)
curl -s https://www.lua.org/manual/5.5/manual.html | grep -A8 'keywords are reserved' | grep -o 'global'
# global   -> palavra reservada nova em 5.5, ausente em 5.4
lua -e 'local n=0 for k,v in pairs(_G) do n=n+1 end print(n)'   # 36 globais em _G
ls /usr/bin/lua*   # a máquina tem lua5.1, lua5.4, lua5.5 (o `lua` sem sufixo é 5.5.1) e luajit
```

  Discrepância honesta: apesar de o manual 5.5 listar `global` como reservada, o binário
  `lua5.5` desta máquina ainda aceita `local global = 7` e imprime `7` — a doc está à frente da
  implementação empacotada. **Não investiguei a causa.**

- **Invariantes globais a proibir.** `load`/`loadstring`/`dofile`, `_G["nome"]` com chave não
  literal, metatables com `__index`/`__newindex`, e `setfenv` (5.1).
- **Runner.** `lua tests/test_stub.lua` com `assert()` nativo, exit **1** em falha — verificado no
  repo (§3.1 de [`references/languages.md`](../../skills/study-method/references/languages.md)).
  **Não há contagem de testes**: só o guard estático `grep -cE 'assert\s*\('`. Essa é a peça a
  inventar — uma convenção de contagem (por exemplo, um mini-harness em Lua que imprime TAP).
- **Custo de bootstrap.** `lua` já está instalado. Alternativa embarcada: `wasmoon` 1.16.0 MIT
  (2026-04-25), "a real lua VM with JS bindings made with webassembly" — permitiria rodar Lua dentro
  do Node, sem toolchain. **Não testado.**

### SQL (dialeto SQLite) — Tier B

- **Parser.** Três opções verificadas: `node-sql-parser` 5.4.0 Apache-2.0 (2026-01-12, multi-dialeto),
  `sql-parser-cst` 0.42.1 **GPL-2.0-or-later** (2026-06-02, CST completo, suporte "full" a SQLite) e
  `libpg-query` 17.7.4 MIT (2026-08-22, o parser real do PostgreSQL em WASM). A licença GPL do
  `sql-parser-cst` é decisão de produto, não técnica.
- **Inventário.** Não existe lista canônica gratuita: a ISO/IEC 9075 é paga. Por isso a recomendação
  é fixar **um** dialeto e usar a gramática publicada dele como inventário —
  <https://www.sqlite.org/lang.html> tem diagramas de sintaxe por versão e é a menor e mais estável.
- **Invariantes globais a proibir.** SQL montado por concatenação de string, `ATTACH DATABASE`,
  `PRAGMA`, e funções definidas pelo usuário.
- **Runner.** `node:sqlite` — embutido no Node, **sem flag**, verificado nesta máquina:

```bash
node -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE t(a INTEGER, b TEXT)');
db.exec(\"INSERT INTO t VALUES (1,'um'),(2,'dois')\");
console.log(JSON.stringify(db.prepare('SELECT * FROM t ORDER BY a').all()));"
# [{"a":1,"b":"um"},{"a":2,"b":"dois"}]  no Node v24.19.0
```

  A flag `--experimental-sqlite` foi removida em v22.13.0/v23.4.0; no Node 24 o módulo ainda é
  experimental (a doc marca "Release Candidate" só a partir da v25.7.0 —
  <https://nodejs.org/api/sqlite.html>).
- **Consequência de schema.** Os testes são escritos em **JavaScript** (`node:test` + `node:sqlite`),
  não em SQL. Logo o desafio consome **dois** orçamentos: o produtivo em SQL e o receptivo em JS.
  Ver §6.
- **Custo de bootstrap.** Zero — nada além do Node.

### HTML — Tier B

- **Parser.** `parse5` 8.0.1 MIT (2026-04-19), spec-compliant com o WHATWG HTML Living Standard.
- **Inventário.** Os índices canônicos do WHATWG:
  <https://html.spec.whatwg.org/multipage/indices.html> — tabela de elementos com categorias, pais,
  filhos, atributos e interface, mecanicamente reprocessável.
- **Invariantes globais a proibir.** `<script>` (senão o desafio vira JavaScript disfarçado),
  atributos `on*`, e `javascript:` em `href`/`src`. HTML não tem metaprogramação em parse time, o que
  torna esta a Porta 3 mais fácil de todas.
- **Runner.** `node --test` sobre a árvore do `parse5`. **Não testado por execução nesta pesquisa.**
- **Consequência de schema.** Igual à do SQL: o teste é JS.

### CSS — Tier B

- **Parser.** `css-tree` 3.2.1 MIT (2026-03-05), que tem *lexer de validação* contra as sintaxes W3C
  (`csstree.lexer.matchProperty`); ou `postcss` 8.5.26 MIT (2026-08-06) para a árvore crua.
- **Inventário.** `mdn-data` 2.34.0 **CC0-1.0** (2026-08-29): JSON com at-rules, funções,
  propriedades, seletores, sintaxes, tipos e unidades — o melhor inventário enumerável de toda esta
  pesquisa, e é a mesma fonte usada pelo lexer do `css-tree`. **Ressalva:** o próprio README do
  `mdn-data` anuncia deprecação em favor de `w3c/webref` (não verificado).
- **Invariantes globais a proibir.** `@import` com URL dinâmica, `expression()` (IE legado) e
  `-webkit-`/`-moz-` até a aula de compatibilidade.
- **Runner.** Comparação estrutural de declarações via `css-tree` dentro de `node --test`. Geometria
  e layout reais exigiriam Playwright (1.62.1 Apache-2.0), e `jsdom` **não serve**: o próprio README
  declara que cálculo de layout está fora de escopo. **Não testado por execução.**

---

## 6. O que muda no schema

Hoje o schema aceita uma linguagem só. Em
[`trackTypes.ts`](../../app/electron/main/content/trackTypes.ts):

```ts
export type TrackChallengeLanguage = 'nodejs';
// e, em validateChallengeSource:
if (c.language !== 'nodejs') issues.push({ file, message: `language inválido: ...` });
```

O primeiro problema é conceitual: **`'nodejs'` não é uma linguagem, é um runtime.** A linguagem é
`javascript`; `nodejs` é o par (toolchain, runner). Enquanto os dois estiverem no mesmo campo, é
impossível dizer "TypeScript rodando em Node" ou "JavaScript rodando em Deno".

### O que passa a ser POR LINGUAGEM

Um registro de adaptadores, um por linguagem, com estas responsabilidades:

| Peça | O que é | Exemplo hoje (hardcoded) |
|---|---|---|
| `parse(source) -> AST` | Adaptador de Porta 1, devolvendo nós normalizados com `type`, `line`, `column` | acorn/babel implícito |
| `constructKey(node)` | Como um nó vira item de orçamento (tipo + atributo, não só tipo) | `BinaryExpression[operator='!==']` |
| `inventory()` | Enum fechado de tipos de nó, para materializar o complemento | `Object.keys(evk.KEYS)` |
| `globals()` / `builtins()` | Enum de nomes globais, para o eixo `globals` | pacote `globals` |
| `resolveScopes(AST)` | Quais nomes são globais, locais, importados (o que separa Tier A de Tier C) | `eslint-scope` |
| `forbiddenInvariants` | Lista de Porta 3, proibida em qualquer nível | `eval`, `new Function`, `obj[expr]` |
| `layout(challenge)` | Nomes e caminhos dos arquivos do desafio, e o manifesto obrigatório | `package.json` + `solution.mjs` + `test.mjs` |
| `filePathPattern` | Regex de caminho seguro por extensão | `SAFE_FILE_PATH_RE` (`\.mjs$` fixo) |
| `testCommand` | Comando exato e flags | `['--test','--test-reporter=spec','test.mjs']` |
| `countDeclared(testsCode)` | Contagem estática de testes no fonte | `countTestDeclarations` (`\btest\(`) |
| `countRun(output)` | Contagem dinâmica na saída | `parseSpecCounts` (`ℹ tests N`) |
| `parseChecks(output)` | Checks individuais para a UI | `parseSpecChecks` (`✔`/`✖`) |
| `failureExitCodes` | Como se reconhece falha (quase nunca é 1) | `code !== 0` |
| `envScrub` | Variáveis de ambiente que envenenam o filho | `delete env.NODE_TEST_CONTEXT` |
| `detect()` | `command -v` + versão, e a mensagem de degradação | `nodeBinary()` |

Três observações que só aparecem quando se olha o código atual:

1. **`SAFE_FILE_PATH_RE` está travado em `.mjs`.** Com Go o arquivo tem de terminar em `_test.go` e
   ficar no mesmo pacote; com Java o nome do arquivo tem de ser exatamente o da classe pública; com
   Rust o fonte vive em `src/`. O regex vira um campo do adaptador, e o `layout` deixa de ser
   implícito.
2. **`envScrub` tem de virar allowlist, não denylist.** Hoje só `NODE_TEST_CONTEXT` é removido. Cada
   linguagem tem o seu veneno (`GOFLAGS`, `GOCACHE`, `RUSTFLAGS`, `CARGO_TARGET_DIR`, `PYTHONPATH`,
   `CLASSPATH`, `DOTNET_*`), e a lista nunca vai estar completa. O correto é montar o ambiente do
   filho a partir de uma allowlist explícita mais `LC_ALL=C.UTF-8 TZ=UTC PYTHONHASHSEED=0`, como já
   manda a §7 de [`references/languages.md`](../../skills/study-method/references/languages.md).
3. **`passed = code === 0 && ...` não é universal.** R sai 0 com teste quebrado; Go sai 0 quando não
   achou arquivo de teste; Node sai 0 com arquivo de teste vazio. O gate de igualdade duplo é o que
   salva, e ele tem de continuar obrigatório em toda linguagem — nunca só o exit code.

### O que continua COMUM

A álgebra do orçamento é agnóstica de linguagem e não deve ser duplicada: `introduces` em duas
faixas, a derivação `cumulative(N)` por ordem topológica, as três direções (contenção receptiva,
contenção produtiva, puxada), o formato do relatório com `arquivo:linha:coluna` e
`primeiraAulaQueEnsina`, e as provas por execução (solução passa, starter falha, contagem bate).
Também continuam comuns as regras de slug, `schemaVersion` e integridade de referências validadas
pelo loader.

### A forma dos campos novos

```jsonc
// track.json
{
  "schemaVersion": 2,
  "language": "pt-BR",              // idioma da PROSA (já existe, não confundir)
  "programmingLanguage": "python",  // NOVO: a linguagem que a trilha ensina
  "runtime": "cpython-3.14",        // NOVO: toolchain + versão pinada (o inventário depende dela)
  "harnessLanguage": "python"       // NOVO: em que linguagem os testsCode são escritos
}
```

O campo `harnessLanguage` é o que resolve o caso SQL/HTML/CSS, em que o desafio é escrito numa
linguagem e testado em outra. Quando ele difere de `programmingLanguage`, a faixa **receptiva** passa
a ser a união de dois orçamentos, um por linguagem — e o gate precisa saber qual adaptador aplicar a
qual artefato.

```jsonc
// challenge.json
{
  "language": "python",             // deriva de track.programmingLanguage; o loader confere igualdade
  "files": [{ "path": "solucao.py", "starterCode": "...", "solutionCode": "..." }]
}
```

```jsonc
// lesson.json — o campo que ainda não existe e é o coração da trava
{
  "introduces": {
    "productive": { "nodeTypes": [], "operators": {}, "globals": [], "members": [], "imports": [] },
    "receptive":  { "nodeTypes": [], "operators": {}, "globals": [], "members": [], "imports": [] }
  }
}
```

O `enum` de `nodeTypes` é **gerado** do `inventory()` do adaptador da linguagem, nunca digitado, e
`productive ⊆ receptive` é invariante de schema. Um detalhe importante:
`TrackTheorySection.code.language` hoje é uma string livre; ela precisa passar a ser um enum, porque
é ela que diz ao extrator qual parser aplicar a cada bloco cercado da teoria — e 68 de 262 blocos da
trilha atual não têm tag de linguagem nenhuma.

---

## 7. Ordem de implementação recomendada

1. **JavaScript.** Não é escolha, é obrigação: é a linguagem da trilha que já existe e tem 32% de
   desafios violando a trava. Nenhuma peça nova. Entrega a engine inteira, os adaptadores como
   conceito, e o relatório de violação — que é o produto real.
2. **TypeScript.** Praticamente de graça depois de (1): mesmo runner, mesmo ecossistema, `SyntaxKind`
   no lugar do ESTree. Vale antes de Python por um motivo não óbvio: é aqui que se descobre se a
   arquitetura de adaptadores aguenta uma **segunda camada de trava** (a semântica de tipos). Se ela
   não aguentar, é melhor descobrir com uma linguagem cujo runner já funciona.
3. **Python.** A primeira linguagem de verdade nova, e a que tem o melhor retorno: público enorme,
   `ast` e `symtable` na stdlib, interpretador quase universal, e nenhum binário auxiliar. É aqui que
   se prova que o adaptador de Porta 1 pode ser um **subprocesso** e não só uma lib npm — o que
   desbloqueia Go, C# e todo o resto do Tier B.
4. **Go.** Primeiro Tier B de fato. Escolhido antes de Ruby por três razões: o inventário é o menor
   (56 tipos), a contagem de testes é a mais limpa (`go test -json`), e o binário auxiliar em Go é o
   protótipo mais simples possível do padrão "toolchain emite AST" que C#, Kotlin e Swift vão reusar.
5. **Ruby.** O parser é excelente e não custa nada (`@ruby/prism`, WASM, 484 KB); o trabalho é todo
   do lado do runner. Fazer depois de Go significa que o runner já será o quarto, não o primeiro.
6. **SQL, HTML e CSS**, nesta ordem, se e quando o produto quiser sair de "linguagem de programação".
   São baratos porque o runner é o de JavaScript, mas são os que forçam o campo `harnessLanguage` —
   e por isso não devem vir antes de a álgebra de orçamento estar estável.
7. **PHP, C#, Java, Lua e Rust** conforme a demanda de aluno. Nenhum abre caminho para os outros; são
   folhas. Rust fica por último dentro do Tier B por causa do custo: 1,5 GiB de toolchain, um binário
   auxiliar em Rust para o AST, e um runner que ou é texto com armadilha de contagem ou é um
   `cargo install` a mais em modo experimental.
8. **Tier C só sob encomenda,** e sempre com a limitação escrita no material: "nesta linguagem a
   trava confere sintaxe, não nomes". Vender Tier C como Tier A é a única forma garantida de destruir
   a confiança no gate.

Duas linhas que não devem ser cruzadas: **nunca** promover uma linguagem a Tier A sem resolução de
escopo, e **nunca** aceitar Porta 4 sem contagem de testes — as duas são exatamente os furos que
produziram os 32% de hoje.

---

## 8. O que não foi verificado

Coisas que este documento **afirma com base em documentação, não em execução nesta máquina**:

- **Ruby, PHP, Elixir, Dart, Haskell, R, Julia, Swift, Kotlin, Scala e Zig não estão instalados**
  aqui (comprovado pelo laço de `command -v` do topo). Toda afirmação sobre o runner dessas
  linguagens vem da documentação oficial ou de
  [`docs/research/06-toolchains.md`](../../docs/research/06-toolchains.md) e
  [`references/languages.md`](../../skills/study-method/references/languages.md), não de execução
  nesta sessão.
- **`@ruby/prism` foi carregado e parseou código Ruby** numa verificação de subagente, mas eu não
  reexecutei esse teste; o que confirmei em primeira mão foi o conteúdo do pacote (o `prism.wasm` de
  491.965 bytes e as 151 classes de `nodes.js`).
- **`wasmoon`, `@ruby/wasm-wasi` e `pyodide` não foram executados.** O tempo de boot do Pyodide não
  foi medido; os tamanhos citados vêm dos assets de release.
- **`parse5`, `css-tree`, `mdn-data`, `libpg-query`, `sql-parser-cst`, `node-sql-parser`,
  `php-parser`, `luaparse`, `java-parser`, `web-tree-sitter` e as grammars tree-sitter não foram
  instalados** — só consultados no registry (`npm view`) e, quando indicado, inspecionados via
  tarball. Nenhum `npm install` foi executado e `package.json`/`node_modules` não foram tocados.
- **Nenhum smoke test real de parse** foi feito para a maioria dos parsers de Tier B. As exceções,
  executadas de fato nesta sessão: `@babel/parser` e `acorn` (JavaScript), `ast`/`symtable` (Python),
  `go/ast` (Go), `clang -Xclang -ast-dump=json` (C).
- **`syn` + `syn-serde` (Rust) e `std.zig.Ast` (Zig) foram testados ponta a ponta por subagente**, não
  por mim; o mesmo vale para a medição de 58,5 MB do dump C++ com `#include <vector>`, para os
  números de `cargo-nextest` e para o tarball do Zig 0.16.0. Eu reexecutei e confirmei em primeira
  mão apenas: a recusa do `-Z` no rustc stable, a recusa do `--format json` do `cargo test`, os três
  blocos `running N tests`, a invisibilidade da macro no AST do clang, e as contagens de `go/ast`,
  `go/types.Universe` e `go list std`.
- **A divergência de contagem do `go/ast` (56 contra 60) não foi reconciliada.** As duas medições
  estão no documento com o comando de cada uma; a hipótese é que a diferença sejam structs que não
  implementam `ast.Node`, mas isso não foi confirmado item a item.
- **Não testei `webr`, `cargo-nextest`, `CMocka`, `Check`, `Catch2` nem `GoogleTest`** — as flags
  vêm da documentação oficial linkada, não de execução.
- **A API de AST do TypeScript 7 (`typescript/unstable/ast`) não foi testada.** A recomendação de
  fixar `5.9.x` é conservadora e pode ficar obsoleta rápido.
- **A viabilidade de HTML/CSS/SQL como Tier B não foi provada por execução** — nenhum desafio de
  exemplo foi montado e rodado. É um julgamento de arquitetura, não uma medição.
- **Os números de contagem de node types de tree-sitter** (129 Python, 112 Go, 151 Java, 149 Ruby)
  foram medidos por subagente com os comandos `curl`+`jq` listados em §4; eu não os reexecutei.
- **O orçamento de WebSearch da sessão esgotou-se (200/200)** no meio da pesquisa. A partir daí toda
  a evidência veio de `WebFetch` em URLs escolhidas, `curl`, `gh api` e `npm view` — o que na prática
  aumentou o rigor (código-fonte real em vez de resumo de busca), mas significa que **não houve
  varredura ampla** de "existe um pacote que eu não conheço" para as linguagens de nicho (OCaml, Nim,
  Crystal, V, Fortran, Ada, F#, Clojure).
- **Elixir, Dart, Haskell, R e Julia** receberam tratamento mais raso do que as demais: a
  classificação delas apoia-se no que os arquivos de referência do repo já provaram por execução, na
  cobertura tree-sitter e em documentação — não numa investigação exaustiva de cada ecossistema.
  Fatos coletados mas **não** aprofundados neste documento: o Dart muda a gramática a cada 2 a 4
  meses (3.0 records e patterns em maio/2023, 3.3 extension types, 3.7 wildcard `_`, 3.10
  dot-shorthand, 3.12 parâmetros nomeados privados, 3.13 primary constructors em agosto/2026 —
  <https://dart.dev/resources/language/evolution>), o que inviabiliza inventário fixo sem
  `// @dart=3.x`; e o Julia separa formalmente os *heads* de sintaxe de superfície (`:call`, `:if`,
  `:for`, `:function`, `:macrocall`) dos de forma reduzida
  (<https://docs.julialang.org/en/v1/devdocs/ast/>), o que seria a base do inventário — mas está sob
  "Developer Documentation", sem garantia de API pública.
- **Os percentuais 32% e 47%** vêm dos dossiês de pesquisa desta sessão
  (`dim-controlled-vocabulary.md`, `brief-engenharia.md`), que ficam no scratchpad e **não** no
  repositório; os denominadores (18 módulos, 118 aulas, 136 desafios) foram reconferidos por mim com
  os `find` do §1, mas os numeradores não.

Medições que **eu fiz nesta sessão** e que sustentam o texto, além das já citadas nas fichas:

```bash
# Rust 1.98.0: o dump de AST é nightly-only, e o formato JSON de teste também
rustc -Zunpretty=ast-tree /tmp/x.rs
# error: the option `Z` is only accepted on the nightly compiler
cargo test -- --format json
# error: The "json" format is only accepted on the nightly compiler with -Z unstable-options
cargo test          # 3 blocos "running N tests" (lib, integração, doc-tests) — armadilha de contagem
# tempo quente 134 / 110 / 116 ms; du -sh target = 15M para um crate trivial

# C: o pré-processador acontece ANTES do parse, e o AST resultante não é o do aluno
printf 'int soma(int a, int b) { return a + b; }\n' > c2.c
clang -Xclang -ast-dump=json -fsyntax-only c2.c | wc -c        #  10295 bytes
printf '#include <stdio.h>\nint soma(int a,int b){return a+b;}\n' > c1.c
clang -Xclang -ast-dump=json -fsyntax-only c1.c | wc -c        # 652047 bytes — 63x maior

# Lua: a gramática "de uma página" muda entre 5.4 e 5.5
ls /usr/bin/lua*                              # lua5.1, lua5.4, lua5.5 (o `lua` é 5.5.1) e luajit
lua -e 'local n=0 for k,v in pairs(_G) do n=n+1 end print(n)'   # 36

# Go: as três contagens do inventário
go doc go/ast | grep -cE "^type .* struct"    # 60
go list std | wc -l                           # 383
du -sh "$(go env GOROOT)"                     # 269M
```
