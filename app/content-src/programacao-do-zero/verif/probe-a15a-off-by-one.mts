/**
 * MICRO-PROBE: A15a com 2 desafios em que o 2º reusa claramente o 1º.
 * Descobre se a bateria A15a tem off-by-one no k=1 (anteriorAcumulado vazio).
 */
import { auditarProgressao, type ProgressaoLessonInput, type ProgressaoDesafioInput } from '../../../electron/main/engine/quality/progressao';

const files = (starter: string, solution: string) => [{ path: 'solution.mjs', starter, solution }];
const desafio = (slug: string, starter: string, solution: string, tests: string): ProgressaoDesafioInput => ({
  slug,
  desafioFile: `probe/${slug}/challenge.json`,
  files: files(starter, solution),
  tests,
});
const TESTS = (fn: string, arg: string, esp: string) =>
  `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { ${fn} } from './solution.mjs';\ntest('t', () => {\n  assert.equal(${fn}(${arg}), ${esp});\n});\n`;

const aula: ProgressaoLessonInput = {
  ref: 'probe/a1',
  baseDir: 'probe',
  theory: [
    { id: 's1', title: 's1', markdown: 'Intro.\n\n```js\nexport function f(x) {\n  return x;\n}\n```\n\neco:\n\n```js\nf(7);\n```' },
  ],
  challenges: [
    desafio('c1', 'export function f(x) {\n  // lacuna\n}\n', 'export function f(x) {\n  return x;\n}\n', TESTS('f', '7', '7')),
    desafio('c2', 'export function f(x) {\n  return x;\n}\n', 'export function f(x) {\n  return x;\n}\n', TESTS('f', '5', '5')),
  ],
};

const res = auditarProgressao([aula]);
const a15a = res.violations.filter((v) => v.regra === 'A15a');
console.log('A15a violations:', a15a.length);
for (const v of a15a) console.log(' -', v.regra, v.trechoOfensor, '|', v.mensagem.slice(0, 90));
console.log('todas as violações:', res.violations.map((v) => `${v.regra}`).join(', ') || '(nenhuma)');