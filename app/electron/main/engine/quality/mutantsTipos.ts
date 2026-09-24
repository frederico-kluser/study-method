/**
 * app/electron/main/engine/quality/mutantsTipos.ts — o vocabulário do gerador
 * de mutantes (P-20): as quatro classes de defeito e o artefato que o gerador
 * manipula.
 *
 * A prosa normativa vive na fachada `mutants.ts`. Refatoração L04: arquivo
 * ≤500 linhas e toda função com CC≤8, sem mudança de comportamento observável.
 */

import { z } from 'zod';

import { ChallengeDraftSchema } from '../schemas/artifacts';

/** As quatro classes de defeito injetado — o fechado do gerador. */
export type ClasseDeDefeito =
  | 'fora_do_orcamento'
  | 'teste_divergente_do_enunciado'
  | 'imprime_em_vez_de_retornar'
  | 'nao_exercita_a_aula';

/** O enum em runtime — a medição itera sobre ELE, nunca sobre lista solta. */
export const CLASSES_DE_DEFEITO: readonly ClasseDeDefeito[] = [
  'fora_do_orcamento',
  'teste_divergente_do_enunciado',
  'imprime_em_vez_de_retornar',
  'nao_exercita_a_aula',
];

/** O desafio F8 já validado (o artefato da engine, `ChallengeDraftSchema`). */
export type Desafio = z.infer<typeof ChallengeDraftSchema>;

/**
 * O artefato que o gerador (e a calibração) manipulam: o desafio + o que a
 * AULA introduz (`introduces.productive` do draft da aula) — o alvo da
 * classe (d): o desafio só exercita a aula se a solução usar essas
 * construções (J2: `constructs(solution) ∩ introduces.productive ≠ ∅`).
 */
export interface DesafioParaMutacao {
  desafio: Desafio;
  /** construções NOVAS da aula — a EXIGÊNCIA que o desafio tem de exercitar. */
  introducesProductive: readonly string[];
}

/** Um mutante: rótulo da classe + defeito exato + a mutação (função pura). */
export interface Mutante {
  /** id estável dentro da geração (M1..M4). */
  id: string;
  /** a classe de defeito — o rótulo usado na medição por classe. */
  classe: ClasseDeDefeito;
  /** o defeito EXATO injetado, legível (vai para o relatório da medição). */
  defeito: string;
  /** trecho distintivo da injeção (presente no artefato mutado). */
  marcador: string;
  /** aplica a mutação sobre a base, devolvendo o artefato MUTADO (pura). */
  aplicar: (base: DesafioParaMutacao) => DesafioParaMutacao;
}
