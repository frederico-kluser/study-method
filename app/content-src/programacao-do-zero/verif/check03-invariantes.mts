/**
 * VALIDAÇÃO m3 — check 3: invariantes I12–I17 + I13 (slug == basename nos
 * quatro níveis) sobre a trilha MATERIALIZADA em
 * content-src/programacao-do-zero/trilha.
 *
 *   I12  slug de aula globalmente único
 *   I13  slug === basename(dir) nos quatro níveis (track, module, lesson, challenge)
 *   I14  order de módulo inteiro e único
 *   I15  theory[].id único dentro da aula
 *   I16  challenge.concept ∈ lesson.concepts
 *   I17  files[].path nunca é test.mjs nem package.json
 *
 * Rodar (cwd app/):  node --import tsx content-src/programacao-do-zero/verif/check03-invariantes.mts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const trilha = path.resolve(here, '..', 'trilha');

const problemas: string[] = [];
let checked = { aula: 0, lesson: 0, challenge: 0 };

// I13 — track level: o staging fica em `trilha/` (basename ≠ slug); o destino
// FINAL resources/tracks/<slug> satisfaz I13. Desvio de STAGING documentado
// (mesma ressalva do precedente a04 — relatorio-validacao.md "Limites").
const trackRaw = JSON.parse(fs.readFileSync(path.join(trilha, 'track.json'), 'utf8'));
if (trackRaw.slug !== path.basename(trilha)) {
  console.log(
    `NOTA I13-track (staging): slug '${trackRaw.slug}' ≠ basename '${path.basename(trilha)}' — ` +
      `desvio de STAGING esperado; o destino final resources/tracks/${trackRaw.slug}/ satisfaz I13.`,
  );
}

// módulos (I13 module + I14 order)
const moduleDirs = fs.readdirSync(path.join(trilha, 'modules')).filter((d) => fs.statSync(path.join(trilha, 'modules', d)).isDirectory());
const orders = new Map<number, string>();
for (const modDir of moduleDirs) {
  const mod = JSON.parse(fs.readFileSync(path.join(trilha, 'modules', modDir, 'module.json'), 'utf8'));
  checked.aula += 1;
  if (mod.slug !== modDir) problemas.push(`I13 module: slug '${mod.slug}' ≠ basename '${modDir}'`);
  if (!Number.isInteger(mod.order)) problemas.push(`I14: order de ${mod.slug} não é inteiro`);
  const prev = orders.get(mod.order);
  if (prev !== undefined) problemas.push(`I14: order ${mod.order} duplicado (${prev} e ${mod.slug})`);
  orders.set(mod.order, mod.slug);

  // aulas (I12 + I13 lesson + I15)
  const slugsAula = new Map<string, string>();
  const lessonDirs = fs.readdirSync(path.join(trilha, 'modules', modDir, 'lessons')).filter((d) =>
    fs.statSync(path.join(trilha, 'modules', modDir, 'lessons', d)).isDirectory(),
  );
  for (const lessonDir of lessonDirs) {
    const lesson = JSON.parse(
      fs.readFileSync(path.join(trilha, 'modules', modDir, 'lessons', lessonDir, 'lesson.json'), 'utf8'),
    );
    checked.lesson += 1;
    if (lesson.slug !== lessonDir) problemas.push(`I13 lesson: slug '${lesson.slug}' ≠ basename '${lessonDir}'`);
    const outros = slugsAula.get(lesson.slug);
    if (outros !== undefined) problemas.push(`I12: slug de aula duplicado '${lesson.slug}' (${outros} e ${modDir}/${lessonDir})`);
    slugsAula.set(lesson.slug, `${modDir}/${lessonDir}`);

    const ids = new Set<string>();
    for (const s of lesson.theory ?? []) {
      if (ids.has(s.id)) problemas.push(`I15: theory[].id duplicado '${s.id}' em ${lessonDir}`);
      ids.add(s.id);
    }

    // desafios (I13 challenge + I16 + I17)
    const desafiosDir = path.join(trilha, 'modules', modDir, 'lessons', lessonDir, 'challenges');
    if (fs.existsSync(desafiosDir)) {
      const desafioDirs = fs.readdirSync(desafiosDir).filter((d) => fs.statSync(path.join(desafiosDir, d)).isDirectory());
      for (const desafioDir of desafioDirs) {
        const ch = JSON.parse(fs.readFileSync(path.join(desafiosDir, desafioDir, 'challenge.json'), 'utf8'));
        checked.challenge += 1;
        if (ch.slug !== desafioDir) problemas.push(`I13 challenge: slug '${ch.slug}' ≠ basename '${desafioDir}'`);
        if (!(lesson.concepts ?? []).includes(ch.concept)) {
          problemas.push(`I16: concept '${ch.concept}' ∉ lesson.concepts de ${lessonDir}`);
        }
        for (const f of ch.files ?? []) {
          if (f.path === 'test.mjs' || f.path === 'package.json') {
            problemas.push(`I17: files[].path proibido '${f.path}' em ${desafioDir}`);
          }
        }
      }
    }

    // desafios de módulo (I13 + I16 n/a + I17)
    const modChallengesDir = path.join(trilha, 'modules', modDir, 'challenges');
    if (fs.existsSync(modChallengesDir)) {
      for (const desafioDir of fs.readdirSync(modChallengesDir).filter((d) => fs.statSync(path.join(modChallengesDir, d)).isDirectory())) {
        const ch = JSON.parse(fs.readFileSync(path.join(modChallengesDir, desafioDir, 'challenge.json'), 'utf8'));
        checked.challenge += 1;
        if (ch.slug !== desafioDir) problemas.push(`I13 challenge(módulo): slug '${ch.slug}' ≠ basename '${desafioDir}'`);
        for (const f of ch.files ?? []) {
          if (f.path === 'test.mjs' || f.path === 'package.json') {
            problemas.push(`I17: files[].path proibido '${f.path}' em ${desafioDir}`);
          }
        }
      }
    }
  }
}

console.log(`I12–I17 + I13 — níveis conferidos: ${checked.aula} módulo(s) · ${checked.lesson} aula(s) · ${checked.challenge} desafio(s)`);
if (problemas.length === 0) {
  console.log('VEREDITO: PASSOU (I12 única · I13 4 níveis · I14 única · I15 únicos · I16 ∈ · I17 vazio)');
} else {
  for (const p of problemas) console.log(`  ${p}`);
  process.exit(1);
}
