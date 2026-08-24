/**
 * tests/researchPlanner.test.ts — researchPlanner com `search.multiSearch`
 * fake (nunca usa rede). Cobre: heurística determinística de queries, uso do
 * generateQueries injetado, findinds limitados por maxResults, ordenação por
 * score e erro parcial por query não derrubando o resto.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createResearchPlanner, defaultQueriesFor } from '../electron/main/services/researchPlanner';
import type { StudyFinding } from '@shared/ipc-contract';

const baseFinding = (query: string, url: string, score?: number): StudyFinding => ({
  query,
  title: `T ${url}`,
  url,
  description: 'desc',
  ...(score !== undefined ? { score } : {}),
});

/** multiSearch fake com comportamento configurável por teste. */
function fakeMulti(resultsFor: Record<string, StudyFinding[]> = {}, errors: Array<{ query: string; error: string }> = []) {
  const calls: string[][] = [];
  return {
    calls,
    async multiSearch(queries: string[], _opts?: unknown) {
      calls.push([...queries]);
      const results: StudyFinding[] = [];
      for (const q of queries) {
        for (const f of resultsFor[q] ?? []) results.push({ ...f });
      }
      return { results, errors };
    },
  };
}

// ─── defaultQueriesFor (heurística determinística) ───────────────────────────
test('defaultQueriesFor: gera >= 3 queries distintas determinísticas pt-BR', () => {
  const q1 = defaultQueriesFor('Recursão');
  const q2 = defaultQueriesFor('Recursão');
  assert.ok(q1.length >= 3, `esperado >= 3, veio ${q1.length}`);
  assert.ok(q1.length <= 6);
  assert.equal(new Set(q1).size, q1.length, 'queries devem ser distintas');
  assert.deepEqual(q1, q2, 'determinística: mesma entrada → mesma saída');
  assert.ok(q1.every((q) => q.includes('Recursão')));
});

test('defaultQueriesFor: tema vazio → []', () => {
  assert.deepEqual(defaultQueriesFor('   '), []);
});

test('defaultQueriesFor: query longa demais é filtrada', () => {
  const out = defaultQueriesFor('x'.repeat(10));
  assert.ok(out.every((q) => q.length <= 120));
});

// ─── plan: usa a heurística quando generateQueries não é injetado ────────────
test('plan: default usa defaultQueriesFor e chama multiSearch', async () => {
  const queries = defaultQueriesFor('Recursão');
  const resultsFor: Record<string, StudyFinding[]> = {};
  queries.forEach((q, i) => {
    resultsFor[q] = [baseFinding(q, `https://r${i}.example`, 50 - i)];
  });
  const search = fakeMulti(resultsFor);
  const planner = createResearchPlanner({ search });

  const plan = await planner.plan('Recursão', { maxResults: 10 });
  assert.equal(plan.subject, 'Recursão');
  assert.deepEqual(plan.queries, queries);
  assert.ok(plan.findings.length > 0);
  assert.ok(plan.createdAt);
  assert.equal(search.calls.length, 1);
  assert.equal(search.calls[0].length, queries.length);
});

// ─── plan: generateQueries injetado é usado ──────────────────────────────────
test('plan: generateQueries injetado substitui a heurística', async () => {
  const search = fakeMulti({
    'dúvida fechada A': [baseFinding('dúvida fechada A', 'https://a.example')],
  });
  const generateQueries = async () => ['dúvida fechada A'];
  const planner = createResearchPlanner({ search, generateQueries });

  const plan = await planner.plan('Algebra Linear');
  assert.deepEqual(plan.queries, ['dúvida fechada A']);
  assert.equal(plan.findings.length, 1);
  assert.equal(plan.findings[0].url, 'https://a.example');
});

test('plan: generateQueries pode retornar muita coisa → corta em 6', async () => {
  const search = fakeMulti({});
  const generateQueries = async () =>
    Array.from({ length: 12 }, (_, i) => `query extra ${i + 1}`);
  const planner = createResearchPlanner({ search, generateQueries });
  const plan = await planner.plan('X');
  assert.ok(plan.queries.length <= 6);
});

// ─── plan: findings limitados por maxResults e ordenados por score ───────────
test('plan: findings limitados a maxResults e ordenados por score desc', async () => {
  // 2 queries, cada uma devolvendo 2 → total 4 > maxResults 2.
  const q = defaultQueriesFor('Hash');
  const resultsFor: Record<string, StudyFinding[]> = {
    [q[0]]: [
      baseFinding(q[0], 'https://low.example', 1),
      baseFinding(q[0], 'https://high.example', 10),
    ],
    [q[1]]: [
      baseFinding(q[1], 'https://medium.example', 5),
      baseFinding(q[1], 'https://low2.example', 2),
    ],
  };
  const search = fakeMulti(resultsFor);
  const planner = createResearchPlanner({ search });
  const plan = await planner.plan('Hash', { maxResults: 2 });
  assert.equal(plan.findings.length, 2);
  // Ordenados por score desc.
  const scores = plan.findings.map((f) => f.score!);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
  assert.equal(scores[0], 10);
});

test('plan: findings sem score vão para o fim', async () => {
  const q = defaultQueriesFor('Tema');
  const resultsFor: Record<string, StudyFinding[]> = {
    [q[0]]: [baseFinding(q[0], 'https://scored.example', 3)],
    [q[1]]: [baseFinding(q[1], 'https://unscored.example')],
  };
  const search = fakeMulti(resultsFor);
  const planner = createResearchPlanner({ search });
  const plan = await planner.plan('Tema');
  const last = plan.findings[plan.findings.length - 1];
  assert.equal(last.url, 'https://unscored.example');
});

// ─── plan: erro parcial por query não derruba o resto ────────────────────────
test('plan: erro parcial por query não derruba o resto', async () => {
  const q = defaultQueriesFor('Recursão');
  const resultsFor: Record<string, StudyFinding[]> = {
    [q[0]]: [baseFinding(q[0], 'https://ok.example')],
  };
  const search = fakeMulti(resultsFor, [{ query: q[1], error: 'Rate limit atingido' }]);
  const planner = createResearchPlanner({ search });
  // Nota: o `errors` da multiSearch é consumido internamente pelo planner; o
  // plano ainda entrega os findings das queries que tiveram sucesso.
  const plan = await planner.plan('Recursão');
  assert.ok(plan.findings.length >= 1);
  assert.ok(plan.findings.every((f) => f.url === 'https://ok.example'));
});

// ─── plan: assunto vazio → erro ──────────────────────────────────────────────
test('plan: assunto vazio → erro claro', async () => {
  const planner = createResearchPlanner({ search: fakeMulti({}) });
  await assert.rejects(() => planner.plan('   '), /vazio/i);
});