/**
 * app/electron/main/engine/runtime/scheduler.ts — FACHADA do ESCALONADOR de
 * tarefas da engine de trilhas (pacote P-02).
 *
 * REFATORAÇÃO L06: este arquivo virou FACHADA FINA (re-export) — a
 * implementação foi dividida e TODO o contrato público continua exportado por
 * ESTE caminho (nenhum consumidor mudou de import):
 *   - `schedulerTipos.ts`   — contratos injetados, config/result e o erro
 *                             estruturado (fail-closed);
 *   - `schedulerValidate.ts`— validação PURA da onda + posse/ciclo/escritores;
 *   - `schedulerReduce.ts`  — redução de chaves multi-escritor (PURO);
 *   - `schedulerRun.ts`     — execução da onda como DAG por recurso.
 *
 * Contrato normativo: `docs/16-engine-de-trilha.md` §4.1 (regras de
 * paralelismo) e §3.4.
 *
 * Decide o que roda, quando, e com que semáforo — e REJEITA onda com colisão
 * de posse de arquivo. É um DAG de tarefas idempotentes, não um script
 * sequencial.
 *
 * PURO em relação ao trabalho (A-P02-2):
 *   - o executor é INJETADO (`SchedulerEnv.execute`); em produção será um
 *     agente/script, nos testes um fake — testável sem rede e sem processo;
 *   - os limitadores são INJETADOS (`SchedulerEnv.limiters`), um por recurso
 *     (`llm`/`exec`/`cpu`, §4.1), e aqui só se chama `acquire` — que resolve
 *     com a função de liberação (P-27: protocolo unificado com o P-01).
 *
 * CONTRATO DO LIMITADOR (P-27) e CAVEAT DE DEADLOCK: ver `schedulerTipos.ts`.
 *
 * FAIL-CLOSED: todo erro de configuração é um `SchedulerError` ESTRUTURADO
 * (`code` + `details` + mensagem), lançado ANTES de a onda rodar — nunca log
 * silencioso (regra dura 1 do plano).
 */

// ─── contratos, config/result e erro estruturado (schedulerTipos.ts) ─────────
export {
  SchedulerError,
  type RateLimiter,
  type RateLimiters,
  type Executor,
  type TaskRunResult,
  type ReducerSpec,
  type WaveConfig,
  type SchedulerEnv,
  type WaveCompletion,
  type WaveResult,
  type SchedulerErrorCode,
  type WaveValidation,
} from './schedulerTipos';

// ─── validação pura da onda + primitivas de grafo/posse (schedulerValidate.ts)
export {
  validateWave,
  collectOutputCollisions,
  findDependencyCycle,
} from './schedulerValidate';

// ─── redução de chaves multi-escritor (schedulerReduce.ts) ───────────────────
export { reduceWave } from './schedulerReduce';

// ─── execução da onda como DAG (schedulerRun.ts) ─────────────────────────────
export { runWave } from './schedulerRun';
