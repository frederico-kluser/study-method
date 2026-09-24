/**
 * app/electron/main/engine/runtime/schedulerReduce.ts — REDUÇÃO de chaves
 * multi-escritor (PURO): aplica os reducers declarados às conclusões DESTA
 * execução, em ordem de conclusão.
 *
 * EXTRAÍDO de `runtime/scheduler.ts` na refatoração L06 (CC≤8 por função — um
 * reducer por função; comportamento observável preservado).
 *
 * Só chaves com ≥2 escritoras declaradas são reduzidas. `majority_vote` sem
 * maioria (empate) deixa a chave AUSENTE — nada é gravado. Tarefas puladas por
 * retomada (done) não contribuem: as contribuições delas já entraram no
 * resultado reduzido da onda em que rodaram.
 */

import { collectWriters } from './schedulerValidate';
import { SchedulerError, type ReducerSpec, type WaveCompletion, type WaveConfig } from './schedulerTipos';

/**
 * Aplica os reducers declarados à onda sobre as conclusões DESTA execução,
 * em ordem de conclusão. Só chaves com ≥2 escritoras declaradas são
 * reduzidas. `majority_vote` sem maioria (empate) deixa a chave AUSENTE —
 * nada é gravado.
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

/** `append` — concatena em ordem de conclusão, sem tocar nos itens. */
function aplicarAppend(entries: unknown[]): unknown {
  return entries;
}

/**
 * `append_dedup_by` — concatena deduplicando por `item[key]`; a PRIMEIRA
 * ocorrência da chave vence. Item sem a chave de dedup é erro estruturado
 * (fail-closed — nunca redução silenciosa).
 */
function aplicarAppendDedup(spec: { type: 'append_dedup_by'; key: string }, key: string, entries: unknown[]): unknown {
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

/**
 * `majority_vote` — maioria ESTRITA (> n/2); empate ⇒ `undefined` ⇒ nada
 * gravado (a chave fica AUSENTE no resultado).
 */
function aplicarMaioria(entries: unknown[]): unknown {
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

function applyReducer(spec: ReducerSpec, key: string, entries: unknown[]): unknown {
  if (spec.type === 'append') return aplicarAppend(entries);
  if (spec.type === 'append_dedup_by') return aplicarAppendDedup(spec, key, entries);
  return aplicarMaioria(entries); // majority_vote
}

/** Chave canônica de comparação (objetos por conteúdo, primitivos por valor+tipo). */
function canonicalKey(value: unknown): string {
  if (value !== null && typeof value === 'object') return JSON.stringify(value);
  return `${typeof value}:${String(value)}`;
}
