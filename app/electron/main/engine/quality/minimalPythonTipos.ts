/**
 * app/electron/main/engine/quality/minimalPythonTipos.ts — o vocabulário do
 * sintetizador mínimo de PYTHON: as tabelas de asserts do `unittest`, os tipos
 * de leitura do teste e o stub vazio.
 *
 * A prosa normativa vive na fachada `minimalPython.ts`. Refatoração L04:
 * arquivo ≤500 linhas e toda função com CC≤8, sem mudança de comportamento.
 */

import { PY_ENTRY_PATH } from '../lang/python';

/** O id do adaptador que este módulo — e só ele — sintetiza. */
export const MINIMAL_PYTHON_LANGUAGE = 'python' as const;

/** O módulo que o teste importa quando o desafio é da forma `import`. */
export const MODULO_DA_SOLUCAO = PY_ENTRY_PATH.replace(/\.py$/, '');

// ---------------------------------------------------------------------------
// A tabela de asserts do unittest (o análogo de ASSERTS_DE_COMPARACAO)
// ---------------------------------------------------------------------------

/** Asserts do `unittest` que comparam um valor com um ESPERADO. */
export const ASSERTS_DE_COMPARACAO_PY: ReadonlySet<string> = new Set([
  'assertEqual',
  'assertEquals',
  'assertMultiLineEqual',
  'assertListEqual',
  'assertDictEqual',
  'assertTupleEqual',
  'assertSetEqual',
  'assertIs',
]);

/** Todo assert que este módulo sabe LER (os de comparação mais os unários). */
export const ASSERTS_PY: ReadonlySet<string> = new Set([
  ...ASSERTS_DE_COMPARACAO_PY,
  'assertTrue',
  'assertFalse',
  'assertIsNone',
  'assertRaises',
]);

/**
 * O conteúdo do STUB VAZIO de um desafio de Python: o ARQUIVO VAZIO.
 *
 * O default de `exec/proofs.ts` (`EMPTY_STUB_CODE`) é `export {};`, que é
 * JavaScript — num `solucao.py` ele vira `SyntaxError`, e a prova 4 ("o stub
 * vazio falha") passaria por erro de sintaxe em vez de por ausência de
 * solução. O stub certo em Python é o módulo válido e vazio: ele falha porque
 * não imprime nada e não define nada, que é o que a prova quer demonstrar.
 */
export const PY_EMPTY_STUB_CODE = '';

/** Tipos de nó que o adaptador Python emite para um literal escalar. */
export const LITERAIS_ESCALARES: ReadonlySet<string> = new Set([
  'StrLiteral',
  'BytesLiteral',
  'IntLiteral',
  'FloatLiteral',
  'ComplexLiteral',
  'BoolLiteral',
  'NoneLiteral',
  'EllipsisLiteral',
]);

/** Um assert lido do teste de Python. */
export interface AssertPython {
  /** nome do método do unittest (`assertEqual`, `assertTrue`, ...). */
  assert: string;
  /** nome da função chamada no primeiro argumento (`rodar`, `somar`) ou null. */
  funcao: string | null;
  /** TEXTO-FONTE do literal esperado (`"oi\n"`), ou null quando não é literal. */
  esperado: string | null;
  /** `repr()` do esperado quando literal — a fonte do valor decodificado. */
  esperadoRepr: string | null;
  /** valor decodificado quando o esperado é uma STRING literal; senão null. */
  esperadoTexto: string | null;
  /** texto-fonte de cada argumento da chamada (null quando não é literal). */
  argumentos: Array<string | null>;
  /** texto cru do assert (descrição determinística, no máximo 120 chars). */
  trecho: string;
}

/** A forma do teste — decide QUAIS candidatos fazem sentido. */
export type FormaDoTestePython = 'stdout' | 'import' | 'desconhecida';

export interface LiteraisDoTestePython {
  forma: FormaDoTestePython;
  /** funções importadas de `solucao` (forma `import`); vazio na forma `stdout`. */
  funcoesAlvo: string[];
  asserts: AssertPython[];
}

export type ExtrairLiteraisPythonResult =
  | { ok: true; dados: LiteraisDoTestePython }
  | { ok: false; error: string };

/** Uma função-alvo localizada no starter (forma `import`). */
export interface FuncaoNoStarterPy {
  nome: string;
  /** parâmetros posicionais declarados, na ordem. */
  params: string[];
  /** offset absoluto da declaração (ordem determinística). */
  start: number;
}
