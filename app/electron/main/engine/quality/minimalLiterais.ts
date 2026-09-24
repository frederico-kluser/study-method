/**
 * app/electron/main/engine/quality/minimalLiterais.ts — a extração de LITERAIS
 * dos asserts do teste (AST TypeScript), determinística e fail-closed.
 *
 * A prosa normativa vive na fachada `minimal.ts`. Refatoração L04: arquivo
 * ≤500 linhas e toda função com CC≤8, sem mudança de comportamento observável.
 */

import * as ts from 'typescript';

import { exigirJs, parseSource, ASSERTS_DE_COMPARACAO, ASSERTS_TODOS } from './minimalBase';
import {
  type ExtrairLiteraisResult,
  type LiteralExtraido,
  type LiteraisDoTeste,
} from './minimalTipos';
import { DEFAULT_ADAPTER_ID, type LanguageId } from '../lang/registry';

/** É literal? Números, strings, booleanos, null e arrays/objetos de literais. */
export function isLiteral(node: ts.Node): boolean {
  if (ts.isNumericLiteral(node) || ts.isStringLiteral(node)) return true;
  if (
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    node.kind === ts.SyntaxKind.NullKeyword
  ) {
    return true;
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.every((el) => !ts.isSpreadElement(el) && isLiteral(el));
  }
  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.every(
      (p) =>
        ts.isPropertyAssignment(p) &&
        (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) || ts.isNumericLiteral(p.name)) &&
        isLiteral(p.initializer),
    );
  }
  return false;
}

/** Nome do callee de uma chamada (`assert.equal` → `equal`; `resposta()` → `resposta`). */
export function calleeName(call: ts.CallExpression): string | null {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return null;
}

/** Nome da função chamada dentro do primeiro argumento de um assert. */
export function funcaoChamadaNoArg(assertCall: ts.CallExpression): string | null {
  const arg = assertCall.arguments[0];
  if (!arg) return null;
  const despelotado = ts.isAwaitExpression(arg) ? arg.expression : arg;
  if (ts.isCallExpression(despelotado)) return calleeName(despelotado);
  if (ts.isArrowFunction(despelotado) && ts.isCallExpression(despelotado.body)) return calleeName(despelotado.body);
  return null;
}

/** `import { … } from './solution*'` — os nomes do import da solução. */
function nomesDoImport(clause: ts.ImportClause): string[] {
  const nomes: string[] = [];
  if (clause.name) nomes.push(clause.name.text);
  const bindings = clause.namedBindings;
  if (bindings === undefined) return nomes;
  if (ts.isNamespaceImport(bindings)) {
    nomes.push(bindings.name.text);
    return nomes;
  }
  for (const el of bindings.elements) {
    nomes.push(el.name.text);
    if (el.propertyName) nomes.push(el.propertyName.text);
  }
  return nomes;
}

/**
 * Funções-alvo: imports nomeados do módulo da solução (especifier relativo
 * cujo basename começa com 'solution'). Sem import relativo → fallback: todo
 * callee identificador visto dentro de asserts de comparação (o fallback é
 * aplicado pelo chamador, na hora de fechar o resultado).
 */
function coletarImportDeSolucao(node: ts.ImportDeclaration, funcoesAlvo: Set<string>): void {
  const spec = node.moduleSpecifier;
  if (!(ts.isStringLiteral(spec) && spec.text.startsWith('.') && /\/?solution[^/]*$/.test(spec.text))) {
    return;
  }
  const clause = node.importClause;
  if (clause === undefined) return;
  for (const nome of nomesDoImport(clause)) funcoesAlvo.add(nome);
}

/** O primeiro argumento do assert despelotado: função chamada + argumentos literais. */
function chamadaDoArg1(
  arg1: ts.Expression | undefined,
  source: ts.SourceFile,
): { funcao: string | null; argumentos: Array<string | null> } {
  let funcao: string | null = null;
  const argumentos: Array<string | null> = [];
  if (arg1) {
    const despelotado = ts.isAwaitExpression(arg1) ? arg1.expression : arg1;
    if (ts.isCallExpression(despelotado)) {
      funcao = calleeName(despelotado);
      for (const a of despelotado.arguments) {
        argumentos.push(isLiteral(a) ? a.getText(source) : null);
      }
    }
  }
  return { funcao, argumentos };
}

/** O lado direito do assert, serializado — só em assert de comparação literal. */
function esperadoDoAssert(node: ts.CallExpression, nome: string, source: ts.SourceFile): string | null {
  const arg2 = node.arguments[1];
  if (arg2 && ASSERTS_DE_COMPARACAO.has(nome)) {
    return isLiteral(arg2) ? arg2.getText(source) : null;
  }
  return null;
}

/** Monta o `LiteralExtraido` de UM assert da tabela — null quando nada a dizer. */
function montarLiteralExtraido(
  node: ts.CallExpression,
  nome: string,
  source: ts.SourceFile,
): LiteralExtraido | null {
  const chamada = chamadaDoArg1(node.arguments[0], source);
  const esperado = esperadoDoAssert(node, nome, source);
  if (chamada.funcao || esperado !== null || nome === 'throws' || nome === 'ok') {
    return {
      assert: nome,
      funcao: chamada.funcao,
      esperado,
      argumentos: chamada.argumentos,
      trecho: node.getText(source).slice(0, 120),
    };
  }
  return null;
}

/** Coleta UM assert da tabela (e o callee, para o fallback de funções-alvo). */
function coletarAssert(
  node: ts.CallExpression,
  source: ts.SourceFile,
  calleesDeAssert: Set<string>,
  literais: LiteralExtraido[],
): void {
  const nome = calleeName(node);
  if (nome === null || !ASSERTS_TODOS.has(nome)) return;
  const fn = funcaoChamadaNoArg(node);
  if (fn) calleesDeAssert.add(fn);
  const extraido = montarLiteralExtraido(node, nome, source);
  if (extraido !== null) literais.push(extraido);
}

/**
 * Extrai os literais dos asserts de um arquivo de teste. Deterministtico:
 * mesma entrada, mesma saída. Parse falhou → `{ ok: false, error }`.
 */
export function extrairLiteraisDoTeste(
  testsCode: string,
  language: LanguageId = DEFAULT_ADAPTER_ID,
): ExtrairLiteraisResult {
  exigirJs('extrairLiteraisDoTeste', language);
  const source = parseSource(testsCode, 'tests.mjs');
  if (!source) {
    return { ok: false, error: 'testsCode não parseia como JavaScript' };
  }

  const funcoesAlvo = new Set<string>();
  const calleesDeAssert = new Set<string>();
  const literais: LiteralExtraido[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) coletarImportDeSolucao(node, funcoesAlvo);
    if (ts.isCallExpression(node)) coletarAssert(node, source, calleesDeAssert, literais);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);

  const alvo = funcoesAlvo.size > 0 ? [...funcoesAlvo].sort() : [...calleesDeAssert].sort();
  return { ok: true, dados: { funcoesAlvo: alvo, literais } };
}
