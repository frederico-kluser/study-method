/**
 * app/electron/main/engine/quality/minimalBase.ts — a base comum do sintetizador
 * mínimo de JavaScript: a guarda JS-only, o parse fail-closed, as tabelas de
 * asserts e os utilitários de texto.
 *
 * A prosa normativa vive na fachada `minimal.ts`. Refatoração L04: arquivo
 * ≤500 linhas e toda função com CC≤8, sem mudança de comportamento observável.
 */

import * as ts from 'typescript';

import { exigirAdaptadorJavascript } from '../extract';
import { DEFAULT_ADAPTER_ID, type LanguageId } from '../lang/registry';

/** O motivo, escrito uma vez, que as quatro guardas deste módulo citam. */
export const MOTIVO_JS_ONLY =
  'este módulo GERA texto de JavaScript literal (export function/return) e lê o teste com ts.createSourceFile; ' +
  'a síntese mínima de outra linguagem é outro arquivo, não este com um parâmetro a mais';

export function exigirJs(fn: string, language: LanguageId = DEFAULT_ADAPTER_ID): void {
  exigirAdaptadorJavascript(`engine/quality/minimal.ts (${fn})`, MOTIVO_JS_ONLY, language);
}

export const ASSERTS_DE_COMPARACAO: ReadonlySet<string> = new Set([
  'equal',
  'strictEqual',
  'deepEqual',
  'deepStrictEqual',
]);

export const ASSERTS_TODOS: ReadonlySet<string> = new Set([
  'equal',
  'strictEqual',
  'deepEqual',
  'deepStrictEqual',
  'ok',
  'throws',
]);

/** Parse fail-closed: diagnóstico de parse ⇒ `null` (nunca AST torto). */
export function parseSource(code: string, fileName: string): ts.SourceFile | null {
  const source = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const holder = source as ts.SourceFile & { parseDiagnostics?: ts.Diagnostic[] };
  const diagnostics = holder.parseDiagnostics ?? [];
  if (diagnostics.length > 0) {
    return null;
  }
  return source;
}

/** Conta linhas de um trecho de código (split por '\n'). */
export function contarLinhas(codigo: string): number {
  if (codigo === '') return 0;
  return codigo.split('\n').length;
}

/** A mensagem de um erro desconhecido, sem vazar stack. */
export function mensagemDe(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}
