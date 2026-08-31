/**
 * VALIDAÇÃO m3 — check 1: loadTrack + auditTrack (bateria completa) sobre a
 * trilha MATERIALIZADA em content-src/programacao-do-zero/trilha.
 *
 * Esperado (m3-materializa):
 *   (a) loadTrack → 0 issues;
 *   (b) auditTrack → 0 ERROS em A1..A16/I12..I17/DEC + hygiene=0 + parseErrors=0;
 *       exatamente 10 AVISOS A14a de aula-de-prática (aula sem incremento),
 *       listados.
 *
 * Rodar (cwd app/):  node --import tsx content-src/programacao-do-zero/verif/check01-load-audit.mts
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadTrack } from '../../../electron/main/content/trackLoader';
import { auditTrack } from '../../../electron/main/engine/audit';

const here = path.dirname(fileURLToPath(import.meta.url));
const trilha = path.resolve(here, '..', 'trilha');

async function main(): Promise<void> {
  // ── (a) loadTrack ─────────────────────────────────────────────────────────
  let track;
  try {
    track = await loadTrack(trilha);
    console.log(`(a) loadTrack: 0 issues — slug=${track.root.slug} módulos=${track.modules.length}`);
  } catch (e) {
    console.error('(a) loadTrack FALHOU:', String(e));
    process.exit(1);
  }

  // ── (b) auditTrack — bateria completa (modo automático: declared) ─────────
  const report = auditTrack(track);
  const erros = report.violations.filter((v) => (v.severidade ?? 'erro') === 'erro');
  const avisos = report.violations.filter((v) => v.severidade === 'aviso');

  console.log(`\n(b) auditTrack — budgetSource=${report.budgetSource}`);
  console.log(`ERROS: ${erros.length}`);
  console.log(`AVISOS: ${avisos.length}`);
  console.log(`hygiene: ${report.hygiene.length} | parseErrors: ${report.parseErrors.length}`);

  const porRegraErro = new Map<string, number>();
  for (const v of erros) porRegraErro.set(v.regra, (porRegraErro.get(v.regra) ?? 0) + 1);
  console.log('erros por regra:', [...porRegraErro.entries()].map(([r, n]) => `${r}=${n}`).join(' ') || '(nenhum)');

  const porRegraAviso = new Map<string, number>();
  for (const v of avisos) porRegraAviso.set(v.regra, (porRegraAviso.get(v.regra) ?? 0) + 1);
  console.log('avisos por regra:', [...porRegraAviso.entries()].map(([r, n]) => `${r}=${n}`).join(' ') || '(nenhum)');

  console.log('\nAVISOS (lista):');
  for (const v of avisos) {
    console.log(`  [${v.regra}] ref=${v.ref} campo=${v.campo} — ${v.mensagem.slice(0, 140)}`);
  }

  for (const p of report.parseErrors) {
    console.log(`  PARSE ref=${p.ref} linha ${p.line}: ${p.message}`);
  }
  for (const h of report.hygiene) {
    console.log(`  HYGIENE ref=${h.ref}: ${h.message}`);
  }

  const r = report.totals;
  console.log(
    `\ntotals: aulas=${r.aulas} desafios=${r.desafios} violacoes=${r.violacoes} avisos=${r.avisos} ` +
      `desafiosComViolacao=${r.desafiosComViolacao} lacunasDeCurriculo=${r.lacunasDeCurriculo} aulasSemConstrucaoNova=${r.aulasSemConstrucaoNova}`,
  );

  const ok =
    erros.length === 0 &&
    report.parseErrors.length === 0 &&
    report.hygiene.length === 0 &&
    r.lacunasDeCurriculo === 0;
  const avisosA14a = avisos.filter((v) => v.regra === 'A14a');
  const avisosDeOutras = avisos.filter((v) => v.regra !== 'A14a');
  console.log(
    `\nVEREDITO: ${ok ? 'PASSOU (0 erros; hygiene=0; parseErrors=0)' : 'NÃO PASSOU'} | ` +
      `avisos A14a=${avisosA14a.length} (esperado 10) | outros avisos=${avisosDeOutras.length}`,
  );
  if (!ok) process.exit(1);
  if (avisosA14a.length !== 10 || avisosDeOutras.length !== 0) {
    console.error(`Contagem de avisos fora do esperado (10 A14a, nenhum outro)`);
    process.exit(2);
  }
}

main().catch((e) => {
  console.error('FALHA:', e);
  process.exit(1);
});
