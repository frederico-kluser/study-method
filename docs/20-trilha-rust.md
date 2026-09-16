# 20 — Os quatro cursos de Rust

> **Contrato de CONTEÚDO dos quatro cursos de Rust.** Não é "Rust do zero" nem "Rust avançado" —
> é **a cadeia de Rust**, da primeira função até o que se cobra de uma pessoa sênior. Este documento
> define O QUÊ cada módulo e cada aula ensinam e o que se presume que o aluno já sabe. Ele é o INSUMO
> da engine: a coluna `Ensina` vira `introduces` e a coluna `Presume` vira o grafo de pré-requisitos
> e o orçamento cumulativo de [`16-engine-de-trilha.md`](16-engine-de-trilha.md) §3.5.
>
> **Espelho.** Este documento é para Rust o que [`17-trilha-python.md`](17-trilha-python.md) é para
> Python: a cadeia dos quatro cursos (§0), os módulos porta-de-entrada (§1), o desenho integral do
> INICIANTE aula a aula (§2), os cursos seguintes por matéria (§3), a contagem (§4), o split das
> ondas de conteúdo (§5) e as fontes oficiais por módulo (§6). Onde este documento e
> [`16-engine-de-trilha.md`](16-engine-de-trilha.md) divergirem, o 16 vence. Onde este documento e um
> gate determinístico divergirem, o gate vence — e este documento está errado.
>
> **Base.** O adaptador REAL (`app/electron/main/engine/lang/rust.ts` + `vocab/rs/extract_ast.mjs`),
> cujo inventário de **190 chaves** (`app/electron/main/engine/vocab/atoms.rust.json`, gerado do
> corpus `app/tests/fixtures/rust/corpus.rs` pela toolchain **1.98.1**) é o VOCABULÁRIO FECHADO desta
> trilha; os fatos de toolchain medidos em [`research/06-toolchains.md`](research/06-toolchains.md)
> (ficha Rust: `cargo test` zero-install, exit **101**, o footgun do filtro por nome curto); e a
> fixture viva `app/tests/fixtures/tracks/trilha-rust-minima/` — a aula `a-primeira-funcao` com o
> desafio `dobre-o-numero` é o EXEMPLO VIVO das cláusulas de autoria deste contrato (§"A regra de
> orçamento medida").
>
> ⚑ **Divergência declarada, não resolvida em silêncio.** O cabeçalho de
> `lang/rust.ts` diz que o contrato da trilha Rust "ainda não existe" e o chama de `docs/19` —
> `docs/19-auditoria-da-aula.md` é outro documento. **Este documento (`docs/20`) é o contrato**; a
> atualização do comentário do adaptador é dívida declarada (nada de código foi tocado nesta onda).

## 0. Visão — os quatro cursos

A cadeia tem quatro cursos; o iniciante é desenhado POR INTEIRO aqui (§2) e os três seguintes por
módulo (§3). Cada curso ganha, quando preciso, um módulo porta-de-entrada (§1). As fronteiras são
por **competência** — o que a pessoa consegue fazer sozinha —, nunca por rótulo
([`skills/trilha-author/references/interligacao.md`](../skills/trilha-author/references/interligacao.md) §2).

| Slug | Título | Módulos | Aulas | Fronteira de SAÍDA (o que o aluno passa a conseguir) | `entryCriteria` (o que o curso presume ao entrar) |
|---|---|---|---|---|---|
| `rust-iniciante` | Da primeira função ao júnior-Rust | M1–M8 | **101** | **júnior-Rust** — escrever um crate inteiro sozinha: funções com parâmetro e retorno, decisão com `if`/`match`, laços, structs com métodos, enums que carregam valor, `Vec`/`HashMap`/`String`, e — o centro da linguagem — explicar e APLICAR dono, movimento e empréstimo (`&T`/`&mut T`) sem lutar contra o compilador (fim do M8) | **nada** — zero absoluto: estruturais + semente receptiva do harness (§"A semente receptiva do harness Rust") |
| `rust-intermediario` | Do júnior-Rust ao pleno | `a-porta-dos-emprestimos` + I1–I7 | **14 + 86 = 100** (previstas) | **pleno** — usar a linguagem como ela é: traits e genéricos como contratos, closures e iteradores em vez de laços manuais, erros que PROPAGAM (`?`) em vez de `unwrap`, lifetime anotado, código em módulos, testes que a PRÓPRIA pessoa escreve (fim de I7) | a saída do iniciante — o júnior-Rust de M1–M8, com o empréstimo re-introduzido na porta |
| `rust-avancado` | Do pleno ao sênior, medindo | `a-porta-da-medicao` + A1–A3 | **8 + 28 = 36** (previstas) | **sênior** — **medir** antes de decidir (a coleção certa, o `clone` que custa), empacotar e distribuir com o `cargo`, impor qualidade por ferramenta (clippy/rustfmt) | a saída do intermediário — o pleno de I1–I7 |
| `rust-especialista` | Padrões de projeto e o capô da memória | `a-porta-dos-padron` + E1–E3 | **9 + 33 = 42** (previstas) | **sênior** — escolher (e recusar) padrão de projeto em Rust (newtype, builder, typestate, state machine com enum) e abrir o capô: `Box`, contagem de referência, interior mutability, `Drop` e `Send`/`Sync` | a saída do avançado — o sênior de A1–A3 |

**Total da cadeia: 24 módulos · 279 aulas** — 101 medidas (o iniciante, §2) + 178 previstas (§1 e
§3). O número de aulas do iniciante é **saída, não entrada** ([`16`](16-engine-de-trilha.md) §3.6):
consequência de aplicar o teto de ≤2 construções produtivas novas por aula (pela regra do par,
§"A regra do par") à progressão atômica. Nenhum dos números foi escolhido: foi contado sobre as
tabelas — e a contagem final sai das tabelas autoradas, não deste resumo.

## 1. A cadeia de interligação e os módulos porta-de-entrada

**Por que cada curso é autocontido para a engine.** O orçamento cumulativo é derivado **por trilha**
([`16`](16-engine-de-trilha.md) §3.5 — P-CADEIA da skill
[`trilha-author`](../skills/trilha-author/SKILL.md)): `budget_entrada(N) = entryConstructs ∪
fecho-para-baixo(desbloqueado_por(N))`, e `entryConstructs` é **estruturais + semente receptiva do
harness** — **não existe entrada declarada por construção**. Uma trilha não pode declarar "o aluno
já sabe empréstimo": o que ele sabe, ele introduz nas próprias aulas. Para a engine, o curso
`rust-intermediario` é uma trilha **nova**, o orçamento dela começa na semente, e as construções de
empréstimo que I1+ presume têm de nascer **dentro** dela.

**A consequência de design: o módulo porta-de-entrada.** O primeiro módulo de cada curso seguinte
re-introduz, em aulas próprias, as construções de fronteira que o curso anterior ensinou — aulas
novas, escritas para quem vem do curso anterior, com `introduces` próprios. Para o aluno, a porta é
revisão espaçada; para a engine, é autocontenção. **A regra de fechamento (normativa):** ao autorar
a trilha de um curso, todo átomo produtivo que as tabelas do curso usam e que não tem origem naquela
trilha (nem na semente, nos estruturais nem nas derivadas da regra do par) **tem de ganhar a sua
aula no módulo porta** — a porta é a lista a completar, não a lista final. As portas abaixo declaram
o conteúdo **previsto**.

### A porta do intermediário — `a-porta-dos-emprestimos` (14 aulas previstas)

Re-introduz o que M1–M8 ensinou e I1+ presume: a função com assinatura completa
(`node:FunctionItem` + parâmetro + tipo), a ligação mutável (`decl:let-mut`), a `String` dona e a
cópia (`api:String::from`, `api:.clone`), o movimento e a função que consome, o empréstimo inteiro
(`node:ReferenceType`, `op:unary:&`, `node:MutableReference`, `op:unary:*`), a estrutura com método
(`node:StructItem`, `node:StructExpression`, `node:ImplItem`, `node:SelfParameter`), o enum com
`match` (`node:EnumItem`, `node:MatchExpression`, `node:MatchArm`, `node:TupleStructPattern`,
`global:Some/None/Ok/Err`) e as coleções (`api:vec!`, `api:.push`,
`api:std::collections::HashMap`, `api:HashMap::new`, `api:.insert`, `node:ForExpression`,
`op:range:..`, `api:format!`, `api:println!`).

### A porta do avançado — `a-porta-da-medicao` (8 aulas previstas)

Re-introduz o que o intermediário ensinou e A1+ presume: trait com bound e tipos genéricos
produtivos, closure e os adaptadores de iterador (`map`/`filter`/`collect`), o erro próprio que
propaga, `mod`/`use`/`pub` produtivos e o `#[test]` que a própria pessoa escreve.

### A porta do especialista — `a-porta-dos-padron` (9 aulas previstas)

Re-introduz o que o avançado ensinou e E1+ presume: trait como contrato, genéricos com bound,
closure/iterator, erro próprio, e o `Rc`/`Arc` do compartilhamento.

---

## 2. O conteúdo pedagógico — o `rust-iniciante`

### A aula 1 é uma função, e é a linguagem que decide

> "TODOS OS CURSOS COMECAM DO ZERO E VAO ATE O SENIOR" — a ordem do dono vale aqui como vale em
> [`17-trilha-python.md`](17-trilha-python.md). Do zero **não** significa "a aula 1 do Python, mas
> em Rust": significa **a primeira construção produtiva da linguagem**.

Em Python a primeira linha possível é um script: `print("oi")`. **Em Rust, não existe script.** O
fonte do aluno é `src/lib.rs` — uma **crate de biblioteca** (`RS_ENTRY_PATH` em `lang/rust.ts`) — e
a raiz de uma crate só tem **itens**: função, struct, constante. O runner é `cargo test`, que
**coleta funções de teste** e as faz CHAMAR o que o aluno escreveu. A primeira coisa produtiva que
existe em Rust é, portanto, uma função:

```rust
pub fn dobro(x: i32) -> i32 {
    x * 2
}
```

É a aula `a-primeira-funcao` — e ela já existe: é a fixture viva
`app/tests/fixtures/tracks/trilha-rust-minima/modules/modulo-1/lessons/a-primeira-funcao/`. Este
contrato a adota como aula 1 da cadeia, e a lesson.json da fixture é o `introduces` NORMATIVO da
aula 1, com uma correção de leitura: as seis chaves que ela declara produtivas —
`node:FunctionItem`, `node:Parameters`, `node:Parameter`, `node:IntegerLiteral`, `op:binary:*`,
`node:BinaryExpression` — contam **dois** itens pela regra do par (§"A regra do par"): a assinatura
(`node:FunctionItem` com `node:Parameters` + `node:Parameter`) e o `x * 2` do desafio
(`node:IntegerLiteral` + `op:binary:*` com `node:BinaryExpression`).

### A tela — e por que o canal é VALOR desde a aula 1

[`17-trilha-python.md`](17-trilha-python.md) tem a progressão de canal impressao → ambos → retorno,
porque o `unittest` consegue capturar `stdout` com `runpy` + `redirect_stdout`. **O harness Rust não
tem esse caminho.** Com `[dependencies]` vazio (stdlib only) e `[lib] test = false`, o `cargo test`
não captura a saída do programa do aluno — capturar `stdout` de outro processo exigiria
`std::process::Command`, que está fora do vocabulário fechado e abriria a porta exata que as
proibições fecham. A "tela" de Rust (`println!`) é ensinada — o aluno a digita —, mas **o canal do
desafio é VALOR desde a aula 1**: o teste importa a função e assevera o que ela devolve.

A consequência pedagógica declarada: o par **imprimir × devolver** de Python vira aqui o par
**`println!` × `format!`** — a tela e o valor que a tela recebe. A aula `a-mensagem-montada` (M1,
aula 4) ensina `format!` (o VALOR, que o teste assevera) e a aula seguinte, `a-tela`, ensina
`println!` (a TELA que o valor alimenta). A solução de `a-tela` imprime **e** devolve; o teste
assevera o devolvido. Cláusula J5 honesta: o `println!` não é observável pelo teste — ele é forçado
pela solução de referência e o `format!` é o que o teste força; a assimetria é declarada, como a
fase SAÍDA de Python declarou os 17 desafios não-discriminantes
([`16`](16-engine-de-trilha.md) §9.1).

### Os fatos da linguagem que governam esta trilha

Todos medidos (fontes: `lang/rust.ts`, `docs/research/06-toolchains.md` ficha Rust, inventário
`atoms.rust.json`); cada linha traz a consequência de currículo.

| Fato | Consequência de currículo |
|---|---|
| Toolchain **1.98.1** (`rust_toolchain` do inventário) | é a versão que produziu o vocabulário; `runtime: "cargo-1.98"` no `track.json` |
| Runner: `cargo test --offline` (`RS_TEST_COMMAND`) | **sem filtro por nome curto** — o footgun medido do 06 (`cargo test <nome>` sai 0 silenciosamente quando o nome não é qualificado) |
| Exit **0** passou · **101** falhou (panic, inclusive `assert_eq!` falho) · **101** erro de compilação | o `running 0 tests` sai 0 — o buraco do Node; a dupla-igualdade (declarada == executada, `successRequiresCountMatch: true`) fecha |
| O fonte do aluno é `src/lib.rs`, o teste é `tests/desafio.rs`, o manifesto vem primeiro | layout obrigatório de `rsLayout`; multi-arquivo via `files[]` + `mod` (aula de módulos é do intermediário) |
| O crate do aluno chama-se **`desafio`** (`RS_CRATE_NAME`) | o teste importa `use desafio::<nome>;` — e o crate do aluno **não é API**: nenhuma chave `api:desafio.*` existe (a semente é lista fixa contra nome variável) |
| `edition = "2021"` pinada no manifesto | a trilha cita a edition; roda em qualquer toolchain ≥ 1.56 |
| `[lib] test = false` + `doctest = false` | o `#[test]` do código do aluno NÃO roda (a forja morre — o porte do exit-guard); comentário é prosa, não prova |
| `[dependencies]` VAZIO + `CARGO_NET_OFFLINE=true` + `--offline` | **stdlib only**: os desafios nunca tocam a rede; nenhum crate de terceiros em nível nenhum |
| Starter padrão: `pub fn <nome>(…) -> … { todo!() }` | `api:todo!` é receptivo da aula 1; o aluno SUBSTITUI o corpo, nunca o assina |
| A função da solução precisa **`pub`** | o teste só importa o que é público; `node:VisibilityModifier` acompanha o harness desde a aula 1 e **nunca é conteúdo de aula** |
| Proibições sempre (`RS_FORBIDDEN_INVARIANTS`) | `api:std::process::exit` / `abort` / `ExitCode`, `node:ForeignMod` (`extern "C"`), `api:asm!` / `naked_asm!`, `api:link_section` / `export_name`. Nenhuma aula as ensina, em nível nenhum; aparecem **só em prosa com crase** |
| Receptor literal emite chave diferente (`"abc".to_string()` → `api:str.to_string`) | na teoria, demonstre métodos com **receptor-nome** (variável) — a mesma regra medida em Python ([`18`](18-estado-da-fabricacao-dos-cursos.md) §3.2) |
| Não existe docstring de teste: o `libtest` imprime `test <nome> ... ok` | **o NOME do teste é o rótulo do check**: `fn testa_dobro_positivo()` — snake_case, legível, sem abreviação |
| O `?` não está no iniciante | decisão de corte, §"Fora do iniciante (declarado)" |

### Vocabulário de átomos desta trilha

Os eixos de [`16`](16-engine-de-trilha.md) §3.1, com a forma que cada um assume em Rust — o
inventário fechado é `app/electron/main/engine/vocab/atoms.rust.json` (**190 chaves**: 76 `node:`,
14 `op:`, 4 `decl:`, 77 `global:`, 19 `api:`; gerado do corpus, nunca digitado).

| Eixo | Forma da chave em Rust | Aberto? | Exemplo |
|---|---|---|---|
| nós | `node:<PascalCase do tree-sitter>` | FECHADO | `node:FunctionItem`, `node:MatchArm` |
| ligação | `decl:<forma>` — as QUATRO | FECHADO | `decl:let`, `decl:let-mut`, `decl:const`, `decl:static` |
| operadores | `op:<família>:<op>` — famílias `binary`, `compare`, `logical`, `unary`, `assign`, `range` | FECHADO | `op:binary:+`, `op:compare:==`, `op:unary:&` |
| globais | `global:<nome do prelude>` | FECHADO | `global:String`, `global:Some` |
| API | `api:<caminho>` (raiz importada/global) · `api:.<método>` (receptor local) · `api:<nome>!` (macro do prelude) · `api:derive.<trait>` | **ABERTO** (só formato — `phases/f0Brief.ts` `EIXOS_FECHADOS_ATOMOS`) | `api:String::from`, `api:.push`, `api:println!` |
| termos da prosa | `term:<termo pt-BR>` | não-vocabulário | `term:lifetime`, `term:regra-do-empréstimo` |

Três decisões declaradas, com o motivo:

1. **`decl:` significa FORMA de ligação** — `let` × `let mut` × `const` × `static`. A mutabilidade
   explícita é o evento de currículo que Python não tem; `decl:let` e `decl:let-mut` são aulas
   separadas, porque I11 exige aula própria para forma nova.
2. **`op:compare:` e `op:logical:` são famílias próprias**, separadas de `op:binary:` (decisão de
   currículo idêntica à de Python): o orçamento de uma aula de igualdade não libera aritmética.
3. **`node:` traz os dois sintéticos do extrator** — `node:MutableReference` (`&mut T`, que o
   `reference_type` colapsa) e `node:ElseIf` (`else if`) — e NÃO traz os portadores
   `GlobalRef`/`ApiRef`/`Op` (a chave deles sai pelo atributo).

#### As chaves que o `global:` torna grátis — e o que isso muda

O prelude de Rust põe no escopo o que Python põe em aulas: os literais (`node:IntegerLiteral`,
`node:StringLiteral`, `node:BooleanLiteral`), o `let` (`decl:let`, `node:LetDeclaration`), a
chamada (`node:CallExpression`) e os tipos na assinatura (`node:PrimitiveType`) estão na **semente
receptiva** (§"A semente receptiva do harness Rust") — o aluno os LÊ no harness desde a aula 1.
Consequências de currículo, todas declaradas:

- **Não existe aula "dar nome a um valor" como origem produtiva** — `let` é semente; a aula
  `dar-nome-ao-valor` (M1) é consolidação, e a aula com conteúdo novo é `mudar-o-valor`
  (`decl:let-mut`).
- **Não existe aula "números"** — o literal inteiro é semente e o tipo (`i32`) é `node:PrimitiveType`
  receptivo do starter. O conteúdo de número é a OPERAÇÃO (`op:binary:+` etc.), não o valor.
- **Não existe aula "booleanos"** — `node:BooleanLiteral` é semente. O conteúdo de decisão é a
  comparação e o `if`.
- **`term:recuo` não existe** — blocos são chaves, não recuo. O evento de forma de Rust é o
  **ponto-e-vírgula** (instrução × expressão), que é a aula `o-corpo-e-uma-expressao` (M1).

### A regra do par — a divergência normativa, agora com o mapa de Rust

Uma única construção de Rust quase nunca produz uma única chave (`let mut x = 5;` emite `decl:let-mut`
**e** `node:MutableSpecifier` **e** `node:LetDeclaration`; `x += 1` emite `op:assign:+=` **e**
`node:CompoundAssignmentExpr`). A regra A7 limita `introduces.productive` a **2 itens**; lida sobre
chaves cruas, ela tornaria ilegal ensinar `let mut`. A resolução é a mesma de
[`17-trilha-python.md`](17-trilha-python.md), e é **normativa aqui**:

> **A tabela `Ensina` lista só a chave que DISTINGUE. O gerador de `introduces` acrescenta as chaves
> que a mesma construção produz inevitavelmente, e o conjunto conta como UM item para A7/I2.**

As derivadas **não** são origem para efeito de I3. O mapa é fechado e mecânico; a verificação no fim
deste documento o implementa:

| Chave listada em `Ensina` | Derivadas que a mesma construção produz |
|---|---|
| `op:binary:<qualquer>`, `op:compare:<qualquer>`, `op:logical:<qualquer>` | `node:BinaryExpression` |
| `op:binary:<qualquer>` sobre operando literal (o `2` do `x * 2` da aula 1) | `node:IntegerLiteral` |
| `op:unary:!`, `op:unary:-`, `op:unary:*` | `node:UnaryExpression` |
| `op:unary:&` | `node:ReferenceExpression` |
| `op:assign:=` | `node:AssignmentExpression` |
| `op:assign:<composto>` | `node:CompoundAssignmentExpr` |
| `op:range:<qualquer>` | `node:RangeExpression` |
| `decl:let`, `decl:let-mut` | `node:LetDeclaration` |
| `decl:let-mut` | `node:MutableSpecifier` |
| `decl:const` | `node:ConstItem` |
| `decl:static` | `node:StaticItem` |
| `node:FunctionItem` | `node:Parameters` + `node:Parameter` — SÓ na aula-da-assinatura (a 1ª do curso); depois nada |
| `node:StructItem` | `node:FieldDeclarationList` + `node:FieldDeclaration` |
| `node:StructExpression` | `node:FieldInitializerList` + `node:FieldInitializer` + `node:FieldIdentifier` |
| `node:EnumItem` | `node:EnumVariantList` + `node:EnumVariant` |
| `node:MatchExpression` | `node:MatchBlock` |
| `node:MatchArm` | `node:MatchPattern` |
| `node:ImplItem` | `node:SelfParameter` — SÓ na aula-do-método; depois nada |
| `node:MutableReference` | `node:MutableSpecifier` + `node:ReferenceType` |
| `api:<qualquer macro do prelude>` (`println!`, `format!`, `vec!`, …) | `node:MacroInvocation` + `node:TokenTree` |
| `api:derive.<qualquer>` | `node:Attribute` + `node:AttributeItem` |
| `api:std::collections::<qualquer>` (o `use`) | `node:UseDeclaration` + `node:ScopedIdentifier` |
| anotação de tipo por nome (`String`, `Vec<i32>`, `HashMap<String, i32>`, `Option<i32>`) | `node:TypeIdentifier` + `node:GenericType` + `node:TypeArguments` — a anotação é derivada da construção que a aula ensina, NUNCA item de `Ensina` |

`node:VisibilityModifier` (o `pub`) e `node:PrimitiveType` (os tipos primitivos na assinatura)
**não têm aula**: acompanham o harness desde a aula 1 (o starter os lê e o aluno os copia) e entram
no `introduces.receptive` da aula 1 — se o gate os cobrar do lado produtivo, é a aula 1 que os
declara (decisão do disco; a tabela do contrato não muda).

### A semente receptiva do harness Rust

O que o aluno lê em TODO desafio e não escreve em nenhum. Entra no receptivo da aula 1 e nunca no
produtivo. **Esta lista é a fonte normativa de `RUST_HARNESS_RECEPTIVE_SEED`**
(`app/electron/main/engine/atomKeys.ts`):

```
node:UseDeclaration  node:ScopedIdentifier  node:Identifier  node:AttributeItem  node:Attribute
node:FunctionItem  node:Parameters  node:Block  node:ExpressionStatement  node:CallExpression
node:MacroInvocation  node:TokenTree  node:LetDeclaration  decl:let  node:ModItem
node:DeclarationList  node:Super  node:IntegerLiteral  node:StringLiteral  node:BooleanLiteral
api:test  api:cfg.test  api:assert_eq!  api:assert_ne!  api:assert!
```

(25 chaves, medidas — a fixture viva prova nos dois sentidos que o invólucro inteiro do
`use desafio::… + assert_eq!` cabe nela e que nada sobra.)

**Estruturais sempre permitidos** (`RUST_STRUCTURAL_ALWAYS_ALLOWED`, 6 chaves): `node:SourceFile`,
`node:Identifier`, `node:ExpressionStatement`, `node:Arguments`, `node:LineComment`,
`node:MacroArg`. São contexto de expressão e container — não carregam didática nenhuma.
Consequência: **`node:MacroArg` ser estrutural tem peso de contrato** — o ARGUMENTO da macro é o
que separa invólucro de conteúdo (a linha abaixo).

**O ARGUMENTO do teste é CONTEÚDO.** A semente perdoa o invólucro, nunca o argumento: `dobro(-3)`
emite `op:unary:-` — a matéria da aula de negação — e NÃO entra na semente
(`tests/engineLangRust.test.ts` mede a fronteira nos dois sentidos). Conta como cobrança.

### A regra de orçamento medida (onda 1 — cláusula do adaptador Rust)

> **Superfícies de desafio são checadas pela ASSIMETRIA das quatro superfícies — a regra EXATA de
> [`16`](16-engine-de-trilha.md) §3.3, e é ELA que vence, não uma paráfrase mais forte**:
> `atomos(testsCode) ⊆ budget_ENTRADA(N).receptive` (o aluno lê o teste antes da aula);
> `atomos(starterCode | theory | statement) ⊆ budget_SAIDA(N).receptive`; `atomos(solutionCode) ⊆
> budget_SAIDA(N).productive`, com a contenção produtiva medida sobre o DIFF —
> `atomos(solutionCode) \ atomos(starterCode)` ([`16`](16-engine-de-trilha.md):587). Cada superfície
> tem o próprio orçamento: átomo RECEPTIVO é legal no teste e no starter — ilegal só na parte que o
> aluno ESCREVE. `receptive` serve para a teoria: demonstração sem cobrança, em bloco cercado com
> tag ```rust (`RS_THEORY_FENCE_TAGS`; bloco com tag é código, crase inline é prosa).
>
> **O exemplo vivo é a fixture `trilha-rust-minima`**: a negação `op:unary:-` ficou RECEPTIVA na
> aula `a-primeira-funcao` — demonstrada em bloco ```rust na teoria (`dobro(-3)` devolve `-6`) — e
> o desafio `dobre-o-numero` EVITA `-3`: os testes chamam `dobro(2)` e `dobro(10)`. Quando a trilha
> quiser COBRAR a negação, a aula `o-negativo` (M2) a promove a produtiva — e a partir dela o teste
> pode passar `-3` (o argumento, então, já tem aula). A mesma regra torna o starter padrão legal:
> `api:todo!`, `pub` (`node:VisibilityModifier`) e `i32` (`node:PrimitiveType`) são RECEPTIVOS na
> entrada da aula 1 — o starter os usa, e só o DIFF do aluno é checado contra o produtivo.

### As cláusulas de autoria do harness Rust (obrigatórias a todo desafio)

O que toda onda de conteúdo copia, aula por aula — o disco já impõe tudo isto
(`lang/rust.ts` + `challengeExec.ts`); este contrato as lista para o autor não redescobrir:

1. **O manifesto é o harness e vem primeiro**: `Cargo.toml` escrito por `rsLayout`, com
   `[package] name = "desafio"`, `edition = "2021"`, `[lib] test = false`, `doctest = false` e
   `[dependencies]` **VAZIO**. O aluno lê, nunca edita.
2. **Starter**: `pub fn <nome>(<parâmetros>: <tipos>) -> <tipo> { todo!() }` — corpo todo
   substituível, assinatura toda editável. `todo!()` (`api:todo!`) é receptivo da aula 1.
3. **Solução**: funções **`pub`**; `src/lib.rs` é o `RS_ENTRY_PATH`. Sem `assert!` dentro da
   solução (asserção é do teste).
4. **Teste**: `tests/desafio.rs`, um teste de INTEGRAÇÃO — `use desafio::<nome>;` + `#[test] fn
   testa_<cenario>() { assert_eq!(…) }`. **Nunca** filtro por nome no runner: o comando é
   `cargo test --offline`, inteiro. `expectedTestCount` = nº de `#[test]`, conferido pela dupla-
   igualdade (contagem declarada por AST, executada pelo `libtest`).
5. **O nome da função do desafio é declarado no `challenge.json`** (não há derivação mecânica de
   slug como em Python) — snake_case, pt-BR sem acento; o teste importa esse nome exato.
6. **Panic e erro de compilação são `exit 101`**; falha é `exit != 0`; o veredito da UI mostra UMA
   LINHA por teste (`test testa_x ... ok`) — o nome é o rótulo.
7. **`RS_FORBIDDEN_INVARIANTS`** valem em qualquer superfície (solução, starter, teoria, teste), em
   qualquer nível: `api:std::process::exit`, `api:std::process::abort`,
   `api:std::process::ExitCode`, `node:ForeignMod` (`extern "C"`), `api:asm!`, `api:naked_asm!`,
   `api:link_section`, `api:export_name`. A defesa de relatório forjado é o GATE de orçamento —
   Rust não tem `--require` nem "primeiro import".
8. **std-only para sempre no iniciante**: nenhum crate de terceiros; `CARGO_NET_OFFLINE=true` +
   `--offline` + `[dependencies]` vazio são três travas, não uma.
9. **Ambiente**: `RUSTC`/`RUSTDOC` pinados por `detect()`, `RUST_BACKTRACE=0`,
   `CARGO_TERM_COLOR=never` — o autor não precisa saber, mas o desafio que "funciona na minha
   máquina" com ANSI na saída falha o regex de contagem em outra.
10. **Multi-arquivo** (a partir dos desafios de módulo): `files[]` verbatim + `mod` declarado —
    `node:ModItem` já é semente (o harness `#[cfg(test)] mod tests` o lê).

### Princípios pedagógicos aplicados (os que Rust muda)

1. **A primeira construção produz efeito VERIFICÁVEL** — não na tela, no teste: a aula 1 termina
   com `dobro(2)` devolvendo `4` e o aluno vê o check verde com o NOME do teste.
2. **O corpo é expressão antes de ser bloco** — Rust permite `x * 2` sem `return`; a aula
   `o-corpo-e-uma-expressao` fixa a máquina nocional (instrução `;` × expressão) ANTES de o aluno
   lutar com "a função não devolve nada".
3. **Dono antes de empréstimo, empréstimo antes de estrutura** — a ordem M4 → M5 → M6 segue o Book
   (cap. 4 antes do 5) por uma razão de currículo: o método que recebe `&self` (M6) só é legível
   para quem já sabe empréstimo (M5). Python podia deixar classe para M12; Rust não pode.
4. **Pre-training → worked example → fading → prática independente**, um erro por vez com nome —
   em Rust, o erro tem NOME próprio desde o primeiro dia: **E0382** (borrow of moved value) é lido
   como conteúdo nas aulas de movimento (M4), antes de assustar.
5. **Interleaving** (A15b/I7): a coluna `Presume` é a prova mecânica; nenhuma família sintática
   ocupa três aulas seguidas sem intercalação.
6. **Zero jargão sem explicação** — os termos em inglês só quando são o nome real da coisa
   (`move`, `borrow`, `panic`, `lifetime`); os termos da prosa entram por `term:`.
7. **Fontes fora do fluxo** — URLs em `sources[]` (§6), só no botão "Fontes".

### Estrutura do iniciante — 8 módulos, 101 aulas

| # | Módulo | Aulas | cons. | O que ensina | Fronteira de saída |
|---|---|---|---|---|---|
| 1 | `a-tela` | 13 | 4 | função, operação, chamada, `format!`/`println!`, `let`/`let mut`/reatribuição/`+=`/`const`, o corpo-expressão, o erro de compilação | escreve uma função pública que recebe, calcula, monta texto e mostra na tela — e lê o erro do compilador |
| 2 | `decisao` | 12 | 4 | comparações, `&&`, negação unária, `!`, `if`/`else`/`else if` (inclusive como expressão) | decide com ramos, inclusive o `if` que devolve valor |
| 3 | `repeticao` | 12 | 7 | `loop`/`while`/`for`, intervalos `..`/`..=`, `break` (inclusive devolvendo valor), acumulador mutável | repete com o laço certo e para com o `break` certo |
| 4 | `o-dono-do-valor` | 13 | 8 | `String`, movimento, `clone`, função que consome/devolve o dono, o que copia, sombreamento, métodos de texto | explica E aplica move: diz ANTES se a linha move, copia ou empresta |
| 5 | `emprestar` | 13 | 8 | `&str`, `&T`, `&mut T`, deref, a regra do empréstimo, fatia, lifetime implícito em escopo simples | assina funções com `&T`/`&mut T` e aplica a regra sem lutar com o compilador |
| 6 | `estruturas` | 12 | 5 | struct, literal, campo, `impl`, `&self`/`&mut self`, construtor associado, derives | modela dados com struct e métodos — e o derive certo |
| 7 | `variantes-e-match` | 13 | 7 | enum próprio, `match` exaustivo, variantes que carregam valor, `Option`/`Result`, `unwrap`/`expect`, `parse` | resolve ausência e falha com enum — e sabe quando o `unwrap` é aceitável |
| 8 | `colecoes` | 13 | 6 | `Vec`, `HashMap`, o padrão `entry`, o laço que empresta a coleção | guarda e consulta coleções que crescem, dentro das regras de dono |

**Não existe fronteira intermediária dentro do iniciante** — o júnior-Rust é a fronteira única (fim
do M8), porque em Rust o que separa "sei escrever função" de "sei escrever programa" é exatamente o
dono e o empréstimo (M4–M5): cortar antes deles produziria um "júnior" que o compilador reprova.

### Conteúdo por aula

Nas tabelas, `Ensina` lista as construções produtivas novas (**no máximo 2**, pela regra do par —
derivadas ficam no mapa, §"A regra do par") e `Presume` nomeia a aula anterior que ensinou cada
construção pressuposta. "cons." marca consolidação declarada (com o degrau nomeado); "integration"
marca aula de composição (`role: "integration"`, [`16`](16-engine-de-trilha.md) §3.7).

#### Módulo 1 — `a-tela` (13 aulas)

A aula 1 adota a fixture viva `trilha-rust-minima` — a lesson.json dela é o `introduces` NORMATIVO
da aula 1: seis produtivas (`node:FunctionItem`, `node:Parameters`, `node:Parameter`,
`node:IntegerLiteral`, `op:binary:*`, `node:BinaryExpression` — 2 itens pela regra do par,
§"A regra do par") e os receptivos dela: `node:VisibilityModifier`, `node:PrimitiveType`,
`node:UnaryExpression`, `op:unary:-`, `api:todo!`.

| Aula | Ensina | Presume |
|---|---|---|
| `a-primeira-funcao` | `node:FunctionItem`, `op:binary:*` — 2 itens pela regra do par: a assinatura (fn + params) e o `x * 2` do desafio (literal inteiro + multiplicação); a lesson.json da fixture é o `introduces` NORMATIVO da aula 1 | nada |
| `somar` | `op:binary:+` | `a-primeira-funcao` |
| `chamar-a-funcao` | `node:CallExpression` | `a-primeira-funcao` |
| `a-mensagem-montada` | `api:format!` | `chamar-a-funcao`, `somar` |
| `a-tela` | `api:println!` | `a-mensagem-montada` |
| `dar-nome-ao-valor` | cons. — `decl:let` em forma nova (a ligação local dentro da função; a semente já a lê no harness) | `a-mensagem-montada` |
| `mudar-o-valor` | `decl:let-mut` | `dar-nome-ao-valor` |
| `reatribuir` | `op:assign:=` | `mudar-o-valor` |
| `somar-no-lugar` | `op:assign:+=` | `reatribuir` |
| `fixar-uma-vez` | `decl:const` | `dar-nome-ao-valor` |
| `o-corpo-e-uma-expressao` | cons. — `node:FunctionItem` em forma nova (a última expressão do bloco É o retorno; o `;` que mata o valor) | `a-primeira-funcao` |
| `o-erro-de-compilacao` | cons. — `node:FunctionItem` em forma nova (ler o erro do `rustc`: `term:compilação`, `term:rustc`) | `reatribuir` |
| `a-saida-completa` | cons. — integration — `api:format!` em forma nova (recebe, calcula, monta e mostra no mesmo desafio) | `a-tela`, `somar-no-lugar` |

#### Módulo 2 — `decisao` (12 aulas)

| Aula | Ensina | Presume |
|---|---|---|
| `comparar-numeros` | `op:compare:>`, `op:compare:<` | M1 `a-primeira-funcao` |
| `igual` | `op:compare:==` | `comparar-numeros` |
| `e-e` | `op:logical:&&` | `igual` |
| `o-negativo` | `op:unary:-` (a negação receptiva da aula 1 vira cobrança — o teste pode passar `-3`) | M1 `somar` |
| `negar` | `op:unary:!` | `e-e` |
| `se` | `node:IfExpression` | `comparar-numeros` |
| `se-senao` | `node:ElseClause` | `se` |
| `se-senao-se` | `node:ElseIf` | `se-senao` |
| `o-se-que-devolve` | cons. — `node:IfExpression` em forma nova (o `if` como EXPRESSÃO que vira valor de `let`) | `se-senao`, M1 `dar-nome-ao-valor` |
| `a-condicao-que-guarda` | cons. — `op:compare:==` em forma nova (a comparação direto no `let`) | `o-se-que-devolve` |
| `a-logica-invertida` | cons. — `op:unary:!` em forma nova (ler a condição que o compilador recusa; o `\|\|` fica para a dívida de corpus) | `negar`, `e-e` |
| `o-classificador` | cons. — integration — `node:ElseIf` em forma nova (três ramos + `format!`) | `se-senao-se`, M1 `a-mensagem-montada` |

#### Módulo 3 — `repeticao` (12 aulas)

| Aula | Ensina | Presume |
|---|---|---|
| `repetir-para-sempre` | `node:LoopExpression` | M2 `se` |
| `parar-no-meio` | `node:BreakExpression` | `repetir-para-sempre` |
| `contar-ate` | `node:ForExpression`, `op:range:..` | `parar-no-meio` |
| `ate-inclusive` | `op:range:..=` | `contar-ate` |
| `enquanto` | `node:WhileExpression` | `parar-no-meio` |
| `acumular-no-laco` | cons. — `op:assign:+=` em forma nova (o acumulador dentro do laço) | `contar-ate`, M1 `somar-no-lugar` |
| `o-contador-mutavel` | cons. — `decl:let-mut` em forma nova (o contador que o laço muda) | `enquanto`, M1 `mudar-o-valor` |
| `parar-com-valor` | cons. — `node:BreakExpression` em forma nova (`break total;` — o `loop` que devolve) | `parar-no-meio`, M1 `dar-nome-ao-valor` |
| `de-dois-em-dois` | `api:.step_by` | `contar-ate` |
| `laco-dentro-de-laco` | cons. — `node:ForExpression` em forma nova (aninhado) | `contar-ate` |
| `o-limite-do-laco` | cons. — `node:WhileExpression` em forma nova (off-by-one: a condição que roda uma vez a mais) | `enquanto` |
| `a-tabuada` | cons. — integration — `node:ForExpression` em forma nova (o laço que monta texto com `format!`) | `laco-dentro-de-laco`, M1 `a-mensagem-montada` |

#### Módulo 4 — `o-dono-do-valor` (13 aulas)

O módulo central. O conteúdo novo da trilha inteira está aqui e em M5.

| Aula | Ensina | Presume |
|---|---|---|
| `o-texto-que-e-dono` | `api:String::from` | M1 `a-mensagem-montada` |
| `copiar-em-vez-de-mover` | `api:.clone` | `o-texto-que-e-dono` |
| `o-movimento` | cons. — `decl:let` em forma nova (a ligação que MOVE: `let s2 = s1;` e `s1` morre; a **E0382** lida no erro) | `copiar-em-vez-de-mover` |
| `a-caixa-que-consome` | cons. — `node:FunctionItem` em forma nova (o parâmetro `String` por valor: quem chama perde) | `o-movimento`, M1 `chamar-a-funcao` |
| `devolver-o-dono` | cons. — `node:FunctionItem` em forma nova (a função devolve a `String` — o dono volta) | `a-caixa-que-consome` |
| `o-que-copia-e-o-que-move` | cons. — `decl:let` em forma nova (inteiros e booleanos copiam; `String` move) | `o-movimento` |
| `reusar-o-nome` | cons. — `decl:let` em forma nova (sombrear: `let` de novo sobre o mesmo nome) | `o-movimento` |
| `o-tamanho-do-texto` | `api:.len` | `o-texto-que-e-dono` |
| `juntar-textos` | cons. — `op:binary:+` em forma nova (soma de textos — e o `+` MOVE o da esquerda) | `o-texto-que-e-dono`, M1 `somar` |
| `crescer-o-texto` | `api:.push_str` | `o-texto-que-e-dono`, M1 `mudar-o-valor` |
| `de-fatia-para-dono` | `api:.to_string` | `o-texto-que-e-dono` |
| `a-funcao-que-transforma` | cons. — `node:FunctionItem` em forma nova (recebe `String`, devolve `String` nova) | `devolver-o-dono` |
| `o-construtor-de-frase` | cons. — integration — `api:format!` em forma nova (vários `{}` sobre valores computados) | `juntar-textos`, `crescer-o-texto` |

#### Módulo 5 — `emprestar` (13 aulas)

A escalada é a que o dono do produto pediu: **move (M4) → borrow imutável → borrow mutável →
lifetime implícito em escopos simples**.

| Aula | Ensina | Presume |
|---|---|---|
| `emprestar-o-texto` | `node:ReferenceType` (o `&str` da assinatura) | M4 `o-texto-que-e-dono` |
| `emprestar-qualquer-coisa` | `op:unary:&` | `emprestar-o-texto` |
| `ler-pelo-emprestimo` | cons. — `op:unary:&` em forma nova (o `&` como argumento de chamada) | `emprestar-qualquer-coisa`, M1 `chamar-a-funcao` |
| `emprestar-para-mudar` | `node:MutableReference` (o `&mut T`) | `emprestar-qualquer-coisa`, M1 `mudar-o-valor` |
| `o-emprestimo-mutavel-na-chamada` | cons. — `op:unary:&` em forma nova (`&mut` como argumento) | `emprestar-para-mudar` |
| `mudar-pelo-emprestimo` | `op:unary:*` (o deref: `*r = 7;`) | `emprestar-para-mudar` |
| `um-ou-muitos` | cons. — `node:MutableReference` em forma nova (A REGRA: um `&mut` OU muitos `&`; `term:regra-do-empréstimo`) | `mudar-pelo-emprestimo` |
| `o-emprestimo-morre-junto` | cons. — `node:ReferenceType` em forma nova (o lifetime implícito: a referência não sobrevive ao dono; `term:lifetime`) | `um-ou-muitos` |
| `a-funcao-que-so-le` | cons. — `node:ReferenceType` em forma nova (`&String` × `&str` — a assinatura que aceita os dois) | `emprestar-o-texto` |
| `a-fatia-do-texto` | `node:IndexExpression` (e o intervalo que a fatia recebe) | `emprestar-o-texto`, M3 `contar-ate` |
| `percorrer-o-texto` | `api:.chars` | `a-fatia-do-texto` |
| `mover-ou-emprestar` | cons. — `node:ReferenceType` em forma nova (a decisão: dono quando vai guardar, empréstimo quando só vai ler) | `a-funcao-que-so-le`, M4 `a-caixa-que-consome` |
| `o-placar` | cons. — integration — `op:unary:*` em forma nova (a função que recebe `&mut i32` e atualiza o placar) | `mudar-pelo-emprestimo` |

#### Módulo 6 — `estruturas` (12 aulas)

| Aula | Ensina | Presume |
|---|---|---|
| `o-molde-e-o-valor` | `node:StructItem` | M5 `emprestar-o-texto` |
| `criar-a-partir-do-molde` | `node:StructExpression` | `o-molde-e-o-valor` |
| `ler-o-campo` | `node:FieldExpression` | `criar-a-partir-do-molde` |
| `o-metodo` | `node:ImplItem` | `o-molde-e-o-valor` |
| `o-self-e-o-valor` | `node:Self` | `o-metodo`, `ler-o-campo` |
| `o-metodo-que-muda` | cons. — `node:SelfParameter` em forma nova (`&mut self`) | `o-metodo`, M5 `emprestar-para-mudar` |
| `o-construtor` | cons. — `node:ImplItem` em forma nova (a função associada sem `self` — `Ponto::new`) | `o-metodo`, `criar-a-partir-do-molde` |
| `a-estampa-do-compilador` | `api:derive.Debug` | `o-molde-e-o-valor` |
| `comparar-estruturas` | `api:derive.PartialEq` | `a-estampa-do-compilador` |
| `copiar-a-estrutura` | `api:derive.Clone`, `api:derive.Copy` | `comparar-estruturas`, M4 `copiar-em-vez-de-mover` |
| `o-atalho-do-campo` | `node:ShorthandFieldInitializer` | `criar-a-partir-do-molde` |
| `o-inventario` | cons. — integration — `node:StructExpression` em forma nova (struct + métodos + `format!` num relatório) | `o-construtor`, M1 `a-mensagem-montada` |

#### Módulo 7 — `variantes-e-match` (13 aulas)

**O corte de `Option`/`Result` (decisão deste contrato, com justificativa):** o iniciante cobre
`Option` e `Result` **com `match` até o nível de extrair o valor e responder aos dois casos**, mais
`unwrap`/`expect` (a porta rápida, com a regra de quando é aceitável) e `parse` (o produtor real de
`Result`). FICA FORA: o operador `?` (é um `match` + retorno antecipado — ensiná-lo antes de o aluno
escrever o `match` à mão cria atalho sem máquina nocional; entra na porta do intermediário, onde o
erro próprio já existe), combinadores (`map`/`unwrap_or_else` — exigem closure, que é I2) e
`if let`/`while let` (açúcar de `match` — I11: forma nova exige aula própria, e é do intermediário).

| Aula | Ensina | Presume |
|---|---|---|
| `a-escolha-fixa` | `node:EnumItem` | M6 `o-molde-e-o-valor` |
| `o-caminho-da-variante` | cons. — `node:ScopedIdentifier` em forma nova (`Cor::Vermelho` — o caminho da variante) | `a-escolha-fixa` |
| `o-casamento` | `node:MatchExpression` | `o-caminho-da-variante` |
| `um-braco-por-variante` | `node:MatchArm` | `o-casamento` |
| `o-braco-que-sobra` | cons. — `node:MatchArm` em forma nova (o `_` — e por que o `match` é EXAUSTIVO) | `um-braco-por-variante` |
| `a-variante-que-carrega` | `node:TupleStructPattern` | `a-escolha-fixa` |
| `casar-o-que-carrega` | cons. — `node:TupleStructPattern` em forma nova (extrair o valor no braço) | `a-variante-que-carrega`, `o-casamento` |
| `a-caixa-que-pode-vir-vazia` | `global:Some`, `global:None` | `casar-o-que-carrega` |
| `casar-a-caixa` | cons. — `node:TupleStructPattern` em forma nova (`Some(v)` e `None` no match) | `a-caixa-que-pode-vir-vazia`, `casar-o-que-carrega` |
| `a-resposta-que-pode-falhar` | `global:Ok`, `global:Err` | `a-caixa-que-pode-vir-vazia` |
| `casar-a-resposta` | cons. — `node:TupleStructPattern` em forma nova (`Ok(v)` e `Err(e)`) | `a-resposta-que-pode-falhar`, `casar-o-que-carrega` |
| `a-porta-rapida` | `api:.unwrap`, `api:.expect` | `casar-a-caixa` |
| `converter-texto-em-numero` | `api:.parse` | `a-porta-rapida`, M4 `o-texto-que-e-dono` |

#### Módulo 8 — `colecoes` (13 aulas)

| Aula | Ensina | Presume |
|---|---|---|
| `a-lista-que-cresce` | `api:vec!` | M4 `o-texto-que-e-dono` |
| `guardar-mais-um` | `api:.push` | `a-lista-que-cresce` |
| `quantos-tem` | cons. — `api:.len` em forma nova (sobre o `Vec`) | `guardar-mais-um`, M4 `o-tamanho-do-texto` |
| `pegar-pela-posicao` | cons. — `node:IndexExpression` em forma nova (sobre o `Vec`; o `Option` que o `get` devolve) | `a-lista-que-cresce`, M5 `a-fatia-do-texto` |
| `tirar-do-fim` | `api:.pop` (e o `Option` que ele devolve) | `guardar-mais-um` |
| `percorrer-a-lista` | cons. — `node:ForExpression` em forma nova (`for x in &v` — o laço que EMPRESTA) | `a-lista-que-cresce`, M3 `contar-ate` |
| `mudar-dentro-do-laco` | cons. — `node:ForExpression` em forma nova (`for x in &mut v` + o deref) | `percorrer-a-lista`, M5 `mudar-pelo-emprestimo` |
| `trazer-o-mapa` | `api:std::collections::HashMap` (o `use`) | `percorrer-a-lista` |
| `o-mapa-vazio` | `api:HashMap::new` | `trazer-o-mapa` |
| `guardar-no-mapa` | `api:.insert` | `o-mapa-vazio` |
| `consultar-o-mapa` | `api:.get` | `guardar-no-mapa`, M7 `casar-a-caixa` |
| `contar-as-palavras` | `api:.entry` | `guardar-no-mapa` |
| `o-analisador-de-votos` | cons. — integration — `api:std::collections::HashMap` em forma nova (`Vec` + `HashMap` + `format!` no mesmo programa) | `guardar-no-mapa`, `percorrer-a-lista` |

**Desafios de módulo.** No fim de cada módulo existe um desafio de MÓDULO
(`modules/<slug>/challenges/<slug>/challenge.json`, declarado no `module.json`): multi-arquivo
(`files[]` + `mod`, a partir de M8 — antes, arquivo único), statement longo com cenário real,
**sem introduzir construção nenhuma** (compor o que o módulo ensinou é o teste). Os aninhamentos
fora das tabelas (laço dentro de laço, `Vec` de structs, `HashMap<String, Vec<String>>`) são o
material natural deles.

### A verificação Ensina × Presume — reexecutável

O script roda sobre ESTE arquivo e sobre o inventário fechado, e reprova seis coisas (mesma grade
de [`17-trilha-python.md`](17-trilha-python.md)): **I12** slug repetido · **LACUNA** `Presume`
apontando para aula que ainda não veio · **I3** átomo introduzido duas vezes fora de consolidação ·
**VOCAB** chave de eixo FECHADO (`node:`/`op:`/`decl:`/`global:`) que não existe em
`atoms.rust.json` (o eixo `api:` é ABERTO e cai por formato) · **A7** mais de 2 átomos numa aula
que não é consolidação · **A6** aula que não introduz nem consolida nada (e consolidação que
reforça átomo sem origem anterior — na cadeia, na semente ou nos estruturais). Fail-closed: sem o
inventário no disco, reprova.

```bash
cd <raiz do repositório>
python3 - docs/20-trilha-rust.md <<'EOF'
# -*- coding: utf-8 -*-
"""Verificação Ensina × Presume do docs/20 (o iniciante, aula a aula)."""
import json, os, re, sys

txt = open(sys.argv[1], encoding='utf-8').read()
REL = os.path.join('app', 'electron', 'main', 'engine', 'vocab', 'atoms.rust.json')
inv, d = None, os.path.dirname(os.path.abspath(sys.argv[1]))
for base in [os.getcwd(), d, os.path.dirname(d), os.path.dirname(os.path.dirname(d))]:
    if os.path.exists(os.path.join(base, REL)): inv = os.path.join(base, REL); break
if inv is None:
    print('FALHA: não achei %s — rode a partir da raiz do repositório' % REL); sys.exit(1)
VOCAB = set()
for eixo in json.load(open(inv, encoding='utf-8'))['axes'].values():
    VOCAB.update(eixo)

# Semente receptiva do harness Rust + estruturais (atomKeys.ts) — a entrada da trilha.
SEMENTE = set("""node:UseDeclaration node:ScopedIdentifier node:Identifier node:AttributeItem
node:Attribute node:FunctionItem node:Parameters node:Block node:ExpressionStatement
node:CallExpression node:MacroInvocation node:TokenTree node:LetDeclaration decl:let node:ModItem
node:DeclarationList node:Super node:IntegerLiteral node:StringLiteral node:BooleanLiteral
api:test api:cfg.test api:assert_eq! api:assert_ne! api:assert!""".split())
ESTRUTURAL = set("""node:SourceFile node:Identifier node:ExpressionStatement node:Arguments
node:LineComment node:MacroArg""".split())
# Derivadas da regra do par (§"A regra do par") — a mesma construção as produz.
DERIVADAS = set("""node:BinaryExpression node:IntegerLiteral node:UnaryExpression node:ReferenceExpression
node:AssignmentExpression node:CompoundAssignmentExpr node:RangeExpression node:LetDeclaration
node:MutableSpecifier node:ConstItem node:StaticItem node:Parameters node:Parameter
node:FieldDeclarationList node:FieldDeclaration node:FieldInitializerList node:FieldInitializer
node:FieldIdentifier node:EnumVariantList node:EnumVariant node:MatchBlock node:MatchPattern
node:SelfParameter node:ReferenceType node:MacroInvocation node:TokenTree node:Attribute
node:AttributeItem node:UseDeclaration node:ScopedIdentifier node:TypeIdentifier node:GenericType
node:TypeArguments""".split())

ATOMO = re.compile(r'`((?:node|decl|op|global|api|form|term):[^`]+)`')
CONS = re.compile(r'^cons\.')
mod = None; aulas = []
for ln in txt.split('\n'):
    m = re.match(r'^#### Módulo (\d+) — ', ln)
    if m: mod = int(m.group(1)); continue
    if re.match(r'^#{2,5} ', ln) and not m: mod = None
    if mod and ln.startswith('| ') and not re.match(r'^\|[\s\-:|]+\|$', ln):
        c = [x.strip().replace('\\|', '|') for x in re.split(r'(?<!\\)\|', ln.strip().strip('|'))]
        if c[0] in ('Aula', '#'): continue
        if len(c) == 3: aulas.append((mod, c[0].strip('`'), c[1], c[2]))

vistos = set(); origem = {}; primeira = False; falhas = []
for (mod, slug, ensina, presume) in aulas:
    if slug in vistos: falhas.append('I12 M%d, slug repetido: %s' % (mod, slug))
    vistos.add(slug)
    if not primeira:
        if presume.strip() != 'nada':
            falhas.append('A primeira aula tem de presumir "nada" (achei %r)' % presume)
        primeira = True
    elif not presume.strip():
        falhas.append('PRESUME vazio: %s' % slug)
    for r in re.findall(r'`([a-z0-9][a-z0-9\-]{2,})`', presume):
        if r not in vistos: falhas.append('LACUNA M%d/%s presume %s' % (mod, slug, r))
    atomos = ATOMO.findall(ensina)
    for a in atomos:
        eixo = a.split(':', 1)[0]
        if eixo in ('node', 'decl', 'op', 'global'):
            if a not in VOCAB:
                falhas.append('VOCAB M%d/%s: %s não está em atoms.rust.json' % (mod, slug, a))
        elif eixo not in ('api', 'term', 'form'):
            falhas.append('FORMATO M%d/%s: %s' % (mod, slug, a))
    if CONS.match(ensina):
        for a in [x for x in atomos if not x.startswith('term:')]:
            if (a not in origem and a not in SEMENTE and a not in ESTRUTURAL
                    and a not in DERIVADAS):
                falhas.append('CONS M%d/%s reforça %s, que nenhuma aula anterior ensinou' % (mod, slug, a))
    else:
        if len(atomos) > 2:
            falhas.append('A7 M%d/%s introduz %d átomos (teto 2)' % (mod, slug, len(atomos)))
        if not atomos:
            falhas.append('A6 M%d/%s não introduz nem consolida nada' % (mod, slug))
        for a in atomos:
            if a in origem: falhas.append('I3 %s: %s e %s' % (a, origem[a], slug))
            else: origem[a] = slug

apis_citadas = [a for a in origem if a.startswith('api:')]
apis_no_vocab = [a for a in apis_citadas if a in VOCAB]
print('%d módulos · %d aulas · %d átomos com origem única · %d chaves api: citadas (no vocabulário: %s) · %d falhas'
      % (len({m for m, _, _, _ in aulas}), len(aulas), len(origem),
         len(apis_citadas), ', '.join(apis_no_vocab) or '—', len(falhas)))
for f in falhas[:100]: print(' ', f)
sys.exit(1 if falhas else 0)
EOF
```

**Resultado desta versão (medido — ver o handoff da onda): `0 falhas`.** O que a verificação
comprovou ao escrever este documento: nenhuma chave inventada (o corpus já mede todas as chaves de
eixo fechado citadas), nenhum `Presume` órfão, nenhuma aula com 3+ construções, e a única origem
dupla candidata (`api:.len`, `node:IndexExpression`, `node:ForExpression`, `api:format!`) ficou
corretamente como consolidação com degrau nomeado.

### Teste de proficiência (`proficiency.json`)

Cada curso tem o seu `proficiency.json`, cobrindo os conceitos centrais dos módulos: função com
parâmetro e retorno, tela e valor, ligação e mutabilidade, decisão, laço, dono e movimento,
empréstimo, struct e método, enum e match, `Option`/`Result`, `Vec` e `HashMap`. Enunciado em
linguagem simples que **não pressupõe programação**; dificuldade 5, carência da 1ª estrela 120 s.
Quem passa destrava o curso inteiro — e a entrada do curso seguinte é a fronteira de saída do
anterior (§0).

### Fora do iniciante (declarado) — a cobertura do inventário, chave a chave

**O inventário tem 190 chaves; o iniciante cobre as que o zero absoluto permite.** Cada ausência é
uma decisão, não um esquecimento. As chaves de eixo fechado que o iniciante NÃO cita, com destino:

| Chave (ou grupo) | Destino | Por quê |
|---|---|---|
| `decl:static`, `node:StaticItem` | intermediário | estado global estático é antipadrão para quem está aprendendo dono/empréstimo |
| `node:TraitItem`, `node:FunctionSignatureItem`, `node:TypeItem` | intermediário (`traits-e-genericos`) | trait definido e type alias só fazem sentido depois de struct/impl |
| `node:ClosureExpression`, `node:ClosureParameters`, `global:Fn/FnMut/FnOnce`, `global:Iterator/IntoIterator/FromIterator/Extend/DoubleEndedIterator/ExactSizeIterator` | intermediário (`closures-e-iteradores`) | closure + iterator é o módulo próprio; no iniciante o laço é `for` |
| `global:Box`, `global:Rc`, `global:Arc`, `global:RefCell`, `global:Cell`, `global:Cow` | intermediário (Rc/RefCell) e especialista (capô) | alocação e dono compartilhado exigem o modelo de memória consolidado |
| `global:Mutex`, `global:RwLock`, `global:Send`, `global:Sync` | especialista (`concorrencia-sem-medo`) | concorrência não começa no zero absoluto |
| `global:HashSet/BTreeMap/BTreeSet/VecDeque/LinkedList/BinaryHeap` | avançado (`desempenho-e-medicao`) | a escolha de coleção é decisão de medição, não de primeiro contato |
| `global:Debug/Clone/Copy/PartialEq` | **ensinadas no iniciante** — VIA `derive` (M6: `a-estampa-do-compilador`, `comparar-estruturas`, `copiar-a-estrutura`) | a chave `global:` desses traits nunca emite em posição de valor no código do aluno; o CONTEÚDO é o atributo (`api:derive.<trait>`) — a chave fica coberta pelo `api:` da mesma aula |
| `global:Vec/HashMap/Option/Result` | **citados no iniciante** — VIA `api:` e a prosa (M7: o `Option` que `get`/`pop`/`parse` devolve; M8: `api:vec!`/`api:std::collections::HashMap`) | citados em prosa pelo iniciante, e o extrator só emite `global:` em posição de VALOR (`extract_ast.mjs:614-620` — em anotação de tipo emite `node:TypeIdentifier`) — então a chave nunca emite no código do aluno |
| `global:i32/usize` | **citados no iniciante** — VIA o tipo em prosa (o literal inteiro é semente e o tipo é `node:PrimitiveType`; o `usize` dos índices) | citados em prosa pelo iniciante, e o extrator só emite `global:` em posição de VALOR (`extract_ast.mjs:614-620` — em anotação de tipo emite `node:TypeIdentifier`) — então a chave nunca emite no código do aluno |
| `global:Eq/PartialOrd/Ord/Hash/Default/From/Into/TryFrom/TryInto/FromStr/ToOwned/ToString/AsRef/AsMut/Sized/Unpin/Drop` | intermediário/avançado | traits do prelude — cada um com aula no curso onde a questão dele nasce |
| `global:i8/i16/i64/i128/u8/u16/u32/u64/u128/f32/f64/char/isize/bool/str/alloc/core` | **receptivo por leitura, sem aula produtiva** | a família de tipos aparece em teoria (`bool`/`str` desde a aula 1, no `&str` e nas comparações; e no `usize` dos índices); o tipo em posição de assinatura é `node:PrimitiveType`, receptivo desde a aula 1 |
| `global:self`, `global:Self`, `node:Super`, `node:ModItem` (produtivo no intermediário) | intermediário (`o-codigo-em-modulos`) | `mod`/`use` próprios são conteúdo de organização de código |
| `global:std`, `api:std::io`, `api:std::io::stdout` | intermediário (E/S de verdade) | entrada do teclado exige `std::io`; o iniciante não tem canal de entrada |
| `node:ForeignMod` | **PROIBIDO SEMPRE** (`RS_FORBIDDEN_INVARIANTS`) | `extern "C"` quebra a decidibilidade e é a brecha da forja — o FFI está fora de TODA a cadeia, não só do iniciante |
| `node:TupleType` | fora da cadeia v1 | alias de tupla sem tupla-expressão não é evento de currículo; a tupla-expressão/desestruturação entra como dívida de corpus (abaixo) |
| `node:TypeCastExpression` (o `as`) | intermediário | conversão explícita entre tipos numéricos, depois da família de inteiros |
| `api:std::collections` (a raiz) | avançado | o módulo inteiro das coleções, com a medição |

**Dívidas de corpus (declaro porque o gate é fail-closed e as acha sozinho).** O inventário é
GERADO do corpus; construções que o corpus não usa ainda têm chaves que o EXTRATOR emite mas o
vocabulário não conhece. As ondas que quiserem introduzi-las precisam PRIMEIRO acrescentar o trecho
ao `app/tests/fixtures/rust/corpus.rs` e regenerar o inventário
(`node electron/main/engine/vocab/rs/gerar_inventario.mjs`) — o gerador existe para isso ("quando o
corpus crescer, a chave entra pela medição"): `op:binary:-` (subtração binária), `op:binary:/`,
`op:binary:%`, `op:compare:!=`, `op:compare:<=`, `op:compare:>=`, `op:logical:||`,
`op:assign:-=` (e os compostos restantes), `node:FloatLiteral` (números decimais),
`node:CharLiteral`, `node:ArrayExpression`, `node:TupleExpression` (tupla-expressão e padrão de
tupla no `for (k, v)`), `node:ContinueExpression` (o `continue`), anotação de lifetime explícita.
**Nenhuma aula deste contrato depende delas** — a aritmética do iniciante é `+` e `*`, a decisão é
`<`, `>`, `==`, `&&`, `!`, e `continue`/`||`/`!=` têm substituto no currículo. **`?` não tem chave e
não tem aula no iniciante** (§"O corte" em M7).

## 3. Os cursos seguintes — módulos e matérias (previstos)

Sem aula-a-aula (isso é trabalho das ondas de conteúdo de cada curso, com a porta-de-entrada
fechando o orçamento — §1). A nota vale para os três: **este curso re-introduz no módulo
porta-de-entrada as construções da fronteira do curso anterior; daí em diante, as tabelas valem
integralmente.**

### Curso 2 — `rust-intermediario` — do júnior-Rust ao pleno (porta + 7 módulos, ~100 aulas)

**Fronteira de saída:** pleno — traits e genéricos como contratos, closures e iteradores em vez de
laços manuais, erros que propagam, lifetime anotado, código em módulos, testes próprios.
**entryCriteria:** a saída do iniciante. **Porta:** `a-porta-dos-emprestimos` (14 aulas previstas, §1).

| Módulo | Aulas | Matérias |
|---|---|---|
| `traits-e-genericos` | 14 | trait definido e implementado, método de trait, tipos genéricos com bound, `Default`, `From`/`Into`/`ToString`/`FromStr`, type alias, `dyn` (dívida de corpus) |
| `closures-e-iteradores` | 14 | closure e captura, `Fn`/`FnMut`/`FnOnce`, `Iterator` e os adaptadores (`map`/`filter`/`collect`/`sum`/`zip`/`rev`), `collect` com anotação, o empréstimo dentro da closure |
| `erros-de-verdade` | 12 | erro próprio como struct, o `?` (dívida de corpus), `unwrap_or`/`unwrap_or_else`/`map_err`, `Box` de erro, quando pânico é aceitável |
| `o-emprestimo-anotado` | 10 | lifetime explícito (dívida de corpus), `'a` em parâmetro e tipo, a regra geral que o iniciante escondeu, struct que guarda referência |
| `o-codigo-em-modulos` | 12 | `mod` produtivo, arquivo por módulo, `use crate::`/`self::`/`super::`, `pub` produtivo, re-export, o crate real |
| `os-testes-que-voce-escreve` | 12 | `#[test]` produtivo, `assert!`/`assert_eq!`/`assert_ne!` produtivos, `#[should_panic]`, o `mod tests` com `super::`, TDD |
| `o-estado-que-compartilha` | 12 | `Rc`/`RefCell`/`Cell` (dono compartilhado), `Arc`/`Mutex`/`RwLock` (entre threads), quando NÃO compartilhar |

### Curso 3 — `rust-avancado` — do pleno ao sênior, medindo (porta + 3 módulos, ~36 aulas)

**Fronteira de saída:** sênior — medir antes de decidir, empacotar, impor qualidade por ferramenta.
**entryCriteria:** a saída do intermediário. **Porta:** `a-porta-da-medicao` (8 aulas previstas, §1).

| Módulo | Aulas | Matérias |
|---|---|---|
| `desempenho-e-medicao` | 12 | a coleção certa (`BTreeMap`/`BTreeSet`/`VecDeque`/`BinaryHeap`), `HashMap` × `BTreeMap` MEDIDO, o `clone` que custa, alocação, quando parar de otimizar |
| `empacotamento-e-cargo` | 10 | `Cargo.toml` por dentro, crate binário × biblioteca, features, workspace, doc comments, `crates.io` como leitura |
| `ferramentas-e-qualidade` | 6 | clippy, rustfmt, warnings como gate, CI |

### Curso 4 — `rust-especialista` — padrões e o capô da memória (porta + 3 módulos, ~42 aulas)

**Fronteira de saída:** sênior — escolher (e recusar) padrão, abrir o capô da memória e da
concorrência. **entryCriteria:** a saída do avançado. **Porta:** `a-porta-dos-padron` (9 aulas
previstas, §1).

| Módulo | Aulas | Matérias |
|---|---|---|
| `padroes-de-projeto-em-rust` | 12 | trait como contrato, newtype, builder, typestate com generics, state machine com enum, conversões `From`/`TryFrom`, quando NÃO usar padrão |
| `por-dentro-da-memoria` | 12 | `Box` (heap medido), stack × heap, `Rc`/`Arc` contagem de referência, interior mutability por dentro, `Drop`, `Copy` por dentro |
| `concorrencia-sem-medo` | 9 | `Send`/`Sync`, scoped threads, channel (`mpsc`), o `Mutex` bem usado, dados imutáveis compartilhados |

⚑ **O que a cadeia Rust NÃO tem (e o especialista de Python tem): a fronteira com C.** `extern "C"`
é `node:ForeignMod` — **proibição global** do harness. O capô do especialista Rust é a memória e a
concorrência, não o FFI; declarar isso não é limitação escondida, é o contrato do adaptador.

## 4. Contagem — módulos e aulas por curso

| Curso | Módulos | Aulas | Status |
|---|---|---|---|
| `rust-iniciante` | M1–M8 | 13+12+12+13+13+12+13+13 = **101** | **medidas** — contadas sobre as tabelas de §2 (verificação reexecutável: `0 falhas`) |
| `rust-intermediario` | porta + 7 | 14 + 86 = **100** | previstas |
| `rust-avancado` | porta + 3 | 8 + 28 = **36** | previstas |
| `rust-especialista` | porta + 3 | 9 + 33 = **42** | previstas |
| **cadeia** | 24 | **279** | 101 medidas + 178 previstas |

## 5. Split das ondas de conteúdo (ondas 3–7)

**Regras duras** — o que vem de [`18`](18-estado-da-fabricacao-dos-cursos.md) §3.3 e o que este
contrato endurece: **2 autores por onda** e `track.json` singleton com dono declarado (padrão do
18 §3.3); a **carga por onda é ajustada do padrão do 18 §3.3 (≈14 aulas/autor) para 12–13
aulas/autor e 2 módulos/onda**; e a **divisão de módulo é EVITADA** por decisão deste contrato —
mais dura que a fonte, que só exige **dono único do `module.json`** quando o módulo é partido.
Os oito módulos do iniciante cabem em **quatro ondas de dois módulos** (2 autores, 1 módulo cada);
a **quinta onda é o fecho** — os desafios de MÓDULO (um por módulo, 8 no total, 4 por autor, dono
único do `module.json` de cada módulo) + quitamento das dívidas declaradas de conteúdo (backfill de
`requirements[]`, forcing J5 dos desafios de tela). Partir M7+M8 (26 aulas) para caber em 25
dividiria um módulo — a divisão que este contrato evita; a onda 6 leva 26 e é declarada.

| Onda | Módulos (dono único por autor) | Aulas | Worktree sugerida (≤40 chars) |
|---|---|---|---|
| **3** | M1 `a-tela` (13) · M2 `decisao` (12) | 25 | `onda3-mod-a-tela-decisao` |
| **4** | M3 `repeticao` (12) · M4 `o-dono-do-valor` (13) | 25 | `onda4-mod-repeticao-dono-do-valor` |
| **5** | M5 `emprestar` (13) · M6 `estruturas` (12) | 25 | `onda5-mod-emprestar-estruturas` |
| **6** | M7 `variantes-e-match` (13) · M8 `colecoes` (13) | 26 | `onda6-mod-variantes-match-colecoes` |
| **7** | desafios de módulo M1–M8 (4 por autor) + dívidas de conteúdo | 0 | `onda7-desafios-de-modulo` |

Cada onda roda o ciclo completo por módulo: escrever as aulas → `npm run engine -- audit
rust-iniciante --limite 0` (0 violações) → `coverage` (0 lacunas) → `requirements` (bijação) →
`track:validate` → `track:challenge:verify` (as quatro provas por desafio) → gates de repo
(newline!) → squash-merge com gate em snapshot. **A trilha só existe como `rust-iniciante`
quando a onda 7 fecha** — até lá, os autores trabalham em draft com `--dir`.

## 6. Fontes oficiais por módulo (P-FONTE)

As `sources[]` de cada aula citam 2–3 destas URLs (verificáveis; o padrão de slug dos capítulos do
Book e os caminhos do Rust by Example confirmados por busca externa nesta onda — os demais seguem o
mesmo padrão publicado). Nunca URL inventada.

| Módulo | Fontes oficiais |
|---|---|
| M1 `a-tela` | [`book/ch03-03-how-functions-work.html`](https://doc.rust-lang.org/book/ch03-03-how-functions-work.html) · [`book/ch03-01-variables-and-mutability.html`](https://doc.rust-lang.org/book/ch03-01-variables-and-mutability.html) · [`std/macro.println.html`](https://doc.rust-lang.org/std/macro.println.html) · [`std/macro.format.html`](https://doc.rust-lang.org/std/macro.format.html) · [`rust-by-example/hello.html`](https://doc.rust-lang.org/rust-by-example/hello.html) · [`cargo/guide/project-layout.html`](https://doc.rust-lang.org/cargo/guide/project-layout.html) · [`cargo/commands/cargo-test.html`](https://doc.rust-lang.org/cargo/commands/cargo-test.html) |
| M2 `decisao` | [`book/ch03-05-control-flow.html`](https://doc.rust-lang.org/book/ch03-05-control-flow.html) · [`rust-by-example/flow_control/if_else.html`](https://doc.rust-lang.org/rust-by-example/flow_control/if_else.html) · [`reference/expressions/operator-expr.html`](https://doc.rust-lang.org/reference/expressions/operator-expr.html) · [`std/primitive.i32.html`](https://doc.rust-lang.org/std/primitive.i32.html) · [`std/primitive.bool.html`](https://doc.rust-lang.org/std/primitive.bool.html) · [`std/keyword.if.html`](https://doc.rust-lang.org/std/keyword.if.html) · [`std/keyword.else.html`](https://doc.rust-lang.org/std/keyword.else.html) |
| M3 `repeticao` | [`book/ch03-05-control-flow.html`](https://doc.rust-lang.org/book/ch03-05-control-flow.html) · [`rust-by-example/flow_control/loop.html`](https://doc.rust-lang.org/rust-by-example/flow_control/loop.html) · [`std/ops/struct.Range.html`](https://doc.rust-lang.org/std/ops/struct.Range.html) |
| M4 `o-dono-do-valor` | [`book/ch04-00-understanding-ownership.html`](https://doc.rust-lang.org/book/ch04-00-understanding-ownership.html) · [`book/ch04-01-what-is-ownership.html`](https://doc.rust-lang.org/book/ch04-01-what-is-ownership.html) · [`std/string/struct.String.html`](https://doc.rust-lang.org/std/string/struct.String.html) |
| M5 `emprestar` | [`book/ch04-02-references-and-borrowing.html`](https://doc.rust-lang.org/book/ch04-02-references-and-borrowing.html) · [`book/ch04-03-slices.html`](https://doc.rust-lang.org/book/ch04-03-slices.html) |
| M6 `estruturas` | [`book/ch05-01-defining-structs.html`](https://doc.rust-lang.org/book/ch05-01-defining-structs.html) · [`book/ch05-03-method-syntax.html`](https://doc.rust-lang.org/book/ch05-03-method-syntax.html) · [`rust-by-example/custom_types/structs.html`](https://doc.rust-lang.org/rust-by-example/custom_types/structs.html) |
| M7 `variantes-e-match` | [`book/ch06-01-defining-an-enum.html`](https://doc.rust-lang.org/book/ch06-01-defining-an-enum.html) · [`book/ch06-02-the-match-control-flow-construct.html`](https://doc.rust-lang.org/book/ch06-02-the-match-control-flow-construct.html) · [`std/option/`](https://doc.rust-lang.org/std/option/) · [`std/result/`](https://doc.rust-lang.org/std/result/) |
| M8 `colecoes` | [`book/ch08-00-common-collections.html`](https://doc.rust-lang.org/book/ch08-00-common-collections.html) · [`book/ch08-01-vectors.html`](https://doc.rust-lang.org/book/ch08-01-vectors.html) · [`book/ch08-03-hash-maps.html`](https://doc.rust-lang.org/book/ch08-03-hash-maps.html) · [`std/collections/struct.HashMap.html`](https://doc.rust-lang.org/std/collections/struct.HashMap.html) |
| todos (harness) | [`cargo/commands/cargo-test.html`](https://doc.rust-lang.org/cargo/commands/cargo-test.html) · [`cargo/guide/project-layout.html`](https://doc.rust-lang.org/cargo/guide/project-layout.html) · [`edition-guide/`](https://doc.rust-lang.org/edition-guide/) · [`rust-by-example/hello.html`](https://doc.rust-lang.org/rust-by-example/hello.html) |
