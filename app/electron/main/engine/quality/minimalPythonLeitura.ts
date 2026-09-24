/**
 * app/electron/main/engine/quality/minimalPythonLeitura.ts — a LEITURA do
 * teste e do starter de Python pelo AST do adaptador (subprocesso `ast` +
 * `symtable`): asserts do `unittest`, forma do teste (stdout × import) e as
 * funções-alvo no starter.
 *
 * A prosa normativa vive na fachada `minimalPython.ts`. Refatoração L04:
 * arquivo ≤500 linhas e toda função com CC≤8, sem mudança de comportamento.
 */

import { PY_ENTRY_PATH } from '../lang/python';
import { getAdapter, type LangNode } from '../lang/registry';
import {
  ASSERTS_DE_COMPARACAO_PY,
  ASSERTS_PY,
  LITERAIS_ESCALARES,
  MINIMAL_PYTHON_LANGUAGE,
  MODULO_DA_SOLUCAO,
  type AssertPython,
  type ExtrairLiteraisPythonResult,
  type FormaDoTestePython,
  type FuncaoNoStarterPy,
  type LiteraisDoTestePython,
} from './minimalPythonTipos';
import { decodificarReprDeStringPython } from './minimalPythonLiterais';

/** Caminha a árvore normalizada aplicando `fn` a cada nó (pré-ordem). */
function caminhar(node: LangNode, fn: (n: LangNode) => void): void {
  fn(node);
  for (const filho of node.children) caminhar(filho, fn);
}

/** O nome chamado por um `Call`: `rodar()` -> `rodar`; `self.assertEqual(...)` -> `assertEqual`. */
function nomeDoCallee(call: LangNode): string | null {
  const func = call.children.find((c) => c.attributes.field === 'func');
  if (func === undefined) return null;
  if (func.type === 'Name') return func.attributes.id ?? null;
  if (func.type === 'Attribute') return func.attributes.attr ?? null;
  return null;
}

/** Os argumentos POSICIONAIS de um `Call`, na ordem. */
function argumentosPosicionais(call: LangNode): LangNode[] {
  return call.children.filter((c) => c.attributes.field === 'args');
}

function ehLiteral(node: LangNode): boolean {
  return LITERAIS_ESCALARES.has(node.type);
}

/** `from solucao import a, b` — coleta as funções-alvo da forma `import`. */
function coletarImportDaSolucaoPy(node: LangNode, funcoesAlvo: Set<string>): void {
  if (node.type !== 'ImportFrom' || node.attributes.module !== MODULO_DA_SOLUCAO) return;
  for (const alias of node.children) {
    if (alias.type === 'alias' && alias.attributes.name !== undefined) {
      funcoesAlvo.add(alias.attributes.asname ?? alias.attributes.name);
    }
  }
}

/** `runpy.run_path("solucao.py")` — a marca da forma `stdout`. */
function ehRunPathDoAluno(node: LangNode): boolean {
  const primeiro = argumentosPosicionais(node)[0];
  if (primeiro === undefined || primeiro.type !== 'StrLiteral') return false;
  const alvo = decodificarReprDeStringPython(primeiro.attributes.value ?? '');
  return alvo === PY_ENTRY_PATH;
}

/** O lado ESPERADO de um assert (só quando é literal de comparação). */
interface EsperadoPyLido {
  esperado: string | null;
  esperadoRepr: string | null;
  esperadoTexto: string | null;
}

function lerEsperadoPy(esperadoNode: LangNode | undefined): EsperadoPyLido {
  const vazio: EsperadoPyLido = { esperado: null, esperadoRepr: null, esperadoTexto: null };
  if (esperadoNode === undefined || !ehLiteral(esperadoNode)) return vazio;
  const esperado = esperadoNode.text;
  const esperadoRepr = esperadoNode.attributes.value ?? null;
  let esperadoTexto: string | null = null;
  if (esperadoNode.type === 'StrLiteral' && esperadoRepr !== null) {
    esperadoTexto = decodificarReprDeStringPython(esperadoRepr);
  }
  return { esperado, esperadoRepr, esperadoTexto };
}

/** UM assert do `unittest` — null quando a chamada não está na tabela. */
function lerAssertPy(node: LangNode, nome: string): AssertPython | null {
  if (!ASSERTS_PY.has(nome)) return null;
  const args = argumentosPosicionais(node);
  const alvo = args[0];
  const esperadoNode = ASSERTS_DE_COMPARACAO_PY.has(nome) ? args[1] : undefined;

  let funcao: string | null = null;
  const argumentos: Array<string | null> = [];
  if (alvo !== undefined && alvo.type === 'Call') {
    funcao = nomeDoCallee(alvo);
    for (const a of argumentosPosicionais(alvo)) argumentos.push(ehLiteral(a) ? a.text : null);
  }

  return {
    assert: nome,
    funcao,
    ...lerEsperadoPy(esperadoNode),
    argumentos,
    trecho: node.text.slice(0, 120),
  };
}

/**
 * Lê os asserts e a FORMA de um arquivo de teste de Python.
 *
 * Determinístico: mesma entrada, mesma saída. Parse falhou => `{ok:false}` com
 * a mensagem do adaptador (que já traz código, linha e coluna).
 */
export function extrairLiteraisDoTestePython(testsCode: string): ExtrairLiteraisPythonResult {
  const adapter = getAdapter(MINIMAL_PYTHON_LANGUAGE);
  const parsed = adapter.parse(testsCode, { fileName: 'tests/test_solucao.py' });
  if (!parsed.ok) {
    return {
      ok: false,
      error:
        'testsCode não parseia como Python (' +
        parsed.error.code + ' em ' + parsed.error.line + ':' + parsed.error.column + '): ' +
        parsed.error.message,
    };
  }

  const funcoesAlvo = new Set<string>();
  const asserts: AssertPython[] = [];
  let rodaOArquivoDoAluno = false;

  caminhar(parsed.root, (node) => {
    coletarImportDaSolucaoPy(node, funcoesAlvo);
    if (node.type !== 'Call') return;
    const nome = nomeDoCallee(node);
    if (nome === null) return;
    if (nome === 'run_path') {
      if (ehRunPathDoAluno(node)) rodaOArquivoDoAluno = true;
      return;
    }
    const assert = lerAssertPy(node, nome);
    if (assert !== null) asserts.push(assert);
  });

  const forma: FormaDoTestePython = rodaOArquivoDoAluno
    ? 'stdout'
    : funcoesAlvo.size > 0
      ? 'import'
      : 'desconhecida';

  return { ok: true, dados: { forma, funcoesAlvo: [...funcoesAlvo].sort(), asserts } };
}

/** Localiza as funções-alvo no starter de Python (`def nome(...)`). */
export function localizarFuncoesNoStarterPy(
  starter: string,
  alvos: readonly string[],
): FuncaoNoStarterPy[] {
  const adapter = getAdapter(MINIMAL_PYTHON_LANGUAGE);
  const parsed = adapter.parse(starter, { fileName: PY_ENTRY_PATH });
  if (!parsed.ok) return [];
  const querido = new Set(alvos);
  const out: FuncaoNoStarterPy[] = [];
  caminhar(parsed.root, (node) => {
    if (node.type !== 'FunctionDef' && node.type !== 'AsyncFunctionDef') return;
    const nome = node.attributes.name;
    if (nome === undefined || !querido.has(nome)) return;
    const args = node.children.find((c) => c.type === 'arguments');
    const params = (args?.children ?? [])
      .filter((a) => a.type === 'arg' && a.attributes.field === 'args')
      .map((a) => a.attributes.arg ?? '')
      .filter((n) => n !== '');
    out.push({ nome, params, start: node.start });
  });
  out.sort((a, b) => a.start - b.start);
  return out;
}
