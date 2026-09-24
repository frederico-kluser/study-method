/**
 * app/electron/main/engine/quality/requirementsJs.ts — a derivação de
 * requirements de JAVASCRIPT: `test('nome', …)` + `assert.*` do `node:test`
 * sobre o AST do TypeScript.
 *
 * A prosa normativa vive na fachada `requirements.ts`. Refatoração L04:
 * arquivo ≤500 linhas e toda função com CC≤8, sem mudança de comportamento.
 */

import * as ts from 'typescript';

import type { AtomKey } from '../atomKeys';
import { extractAllOccurrences } from '../extract';
import { DEFAULT_ADAPTER_ID, type LanguageId } from '../lang/registry';
import {
  ASSERTS_DE_COMPARACAO,
  RequirementsParseError,
  casarBijecao,
  exigirJs,
  type Requirement,
  type RequirementCobertura,
  type RequirementDeclarado,
  type RequirementsDerivados,
  type ValidacaoRequirements,
} from './requirementsTipos';

export function parseSource(code: string, fileName: string): ts.SourceFile {
  const source = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const holder = source as ts.SourceFile & { parseDiagnostics?: ts.Diagnostic[] };
  const diagnostics = holder.parseDiagnostics ?? [];
  if (diagnostics.length > 0) {
    const primeiro = diagnostics[0];
    throw new RequirementsParseError(
      ts.flattenDiagnosticMessageText(primeiro.messageText, ' '),
    );
  }
  return source;
}

export function calleeName(call: ts.CallExpression): string | null {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return null;
}

export function isAssertCall(node: ts.CallExpression): boolean {
  const nome = calleeName(node);
  return nome !== null && (ASSERTS_DE_COMPARACAO.has(nome) || nome === 'ok' || nome === 'throws');
}

/** Declarações `test('nome', fn)` — inclui test.skip/test.only (callee prop). */
export interface TesteNode {
  nome: string;
  fn: ts.Node | null;
}

/** As variantes `test.<módulo>` que também DECLARAM teste. */
function ehVarianteDeTeste(nome: string): boolean {
  return nome === 'skip' || nome === 'only' || nome === 'todo';
}

/** A chamada é `test('nome', fn)` (ou `test.skip/only/todo`)? */
function ehChamadaDeTeste(callee: ts.LeftHandSideExpression): boolean {
  if (ts.isIdentifier(callee)) return callee.text === 'test';
  if (!ts.isPropertyAccessExpression(callee)) return false;
  if (!ts.isIdentifier(callee.expression) || callee.expression.text !== 'test') return false;
  return ehVarianteDeTeste(callee.name.text);
}

/** O nó de teste de UM call `test(...)` — null quando não é declaração. */
function comoTeste(node: ts.CallExpression): TesteNode | null {
  if (!ehChamadaDeTeste(node.expression)) return null;
  if (node.arguments.length < 1 || !ts.isStringLiteral(node.arguments[0])) return null;
  const fn = node.arguments[1] ?? null;
  return { nome: node.arguments[0].text, fn };
}

export function coletarTestes(source: ts.SourceFile): TesteNode[] {
  const testes: TesteNode[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const teste = comoTeste(node);
      if (teste !== null) testes.push(teste);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);
  return testes;
}

// ---------------------------------------------------------------------------
// Descrições determinísticas em pt-BR (sempre com o TEXTO REAL extraído)
// ---------------------------------------------------------------------------

export function textoDosArgumentos(args: ts.NodeArray<ts.Expression>, source: ts.SourceFile): string {
  return args.map((a) => a.getText(source)).join(', ');
}

/** Remove um `await` externo (assert.equal(await f(), x) → a chamada f()). */
export function despelotarAwait(node: ts.Expression): ts.Expression {
  if (ts.isAwaitExpression(node)) return node.expression;
  return node;
}

/** O lado direito CITÁVEL (identificador/literal/booleano) — null fora da lista. */
function esperadoCitado(arg1: ts.Expression | undefined, source: ts.SourceFile): string | null {
  if (!arg1) return null;
  const citavel =
    ts.isNumericLiteral(arg1) ||
    ts.isStringLiteral(arg1) ||
    ts.isIdentifier(arg1) ||
    arg1.kind === ts.SyntaxKind.TrueKeyword ||
    arg1.kind === ts.SyntaxKind.FalseKeyword;
  return citavel ? arg1.getText(source) : null;
}

/** "A função X deve devolver Y quando chamada com Z." (assert de comparação). */
function descreverComparacao(
  nome: string,
  arg0: ts.Expression | undefined,
  arg1: ts.Expression | undefined,
  source: ts.SourceFile,
): string | null {
  if (!(ASSERTS_DE_COMPARACAO.has(nome) && arg0 && ts.isCallExpression(arg0))) return null;
  const fn = calleeName(arg0);
  const fnTexto = fn ?? arg0.expression.getText(source);
  const argsTexto = textoDosArgumentos(arg0.arguments, source);
  const esperado = esperadoCitado(arg1, source);
  if (esperado !== null) {
    return argsTexto.length > 0
      ? `A função ${fnTexto} deve devolver ${esperado} quando chamada com ${argsTexto}.`
      : `A função ${fnTexto} deve devolver ${esperado}.`;
  }
  return argsTexto.length > 0
    ? `A função ${fnTexto} deve devolver o resultado esperado quando chamada com ${argsTexto}.`
    : `A função ${fnTexto} deve devolver o resultado esperado.`;
}

/** O alvo de `assert.throws`: a chamada (direta ou no corpo do arrow) e seus args. */
function alvoDeLancamento(
  arg0: ts.Expression,
  source: ts.SourceFile,
): { fnTexto: string; argsTexto: string } {
  if (ts.isArrowFunction(arg0) && ts.isCallExpression(arg0.body)) {
    return {
      fnTexto: calleeName(arg0.body) ?? arg0.body.expression.getText(source),
      argsTexto: textoDosArgumentos(arg0.body.arguments, source),
    };
  }
  if (ts.isCallExpression(arg0)) {
    return {
      fnTexto: calleeName(arg0) ?? arg0.expression.getText(source),
      argsTexto: textoDosArgumentos(arg0.arguments, source),
    };
  }
  return { fnTexto: '', argsTexto: '' };
}

/** "A função X deve lançar um erro." (`assert.throws`). */
function descreverThrows(
  nome: string,
  arg0: ts.Expression | undefined,
  source: ts.SourceFile,
): string | null {
  if (nome !== 'throws' || arg0 === undefined) return null;
  const { fnTexto, argsTexto } = alvoDeLancamento(arg0, source);
  if (fnTexto) {
    return argsTexto.length > 0
      ? `A função ${fnTexto} deve lançar um erro quando chamada com ${argsTexto}.`
      : `A função ${fnTexto} deve lançar um erro.`;
  }
  return `O teste exige que a chamada lance um erro (${arg0.getText(source).slice(0, 60)}).`;
}

/** "O teste exige que X seja verdadeiro." (`assert.ok`). */
function descreverOk(
  nome: string,
  arg0: ts.Expression | undefined,
  source: ts.SourceFile,
): string | null {
  if (nome !== 'ok' || arg0 === undefined) return null;
  return `O teste exige que ${arg0.getText(source)} seja verdadeiro.`;
}

export function descreverAssert(call: ts.CallExpression, source: ts.SourceFile): string {
  const nome = calleeName(call);
  if (nome === null) return `O teste exige: ${call.getText(source).slice(0, 100)}.`;

  const arg0 = call.arguments[0] ? despelotarAwait(call.arguments[0]) : undefined;
  const arg1 = call.arguments[1];

  const comparacao = descreverComparacao(nome, arg0, arg1, source);
  if (comparacao !== null) return comparacao;
  const lancamento = descreverThrows(nome, arg0, source);
  if (lancamento !== null) return lancamento;
  const verdade = descreverOk(nome, arg0, source);
  if (verdade !== null) return verdade;

  return `O teste exige: ${call.getText(source).slice(0, 100)}.`;
}

// ---------------------------------------------------------------------------
// Cobertura: átomos das funções da solução chamadas pelos asserts
// ---------------------------------------------------------------------------

/** A chamada a função do aluno dentro de um argumento (direta ou em arrow). */
function chamadaDiretaOuDeArrow(arg0: ts.Expression | null): ts.CallExpression | null {
  if (arg0 === null) return null;
  if (ts.isCallExpression(arg0)) return arg0;
  if (ts.isArrowFunction(arg0) && ts.isCallExpression(arg0.body)) return arg0.body;
  return null;
}

/** O nome chamado no 1º argumento de um assert (despelotado). */
function nomeChamadoNoArg0(arg0: ts.Expression | null): string | null {
  const call = chamadaDiretaOuDeArrow(arg0);
  return call !== null ? calleeName(call) : null;
}

/** O nome de função chamado por UM assert (null quando não há). */
function chamadaDoAssert(node: ts.Node): string | null {
  if (!(ts.isCallExpression(node) && isAssertCall(node))) return null;
  const arg0 = node.arguments[0] ? despelotarAwait(node.arguments[0]) : null;
  return nomeChamadoNoArg0(arg0);
}

/** Nomes de função chamados dentro do callback de um teste. */
export function funcoesChamadasNoTeste(fnNode: ts.Node | null): string[] {
  if (!fnNode) return [];
  const nomes = new Set<string>();
  const visit = (node: ts.Node): void => {
    const nome = chamadaDoAssert(node);
    if (nome !== null) nomes.add(nome);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(fnNode, visit);
  return [...nomes];
}

/** O nó de declaração da função-alvo (função nomeada ou variável com função)? */
function spanDeFuncaoAlvo(
  node: ts.Node,
  alvo: ReadonlySet<string>,
  source: ts.SourceFile,
): { start: number; end: number } | null {
  if (ts.isFunctionDeclaration(node) && node.name && alvo.has(node.name.text)) {
    return { start: node.getStart(source), end: node.getEnd() };
  }
  if (
    ts.isVariableStatement(node) &&
    ehVariavelComFuncao(node.declarationList.declarations[0], alvo)
  ) {
    return { start: node.getStart(source), end: node.getEnd() };
  }
  return null;
}

/** A 1ª declaração da variável é `nome = (…)=>…` / `= function …` do alvo? */
function ehVariavelComFuncao(
  decl: ts.VariableDeclaration | undefined,
  alvo: ReadonlySet<string>,
): boolean {
  if (decl === undefined) return false;
  if (!ts.isIdentifier(decl.name) || !alvo.has(decl.name.text)) return false;
  const init = decl.initializer;
  if (!init) return false;
  return ts.isArrowFunction(init) || ts.isFunctionExpression(init);
}

/** Átomos do trecho da solução correspondente às funções chamadas. */
export function atomsDasFuncoesNaSolucao(solutionCode: string, funcoes: string[]): AtomKey[] {
  if (funcoes.length === 0) return [];
  const alvo = new Set(funcoes);

  const extraido = extractAllOccurrences(solutionCode, { fileName: 'solution.mjs' });
  if (!extraido.ok) return [];

  const source = ts.createSourceFile('solution.mjs', solutionCode, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const spans: Array<{ start: number; end: number }> = [];
  const visit = (node: ts.Node): void => {
    const span = spanDeFuncaoAlvo(node, alvo, source);
    if (span !== null) spans.push(span);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);

  if (spans.length === 0) return [];
  const chaves = new Set<AtomKey>();
  for (const occ of extraido.occurrences) {
    if (spans.some((s) => occ.start >= s.start && occ.end <= s.end)) chaves.add(occ.key);
  }
  return [...chaves].sort();
}

/** Átomos do trecho do assert (fallback quando a solução não cobre). */
export function atomsDoTrechoDoAssert(trecho: string): AtomKey[] {
  const extraido = extractAllOccurrences(trecho, { fileName: 'assert.mjs' });
  return extraido.ok ? extraido.keys : [];
}

// ---------------------------------------------------------------------------
// Derivação e validação (determinísticas)
// ---------------------------------------------------------------------------

/** Os asserts de UM teste: descrições e trechos, na ordem de aparição. */
function assertsDoTeste(fnDoTeste: ts.Node | null, source: ts.SourceFile): {
  descricoes: string[];
  trechos: string[];
} {
  const descricoes: string[] = [];
  const trechos: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isAssertCall(node)) {
      descricoes.push(descreverAssert(node, source));
      trechos.push(node.getText(source));
    }
    ts.forEachChild(node, visit);
  };
  if (fnDoTeste) ts.forEachChild(fnDoTeste, visit);
  return { descricoes, trechos };
}

/**
 * JAVASCRIPT: deriva requirements do arquivo de teste — um por
 * `test('nome', …)`, com descrição em pt-BR derivada dos asserts REAIS e
 * cobertura com os átomos das funções da solução chamadas. Lança
 * `RequirementsParseError` se o teste não parseia (fail-closed — nunca um
 * conjunto vazio silencioso).
 */
export function derivarRequirementsJs(
  testsCode: string,
  solutionCode: string,
  _starterCode: string,
  language: LanguageId = DEFAULT_ADAPTER_ID,
): RequirementsDerivados {
  exigirJs('derivarRequirements', language);
  const source = parseSource(testsCode, 'tests.mjs');
  const testes = coletarTestes(source);

  const requirements: Requirement[] = [];
  const cobertura: RequirementCobertura[] = [];

  testes.forEach((t, index) => {
    const id = `REQ-${index + 1}`;
    const { descricoes, trechos } = assertsDoTeste(t.fn, source);

    const descricao = descricoes.length > 0 ? descricoes.join(' E ') : `O teste '${t.nome}' não contém asserts.`;
    requirements.push({ id, descricao, teste: t.nome });

    const funcoes = funcoesChamadasNoTeste(t.fn);
    let atoms = atomsDasFuncoesNaSolucao(solutionCode, funcoes);
    if (atoms.length === 0) {
      atoms = atomsDoTrechoDoAssert(trechos.join('\n'));
    }
    cobertura.push({ requirementId: id, atoms });
  });

  return { requirements, cobertura };
}

/**
 * JAVASCRIPT: valida a BIJEÇÃO requirements declarados × `test('…')`. Todo
 * requirement declarado precisa de um teste correspondente (por nome
 * normalizado) e todo teste precisa de um requirement declarado. Determinístico,
 * zero LLM. Lança `RequirementsParseError` se o teste não parseia.
 */
export function validarRequirementsJs(
  testsCode: string,
  requirementsDeclarados: RequirementDeclarado[],
  language: LanguageId = DEFAULT_ADAPTER_ID,
): ValidacaoRequirements {
  exigirJs('validarRequirements', language);
  const source = parseSource(testsCode, 'tests.mjs');
  const nomesDeTestes = coletarTestes(source).map((t) => t.nome);
  return casarBijecao(nomesDeTestes, requirementsDeclarados);
}
