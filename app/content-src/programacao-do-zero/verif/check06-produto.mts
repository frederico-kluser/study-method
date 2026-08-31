/**
 * VALIDAÇÃO m3-onda3 — check 6: CAMINHO DE PRODUTO. A GUI lê as trilhas de
 * `resources/tracks/<slug>/` (loader: app.getAppPath()/resources/tracks) — o
 * caminho de PRODUTO desta trilha é `resources/tracks/programacao-do-zero/`.
 *
 * Este check PROVA:
 *   (a) loadTrack(produto) → 0 issues (TrackLoadError lançado = falha);
 *   (b) o produto é a MESMA árvore materializada de content-src/.../trilha —
 *       byte a byte, arquivo por arquivo (o materializador grava o MESMO
 *       conteúdo serializado nos dois destinos);
 *   (c) as ASSERTIONS (onda 1 schema-quiz) chegaram ao produto: 14 aulas ×
 *       3 afirmações, expostas pelo loader via `meta.assertions` (cast, não
 *       pick — docs §10);
 *   (d) `resources/tracks/nodejs-do-zero` NÃO foi tocado: a árvore legada
 *       permanece byte a byte a do HEAD (pin 717/112/249/92 reprovado no
 *       relatório; aqui confere-se a presença intacta da árvore).
 *
 * Rodar (cwd app/):  node --import tsx content-src/programacao-do-zero/verif/check06-produto.mts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadTrack } from '../../../electron/main/content/trackLoader';

const here = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(here, '..'); // content-src/programacao-do-zero
const trilha = path.join(raiz, 'trilha');
const produto = path.resolve(raiz, '..', '..', 'resources', 'tracks', 'programacao-do-zero');
const legada = path.resolve(raiz, '..', '..', 'resources', 'tracks', 'nodejs-do-zero');

/** lista relativa de todos os arquivos .json de uma árvore (ordenada). */
function jsonDaArvore(base: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, rel: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      const r = path.join(rel, e.name);
      if (e.isDirectory()) walk(p, r);
      else if (e.name.endsWith('.json')) out.push(r);
    }
  };
  walk(base, '');
  return out.sort();
}

async function main(): Promise<void> {
  // ── (d) a trilha legada está intacta (presença mínima) ─────────────────────
  const legadaOk =
    fs.existsSync(path.join(legada, 'track.json')) &&
    fs.statSync(path.join(legada, 'track.json')).size > 0;
  console.log(`(d) nodejs-do-zero presente e intocado (track.json): ${legadaOk ? 'OK' : 'FALHOU'}`);
  if (!legadaOk) process.exit(1);

  // ── (a) loadTrack do caminho de PRODUTO → 0 issues ────────────────────────
  let track;
  try {
    track = await loadTrack(produto);
    console.log(`(a) loadTrack(produto): 0 issues — slug=${track.root.slug} módulos=${track.modules.length}`);
  } catch (e) {
    console.error('(a) loadTrack(produto) FALHOU:', String(e));
    process.exit(1);
  }
  const aulas = track.modules.reduce((n, m) => n + m.lessons.length, 0);
  console.log(`    produto: slug=${track.root.slug} · módulos=${track.modules.length} · aulas=${aulas}`);
  if (track.root.slug !== 'programacao-do-zero' || aulas !== 14) {
    console.error(`    slug/aulas inesperados (esperado programacao-do-zero / 14)`);
    process.exit(1);
  }

  // ── (b) produto ≡ trilha de autoria — byte a byte ─────────────────────────
  const jsonTrilha = jsonDaArvore(trilha);
  const jsonProduto = jsonDaArvore(produto);
  console.log(`(b) árvore: trilha=${jsonTrilha.length} arquivos · produto=${jsonProduto.length} arquivos`);
  if (jsonTrilha.length !== jsonProduto.length || jsonTrilha.some((r, i) => r !== jsonProduto[i])) {
    console.error('    árvores DIFEREM na lista de arquivos:');
    console.error('      só na trilha: ', jsonTrilha.filter((r) => !jsonProduto.includes(r)));
    console.error('      só no produto:', jsonProduto.filter((r) => !jsonTrilha.includes(r)));
    process.exit(1);
  }
  let diffs = 0;
  for (const rel of jsonTrilha) {
    const a = fs.readFileSync(path.join(trilha, rel));
    const b = fs.readFileSync(path.join(produto, rel));
    if (!a.equals(b)) {
      diffs += 1;
      console.error(`    DIFF byte a byte: ${rel}`);
    }
  }
  console.log(`    produto ≡ trilha (byte a byte): ${diffs === 0 ? 'OK — idêntico' : `FALHOU (${diffs} diffs)`}`);
  if (diffs > 0) process.exit(1);

  // ── (c) assertions presentes no produto, via loader (cast, não pick) ──────
  let totalAssertions = 0;
  let semQuiz = 0;
  for (const mod of track.modules) {
    for (const lesson of mod.lessons) {
      const meta = lesson.meta as unknown as Record<string, unknown>;
      const asserts = meta['assertions'];
      if (!Array.isArray(asserts)) {
        semQuiz += 1;
        console.error(`    ${mod.meta.slug}/${lesson.meta.slug}: assertions AUSENTE ou não-array no produto`);
      } else {
        totalAssertions += asserts.length;
      }
    }
  }
  console.log(`(c) assertions no produto: ${totalAssertions} afirmações em 14 aulas (${semQuiz} sem quiz)`);
  const ok = totalAssertions === 42 && semQuiz === 0; // 14 aulas × 3
  console.log(`    esperado 42 (14×3) em TODAS as aulas: ${ok ? 'OK' : 'FALHOU'}`);
  if (!ok) process.exit(1);

  console.log('\nVEREDITO check06-produto: PASSOU (loadTrack 0 issues · produto≡trilha byte a byte · assertions 42/42)');
}

main().catch((e) => {
  console.error('FALHA:', e);
  process.exit(1);
});
