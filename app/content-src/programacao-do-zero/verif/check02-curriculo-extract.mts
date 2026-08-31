/**
 * VERIFICAÇÃO — check 2: TODAS as ocorrências extraídas (superfícies dos
 * desafios + blocos js da teoria das aulas L3/L4) ⊆ conjuntos do currículo
 * (cumulativo até L4) ∪ seed do harness ∪ estruturais.
 *
 * O conjunto permitido é montado do curriculo.json: para as aulas 1..4,
 * a união de avancos.{produtivo,receptivo}, demonstrado_na_teoria,
 * primeira_secao_demonstra, congelado e atividade.*.atoms_usados — mais
 * HARNESS_RECEPTIVE_SEED (o harness que o aluno lê em todo desafio; nota S13
 * do curriculo.md) e STRUCTURAL_ALWAYS_ALLOWED (SourceFile/Identifier/...).
 * Esperado: 0 chaves fora.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractAllOccurrences } from '../../../electron/main/engine/extract';
import { extractFencedBlocks } from '../../../electron/main/engine/theoryCode';
import { HARNESS_RECEPTIVE_SEED, STRUCTURAL_ALWAYS_ALLOWED } from '../../../electron/main/engine/atomKeys';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..'); // app/
const trilha = path.join(root, 'content-src', 'programacao-do-zero');

const curriculo: any[] = JSON.parse(fs.readFileSync(path.join(trilha, 'curriculo.json'), 'utf8'));
const aulas = ['funcao-e-chamada', 'export-entrega'];

function chavesDe(superficie: string): string[] {
  return ['starterCode', 'solutionCode', 'testsCode'].flatMap((campo) => {
    const r = extractAllOccurrences(superficie);
    return r.ok ? r.occurrences.map((o) => o.key) : [];
  });
}

function chavesDaTeoria(markdown: string): string[] {
  const out: string[] = [];
  const fenced = extractFencedBlocks(markdown);
  for (const b of fenced.blocks) {
    if (!b.isJavaScript) continue;
    const r = extractAllOccurrences(b.code);
    if (r.ok) for (const occ of r.occurrences) out.push(occ.key);
  }
  return out;
}

// ── conjunto permitido a partir do currículo (L1..L4) ──────────────────────
const permitido = new Set<string>([...HARNESS_RECEPTIVE_SEED, ...STRUCTURAL_ALWAYS_ALLOWED]);
const camposDeAtomos = [
  'demonstrado_na_teoria',
  'primeira_secao_demonstra',
  'congelado',
];
for (const aula of curriculo.slice(0, 4)) {
  for (const c of camposDeAtomos) for (const k of aula[c] ?? []) permitido.add(k);
  for (const faixa of ['produtivo', 'receptivo']) for (const k of aula.avancos?.[faixa] ?? []) permitido.add(k);
  const atividade = aula.atividade ?? {};
  for (const k of atividade.fixar?.atoms_usados ?? []) permitido.add(k);
  for (const k of atividade.esticar?.atoms_usados ?? []) permitido.add(k);
}

console.log('=== CHECK 2 — OCORRÊNCIAS ⊆ CONJUNTOS DO CURRÍCULO (cumulativo até L4) ===');
console.log(`conjunto permitido: ${permitido.size} chaves (currículo L1..L4 ∪ seed do harness ∪ estruturais)`);

const fora: string[] = [];
let totalOcorrencias = 0;
for (const aula of aulas) {
  const dir = path.join(trilha, 'drafts', aula);
  const challenge: any = JSON.parse(fs.readFileSync(path.join(dir, 'challenge-draft.json'), 'utf8'));
  const lesson: any = JSON.parse(fs.readFileSync(path.join(dir, 'lesson-draft.json'), 'utf8'));

  for (const [superficie, chaves] of [
    ['starterCode', chavesDe(challenge.starterCode)],
    ['solutionCode', chavesDe(challenge.solutionCode)],
    ['testsCode', chavesDe(challenge.testsCode)],
  ] as const) {
    for (const k of chaves) {
      totalOcorrencias += 1;
      if (!permitido.has(k)) fora.push(`${aula}/${superficie}: ${k}`);
    }
  }

  for (const secao of lesson.theory) {
    for (const k of chavesDaTeoria(secao.markdown)) {
      totalOcorrencias += 1;
      if (!permitido.has(k)) fora.push(`${aula}/teoria[${secao.id}]: ${k}`);
    }
  }
}

console.log(`ocorrências verificadas: ${totalOcorrencias}`);
console.log(`fora dos conjuntos: ${fora.length}`);
for (const f of fora) console.log(`  FORA: ${f}`);
if (fora.length !== 0) process.exit(1);
console.log('VEREDITO check 2: PASSOU (0 fora)');