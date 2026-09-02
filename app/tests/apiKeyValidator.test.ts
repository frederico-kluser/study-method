/**
 * tests/apiKeyValidator.test.ts — validação de chaves do LLM (OpenRouter) e
 * Brave. Fetch mockado por injeção de `fetchImpl` (nunca usa rede real).
 *
 * O TESTE QUE JUSTIFICA ESTA SUÍTE é o "chave inválida NÃO passa mesmo com
 * /models 200": no OpenRouter `GET /api/v1/models` é PÚBLICO e responde 200
 * com o catálogo inteiro para qualquer chave (inclusive morta ou ausente).
 * Validar por /models faria qualquer string passar; a fonte de verdade é
 * `GET /api/v1/key`, que devolve 401 para chave revogada.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateBraveKey, validateLlmKey, modelSearchQuery } from '../electron/main/services/apiKeyValidator';

/** Endpoint AUTENTICADO — a única fonte de verdade da validade da chave. */
const KEY_URL = 'https://openrouter.ai/api/v1/key';
/** Endpoint PÚBLICO do catálogo — só preenche `modelAvailable`. */
const MODELS_PREFIX = 'https://openrouter.ai/api/v1/models';
/** Model id alvo do contrato congelado (shared/llm/constants.ts). */
const TARGET_MODEL = 'z-ai/glm-5.3-flash';

/** Cria um Response fake compatível com `fetch`. */
function fakeResponse(status: number, body: unknown = {}, statusText = ''): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => body,
  } as Response;
}

interface SeenCall {
  url: string;
  headers: Record<string, string>;
}

/**
 * fetch fake que ROTEIA por URL: `/key` (validade) e `/models` (catálogo) são
 * respostas independentes — é assim que se prova que a validade NÃO vem do
 * catálogo. Registra cada chamada em `seen`.
 */
function routerFetch(opts: {
  key: () => Response | Promise<Response>;
  models?: () => Response | Promise<Response>;
  seen?: SeenCall[];
}): typeof fetch {
  return (async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    opts.seen?.push({ url: u, headers: (init?.headers ?? {}) as Record<string, string> });
    if (u.startsWith(MODELS_PREFIX)) {
      if (!opts.models) throw new Error(`/models não deveria ser chamado: ${u}`);
      return opts.models();
    }
    return opts.key();
  }) as unknown as typeof fetch;
}

/** Catálogo do OpenRouter contendo o modelo alvo. */
function catalogWithTarget(): Response {
  return fakeResponse(200, {
    data: [{ id: 'openai/gpt-4o' }, { id: TARGET_MODEL }, { id: 'z-ai/glm-5.3-air' }],
  });
}

// ─── OpenRouter (validateLlmKey — canal keys:validate-llm) ──

test('validateLlmKey: valida em GET /api/v1/key (NÃO em /models) com Bearer', async () => {
  const seen: SeenCall[] = [];
  const result = await validateLlmKey('sk-or-v1-123', {
    fetchImpl: routerFetch({ key: () => fakeResponse(200, { data: { label: 'k' } }), models: catalogWithTarget, seen }),
  });

  assert.equal(result.isValid, true);
  assert.equal(result.provider, 'openrouter');
  // A PRIMEIRA chamada — a que decide a validade — é a do endpoint autenticado.
  assert.equal(seen[0].url, KEY_URL);
  assert.equal(seen[0].headers['Authorization'], 'Bearer sk-or-v1-123');
});

test('SEGURANÇA: chave inválida é REPROVADA mesmo com /models respondendo 200', async () => {
  // Este é o bug que a migração previne: /api/v1/models é público e devolve o
  // catálogo inteiro com 200 mesmo para uma chave revogada. Se a validação
  // olhasse /models, QUALQUER string passaria.
  const seen: SeenCall[] = [];
  const result = await validateLlmKey('sk-or-v1-revogada', {
    fetchImpl: routerFetch({
      key: () => fakeResponse(401, { error: { message: 'User not found.', code: 401 } }),
      models: catalogWithTarget, // 200 com o catálogo COMPLETO — e ainda assim inválida
      seen,
    }),
  });

  assert.equal(result.isValid, false, 'chave morta NUNCA pode passar por causa do /models público');
  assert.equal(result.errorMessage, 'Invalid API key');
  assert.equal(result.provider, 'openrouter');
  // E nem chegou a consultar o catálogo: chave reprovada encerra o pipeline.
  assert.deepEqual(seen.map((c) => c.url), [KEY_URL]);
});

test('validateLlmKey: 200 + catálogo com o id EXATO → modelAvailable true', async () => {
  const seen: SeenCall[] = [];
  const result = await validateLlmKey('sk-or-v1-123', {
    fetchImpl: routerFetch({ key: () => fakeResponse(200), models: catalogWithTarget, seen }),
  });

  assert.equal(result.isValid, true);
  assert.equal(result.modelAvailable, true);
  assert.equal(result.errorMessage, undefined);
  // O probe do catálogo usa o termo curto derivado do id (q=glm) — busca fuzzy.
  const modelsCall = seen.find((c) => c.url.startsWith(MODELS_PREFIX));
  assert.ok(modelsCall, '/models deveria ter sido consultado como COMPLEMENTO');
  assert.equal(modelsCall!.url, `${MODELS_PREFIX}?q=glm`);
  assert.equal(modelsCall!.headers['Authorization'], 'Bearer sk-or-v1-123');
});

test('validateLlmKey: catálogo SEM o id exato → válida, modelAvailable false + nota', async () => {
  const result = await validateLlmKey('sk-or-v1-123', {
    fetchImpl: routerFetch({
      key: () => fakeResponse(200),
      // Ids parecidos, mas nenhum é o alvo: o match é pelo id EXATO.
      models: () => fakeResponse(200, { data: [{ id: 'z-ai/glm-5.3-air' }, { id: 'z-ai/glm-4' }] }),
    }),
  });
  assert.equal(result.isValid, true, 'catálogo NUNCA derruba a chave');
  assert.equal(result.modelAvailable, false);
  assert.ok(result.errorMessage && result.errorMessage.includes(TARGET_MODEL));
});

test('validateLlmKey: probe do catálogo falhou (500) → válida, modelAvailable indefinido', async () => {
  const result = await validateLlmKey('sk-or-v1-123', {
    fetchImpl: routerFetch({
      key: () => fakeResponse(200),
      models: () => fakeResponse(500, { error: { message: 'catalog down' } }),
    }),
  });
  assert.equal(result.isValid, true, 'falha do complemento não derruba a validação da chave');
  assert.equal(result.modelAvailable, undefined);
  assert.equal(result.errorMessage, undefined, 'sem nota assustadora quando não se sabe');
});

test('validateLlmKey: probe do catálogo com rede caída → válida, modelAvailable indefinido', async () => {
  const result = await validateLlmKey('sk-or-v1-123', {
    fetchImpl: routerFetch({
      key: () => fakeResponse(200),
      models: () => {
        throw new TypeError('fetch failed');
      },
    }),
  });
  assert.equal(result.isValid, true);
  assert.equal(result.modelAvailable, undefined);
});

test('validateLlmKey: catálogo 200 sem `data` array → modelAvailable indefinido (shape desconhecido)', async () => {
  const result = await validateLlmKey('sk-or-v1-123', {
    fetchImpl: routerFetch({ key: () => fakeResponse(200), models: () => fakeResponse(200, {}) }),
  });
  assert.equal(result.isValid, true);
  assert.equal(result.modelAvailable, undefined);
});

test('validateLlmKey: 401 → inválida "Invalid API key"', async () => {
  const fetchImpl = (async () => fakeResponse(401)) as unknown as typeof fetch;
  const result = await validateLlmKey('sk-or-v1-bad', { fetchImpl });
  assert.equal(result.isValid, false);
  assert.equal(result.errorMessage, 'Invalid API key');
});

test('validateLlmKey: 403 → inválida "Invalid API key"', async () => {
  const fetchImpl = (async () => fakeResponse(403)) as unknown as typeof fetch;
  const result = await validateLlmKey('sk-or-v1-bad', { fetchImpl });
  assert.equal(result.isValid, false);
  assert.equal(result.errorMessage, 'Invalid API key');
});

test('validateLlmKey: 402 (crédito insuficiente no OpenRouter) → VÁLIDA, sem consultar o catálogo', async () => {
  const seen: SeenCall[] = [];
  const result = await validateLlmKey('sk-or-v1-123', {
    fetchImpl: routerFetch({ key: () => fakeResponse(402), seen }),
  });
  assert.equal(result.isValid, true, '402 é falta de crédito, não chave inválida');
  assert.equal(result.modelAvailable, undefined);
  assert.deepEqual(seen.map((c) => c.url), [KEY_URL]);
});

test('validateLlmKey: 429 (rate limit) → VÁLIDA, sem consultar o catálogo', async () => {
  const seen: SeenCall[] = [];
  const result = await validateLlmKey('sk-or-v1-123', {
    fetchImpl: routerFetch({ key: () => fakeResponse(429), seen }),
  });
  assert.equal(result.isValid, true);
  assert.deepEqual(seen.map((c) => c.url), [KEY_URL]);
});

test('validateLlmKey: rede falhou → inválida com erro de rede', async () => {
  const fetchImpl = (async () => {
    throw new Error('ECONNREFUSED');
  }) as unknown as typeof fetch;
  const result = await validateLlmKey('sk-or-v1-123', { fetchImpl });
  assert.equal(result.isValid, false);
  assert.ok(result.errorMessage && result.errorMessage.includes('ECONNREFUSED'));
  assert.match(result.errorMessage ?? '', /^Network error:/);
});

test('validateLlmKey: chave vazia → inválida', async () => {
  const result = await validateLlmKey('', {
    fetchImpl: (async () => fakeResponse(200, {})) as unknown as typeof fetch,
  });
  assert.equal(result.isValid, false);
  assert.equal(result.errorMessage, 'API key is empty');
  assert.equal(result.provider, 'openrouter');
});

test('validateLlmKey: baseUrl custom usada (com barras finais removidas)', async () => {
  const seen: string[] = [];
  const fetchImpl = (async (url: any) => {
    seen.push(String(url));
    return String(url).includes('/models') ? catalogWithTarget() : fakeResponse(200);
  }) as unknown as typeof fetch;
  await validateLlmKey('sk-or-v1-123', { fetchImpl, baseUrl: 'https://proxy.test/v1/' });
  assert.equal(seen[0], 'https://proxy.test/v1/key');
  assert.equal(seen[1], 'https://proxy.test/v1/models?q=glm');
});

test('validateLlmKey: 500 com corpo { error: { message } } → mensagem extraída', async () => {
  const fetchImpl = (async () =>
    fakeResponse(500, { error: { message: 'openrouter down' } })) as unknown as typeof fetch;
  const result = await validateLlmKey('sk-or-v1-123', { fetchImpl });
  assert.equal(result.isValid, false);
  assert.equal(result.errorMessage, 'openrouter down');
});

test('validateLlmKey: 500 com corpo { message } (sem { error }) → mensagem extraída', async () => {
  const fetchImpl = (async () =>
    fakeResponse(500, { message: 'plain message' })) as unknown as typeof fetch;
  const result = await validateLlmKey('sk-or-v1-123', { fetchImpl });
  assert.equal(result.isValid, false);
  assert.equal(result.errorMessage, 'plain message');
});

test('validateLlmKey: 500 com corpo não-parseável → fallback HTTP status', async () => {
  const fetchImpl = (async () =>
    fakeResponse(500, 'not json', 'Internal Server Error')) as unknown as typeof fetch;
  const result = await validateLlmKey('sk-or-v1-123', { fetchImpl });
  assert.equal(result.isValid, false);
  assert.equal(result.errorMessage, 'HTTP 500: Internal Server Error');
});

test('validateLlmKey: 500 com corpo parseável mas sem mensagem → fallback HTTP status', async () => {
  const fetchImpl = (async () => fakeResponse(500, { code: 'XYZ' })) as unknown as typeof fetch;
  const result = await validateLlmKey('sk-or-v1-123', { fetchImpl });
  assert.equal(result.isValid, false);
  assert.ok(result.errorMessage && result.errorMessage.includes('HTTP 500'));
});

test('validateLlmKey: 200 com corpo ilegível em /key → segue VÁLIDA (corpo é irrelevante)', async () => {
  const fetchImpl = (async (url: any) => {
    if (String(url).includes('/models')) return catalogWithTarget();
    const r = fakeResponse(200);
    (r as { json: () => Promise<unknown> }).json = async () => {
      throw new Error('bad json');
    };
    return r;
  }) as unknown as typeof fetch;
  const result = await validateLlmKey('sk-or-v1-123', { fetchImpl });
  assert.equal(result.isValid, true);
  assert.equal(result.modelAvailable, true);
});

test('modelSearchQuery: termo curto e estável derivado do id do modelo', () => {
  assert.equal(modelSearchQuery('z-ai/glm-5.3-flash'), 'glm');
  assert.equal(modelSearchQuery('openai/gpt-4o'), 'gpt');
  assert.equal(modelSearchQuery('sem-barra'), 'sem');
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

test('validateBraveKey: chave vazia → inválida "API key is empty"', async () => {
  const result = await validateBraveKey('', { fetchImpl: (async () => fakeResponse(200, {})) as unknown as typeof fetch });
  assert.equal(result.isValid, false);
  assert.equal(result.errorMessage, 'API key is empty');
});

test('validateBraveKey: baseUrl custom usada (com barras finais removidas)', async () => {
  const seen: string[] = [];
  const fetchImpl = (async (url: any) => {
    seen.push(url);
    return fakeResponse(200, {});
  }) as unknown as typeof fetch;
  await validateBraveKey('key-abc', { fetchImpl, baseUrl: 'https://proxy.brave.test/v1//' });
  assert.equal(seen[0], 'https://proxy.brave.test/v1/res/v1/web/search?q=test&count=1');
});

test('validateBraveKey: 500 com corpo não-JSON → fallback HTTP status (json() lança)', async () => {
  // json() do fake lança → o validador cai no fallback HTTP status.
  const fetchImplThrows = (async () => {
    const r = fakeResponse(500, {}, 'Server Error');
    (r as { json: () => Promise<unknown> }).json = async () => {
      throw new Error('bad json');
    };
    return r;
  }) as unknown as typeof fetch;
  const result = await validateBraveKey('key-abc', { fetchImpl: fetchImplThrows });
  assert.equal(result.isValid, false);
  assert.ok(result.errorMessage && result.errorMessage.includes('HTTP 500'));
});
