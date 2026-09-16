// tests/fixtures/rust/harness-mod-testes.rs — A SEGUNDA FORMA de harness da
// trilha `rust-iniciante`: o módulo de testes internos (`#[cfg(test)] mod
// tests`), que a trilha usa quando o desafio é de ARQUIVO ÚNICO (o teste vive
// no mesmo arquivo do aluno — o análogo da mudança de forma que o lado Python
// teve entre a fase SAÍDA e a fase VALOR).
//
// O papel é o mesmo do `harness-desafio.rs`: é contra ESTE arquivo também que
// a semente receptiva (`RUST_HARNESS_RECEPTIVE_SEED`) é medida por
// `tests/engineLangRust.test.ts` nos DOIS sentidos — todo o INVÓLUCRO cabe na
// semente ∪ estrutural, e o ARGUMENTO do teste continua fora.
#[cfg(test)]
mod tests {
    use super::dobro;
    use super::sauda;

    #[test]
    fn testa_verdade() {
        assert!(true);
        assert_ne!(2, 5);
    }

    #[test]
    fn testa_via_variavel() {
        let resultado = dobro(2);
        assert_eq!(resultado, 4);
        assert_eq!(sauda(), "oi");
    }
}
