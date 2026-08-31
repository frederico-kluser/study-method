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
 *            o desafio 'digite-o-numero-7'. A bateria A13c usa a fórmula da
 *            spec §3.2 — inclui a teoria DA MESMA aula no conjunto demonstrado
 *            (Demo(i) ∪ Cum(i)); a seção 1 da L1 demonstra `resposta()` e o
 *            teste dela a chama, então o feee passa SEM o "pecado nº 1" (a
 *            chamada sem NENHUMA demonstração em lugar nenhum continua sendo
 *            erro — engineProgressao.test.ts caso 1). Antes do fix e2-bateria
 *            este Feed B acusava exatamente 1 erro A13c aqui e o script o
 *            documentava como esperado — era o DEFEITO A13c (autor da L1).
 *
 * Os vereditos dos dois feeds são impressos; o exit code falha se QUALQUER
 * feed tiver ERRO fora do esperado (esperado: zero erros nos dois).
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

  // expectativas — AMBOS os feeds: 0 ERROS; avisos só o A14a da aula de
  // prática (valor-e-instrucao). O mesmo veredito para o Feed B porque a
  // bateria A13c alinhada à spec §3.2 inclui a teoria DA MESMA aula.
  const fora = erros.length;
  const avisosFora = avisos.filter(
    (v) => !(v.regra === 'A14a' && v.ref === 'modulo-1/valor-e-instrucao'),
  );
  if (fora !== 0 || avisosFora.length !== 0) {
    console.log(`VEREDITO ${titulo}: FALHOU (erros=${fora}, avisos fora do esperado=${avisosFora.length})`);
    process.exit(1);
  }
  console.log(`VEREDITO ${titulo}: PASSOU — 0 ERROS, aviso A14a apenas na L2 (aula de prática, esperado)`);
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
