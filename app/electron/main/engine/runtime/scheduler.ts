/**
 * app/electron/main/engine/runtime/scheduler.ts — o ESCALONADOR de tarefas da
 * engine de trilhas (pacote P-02).
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
 *     (`llm`/`exec`/`cpu`, §4.1), e aqui só se chama `acquire`/`release`.
 *
 * FAIL-CLOSED: todo erro de configuração é um `SchedulerError` ESTRUTURADO
 * (`code` + `details` + mensagem), lançado ANTES de a onda rodar — nunca log
 * silencioso (regra dura 1 do plano).
 */

import * as path from 'node:path';

import type { Task, TaskId, TaskResource } from './task';

// ---------------------------------------------------------------------------
// Contratos injetados
// ---------------------------------------------------------------------------

/** Limitador de concorrência de UM recurso (interface mínima acquire/release). */
export interface RateLimiter {
  /** Espera até haver vaga e a ocupa. */
  acquire(): Promise<void>;
  /** Libera a vaga ocupada por `acquire`. */
  release(): void;
}

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

// ---------------------------------------------------------------------------
// Validação PURA da onda (roda ANTES de qualquer execução)
// ---------------------------------------------------------------------------

export interface WaveValidation {
  errors: SchedulerError[];
  warnings: string[];
}

/**
 * Validação pura de uma onda. `errors.length === 0` ⇒ onda pronta para rodar.
 * Nenhum caminho de código permite a onda rodar com colisão de posse
 * (A-P02-3): `runWave` chama isto primeiro e lança. A comparação de posse é
 * feita sobre a CHAVE CANÔNICA de cada output (normalize + trailing slash +
 * case — ver `canonicalOwnershipKey`), então aliases do mesmo arquivo físico
 * ('a/./b' vs 'a/b', 'x.md/' vs 'x.md', 'Aula.md' vs 'aula.md') colidem.
 */
export function validateWave(config: WaveConfig): WaveValidation {
  const errors: SchedulerError[] = [];
  const warnings: string[] = [];
  const { tasks, reducers } = config;

  // --- tamanho da onda (§4.1: ondas ≤15, teto duro 20) ---------------------
  if (tasks.length > 20) {
    errors.push(
      new SchedulerError(
        'wave-too-large',
        `onda com ${tasks.length} tarefas excede o teto duro de 20 — erro de configuração (§4.1)`,
        { tamanho: tasks.length, tetoDuro: 20 },
      ),
    );
  } else if (tasks.length > 15) {
    warnings.push(`onda com ${tasks.length} tarefas acima do recomendado de 15 (limite duro 20, §4.1)`);
  }

  // --- ids duplicados ------------------------------------------------------
  const seenIds = new Set<TaskId>();
  for (const t of tasks) {
    if (seenIds.has(t.id)) {
      errors.push(new SchedulerError('duplicate-task-id', `id de tarefa duplicado na onda: "${t.id}"`, { tarefa: t.id }));
    }
    seenIds.add(t.id);
  }
  const idSet = seenIds;

  // --- dependências desconhecidas ------------------------------------------
  for (const t of tasks) {
    for (const dep of t.deps) {
      if (!idSet.has(dep)) {
        errors.push(
          new SchedulerError(
            'unknown-dependency',
            `a tarefa "${t.id}" depende de "${dep}", que não existe na onda`,
            { tarefa: t.id, dependencia: dep },
          ),
        );
      }
    }
  }

  // --- colisão de posse de arquivo (PAR-02) --------------------------------
  for (const [key, taskIds] of collectOutputCollisions(tasks)) {
    const [a, b] = taskIds;
    errors.push(
      new SchedulerError(
        'ownership-collision',
        `colisão de posse: o caminho "${key}" é declarado em outputs por mais de uma tarefa da onda (${a}, ${b}) — a onda foi REJEITADA antes de rodar (PAR-02, §4.1)`,
        { caminho: key, tarefas: taskIds },
      ),
    );
  }

  // --- estado persistido inconsistente -------------------------------------
  for (const t of tasks) {
    if (t.status === 'done' && t.doneCacheKey === undefined) {
      errors.push(
        new SchedulerError(
          'inconsistent-done-state',
          `estado inconsistente: a tarefa "${t.id}" está done sem doneCacheKey — sem ele a retomada não pode provar idempotência`,
          { tarefa: t.id, cacheKey: t.cacheKey },
        ),
      );
    }
  }

  // --- ciclo de dependências (A-P02-4) -------------------------------------
  const cycle = findDependencyCycle(tasks);
  if (cycle) {
    errors.push(
      new SchedulerError(
        'dependency-cycle',
        `ciclo de dependências detectado: ${cycle.join('→')} — a engine é um DAG (§4.1)`,
        { ciclo: cycle, caminho: cycle.join('→') },
      ),
    );
  }

  // --- reducers de chaves multi-escritor (§4.1) ----------------------------
  const writers = collectWriters(tasks);
  for (const [key, taskIds] of writers) {
    if (taskIds.length < 2) continue;
    if (!(key in reducers)) {
      errors.push(
        new SchedulerError(
          'missing-reducer',
          `chave multi-escritor sem reducer: "${key}" é escrita por ${taskIds.length} tarefas (${taskIds.join(', ')}) mas nenhum reducer foi declarado na onda — erro de CONFIGURAÇÃO, nunca silêncio (§4.1)`,
          { chave: key, tarefas: taskIds },
        ),
      );
    }
  }
  for (const key of Object.keys(reducers)) {
    const w = writers.get(key);
    if (!w) {
      warnings.push(`reducer declarado para a chave "${key}", que nenhuma tarefa da onda escreve`);
    } else if (w.length < 2) {
      warnings.push(`reducer declarado para a chave "${key}", escrita por uma tarefa só (${w[0]}) — reducer só é necessário em chave multi-escritor`);
    }
  }

  return { errors, warnings };
}

/**
 * Colisões de posse: mapeia a CHAVE CANÔNICA do caminho → tarefas que o
 * declaram em `outputs`, só para caminhos com ≥2 tarefas. PURO — a base da
 * rejeição PAR-02.
 *
 * A posse é comparada SEMPRE pela chave canônica (`canonicalOwnershipKey`):
 * dois outputs que nomeiam o MESMO arquivo físico por notação diferente
 * ('out/x.md' vs 'out/./x.md', 'x.md/' vs 'x.md', 'Trilha/Aula.md' vs
 * 'trilha/aula.md') colidem — a onda é rejeitada ANTES de rodar. Os `outputs`
 * ORIGINAIS de cada tarefa ficam INALTERADOS: a canonicalização é exclusiva
 * da comparação de posse, nunca reescreve o que a tarefa declara gravar.
 */
export function collectOutputCollisions(tasks: Task[]): Map<string, TaskId[]> {
  const byPath = new Map<string, TaskId[]>();
  for (const t of tasks) {
    for (const rawPath of t.outputs) {
      const key = canonicalOwnershipKey(rawPath);
      const list = byPath.get(key) ?? [];
      list.push(t.id);
      byPath.set(key, list);
    }
  }
  const collisions = new Map<string, TaskId[]>();
  for (const [key, taskIds] of byPath) {
    if (taskIds.length > 1) collisions.set(key, taskIds);
  }
  return collisions;
}

/**
 * Chave canônica de posse de UM caminho de output — usada SÓ na comparação de
 * posse entre tarefas (nunca para reescrever os `outputs` da tarefa).
 *
 * Três normalizações deliberadas:
 *   1. `path.posix.normalize` — resolve segmentos redundantes (`a/./b` →
 *      `a/b`, `a//b` → `a/b`, `a/../b` → `b`): o mesmo arquivo físico não
 *      pode ganhar dois donos por causa de notação;
 *   2. remoção de trailing slash (`x.md/` → `x.md`, com exceção da raiz '/')
 *      — barra final designa o mesmo arquivo e não pode criar dono duplo
 *      (`normalize` já colapsa a maioria; a remoção explícita é defensiva);
 *   3. comparação CEGADA a case (`toLowerCase`) — DELIBERADA: em APFS
 *      (default do macOS) 'Trilha/Aula.md' e 'trilha/aula.md' são o MESMO
 *      arquivo, e 'aula.md' escrito por duas tarefas com case diferente
 *      sobrescreveria uma à outra sem este gate. Em filesystem case-sensitive,
 *      o par NÃO é o mesmo arquivo, mas rejeitar a onda é um falso-positivo
 *      CONSERVADOR e declarado: nunca deixa uma colisão real escapar por case,
 *      e rejeitar paths que só diferem em case não causa perda de dados — a
 *      onda é reconfigurada (renomeia um output) e roda de novo.
 */
function canonicalOwnershipKey(raw: string): string {
  const normalized = path.posix.normalize(raw);
  const noTrailingSlash =
    normalized.length > 1 && normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
  return noTrailingSlash.toLowerCase();
}

/** Escritores por chave lógica: `writes` de cada tarefa. PURO. */
function collectWriters(tasks: Task[]): Map<string, TaskId[]> {
  const writers = new Map<string, TaskId[]>();
  for (const t of tasks) {
    for (const key of t.writes) {
      const list = writers.get(key) ?? [];
      list.push(t.id);
      writers.set(key, list);
    }
  }
  return writers;
}

/**
 * Detecta o PRIMEIRO ciclo nas dependências e devolve o CAMINHO do ciclo com
 * o início repetido no fim (ex.: `['a', 'b', 'c', 'a']` → "a→b→c→a").
 * `null` quando o grafo é acíclico. PURO. (A-P02-4)
 */
export function findDependencyCycle(tasks: Task[]): TaskId[] | null {
  const ids = new Set(tasks.map((t) => t.id));
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const visiting = new Set<TaskId>();
  const visited = new Set<TaskId>();
  const stack: TaskId[] = [];
  let cycle: TaskId[] | null = null;

  const dfs = (id: TaskId): boolean => {
    if (cycle) return true;
    if (visiting.has(id)) {
      const start = stack.indexOf(id);
      cycle = [...stack.slice(start), id]; // fecha o ciclo: a→b→c→a
      return true;
    }
    if (visited.has(id)) return false;
    const task = byId.get(id);
    if (!task) return false; // dep fora da onda — validação própria cuida
    visiting.add(id);
    stack.push(id);
    for (const dep of task.deps) {
      if (ids.has(dep) && dfs(dep)) return true;
    }
    stack.pop();
    visiting.delete(id);
    visited.add(id);
    return false;
  };

  for (const t of tasks) {
    if (dfs(t.id)) break;
  }
  return cycle;
}

// ---------------------------------------------------------------------------
// Redução de chaves multi-escritor (PURO)
// ---------------------------------------------------------------------------

/**
 * Aplica os reducers declarados à onda sobre as conclusões DESTA execução,
 * em ordem de conclusão. Só chaves com ≥2 escritoras declaradas são
 * reduzidas. `majority_vote` sem maioria (empate) deixa a chave AUSENTE —
 * nada é gravado.
 *
 * Tarefas puladas por retomada (done) não contribuem: as contribuições delas
 * já entraram no resultado reduzido da onda em que rodaram.
 */
export function reduceWave(config: WaveConfig, completions: WaveCompletion[]): Record<string, unknown> {
  const writers = collectWriters(config.tasks);
  const reduced: Record<string, unknown> = {};

  for (const [key, spec] of Object.entries(config.reducers)) {
    const w = writers.get(key) ?? [];
    if (w.length < 2) continue; // chave de escritor único não é multi-escritor

    const entries: unknown[] = [];
    for (const completion of completions) {
      if (completion.task.writes.includes(key)) {
        entries.push(...(completion.result.entries?.[key] ?? []));
      }
    }

    const value = applyReducer(spec, key, entries);
    if (value !== undefined) reduced[key] = value; // undefined ⇒ nada gravado
  }
  return reduced;
}

function applyReducer(spec: ReducerSpec, key: string, entries: unknown[]): unknown {
  if (spec.type === 'append') {
    return entries;
  }
  if (spec.type === 'append_dedup_by') {
    const seen = new Set<string>();
    const out: unknown[] = [];
    for (const item of entries) {
      if (typeof item !== 'object' || item === null || !(spec.key in item)) {
        throw new SchedulerError(
          'dedup-key-missing',
          `item sem a chave de dedup "${spec.key}" exigida pelo reducer append_dedup_by da chave "${key}"`,
          { chave: key, item },
        );
      }
      const keyValue = (item as Record<string, unknown>)[spec.key];
      const canonical = canonicalKey(keyValue);
      if (seen.has(canonical)) continue; // primeira ocorrência vence
      seen.add(canonical);
      out.push(item);
    }
    return out;
  }
  // majority_vote — maioria ESTRITA (> n/2); empate ⇒ undefined ⇒ nada gravado
  const counts = new Map<string, { value: unknown; n: number }>();
  for (const item of entries) {
    const canonical = canonicalKey(item);
    const found = counts.get(canonical);
    if (found) found.n += 1;
    else counts.set(canonical, { value: item, n: 1 });
  }
  const total = entries.length;
  for (const candidate of counts.values()) {
    if (candidate.n > total / 2) return candidate.value;
  }
  return undefined;
}

/** Chave canônica de comparação (objetos por conteúdo, primitivos por valor+tipo). */
function canonicalKey(value: unknown): string {
  if (value !== null && typeof value === 'object') return JSON.stringify(value);
  return `${typeof value}:${String(value)}`;
}

// ---------------------------------------------------------------------------
// Execução da onda (despacho por recurso)
// ---------------------------------------------------------------------------

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

  // Normaliza o estado persistido de entrada (retomada).
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
      // Sobrou tarefa sem chance de rodar ⇒ dependente de tarefa que falhou.
      for (const t of tasks) {
        if (!done.has(t.id) && !failed.has(t.id)) t.status = 'blocked';
      }
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
    await limiter.acquire();
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
      limiter.release();
    }
  }
}