/**
 * app/electron/main/engine/runtime/semaphore.ts — os DOIS limitadores de
 * concorrência da engine de trilhas (`docs/16-engine-de-trilha.md` §4.1).
 *
 * O documento exige DOIS semáforos INDEPENDENTES, porque os gargalos são de
 * natureza diferente e um limitador global serializaria a verificação por
 * causa da rede:
 *
 *   SEM_LLM  (rede, default 8)            — limita chamadas de LLM em voo.
 *   SEM_EXEC (spawn de processo, default  — limita `node --test`/spawns de
 *             os.availableParallelism()-1)  processo na F9 (provador).
 *
 * SEM_EXEC não é consumido por este pacote (o spawn vive em P-07 provas de
 * execução); ele é declarado AQUI porque é a única casa comum das duas
 * políticas e a onda 4 espera a constante pronta.
 *
 * Implementação: acquire/release assíncronos com fila FIFO de espera. O
 * limite é validado na criação (0 ou negativo travaria para sempre — fail
 * fast, pois um semáforo que nunca libera slot é pior que um erro de
 * configuração). `active` é exposto para testes observarem o pico real de
 * concorrência.
 */

import { availableParallelism } from 'node:os';

/** Teto de chamadas de LLM em voo — o default do SEM_LLM do plano (§4.1). */
export const DEFAULT_LLM_CONCURRENCY = 8;

/**
 * Teto default do SEM_EXEC: `os.availableParallelism() - 1` — deixa um
 * núcleo livre para o main process. Nunca abaixo de 1 (um spawn mínimo).
 */
export function defaultExecConcurrency(): number {
  return Math.max(1, availableParallelism() - 1);
}

/** Libera um slot adquirido (idempotente: segunda chamada é no-op). */
export type SemaphoreRelease = () => void;

/** Um limitador de concorrência assíncrono. */
export interface Semaphore {
  /** Teto de slots simultâneos (imutável). */
  readonly limit: number;
  /** Slots ocupados AGORA (observável — testes medem o pico por aqui). */
  readonly active: number;
  /**
   * Aguarda até haver slot livre e o ocupa. A promise resolve com a função
   * de liberação; nunca rejeita. A espera é FIFO: quem chega primeiro, sai
   * primeiro (sem starvation).
   */
  acquire(): Promise<SemaphoreRelease>;
}

/**
 * Cria um semáforo com `limit` slots. `limit` precisa ser inteiro ≥ 1 —
 * limite inválido é erro de configuração que deve falhar cedo, nunca
 * deadlockar a onda em silêncio.
 */
export function createSemaphore(limit: number): Semaphore {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`createSemaphore: limit precisa ser inteiro ≥ 1 (recebido ${limit}).`);
  }

  let active = 0;
  const waiters: Array<() => void> = [];

  function makeRelease(): SemaphoreRelease {
    let released = false;
    return () => {
      if (released) return; // idempotente — liberar duas vezes corromperia a contagem
      released = true;
      active -= 1;
      const next = waiters.shift();
      if (next) next();
    };
  }

  return {
    get limit() {
      return limit;
    },
    get active() {
      return active;
    },
    async acquire(): Promise<SemaphoreRelease> {
      if (active < limit) {
        active += 1;
        return makeRelease();
      }
      // Sem slot: entra na fila. Quando um release acorda este waiter, o
      // count ativo é incrementado aqui — exatamente UM waiter por release.
      await new Promise<void>((resolve) => {
        waiters.push(resolve);
      });
      active += 1;
      return makeRelease();
    },
  };
}

/** Semáforo pronto para o SEM_LLM (rede) com o default do plano. */
export function createLlmSemaphore(): Semaphore {
  return createSemaphore(DEFAULT_LLM_CONCURRENCY);
}

/** Semáforo pronto para o SEM_EXEC (spawn) com o default derivado de CPU. */
export function createExecSemaphore(): Semaphore {
  return createSemaphore(defaultExecConcurrency());
}