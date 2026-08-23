/**
 * tests/apiKeyValidator.test.ts — validação de chaves DeepSeek e Brave.
 * Fetch mockado por injeção de `fetchImpl` (nunca usa rede real).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateBraveKey, validateDeepseekKey } from '../electron/main/services/apiKeyValidator';

/** Cria um Response fake compatível com `fetch`. */
function fakeResponse(status: number, body: unknown = {}, statusText = ''): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => body,
  } as Response;
}

test('validateDeepseekKey: 200 com modelo alvo → válida + modelAvailable true', async () => {
  const seen: { url: string; headers: Record<string, string> }[] = [];
  const fetchImpl = (async (url: any, init?: any) => {
    seen.push({ url, headers: init.headers });
    return fakeResponse(200, {
      data: [{ id: 'deepseek-v4-flash' }, { id: 'deepseek-v4-pro' }],
    });
  }) as unknown as typeof fetch;

  const result = await validateDeepseekKey('sk-123', { fetchImpl });

  assert.equal(result.isValid, true);
  assert.equal(result.provider, 'deepseek');
  assert.equal(result.modelAvailable, true);
  assert.equal(seen[0].url, 'https://api.deepseek.com/models');
  assert.equal(seen[0].headers['Authorization'], 'Bearer sk-123');
});

test('validateDeepseekKey: 200 com id exato 0731 → modelAvailable true', async () => {
  const fetchImpl = (async () =>
    fakeResponse(200, { data: [{ id: 'deepseek-v4-flash-0731' }] })) as unknown as typeof fetch;
  const result = await validateDeepseekKey('sk-123', { fetchImpl });
  assert.equal(result.isValid, true);
  assert.equal(result.modelAvailable, true);
});

test('validateDeepseekKey: 200 sem modelo alvo → válida, modelAvailable false + nota', async () => {
  const fetchImpl = (async () =>
    fakeResponse(200, { data: [{ id: 'other-model' }] })) as unknown as typeof fetch;
  const result = await validateDeepseekKey('sk-123', { fetchImpl });
  assert.equal(result.isValid, true);
  assert.equal(result.modelAvailable, false);
  assert.ok(result.errorMessage && result.errorMessage.includes('modelo alvo'));
});

test('validateDeepseekKey: 200 sem data (lista ausente) → válida, modelAvailable false, não falha', async () => {
  const fetchImpl = (async () => fakeResponse(200, {})) as unknown as typeof fetch;
  const result = await validateDeepseekKey('sk-123', { fetchImpl });
  assert.equal(result.isValid, true);
  assert.equal(result.modelAvailable, false);
  assert.ok(result.errorMessage && result.errorMessage.includes('modelo alvo'));
});

test('validateDeepseekKey: 401 → inválida "Invalid API key"', async () => {
  const fetchImpl = (async () => fakeResponse(401)) as unknown as typeof fetch;
  const result = await validateDeepseekKey('sk-bad', { fetchImpl });
  assert.equal(result.isValid, false);
  assert.equal(result.errorMessage, 'Invalid API key');
});

test('validateDeepseekKey: 403 → inválida "Invalid API key"', async () => {
  const fetchImpl = (async () => fakeResponse(403)) as unknown as typeof fetch;
  const result = await validateDeepseekKey('sk-bad', { fetchImpl });
  assert.equal(result.isValid, false);
  assert.equal(result.errorMessage, 'Invalid API key');
});

test('validateDeepseekKey: 402 (sem créditos) → VÁLIDA', async () => {
  const fetchImpl = (async () => fakeResponse(402)) as unknown as typeof fetch;
  const result = await validateDeepseekKey('sk-123', { fetchImpl });
  assert.equal(result.isValid, true);
});

test('validateDeepseekKey: 429 (rate limit) → VÁLIDA', async () => {
  const fetchImpl = (async () => fakeResponse(429)) as unknown as typeof fetch;
  const result = await validateDeepseekKey('sk-123', { fetchImpl });
  assert.equal(result.isValid, true);
});

test('validateDeepseekKey: rede falhou → inválida com erro de rede', async () => {
  const fetchImpl = (async () => {
    throw new Error('ECONNREFUSED');
  }) as unknown as typeof fetch;
  const result = await validateDeepseekKey('sk-123', { fetchImpl });
  assert.equal(result.isValid, false);
  assert.ok(result.errorMessage && result.errorMessage.includes('ECONNREFUSED'));
});

test('validateDeepseekKey: chave vazia → inválida', async () => {
  const result = await validateDeepseekKey('', { fetchImpl: (async () => fakeResponse(200, {})) as unknown as typeof fetch });
  assert.equal(result.isValid, false);
  assert.equal(result.errorMessage, 'API key is empty');
});

test('validateDeepseekKey: baseUrl custom usada', async () => {
  const seen: string[] = [];
  const fetchImpl = (async (url: any) => {
    seen.push(url);
    return fakeResponse(200, { data: [{ id: 'deepseek-v4-flash' }] });
  }) as unknown as typeof fetch;
  await validateDeepseekKey('sk-123', { fetchImpl, baseUrl: 'https://proxy.test/v1/' });
  assert.equal(seen[0], 'https://proxy.test/v1/models');
});

// ─── Brave ────────────────────────────────────────────────────────────────────

test('validateBraveKey: 200 → válida', async () => {
  const seen: { url: string; headers: Record<string, string> }[] = [];
  const fetchImpl = (async (url: any, init?: any) => {
    seen.push({ url, headers: init.headers });
    return fakeResponse(200, { web: { results: [] } });
  }) as unknown as typeof fetch;

  const result = await validateBraveKey('key-abc', { fetchImpl });

  assert.equal(result.isValid, true);
  assert.equal(result.provider, 'brave');
  assert.equal(seen[0].url, 'https://api.search.brave.com/res/v1/web/search?q=test&count=1');
  assert.equal(seen[0].headers['X-Subscription-Token'], 'key-abc');
  assert.equal(seen[0].headers['Accept'], 'application/json');
});

test('validateBraveKey: 401 → inválida "Invalid API key"', async () => {
  const fetchImpl = (async () => fakeResponse(401)) as unknown as typeof fetch;
  const result = await validateBraveKey('bad', { fetchImpl });
  assert.equal(result.isValid, false);
  assert.equal(result.errorMessage, 'Invalid API key');
});

test('validateBraveKey: 403 → inválida', async () => {
  const fetchImpl = (async () => fakeResponse(403)) as unknown as typeof fetch;
  const result = await validateBraveKey('bad', { fetchImpl });
  assert.equal(result.isValid, false);
});

test('validateBraveKey: 429 → válida com nota de rate limit', async () => {
  const fetchImpl = (async () => fakeResponse(429)) as unknown as typeof fetch;
  const result = await validateBraveKey('key-abc', { fetchImpl });
  assert.equal(result.isValid, true);
  assert.ok(result.errorMessage && result.errorMessage.toLowerCase().includes('rate'));
});

test('validateBraveKey: rede falhou → inválida', async () => {
  const fetchImpl = (async () => {
    throw new Error('down');
  }) as unknown as typeof fetch;
  const result = await validateBraveKey('key-abc', { fetchImpl });
  assert.equal(result.isValid, false);
  assert.ok(result.errorMessage && result.errorMessage.includes('down'));
});

test('validateBraveKey: 500 com corpo de erro → inválida com mensagem', async () => {
  const fetchImpl = (async () => fakeResponse(500, { error: { message: 'server exploded' } })) as unknown as typeof fetch;
  const result = await validateBraveKey('key-abc', { fetchImpl });
  assert.equal(result.isValid, false);
  assert.equal(result.errorMessage, 'server exploded');
});