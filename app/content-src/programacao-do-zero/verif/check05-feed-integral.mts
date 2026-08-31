/**
 * VALIDAÇÃO 5 — FEED INTEGRAL 14 AULAS: auditarProgressao (bateria A13–A16)
 * sobre TODAS as aulas de programacao-do-zero EXATAMENTE como os drafts:
 * teoria + introduces + desafio com starter/solution/tests REAIS, na ordem do
 * curriculo.json. É a EVIDÊNCIA-FIM da onda e2-fix-bateria.
 *
 * Objetivo: 0 ERROS A13/A13d/A14a/A14b/A15a/A15b/A16 nas 14 aulas. Os AVISOS
 * A14a de aula-de-prática (aula sem incremento) são esperados e OK — nunca
 * erro (calibração da spec §4.1). A14a-declared (introduces.productive > 2)
 * também é erro e conta.
 *
 * Por que a L1 passa agora no A13c: a fórmula da spec §3.2 inclui a teoria DA
 * MESMA aula no conjunto demonstrado (Demo(i) ∪ Cum(i) para starter/tests/
 * solution). A seção 1 da L1 demonstra `assert.equal(resposta(), 7)` — o teste
 * do desafio da L1 chama `resposta()` sem erro, apesar de a L1 ser a aula
 * índice 0. Antes do fix a bateria acusava exatamente 1 erro aqui (o que o
 * check03 Feed B documentava como "pecado nº 1 esperado" — era o defeito
 * A13c, corrigido em progressao.ts).
 *
 * DRAFTS: o worktree de fix (e2-fix-bateria) tem 9 dos 14 drafts commitados; o
 * candidato de integração com os 14 está no repo main (leitura da onda).
 * Portanto a raiz de drafts é resolvida por PZ_DRAFTS_DIR (default: o drafts/
 * de main) e o script FALHA ALTO se algum dos 14 slugs não existir lá.
 *
 * Rodar:  cd app && ./node_modules/.bin/tsx content-src/programacao-do-zero/verif/check05-feed-integral.mts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { auditarProgressao, type ProgressaoLessonInput } from '../../../electron/main/engine/quality/progressao';

const here = path.dirname(fileURLToPath(import.meta.url));
const curriculoFile = path.resolve(here, '..', 'curriculo.json');
const DRAFTS_DIR =
  process.env.PZ_DRAFTS_DIR ??
  '/Volumes/Ext2TB/Projects/study-method/app/content-src/programacao-do-zero/drafts';

interface CurriculoItem {
  slug: string;
  titulo?: string;
}
interface DraftLesson {
  theory: { id?: string; title?: string; markdown?: string; code?: unknown }[];
  introduces?: { productive?: string[]; receptive?: string[] };
}
interface DraftChallenge {
  slug: string;
  starterCode: string;
  solutionCode: string;
  testsCode: string;
}

function carregar(slug: string): { lesson: DraftLesson; challenge: DraftChallenge } {
  const dir = path.join(DRAFTS_DIR, slug);
  const lesson = JSON.parse(fs.readFileSync(path.join(dir, 'lesson-draft.json'), 'utf8'));
  const challenge = JSON.parse(fs.readFileSync(path.join(dir, 'challenge-draft.json'), 'utf8'));
  return { lesson, challenge };
}

function main(): void {
  const ordem: CurriculoItem[] = JSON.parse(fs.readFileSync(curriculoFile, 'utf8'));
  console.log(`=== CHECK 5 — feed INTEGRAL ${ordem.length} aulas (ordem do curriculo.json) ===`);
  console.log(`drafts: ${DRAFTS_DIR}`);

  const aulas: ProgressaoLessonInput[] = [];
  for (const item of ordem) {
    const slug = item.slug;
    const d = carregar(slug);
    const baseDir = `modules/modulo-1/lessons/${slug}`;
    const falta: string[] = [];
    if (!Array.isArray(d.lesson.theory) || d.lesson.theory.length === 0) falta.push('theory');
    if (!d.challenge.starterCode || !d.challenge.solutionCode || !d.challenge.testsCode) falta.push('starter/solution/tests');
    if (falta.length > 0) {
      console.error(`FALHA ALTA: draft de '${slug}' incompleto (${falta.join(', ')}) em ${DRAFTS_DIR}/${slug}`);
      process.exit(1);
    }
    aulas.push({
      ref: `modulo-1/${slug}`,
      baseDir,
      theory: d.lesson.theory,
      declared: {
        productive: d.lesson.introduces?.productive ?? [],
        receptive: d.lesson.introduces?.receptive ?? [],
      },
      challenges: [
        {
          slug: d.challenge.slug,
          desafioFile: `${baseDir}/challenges/${d.challenge.slug}/challenge.json`,
          files: [{ path: 'solution.mjs', starter: d.challenge.starterCode, solution: d.challenge.solutionCode }],
          tests: d.challenge.testsCode,
        },
      ],
    });
  }

  const res = auditarProgressao(aulas, { mode: 'declared' });
  const bateria = ['A13', 'A13d', 'A14a', 'A14b', 'A15a', 'A15b', 'A16'];
  const erros = res.violations.filter((v) => bateria.includes(v.regra) && v.severidade === 'erro');
  const avisos = res.violations.filter((v) => bateria.includes(v.regra) && v.severidade === 'aviso');

  console.log(`\nERROS A13–A16: ${erros.length} | AVISOS: ${avisos.length}`);
  for (const v of res.violations) {
    const pos = v.campo === 'lesson' ? '' : ` L${v.linha}:${v.coluna}`;
    console.log(
      `  [${v.severidade}] ${v.regra} ref=${v.ref} campo=${v.campo}${pos}${v.construcao ? ` construcao=${v.construcao}` : ''}${v.arquivo ? ` arquivo=${v.arquivo}` : ''} — ${v.mensagem}`,
    );
  }
  const novos = [...res.novosPorAula.entries()].map(([r, n]) => `${r}=${n}`).join(', ');
  console.log(`\nNovos (A14a) por aula: ${novos}`);

  const avisosForaA14a = avisos.filter((v) => v.regra !== 'A14a');
  if (erros.length > 0 || avisosForaA14a.length > 0) {
    console.log('\nVEREDITO Feed Integral: FALHOU — resta(m) ERRO(s) de bateria (classificar: defeito da bateria vs defeito do conteúdo)');
    process.exit(1);
  }
  console.log(
    `\nVEREDITO Feed Integral: PASSOU — 0 ERROS A13–A16 nas ${ordem.length} aulas; só os ${avisos.length} avisos A14a de aula-de-prática (esperados)`,
  );
}

main();