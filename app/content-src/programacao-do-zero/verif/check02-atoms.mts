/**
 * VALIDAÇÃO 2 — extractAllOccurrences sobre TODAS as superfícies (starter,
 * solution, tests) + blocos js da teoria → atoms ⊆ conjuntos do curriculo
 * para a aula (cumulativos até L2) ∪ semente receptiva do harness ∪
 * estruturais. Esperado: 0 fora.
 *
 * Universo = ∪ por aula de (demonstrado_na_teoria ∪ avancos.produtivo ∪
 * avancos.receptivo) lidos do curriculo.json, em CÚMULO pelas aulas L1+L2,
 * MAIS HARNESS_RECEPTIVE_SEED e STRUCTURAL_ALWAYS_ALLOWED (a política
 * receptive-seed coloca a semente no orçamento receptivo desde a aula 1).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractAllOccurrences } from '../../../electron/main/engine/extract';
import { extractFencedBlocks } from '../../../electron/main/engine/theoryCode';
import { HARNESS_RECEPTIVE_SEED, STRUCTURAL_ALWAYS_ALLOWED } from '../../../electron/main/engine/atomKeys';

const here = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(here, '..'); // content-src/programacao-do-zero
const curriculo: Array<Record<string, any>> = JSON.parse(fs.readFileSync(path.join(raiz, 'curriculo.json'), 'utf8'));

interface AulaInput {
  slug: string;
  lesson: { theory: Array<{ id: string; markdown: string }> };
  challenge: { starterCode: string; solutionCode: string; testsCode: string };
}

const aulas: AulaInput[] = ['como-o-site-confere-seu-codigo', 'valor-e-instrucao'].map((slug) => ({
  slug,
  lesson: JSON.parse(fs.readFileSync(path.join(raiz, 'drafts', slug, 'lesson-draft.json'), 'utf8')),
  challenge: JSON.parse(fs.readFileSync(path.join(raiz, 'drafts', slug, 'challenge-draft.json'), 'utf8')),
}));

// universo do v-curriculo: cúmulo das duas aulas (conjuntos do curriculo)
const universosCurriculo = new Map<string, Set<string>>();
{
  const acumulado = new Set<string>();
  for (const [idx, entrada] of curriculo.entries()) {
    const set = new Set<string>();
    for (const k of entrada.demonstrado_na_teoria as string[]) set.add(k);
    for (const k of entrada.avancos.produtivo as string[]) set.add(k);
    for (const k of entrada.avancos.receptivo as string[]) set.add(k);
    if (idx === 0) {
      // L1 (índice 0) acumula só a si mesma; L2 (índice 1) acumula L1 ∪ L2.
      for (const k of set) acumulado.add(k);
    } else if (idx === 1) {
      for (const k of set) acumulado.add(k);
    }
    universosCurriculo.set(entrada.slug, new Set(acumulado));
  }
}

const universo = new Set<string>([...HARNESS_RECEPTIVE_SEED, ...STRUCTURAL_ALWAYS_ALLOWED]);
for (const s of universosCurriculo.values()) for (const k of s) universo.add(k);

function foraLinha(label: string, code: string, fora: string[]): void {
  const r = extractAllOccurrences(code);
  if (!r.ok) {
    console.log(`${label}: PARSE_ERROR ${r.error.message} (linha ${r.error.line})`);
    return;
  }
  const emitidos = new Set(r.keys);
  const f = r.keys.filter((k) => !universo.has(k));
  if (f.length > 0) {
    fora.push(...f);
    console.log(`  FORA DO UNIVERSO em ${label}: [${f.join(', ')}]`);
  } else {
    console.log(`  OK ${label} (${r.keys.length} chaves) — todas no universo`);
  }
}

console.log('=== CHECK 2 — ÁTOMOS DAS SUPERFÍCIES + TEORIA ⊆ UNIVERSO DO CURRICULO (cumulativo até L2) ===');
let totalFora = 0;
for (const aula of aulas) {
  console.log(`\nAULA ${aula.slug}:`);
  const fora: string[] = [];
  foraLinha('starterCode', aula.challenge.starterCode, fora);
  foraLinha('solutionCode', aula.challenge.solutionCode, fora);
  foraLinha('testsCode', aula.challenge.testsCode, fora);
  const blocos = new Map<string, string>();
  for (const sec of aula.lesson.theory) {
    const fenced = extractFencedBlocks(sec.markdown);
    for (const b of fenced.blocks) {
      if (!b.isJavaScript) continue;
      blocos.set(`${sec.id}#L${b.line}`, b.code);
    }
  }
  for (const [nome, code] of blocos) foraLinha(`teoria:${nome}`, code, fora);
  const unicos = [...new Set(fora)];
  if (unicos.length > 0) {
    console.log(`AULA ${aula.slug}: ${unicos.length} chave(s) fora do universo → [${unicos.join(', ')}]`);
  } else {
    console.log(`AULA ${aula.slug}: 0 fora do universo`);
  }
  totalFora += unicos.length;
}
console.log(`\nTOTAL FORA DO UNIVERSO: ${totalFora}`);
if (totalFora !== 0) process.exit(1);
