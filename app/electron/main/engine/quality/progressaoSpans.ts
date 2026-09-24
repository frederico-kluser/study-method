/**
 * app/electron/main/engine/quality/progressaoSpans.ts — os spans MECÂNICOS
 * `S13` do arquivo de teste (spec §3.1): o que isenta de ser conteúdo autoral.
 *
 * A prosa normativa vive na fachada `progressao.ts`. Refatoração L04: arquivo
 * ≤500 linhas e toda função com CC≤8, sem mudança de comportamento observável.
 */

import * as ts from 'typescript';

/**
 * Span mecânico (spec §3.1): um intervalo `[início, fim)` de offsets ABSOLUTOS
 * que isenta as ocorrências que caem dentro dele.
 */
export interface SpanMecanico {
  inicio: number;
  fim: number;
}

export function estaDentro(span: SpanMecanico, start: number): boolean {
  return start >= span.inicio && start < span.fim;
}

/** `test('t', () =>` — do callee até o começo do CORPO do callback. */
function spanDaAssinaturaDeTeste(node: ts.CallExpression, source: ts.SourceFile): SpanMecanico | null {
  const callee = node.expression;
  const args = node.arguments;
  if (!(ts.isIdentifier(callee) && callee.text === 'test' && args.length >= 2)) return null;
  const callback = args[1];
  if (!(ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) return null;
  return { inicio: node.getStart(source), fim: callback.body.getStart(source) };
}

/** O método do assert é um dos que recebe um callback de lançamento? */
function ehMetodoDeLancamento(metodo: string): boolean {
  return metodo === 'throws' || metodo === 'rejects' || metodo === 'doesNotThrow';
}

/** O argumento é uma função-callback (arrow ou `function`)? */
function ehFuncaoCallback(no: ts.Node): no is ts.ArrowFunction | ts.FunctionExpression {
  return ts.isArrowFunction(no) || ts.isFunctionExpression(no);
}

/**
 * `assert.<m>(` — do callee até o INÍCIO do 1º argumento (o 1º argumento é
 * conteúdo autoral — `cumprimentar('Maria')` conta); em
 * `assert.throws/rejects/doesNotThrow(…)` adicionalmente a assinatura `() =>`
 * do callback (o corpo é autoral).
 */
function spanDeAssert(node: ts.CallExpression, source: ts.SourceFile): SpanMecanico | null {
  const callee = node.expression;
  if (
    !(
      ts.isPropertyAccessExpression(callee) &&
      ts.isIdentifier(callee.expression) &&
      callee.expression.text === 'assert'
    )
  ) {
    return null;
  }
  const primeiro = node.arguments[0];
  if (primeiro === undefined) return null;
  const ehCallbackDeLancamento = ehMetodoDeLancamento(callee.name.text) && ehFuncaoCallback(primeiro);
  if (ehCallbackDeLancamento) {
    // regra 4: `assert.throws(() =>` inteiro — o 1º argumento é o callback.
    return { inicio: node.getStart(source), fim: primeiro.body.getStart(source) };
  }
  // regra 3: `assert.<m>(` — o 1º argumento é autoral.
  return { inicio: node.getStart(source), fim: primeiro.getStart(source) };
}

/** O span mecânico de UM nó (import inteiro ou chamada de teste/assert). */
function spanMecanicoDe(node: ts.Node, source: ts.SourceFile): SpanMecanico | null {
  if (ts.isImportDeclaration(node)) {
    return { inicio: node.getStart(source), fim: node.getEnd() };
  }
  if (!ts.isCallExpression(node)) return null;
  const spanTeste = spanDaAssinaturaDeTeste(node, source);
  if (spanTeste !== null) return spanTeste;
  return spanDeAssert(node, source);
}

/**
 * Os spans mecânicos de um arquivo de teste (S13, spec §3.1):
 *  1. nó `ImportDeclaration` inteiro;
 *  2. chamada `test('título', …)`: do callee até o começo do CORPO do callback
 *     (a assinatura `test('x', () =>` é mecânica; o corpo é autoral);
 *  3. chamadas `assert.<método>(…)`: do callee até o INÍCIO do 1º argumento
 *     (o 1º argumento é conteúdo autoral — `cumprimentar('Maria')` conta);
 *  4. em `assert.throws/rejects/doesNotThrow(…)`: adicionalmente a assinatura
 *     `() =>` do callback (o corpo é autoral).
 */
export function spansMecanicosDeTeste(codigo: string): SpanMecanico[] {
  const source = ts.createSourceFile('tests.mjs', codigo, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const spans: SpanMecanico[] = [];

  const visit = (node: ts.Node): void => {
    const span = spanMecanicoDe(node, source);
    if (span !== null) spans.push(span);
    ts.forEachChild(node, visit);
  };

  ts.forEachChild(source, visit);
  return spans;
}
