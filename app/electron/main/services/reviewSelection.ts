/**
 * services/reviewSelection.ts — a SELEÇÃO DE REVISÃO em runtime (a ponte entre
 * o ledger de prática e o gerador de desafios).
 *
 * Pedido do dono, literal: *"os desafios finais da aula englobem conteúdos das
 * aulas anteriores, misturando na prova conhecimentos que ele já possui — ter
 * um controle de modo que o aluno sempre pratique num desafio de aula ou de
 * módulo todo o conhecimento anterior daquele curso"*.
 *
 * O QUE ESTE MÓDULO FAZ: para a aula `<moduleSlug>/<lessonSlug>`, monta o
 * LEDGER DE PRÁTICA PLANEJADA da trilha (cada desafio JÁ ESCRITO pratica os
 * átomos da solução que ele exige — `extractAtoms` sobre a solução de
 * referência) e delega a SELEÇÃO à regra pura `selecionarRevisao`
 * (engine/coverage/practiceLedger.ts): nunca-praticado primeiro, prática mais
 * antiga depois, intercalando aula de origem, com teto de itens.
 *
 * ENTRADA = `LessonBudget.entrada` (tudo que já foi ensinado antes — a mesma
 * régua que o `deriveTrackBudget` deriva, incluindo o que os cursos
 * anteriores da cadeia trouxeram quando a trilha declarar `cursoAnterior`).
 * O que a aula atual introduz NÃO é revisão; o que os desafios da própria aula
 * já cobrem também não (senão o item novo repete o desafio antigo).
 *
 * PLANEJADA vs REAL: este módulo lê a COBERTURA PLANEJADA (conteúdo da trilha).
 * A cobertura REAL do aluno (tentativas) pode ser acrescentada ao mesmo ledger
 * — o formato (`PraticaRegistrada`) é o mesmo, por desenho.
 *
 * Puro de IO pesado: recebe a trilha JÁ CARREGADA; qualquer falha de apuração
 * (parse, linguagem sem adaptador) degrada para SEM item de revisão — nunca
 * para item inventado.
 */
import type { LoadedTrack } from '../content/trackLoader';
import { deriveTrackBudget } from '../engine/budget';
import {
  LEDGER_VAZIO,
  registrarPratica,
  selecionarRevisao,
  type ItemRevisao,
  type KindDePratica,
  type PracticeLedger,
} from '../engine/coverage/practiceLedger';
import { adapterDoDesafio } from '../engine/exec/proofsCore';
import { extractAtoms } from '../engine/extract';
import { challengeReferenceCode } from './moduleMastery';

/** Os átomos que um desafio pratica (a solução de referência é a régua). */
function atomsDoDesafio(
  challenge: { language: string } & Parameters<typeof challengeReferenceCode>[0],
): string[] {
  try {
    const adapterId = adapterDoDesafio(challenge.language).id;
    const result = extractAtoms(challengeReferenceCode(challenge), {
      fileName: 'desafio#referencia',
      language: adapterId,
    });
    return result.ok ? [...result.keys] : [];
  } catch {
    return [];
  }
}

/**
 * O ledger PLANEJADO da trilha: cada desafio escrito até `posLimite` (posição
 * pedagógica) pratica os átomos da solução que ele exige. `positions` é o mapa
 * ref → posição do orçamento (quem tem o `deriveTrackBudget` na mão passa).
 */
export function plannedPracticeLedger(
  track: LoadedTrack,
  positions: ReadonlyMap<string, number>,
  posLimite: number,
): PracticeLedger {
  let ledger = LEDGER_VAZIO;
  for (const mod of track.modules) {
    for (const lesson of mod.lessons) {
      const budgetRef = `${mod.meta.slug}/${lesson.meta.slug}`;
      const pos = positions.get(budgetRef) ?? null;
      for (const challenge of lesson.challenges) {
        if (pos === null || pos >= posLimite) continue;
        ledger = registrarPratica(ledger, {
          ref: budgetRef,
          kind: 'aula',
          pos,
          atoms: atomsDoDesafio(challenge),
        });
      }
    }
    // o desafio do MÓDULO pratica depois da última aula dele (kind 'modulo').
    const modChallenge = mod.challenge;
    if (modChallenge !== null) {
      const ultima = mod.lessons[mod.lessons.length - 1];
      const posUltima =
        ultima === undefined ? null : (positions.get(`${mod.meta.slug}/${ultima.meta.slug}`) ?? null);
      if (posUltima !== null && posUltima + 1 < posLimite) {
        ledger = registrarPratica(ledger, {
          ref: mod.meta.slug,
          kind: 'modulo',
          pos: posUltima + 1,
          atoms: atomsDoDesafio(modChallenge),
        });
      }
    }
  }
  return ledger;
}

/**
 * A seleção de revisão para os testes do próximo desafio da aula. Devolve
 * `[]` quando nada pode ser apurado (a regra "sem item inventado").
 */
export function buildReviewSelection(
  track: LoadedTrack,
  moduleSlug: string,
  lessonSlug: string,
  limite = 4,
): ItemRevisao[] {
  const budget = deriveTrackBudget(track);
  const positions = new Map(budget.lessons.map((l) => [l.ref, l.index]));
  const ref = `${moduleSlug}/${lessonSlug}`;
  const atual = budget.byRef.get(ref);
  if (atual === undefined) return [];
  // "Conhecimento anterior daquele curso" = o que uma aula ANTERIOR ENSINOU
  // **a escrever** (`entrada.productive`): átomo só-receptivo ("sabe ler") não
  // pode ser exigido no solutionCode — o audit A2 reprova (a armadilha medida
  // `api:.y` do rust-iniciante, campanha 2026-09-27). O axioma de entrada
  // (estruturais + harness) e o que só vem DEPOIS não são revisão:
  // `firstTaughtIn` dá o primeiro ensino, `positions` dá a ordem.
  const entrada = [...atual.entrada.productive].filter((a) => {
    const origemRef = budget.firstTaughtIn.get(a);
    const posOrigem = origemRef === undefined ? undefined : positions.get(origemRef);
    return posOrigem !== undefined && posOrigem < atual.index;
  });
  const introduzidos = [...atual.introduces.receptive, ...atual.introduces.productive];
  // o que os desafios DA PRÓPRIA aula já cobrem (não repetir o desafio antigo)
  const jaCobertos: string[] = [];
  for (const mod of track.modules) {
    for (const lesson of mod.lessons) {
      if (`${mod.meta.slug}/${lesson.meta.slug}` !== ref) continue;
      for (const challenge of lesson.challenges) jaCobertos.push(...atomsDoDesafio(challenge));
    }
  }
  return selecionarRevisao({
    entrada,
    introduzidos,
    jaCobertos,
    ledger: plannedPracticeLedger(track, positions, atual.index),
    origemDe: budget.firstTaughtIn,
    posAtual: atual.index,
    limite,
  });
}

/** Reexporta o vocabulário do ledger para os consumidores de runtime. */
export type { ItemRevisao, KindDePratica, PracticeLedger };
