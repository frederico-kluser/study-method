/**
 * app/electron/main/engine/quality/minimalCTipos.ts — o vocabulário do
 * sintetizador mínimo de C: as tabelas do counter_protocol, os tipos de
 * leitura do teste e o stub vazio.
 *
 * A prosa normativa vive na fachada `minimalC.ts`. Refatoração L04: arquivo
 * ≤500 linhas e toda função com CC≤8, sem mudança de comportamento observável.
 */

/** O id do adaptador que este módulo — e só ele — sintetiza. */
export const MINIMAL_C_LANGUAGE = 'c' as const;

/**
 * O conteúdo do STUB VAZIO de um desafio de C: o ARQUIVO VAZIO.
 *
 * O default de `exec/proofs.ts` (`EMPTY_STUB_CODE`) é `export {};`, que é
 * JavaScript — num `solucao.c` ele nem compila, e a prova 4 ("o stub vazio
 * falha") passaria por erro de SINTAXE em vez de por ausência de solução. O
 * stub certo em C é a unidade de tradução vazia (válido por construção): ela
 * falha porque o TU de teste referencia a função do aluno e a LIGAÇÃO reprova
 * com símbolo indefinido — a falha certa, a que a prova quer demonstrar.
 */
export const C_EMPTY_STUB_CODE = '';

/** Os helpers de verificação do counter_protocol (03-tdd §3.9.3) — os MESMOS
 * nomes que `SM_HARNESS_HEADER` define e `SM_COUNT_PREABULO` prototipa. */
export const CHECAS_C: ReadonlySet<string> = new Set([
  'checa_int',
  'checa_long',
  'checa_double',
  'checa_char',
  'checa_str',
]);

/**
 * Os literais da linguagem cujo TEXTO-FONTE é uma EXPRESSÃO C válida — é o
 * que permite gerar `return <texto>;` e `printf(<texto>)` copiando o teste
 * verbatim (a "tabela de literais" de C é o próprio fonte: `4`, `2.5`, `'a'`,
 * `"oi\n"` já nascem na sintaxe de C).
 */
export const LITERAIS_C: ReadonlySet<string> = new Set([
  'StringLiteral',
  'CharacterLiteral',
  'IntegerLiteral',
  'FloatingLiteral',
]);

/** Um protótipo de função do ALUNO declarado no testsCode. */
export interface PrototipoC {
  /** nome da função (`tela`). */
  nome: string;
  /**
   * o TEXTO da assinatura (sem o `;` final) — o cabeçalho pronto da DEFINIÇÃO
   * mínima (`void tela(void)`). É o contrato que o teste declara: o mínimo
   * NÃO inventa assinatura, ele a copia do protótipo.
   */
  assinatura: string;
  /** nomes dos parâmetros declarados, na ordem. */
  params: string[];
  /** offset absoluto do protótipo no testsCode parseado (ordem determinística). */
  start: number;
}

/** Uma verificação `checa_*(cenario, obtido, esperado, porque)` lida do teste. */
export interface ChecaC {
  /** qual helper (`checa_int`, `checa_str`, …). */
  helper: string;
  /**
   * nome da função do ALUNO chamada no argumento `obtido` (`dobro` em
   * `checa_int("x", dobro(2), 4, …)`) — null quando o obtido não é chamada
   * (o `linha` do `checa_str` de captura de stdout, por exemplo).
   */
  chamadaAlvo: string | null;
  /** textos-fonte dos argumentos LITERAIS da chamada ao aluno, na ordem. */
  argumentosAlvo: string[];
  /** TEXTO-FONTE do literal esperado (`"oi\n"`, `4`, `'a'`) ou null. */
  esperadoTexto: string | null;
  /** o kind do nó do esperado (`StringLiteral`, `IntegerLiteral`, …). */
  esperadoKind: string | null;
}

export interface LiteraisDoTesteC {
  /** os protótipos de função do aluno, na ordem do fonte. */
  prototipos: PrototipoC[];
  /** as verificações `checa_*`, na ordem do fonte. */
  checas: ChecaC[];
}

export type ExtrairLiteraisCResult =
  | { ok: true; dados: LiteraisDoTesteC }
  | { ok: false; error: string };

/** A forma do teste, decidida pelo que ele DECLARA. */
export type FormaDoTesteC = 'impressao' | 'valor' | 'mista' | 'desconhecida';
