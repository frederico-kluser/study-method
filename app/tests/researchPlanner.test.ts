/**
 * tests/researchPlanner.test.ts — researchPlanner com `search.multiSearch`
 * fake (nunca usa rede). Cobre: heurística determinística de queries, uso do
 * generateQueries injetado, plano LLM (generatePlan) com sub+category, fallback
 * heurístico sem LLM, chave Brave obrigatória (brave-missing), dedup entre
 * rodadas, cap de rodadas, ordem dos eventos research:* e findings limitados
 * por maxResults.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createResearchPlanner,
  defaultQueriesFor,
  heuristicPlanFor,
  normalizePlanShape,
  normalizeQuery,
} from '../electron/main/services/researchPlanner';
import type { ResearchPlanShape, ResearchQuerySpec } from '../electron/main/services/researchPlanner';
import type { ResearchProgressEvent, StudyFinding } from '@shared/ipc-contract';

const baseFinding = (query: string, url: string, score?: number): StudyFinding => ({
  query,
  title: `T ${url}`,
  url,
  description: 'desc',
  ...(score !== undefined ? { score } : {}),
});

/** multiSearch fake com comportamento configurável por teste. */
function fakeMulti(
  resultsFor: Record<string, StudyFinding[]> = {},
  errors: Array<{ query: string; error: string; code?: string }> = [],
) {
  const calls: string[][] = [];
  return {
    calls,
    async multiSearch(queries: string[], opts?: {
      concurrency?: number;
      delayMs?: number;
      count?: number;
      onQueryStart?: (q: string) => void;
      onQueryDone?: (info: { query: string; ok: boolean; provider: 'brave'; hits?: number; latencyMs?: number; error?: { code?: string; message?: string } }) => void;
    }) {
      calls.push([...queries]);
      const results: StudyFinding[] = [];
      const errs: Array<{ query: string; error: string; code?: string }> = [];
      for (const q of queries) {
        opts?.onQueryStart?.(q);
        const err = errors.find((e) => e.query === q);
        if (err) {
          errs.push({ ...err });
          opts?.onQueryDone?.({ query: q, ok: false, provider: 'brave', latencyMs: 5, ...(err.code ? { error: { code: err.code, message: err.error } } : { error: { message: err.error } }) });
          continue;
        }
        const found = resultsFor[q] ?? [];
        for (const f of found) results.push({ ...f });
        opts?.onQueryDone?.({ query: q, ok: true, provider: 'brave', hits: found.length, latencyMs: 7 });
      }
      return { results, errors: errs };
    },
  };
}

/** Captura os eventos research:* emitidos por plan(). */
function captureProgress() {
  const events: ResearchProgressEvent[] = [];
  return {
    events,
    onProgress: (ev: ResearchProgressEvent) => events.push(ev),
  };
}

const withKey = { resolveApiKey: async () => 'brave-key-test' };

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

// ─── heuristicPlanFor: sub-perguntas + queries com categoria mapeada ─────────
test('heuristicPlanFor: sub-perguntas e queries com sub+category mapeadas', () => {
  const plan = heuristicPlanFor('Recursão');
  assert.ok(plan.subQuestions.length >= 3, 'heurística gera sub-perguntas');
  assert.equal(plan.maxRounds, 1, 'heurística nunca pede rodada extra');
  assert.ok(plan.queries.every((q) => q.id && q.q && q.sub), 'queries com id/q/sub');
  const categories = plan.queries.map((q) => q.category);
  assert.ok(categories.includes('official-docs'), 'conceito → official-docs');
  assert.ok(categories.includes('common-errors'), 'erros comuns → common-errors');
  assert.ok(categories.includes('exercises'), 'exercícios → exercises');
  assert.deepEqual(
    plan.queries.map((q) => q.q),
    defaultQueriesFor('Recursão'),
    'queries heurísticas == defaultQueriesFor',
  );
});

// ─── normalizePlanShape: coerção do plano LLM cru ────────────────────────────
test('normalizePlanShape: entradas inválidas viram null/[] e ids são preenchidos', () => {
  const shape = normalizePlanShape({
    subQuestions: [{ question: 'q1' }, { id: 'sq9', question: 'q9' }, { question: '' }],
    queries: [{ q: '  query A  ' }, { id: 'x', q: 'query B', sub: 'sq9', category: 'practice' }, { q: '' }],
    successCriteria: ['ok', 42],
    maxRounds: 9,
  });
  assert.deepEqual(shape.subQuestions.map((s) => s.id), ['sq1', 'sq9']);
  assert.equal(shape.queries[0].id, 'q1');
  assert.equal(shape.queries[0].sub, 'sq1', 'sub default = primeira sub-pergunta');
  assert.equal(shape.queries[0].category, null, 'categoria inválida → null');
  assert.equal(shape.queries[1].category, 'practice');
  assert.deepEqual(shape.successCriteria, ['ok']);
  assert.equal(shape.maxRounds, 2, 'cap de maxRounds em 2');
});

// ─── plan: usa a heurística quando generateQueries não é injetado ────────────
test('plan: default usa defaultQueriesFor e chama multiSearch', async () => {
  const queries = defaultQueriesFor('Recursão');
  const resultsFor: Record<string, StudyFinding[]> = {};
  queries.forEach((q, i) => {
    resultsFor[q] = [baseFinding(q, `https://r${i}.example`, 50 - i)];
  });
  const search = fakeMulti(resultsFor);
  const planner = createResearchPlanner({ search, ...withKey });

  const plan = await planner.plan('Recursão', { maxResults: 10 });
  assert.equal(plan.subject, 'Recursão');
  assert.deepEqual(plan.queries, queries);
  assert.ok(plan.findings.length > 0);
  assert.ok(plan.createdAt);
  assert.equal(plan.rounds, 1);
  assert.equal(search.calls.length, 1);
  assert.equal(search.calls[0].length, queries.length);
});

// ─── plan: generateQueries injetado é usado ──────────────────────────────────
test('plan: generateQueries injetado substitui a heurística', async () => {
  const search = fakeMulti({
    'dúvida fechada A': [baseFinding('dúvida fechada A', 'https://a.example')],
  });
  const generateQueries = async () => ['dúvida fechada A'];
  const planner = createResearchPlanner({ search, generateQueries, ...withKey });

  const plan = await planner.plan('Algebra Linear');
  assert.deepEqual(plan.queries, ['dúvida fechada A']);
  assert.equal(plan.findings.length, 1);
  assert.equal(plan.findings[0].url, 'https://a.example');
});

test('plan: generateQueries pode retornar muita coisa → corta em 6', async () => {
  const search = fakeMulti({});
  const generateQueries = async () =>
    Array.from({ length: 12 }, (_, i) => `query extra ${i + 1}`);
  const planner = createResearchPlanner({ search, generateQueries, ...withKey });
  const plan = await planner.plan('X');
  assert.ok(plan.queries.length <= 6);
});

// ─── plan: plano LLM (generatePlan) com sub+category ─────────────────────────
test('plan: generatePlan LLM mockado entrega plano com sub+category e eventos', async () => {
  const search = fakeMulti({
    'recursão docs': [baseFinding('recursão docs', 'https://docs.example')],
  });
  const llmPlan: ResearchPlanShape = {
    subQuestions: [
      { id: 'sq1', question: 'Como funciona a recursão?' },
      { id: 'sq2', question: 'Quais os erros comuns?' },
    ],
    queries: [
      { id: 'q1', q: 'recursão docs', sub: 'sq1', category: 'official-docs' },
      { id: 'q2', q: 'recursão erros comuns', sub: 'sq2', category: 'common-errors' },
    ],
    successCriteria: ['fonte primária encontrada'],
    maxRounds: 2,
  };
  const planner = createResearchPlanner({
    search,
    generatePlan: async () => llmPlan,
    ...withKey,
  });

  const cap = captureProgress();
  const plan = await planner.plan('Recursão', { onProgress: cap.onProgress });
  assert.deepEqual(plan.queries, ['recursão docs', 'recursão erros comuns']);
  assert.ok(plan.findings.length >= 1);

  const planEv = cap.events.find((e) => e.kind === 'research:plan');
  assert.ok(planEv && planEv.kind === 'research:plan');
  // Sem analista injetado o cap EFETIVO é 1 (rodada 2 exige generateFollowUps).
  assert.equal(planEv.maxRounds, 1);
  assert.deepEqual(planEv.subQuestions, llmPlan.subQuestions);
  assert.equal(planEv.queries[0].category, 'official-docs');
  assert.equal(planEv.queries[1].sub, 'sq2');
});

test('plan: generatePlan falha → fallback heurístico (resposta degradada > erro)', async () => {
  const search = fakeMulti({});
  const planner = createResearchPlanner({
    search,
    generatePlan: async () => {
      throw new Error('planner LLM indisponível');
    },
    ...withKey,
  });
  const plan = await planner.plan('Recursão');
  assert.deepEqual(plan.queries, defaultQueriesFor('Recursão'), 'heurística como fallback');
  assert.equal(plan.rounds, 1);
});

// ─── plan: chave Brave obrigatória (brave-missing) ───────────────────────────
test('plan: sem chave Brave → research:done brave-missing + erro BRAVE_KEY_MISSING sem queries', async () => {
  const search = fakeMulti({});
  const planner = createResearchPlanner({ search, resolveApiKey: async () => '   ' });

  const cap = captureProgress();
  await assert.rejects(
    () => planner.plan('Recursão', { onProgress: cap.onProgress }),
    (err: unknown) => {
      assert.equal((err as Error & { code?: string }).code, 'BRAVE_KEY_MISSING');
      assert.match((err as Error).message, /Brave/i);
      return true;
    },
  );
  assert.equal(search.calls.length, 0, 'NENHUMA query deve rodar sem chave');
  const done = cap.events.find((e) => e.kind === 'research:done');
  assert.ok(done && done.kind === 'research:done');
  assert.equal(done.errorKind, 'brave-missing');
  assert.equal(done.sources, 0);
  assert.equal(done.rounds, 0);
  assert.equal(done.stopReason, 'brave-missing');
});

// ─── plan: chave Brave INVÁLIDA (401/403) → brave-key-invalid ────────────────
test('plan: chave inválida (401/403) em TODAS as queries → research:done brave-key-invalid + erro BRAVE_KEY_INVALID sem fontes', async () => {
  const queries = defaultQueriesFor('Recursão').slice(0, 2);
  const search = fakeMulti(
    {},
    queries.map((q) => ({ query: q, error: 'Brave API key inválida', code: 'BRAVE_KEY_INVALID' })),
  );
  const planner = createResearchPlanner({ search, generateQueries: async () => queries, ...withKey });

  const cap = captureProgress();
  await assert.rejects(
    () => planner.plan('Recursão', { onProgress: cap.onProgress }),
    (err: unknown) => {
      assert.equal((err as Error & { code?: string }).code, 'BRAVE_KEY_INVALID');
      assert.match((err as Error).message, /Brave/i);
      return true;
    },
  );
  const done = cap.events.find((e) => e.kind === 'research:done');
  assert.ok(done && done.kind === 'research:done');
  assert.equal(done.errorKind, 'brave-key-invalid');
  assert.equal(done.sources, 0);
  assert.equal(done.rounds, 1);
  assert.equal(done.stopReason, 'brave-key-invalid');
  // A rodada roda (queries executadas com erro por query) mas o planner LANÇA:
  // sem rodada 2 e sem seguir para autoria com zero fontes.
  const roundStarts = cap.events.filter((e) => e.kind === 'research:round-start');
  assert.equal(roundStarts.length, 1, 'sem rodada 2 após aborto por chave inválida');
  const failedQueries = cap.events.filter(
    (e) => e.kind === 'research:query-done' && e.ok === false && e.error?.code === 'BRAVE_KEY_INVALID',
  );
  assert.equal(failedQueries.length, queries.length, 'cada query reporta erro de chave');
});

test('plan: chave inválida em UMA query + outra ok → NÃO aborta (tem fontes; degrada com eventos)', async () => {
  const queries = defaultQueriesFor('Recursão').slice(0, 2);
  const search = fakeMulti(
    { [queries[0]]: [baseFinding(queries[0], 'https://ok.example')] },
    [{ query: queries[1], error: 'Brave API key inválida', code: 'BRAVE_KEY_INVALID' }],
  );
  const planner = createResearchPlanner({ search, generateQueries: async () => queries, ...withKey });

  const cap = captureProgress();
  const plan = await planner.plan('Recursão', { onProgress: cap.onProgress });
  assert.ok(plan.findings.length >= 1, 'findings da query ok preservados');
  const done = cap.events.find((e) => e.kind === 'research:done');
  assert.ok(done && done.kind === 'research:done');
  assert.equal(done.errorKind, undefined, 'sem errorKind: não é aborto de chave');
  assert.equal(done.sources, 1);
  const failedQuery = cap.events.find(
    (e) => e.kind === 'research:query-done' && e.q === queries[1],
  );
  assert.ok(failedQuery && failedQuery.kind === 'research:query-done');
  assert.equal(failedQuery.error?.code, 'BRAVE_KEY_INVALID', 'erro de chave documentado no evento');
});

// ─── plan: ordem dos eventos (plan→round→start→done→round-done→done) ─────────
test('plan: ordem dos eventos research:* (plan → round-start → query-start/done → round-done → done)', async () => {
  const queries = ['Recursão conceito', 'Recursão exemplos práticos'];
  const resultsFor: Record<string, StudyFinding[]> = {
    [queries[0]]: [baseFinding(queries[0], 'https://a.example')],
    [queries[1]]: [baseFinding(queries[1], 'https://b.example')],
  };
  const search = fakeMulti(resultsFor);
  const planner = createResearchPlanner({ search, generateQueries: async () => queries, ...withKey });

  const cap = captureProgress();
  await planner.plan('Recursão', { onProgress: cap.onProgress, maxResults: 10 });

  const kinds = cap.events.map((e) => e.kind);
  const firstPlan = kinds.indexOf('research:plan');
  const roundStart = kinds.indexOf('research:round-start');
  const firstStart = kinds.indexOf('research:query-start');
  const firstDone = kinds.indexOf('research:query-done');
  const roundDone = kinds.indexOf('research:round-done');
  const done = kinds.indexOf('research:done');
  assert.ok(firstPlan >= 0 && firstPlan < roundStart, 'plan vem antes da rodada');
  assert.ok(roundStart < firstStart, 'round-start vem antes das queries');
  assert.ok(firstStart < firstDone, 'query-start vem antes do query-done da mesma query');
  assert.ok(firstDone < roundDone, 'query-done vem antes do round-done');
  assert.ok(roundDone < done, 'round-done vem antes do done');
  assert.equal(kinds.filter((k) => k === 'research:query-start').length, 2);
  assert.equal(kinds.filter((k) => k === 'research:query-done').length, 2);

  const roundStartEv = cap.events.find((e) => e.kind === 'research:round-start');
  assert.ok(roundStartEv && roundStartEv.kind === 'research:round-start');
  assert.deepEqual({ round: roundStartEv.round, totalRounds: roundStartEv.totalRounds }, { round: 1, totalRounds: 1 });

  const roundDoneEv = cap.events.find((e) => e.kind === 'research:round-done');
  assert.ok(roundDoneEv && roundDoneEv.kind === 'research:round-done');
  assert.deepEqual({ ok: roundDoneEv.ok, failed: roundDoneEv.failed, uniqueSources: roundDoneEv.uniqueSources }, { ok: 2, failed: 0, uniqueSources: 2 });

  const doneEv = cap.events.find((e) => e.kind === 'research:done');
  assert.ok(doneEv && doneEv.kind === 'research:done');
  assert.equal(doneEv.sources, 2);
  assert.equal(doneEv.rounds, 1);
});

// ─── plan: query-done com erro carrega code/message e ok:false ───────────────
test('plan: query falha → query-done {ok:false, error:{code}} e round-done conta failed', async () => {
  const queries = ['Recursão conceito', 'Recursão erros comuns'];
  const search = fakeMulti(
    { [queries[0]]: [baseFinding(queries[0], 'https://ok.example')] },
    [{ query: queries[1], error: 'Rate limit atingido', code: 'BRAVE_RATE_LIMIT' }],
  );
  const planner = createResearchPlanner({ search, generateQueries: async () => queries, ...withKey });

  const cap = captureProgress();
  const plan = await planner.plan('Recursão', { onProgress: cap.onProgress });
  assert.ok(plan.findings.every((f) => f.url === 'https://ok.example'), 'erro parcial não derruba o resto');

  const failedDone = cap.events.find(
    (e) => e.kind === 'research:query-done' && e.q === queries[1],
  );
  assert.ok(failedDone && failedDone.kind === 'research:query-done');
  assert.equal(failedDone.ok, false);
  assert.equal(failedDone.error?.code, 'BRAVE_RATE_LIMIT');
  assert.ok(failedDone.error?.message);

  const roundDone = cap.events.find((e) => e.kind === 'research:round-done');
  assert.ok(roundDone && roundDone.kind === 'research:round-done');
  assert.deepEqual({ ok: roundDone.ok, failed: roundDone.failed }, { ok: 1, failed: 1 });
});

// ─── plan: rodada 2 com follow-ups do analista + dedup entre rodadas ─────────
test('plan: analista sugere follow-up → rodada 2 com dedup (cap 2 total)', async () => {
  const queries = defaultQueriesFor('Recursão').slice(0, 2);
  const resultsFor: Record<string, StudyFinding[]> = {
    [queries[0]]: [baseFinding(queries[0], 'https://a.example')],
    [queries[1]]: [baseFinding(queries[1], 'https://b.example')],
    'recursão comparação com iteração': [baseFinding('recursão comparação', 'https://c.example')],
  };
  const search = fakeMulti(resultsFor);
  const followUp: ResearchQuerySpec = {
    id: 'r2q1',
    q: 'recursão comparação com iteração',
    sub: 'sq1',
    category: 'comparison',
  };
  let analyzeCtx: unknown = null;
  const planner = createResearchPlanner({
    search,
    generateFollowUps: async (ctx) => {
      analyzeCtx = ctx;
      return [followUp];
    },
    ...withKey,
  });

  const cap = captureProgress();
  const plan = await planner.plan('Recursão', { onProgress: cap.onProgress });
  assert.equal(plan.rounds, 2);
  assert.equal(search.calls.length, 2, 'duas rodadas = duas chamadas multiSearch');
  assert.equal(search.calls[1][0], followUp.q);

  assert.ok(analyzeCtx && typeof analyzeCtx === 'object');
  const ctx = analyzeCtx as { subject: string; alreadyRan: string[]; digest: string; round: number; maxRounds: number };
  assert.equal(ctx.subject, 'Recursão');
  assert.ok(ctx.alreadyRan.includes(queries[0]), 'alreadyRan tem queries da rodada 1');
  assert.ok(ctx.digest.includes('https://a.example'), 'digest contém os findings');
  assert.equal(ctx.maxRounds, 2);

  const roundStarts = cap.events.filter((e) => e.kind === 'research:round-start');
  assert.equal(roundStarts.length, 2);
  assert.deepEqual(
    roundStarts.map((e) => (e.kind === 'research:round-start' ? e.totalRounds : null)),
    [2, 2],
    'totalRounds declarado = 2',
  );
  const doneEv = cap.events.find((e) => e.kind === 'research:done');
  assert.ok(doneEv && doneEv.kind === 'research:done');
  assert.equal(doneEv.rounds, 2);
  assert.equal(doneEv.sources, 3);
});

test('plan: follow-up duplicado (normalizado) da rodada 1 é deduplicado → sem rodada 2', async () => {
  const queries = defaultQueriesFor('Recursão').slice(0, 1);
  const search = fakeMulti({
    [queries[0]]: [baseFinding(queries[0], 'https://a.example')],
  });
  const planner = createResearchPlanner({
    search,
    generateFollowUps: async () => [
      { id: 'r2q1', q: `  ${queries[0].toUpperCase()}  `, sub: 'sq1', category: null }, // só muda case/whitespace
    ],
    ...withKey,
  });
  const cap = captureProgress();
  const plan = await planner.plan('Recursão', { onProgress: cap.onProgress });
  assert.equal(plan.rounds, 1, 'follow-up normalizado já executado → sem rodada 2');
  assert.equal(search.calls.length, 1);
  const stopEv = cap.events.find((e) => e.kind === 'research:done');
  assert.ok(stopEv && stopEv.kind === 'research:done');
  assert.match(stopEv.stopReason, /follow-ups novos/i);
});

test('plan: analista falha → sem rodada extra (degradação honesta)', async () => {
  const queries = defaultQueriesFor('Recursão').slice(0, 2);
  const search = fakeMulti({
    [queries[0]]: [baseFinding(queries[0], 'https://a.example')],
    [queries[1]]: [baseFinding(queries[1], 'https://b.example')],
  });
  const planner = createResearchPlanner({
    search,
    generateFollowUps: async () => {
      throw new Error('analista indisponível');
    },
    ...withKey,
  });
  const cap = captureProgress();
  const plan = await planner.plan('Recursão', { onProgress: cap.onProgress });
  assert.equal(plan.rounds, 1);
  const doneEv = cap.events.find((e) => e.kind === 'research:done');
  assert.ok(doneEv && doneEv.kind === 'research:done');
  assert.match(doneEv.stopReason, /analista indisponível/i);
});

test('plan: rate limit (429) na rodada 1 → NÃO há rodada de follow-up', async () => {
  const queries = defaultQueriesFor('Recursão').slice(0, 2);
  const search = fakeMulti(
    { [queries[0]]: [baseFinding(queries[0], 'https://a.example')] },
    [{ query: queries[1], error: '429', code: 'BRAVE_RATE_LIMIT' }],
  );
  const planner = createResearchPlanner({
    search,
    generateFollowUps: async () => [
      { id: 'r2q1', q: 'recursão nova query', sub: 'sq1', category: null },
    ],
    ...withKey,
  });
  const cap = captureProgress();
  const plan = await planner.plan('Recursão', { onProgress: cap.onProgress });
  assert.equal(plan.rounds, 1, '429 cancela a rodada 2');
  assert.equal(search.calls.length, 1);
  const doneEv = cap.events.find((e) => e.kind === 'research:done');
  assert.ok(doneEv && doneEv.kind === 'research:done');
  assert.match(doneEv.stopReason, /rate limit/i);
});

test('plan: sem generateFollowUps → totalRounds 1 (heurística nunca pede rodada extra)', async () => {
  const queries = defaultQueriesFor('Recursão').slice(0, 2);
  const search = fakeMulti({
    [queries[0]]: [baseFinding(queries[0], 'https://a.example')],
  });
  const planner = createResearchPlanner({ search, ...withKey });
  const cap = captureProgress();
  await planner.plan('Recursão', { onProgress: cap.onProgress });
  const planEv = cap.events.find((e) => e.kind === 'research:plan');
  assert.ok(planEv && planEv.kind === 'research:plan');
  assert.equal(planEv.maxRounds, 1);
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
  const planner = createResearchPlanner({ search, ...withKey });
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
  const planner = createResearchPlanner({ search, ...withKey });
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
  const planner = createResearchPlanner({ search, ...withKey });
  // Nota: o `errors` da multiSearch é consumido internamente pelo planner; o
  // plano ainda entrega os findings das queries que tiveram sucesso.
  const plan = await planner.plan('Recursão');
  assert.ok(plan.findings.length >= 1);
  assert.ok(plan.findings.every((f) => f.url === 'https://ok.example'));
});

// ─── plan: assunto vazio → erro ──────────────────────────────────────────────
test('plan: assunto vazio → erro claro', async () => {
  const planner = createResearchPlanner({ search: fakeMulti({}), ...withKey });
  await assert.rejects(() => planner.plan('   '), /vazio/i);
});

// ─── helpers: normalizeQuery / dedup ─────────────────────────────────────────
test('normalizeQuery: lowercase + whitespace colapsado (dedup entre rodadas)', () => {
  assert.equal(normalizeQuery('  Recursão   Conceito '), 'recursão conceito');
  assert.equal(normalizeQuery('A  B'), normalizeQuery('a b'));
});
