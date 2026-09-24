/**
 * app/electron/main/engine/quality/minimalRustTipos.ts — o vocabulário do
 * sintetizador mínimo de RUST (P/onda 5): constantes do contrato, os tipos de
 * leitura do teste e o stub vazio.
 *
 * A prosa normativa vive na fachada `minimalRust.ts`. Refatoração L04: arquivo
 * ≤500 linhas e toda função com CC≤8, sem mudança de comportamento observável.
 */

/** O id do adaptador que este módulo — e só ele — sintetiza. */
export const MINIMAL_RUST_LANGUAGE = 'rust' as const;

/** O crate que o teste importa quando o desafio é da forma `import`. */
export const CRATE_DA_SOLUCAO = 'desafio';

/**
 * O conteúdo do STUB VAZIO de um desafio de Rust: o ARQUIVO VAZIO.
 *
 * O default de `exec/proofs.ts` (`EMPTY_STUB_CODE`) é `export {};`, que é
 * JavaScript. O stub certo em Rust é o `src/lib.rs` vazio: crate válida que
 * compila, e o `use desafio::dobro;` do teste falha com `error[E0432]` —
 * exit 101, a prova 4 reprova por AUSÊNCIA de solução (medido), não por erro
 * de sintaxe estranho.
 */
export const RS_EMPTY_STUB_CODE = '';

/** Um assert lido do teste de Rust. */
export interface AssertRust {
  /** nome da macro (`assert_eq!`, `assert_ne!`, `assert!`). */
  assert: string;
  /** nome da função chamada no primeiro argumento (`dobro`) ou null. */
  funcao: string | null;
  /** TEXTO-FONTE do primeiro argumento (`dobro(2)`), ou null. */
  alvo: string | null;
  /** texto-fonte dos argumentos INTERNOs da chamada (`2`, `x, -3`). */
  argumentosDaChamada: string | null;
  /** texto-fonte do literal esperado (`4`), ou null quando não é o 2º arg. */
  esperado: string | null;
  /** texto cru do assert (descrição determinística, no máximo 120 chars). */
  trecho: string;
}

/** A forma do teste — decide QUAIS candidatos fazem sentido. */
export type FormaDoTesteRust = 'import' | 'desconhecida';

export interface LiteraisDoTesteRust {
  forma: FormaDoTesteRust;
  /** funções importadas de `desafio` (forma `import`); vazio na desconhecida. */
  funcoesAlvo: string[];
  asserts: AssertRust[];
}

export type ExtrairLiteraisRustResult =
  | { ok: true; dados: LiteraisDoTesteRust }
  | { ok: false; error: string };

/** Uma função-alvo localizada no starter de Rust. */
export interface FuncaoNoStarterRs {
  nome: string;
  /** o TEXTO da declaração inteira (`pub fn soma(a: i32, b: i32) -> i32 { … }`). */
  texto: string;
  /** offset do CORPO (o `block`) dentro do texto da declaração. */
  corpoStart: number;
  /** offset absoluto da declaração no starter (ordem determinística). */
  start: number;
}
