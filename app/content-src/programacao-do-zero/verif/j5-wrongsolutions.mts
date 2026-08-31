/**
 * Sanidade J5 (bônus): as wrongSolutions catalogadas em cada challenge-draft
 * FALHAM no teste (verdict.valid = false para cada uma). Não é gate — é
 * conferência de que o catálogo de respostas erradas está honesto.
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
  console.log('=== SANIDADE J5 — wrongSolutions falham no teste ===');
  const prover = criarProverDeDesafio();
  let ok = true;
  for (const aula of aulas) {
    const ch = JSON.parse(fs.readFileSync(path.join(draftsDir, aula, 'challenge-draft.json'), 'utf8'));
    for (const [i, wrong] of ch.wrongSolutions.entries()) {
      const v = await prover({
        solutionCode: wrong,
        starterCode: ch.starterCode,
        testsCode: ch.testsCode,
        expectedTestCount: ch.expectedTestCount,
        emptyStubCode: '',
      });
      const passou = v.valid === false;
      ok = ok && passou;
      console.log(`  ${aula} wrongSolutions[${i}] → valid=${v.valid} ${passou ? '(falha como esperado)' : '(!!! PASSARIA — revise a wrongSolution)'}`);
    }
  }
  console.log(`VEREDITO J5: ${ok ? 'PASSOU (todas as wrongSolutions falham)' : 'NÃO PASSOU'}`);
  if (!ok) process.exit(1);
}

main().catch((err) => {
  console.error('FALHA:', err);
  process.exit(1);
});
