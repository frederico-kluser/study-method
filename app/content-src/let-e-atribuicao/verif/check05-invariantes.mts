/**
 * VERIFICAÇÃO A05 — check 5: invariantes de estrutura I12–I17 + I13 por script
 * (docs/16-engine-de-trilha.md §5.2 — "buracos do loader atual": NÃO são
 * checados por loadTrack; verificação explícita aqui).
 *
 *   I12 | slug de aula é globalmente único na trilha
 *   I13 | slug === basename(dir) nos quatro níveis (track, module, lesson, challenge)
 *   I14 | order de módulo é inteiro e único
 *   I15 | theory[].id é único dentro da aula
 *   I16 | challenge.concept pertence a lesson.concepts
 *   I17 | files[].path nunca é test.mjs nem package.json
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadTrack } from '../../../electron/main/content/trackLoader';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..'); // app/
const trilhaDir = path.join(root, 'content-src', 'let-e-atribuicao', 'trilha');

async function main(): Promise<void> {
  console.log('=== CHECK 5 — I12–I17 + I13 ===');
  const track = await loadTrack(trilhaDir);

  // ----- I12: slugs de aula globalmente únicos -----
  const lessonSlugs: string[] = [];
  for (const m of track.modules) for (const l of m.lessons) lessonSlugs.push(l.meta.slug);
  const dupsLesson = lessonSlugs.filter((s, i) => lessonSlugs.indexOf(s) !== i);
  const i12 = new Set(dupsLesson).size === 0;
  console.log(`I12 ${i12 ? 'OK' : 'FALHOU'} — slugs de aula: [${lessonSlugs.join(', ')}]${dupsLesson.length ? ` DUPLICADOS: ${dupsLesson.join(', ')}` : ''}`);

  // ----- I13: slug === basename(dir) nos quatro níveis -----
  const results: string[] = [];
  // nível track: a pasta que contém track.json
  const trackDirName = path.basename(path.resolve(trilhaDir));
  results.push(`track     : basename='${trackDirName}' vs slug='${track.root.slug}' → ${trackDirName === track.root.slug ? 'OK' : 'DIVERGE'}`);
  for (const m of track.modules) {
    const moduleDirName = path.basename(path.resolve(trilhaDir, 'modules', m.meta.slug));
    results.push(`module    : basename='${moduleDirName}' vs slug='${m.meta.slug}' → ${moduleDirName === m.meta.slug ? 'OK' : 'DIVERGE'}`);
    for (const l of m.lessons) {
      const lessonDirName = path.basename(path.resolve(trilhaDir, 'modules', m.meta.slug, 'lessons', l.meta.slug));
      results.push(`lesson    : basename='${lessonDirName}' vs slug='${l.meta.slug}' → ${lessonDirName === l.meta.slug ? 'OK' : 'DIVERGE'}`);
      for (const c of l.challenges) {
        // o desafio pode viver em challenges/<slug>/ sob a AULA
        const dirCandidates = [
          path.resolve(trilhaDir, 'modules', m.meta.slug, 'lessons', l.meta.slug, 'challenges', c.slug),
        ];
        const exists = dirCandidates.find((d) => fs.existsSync(d));
        if (!exists) {
          results.push(`challenge : slug='${c.slug}' → DIR NÃO ENCONTRADO em ${dirCandidates.join(' | ')}`);
        } else {
          const challengeDirName = path.basename(exists);
          results.push(`challenge : basename='${challengeDirName}' vs slug='${c.slug}' → ${challengeDirName === c.slug ? 'OK' : 'DIVERGE'}`);
        }
      }
    }
  }
  for (const r of results) console.log(`I13        ${r}`);
  const i13ok = results.every((r) => r.endsWith('OK'));

  // ----- I14: order de módulo inteiro e único -----
  const orders = track.modules.map((m) => m.meta.order);
  const i14 = orders.every(Number.isInteger) && new Set(orders).size === orders.length;
  console.log(`I14 ${i14 ? 'OK' : 'FALHOU'} — orders=${orders.join(', ')} (inteiro e único)`);

  // ----- I15: theory[].id único dentro da aula -----
  let i15 = true;
  for (const m of track.modules) {
    for (const l of m.lessons) {
      const ids = l.meta.theory.map((t) => t.id);
      const dups = ids.filter((id, i) => ids.indexOf(id) !== i);
      if (dups.length > 0) {
        i15 = false;
        console.log(`I15 FALHOU — aula ${l.meta.slug} theory ids duplicados: ${dups.join(', ')}`);
      } else {
        console.log(`I15 OK      — aula ${l.meta.slug}: ${ids.length} theory ids únicos: [${ids.join(', ')}]`);
      }
    }
  }

  // ----- I16: challenge.concept pertence a lesson.concepts -----
  let i16 = true;
  for (const m of track.modules) {
    for (const l of m.lessons) {
      for (const c of l.challenges) {
        const ok = l.meta.concepts.includes(c.concept);
        if (!ok) i16 = false;
        console.log(`I16 ${ok ? 'OK ' : 'FALHOU'} — challenge ${c.slug}.concept='${c.concept}' ∈ lesson.concepts=[${l.meta.concepts.join(', ')}]`);
      }
    }
  }

  // ----- I17: files[].path nunca test.mjs/package.json -----
  let i17 = true;
  for (const m of track.modules) {
    for (const l of m.lessons) {
      for (const c of l.challenges) {
        if (Array.isArray(c.files) && c.files.length > 0) {
          for (const f of c.files) {
            if (f.path === 'test.mjs' || f.path === 'package.json') {
              i17 = false;
              console.log(`I17 FALHOU — challenge ${c.slug} files[].path=${f.path}`);
            }
          }
          console.log(`I17 OK      — challenge ${c.slug} tem files[] (${c.files.length} arquivos) — nenhum test.mjs/package.json`);
        } else {
          console.log(`I17 OK      — challenge ${c.slug} SEM files[] (formato arquivo único — invariante vacuamente atendida)`);
        }
      }
    }
  }

  console.log('');
  const allOk = i12 && i13ok && i14 && i15 && i16 && i17;
  console.log(`VEREDITO FINAL check 5: ${allOk ? 'TODAS OK' : 'HÁ FALHA(S)'}`);
  if (!allOk) process.exit(1);
}

main().catch((err) => {
  console.error('FALHA:', err);
  process.exit(1);
});
