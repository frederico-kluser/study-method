/**
 * VALIDAÇÃO 4 — as 4 provas de execução (criarProverDeDesafio, f9Verifier)
 * para OS 2 DESAFIOS: P1 solução passa · P2 starter falha · P3 contagem ==
 * expectedTestCount · P4 stub vazio falha.
 * Esperado (por desafio): verdict.valid = true, declared = 1, executed = 1.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { criarProverDeDesafio } from '../../../electron/main/engine/phases/f9Verifier';

const here = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(here, '..'); // content-src/programacao-do-zero
const draftsDir = path.join(raiz, 'drafts');
const aulas = ['como-o-site-confere-seu-codigo', 'valor-e-instrucao'];

async function main(): Promise<void> {
  console.log('=== CHECK 4 — 4 provas de execução por desafio (criarProverDeDesafio) ===');
  const prover = criarProverDeDesafio();
  let okTudo = true;
  for (const aula of aulas) {
    const ch = JSON.parse(fs.readFileSync(path.join(draftsDir, aula, 'challenge-draft.json'), 'utf8'));
    const verdict = await prover({
      solutionCode: ch.solutionCode,
      starterCode: ch.starterCode,
      testsCode: ch.testsCode,
      expectedTestCount: ch.expectedTestCount,
      emptyStubCode: '',
    });
    console.log(`\nDESAFIO ${aula}/${ch.slug}:`);
    console.log(`  expectedTestCount declarado = ${ch.expectedTestCount}`);
    console.log(`  valid = ${verdict.valid} | declared = ${verdict.declared} | executed = ${verdict.executed}`);
    if (verdict.execError) console.log(`  execError = ${String(verdict.execError)}`);
    if (verdict.failures && verdict.failures.length > 0) {
      for (const f of verdict.failures) console.log(`  failure: ${JSON.stringify(f)}`);
    } else {
      console.log('  failures = nenhuma');
    }
    const ok = verdict.valid === true && verdict.declared === 1 && verdict.executed === 1;
    okTudo = okTudo && ok;
    console.log(`  VEREDITO: ${ok ? 'PASSOU (valid=true, declared=1, executed=1)' : 'NÃO PASSOU'}`);
  }
  console.log(`\nVEREDITO FINAL check 4 (2 desafios): ${okTudo ? 'PASSOU' : 'NÃO PASSOU'}`);
  if (!okTudo) process.exit(1);
}

main().catch((err) => {
  console.error('FALHA:', err);
  process.exit(1);
});
