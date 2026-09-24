/**
 * app/electron/main/engine/quality/minimalTipos.ts — o contrato público do
 * sintetizador mínimo de JavaScript: contexto, veredito (fail-closed),
 * literais extraídos do teste e o lote com semáforo.
 *
 * A prosa normativa vive na fachada `minimal.ts`. Refatoração L04: arquivo
 * ≤500 linhas e toda função com CC≤8, sem mudança de comportamento observável.
 */

import type { AtomKey } from '../atomKeys';
import type { LanguageId } from '../lang/registry';
import type { Semaphore } from '../runtime/semaphore';

export interface MinimalCtx {
  starterCode: string;
  solutionCode: string;
  testsCode: string;
  expectedTestCount: number;
  /**
   * ADITIVO (onda 5): a linguagem do desafio. Default: o adaptador default.
   * Qualquer outra LANÇA — ver "JAVASCRIPT-ONLY" no cabeçalho.
   */
  language?: LanguageId;
}

export type MinimalVerdict =
  | {
      ok: true;
      /** o código mínimo (módulo ESM completo) que passou nas quatro provas. */
      minimalCode: string;
      /** o que o teste REALMENTE cobra — `extractAtoms(minimalCode).keys`. */
      atoms: AtomKey[];
      /** enriquecimento: átomos do trecho do teste que chama a função-alvo. */
      atomsDoTeste: AtomKey[];
      /** nº de linhas do código mínimo. */
      lines: number;
      /** sempre true por construção (o vencedor passou nas provas). */
      proofsValid: boolean;
    }
  | {
      ok: false;
      reason: 'SEM_SOLUCAO_ACESSIVEL' | 'PARSE_FALHOU' | 'PROVER_FALHOU';
      detail?: string;
    };

/**
 * Um assert extraído do teste. `esperado` é o texto SERIALIZADO do literal do
 * lado direito (`7`, `'oi'`, `[1, 2]`, `{ a: 1 }`) — null quando o lado direito
 * não é literal. `argumentos` carrega o texto serializado de cada argumento
 * literal da chamada (null quando o argumento não é literal).
 */
export interface LiteralExtraido {
  /** método do assert: equal | strictEqual | deepEqual | deepStrictEqual | ok | throws. */
  assert: string;
  /** nome da função chamada (callee identificador do primeiro argumento). */
  funcao: string | null;
  /** lado direito do assert, serializado — null quando não é literal. */
  esperado: string | null;
  /** argumentos literais da chamada, serializados (null = argumento não literal). */
  argumentos: Array<string | null>;
  /** texto cru do nó do assert (descrição determinística). */
  trecho: string;
}

export interface LiteraisDoTeste {
  /** funções que o teste importa do módulo do aluno (solution.mjs). */
  funcoesAlvo: string[];
  /** asserts do teste, na ordem de aparição. */
  literais: LiteralExtraido[];
}

export type ExtrairLiteraisResult =
  | { ok: true; dados: LiteraisDoTeste }
  | { ok: false; error: string };

/** Opções do lote de síntese mínima. */
export interface OpcoesDeLote {
  /**
   * Teto de sínteses SIMULTÂNEAS (default: `defaultExecConcurrency()` =
   * `availableParallelism()-1` — o mesmo teto do SEM_EXEC, §4.1). Cada
   * síntese roda candidatos pelo prover (spawns `node --test` na produção).
   */
  concorrencia?: number;
  /** Semáforo injetável (a suíte observa o pico de concorrência por aqui) — VENCE `concorrencia`. */
  semaforo?: Semaphore;
}
