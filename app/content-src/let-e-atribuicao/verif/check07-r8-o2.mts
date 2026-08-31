/**
 * VERIFICAÇÃO A05 — check 7 (pós-fix R8/O2): confirma no ESTADO FINAL que
 *   (a) R8: a forma sintática sem inicializador `let saldo;` + `saldo = 8;`
 *       aparece na seção `referencia` do lesson-draft.json E do lesson.json
 *       materializado (o fix a04fix-r8-o2);
 *   (b) O2: o enunciado do desafio (draft e materializado) declara o valor
 *       inicial LIVRE ("com um valor inicial"), sem fixar "0".
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const base = path.resolve(here, '..'); // content-src/let-e-atribuicao

const lessonDraft = JSON.parse(fs.readFileSync(path.join(base, 'lesson-draft.json'), 'utf8'));
const lessonJson = JSON.parse(fs.readFileSync(path.join(base, 'trilha/modules/fundamentos-js/lessons/let-e-atribuicao/lesson.json'), 'utf8'));
const chalDraft = JSON.parse(fs.readFileSync(path.join(base, 'challenge-draft.json'), 'utf8'));
const chalJson = JSON.parse(fs.readFileSync(path.join(base, 'trilha/modules/fundamentos-js/lessons/let-e-atribuicao/challenges/contador-com-let/challenge.json'), 'utf8'));

function refOf(doc: { theory: Array<{ id: string; markdown: string }> }): string {
  const sec = doc.theory.find((t) => t.id === 'referencia');
  return sec ? sec.markdown : '';
}

const checks: Array<[string, boolean]> = [
  ['lesson-draft referencia contém "let saldo;"', refOf(lessonDraft).includes('let saldo;')],
  ['lesson-draft referencia contém "saldo = 8;"', refOf(lessonDraft).includes('saldo = 8;')],
  ['lesson.json referencia contém "let saldo;"', refOf(lessonJson).includes('let saldo;')],
  ['lesson.json referencia contém "saldo = 8;"', refOf(lessonJson).includes('saldo = 8;')],
  ['enchal-draft statement diz "com um valor inicial" (não fixa 0)', chalDraft.statement.includes('com um valor inicial') && !/come[aç]ando com o valor/.test(chalDraft.statement)],
  ['challenge.json statement diz "com um valor inicial" (não fixa 0)', chalJson.statement.includes('com um valor inicial') && !/come[aç]ando com o valor/.test(chalJson.statement)],
  ['challenge-draft notRequired declara valor inicial livre', chalDraft.notRequired.some((n: string) => n.includes('qualquer literal numérico vale'))],
];

console.log('=== CHECK 7 — pós-fix R8 (forma sem inicializador) e O2 (valor livre) ===');
let ok = true;
for (const [label, pass] of checks) {
  console.log(`${pass ? 'OK ' : 'FALHOU'} — ${label}`);
  if (!pass) ok = false;
}
console.log(`VEREDITO FINAL check 7: ${ok ? 'PASSOU (R8 e O2 confirmados no estado final)' : 'NÃO PASSOU'}`);
if (!ok) process.exit(1);
