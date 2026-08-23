/**
 * tests/deepseekClient.test.ts — cliente DeepSeek one-shot com fetch fake injetado.
 * NUNCA usa rede real. Cobre: 200 parse, 401/403 ⇒ KEY_INVALID, 429 ⇒ RATE_LIMIT,
 * 400/404 ⇒ BAD_REQUEST, 5xx com corpo, falha de rede, sem chave (KEY_MISSING),
 * timeout via AbortController, headers corretos, model default literal, content
 * vazio ⇒ EMPTY_CONTENT (com/sem reasoning_content) e sanitização da chave nas
 * mensagens de erro. Também testa a função pura parseChoiceResult.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDeepSeekClient,
  DEEPSEEK_ERROR_CODES,
  DeepSeekError,
  parseChoiceResult,
} from '../electron/main/services/deepseekClient';

function fakeResponse(status: number, body: unknown = {}, statusText = ''): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => body,
  } as Response;
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
      model: 'deepseek-v4-flash',
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    })
  );
  const client = createDeepSeekClient({ fetchImpl, apiKey: async () => 'sk-test' });

  const res = await client.chatCompletion({
    messages: [{ role: 'user', content: 'hi' }],
  });

  assert.equal(res.content, '{"ok":true}');
  assert.equal(res.model, 'deepseek-v4-flash');
  assert.deepEqual(res.usage, { promptTokens: 10, completionTokens: 5 });

  assert.equal(calls.length, 1);
  const init = calls[0].init!;
  assert.equal(calls[0].url, 'https://api.deepseek.com/chat/completions');
  assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer sk-test');
  assert.equal((init.headers as Record<string, string>)['Content-Type'], 'application/json');
  const body = JSON.parse(init.body as string);
  assert.equal(body.model, 'deepseek-v4-flash'); // literal do contrato
  assert.equal(body.temperature, 0); // default
  assert.equal(body.messages.length, 1);
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

test('chatCompletion: 400 invalid_request_error → BAD_REQUEST com mensagem do gateway (sem vazar a chave)', async () => {
  const { fetchImpl } = makeFetch(() =>
    fakeResponse(400, {
      error: {
        message: 'The supported API model names are deepseek-v4-pro, deepseek-v4-flash, but you passed deepseek-v4-flash-0731.',
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
      /deepseek-v4-pro/.test(e.message) &&
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

test('parseChoiceResult (puro): sem content nem reasoning → {}', () => {
  assert.deepEqual(parseChoiceResult({ choices: [] }), {});
  assert.deepEqual(parseChoiceResult({ choices: [{ message: { content: '' } }] }), {});
  assert.deepEqual(parseChoiceResult(null), {});
  assert.deepEqual(parseChoiceResult('nope'), {});
  assert.deepEqual(parseChoiceResult({}), {});
});

test('parseChoiceResult (puro): content whitespace-only → não é content', () => {
  assert.deepEqual(parseChoiceResult({ choices: [{ message: { content: '   ' } }] }), {});
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