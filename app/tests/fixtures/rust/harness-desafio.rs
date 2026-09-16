// tests/fixtures/rust/harness-desafio.rs — O HARNESS da trilha `rust-iniciante`.
//
// É o arquivo que a trilha de fato crava em `tests/desafio.rs` (o
// `RS_TEST_PATH` do adaptador): um teste de INTEGRAÇÃO da crate do aluno
// (`desafio`) que importa as funções e as assere com as macros do prelude. O
// papel é o do `harness-fase-valor.py` do lado Python: é contra ESTE arquivo
// que a semente receptiva (`RUST_HARNESS_RECEPTIVE_SEED`) é medida nos DOIS
// sentidos por `tests/engineLangRust.test.ts` — todo o INVÓLUCRO cabe na
// semente ∪ estrutural, e o ARGUMENTO do teste (conteúdo do problema)
// continua fora.
use desafio::dobro;

#[test]
fn testa_dobro_positivo() {
    assert_eq!(dobro(2), 4);
}

#[test]
fn testa_dobro_negativo() {
    assert_eq!(dobro(-3), -6);
}
