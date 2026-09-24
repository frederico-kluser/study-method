/**
 * app/electron/main/engine/quality/progressaoRegrasAvanco.ts — a PROGRESSIVIDADE
 * e a primeira atividade da bateria A13–A16 (A15a intra-aula, A15b inter-aula
 * e A16 primeira-atividade).
 *
 * A prosa normativa (a fórmula de cada regra e as mensagens da spec) vive na
 * fachada `progressao.ts`. Refatoração L04: arquivo ≤500 linhas e toda função
 * com CC≤8, sem mudança de comportamento observável.
 */

import type { AtomKey } from '../atomKeys';
import { axisOf, humanLabel } from '../atomKeys';
import { extractAllOccurrences } from '../extract';
import type { LanguageId } from '../lang/registry';
import { AVISO13, H13_SET } from './progressaoVocab';
import type {
  ProgressaoDesafioInput,
  ProgressaoLessonInput,
  ProgressaoViolation,
} from './progressaoTipos';
import { type DemoDaAula, tamanhoDaInterseccao } from './progressaoDemo';

// ---------------------------------------------------------------------------
// A15a / A15b / A16 — a progressividade e a primeira atividade
// ---------------------------------------------------------------------------

/** As chaves de cada solução de desafio da aula. */
export function solucoesDosDesafios(
  aula: ProgressaoLessonInput,
  adapterId: LanguageId,
): Set<AtomKey>[] {
  return aula.challenges.map((desafio) => {
    const keys = new Set<AtomKey>();
    for (const arquivo of desafio.files) {
      const r = extractAllOccurrences(arquivo.solution, { language: adapterId });
      if (r.ok) for (const occ of r.occurrences) keys.add(occ.key);
    }
    return keys;
  });
}

/** O degrau reusa algo do anterior (boilerplate estrutural/H13 não conta)? */
function temReuso(
  solK: ReadonlySet<AtomKey>,
  anteriorAcumulado: ReadonlySet<AtomKey>,
): boolean {
  // Boilerplate ESTRUTURAL/H13 (Identifier, Block, StringLiteral…) não conta
  // como reuso — senão TODO degrau "reusaria" Identifier e a regra vira letra
  // morta (spec §5.5).
  for (const chave of solK) {
    if (H13_SET.has(chave)) continue;
    if (anteriorAcumulado.has(chave)) return true;
  }
  return false;
}

/** Os átomos do degrau que NÃO são do anterior nem demonstrados (o teto é 1). */
function novosNaoDemonstradosDe(
  solK: ReadonlySet<AtomKey>,
  anteriorAcumulado: ReadonlySet<AtomKey>,
  demo: ReadonlySet<AtomKey>,
  cum: ReadonlySet<AtomKey>,
): Set<AtomKey> {
  const novosNaoDemonstrados = new Set<AtomKey>();
  for (const chave of solK) {
    if (anteriorAcumulado.has(chave)) continue;
    if (demo.has(chave) || cum.has(chave) || H13_SET.has(chave)) continue;
    novosNaoDemonstrados.add(chave);
  }
  return novosNaoDemonstrados;
}

/** Um degrau (k ≥ 1) dentro da aula: reuso do anterior + teto de 1 novo. */
function checarDegrau(
  aula: ProgressaoLessonInput,
  k: number,
  solucoes: readonly Set<AtomKey>[],
  anteriorAcumulado: Set<AtomKey>,
  demo: ReadonlySet<AtomKey>,
  cum: ReadonlySet<AtomKey>,
): ProgressaoViolation[] {
  const out: ProgressaoViolation[] = [];
  const solK = solucoes[k];
  if (!temReuso(solK, anteriorAcumulado)) {
    out.push({
      regra: 'A15a',
      arquivo: aula.challenges[k].desafioFile,
      ref: aula.ref,
      campo: 'solutionCode',
      linha: 1,
      coluna: 1,
      construcao: null,
      eixo: null,
      faixa: 'productive',
      trechoOfensor: aula.challenges[k].slug,
      primeiraAulaQueEnsina: null,
      severidade: 'erro',
      mensagem:
        `o desafio "${aula.challenges[k].slug}" da aula \`${aula.ref}\` não usa NENHUM átomo do desafio anterior da própria aula — ` +
        'sem degrau, sem reuso; o aluno não exercita o que acabou de fazer (A15a)',
      desafioFile: aula.challenges[k].desafioFile,
    });
  }
  // teto do degrau: no máximo 1 átomo NÃO demonstrado adicionado
  const novosNaoDemonstrados = novosNaoDemonstradosDe(solK, anteriorAcumulado, demo, cum);
  if (novosNaoDemonstrados.size > 1) {
    out.push({
      regra: 'A15a',
      arquivo: aula.challenges[k].desafioFile,
      ref: aula.ref,
      campo: 'solutionCode',
      linha: 1,
      coluna: 1,
      construcao: null,
      eixo: null,
      faixa: 'productive',
      trechoOfensor: [...novosNaoDemonstrados].join(', '),
      primeiraAulaQueEnsina: null,
      severidade: 'erro',
      mensagem:
        `o degrau para o desafio "${aula.challenges[k].slug}" da aula \`${aula.ref}\` adiciona ${novosNaoDemonstrados.size} construções NÃO demonstradas em teoria (${[...novosNaoDemonstrados].join(', ')}) — ` +
        'no máximo 1 por degrau; "aula inteira nova" no meio do caminho quebra a progressividade (A15a)',
      desafioFile: aula.challenges[k].desafioFile,
    });
  }
  for (const chave of solucoes[k - 1]) anteriorAcumulado.add(chave);
  return out;
}

/** ── A15a — degrau INTRA-aula (com ≥ 2 desafios) ──────────────────────── */
export function checarA15a(
  aula: ProgressaoLessonInput,
  demo: ReadonlySet<AtomKey>,
  cum: ReadonlySet<AtomKey>,
  adapterId: LanguageId,
): ProgressaoViolation[] {
  if (aula.challenges.length < 2) return [];
  const solucoes = solucoesDosDesafios(aula, adapterId);
  const out: ProgressaoViolation[] = [];
  // A15a (off-by-one corrigido — ver verif/probe-a15a-off-by-one.mts):
  // `anteriorAcumulado` começa com a solução do 1º desafio, ANTES do loop.
  // Antes, ele só recebia `solucoes[k-1]` no FIM da iteração: em k=1 o
  // conjunto estava VAZIO e o 2º desafio violava "sem reuso" SEMPRE, mesmo
  // com solução IDÊNTICA à do 1º (spec §5.5 — o degrau reusa o anterior).
  const anteriorAcumulado = new Set<AtomKey>(solucoes[0]);
  for (let k = 1; k < aula.challenges.length; k += 1) {
    out.push(...checarDegrau(aula, k, solucoes, anteriorAcumulado, demo, cum));
  }
  return out;
}

/** As chaves usadas nas soluções de TODOS os desafios da aula. */
function solucoesDaAula(aula: ProgressaoLessonInput, adapterId: LanguageId): Set<AtomKey> {
  const solucoes = new Set<AtomKey>();
  for (const desafio of aula.challenges) {
    for (const arquivo of desafio.files) {
      const r = extractAllOccurrences(arquivo.solution, { language: adapterId });
      if (r.ok) for (const occ of r.occurrences) solucoes.add(occ.key);
    }
  }
  return solucoes;
}

/** O que é reusável de verdade (fora do boilerplate H13). */
function naoEstruturaisDe(reusaveis: ReadonlySet<AtomKey>): Set<AtomKey> {
  const naoEstruturais = new Set<AtomKey>();
  for (const k of reusaveis) if (!H13_SET.has(k)) naoEstruturais.add(k);
  return naoEstruturais;
}

/** ── A15b — arco INTEr-aula (i ≥ 1; a aula 1 é o axioma) ──────────────── */
export function checarA15b(
  aula: ProgressaoLessonInput,
  i: number,
  demos: readonly DemoDaAula[],
  cum: ReadonlySet<AtomKey>,
  adapterId: LanguageId,
  predecessorImediato: boolean,
  minimoReuso: number,
): ProgressaoViolation[] {
  if (i < 1) return [];
  const solucoes = solucoesDaAula(aula, adapterId);
  const reusaveis = predecessorImediato ? demos[i - 1].chaves : cum;
  const naoEstruturais = naoEstruturaisDe(reusaveis);
  if (naoEstruturais.size > 0 && tamanhoDaInterseccao(solucoes, naoEstruturais) < minimoReuso) {
    return [
      {
        regra: 'A15b',
        arquivo: `${aula.baseDir}/lesson.json`,
        ref: aula.ref,
        campo: 'lesson',
        linha: 1,
        coluna: 1,
        construcao: null,
        eixo: null,
        faixa: 'productive',
        trechoOfensor: [...solucoes].sort().join(', '),
        primeiraAulaQueEnsina: null,
        severidade: 'erro',
        mensagem:
          `o desafio da aula \`${aula.ref}\` não reutiliza NENHUM átomo demonstrado em aulas anteriores — ` +
          'não há progressão nem recuperação espaçada (§7.1.12); inclua uma construção antiga no cenário (retrieval)',
      },
    ];
  }
  return [];
}

/** O que o aluno ESCREVE no 1º desafio (Escrito(1º desafio)). */
function escritoNoPrimeiroDesafio(
  primeiro: ProgressaoDesafioInput,
  adapterId: LanguageId,
): Set<AtomKey> {
  const escrito = new Set<AtomKey>();
  for (const arquivo of primeiro.files) {
    const rSol = extractAllOccurrences(arquivo.solution, { language: adapterId });
    if (!rSol.ok) continue; // solução que não parseia: o teach group já reporta
    const rStarter = extractAllOccurrences(arquivo.starter, { language: adapterId });
    const starterKeys = rStarter.ok ? new Set(rStarter.keys) : new Set<AtomKey>();
    for (const occ of rSol.occurrences) {
      if (!starterKeys.has(occ.key)) escrito.add(occ.key);
    }
  }
  return escrito;
}

/** A mensagem A16 — muda só onde a construção foi demonstrada TARDE. */
function mensagemA16(
  aula: ProgressaoLessonInput,
  k: AtomKey,
  primeiroRef: string,
  secao: { index: number; titulo: string } | undefined,
): string {
  return secao !== undefined
    ? `o PRIMEIRO desafio de \`${aula.ref}\` exige ${humanLabel(k)}, demonstrado só na seção "${secao.titulo}" — a primeira atividade do aluno tem de ser resolvível com a seção inicial + material anterior (§7.1.2). Adiante a demonstração ou troque o desafio inicial`
    : `o PRIMEIRO desafio de \`${aula.ref}\` exige ${humanLabel(k)}, demonstrado só em \`${primeiroRef}\` — a primeira atividade do aluno tem de ser resolvível com a seção inicial + material anterior (§7.1.2). Adiante a demonstração ou troque o desafio inicial`;
}

/** ── A16 — primeira atividade resolvível com a seção inicial ──────────── */
export function checarA16(
  aula: ProgressaoLessonInput,
  i: number,
  demos: readonly DemoDaAula[],
  cum: ReadonlySet<AtomKey>,
  adapterId: LanguageId,
  primeiraDemonstracao: ReadonlyMap<AtomKey, string>,
): ProgressaoViolation[] {
  const primeiro = aula.challenges[0];
  if (primeiro === undefined) return [];
  const out: ProgressaoViolation[] = [];
  const escrito = escritoNoPrimeiroDesafio(primeiro, adapterId);
  for (const k of escrito) {
    if (demos[i].primeiraSecao.has(k) || cum.has(k) || H13_SET.has(k)) continue;
    // Derivação (spec §6.1/§6.2): o sinal ÚNICO do A16 é "demonstrado TARDE
    // demais para a primeira atividade" — a construção existe em alguma aula,
    // mas não na seção inicial nem no cumulativo. Construção NUNCA demonstrada
    // em lugar nenhum já é o sinal do A13 (lacuna de currículo) — flagar de
    // novo aqui duplicaria a mesma falha e inflaria o placar sem informação
    // nova. As violações medidas pela spec no §6.2 são todas de átomos
    // demonstrados nas seções posteriores da PRÓPRIA aula.
    const primeiroRef = primeiraDemonstracao.get(k);
    if (primeiroRef === undefined) continue;
    const secao = demos[i].secaoDe.get(k);
    out.push({
      regra: 'A16',
      arquivo: primeiro.desafioFile,
      ref: aula.ref,
      campo: 'solutionCode',
      linha: 1,
      coluna: 1,
      construcao: k,
      eixo: axisOf(k),
      faixa: 'productive',
      trechoOfensor: k,
      primeiraAulaQueEnsina: primeiroRef,
      // D4 (§8.2 da spec): valores/termos explicáveis em prosa sem bloco js
      // viram aviso TAMBÉM no A16 (undefined/null etc.) — erro só no sinal
      // real de construção (if/typeof/!/await/Array.isArray…)
      severidade: AVISO13.has(k) ? 'aviso' : 'erro',
      mensagem: mensagemA16(aula, k, primeiroRef, secao),
      desafioFile: primeiro.desafioFile,
    });
  }
  return out;
}
