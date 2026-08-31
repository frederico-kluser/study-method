/**
 * VERIFICAÇÃO A05 — check 4: as 4 provas de execução (§5.4) via
 * criarProverDeDesafio (f9Verifier) sobre o challenge.json MATERIALIZADO.
 * P1 solução passa · P2 starter falha · P3 contagem == expectedTestCount ·
 * P4 stub vazio falha.
 * Esperado: verdict.valid = true, declared = 1, executed = 1.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { criarProverDeDesafio } from '../../../electron/main/engine/phases/f9Verifier';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..'); // app/
const challengeFile = path.join(
  root,
  'content-src',
  'let-e-atribuicao',
  'trilha',
  'modules',
  'fundamentos-js',
  'lessons',
  'let-e-atribuicao',
  'challenges',
  'contador-com-let',
  'challenge.json',
);

function clean(obj: unknown): unknown {
  // remove indentação do JSON lido (os arquivos têm 2 espaços)
  return obj;
}

async function main(): Promise<void> {
  console.log('=== CHECK 4 — 4 provas de execução (criarProverDeDesafio) ===');
  const raw: any = JSON.parse(fs.readFileSync(challengeFile, 'utf8'));
  const asIs = clean(raw);
  console.log(`challenge.json: slug=${asIs.slug} expectedTestCount=${asIs.expectedTestCount}`);
  console.log(`solutionCode present: ${typeof asIs.solutionCode === 'string'}`);
  console.log(`starterCode present: ${typeof asIs.starterCode === 'string'}`);
  console.log(`testsCode present: ${typeof asIs.testsCode === 'string'}`);
  console.log(`files[]: ${Array.isArray(asIs.files) ? asIs.files.length : '(ausente — arquivo único)'}`);

  const prover = criarProverDeDesafio();
  const verdict = await prover({
    solutionCode: asIs.solutionCode,
    starterCode: asIs.starterCode,
    testsCode: asIs.testsCode,
    expectedTestCount: asIs.expectedTestCount,
    emptyStubCode: '',
  });

  console.log('');
  console.log(`valid     = ${verdict.valid}`);
  console.log(`declared  = ${verdict.declared}`);
  console.log(`executed  = ${verdict.executed}`);
  if (verdict.execError) console.log(`execError = ${String(verdict.execError)}`);
  if (verdict.failures && verdict.failures.length > 0) {
    console.log('FAILURES:');
    for (const f of verdict.failures) console.log(`  ${JSON.stringify(f)}`);
  } else {
    console.log('failures  = nenhuma');
  }

  const ok = verdict.valid === true && verdict.declared === 1 && verdict.executed === 1;
  console.log(`VEREDITO FINAL check 4: ${ok ? 'PASSOU (valid=true, declared=1, executed=1)' : 'NÃO PASSOU'}`);
  if (!ok) process.exit(1);
}

main().catch((err) => {
  console.error('FALHA:', err);
  process.exit(1);
});
