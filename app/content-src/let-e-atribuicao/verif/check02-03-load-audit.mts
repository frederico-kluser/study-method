/**
 * VERIFICAÇÃO A05 — check 2 + 3: loadTrack(trilha) e auditTrack(trilha, mode:'declared').
 *
 * Check 2: loadTrack → issues (esperado: 0 — loadTrack LANÇA TrackLoadError com
 * issues quando alguma validação falha; sem throw = 0 issues).
 * Check 3: auditTrack(track, { mode: 'declared' }) → relatório COMPLETO de violações.
 * Esperado: EXATAMENTE 3 violações A2 residuais na solução
 * (node:VariableStatement, node:VariableDeclaration, node:VariableDeclarationList)
 * — limite de engine documentado no contrato (limite_conhecido_audit_derivado).
 * Todas as demais regras (A1/A3/A4/A6/A11/DEC), hygiene e parseErrors: 0.
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadTrack } from '../../../electron/main/content/trackLoader';
import { auditTrack } from '../../../electron/main/engine/audit';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..'); // app/
const trilhaDir = path.join(root, 'content-src', 'let-e-atribuicao', 'trilha');

async function main(): Promise<void> {
  console.log('=== CHECK 2 — loadTrack(trilha) ===');
  const track = await loadTrack(trilhaDir);
  console.log(`loadTrack OK: trackSlug=${track.root.slug}, dir=${track.dir}`);
  console.log(`modulos=${track.modules.length}, aulas=${track.modules.reduce((n, m) => n + m.lessons.length, 0)}, desafios=${track.modules.reduce((n, m) => n + m.lessons.reduce((k, l) => k + l.challenges.length, 0), 0)}`);
  console.log('ISSUES: 0 (loadTrack não lançou TrackLoadError)');

  console.log('');
  console.log('=== CHECK 3 — auditTrack(trilha, mode:declared) ===');
  const report = auditTrack(track, { mode: 'declared' });
  const byRule = new Map<string, number>();
  for (const v of report.violations) {
    byRule.set(v.regra, (byRule.get(v.regra) ?? 0) + 1);
  }
  console.log(`budgetSource: ${report.budgetSource}`);
  console.log(`totals: aulas=${report.totals.aulas} desafios=${report.totals.desafios} desafiosComViolacao=${report.totals.desafiosComViolacao} violacoes=${report.totals.violacoes} lacunasDeCurriculo=${report.totals.lacunasDeCurriculo} aulasSemConstrucaoNova=${report.totals.aulasSemConstrucaoNova}`);
  console.log(`por regra: ${[...byRule.entries()].map(([r, n]) => `${r}=${n}`).join(' ')}`);
  console.log(`hygiene: ${report.hygiene.length}`);
  for (const h of report.hygiene) console.log(`  hygiene: ${JSON.stringify(h)}`);
  console.log(`parseErrors: ${report.parseErrors.length}`);
  for (const p of report.parseErrors) console.log(`  parseError: ${JSON.stringify(p)}`);
  console.log('');
  console.log('--- VIOLAÇÕES COMPLETAS ---');
  for (const v of report.violations) {
    console.log(JSON.stringify(v, null, 2));
  }

  // veredito esperado
  const a2 = report.violations.filter((v) => v.regra === 'A2');
  const esperadas = new Set(['node:VariableStatement', 'node:VariableDeclaration', 'node:VariableDeclarationList']);
  const okA2 = a2.length === 3 && a2.every((v) => esperadas.has(v.construcao ?? ''));
  const outras = report.violations.filter((v) => v.regra !== 'A2');
  const okOutras = outras.length === 0;
  const ok = okA2 && okOutras && report.hygiene.length === 0 && report.parseErrors.length === 0;
  console.log('');
  console.log(`VEREDITO PARCIAL — A2 exatamente 3 nós-envelope na solução: ${okA2 ? 'SIM' : 'NÃO'} (A2=${a2.length})`);
  console.log(`VEREDITO PARCIAL — zero violações fora de A2 (A1/A3/A4/A6/A11/DEC): ${okOutras ? 'SIM' : 'NÃO'} (${outras.length})`);
  console.log(`VEREDITO PARCIAL — hygiene=0 e parseErrors=0: ${report.hygiene.length === 0 && report.parseErrors.length === 0 ? 'SIM' : 'NÃO'}`);
  console.log(`VEREDITO FINAL check 3: ${ok ? 'PASSOU (3 A2 exclusivamente)' : 'NÃO PASSOU'}`);
  if (!ok) process.exit(1);
}

main().catch((err) => {
  console.error('FALHA:', err);
  process.exit(1);
});
