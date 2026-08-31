/**
 * VALIDAÇÃO m3 — check 2: as 4 provas de execução (§5.4) via
 * criarProverDeDesafio (f9Verifier) sobre TODOS os 14 challenge.json
 * MATERIALIZADOS. P1 solução passa · P2 starter falha · P3 contagem ==
 * expectedTestCount · P4 stub vazio falha.
 *
 * Esperado: valid=true, declared==executed==expectedTestCount em todos.
 *
 * Rodar (cwd app/):  node --import tsx content-src/programacao-do-zero/verif/check02-provas.mts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { criarProverDeDesafio } from '../../../electron/main/engine/phases/f9Verifier';

const here = path.dirname(fileURLToPath(import.meta.url));
const trilha = path.resolve(here, '..', 'trilha');
const ordem = JSON.parse(fs.readFileSync(path.resolve(here, '..', 'curriculo.json'), 'utf8')).map((c: any) => c.slug);

async function main(): Promise<void> {
  const prover = criarProverDeDesafio();
  let falhas = 0;
  const linhas: string[] = [];

  for (const slug of ordem) {
    // descobre o único desafio da aula
    const desafiosDir = path.join(trilha, 'modules', 'fundamentos-js', 'lessons', slug, 'challenges');
    const desafioSlug = fs.readdirSync(desafiosDir).find((d) => fs.statSync(path.join(desafiosDir, d)).isDirectory());
    if (!desafioSlug) throw new Error(`aula ${slug} sem desafio`);
    const challenge = JSON.parse(
      fs.readFileSync(path.join(desafiosDir, desafioSlug, 'challenge.json'), 'utf8'),
    );

    const verdict = await prover({
      solutionCode: challenge.solutionCode,
      starterCode: challenge.starterCode,
      testsCode: challenge.testsCode,
      expectedTestCount: challenge.expectedTestCount,
      emptyStubCode: '',
    });

    const ok =
      verdict.valid === true &&
      verdict.declared === challenge.expectedTestCount &&
      verdict.executed === challenge.expectedTestCount;
    if (!ok) falhas += 1;
    linhas.push(
      `${ok ? 'OK  ' : 'FALHA'} ${slug.padEnd(32)} valid=${verdict.valid} declared=${verdict.declared} ` +
        `executed=${verdict.executed} expected=${challenge.expectedTestCount}` +
        (verdict.failures && verdict.failures.length > 0 ? ` failures=${JSON.stringify(verdict.failures)}` : ''),
    );
  }

  for (const l of linhas) console.log(l);
  console.log(`\nTOTAL: ${ordem.length} desafios | falhas: ${falhas}`);
  if (falhas > 0) process.exit(1);
  console.log('VEREDITO: PASSOU (14/14 desafios com valid=true, declared==executed==expectedTestCount)');
}

main().catch((e) => {
  console.error('FALHA:', e);
  process.exit(1);
});
