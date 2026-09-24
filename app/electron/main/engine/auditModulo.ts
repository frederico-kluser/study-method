/**
 * app/electron/main/engine/auditModulo.ts — o DESAFIO DE MÓDULO, medido contra
 * o orçamento de saída da ÚLTIMA aula do módulo. Extraído do módulo `audit.ts`
 * original na refatoração do lote L05 sem NENHUMA mudança de comportamento.
 */

import type { LoadedTrack } from '../content/trackLoader';
import { axisOf, type AtomKey } from './atomKeys';
import type { LessonBudget } from './budget';
import { extractAtoms } from './extract';
import { messageFor, mensagemDeParse } from './auditMensagens';
import { allowedFor, challengeSurfaces, chavesDeStarter } from './auditSuperficies';
import type { EstadoDaAuditoria } from './auditAula';
import type { Surface, Violation } from './auditTypes';

/**
 * O BURACO QUE ISTO FECHA, medido em 2026-09-22. O `track:validate` PROVA o
 * desafio de módulo por execução desde a rodada 9 (`tools/track-cli.ts`, o
 * ramo `if (mod.challenge)`), mas este audit NUNCA o mediu contra o orçamento:
 * a caminhada de aula é `budget.lessons` → `lesson.challenges`, e o desafio do
 * módulo não pertence a aula nenhuma. Resultado medido nos três cursos: o
 * `c-iniciante` tinha 4 dos 6 desafios de módulo cobrando construção fora do
 * orçamento — `op:binary:>` (que o curso ensina RECEPTIVA e nunca autoriza a
 * escrever), `op:binary:!=` e `op:unary:-` (ensinadas no módulo SEGUINTE) —
 * enquanto o placar dizia 0 violações. É o defeito central do produto ("nunca
 * cobrar o que não foi ensinado") na MAIOR prova de cada módulo.
 *
 * O ORÇAMENTO QUE VALE é o de SAÍDA da última aula do módulo, e é o único
 * defensável: é exatamente o que o aluno tem na mão quando chega no desafio
 * de módulo. O desafio de módulo não tem `introduces` (não é aula), logo não
 * legaliza nada por conta própria — o `saida = entrada ∪ introduces` do
 * `budget.ts:281` não tem onde agir aqui, e é por isso que este gate não
 * podia ser dispensado.
 *
 * A ASSIMETRIA DAS SUPERFÍCIES é a mesma do §5.1 (A1 starter ⊆ receptivo,
 * A2 solução ⊆ produtivo, A3 testes ⊆ receptivo de ENTRADA), com a MESMA
 * subtração do diff starter → solução: o que o starter já traz não se cobra
 * do aluno. Um módulo sem aula nenhuma não é medido (não há orçamento) e sai
 * em `limitacoes` pela via normal do loader.
 */
export function auditarDesafiosDeModulo(estado: EstadoDaAuditoria, track: LoadedTrack): void {
  const { budget, adapterId, violations } = estado;
  for (const mod of track.modules) {
    if (!mod.challenge) continue;
    estado.desafiosDeModulo += 1;
    const doModulo = budget.lessons.filter((l) => l.moduleSlug === mod.meta.slug);
    const ultima = doModulo[doModulo.length - 1];
    if (ultima === undefined) continue;
    const ref = `${mod.meta.slug}/module`;
    const challengeFile = `modules/${mod.meta.slug}/challenges/${mod.challenge.slug}/challenge.json`;
    const antes = violations.length;
    const superficies = challengeSurfaces(mod.challenge);

    const doStarter = chavesDeStarter(superficies, challengeFile, adapterId);

    for (const spec of superficies) {
      auditarSuperficieDoModulo(estado, ultima, ref, challengeFile, spec, doStarter);
    }
    if (violations.length > antes) estado.desafiosComViolacao.add(challengeFile);
  }
}

/** Uma superfície do desafio de módulo — sem DEC e sem A11 (ver `auditarAula`). */
function auditarSuperficieDoModulo(
  estado: EstadoDaAuditoria,
  ultima: LessonBudget,
  ref: string,
  challengeFile: string,
  spec: { surface: Surface; code: string; label: string },
  doStarter: ReadonlySet<AtomKey>,
): void {
  const { surface, code, label } = spec;
  if (code.trim().length === 0) return;
  const result = extractAtoms(code, {
    fileName: `${challengeFile}#${label}`,
    language: estado.adapterId,
    surface,
  });
  if (!result.ok) {
    estado.violations.push({
      regra: 'A2',
      arquivo: challengeFile,
      ref,
      campo: surface,
      linha: result.error.line,
      coluna: result.error.column,
      construcao: null,
      eixo: null,
      faixa: null,
      trechoOfensor: label,
      primeiraAulaQueEnsina: null,
      mensagem: mensagemDeParse(label, estado.adapterId, result.error),
    });
    return;
  }
  const { set, faixa, rule } = allowedFor(surface, ultima);
  for (const occ of result.occurrences) {
    // SEM DEC e SEM A11 aqui — diferenças DECLARADAS em relação ao desafio de
    // aula (`auditarAula`): o desafio de módulo mede só o orçamento da
    // superfície, com a subtração do starter e o sufixo de módulo na mensagem.
    if (set.has(occ.key)) continue;
    if (surface === 'solutionCode' && doStarter.has(occ.key)) continue;
    const taughtIn = estado.budget.firstTaughtIn.get(occ.key) ?? null;
    estado.violations.push({
      regra: rule,
      arquivo: challengeFile,
      ref,
      campo: surface,
      linha: occ.line,
      coluna: occ.column,
      construcao: occ.key,
      eixo: axisOf(occ.key),
      faixa,
      trechoOfensor: occ.snippet,
      primeiraAulaQueEnsina: taughtIn,
      mensagem: `${messageFor(occ.key, taughtIn, ultima.ref, surface)} — e este é o DESAFIO DE MÓDULO, cujo orçamento é o de saída de \`${ultima.ref}\`, a última aula do módulo`,
    });
  }
}
