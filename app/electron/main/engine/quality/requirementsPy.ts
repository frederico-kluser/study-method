/**
 * app/electron/main/engine/quality/requirementsPy.ts — a derivação de
 * requirements de PYTHON: `def test_…(self)` + `self.assert*` do `unittest`
 * sobre o AST do adaptador Python.
 *
 * A prosa normativa vive na fachada `requirements.ts`. Refatoração L04:
 * arquivo ≤500 linhas e toda função com CC≤8, sem mudança de comportamento.
 */

import type { AtomKey } from '../atomKeys';
import { extractAllOccurrences, extractAtoms } from '../extract';
import { PY_ENTRY_PATH } from '../lang/python';
import { getAdapter, type LangNode } from '../lang/registry';
import {
  ASSERTS_DE_COMPARACAO_PY,
  ASSERTS_PY,
  MINIMAL_PYTHON_LANGUAGE,
  MODULO_DA_SOLUCAO,
  decodificarReprDeStringPython,
} from './minimalPython';
import {
  RequirementsParseError,
  casarBijecao,
  type Requirement,
  type RequirementCobertura,
  type RequirementDeclarado,
  type RequirementsDerivados,
  type ValidacaoRequirements,
} from './requirementsTipos';

/**
 * O nome de um `Call` na árvore do adaptador Python:
 * `rodar()` → `rodar`; `self.assertEqual(…)` → `assertEqual`.
 *
 * MESMA regra do irmão `calleeName` do lado JavaScript. Duplicada aqui e não
 * importada de `minimalPython.ts` porque lá ela é privada; o que NÃO se
 * duplica são as TABELAS de asserts (elas vêm de lá por import).
 */
export function nomeDoCalleePy(call: LangNode): string | null {
  const func = call.children.find((c) => c.attributes.field === 'func');
  if (func === undefined) return null;
  if (func.type === 'Name') return func.attributes.id ?? null;
  if (func.type === 'Attribute') return func.attributes.attr ?? null;
  return null;
}

/** Os argumentos POSICIONAIS de um `Call`, na ordem. */
export function argumentosPosicionaisPy(call: LangNode): LangNode[] {
  return call.children.filter((c) => c.attributes.field === 'args');
}

/** Caminha a árvore normalizada aplicando `fn` a cada nó (pré-ordem). */
export function caminharPy(node: LangNode, fn: (n: LangNode) => void): void {
  fn(node);
  for (const filho of node.children) caminharPy(filho, fn);
}

/** Parseia Python pelo ADAPTADOR; parse falhou é exceção (fail-closed). */
export function parseSourcePython(code: string, fileName: string): LangNode {
  const parsed = getAdapter(MINIMAL_PYTHON_LANGUAGE).parse(code, { fileName });
  if (!parsed.ok) {
    throw new RequirementsParseError(
      `${parsed.error.code} em ${parsed.error.line}:${parsed.error.column}: ${parsed.error.message}`,
    );
  }
  return parsed.root;
}

/**
 * Um método de teste do `unittest`: `def test_…(self)`.
 *
 * O IDENTIFICADOR do teste é o NOME DO MÉTODO, não a docstring — é o que o
 * `unittest` imprime, o que um `challenge.json` pode citar sem ambiguidade e o
 * que não muda quando a prosa é reescrita. A docstring é prosa opcional e por
 * isso não entra na bijeção.
 */
export interface TesteNodePy {
  nome: string;
  corpo: LangNode;
  start: number;
}

/** Métodos/funções cujo nome começa em `test` — a convenção do `unittest`. */
export function coletarTestesPython(root: LangNode): TesteNodePy[] {
  const out: TesteNodePy[] = [];
  caminharPy(root, (n) => {
    if (n.type !== 'FunctionDef' && n.type !== 'AsyncFunctionDef') return;
    const nome = n.attributes.name;
    if (nome === undefined || !nome.startsWith('test')) return;
    out.push({ nome, corpo: n, start: n.start });
  });
  out.sort((a, b) => a.start - b.start);
  return out;
}

/**
 * FORMA `stdout`: o teste roda o arquivo do aluno inteiro
 * (`runpy.run_path("solucao.py")`) e compara o que ele imprimiu.
 *
 * A marca é a MESMA que `quality/minimalPython.ts:300-309` usa — e usa a mesma
 * decodificação de `repr()`, importada de lá, para não existir uma segunda
 * gramática de literal de string do Python neste repositório.
 */
export function ehFormaStdoutPy(root: LangNode): boolean {
  let achou = false;
  caminharPy(root, (n) => {
    if (achou || n.type !== 'Call') return;
    if (nomeDoCalleePy(n) !== 'run_path') return;
    const primeiro = argumentosPosicionaisPy(n)[0];
    if (primeiro === undefined || primeiro.type !== 'StrLiteral') return;
    if (decodificarReprDeStringPython(primeiro.attributes.value ?? '') === PY_ENTRY_PATH) achou = true;
  });
  return achou;
}

/** As funções que o teste importa de `solucao` (forma `import`). */
export function funcoesImportadasDaSolucaoPy(root: LangNode): Set<string> {
  const out = new Set<string>();
  caminharPy(root, (n) => {
    if (n.type !== 'ImportFrom' || n.attributes.module !== MODULO_DA_SOLUCAO) return;
    for (const alias of n.children) {
      if (alias.type === 'alias' && alias.attributes.name !== undefined) {
        out.add(alias.attributes.asname ?? alias.attributes.name);
      }
    }
  });
  return out;
}

/** Os asserts do `unittest` dentro de um nó, em ordem de fonte. */
export function assertsDentroDePy(node: LangNode): LangNode[] {
  const out: LangNode[] = [];
  caminharPy(node, (n) => {
    if (n.type !== 'Call') return;
    const nome = nomeDoCalleePy(n);
    if (nome !== null && ASSERTS_PY.has(nome)) out.push(n);
  });
  out.sort((a, b) => a.start - b.start);
  return out;
}

/**
 * Na forma `stdout` a frase é sobre o PROGRAMA, não sobre a função: o alvo do
 * assert é `rodar()`, um helper do próprio arquivo de teste, e dizer "a função
 * rodar deve devolver …" descreveria o harness em vez do que o desafio cobra.
 */
function descreverComparacaoPy(
  nome: string,
  alvo: LangNode | undefined,
  esperado: LangNode | undefined,
  call: LangNode,
  formaStdout: boolean,
): string | null {
  if (!(ASSERTS_DE_COMPARACAO_PY.has(nome) && alvo !== undefined)) return null;
  if (formaStdout) {
    return esperado !== undefined
      ? `O programa deve imprimir exatamente ${esperado.text}.`
      : `O programa deve imprimir exatamente o que ${call.text.slice(0, 60)} compara.`;
  }
  return descreverChamadaOuIgualdadePy(alvo, esperado, call);
}

/** "A função X deve devolver Y…" (chamada) ou a igualdade literal. */
function descreverChamadaOuIgualdadePy(
  alvo: LangNode,
  esperado: LangNode | undefined,
  call: LangNode,
): string {
  if (alvo.type === 'Call') {
    const fnTexto = nomeDoCalleePy(alvo) ?? alvo.text;
    const argsTexto = argumentosPosicionaisPy(alvo)
      .map((a) => a.text)
      .join(', ');
    const esperadoTexto = esperado !== undefined ? esperado.text : 'o resultado esperado';
    return argsTexto.length > 0
      ? `A função ${fnTexto} deve devolver ${esperadoTexto} quando chamada com ${argsTexto}.`
      : `A função ${fnTexto} deve devolver ${esperadoTexto}.`;
  }
  return esperado !== undefined
    ? `O teste exige que ${alvo.text} seja igual a ${esperado.text}.`
    : `O teste exige: ${call.text.slice(0, 100)}.`;
}

/** Os asserts unários (`assertTrue`/`assertFalse`/`assertIsNone`/`assertRaises`). */
function descreverUnariosPy(nome: string, alvo: LangNode | undefined): string | null {
  if (alvo === undefined) return null;
  if (nome === 'assertTrue') return `O teste exige que ${alvo.text} seja verdadeiro.`;
  if (nome === 'assertFalse') return `O teste exige que ${alvo.text} seja falso.`;
  if (nome === 'assertIsNone') return `O teste exige que ${alvo.text} seja None.`;
  if (nome === 'assertRaises') return `O teste exige que a chamada lance ${alvo.text}.`;
  return null;
}

/**
 * Descrição em pt-BR de UM assert do `unittest`, derivada do TEXTO REAL.
 */
export function descreverAssertPy(call: LangNode, formaStdout: boolean): string {
  const nome = nomeDoCalleePy(call);
  if (nome === null) return `O teste exige: ${call.text.slice(0, 100)}.`;

  const args = argumentosPosicionaisPy(call);
  const alvo = args[0];
  const esperado = ASSERTS_DE_COMPARACAO_PY.has(nome) ? args[1] : undefined;

  const comparacao = descreverComparacaoPy(nome, alvo, esperado, call, formaStdout);
  if (comparacao !== null) return comparacao;
  const unario = descreverUnariosPy(nome, alvo);
  if (unario !== null) return unario;

  return `O teste exige: ${call.text.slice(0, 100)}.`;
}

/** Nomes de função chamados no PRIMEIRO argumento dos asserts do método. */
export function funcoesChamadasNoTestePy(corpo: LangNode): string[] {
  const nomes = new Set<string>();
  for (const a of assertsDentroDePy(corpo)) {
    const alvo = argumentosPosicionaisPy(a)[0];
    if (alvo !== undefined && alvo.type === 'Call') {
      const n = nomeDoCalleePy(alvo);
      if (n !== null) nomes.add(n);
    }
  }
  return [...nomes];
}

/** Átomos do trecho da solução de Python que declara as funções chamadas. */
export function atomsDasFuncoesNaSolucaoPy(solutionCode: string, funcoes: string[]): AtomKey[] {
  if (funcoes.length === 0) return [];
  const alvo = new Set(funcoes);

  const extraido = extractAllOccurrences(solutionCode, {
    fileName: PY_ENTRY_PATH,
    language: MINIMAL_PYTHON_LANGUAGE,
  });
  if (!extraido.ok) return [];

  const parsed = getAdapter(MINIMAL_PYTHON_LANGUAGE).parse(solutionCode, { fileName: PY_ENTRY_PATH });
  if (!parsed.ok) return [];

  const spans: Array<{ start: number; end: number }> = [];
  caminharPy(parsed.root, (n) => {
    if (n.type !== 'FunctionDef' && n.type !== 'AsyncFunctionDef') return;
    if (n.attributes.name !== undefined && alvo.has(n.attributes.name)) {
      spans.push({ start: n.start, end: n.end });
    }
  });
  if (spans.length === 0) return [];

  const chaves = new Set<AtomKey>();
  for (const occ of extraido.occurrences) {
    if (spans.some((s) => occ.start >= s.start && occ.end <= s.end)) chaves.add(occ.key);
  }
  return [...chaves].sort();
}

/** Átomos do trecho do assert (fallback declarado, igual ao lado JavaScript). */
export function atomsDoTrechoDoAssertPy(trecho: string): AtomKey[] {
  if (trecho.trim() === '') return [];
  const extraido = extractAtoms(trecho, {
    fileName: 'assert.py',
    language: MINIMAL_PYTHON_LANGUAGE,
  });
  return extraido.ok ? extraido.keys : [];
}

/**
 * PYTHON: deriva requirements do arquivo de teste — um por `def test_…`, com
 * descrição em pt-BR derivada dos asserts REAIS. Lança `RequirementsParseError`
 * se o teste não parseia como Python (fail-closed).
 *
 * `cobertura[].atoms` na forma `stdout` é VAZIA por decisão declarada (ver o
 * cabeçalho da fachada): o alvo do assert é o helper do próprio teste, e emitir
 * os átomos dele seria emitir o harness como se fosse cobrança.
 */
export function derivarRequirementsPython(
  testsCode: string,
  solutionCode: string,
  _starterCode: string,
): RequirementsDerivados {
  const root = parseSourcePython(testsCode, 'tests/test_solucao.py');
  const formaStdout = ehFormaStdoutPy(root);
  const importadas = funcoesImportadasDaSolucaoPy(root);
  const testes = coletarTestesPython(root);

  const requirements: Requirement[] = [];
  const cobertura: RequirementCobertura[] = [];

  testes.forEach((t, index) => {
    const id = `REQ-${index + 1}`;
    const asserts = assertsDentroDePy(t.corpo);
    const descricoes = asserts.map((a) => descreverAssertPy(a, formaStdout));
    const descricao =
      descricoes.length > 0 ? descricoes.join(' E ') : `O teste '${t.nome}' não contém asserts.`;
    requirements.push({ id, descricao, teste: t.nome });

    let atoms: AtomKey[] = [];
    if (!formaStdout) {
      // Só as funções que vêm DA SOLUÇÃO — um helper local do teste não é o que
      // o aluno precisa escrever.
      const funcoes = funcoesChamadasNoTestePy(t.corpo).filter((f) => importadas.has(f));
      atoms = atomsDasFuncoesNaSolucaoPy(solutionCode, funcoes);
      if (atoms.length === 0) {
        atoms = atomsDoTrechoDoAssertPy(asserts.map((a) => a.text).join('\n'));
      }
    }
    cobertura.push({ requirementId: id, atoms });
  });

  return { requirements, cobertura };
}

/** PYTHON: a bijeção requirements declarados × `def test_…` (nome do método). */
export function validarRequirementsPython(
  testsCode: string,
  requirementsDeclarados: RequirementDeclarado[],
): ValidacaoRequirements {
  const root = parseSourcePython(testsCode, 'tests/test_solucao.py');
  return casarBijecao(
    coletarTestesPython(root).map((t) => t.nome),
    requirementsDeclarados,
  );
}
