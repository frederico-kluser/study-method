/**
 * VALIDAÇÃO 3 — auditarProgressao (progressao.ts — bateria A13–A16) sobre as
 * duas aulas alimentadas no formato ProgressaoLessonInput (a assinatura lida
 * de engine/quality/progressao.ts e espelhada em audit.ts::entradaDeProgressao).
 *
 * DOIS FEEDS (ambos rodados e reportados):
 *   Feed A — CANÔNICO (o caso-feliz da própria engine para ESTE curriculo,
 *            engineProgressao.test.ts caso 9): a L1 é aula de LEITURA — sem
 *            desafio na bateria; a L2 entra com o desafio 'digite-outro-numero'.
 *            Esperado: 0 ERROS e apenas o aviso A14a de aula-de-prática na L2.
 *   Feed B — INTEGRAL (as duas aulas exatamente como os drafts): a L1 entra com
 *            o desafio 'digite-o-numero-7'. A bateria A13c trata o teste como
 *            lido ANTES da aula: a chamada `resposta()` no teste da L1 (aula
 *            índice 0, sem acumulado anterior) é o 'pecado nº 1' da spec §3.2 —
 *            esperado EXATAMENTE 1 erro A13 (testsCode, node:CallExpression) na
 *            L1, e nada mais além disso.
 *
 * O vereditos dos dois feeds são impressos; o exit code falha se o Feed A tiver
 * ERRO fora do esperado OU o Feed B tiver erro além do único A13c conhecido.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { auditarProgressao, type ProgressaoLessonInput } from '../../../electron/main/engine/quality/progressao';

const here = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(here, '..'); // content-src/programacao-do-zero
const draftsDir = path.join(raiz, 'drafts');

const slugs = ['como-o-site-confere-seu-codigo', 'valor-e-instrucao'] as const;

interface Drafts {
  lesson: any;
  challenge: any;
}

function carregar(slug: string): Drafts {
  return {
    lesson: JSON.parse(fs.readFileSync(path.join(draftsDir, slug, 'lesson-draft.json'), 'utf8')),
    challenge: JSON.parse(fs.readFileSync(path.join(draftsDir, slug, 'challenge-draft.json'), 'utf8')),
  };
}

function entrada(slug: string, d: Drafts, comDesafio: boolean): ProgressaoLessonInput {
  const ref = `modulo-1/${slug}`;
  const baseDir = `modules/modulo-1/lessons/${slug}`;
  return {
    ref,
    baseDir,
    theory: d.lesson.theory,
    declared: {
      productive: d.lesson.introduces.productive,
      receptive: d.lesson.introduces.receptive,
    },
    challenges: comDesafio
      ? [
          {
            slug: d.challenge.slug,
            desafioFile: `${baseDir}/challenges/${d.challenge.slug}/challenge.json`,
            files: [{ path: 'solution.mjs', starter: d.challenge.starterCode, solution: d.challenge.solutionCode }],
            tests: d.challenge.testsCode,
          },
        ]
      : [],
  };
}

function resumir(titulo: string, aulas: ProgressaoLessonInput[]): void {
  const res = auditarProgressao(aulas, { mode: 'declared' });
  const erros = res.violations.filter((v) => v.severidade === 'erro');
  const avisos = res.violations.filter((v) => v.severidade === 'aviso');
  console.log(`\n--- ${titulo} ---`);
  console.log(`ERROS: ${erros.length} | AVISOS: ${avisos.length}`);
  for (const v of res.violations) {
    console.log(
      `  [${v.severidade}] ${v.regra} ref=${v.ref} campo=${v.campo}${v.construcao ? ` construcao=${v.construcao}` : ''}${v.desafioFile ? ` desafio=${v.desafioFile}` : ''} — ${v.mensagem.split('—')[0].slice(0, 90)}`,
    );
  }
  const novos = [...res.novosPorAula.entries()].map(([r, n]) => `${r}=${n}`).join(', ');
  console.log(`Novos (A14a) por aula: ${novos}`);

  // expectativas
  if (titulo.startsWith('Feed A')) {
    const fora = erros.length;
    const avisosFora = avisos.filter(
      (v) => !(v.regra === 'A14a' && v.ref === 'modulo-1/valor-e-instrucao'),
    );
    if (fora !== 0 || avisosFora.length !== 0) {
      console.log(`VEREDITO Feed A: FALHOU (erros=${fora}, avisos fora do esperado=${avisosFora.length})`);
      process.exit(1);
    }
    console.log('VEREDITO Feed A: PASSOU — 0 ERROS, aviso A14a apenas na L2 (aula de prática, esperado)');
  } else {
    const esperado1 = erros.filter(
      (v) => v.regra === 'A13' && v.campo === 'testsCode' && v.construcao === 'node:CallExpression' && v.ref === 'modulo-1/como-o-site-confere-seu-codigo',
    );
    const outros = erros.filter((v) => !esperado1.includes(v));
    if (erros.length !== 1 || esperado1.length !== 1 || outros.length !== 0) {
      console.log('VEREDITO Feed B: FALHOU — erros diferentes do único A13c conhecido na L1');
      process.exit(1);
    }
    console.log('VEREDITO Feed B: documentado — exatamente 1 erro A13c (CallExpression no teste da L1), o "pecado nº 1" da spec §3.2 (tensão curriculo × A13c, decidir na integração)');
  }
}

console.log('=== CHECK 3 — auditarProgressao (bateria A13–A16, modo declared) ===');
const l1 = carregar(slugs[0]);
const l2 = carregar(slugs[1]);

resumir(
  'Feed A (canônico — L1 leitura sem desafio na bateria; L2 com desafio)',
  [entrada(slugs[0], l1, false), entrada(slugs[1], l2, true)],
);
resumir(
  'Feed B (integral — as duas aulas como nos drafts, com desafio)',
  [entrada(slugs[0], l1, true), entrada(slugs[1], l2, true)],
);
console.log('\nFIM — vereditos acima.');
