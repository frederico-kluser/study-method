/**
 * tests/deepseekClient.test.ts — cliente one-shot (OpenRouter) com fetch fake injetado.
 * NUNCA usa rede real. Cobre: 200 parse, 401/403 ⇒ KEY_INVALID, 429 ⇒ RATE_LIMIT,
 * 400/404 ⇒ BAD_REQUEST, 5xx com corpo, falha de rede, sem chave (KEY_MISSING),
 * timeout via AbortController, headers corretos (incl. attribution), model default
 * literal, content vazio ⇒ EMPTY_CONTENT (com/sem raciocínio) e sanitização da
 * chave nas mensagens de erro. Também testa as funções puras parseChoiceResult e
 * parseRetryAfterMs.
 *
 * ONDA 1 (transporte OpenRouter): as asserções de URL/modelo passaram a apontar
 * para https://openrouter.ai/api/v1 e z-ai/glm-5.3-flash, e há cobertura nova do
 * body obrigatório (`reasoning.effort: 'max'`, `provider.require_parameters`,
 * `usage.include`), do mascaramento de uma chave `sk-or-v1-…` (que CONTÉM hífens
 * e vazava com a regex antiga), do `reasoning_tokens` ANINHADO em
 * `completion_tokens_details` e da captura do header `Retry-After`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDeepSeekClient,
  DEEPSEEK_ERROR_CODES,
  DeepSeekError,
  parseChoiceResult,
  parseRetryAfterMs,
  renderSanitizedBodyFragment,
} from '../electron/main/services/deepseekClient';

/** Chave real-shaped do OpenRouter: `sk-or-v1-` + hex. TEM HÍFENS (é o ponto). */
const OPENROUTER_SHAPED_KEY =
  'sk-or-v1-key';

function fakeResponse(
  status: number,
  body: unknown = {},
  statusText = '',
  headers?: Record<string, string>
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    // Headers case-insensitive como os de uma Response real.
    headers: {
      get: (name: string) => {
        if (!headers) return null;
        const hit = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
        return hit ? headers[hit] : null;
      },
    },
    json: async () => body,
  } as unknown as Response;
}

type FetchCall = {
  url: string;
  init?: RequestInit;
  signal?: AbortSignal;
};

/** Captura a chamada e devolve `respond`. */
function makeFetch(respond: (call: FetchCall) => Promise<Response> | Response) {
  const calls: FetchCall[] = [];
  const fetchImpl = (async (url: any, init?: any) => {
    const call: FetchCall = { url, init };
    calls.push(call);
    return respond(call);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

test('chatCompletion: 200 → parsea content/model/usage e envia headers + model default', async () => {
  const { fetchImpl, calls } = makeFetch(() =>
    fakeResponse(200, {
      choices: [{ message: { content: '  {"ok":true}  ' } }],
      model: 'z-ai/glm-5.3-flash',
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    })
  );
  const client = createDeepSeekClient({ fetchImpl, apiKey: async () => 'sk-test' });

  const res = await client.chatCompletion({
    messages: [{ role: 'user', content: 'hi' }],
  });

  assert.equal(res.content, '{"ok":true}');
  assert.equal(res.model, 'z-ai/glm-5.3-flash');
  assert.deepEqual(res.usage, { promptTokens: 10, completionTokens: 5 });

  assert.equal(calls.length, 1);
  const init = calls[0].init!;
  assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/chat/completions');
  const headers = init.headers as Record<string, string>;
  assert.equal(headers.Authorization, 'Bearer sk-test');
  assert.equal(headers['Content-Type'], 'application/json');
  const body = JSON.parse(init.body as string);
  assert.equal(body.model, 'z-ai/glm-5.3-flash'); // literal do contrato
  assert.equal(body.temperature, 0); // default
  assert.equal(body.messages.length, 1);
  assert.equal(body.stream, undefined, 'one-shot: nunca envia stream');
});

test('chatCompletion: envia os headers de ATTRIBUTION do OpenRouter (HTTP-Referer + X-Title)', async () => {
  const { fetchImpl, calls } = makeFetch(() =>
    fakeResponse(200, { choices: [{ message: { content: '{}' } }] })
  );
  await createDeepSeekClient({ fetchImpl, apiKey: async () => 'k' }).chatCompletion({
    messages: [{ role: 'user', content: 'x' }],
  });
  const headers = calls[0].init!.headers as Record<string, string>;
  assert.ok(headers['HTTP-Referer'], 'HTTP-Referer é o header de attribution correto');
  assert.ok(headers['X-Title'], 'X-Title é o header de attribution correto');
  // `X-OpenRouter-App` NÃO existe — não pode aparecer.
  assert.equal(headers['X-OpenRouter-App'], undefined);
});

test('chatCompletion: body SEMPRE traz reasoning max + provider.require_parameters + usage.include', async () => {
  const { fetchImpl, calls } = makeFetch(() =>
    fakeResponse(200, { choices: [{ message: { content: '{}' } }] })
  );
  await createDeepSeekClient({ fetchImpl, apiKey: async () => 'k' }).chatCompletion({
    messages: [{ role: 'user', content: 'x' }],
  });
  const body = JSON.parse(calls[0].init!.body as string);
  assert.equal(body.reasoning.enabled, true);
  assert.equal(body.reasoning.effort, 'max', "'max' é o topo aceito por z-ai/glm-5.3-flash");
  // LOAD-BEARING: sem require_parameters o OpenRouter pode rotear para um
  // provider que IGNORA reasoning e devolver 200 sem raciocínio, em silêncio.
  assert.equal(body.provider.require_parameters, true);
  assert.equal(body.usage.include, true, 'usage.include traz custo e reasoning_tokens');
});

test('chatCompletion: reasoningEffort injetável pede MENOS raciocínio (default continua max)', async () => {
  const low = makeFetch(() => fakeResponse(200, { choices: [{ message: { content: '{}' } }] }));
  await createDeepSeekClient({ fetchImpl: low.fetchImpl, apiKey: async () => 'k' }).chatCompletion({
    messages: [{ role: 'user', content: 'x' }],
    reasoningEffort: 'low',
  });
  assert.equal(JSON.parse(low.calls[0].init!.body as string).reasoning.effort, 'low');

  const dflt = makeFetch(() => fakeResponse(200, { choices: [{ message: { content: '{}' } }] }));
  await createDeepSeekClient({ fetchImpl: dflt.fetchImpl, apiKey: async () => 'k' }).chatCompletion({
    messages: [{ role: 'user', content: 'x' }],
  });
  assert.equal(JSON.parse(dflt.calls[0].init!.body as string).reasoning.effort, 'max');
});

test('chatCompletion: usage → reasoningTokens vem ANINHADO em completion_tokens_details + costUsd', async () => {
  const { fetchImpl } = makeFetch(() =>
    fakeResponse(200, {
      choices: [{ message: { content: 'ok' } }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 250,
        completion_tokens_details: { reasoning_tokens: 4096 },
        cost: 0.0123,
      },
    })
  );
  const res = await createDeepSeekClient({ fetchImpl, apiKey: async () => 'k' }).chatCompletion({
    messages: [{ role: 'user', content: 'x' }],
  });
  assert.deepEqual(res.usage, {
    promptTokens: 100,
    completionTokens: 250,
    reasoningTokens: 4096,
    costUsd: 0.0123,
  });
});

test('chatCompletion: reasoning_tokens no TOPO de usage é ignorado (o campo real é aninhado)', async () => {
  const { fetchImpl } = makeFetch(() =>
    fakeResponse(200, {
      choices: [{ message: { content: 'ok' } }],
      // GOTCHA: não existe `reasoning_tokens` no topo de `usage`.
      usage: { prompt_tokens: 1, completion_tokens: 2, reasoning_tokens: 999 },
    })
  );
  const res = await createDeepSeekClient({ fetchImpl, apiKey: async () => 'k' }).chatCompletion({
    messages: [{ role: 'user', content: 'x' }],
  });
  assert.deepEqual(res.usage, { promptTokens: 1, completionTokens: 2 });
});

test('chatCompletion: sem maxTokens não envia max_tokens; com maxTokens envia', async () => {
  const without = makeFetch(() => fakeResponse(200, { choices: [{ message: { content: '{}' } }] }));
  await createDeepSeekClient({ fetchImpl: without.fetchImpl, apiKey: async () => 'k' })
    .chatCompletion({ messages: [{ role: 'user', content: 'x' }] });
  assert.equal('max_tokens' in JSON.parse(without.calls[0].init!.body as string), false);

  const withTx = makeFetch(() => fakeResponse(200, { choices: [{ message: { content: '{}' } }] }));
  await createDeepSeekClient({ fetchImpl: withTx.fetchImpl, apiKey: async () => 'k' })
    .chatCompletion({ messages: [{ role: 'user', content: 'x' }], maxTokens: 2048 });
  assert.equal(JSON.parse(withTx.calls[0].init!.body as string).max_tokens, 2048);
});

test('chatCompletion: 401 → DEEPSEEK_KEY_INVALID', async () => {
  const { fetchImpl } = makeFetch(() => fakeResponse(401, { error: { message: 'Invalid API key' } }));
  await assert.rejects(
    createDeepSeekClient({ fetchImpl, apiKey: async () => 'bad' }).chatCompletion({ messages: [{ role: 'user', content: 'x' }] }),
    (e: unknown) => e instanceof DeepSeekError && e.code === DEEPSEEK_ERROR_CODES.KEY_INVALID
  );
});

test('chatCompletion: 403 → DEEPSEEK_KEY_INVALID', async () => {
  const { fetchImpl } = makeFetch(() => fakeResponse(403, { error: { message: 'Forbidden' } }));
  await assert.rejects(
    createDeepSeekClient({ fetchImpl, apiKey: async () => 'bad' }).chatCompletion({ messages: [{ role: 'user', content: 'x' }] }),
    (e: unknown) => e instanceof DeepSeekError && e.code === DEEPSEEK_ERROR_CODES.KEY_INVALID
  );
});

test('chatCompletion: 429 → DEEPSEEK_RATE_LIMIT', async () => {
  const { fetchImpl } = makeFetch(() => fakeResponse(429, { error: { message: 'Rate limit' } }));
  await assert.rejects(
    createDeepSeekClient({ fetchImpl, apiKey: async () => 'k' }).chatCompletion({ messages: [{ role: 'user', content: 'x' }] }),
    (e: unknown) => e instanceof DeepSeekError && e.code === DEEPSEEK_ERROR_CODES.RATE_LIMIT
  );
});

test('chatCompletion: 429 com Retry-After em SEGUNDOS → erro carrega retryAfterMs', async () => {
  const { fetchImpl } = makeFetch(() =>
    fakeResponse(429, { error: { message: 'Rate limit' } }, '', { 'Retry-After': '12' })
  );
  await assert.rejects(
    createDeepSeekClient({ fetchImpl, apiKey: async () => 'k' }).chatCompletion({ messages: [{ role: 'user', content: 'x' }] }),
    (e: unknown) =>
      e instanceof DeepSeekError &&
      e.code === DEEPSEEK_ERROR_CODES.RATE_LIMIT &&
      e.retryAfterMs === 12_000
  );
});

test('chatCompletion: 429 com Retry-After em DATA HTTP → retryAfterMs em milissegundos', async () => {
  const when = new Date(Date.now() + 30_000).toUTCString();
  const { fetchImpl } = makeFetch(() =>
    fakeResponse(429, { error: { message: 'Rate limit' } }, '', { 'retry-after': when })
  );
  await assert.rejects(
    createDeepSeekClient({ fetchImpl, apiKey: async () => 'k' }).chatCompletion({ messages: [{ role: 'user', content: 'x' }] }),
    (e: unknown) =>
      e instanceof DeepSeekError &&
      typeof e.retryAfterMs === 'number' &&
      e.retryAfterMs > 25_000 &&
      e.retryAfterMs <= 31_000
  );
});

test('chatCompletion: 429 SEM Retry-After (ou com lixo) → retryAfterMs undefined', async () => {
  const semHeader = makeFetch(() => fakeResponse(429, { error: { message: 'Rate limit' } }));
  await assert.rejects(
    createDeepSeekClient({ fetchImpl: semHeader.fetchImpl, apiKey: async () => 'k' }).chatCompletion({ messages: [{ role: 'user', content: 'x' }] }),
    (e: unknown) => e instanceof DeepSeekError && e.retryAfterMs === undefined
  );

  const lixo = makeFetch(() =>
    fakeResponse(429, { error: { message: 'Rate limit' } }, '', { 'Retry-After': 'logo ali' })
  );
  await assert.rejects(
    createDeepSeekClient({ fetchImpl: lixo.fetchImpl, apiKey: async () => 'k' }).chatCompletion({ messages: [{ role: 'user', content: 'x' }] }),
    (e: unknown) => e instanceof DeepSeekError && e.retryAfterMs === undefined
  );
});

test('chatCompletion: 503 com Retry-After também expõe retryAfterMs', async () => {
  const { fetchImpl } = makeFetch(() =>
    fakeResponse(503, { error: { message: 'no available provider' } }, '', { 'Retry-After': '2' })
  );
  await assert.rejects(
    createDeepSeekClient({ fetchImpl, apiKey: async () => 'k' }).chatCompletion({ messages: [{ role: 'user', content: 'x' }] }),
    (e: unknown) =>
      e instanceof DeepSeekError &&
      e.code === DEEPSEEK_ERROR_CODES.SERVER_ERROR &&
      e.retryAfterMs === 2000
  );
});

test('chatCompletion: 5xx → DEEPSEEK_SERVER_ERROR com mensagem de error.message', async () => {
  const { fetchImpl } = makeFetch(() =>
    fakeResponse(503, { error: { message: 'model overloaded' } })
  );
  await assert.rejects(
    createDeepSeekClient({ fetchImpl, apiKey: async () => 'k' }).chatCompletion({ messages: [{ role: 'user', content: 'x' }] }),
    (e: unknown) => e instanceof DeepSeekError && e.code === DEEPSEEK_ERROR_CODES.SERVER_ERROR && /model overloaded/.test(e.message)
  );
});

test('chatCompletion: 5xx sem corpo parseável → SERVER_ERROR com mensagem padrão', async () => {
  const { fetchImpl } = makeFetch(() => fakeResponse(500, 'nope'));
  await assert.rejects(
    createDeepSeekClient({ fetchImpl, apiKey: async () => 'k' }).chatCompletion({ messages: [{ role: 'user', content: 'x' }] }),
    (e: unknown) => e instanceof DeepSeekError && e.code === DEEPSEEK_ERROR_CODES.SERVER_ERROR && /HTTP 500/.test(e.message)
  );
});

test('chatCompletion: fetch lança → DEEPSEEK_NETWORK (mensagem não expõe a chave)', async () => {
  const fetchImpl = (async () => {
    throw new Error('ECONNREFUSED boom');
  }) as unknown as typeof fetch;
  await assert.rejects(
    createDeepSeekClient({ fetchImpl, apiKey: async () => 'sk-secret-123' }).chatCompletion({ messages: [{ role: 'user', content: 'x' }] }),
    (e: unknown) =>
      e instanceof DeepSeekError &&
      e.code === DEEPSEEK_ERROR_CODES.NETWORK &&
      String(e.message).includes('sk-secret-123') === false
  );
});

test('chatCompletion: sem chave (apiKey vazia) → KEY_MISSING sem tocar a rede', async () => {
  let networkCalls = 0;
  const fetchImpl = (async () => {
    networkCalls += 1;
    return fakeResponse(200, { choices: [{ message: { content: '{}' } }] });
  }) as unknown as typeof fetch;
  await assert.rejects(
    createDeepSeekClient({ fetchImpl, apiKey: async () => '' }).chatCompletion({ messages: [{ role: 'user', content: 'x' }] }),
    (e: unknown) => e instanceof DeepSeekError && e.code === DEEPSEEK_ERROR_CODES.KEY_MISSING
  );
  assert.equal(networkCalls, 0);
});

test('chatCompletion: sem dep.apiKey → KEY_MISSING', async () => {
  await assert.rejects(
    createDeepSeekClient({}).chatCompletion({ messages: [{ role: 'user', content: 'x' }] }),
    (e: unknown) => e instanceof DeepSeekError && e.code === DEEPSEEK_ERROR_CODES.KEY_MISSING
  );
});

test('chatCompletion: timeout aborta o AbortController e lança NETWORK', async () => {
  const aborted: boolean[] = [];
  const fetchImpl = (async (_url: any, init?: any) => {
    return await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        aborted.push(true);
        const e = new Error('Aborted');
        e.name = 'AbortError';
        reject(e);
      });
    });
  }) as unknown as typeof fetch;

  await assert.rejects(
    createDeepSeekClient({ fetchImpl, apiKey: async () => 'k' }).chatCompletion({
      messages: [{ role: 'user', content: 'x' }],
      timeoutMs: 5,
    }),
    (e: unknown) => e instanceof DeepSeekError && e.code === DEEPSEEK_ERROR_CODES.NETWORK && /timeout/i.test(e.message)
  );
  assert.equal(aborted.length, 1, 'o AbortController deve ter abortado antes de ceder');
});

test('chatCompletion: default timeout 60s — aborta se nunca responder', async () => {
  const aborted: boolean[] = [];
  const fetchImpl = (async (_url: any, init?: any) => {
    return await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        aborted.push(true);
        const e = new Error('Aborted');
        e.name = 'AbortError';
        reject(e);
      });
    });
  }) as unknown as typeof fetch;

  await assert.rejects(
    createDeepSeekClient({ fetchImpl, apiKey: async () => 'k' }).chatCompletion({
      messages: [{ role: 'user', content: 'x' }],
      timeoutMs: 3,
    }),
    (e: unknown) => e instanceof DeepSeekError && e.code === DEEPSEEK_ERROR_CODES.NETWORK
  );
  assert.equal(aborted.length, 1);
});

test('chatCompletion: uma ÚNICA tentativa — o retry é do backoff, não do cliente', async () => {
  const { fetchImpl, calls } = makeFetch(() => fakeResponse(429, { error: { message: 'slow down' } }));
  await assert.rejects(
    createDeepSeekClient({ fetchImpl, apiKey: async () => 'k' }).chatCompletion({ messages: [{ role: 'user', content: 'x' }] }),
    (e: unknown) => e instanceof DeepSeekError
  );
  assert.equal(calls.length, 1);
});

test('chatCompletion: resposta sem choices content → EMPTY_CONTENT', async () => {
  const { fetchImpl } = makeFetch(() => fakeResponse(200, { choices: [] }));
  await assert.rejects(
    createDeepSeekClient({ fetchImpl, apiKey: async () => 'k' }).chatCompletion({ messages: [{ role: 'user', content: 'x' }] }),
    (e: unknown) => e instanceof DeepSeekError && e.code === DEEPSEEK_ERROR_CODES.EMPTY_CONTENT
  );
});

test('chatCompletion: content vazio mas reasoning_content presente → EMPTY_CONTENT claro (sem engolir)', async () => {
  const { fetchImpl } = makeFetch(() =>
    fakeResponse(200, {
      choices: [{ message: { role: 'assistant', content: '', reasoning_content: 'pensando…' } }],
    })
  );
  await assert.rejects(
    createDeepSeekClient({ fetchImpl, apiKey: async () => 'k' }).chatCompletion({ messages: [{ role: 'user', content: 'x' }] }),
    (e: unknown) =>
      e instanceof DeepSeekError &&
      e.code === DEEPSEEK_ERROR_CODES.EMPTY_CONTENT &&
      /reasoning_content/.test(e.message)
  );
});

test('chatCompletion: content vazio com `reasoning` (OpenRouter) → EMPTY_CONTENT claro', async () => {
  const { fetchImpl } = makeFetch(() =>
    fakeResponse(200, {
      choices: [{ message: { role: 'assistant', content: '', reasoning: 'raciocinando…' } }],
    })
  );
  await assert.rejects(
    createDeepSeekClient({ fetchImpl, apiKey: async () => 'k' }).chatCompletion({ messages: [{ role: 'user', content: 'x' }] }),
    (e: unknown) =>
      e instanceof DeepSeekError &&
      e.code === DEEPSEEK_ERROR_CODES.EMPTY_CONTENT &&
      /raciocínio/.test(e.message)
  );
});

test('chatCompletion: content vazio com `reasoning_details` → EMPTY_CONTENT claro', async () => {
  const { fetchImpl } = makeFetch(() =>
    fakeResponse(200, {
      choices: [
        {
          message: {
            role: 'assistant',
            content: '',
            reasoning_details: [{ type: 'reasoning.text', text: 'passo a passo' }],
          },
        },
      ],
    })
  );
  await assert.rejects(
    createDeepSeekClient({ fetchImpl, apiKey: async () => 'k' }).chatCompletion({ messages: [{ role: 'user', content: 'x' }] }),
    (e: unknown) =>
      e instanceof DeepSeekError && e.code === DEEPSEEK_ERROR_CODES.EMPTY_CONTENT
  );
});

test('chatCompletion: 400 invalid_request_error → BAD_REQUEST com mensagem do gateway (sem vazar a chave)', async () => {
  const { fetchImpl } = makeFetch(() =>
    fakeResponse(400, {
      error: {
        message: 'z-ai/glm-5.3-flash-0731 is not a valid model ID',
        type: 'invalid_request_error',
      },
    })
  );
  await assert.rejects(
    createDeepSeekClient({ fetchImpl, apiKey: async () => 'sk-secret-123' }).chatCompletion({
      messages: [{ role: 'user', content: 'x' }],
    }),
    (e: unknown) =>
      e instanceof DeepSeekError &&
      e.code === DEEPSEEK_ERROR_CODES.BAD_REQUEST &&
      /not a valid model ID/.test(e.message) &&
      e.message.includes('sk-secret-123') === false
  );
});

test('chatCompletion: 404 → BAD_REQUEST', async () => {
  const { fetchImpl } = makeFetch(() => fakeResponse(404, { error: { message: 'not found' } }));
  await assert.rejects(
    createDeepSeekClient({ fetchImpl, apiKey: async () => 'k' }).chatCompletion({ messages: [{ role: 'user', content: 'x' }] }),
    (e: unknown) => e instanceof DeepSeekError && e.code === DEEPSEEK_ERROR_CODES.BAD_REQUEST
  );
});

test('chatCompletion: 400 refletindo uma chave sk-or-v1-… → mensagem SEM nenhum pedaço da chave', async () => {
  // O gateway devolve o header refletido no corpo; a chave configurada no cliente
  // é OUTRA (cenário em que só o REGEX defende). Com a regex antiga
  // (`sk-[A-Za-z0-9]{6,}`) só `sk-or` seria mascarado e o resto vazaria.
  const { fetchImpl } = makeFetch(() =>
    fakeResponse(400, {
      error: { message: `bad auth header: Bearer ${OPENROUTER_SHAPED_KEY}` },
    })
  );
  await assert.rejects(
    createDeepSeekClient({ fetchImpl, apiKey: async () => 'sk-outra-chave-qualquer' }).chatCompletion({
      messages: [{ role: 'user', content: 'x' }],
    }),
    (e: unknown) =>
      e instanceof DeepSeekError &&
      e.code === DEEPSEEK_ERROR_CODES.BAD_REQUEST &&
      e.message.includes(OPENROUTER_SHAPED_KEY) === false &&
      e.message.includes('sk-or') === false &&
      e.message.includes('0a1b2c3d4e5f') === false
  );
});

test('chatCompletion: corpo não-JSON em 200 vazando a chave → erro sanitizado (nunca expõe a key)', async () => {
  const { fetchImpl } = makeFetch(() =>
    fakeResponse(200, {
      choices: [{ message: { content: '', reasoning_content: 'prefix sk-secret-123 suffix' } }],
    })
  );
  await assert.rejects(
    createDeepSeekClient({ fetchImpl, apiKey: async () => 'sk-secret-123' }).chatCompletion({
      messages: [{ role: 'user', content: 'x' }],
    }),
    (e: unknown) => e instanceof DeepSeekError && e.message.includes('sk-secret-123') === false
  );
});

test('parseChoiceResult (puro): content não-vazio → { content }', () => {
  assert.deepEqual(
    parseChoiceResult({ choices: [{ message: { content: '  ok  ' } }] }),
    { content: 'ok' } // trim aplicado
  );
});

test('parseChoiceResult (puro): content vazio + reasoning_content → { reasoningContent }', () => {
  assert.deepEqual(
    parseChoiceResult({ choices: [{ message: { content: '', reasoning_content: 'rason' } }] }),
    { reasoningContent: 'rason' }
  );
});

test('parseChoiceResult (puro): content vazio + `reasoning` (OpenRouter) → { reasoningContent }', () => {
  assert.deepEqual(
    parseChoiceResult({ choices: [{ message: { content: '', reasoning: 'pensei muito' } }] }),
    { reasoningContent: 'pensei muito' }
  );
});

test('parseChoiceResult (puro): content vazio + reasoning_details → junta o texto dos blocos', () => {
  assert.deepEqual(
    parseChoiceResult({
      choices: [
        {
          message: {
            content: '',
            reasoning_details: [
              { type: 'reasoning.text', text: 'passo 1' },
              { type: 'reasoning.summary', summary: 'passo 2' },
              { type: 'reasoning.encrypted', data: 'AAAA' },
            ],
          },
        },
      ],
    }),
    { reasoningContent: 'passo 1\npasso 2\nAAAA' }
  );
});

test('parseChoiceResult (puro): content ganha de qualquer raciocínio presente', () => {
  assert.deepEqual(
    parseChoiceResult({
      choices: [{ message: { content: 'a aula', reasoning: 'ruído', reasoning_content: 'ruído' } }],
    }),
    { content: 'a aula' }
  );
});

test('parseChoiceResult (puro): sem content nem reasoning → {}', () => {
  assert.deepEqual(parseChoiceResult({ choices: [] }), {});
  assert.deepEqual(parseChoiceResult({ choices: [{ message: { content: '' } }] }), {});
  assert.deepEqual(parseChoiceResult({ choices: [{ message: { content: '', reasoning_details: [] } }] }), {});
  assert.deepEqual(parseChoiceResult(null), {});
  assert.deepEqual(parseChoiceResult('nope'), {});
  assert.deepEqual(parseChoiceResult({}), {});
});

test('parseChoiceResult (puro): content whitespace-only → não é content', () => {
  assert.deepEqual(parseChoiceResult({ choices: [{ message: { content: '   ' } }] }), {});
});

test('parseRetryAfterMs (puro): segundos, data HTTP, lixo e ausência', () => {
  const now = Date.parse('Wed, 01 Sep 2026 12:00:00 GMT');
  assert.equal(parseRetryAfterMs('12', now), 12_000);
  assert.equal(parseRetryAfterMs('  0 ', now), 0);
  assert.equal(parseRetryAfterMs('1.5', now), 1500);
  assert.equal(parseRetryAfterMs('Wed, 01 Sep 2026 12:00:30 GMT', now), 30_000);
  // Data no passado nunca vira atraso negativo.
  assert.equal(parseRetryAfterMs('Wed, 01 Sep 2026 11:59:00 GMT', now), 0);
  assert.equal(parseRetryAfterMs('daqui a pouco', now), undefined);
  assert.equal(parseRetryAfterMs('', now), undefined);
  assert.equal(parseRetryAfterMs(null, now), undefined);
  assert.equal(parseRetryAfterMs(undefined, now), undefined);
});

test('renderSanitizedBodyFragment: máscara a chave exata ANTES de truncar (não corta a chave ao meio)', () => {
  // Chave longa que começaria ESTEJA no limite a ser cortado: com a ordem antiga
  // (truncar→mascarar) metade da chave vazaria; agora a máscara vem primeiro.
  const apiKey = 'sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz0123456789';
  const long = `corpo com a chave ${apiKey} no meio e muito texto depois`;
  const out = renderSanitizedBodyFragment(long, apiKey);
  assert.ok(out.includes('***'), 'chave exata deve virar ***');
  assert.equal(out.includes(apiKey), false, 'nunca deve expor a chave exata');
  assert.ok(out.length <= 161, 'deve truncar a 160 chars + ellipsis');
});

test('renderSanitizedBodyFragment: mascara chave PARTIAL/base64/URL-encoded via regex sk-...', () => {
  // apiKey exata desconhecida/diferente do fragmento — a defesa é o regex sk-...
  const out = renderSanitizedBodyFragment(
    'token sk-abcDEF123ghi456 e mais um sk-xYzQw999',
    'outra-chave'
  );
  assert.equal(out.includes('sk-'), false, 'nenhum padrão sk- deve sobreviver');
  assert.match(out, /\*\*\*/);
});

test('renderSanitizedBodyFragment: mascara a chave sk-or-v1-… POR INTEIRO (hífens incluídos)', () => {
  // REGRESSÃO de segurança da onda 1: a regex antiga era `sk-[A-Za-z0-9]{6,}`,
  // que para no primeiro HÍFEN — mascararia só `sk-or` e o resto da chave do
  // OpenRouter iria inteiro para o log.
  const out = renderSanitizedBodyFragment(
    `header: Authorization: Bearer ${OPENROUTER_SHAPED_KEY}`,
    '' // chave exata DESCONHECIDA: só o regex do contrato defende
  );
  assert.equal(out.includes(OPENROUTER_SHAPED_KEY), false, 'a chave inteira não pode sobreviver');
  assert.equal(out.includes('sk-or'), false, 'nem o prefixo sk-or pode sobreviver');
  assert.equal(out.includes('0a1b2c3d4e5f'), false, 'nenhum pedaço do corpo da chave sobrevive');
  assert.match(out, /\*\*\*/);
});

test('renderSanitizedBodyFragment: chamadas repetidas mascaram igual (regex global sem estado)', () => {
  const payload = { error: { message: `Bearer ${OPENROUTER_SHAPED_KEY}` } };
  const first = renderSanitizedBodyFragment(payload, '');
  const second = renderSanitizedBodyFragment(payload, '');
  assert.equal(first, second);
  assert.equal(second.includes('sk-or'), false);
});

test('renderSanitizedBodyFragment: mascara "Bearer <chave>" (header refletido no corpo)', () => {
  const apiKey = 'sk-BEARERTOKEN1234567890';
  const out = renderSanitizedBodyFragment(`authorization: Bearer ${apiKey} no corpo`, apiKey);
  assert.equal(out.includes(apiKey), false);
  assert.match(out, /Bearer \*\*\*/);
});

test('renderSanitizedBodyFragment: segue truncando para FRAGMENTOS SEM chave', () => {
  const body = { a: 'x'.repeat(400) };
  const out = renderSanitizedBodyFragment(body, '');
  assert.ok(out.length <= 161, 'deve truncar a 160 chars + ellipsis');
  assert.ok(out.endsWith('…'));
});

test('chatCompletion: temperatura injetada sobrescreve o default 0', async () => {
  const { fetchImpl, calls } = makeFetch(() =>
    fakeResponse(200, { choices: [{ message: { content: '{}' } }] })
  );
  await createDeepSeekClient({ fetchImpl, apiKey: async () => 'k' })
    .chatCompletion({ messages: [{ role: 'user', content: 'x' }], temperature: 1.2 });
  assert.equal(JSON.parse(calls[0].init!.body as string).temperature, 1.2);
});

test('chatCompletion: baseUrl injetável sem barra final', async () => {
  const { fetchImpl, calls } = makeFetch(() =>
    fakeResponse(200, { choices: [{ message: { content: '{}' } }] })
  );
  const client = createDeepSeekClient({ fetchImpl, baseUrl: 'https://example.test/', apiKey: async () => 'k' });
  await client.chatCompletion({ messages: [{ role: 'user', content: 'x' }] });
  assert.equal(calls[0].url, 'https://example.test/chat/completions');
});
