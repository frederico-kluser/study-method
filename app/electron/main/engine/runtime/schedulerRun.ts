/**
 * app/electron/main/engine/runtime/schedulerRun.ts — EXECUÇÃO da onda como DAG:
 * despacho por recurso (limitadores injetados), dependências bloqueiam até a
 * conclusão, tarefa falhada bloqueia as dependentes, retomada pula `done` com
 * o mesmo `doneCacheKey`/`cacheKey`.
 *
 * EXTRAÍDO de `runtime/scheduler.ts` na refatoração L06 (CC≤8 por função;
 * comportamento observável preservado). O slot do limiter é liberado no
 * `finally` de cada tarefa — o release vem do `acquire` (P-27) e é idempotente.
 */

import type { Task, TaskId } from './task';
import {
  SchedulerError,
  type SchedulerEnv,
  type TaskRunResult,
  type WaveCompletion,
  type WaveConfig,
  type WaveResult,
} from './schedulerTipos';
import { reduceWave } from './schedulerReduce';
import { validateWave } from './schedulerValidate';

/**
 * Normaliza o estado persistido de ENTRADA (retomada): `done` com o mesmo
 * `doneCacheKey` é pulado; `done` com cacheKey diferente reexecuta (o conteúdo
 * mudou); failed/blocked/running voltam a `pending` (nova tentativa).
 */
function normalizarEstado(tasks: Task[], done: Set<TaskId>, skipped: TaskId[]): void {
  for (const t of tasks) {
    if (t.status === 'done') {
      if (t.doneCacheKey === t.cacheKey) {
        done.add(t.id);
        skipped.push(t.id);
      } else {
        t.status = 'pending'; // cacheKey mudou ⇒ o conteúdo mudou ⇒ reexecuta
      }
    } else {
      t.status = 'pending'; // failed/blocked/running ⇒ nova tentativa
    }
  }
}

/** Sobrou tarefa sem chance de rodar ⇒ dependente de tarefa que falhou. */
function bloquearRestantes(tasks: Task[], done: Set<TaskId>, failed: Set<TaskId>): void {
  for (const t of tasks) {
    if (!done.has(t.id) && !failed.has(t.id)) t.status = 'blocked';
  }
}

/**
 * Valida a onda (lança o PRIMEIRO erro estruturado — fail-closed) e executa
 * as tarefas como DAG: cada tarefa vai para o semáforo do seu `recurso`
 * (limitadores injetados) e dependências não concluídas ficam bloqueadas até
 * a conclusão da dep. Tarefa `done` com o mesmo `doneCacheKey`/`cacheKey` é
 * pulada (idempotência/retomada). Tarefa que falhou bloqueia as dependentes.
 */
export async function runWave(config: WaveConfig, env: SchedulerEnv): Promise<WaveResult> {
  const validation = validateWave(config);
  if (validation.errors.length > 0) throw validation.errors[0];

  const { limiters, execute } = env;
  const warnings = [...validation.warnings];
  const tasks = config.tasks.map((t) => ({ ...t }));
  const done = new Set<TaskId>();
  const failed = new Set<TaskId>();
  const completions: WaveCompletion[] = [];
  const executed: TaskId[] = [];
  const skipped: TaskId[] = [];

  normalizarEstado(tasks, done, skipped);

  // Lote = todas as tarefas prontas do momento, em paralelo, cada uma no seu
  // semáforo de recurso. Terminou o lote ⇒ novo lote, até não sobrar nada.
  while (true) {
    const runnable = tasks.filter(
      (t) =>
        !done.has(t.id) &&
        !failed.has(t.id) &&
        t.status === 'pending' &&
        t.deps.every((dep) => done.has(dep)),
    );

    if (runnable.length === 0) {
      bloquearRestantes(tasks, done, failed);
      break;
    }

    await Promise.all(runnable.map((t) => executeTask(t)));
  }

  const reduced = reduceWave(config, completions);
  return {
    tasks,
    reduced,
    warnings,
    executed,
    skipped,
    // estado devolvido ao chamador para persistir a retomada
  };

  async function executeTask(t: Task): Promise<void> {
    const limiter = limiters[t.recurso];
    // P-27: o release VEM do acquire (protocolo do P-01) — não há release()
    // próprio; a liberação é idempotente, e o finally garante que roda mesmo
    // quando o executor lança ou o fail-closed de writes dispara.
    const release = await limiter.acquire();
    try {
      let result: TaskRunResult;
      try {
        result = await execute(t);
      } catch (err) {
        result = { ok: false, error: err instanceof Error ? err.message : String(err) };
      }

      if (!result.ok) {
        t.status = 'failed';
        failed.add(t.id);
        return;
      }

      // Fail-closed: entrada fora do `writes` declarado jamais é reduzida em
      // silêncio — pode ser uma chave multi-escritor que escapou do gate.
      for (const key of Object.keys(result.entries ?? {})) {
        if (!t.writes.includes(key)) {
          throw new SchedulerError(
            'undeclared-entry-key',
            `o executor devolveu entrada para a chave "${key}", que a tarefa "${t.id}" não declara em writes`,
            { tarefa: t.id, chave: key },
          );
        }
      }

      t.status = 'done';
      t.doneCacheKey = t.cacheKey;
      done.add(t.id);
      executed.push(t.id);
      completions.push({ task: t, result });
    } finally {
      release(); // idempotente (P-01) — liberar a mesma vaga de novo é no-op
    }
  }
}
