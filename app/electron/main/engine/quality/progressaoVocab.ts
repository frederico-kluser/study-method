/**
 * app/electron/main/engine/quality/progressaoVocab.ts — o VOCABULÁRIO da
 * bateria A13–A16: o boilerplate estreito `H13` e a lista fechada `AVISO13`.
 *
 * A prosa normativa vive na fachada `progressao.ts`. Refatoração L04: arquivo
 * ≤500 linhas e toda função com CC≤8, sem mudança de comportamento observável.
 */

import { AtomKey, structuralAlwaysAllowed } from '../atomKeys';

/**
 * H13 — BOILERPLATE ESTREITO (spec §3.1, versão 1, versionada). É a mecânica
 * do runner + valores; a semente receptiva INTEIRA não entra aqui: a semente
 * existe para o ORÇAMENTO (o aluno lê o harness em todo desafio), mas a
 * bateria A13 está medindo DEMONSTRAÇÃO — e `CallExpression`, `ArrowFunction`
 * e forms só deixam de violar quando um bloco de código as mostra (ou quando o
 * span mecânico S13 as isenta no arquivo de teste).
 */
export const H13: readonly AtomKey[] = [
  ...structuralAlwaysAllowed(),
  'node:ExportKeyword',
  'node:ImportDeclaration',
  'node:ImportSpecifier',
  'node:ImportClause',
  'node:NamedImports',
  'api:node:test',
  'api:node:assert',
  'api:node:assert/strict',
  'api:test',
  'api:assert.equal',
  'api:assert.strictEqual',
  'api:assert.deepEqual',
  'api:assert.deepStrictEqual',
  'api:assert.throws',
  'api:assert.rejects',
  'api:assert.doesNotThrow',
  'api:assert.ok',
  'global:assert',
  'global:test',
  'node:PropertyAccessExpression',
  'node:StringLiteral',
  'node:NumericLiteral',
  'node:BooleanLiteral',
] as const;

export const H13_SET: ReadonlySet<AtomKey> = new Set<AtomKey>(H13);

/**
 * AVISO13 (D4 — spec §3.1): valores/termos possivelmente explicados em PROSA
 * pela teoria, sem bloco js. Severidade aviso até calibrar.
 */
export const AVISO13: ReadonlySet<AtomKey> = new Set<AtomKey>([
  'global:undefined',
  'global:NaN',
  'global:Infinity',
  'node:NullKeyword',
  'node:TrueKeyword',
  'node:FalseKeyword',
  'node:RegularExpressionLiteral',
  'node:NoSubstitutionTemplateLiteral',
  'node:TemplateExpression',
  'node:TemplateHead',
  'node:TemplateMiddle',
  'node:TemplateTail',
  'global:String',
  'global:Number',
  'global:Boolean',
  'global:BigInt',
  'global:Symbol',
]);
