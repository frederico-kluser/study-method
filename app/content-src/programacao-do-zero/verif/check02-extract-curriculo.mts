/**
 * VALIDAÇÃO 2 — extração ⊆ conjuntos do curriculo (cumulativo até L14).
 *
 * Regra: para cada desafio dos drafts L12–L14, TODAS as ocorrências emitidas por
 * extractAllOccurrences(starterCode), extractAllOccurrences(solutionCode) e
 * extractAllOccurrences(testsCode) precisam estar no conjunto
 *
 *   allowed = ∪_L1..L14 (avancos.produtivo ∪ avancos.receptivo ∪
 *                        demonstrado_na_teoria ∪ primeira_secao_demonstra ∪
 *                        atividade.*.atoms_usados ∪ congelado)
 *             ∪ HARNESS_RECEPTIVE_SEED ∪ STRUCTURAL_ALWAYS_ALLOWED
 *
 * A semente do harness entra porque o testsCode é a mecânica do runner
 * (imports/importação, test, assert) — o contrato do produto (D1 §3.2) — e não
 * conteúdo ensinado; starter/solução precisam caber no curriculo POR CONTA
 * PRÓPRIA (checagem estrita reportada separadamente).
 * Esperado: 0 fora em todas as superfícies.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractAllOccurrences } from '../../../electron/main/engine/extract';
import {
  HARNESS_RECEPTIVE_SEED,
  STRUCTURAL_ALWAYS_ALLOWED,
} from '../../../electron/main/engine/atomKeys';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..'); // app/
const baseDir = path.join(root, 'content-src', 'programacao-do-zero');

// ── conjunto do curriculo (cumulativo L1..L14) ─────────────────────────────
const curriculo: any[] = JSON.parse(
  fs.readFileSync(path.join(baseDir, 'curriculo.json'), 'utf8'),
);

const camposDeAtomos = [
  ['avancos', 'produtivo'],
  ['avancos', 'receptivo'],
  ['demonstrado_na_teoria'],
  ['primeira_secao_demonstra'],
  ['congelado'],
] as const;

const curriculoUnion = new Set<string>();
for (const aula of curriculo) {
  for (const campo of camposDeAtomos) {
    let valor: unknown = aula;
    for (const chave of campo) valor = (valor as Record<string, unknown>)[chave];
    if (Array.isArray(valor)) for (const item of valor as string[]) curriculoUnion.add(item);
  }
  const atividades = (aula.atividade ?? {}) as Record<string, { atoms_usados?: string[] }>;
  for (const atv of Object.values(atividades)) {
    for (const atom of atv.atoms_usados ?? []) curriculoUnion.add(atom);
  }
}

const seed = new Set<string>([...HARNESS_RECEPTIVE_SEED, ...STRUCTURAL_ALWAYS_ALLOWED]);
const allowed = new Set<string>([...curriculoUnion, ...seed]);

// ── checagem ────────────────────────────────────────────────────────────────
const slugs = ['involucro-completo', 'nomear-bem', 'todas-as-pecas-juntas'];
let totalFora = 0;

function checar(slug: string, surface: string, code: string, restritoAoCurriculo: boolean): number {
  const r = extractAllOccurrences(code);
  if (!r.ok) {
    console.log(`[${slug}] ${surface}: PARSE_ERROR (${r.error.message}) — contar como fora`);
    totalFora += 1;
    return 1;
  }
  const fora: string[] = [];
  for (const key of r.keys) {
    if (restritoAoCurriculo) {
      if (!curriculoUnion.has(key)) fora.push(key);
    } else if (!allowed.has(key)) {
      fora.push(key);
    }
  }
  if (fora.length > 0) {
    totalFora += fora.length;
    console.log(`[${slug}] ${surface}: ${fora.length} FORA — ${[...new Set(fora)].sort().join(', ')}`);
  }
  return fora.length;
}

console.log('=== VALIDAÇÃO 2 — extractAllOccurrences ⊆ curriculo cumulativo (L1–L14) ===');
console.log(`curriculoUnion=${curriculoUnion.size} seed=${seed.size} allowed=${allowed.size}`);

for (const slug of slugs) {
  const draft = JSON.parse(
    fs.readFileSync(path.join(baseDir, 'drafts', slug, 'challenge-draft.json'), 'utf8'),
  );
  console.log(`--- desafio ${draft.slug} (aula ${slug}) ---`);
  // starter + solução: restritos ao CURRICULO (sem semente)
  checar(slug, 'starterCode (⊆ curriculo)', draft.starterCode, true);
  checar(slug, 'solutionCode (⊆ curriculo)', draft.solutionCode, true);
  // teste: curriculo ∪ semente do harness
  checar(slug, 'testsCode (curriculo ∪ seed)', draft.testsCode, false);
}

console.log(`TOTAL DE ÁTOMOS FORA DO CONJUNTO: ${totalFora}`);
if (totalFora !== 0) process.exit(1);