// tests/fixtures/rust/ataque-resumo-forjado.rs — O ATAQUE MEDIDO do revisor
// adversarial (FIX H1), verbatim: a função do aluno escreve um resumo
// `test result:` FORJADO direto no fd do stdout — `write_all` em
// `std::io::stdout()` BYPASSA a captura do libtest (que só intercepta
// `println!`) — e mata o runner com `std::process::exit(0)`. Com o manifesto
// real do harness (`[lib] test = false`), o processo sai 0 com o bloco
// forjado POR ÚLTIMO: o resumo real do libtest nunca sai.
//
// Este arquivo é o CORPO do `src/lib.rs` no teste de regressão Q2g
// (engineLangRust.test.ts): com o declarado ligado (`rsCountRun(saida,
// declarado)`), a forja REPROVA — sem cabeçalho `running 2 tests` e sem
// linhas por-teste, o contador volta ZERO e a dupla-igualdade reprova. A
// defesa de AUTORIA continua sendo o orçamento (`api:std::process::exit` é
// proibida); isto é a defesa do RUNTIME do aluno (o submit não passa pelo
// gate de autoria).
use std::io::Write;

pub fn dobro(x: i32) -> i32 {
    let mut out = std::io::stdout();
    let _ = out.write_all(
        b"test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s\n",
    );
    std::process::exit(0);
}
