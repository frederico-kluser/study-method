# Receita da aula — o capítulo RUST

A parte da receita que depende do adaptador Rust. O que vale nas três línguas está em
`receita-da-aula.md` (§0 layout · §1 `lesson.json` · §2 `challenge.json` · §3 fases do canal ·
§4 a regra do par e `introduces.derived` · §5 o gate das demonstrações). Abra este arquivo quando
`track.json.programmingLanguage` for `rust` — e só então.

Trilha viva: `app/resources/tracks/rust-iniciante` (`runtime: cargo-1.98`, `entryCriteria: ["zero
absoluto — nunca programou"]`). Contrato de conteúdo: `docs/20-trilha-rust.md`.

> **É a trilha que motivou a barra A17–A23.** Medido em 2026-09-22 às 01:52, antes do conserto:
> a aula 1 (`a-tela/a-primeira-funcao`) declarava **11 chaves novas** (6 produtivas + 5 receptivas)
> em **1 seção de teoria**, para um aluno "zero absoluto", e saía do `audit` com 0 violações.
> `npm run engine -- barra rust-iniciante --aula a-tela/a-primeira-funcao` → **5 erros**
> (A17 · A18 ×2 · A21 ×2) + 5 avisos A22. O plano de quebra dessa aula, passo a passo, é o
> EXEMPLO TRABALHADO de `quebra-da-aula.md` §8. A trilha foi consertada em paralelo nesta mesma
> execução: às **02:26** o mesmo comando sobre a trilha inteira devolvia **0 erros · 46 avisos ·
> 103 aulas · exit 0** (duas aulas novas a mais que as 101 do começo). **Re-meça antes de citar
> qualquer placar dela.**

**PATH obrigatório em todo comando de gate de Rust** (o `cargo` é keg-only nesta máquina):

```bash
export PATH="/opt/homebrew/opt/rustup/bin:$PATH"   # sem isto: `env: cargo: No such file or directory`
cargo --version                                     # → cargo 1.98.1 (medido)
```

## 1. Inventário e vocabulário — onde está e como conferir

`app/electron/main/engine/vocab/atoms.rust.json` — **191 chaves** (node 77 · op 14 · decl 4 ·
global 77 · api 19), geradas com `rust_toolchain 1.98.1` e parser `web-tree-sitter` +
`tree-sitter-rust 0.24.0`:

```bash
cd app && python3 -c "import json; d=json.load(open('electron/main/engine/vocab/atoms.rust.json')); print(d['total'], {k: len(v) for k, v in d['axes'].items()})"
# → 191 {'node': 77, 'op': 14, 'decl': 4, 'global': 77, 'api': 19}
```

- O eixo `decl:` corta as **quatro formas de ligação de nome**: `decl:let`, `decl:let-mut`,
  `decl:const`, `decl:static` — a didática está na FORMA.
- Tags de cerca aceitas na teoria: `rust`, `rs` (`RS_THEORY_FENCE_TAGS`). Bloco com outra tag não é
  código para o gate — A19 reprova a aula como se a demonstração não existisse.
- Chave duvidosa? Rode o extrator (`receita-da-aula.md` §5.1) com `language:"rust"` e
  `surface:"theory"`, e use a chave EXATA emitida.

## 2. Axioma de entrada e semente receptiva do harness

Medido: **estruturais 6 · semente 25 · axioma 29 chaves**.

```bash
cd app && export PATH="/opt/homebrew/opt/rustup/bin:$PATH" && npx tsx -e 'import {harnessReceptiveSeed, structuralAlwaysAllowed} from "./electron/main/engine/atomKeys"; const s = harnessReceptiveSeed("rust"), e = structuralAlwaysAllowed("rust"); console.log(s.length, e.length, new Set([...s, ...e]).size)'
# → 25 6 29
```

- **Estruturais sempre permitidos** (`RUST_STRUCTURAL_ALWAYS_ALLOWED`): `node:SourceFile` ·
  `node:Identifier` · `node:ExpressionStatement` · `node:Arguments` · `node:LineComment` ·
  `node:MacroArg`.
- **Semente receptiva do harness** (`RUST_HARNESS_RECEPTIVE_SEED`) — o invólucro do arquivo de
  teste: `node:UseDeclaration` · `node:ScopedIdentifier` · `node:Identifier` ·
  `node:AttributeItem` · `node:Attribute` · `node:FunctionItem` · `node:Parameters` · `node:Block`
  · `node:ExpressionStatement` · `node:CallExpression` · `node:MacroInvocation` · `node:TokenTree`
  · `node:LetDeclaration` · `decl:let` · `node:ModItem` · `node:DeclarationList` · `node:Super` ·
  `node:IntegerLiteral` · `node:StringLiteral` · `node:BooleanLiteral` · `api:test` ·
  `api:cfg.test` · `api:assert_eq!` · `api:assert_ne!` · `api:assert!`.
- **`use desafio::dobro;` não emite `api:` nenhuma** — o crate do aluno não é API externa (o
  análogo exato do `from solucao import dobro` do Python).
- **A semente é RECEPTIVA, não produtiva.** É a armadilha nº 1 desta trilha: `node:IntegerLiteral`
  está na semente, então o aluno **LÊ** um número no teste desde a aula 1 — mas **ESCREVER** um
  número na solução é construção produtiva NOVA, que precisa de aula, demonstração e declaração.
  O mesmo vale para `node:StringLiteral` e `node:BooleanLiteral`.
- Não existe axioma produtivo próprio além dos estruturais: `entryAxiom` põe no produtivo só
  `structuralAlwaysAllowed(language)` (`engine/budget.ts`, `entryAxiom`).

## 3. A forma do arquivo de teste — a crate `desafio` e o `#[test]`

O adaptador GERA (nunca escreva no repositório) `Cargo.toml` + `src/lib.rs` (o `solutionCode`/
`starterCode`) + `tests/desafio.rs` (o `testsCode`). O comando é `cargo test --offline`
(`RS_TEST_COMMAND`), e o manifesto carrega as travas medidas:

```toml
[lib]
test = false      # os #[test] do CÓDIGO DO ALUNO não são coletados — é o exit-guard do Rust
doctest = false   # doc-comment não vira prova
[dependencies]    # vazio: stdlib only, CARGO_NET_OFFLINE zera a rede
```

O `testsCode` é um **teste de integração** da crate: importa o que o aluno escreveu e assere com as
macros do prelude.

```rust
use desafio::dobro;

#[test]
fn testa_dobro_positivo() {
    assert_eq!(dobro(2), 4);
}

#[test]
fn testa_dobro_de_dez() {
    assert_eq!(dobro(10), 20);
}
```

- `expectedTestCount` = número de `#[test]` (igualdade dupla: declarada == executada). O nome de
  cada `fn testa_*` é o que o `requirements[].teste` cita, 1:1.
- Exit codes medidos (`RS_FAILURE_POLICY`): **0** passou · **101** teste falhou, `panic!` ou erro
  de COMPILAÇÃO · 1/2 erro de uso do cargo · 137 timeout/OOM. Erro de compilação e teste vermelho
  compartilham o 101 — leia o veredito, nunca só o exit.
- `running 0 tests` sai **0** em Rust: sem a igualdade dupla, um desafio sem teste nenhum passaria.
- A função do desafio vem do slug em **snake_case** (`dobro-do-numero` → `dobro_do_numero`), e o
  starter usa `todo!()` para falhar (prova 2). `api:todo!` é chave: se o aluno a LÊ no starter,
  ela precisa de demonstração na teoria da aula (A18/A19) ou o gate reprova.
- Fases do canal: a captura de `stdout` da fase SAÍDA é da trilha (`docs/20-trilha-rust.md`); a
  fase VALOR é a forma acima, sem captura.

## 4. Proibições globais — em qualquer superfície

`RS_FORBIDDEN_INVARIANTS` (8 chaves): `api:std::process::exit` · `api:std::process::abort` ·
`api:std::process::ExitCode` · `node:ForeignModItem` · `api:asm!` · `api:naked_asm!` ·
`api:link_section` · `api:export_name`. Elas existem porque em Rust a defesa contra **relatório
forjado** é o orçamento: `println!("test result: ok. 2 passed; …")` + `std::process::exit(0)`
mataria o runner antes do relatório real. Só em prosa com crase, nunca em bloco cercado.

## 5. Armadilhas conhecidas do adaptador

| Armadilha | O que acontece | O que fazer |
|---|---|---|
| fragmento na teoria | `dobro(-3)` e `let x = 5;` soltos NÃO parseiam (fora de um corpo só valem ITENS) — o gate via ZERO demonstração em 31 blocos da trilha | passe `surface: 'theory'` ao extrator; o ENVELOPE DE FRAGMENTO (`extract.ts`) embrulha o trecho em `fn sm_fragmento_de_teoria() { … }`. Medido: sem `surface`, `ERRO erro de sintaxe: falta ;`; com ele, `node:CallExpression node:IntegerLiteral node:UnaryExpression op:unary:-` |
| a assinatura é UM gesto, 5 chaves | `pub fn dobro(x: i32) -> i32 {` emite `node:FunctionItem` + `node:Parameters` + `node:Parameter` + `node:PrimitiveType` + `node:VisibilityModifier` na MESMA linha | declare `node:FunctionItem` produtiva e as outras quatro em `introduces.derived` (§4 do comum) — A23 confere a co-ocorrência e A17 conta 1 |
| literal é conteúdo | escrever `2` na solução emite `node:IntegerLiteral` produtiva, mesmo estando na semente RECEPTIVA | ou a aula ensina o literal, ou o desafio devolve o que recebeu (`pub fn mesmo(x: i32) -> i32 { x }` — `node:Identifier` é estrutural) |
| o argumento do teste é conteúdo | `dobro(-3)` no `testsCode` emite `op:unary:-` — matéria de aula, não harness | só use no teste o que a semente + as aulas anteriores liberam (A3) |
| `cargo` fora do PATH | `env: cargo: No such file or directory`, e o lote inteiro reprova "por conteúdo" | `export PATH="/opt/homebrew/opt/rustup/bin:$PATH"` em TODO comando; e o 1º run de cargo é cold-start — re-rode antes de diagnosticar conteúdo |
| contenção no mesmo `CARGO_HOME` | gates paralelos travam um no outro | serialize os gates de Rust |

## 6. Tetos da barra (iguais nas três línguas, `quality/barra.ts`)

| Constante | Valor | Regra |
|---|---|---|
| `TETO_PRODUTIVAS_NOVAS` | 2 | A17 |
| `TETO_PRODUTIVAS_NOVAS_AULA_1` | 1 | A18 |
| `TETO_NOVAS_TOTAL` | 4 | A21 |
| `MINIMO_SECOES_DE_TEORIA` | 2 | A21 (e ≥ ⌈novas/2⌉) |
| `MINIMO_FORMAS_POR_CHAVE` | 2 | A22 (aviso) |

```bash
cd app && export PATH="/opt/homebrew/opt/rustup/bin:$PATH" && npm run engine -- barra rust-iniciante
# exit 0 sem erro · exit 1 com erro (A22 sozinho não reprova)
```
