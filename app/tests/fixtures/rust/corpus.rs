// tests/fixtures/rust/corpus.rs — o CORPUS do inventário de Rust.
//
// Este arquivo existe para DUAS coisas, as duas travadas por teste:
//
//   1. É a ENTRADA de `vocab/rs/gerar_inventario.mjs`: o gerador passa este
//      fonte pelo extrator real (`vocab/rs/extract_ast.mjs`) e escreve
//      `vocab/atoms.rust.json` com TODA chave emitida nos eixos fechados
//      (node/op/decl) mais as listas estáticas do prelude (global/api de
//      macro). Regra do repositório (§6): "gerado do inventory() do adaptador,
//      nunca digitado" — e o inventário aqui é GERADO de uma árvore real.
//
//   2. É a RÉGUA do teste "TODA chave emitida nos eixos FECHADOS pertence ao
//      vocabulário": se o extrator passar a emitir uma chave nova, o corpus
//      precisa dela e o artefato precisa ser regenerado — emissão fora do
//      vocabulário é bug de cobertura, e o teste reprova.
//
// Cada construção da trilha `rust-iniciante` aparece EXATAMENTE uma vez aqui,
// comentada com o que introduz. O arquivo não precisa compilar como crate
// inteira (o extrator não executa nada) — mas cada trecho é Rust válido.

use std::collections::HashMap;
use std::io::stdout;

// ── ligação de nome: let × let mut × const × static ─────────────────────────
const LIMITE: i32 = 10;
static NOME: &str = "fixo";

fn ligacoes(x: i32) -> i32 {
    let imutavel = x;
    let mut mutavel = x;
    mutavel = mutavel + 1; // assignment_expression → op:assign:=
    mutavel += 2;          // compound_assignment_expr → op:assign:+=
    mutavel
}

// ── funções, parâmetros, retorno, métodos, self ─────────────────────────────
fn soma(a: i32, b: i32) -> i32 {
    a + b
}

struct Ponto {
    x: i32,
    y: i32,
}

impl Ponto {
    fn novo(x: i32) -> Ponto {
        Ponto { x, y: 0 }
    }

    fn deslocar(&mut self, dx: i32) {
        self.x = self.x + dx; // field_expression + assignment
        let dobrado = self.x * 2;
        dobrado;
    }

    fn coordenada(&self) -> i32 {
        self.y
    }
}

// ── enums, traits, mod, tipo alias ──────────────────────────────────────────
// ── a variante que carrega: a lista ORDENADA de campos da variante de tupla ─
// `Alguma(i32)` é o `ordered_field_declaration_list` — a lista de campos
// ANÔNIMOS (ordenados, não nomeados) que só existe em variante que carrega.
enum Vale {
    Nada,
    Alguma(i32),
}

enum Cor {
    Vermelho,
    Azul,
}

trait Area {
    fn area(&self) -> f64;
}

mod interno {
    pub const SEGUNDO: u8 = 2;
}

type Par = (i32, i32);

// ── controle de fluxo: if/else if/else, match, loop, while, for ─────────────
fn fluxo(x: i32) -> i32 {
    if x > 0 {
        1
    } else if x == 0 {
        0
    } else {
        -1
    }
}

fn casamento(cor: Cor) -> u8 {
    match cor {
        Cor::Vermelho => 1,
        Cor::Azul => 2,
    }
}

fn lacos(mut n: i32) -> i32 {
    let mut total = 0;
    loop {
        n += 1;
        if n > 3 {
            break;
        }
    }
    while n < 100 {
        n = n * 2;
    }
    for i in 0..3 {
        total += i;
    }
    for i in 0..=3 {
        total += i;
    }
    total
}

// ── referências: &T × &mut T, deref, borrow ─────────────────────────────────
fn referencias(x: i32) -> i32 {
    let r: &i32 = &x;
    let mut y = 5;
    let rm: &mut i32 = &mut y;
    *rm = 7; // deref: unary * → op:unary:*
    *r
}

// ── coleções, strings, macros, método em receptor ───────────────────────────
fn colecoes() -> String {
    let v = vec![1, 2, 3];
    let primeiro = v[0];
    let soma = v.len() as i32 + primeiro;
    let texto = format!("total: {}", soma);
    println!("{}", texto);
    let mut mapa: HashMap<String, i32> = HashMap::new();
    mapa.insert(String::from("chave"), soma);
    stdout();
    texto
}

// ── closures, Option/Result, booleanos ──────────────────────────────────────
fn opcionais() -> Option<i32> {
    let dobro = |x: i32| x * 2;
    let nada: Option<i32> = None;
    let falso = true && false;
    let negado = !falso;
    match nada {
        Some(v) => Some(dobro(v)),
        None => None,
    }
}

// ── a macro do placeholder: todo!() é o CORPO padrão do starter do desafio ──
fn pendente() -> i32 {
    todo!() // api:todo! — a macro de "ainda não implementado" do prelude
}

// ── o HARNESS de teste: #[test], assert_eq!, assert!, #[derive(...)] ────────
#[derive(Debug, Clone, PartialEq)]
struct Ponto2 {
    x: i32,
}

#[cfg(test)]
mod tests {
    use super::Ponto2;

    #[test]
    fn testa_dobro() {
        assert_eq!(Ponto2 { x: 2 }.x, 4);
    }

    #[test]
    fn testa_verdade() {
        assert!(true);
    }
}
