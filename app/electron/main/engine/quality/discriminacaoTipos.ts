/**
 * app/electron/main/engine/quality/discriminacaoTipos.ts — o contrato público
 * da cláusula J5 (Discriminação): entradas, vereditos, placar e relatório.
 *
 * A prosa normativa vive na fachada `discriminacao.ts`. Refatoração L04:
 * arquivo ≤500 linhas e toda função com CC≤8, sem mudança de comportamento.
 */

import type { AtomKey } from '../atomKeys';
import type { LanguageId } from '../lang/registry';
import type { MinimalVerdict } from './minimal';

/**
 * O veredito do sintetizador mínimo como este módulo o consome.
 *
 * É `MinimalVerdict` OU a forma não-ok que o `coverage`/`revise` já usam para
 * "desafio fora do escopo do sintetizador" (`IGNORADO`, multi-arquivo). Aceitar
 * as duas evita que o chamador tenha de inventar um veredito falso para o caso
 * que ele já sabe classificar.
 */
export type VereditoMinimo = MinimalVerdict | { ok: false; reason: string; detail?: string };

/** A entrada de UM desafio. Tudo o que o chamador já tem em mãos. */
export interface DesafioParaDiscriminacao {
  /** `<moduleSlug>/<lessonSlug>/<challengeSlug>` — a ref do `coverage`. */
  ref: string;
  /**
   * `<moduleSlug>/<lessonSlug>` da aula dona do orçamento, ou `null` para
   * desafio de módulo/proficiência (que não tem aula e por isso não tem alvo).
   */
  lessonRef: string | null;
  /** a solução de referência do desafio. */
  solutionCode: string;
  /**
   * `introduces.productive` da aula — as construções-ALVO, o que esta aula
   * ensina a ESCREVER. Vazio ⇒ não há o que discriminar (status `sem-alvo`).
   */
  alvos: readonly AtomKey[];
  /** o veredito do sintetizador mínimo para ESTE desafio. */
  minimal: VereditoMinimo;
}

/**
 * O veredito de discriminação de um desafio.
 *
 *   `discrimina`     — todo alvo presente na solução também está no mínimo;
 *   `nao-discrimina` — ao menos um alvo está na solução e NÃO no mínimo (AVISO);
 *   `sem-alvo`       — a aula não declara `introduces.productive` (ou o desafio
 *                      não é de aula): não há o que discriminar;
 *   `nao-medido`     — o mínimo não foi provado ou a solução não parseia
 *                      (fail-closed: nunca conta como `discrimina`).
 */
export type StatusDeDiscriminacao = 'discrimina' | 'nao-discrimina' | 'sem-alvo' | 'nao-medido';

export interface DiscriminacaoDeDesafio {
  ref: string;
  lessonRef: string | null;
  status: StatusDeDiscriminacao;
  /** `introduces.productive` da aula (sorted, únicos). */
  alvos: AtomKey[];
  /** alvos que a SOLUÇÃO de referência de fato usa (é o que A6/J2 exige). */
  alvosNaSolucao: AtomKey[];
  /** alvos declarados que nem a solução usa — sinal de A6/J2, não de J5. */
  alvosForaDaSolucao: AtomKey[];
  /** alvos na solução que o CÓDIGO MÍNIMO também precisa ter: o teste os força. */
  discriminados: AtomKey[];
  /** alvos na solução AUSENTES do código mínimo: o teste NÃO os força (AVISO). */
  naoDiscriminados: AtomKey[];
  /** o código mínimo que passa no teste, quando houve veredito ok. */
  minimalCode: string | null;
  /** átomos do código mínimo (`atoms(minimal)`), vazio quando não medido. */
  atomsDoMinimo: AtomKey[];
  /** frase em pt-BR determinística — sempre presente, sempre derivada. */
  motivo: string;
}

export interface PlacarDeDiscriminacao {
  desafios: number;
  /** desafios com alvo e mínimo provado — a base de qualquer conclusão. */
  medidos: number;
  /** fail-closed: mínimo não provado / solução não parseia. */
  naoMedidos: number;
  /** sem `introduces.productive` (ou sem aula dona). */
  semAlvo: number;
  discriminam: number;
  naoDiscriminam: number;
  /** soma de `alvosNaSolucao` sobre os desafios MEDIDOS. */
  alvosMedidos: number;
  alvosDiscriminados: number;
  alvosNaoDiscriminados: number;
  /** aulas distintas com ao menos um alvo não discriminado. */
  aulasComAlvoNaoDiscriminado: number;
  /** aulas distintas com ao menos um desafio medido. */
  aulasMedidas: number;
}

export interface RelatorioDeDiscriminacao {
  trilha: string;
  linguagem: LanguageId;
  /**
   * CONGELADO em `'aviso'` (ver o cabeçalho). Existe como campo para que a
   * saída DECLARE a classificação em vez de deixá-la implícita em quem lê.
   */
  classificacao: 'aviso';
  desafios: DiscriminacaoDeDesafio[];
  placar: PlacarDeDiscriminacao;
  /**
   * As limitações desta medição, em pt-BR — `docs/16` §9.2 ("toda limitação é
   * declarada na saída, nunca omitida") e `CONTRIBUTING.md` ("cada gate imprime
   * as suas no resumo").
   */
  limitacoes: string[];
}

export interface AvaliarDiscriminacaoOptions {
  /** a linguagem da trilha (`budget.adapterId`). Default: o adaptador default. */
  language?: LanguageId;
  /** nome de arquivo usado nas mensagens do extrator. Default: por linguagem. */
  fileNameDaSolucao?: string;
}
