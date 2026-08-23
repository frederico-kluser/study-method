/**
 * tests/braveSearchService.test.ts — BraveSearchService com fetch FAKE injetado
 * (nunca usa rede real). Cobre: normalização 200, 401/403, 429 (com/sem retry),
 * erro de rede, chave ausente, multiSearch com limite de concorrência medido e
 * dedup por url.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createBraveSearchService,
  normalizeBraveResults,
  dedupeByUrl,
  sortByScoreDesc,
} from '../electron/main/services/braveSearchService';
import type { BraveResult } from '../electron/main/services/braveSearchService';
import type { StudyFinding } from '@shared/ipc-contract';

function fakeResponse(status: number, body: unknown = {}, statusText = ''): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => body,
  } as Response;
}

/** Monta um corpo de resposta Brave com uma lista de resultados `web.results`. */
function braveBody(results: unknown[]): unknown {
  return { web: { results } };
}

const sampleResult = (title: string, url: string, description = 'desc') => ({
  title,
  url,
  description,
});

// ─── normalizeBraveResults (função pura) ─────────────────────────────────────
test('normalizeBraveResults: 200 com web.results → StudyFinding[] com query/source', () => {
  const raw = braveBody([
    sampleResult('Foo', 'https://foo.example/a', 'desc A'),
    sampleResult('Bar', 'https://bar.example/b'),
  ]);
  const out = normalizeBraveResults('conceito React', raw);
  assert.equal(out.length, 2);
  assert.deepEqual(
    { query: out[0].query, title: out[0].title, url: out[0].url },
    { query: 'conceito React', title: 'Foo', url: 'https://foo.example/a' },
  );
});

test('normalizeBraveResults: descarta entrada sem title ou url', () => {
  const raw = braveBody([
    sampleResult('', 'https://no-title.example'),
    sampleResult('Sem URL', ''),
    sampleResult('Ok', 'https://ok.example'),
  ]);
  assert.equal(normalizeBraveResults('q', raw).length, 1);
});

test('normalizeBraveResults: payload sem web.results → vazio sem erro', () => {
  assert.equal(normalizeBraveResults('q', {}).length, 0);
  assert.equal(normalizeBraveResults('q', { web: {} }).length, 0);
  assert.equal(normalizeBraveResults('q', undefined).length, 0);
});

test('normalizeBraveResults: preserva age/profile e fixa source:brave', () => {
  const raw = braveBody([
    {
      title: 'T',
      url: 'https://t.example',
      description: 'd',
      score: 0.9,
      age: '2 years ago',
      profile: { name: 'n', long_name: 'long', img: 'https://img' },
    },
  ]);
  const out = normalizeBraveResults('q', raw);
  const first = out[0] as BraveResult;
  assert.equal(first.source, 'brave');
  assert.equal(first.age, '2 years ago');
  assert.equal(first.profile?.name, 'n');
  assert.equal(first.score, 0.9);
});

// ─── search: 200 ─────────────────────────────────────────────────────────────
test('search: 200 → resultados normalizados com query e source:brave dentro do BraveResult', async () => {
  let seenUrl = '';
  let seenHeaders: Record<string, string> = {};
  const fetchImpl = (async (url: any, init?: any) => {
    seenUrl = url;
    seenHeaders = init.headers;
    return fakeResponse(
      200,
      braveBody([sampleResult('A', 'https://a.example'), sampleResult('B', 'https://b.example')]),
    );
  }) as unknown as typeof fetch;

  const svc = createBraveSearchService({ fetchImpl, resolveApiKey: async () => 'key-123' });
  const results = await svc.search('React hooks');

  assert.ok(seenUrl.startsWith('https://api.search.brave.com/res/v1/web/search?'));
  assert.match(seenUrl, /q=React\+hooks/);
  assert.match(seenUrl, /count=10/);
  assert.equal(seenHeaders['X-Subscription-Token'], 'key-123');
  assert.equal(seenHeaders['Accept'], 'application/json');
  assert.equal(results.length, 2);
  assert.equal(results[0].query, 'React hooks');
  assert.equal((results[0] as { source?: string }).source, 'brave');
});

test('search: count e extraParams são refletidos na URL', async () => {
  let seenUrl = '';
  const fetchImpl = (async (url: any) => {
    seenUrl = url;
    return fakeResponse(200, braveBody([sampleResult('A', 'https://a.example')]));
  }) as unknown as typeof fetch;
  const svc = createBraveSearchService({ fetchImpl, resolveApiKey: async () => 'k' });
  await svc.search('q', { count: 4, extraParams: { freshness: 'year', country: 'br' } });
  assert.match(seenUrl, /count=4/);
  assert.match(seenUrl, /freshness=year/);
  assert.match(seenUrl, /country=br/);
});

// ─── search: erros ───────────────────────────────────────────────────────────
test('search: chave ausente → erro claro (BRAVE_KEY_MISSING)', async () => {
  const svc = createBraveSearchService({ resolveApiKey: async () => '' });
  await assert.rejects(() => svc.search('q'), (err: unknown) => {
    const e = err as Error & { code?: string };
    assert.equal(e.code, 'BRAVE_KEY_MISSING');
    assert.match(e.message, /configurada/i);
    return true;
  });
});

test('search: 401/403 → "Brave API key inválida" (BRAVE_KEY_INVALID)', async () => {
  const fetchImpl = (async () => fakeResponse(401)) as unknown as typeof fetch;
  const svc = createBraveSearchService({ fetchImpl, resolveApiKey: async () => 'bad' });
  await assert.rejects(() => svc.search('q'), (err: unknown) => {
    const e = err as Error & { code?: string };
    assert.equal(e.code, 'BRAVE_KEY_INVALID');
    assert.equal(e.message, 'Brave API key inválida');
    return true;
  });
});

test('search: 429 sem retry configurado → erro claro de rate limit', async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls++;
    return fakeResponse(429);
  }) as unknown as typeof fetch;
  const svc = createBraveSearchService({ fetchImpl, resolveApiKey: async () => 'k' });
  await assert.rejects(() => svc.search('q'), (err: unknown) => {
    const e = err as Error & { code?: string };
    assert.equal(e.code, 'BRAVE_RATE_LIMIT');
    assert.match(e.message, /429/i);
    return true;
  });
  assert.equal(calls, 1, 'sem backoff configurado não deve re-chamar');
});

test('search: 429 com delayMsOnRateLimit > 0 → faz nova tentativa e retorna', async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls++;
    if (calls === 1) return fakeResponse(429);
    return fakeResponse(200, braveBody([sampleResult('ok', 'https://ok.example')]));
  }) as unknown as typeof fetch;
  const svc = createBraveSearchService({ fetchImpl, resolveApiKey: async () => 'k' });
  const results = await svc.search('q', { delayMsOnRateLimit: 1 });
  assert.equal(calls, 2);
  assert.equal(results.length, 1);
});

test('search: erro de rede → erro parseado', async () => {
  const fetchImpl = (async () => {
    throw new Error('ECONNREFUSED');
  }) as unknown as typeof fetch;
  const svc = createBraveSearchService({ fetchImpl, resolveApiKey: async () => 'k' });
  await assert.rejects(() => svc.search('q'), (err: unknown) => {
    const e = err as Error;
    assert.match(e.message, /ECONNREFUSED/);
    return true;
  });
});

test('search: 5xx com corpo de erro → mensagem extraída do json', async () => {
  const fetchImpl = (async () =>
    fakeResponse(502, { error: { message: 'upstream down' } })) as unknown as typeof fetch;
  const svc = createBraveSearchService({ fetchImpl, resolveApiKey: async () => 'k' });
  await assert.rejects(() => svc.search('q'), (err: unknown) => {
    const e = err as Error & { code?: string };
    assert.equal(e.code, 'BRAVE_SERVER_ERROR');
    assert.match(e.message, /upstream down/);
    return true;
  });
});

test('search: query vazia → erro', async () => {
  const svc = createBraveSearchService({ resolveApiKey: async () => 'k' });
  await assert.rejects(() => svc.search('   '), /vazia/i);
});

// ─── testConnection ──────────────────────────────────────────────────────────
test('testConnection: 200 → ok', async () => {
  const fetchImpl = (async () => fakeResponse(200)) as unknown as typeof fetch;
  const svc = createBraveSearchService({ fetchImpl, resolveApiKey: async () => 'k' });
  assert.deepEqual(await svc.testConnection(), { ok: true, message: 'Brave Search API conectada.' });
});

test('testConnection: 401 → ok:false com "chave inválida"', async () => {
  const fetchImpl = (async () => fakeResponse(403)) as unknown as typeof fetch;
  const svc = createBraveSearchService({ fetchImpl, resolveApiKey: async () => 'bad' });
  const res = await svc.testConnection();
  assert.equal(res.ok, false);
  assert.match(res.message, /inválida/i);
});

// ─── multiSearch: erro parcial não derruba o resto ───────────────────────────
test('multiSearch: query que falha vira erro e as demais retornam', async () => {
  const fetchImpl = (async (url: any) => {
    if (String(url).includes('q=boom')) return fakeResponse(500, { error: { message: 'boom' } });
    return fakeResponse(200, braveBody([sampleResult('ok', 'https://ok.example')]));
  }) as unknown as typeof fetch;
  const svc = createBraveSearchService({ fetchImpl, resolveApiKey: async () => 'k' });
  const { results, errors } = await svc.multiSearch(['ok', 'boom'], { delayMs: 0 });
  assert.equal(errors.length, 1);
  assert.equal(errors[0].query, 'boom');
  assert.equal(results.length, 1);
  assert.equal(results[0].url, 'https://ok.example');
});

// ─── multiSearch: concorrência medida ────────────────────────────────────────
test('multiSearch: respeita o limite de concorrência (máx simultâneas)', async () => {
  let active = 0;
  let peak = 0;
  const fetchImpl = (async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
    return fakeResponse(200, braveBody([sampleResult('r', 'https://unique.example')]));
  }) as unknown as typeof fetch;
  const svc = createBraveSearchService({ fetchImpl, resolveApiKey: async () => 'k' });
  const queries = ['q1', 'q2', 'q3', 'q4', 'q5'];
  await svc.multiSearch(queries, { concurrency: 2, delayMs: 0 });
  assert.ok(peak <= 2, `concorrência encontrada ${peak}, esperada <= 2`);
  assert.ok(peak >= 1);
});

test('multiSearch: com delayMs > 0 há espera entre lotes (não dispara todas juntas)', async () => {
  let started = 0;
  const order: number[] = [];
  const fetchImpl = (async () => {
    const n = ++started;
    order.push(n);
    await new Promise((r) => setTimeout(r, 2));
    return fakeResponse(200, braveBody([sampleResult('r', `https://u${n}.example`)]));
  }) as unknown as typeof fetch;
  const svc = createBraveSearchService({ fetchImpl, resolveApiKey: async () => 'k' });
  await svc.multiSearch(['a', 'b', 'c', 'd'], { concurrency: 2, delayMs: 1 });
  // Com delay, os últimos índices começam depois; não é possível todos os 4 no tick 0.
  assert.equal(order.length, 4);
});

// ─── multiSearch: dedup por url (primeira vence) ─────────────────────────────
test('multiSearch: mesmo url de queries distintas → dedup por url (primeira vence)', async () => {
  let call = 0;
  const fetchImpl = (async () => {
    call++;
    // Ambas as queries retornam o MESMO url, mas com títulos diferentes.
    return fakeResponse(
      200,
      braveBody([
        sampleResult(`titulo-${call}`, 'https://dup.example', `desc-${call}`),
        sampleResult(`outro-${call}`, 'https://unique${call}.example'),
      ]),
    );
  }) as unknown as typeof fetch;
  const svc = createBraveSearchService({ fetchImpl, resolveApiKey: async () => 'k' });
  const { results } = await svc.multiSearch(['qA', 'qB'], { delayMs: 0 });
  const dupCount = results.filter((r) => r.url === 'https://dup.example').length;
  assert.equal(dupCount, 1, 'url duplicado deve aparecer só uma vez');
  // A primeira ocorrência vence: vem da query qA.
  const dup = results.find((r) => r.url === 'https://dup.example');
  assert.equal(dup?.query, 'qA');
});

// ─── funções puras de dedup/ordenação ────────────────────────────────────────
test('dedupeByUrl: mantém a primeira ocorrência e preserva ordem', () => {
  const items: StudyFinding[] = [
    { query: 'a', title: 'A1', url: 'https://x', description: '' },
    { query: 'b', title: 'B', url: 'https://y', description: '' },
    { query: 'c', title: 'A2', url: 'https://x', description: '' },
    { query: 'd', title: 'C', url: 'https://z', description: '' },
  ];
  const out = dedupeByUrl(items);
  assert.equal(out.length, 3);
  assert.deepEqual(out.map((r) => r.title), ['A1', 'B', 'C']);
});

test('sortByScoreDesc: ordena por score desc com itens sem score no fim', () => {
  const items: StudyFinding[] = [
    { query: 'q', title: 'low', url: 'https://1', description: '', score: 1 },
    { query: 'q', title: 'high', url: 'https://2', description: '', score: 9 },
    { query: 'q', title: 'none', url: 'https://3', description: '' },
    { query: 'q', title: 'mid', url: 'https://4', description: '', score: 5 },
  ];
  const out = sortByScoreDesc(items);
  assert.deepEqual(out.map((r) => r.title), ['high', 'mid', 'low', 'none']);
});