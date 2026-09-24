/**
 * app/electron/main/engine/runtime/schedulerTipos.ts — CONTRATOS e erro
 * estruturado do escalonador de tarefas da engine (pacote P-02).
 *
 * EXTRAÍDO de `runtime/scheduler.ts` na refatoração L06 (arquivo ≤500 linhas,
 * CC≤8; comportamento observável preservado). O caminho PÚBLICO continua
 * `runtime/scheduler.ts` — fachada fina que reexporta daqui e dos irmãos
 * (`schedulerValidate.ts`, `schedulerReduce.ts`, `schedulerRun.ts`).
 *
 * Contrato normativo: `docs/16-engine-de-trilha.md` §4.1 (regras de
 * paralelismo) e §3.4.
 *
 * CONTRATO DO LIMITADOR (P-27 — unificado com `runtime/semaphore.ts` do P-01):
 *   - protocolo ÚNICO em toda a engine: `{ acquire(): Promise<() => void> }`
 *     — o `acquire` espera a vaga e resolve com a FUNÇÃO DE LIBERAÇÃO; não
 *     existe `release()` como método próprio (o P-01 define `Semaphore`/
 *     `createSemaphore` e `RateLimiter` aqui é ALIAS do mesmo protocolo);
 *   - a liberação é IDEMPOTENTE (liberar a mesma vaga duas vezes é no-op —
 *     garantia do P-01); o scheduler libera EXATAMENTE uma vez, no `finally`
 *     de cada tarefa;
 *   - a espera é FIFO (P-01) — quem chega primeiro, sai primeiro.
 *
 *   CAVEAT DE DEADLOCK (P-27, medido pela testing subwave da onda 1):
 *   compartilhar UM MESMO objeto semáforo entre os limiters do `runWave` E o
 *   transporte de LLM (SEM_LLM do `callLlm`) é SEGURO apenas quando o executor
 *   da tarefa NÃO chama o transporte DENTRO do slot: cada tarefa em voo segura
 *   o slot do limiter do pool e, se o executor pedir uma chamada de LLM que
 *   precisa de OUTRO slot do MESMO pool, ninguém libera — DEADLOCK.
 *   REGRA DE PRODUÇÃO: pools SEPARADOS — um semáforo para os limiters do
 *   scheduler e OUTRO para o SEM_LLM do transporte — sempre que o executor de
 *   tarefa chamar o transporte dentro do slot; NUNCA o mesmo objeto semáforo
 *   para ambos com chamadas aninhadas.
 *
 * FAIL-CLOSED: todo erro de configuração é um `SchedulerError` ESTRUTURADO
 * (`code` + `details` + mensagem), lançado ANTES de a onda rodar — nunca log
 * silencioso (regra dura 1 do plano).
 */

import type { Task, TaskId, TaskResource } from './task';

// ---------------------------------------------------------------------------
// Contratos injetados
// ---------------------------------------------------------------------------

/**
 * Limitador de concorrência de UM recurso — protocolo UNIFICADO com o P-01
 * (`runtime/semaphore.ts`): `acquire` resolve com a função de liberação
 * (release vem do acquire, NUNCA um método próprio) e a liberação é
 * IDEMPOTENTE (liberar duas vezes é no-op — garantia do P-01).
 *
 * DECISÃO P-27 (menos quebra): o NOME `RateLimiter` é mantido como ALIAS do
 * protocolo — `RateLimiters`/`SchedulerEnv` e quem importa o tipo por nome
 * não mudam; só a FORMA seguiu o P-01. Quem implementa um limiter injetado
 * passa a devolver o release no acquire: o protocolo antigo
 * `{ acquire(): Promise<void>; release(): void }` NÃO é assignable — a
 * mudança é compile-time (há compile-proof com `@ts-expect-error` na suíte).
 */
export type RateLimiter = {
  /** Espera até haver vaga e a ocupa. Resolve com a função de liberação. */
  acquire(): Promise<() => void>;
};

/** Um limitador por recurso — tarefas de recursos diferentes não competem. */
export type RateLimiters = Record<TaskResource, RateLimiter>;

/** Executor INJETADO: executa a tarefa de verdade (agente/script em produção). */
export type Executor = (task: Task) => Promise<TaskRunResult>;

/** Resultado devolvido pelo executor injetado. */
export interface TaskRunResult {
  ok: boolean;
  /** Motivo da falha quando `ok === false`. */
  error?: string;
  /**
   * Valores contribuídos a chaves lógicas multi-escritor, por chave. Cada
   * chave DEVE estar declarada em `task.writes` — uma chave fora do `writes`
   * é erro estruturado em tempo de execução (nunca redução silenciosa).
   */
  entries?: Record<string, unknown[]>;
}

// ---------------------------------------------------------------------------
// Configuração da onda
// ---------------------------------------------------------------------------

/**
 * Reducer declarado para uma chave multi-escritor (toda chave no `writes` de
 * ≥2 tarefas da mesma onda exige reducer — §4.1).
 */
export type ReducerSpec =
  | { type: 'append' } // concatena em ordem de conclusão
  | { type: 'append_dedup_by'; key: string } // concatena deduplicando por item[key]
  | { type: 'majority_vote' }; // maioria estrita; empate → NADA gravado

export interface WaveConfig {
  /** As tarefas da onda (≤15 recomendado, teto duro 20). */
  tasks: Task[];
  /**
   * Reducers por chave multi-escritor. Chave com ≥2 escritoras SEM reducer é
   * erro de configuração lançado antes de rodar.
   */
  reducers: Record<string, ReducerSpec>;
}

/** Ambiente injetado: semáforos por recurso + executor. */
export interface SchedulerEnv {
  limiters: RateLimiters;
  execute: Executor;
}

/** Uma tarefa concluída com sucesso nesta execução, em ordem de conclusão. */
export interface WaveCompletion {
  task: Task;
  result: TaskRunResult;
}

export interface WaveResult {
  /** Estado final das tarefas (done/failed/blocked) para o chamador persistir. */
  tasks: Task[];
  /**
   * Chaves multi-escritor reduzidas. Chave de `majority_vote` sem maioria
   * (empate) fica AUSENTE — nada foi gravado.
   */
  reduced: Record<string, unknown>;
  /** Avisos não-fatais (onda 16–20, reducer redundante, …). */
  warnings: string[];
  /** Ids das tarefas efetivamente executadas neste run, em ordem de conclusão. */
  executed: TaskId[];
  /** Ids pulados por retomada (done com mesmo cacheKey). */
  skipped: TaskId[];
}

// ---------------------------------------------------------------------------
// Erros estruturados (FAIL-CLOSED)
// ---------------------------------------------------------------------------

export type SchedulerErrorCode =
  /** DOIS outputs iguais na mesma onda — PAR-02, §4.1. */
  | 'ownership-collision'
  /** deps formam ciclo; `details.cycle` traz o caminho (A-P02-4). */
  | 'dependency-cycle'
  /** chave multi-escritor sem reducer declarado na onda (§4.1). */
  | 'missing-reducer'
  /** onda com mais de 20 tarefas — erro de configuração (§4.1). */
  | 'wave-too-large'
  /** dep aponta para id que não existe na onda. */
  | 'unknown-dependency'
  /** status done sem doneCacheKey — estado persistido inconsistente. */
  | 'inconsistent-done-state'
  /** id de tarefa duplicado na onda. */
  | 'duplicate-task-id'
  /** executor devolveu entrada para chave fora de task.writes. */
  | 'undeclared-entry-key'
  /** item sem a chave de dedup do reducer append_dedup_by. */
  | 'dedup-key-missing';

export class SchedulerError extends Error {
  readonly code: SchedulerErrorCode;
  readonly details: Record<string, unknown>;

  constructor(code: SchedulerErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'SchedulerError';
    this.code = code;
    this.details = details;
  }
}

/** O resultado da validação pura da onda — erros + avisos não-fatais. */
export interface WaveValidation {
  errors: SchedulerError[];
  warnings: string[];
}
