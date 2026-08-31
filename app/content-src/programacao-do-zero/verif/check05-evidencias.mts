/**
 * VALIDAÇÃO 5 (evidência de apoio) — (a) todo bloco js da teoria dos drafts
 * parseia (bloco que não parseia demonstra NADA — A13 depende disso); (b) cada
 * wrongSolution FALHA no teste por execução real; (c) cada solutionAlternate
 * PASSA por execução real. Esperado: 0 blocos não-parseáveis, todas as
 * wrongSolutions falhando, todos os alternates passando.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractAllOccurrences } from '../../../electron/main/engine/extract';
import { collectLessonCode } from '../../../electron/main/engine/theoryCode';
import { criarProverDeDesafio } from '../../../electron/main/engine/phases/f9Verifier';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..'); // app/
const baseDir = path.join(root, 'content-src', 'programacao-do-zero', 'drafts');

const slugs = ['involucro-completo', 'nomear-bem', 'todas-as-pecas-juntas'];

async function main(): Promise<void> {
  const prover = criarProverDeDesafio();
  let falhas = 0;

  for (const slug of slugs) {
    console.log(`=== ${slug} ===`);
    const lesson: any = JSON.parse(fs.readFileSync(path.join(baseDir, slug, 'lesson-draft.json'), 'utf8'));
    const challenge: any = JSON.parse(fs.readFileSync(path.join(baseDir, slug, 'challenge-draft.json'), 'utf8'));

    // (a) blocos js da teoria parseiam
    const coletados = collectLessonCode(lesson.theory.map((s: any) => ({ id: s.id, markdown: s.markdown })));
    let naoParseiam = 0;
    for (const bloco of coletados.blocks) {
      if (!bloco.isJavaScript) continue;
      const r = extractAllOccurrences(bloco.code);
      if (!r.ok) {
        naoParseiam += 1;
        console.log(`  [teoria ${lesson.slug}] bloco js NÃO parseia: ${bloco.code.slice(0, 60).replace(/\n/g, ' ')} — ${r.error.message}`);
      }
    }
    const semTag = coletados.hygiene.length;
    console.log(`  (a) teoria: blocos js=${coletados.blocks.filter((b) => b.isJavaScript).length} não-parseáveis=${naoParseiam} FENCE_SEM_TAG=${semTag}`);

    // (b) wrongSolutions falham
    for (const wrong of challenge.wrongSolutions) {
      const v = await prover({
        solutionCode: wrong,
        starterCode: challenge.starterCode,
        testsCode: challenge.testsCode,
        expectedTestCount: challenge.expectedTestCount,
        emptyStubCode: '',
      });
      const ok = !v.valid && v.failures.length > 0;
      falhas += ok ? 0 : 1;
      console.log(`  (b) wrongSolution falha=${ok ? 'SIM' : 'NÃO'} — ${JSON.stringify(wrong).slice(0, 70)}`);
      if (!ok) console.log(`      failures: ${v.failures.map((f) => `${f.proof}: ${f.reason}`).join(' | ')}`);
    }

    // (c) solutionAlternates passam
    for (const alt of challenge.solutionAlternates) {
      const v = await prover({
        solutionCode: alt,
        starterCode: challenge.starterCode,
        testsCode: challenge.testsCode,
        expectedTestCount: challenge.expectedTestCount,
        emptyStubCode: '',
      });
      const ok = v.valid;
      falhas += ok ? 0 : 1;
      console.log(`  (c) alternate passa=${ok ? 'SIM' : 'NÃO'} — ${JSON.stringify(alt).slice(0, 70)}`);
      if (!ok) console.log(`      failures: ${v.failures.map((f) => `${f.proof}: ${f.reason}`).join(' | ')}`);
    }

    if (coletados.hygiene.length > 0) falhas += coletados.hygiene.length;
    if (naoParseiam > 0) falhas += naoParseiam;
  }

  console.log(`TOTAL DE FALHAS DE EVIDÊNCIA: ${falhas}`);
  if (falhas !== 0) process.exit(1);
}

main().catch((err) => {
  console.error('FALHA:', err);
  process.exit(1);
});