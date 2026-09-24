/**
 * app/electron/main/engine/runtime/schedulerValidate.ts — VALIDAÇÃO PURA da
 * onda (roda ANTES de qualquer execução) e as primitivas de grafo/posse que a
 * alimentam. `errors.length === 0` ⇒ onda pronta para rodar.
 *
 * EXTRAÍDO de `runtime/scheduler.ts` na refatoração L06 (CC≤8 por função; a
 * ORDEM de reporte dos erros — que decide qual erro `runWave` lança primeiro —
 * é preservada literalmente).
 *
 * Nenhum caminho de código permite a onda rodar com colisão de posse
 * (A-P02-3): `runWave` chama `validateWave` primeiro e lança. A comparação de
 * posse é feita sobre a CHAVE CANÔNICA de cada output (normalize + trailing
 * slash + case — ver `canonicalOwnershipKey`), então aliases do mesmo arquivo
 * físico ('a/./b' vs 'a/b', 'x.md/' vs 'x.md', 'Aula.md' vs 'aula.md') colidem.
 */

import * as path from 'node:path';

import type { Task, TaskId } from './task';
import { SchedulerError, type WaveConfig, type WaveValidation } from './schedulerTipos';

// ---------------------------------------------------------------------------
// Seções da validação (uma por regra — refatoração L06, CC≤8 cada)
// ---------------------------------------------------------------------------

/** Tamanho da onda (§4.1: ondas ≤15 recomendado, teto duro 20). */
function checarTamanhoDaOnda(tasks: Task[], errors: SchedulerError[], warnings: string[]): void {
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
}

/** Ids duplicados — devolve o conjunto de ids para a checagem de dependências. */
function checarIdsDuplicados(tasks: Task[], errors: SchedulerError[]): Set<TaskId> {
  const seenIds = new Set<TaskId>();
  for (const t of tasks) {
    if (seenIds.has(t.id)) {
      errors.push(new SchedulerError('duplicate-task-id', `id de tarefa duplicado na onda: "${t.id}"`, { tarefa: t.id }));
    }
    seenIds.add(t.id);
  }
  return seenIds;
}

/** Dependências apontando para id que não existe na onda. */
function checarDependenciasDesconhecidas(tasks: Task[], idSet: Set<TaskId>, errors: SchedulerError[]): void {
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
}

/** Colisão de posse de arquivo (PAR-02) — sobre a chave canônica. */
function checarColisoesDePosse(tasks: Task[], errors: SchedulerError[]): void {
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
}

/** Estado persistido inconsistente: done sem doneCacheKey. */
function checarEstadoPersistido(tasks: Task[], errors: SchedulerError[]): void {
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
}

/** Ciclo de dependências (A-P02-4) — a engine é um DAG (§4.1). */
function checarCicloDeDependencias(tasks: Task[], errors: SchedulerError[]): void {
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
}

/** Reducers de chaves multi-escritor (§4.1) — erros de configuração e avisos. */
function checarReducers(
  tasks: Task[],
  reducers: WaveConfig['reducers'],
  errors: SchedulerError[],
  warnings: string[],
): void {
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
}

// ---------------------------------------------------------------------------
// Validação PURA da onda
// ---------------------------------------------------------------------------

/**
 * Validação pura de uma onda. `errors.length === 0` ⇒ onda pronta para rodar.
 * Nenhum caminho de código permite a onda rodar com colisão de posse
 * (A-P02-3): `runWave` chama isto primeiro e lança. As SEÇÕES rodam na ordem
 * histórica (tamanho → ids → deps → posse → estado → ciclo → reducers) — a
 * ordem dos `errors` é observável (`runWave` lança o PRIMEIRO).
 */
export function validateWave(config: WaveConfig): WaveValidation {
  const errors: SchedulerError[] = [];
  const warnings: string[] = [];
  const { tasks, reducers } = config;

  checarTamanhoDaOnda(tasks, errors, warnings);
  const idSet = checarIdsDuplicados(tasks, errors);
  checarDependenciasDesconhecidas(tasks, idSet, errors);
  checarColisoesDePosse(tasks, errors);
  checarEstadoPersistido(tasks, errors);
  checarCicloDeDependencias(tasks, errors);
  checarReducers(tasks, reducers, errors, warnings);

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
export function collectWriters(tasks: Task[]): Map<string, TaskId[]> {
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
