/**
 * tests/cx-services-llm-client.test.ts — CARACTERIZAÇÃO (golden master) de
 * `electron/main/services/llmClient.ts` ANTES da refatoração de core/services.
 *
 * Fixa o comportamento OBSERVÁVEL do transporte one-shot do juiz LLM:
 * literais do enum de erro (comparados como STRING CRUA em f1Research/geraTrilha),
 * mapeamento HTTP → erro tipado, mascaramento de segredos, Retry-After, timeout
 * e o shape do request/response. SEM REDE: o `fetch` é injetado em todos os
 * casos — nenhum pacote toca a internet.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  LLM_ERROR_CODES,
  LlmError,
  createLlmClient,
  parseChoiceResult,
  parseRetryAfterMs,
  renderSanitizedBodyFragment,
  type LlmChatMessage,
} from '../electron/main/services/llmClient';

const MSGS: LlmChatMessage[] = [{ role: 'user', content: 'oi' }];
const KEY = 'sk-or-v1-abcdef123456';

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

function fakeFetch(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): { fn: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fn = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

function clientCom(
  fn: typeof fetch,
  over: { apiKey?: () => Promise<string>; baseUrl?: string } = {},
): ReturnType<typeof createLlmClient> {
  return createLlmClient({
    fetchImpl: fn,
    baseUrl: over.baseUrl ?? 'https://api.teste/v1/',
    apiKey: over.apiKey ?? (async () => KEY),
  });
}

/** Pega o corpo JSON enviado no primeiro fetch. */
function bodyEnviado(call: FetchCall): Record<string, unknown> {
  return JSON.parse(String(call.init?.body)) as Record<string, unknown>;
}

// ─── literais do enum (comparados como string crua fora daqui) ───────────────

describe('cx/llmClient: LLM_ERROR_CODES (golden master — strings cruas consomem estes valores)', () => {
  it('os 7 códigos e literais não mudam', () => {
    assert.deepEqual(LLM_ERROR_CODES, {
      KEY_MISSING: 'LLM_KEY_MISSING',
      KEY_INVALID: 'LLM_KEY_INVALID',
      RATE_LIMIT: 'LLM_RATE_LIMIT',
      BAD_REQUEST: 'LLM_BAD_REQUEST',
      SERVER_ERROR: 'LLM_SERVER_ERROR',
      NETWORK: 'LLM_NETWORK',
      EMPTY_CONTENT: 'LLM_EMPTY_CONTENT',
    });
  });
});

describe('cx/llmClient: LlmError', () => {
  it('carrega code/cause e SÓ grava retryAfterMs finito e >= 0', () => {
    const comAtraso = new LlmError(LLM_ERROR_CODES.RATE_LIMIT, 'm', { status: 429 }, 1500);
    assert.equal(comAtraso.name, 'LlmError');
    assert.equal(comAtraso.code, 'LLM_RATE_LIMIT');
    assert.deepEqual(comAtraso.cause, { status: 429 });
    assert.equal(comAtraso.retryAfterMs, 1500);

    assert.equal(new LlmError(LLM_ERROR_CODES.NETWORK, 'm', undefined, -5).retryAfterMs, undefined);
    assert.equal(new LlmError(LLM_ERROR_CODES.NETWORK, 'm', undefined, NaN).retryAfterMs, undefined);
    assert.equal(new LlmError(LLM_ERROR_CODES.NETWORK, 'm').retryAfterMs, undefined);
    assert.equal(
      new LlmError(LLM_ERROR_CODES.NETWORK, 'm', undefined, Infinity).retryAfterMs,
      undefined,
      'Infinity não é atraso utilizável',
    );
  });
});

// ─── parseChoiceResult (pura) ────────────────────────────────────────────────

describe('cx/llmClient: parseChoiceResult (extração de choices[0].message)', () => {
  it('content não-vazio vence e é TRIMMADO', () => {
    assert.deepEqual(parseChoiceResult({ choices: [{ message: { content: '  resposta  ' } }] }), {
      content: 'resposta',
    });
  });

  it('três formas de raciocínio são reconhecidas quando falta content (sem fabricar content)', () => {
    // CARACTERIZAÇÃO: `reasoning` volta CRU (sem trim) — assimetria deliberada
    // a registrar perante o `content`, que é trimmado. Só o PREENCHIDO importa
    // para o chamador (vira erro EMPTY_CONTENT nomeado).
    assert.deepEqual(
      parseChoiceResult({ choices: [{ message: { reasoning: ' pensando ' } }] }),
      { reasoningContent: ' pensando ' },
    );
    assert.deepEqual(
      parseChoiceResult({ choices: [{ message: { reasoning_content: 'raciocinio legado' } }] }),
      { reasoningContent: 'raciocinio legado' },
    );
    assert.deepEqual(
      parseChoiceResult({
        choices: [
          {
            message: {
              reasoning_details: [{ text: 'passo 1' }, { summary: 'passo 2' }, { encrypted: 'zzz' }],
            },
          },
        ],
      }),
      { reasoningContent: 'passo 1\npasso 2' },
    );
  });

  it('content vazio/branco cai no raciocínio; nada utilizável ⇒ objeto VAZIO', () => {
    assert.deepEqual(parseChoiceResult({ choices: [{ message: { content: '   ', reasoning: 'r' } }] }), {
      reasoningContent: 'r',
    });
    assert.deepEqual(parseChoiceResult({ choices: [{ message: { content: '   ' } }] }), {});
    assert.deepEqual(parseChoiceResult({ choices: [{ message: {} }] }), {});
  });

  it('corpos degenerados ⇒ {} (nunca lança)', () => {
    assert.deepEqual(parseChoiceResult(null), {});
    assert.deepEqual(parseChoiceResult('texto'), {});
    assert.deepEqual(parseChoiceResult([1, 2]), {});
    assert.deepEqual(parseChoiceResult({ choices: [] }), {});
    assert.deepEqual(parseChoiceResult({ choices: 'x' }), {});
    assert.deepEqual(parseChoiceResult({ choices: [null] }), {});
    assert.deepEqual(parseChoiceResult({ choices: [{ message: 'x' }] }), {});
  });
});

// ─── parseRetryAfterMs (pura) ────────────────────────────────────────────────

describe('cx/llmClient: parseRetryAfterMs (RFC 7231)', () => {
  const AGORA = Date.parse('2026-10-21T07:28:00Z');

  it('delta-seconds vira ms (decimal tolerado)', () => {
    assert.equal(parseRetryAfterMs('12', AGORA), 12_000);
    assert.equal(parseRetryAfterMs('0', AGORA), 0);
    assert.equal(parseRetryAfterMs('1.5', AGORA), 1500);
    assert.equal(parseRetryAfterMs('  3  ', AGORA), 3000);
  });

  it('HTTP-date futuro vira o delta arredondado; passado vira 0 (nunca negativo)', () => {
    assert.equal(parseRetryAfterMs('Wed, 21 Oct 2026 07:28:12 GMT', AGORA), 12_000);
    assert.equal(parseRetryAfterMs('Wed, 21 Oct 2026 07:27:00 GMT', AGORA), 0);
    assert.equal(parseRetryAfterMs('Wed, 21 Oct 2026 07:28:00 GMT', AGORA), 0);
  });

  it('ausente/inválido/não-string ⇒ undefined (backoff cai no exponencial)', () => {
    assert.equal(parseRetryAfterMs(undefined, AGORA), undefined);
    assert.equal(parseRetryAfterMs(null, AGORA), undefined);
    assert.equal(parseRetryAfterMs('', AGORA), undefined);
    assert.equal(parseRetryAfterMs('   ', AGORA), undefined);
    assert.equal(parseRetryAfterMs('não-é-data', AGORA), undefined);
    assert.equal(parseRetryAfterMs('logo', AGORA), undefined);
  });
});

// ─── renderSanitizedBodyFragment (pura) ──────────────────────────────────────

describe('cx/llmClient: renderSanitizedBodyFragment (máscara ANTES do truncamento)', () => {
  it('mascara a chave exata, o par Bearer e o padrão sk-… (inclui hífen/underscore do OpenRouter)', () => {
    const texto = renderSanitizedBodyFragment(
      { error: { message: `chave ${KEY} inválida e header Bearer ${KEY} e parcial sk-or-v1-abc` } },
      KEY,
      'error.message',
    );
    assert.ok(!texto.includes(KEY), 'a chave NUNCA aparece');
    assert.ok(!texto.includes('sk-or-v1-abc'), 'o padrão sk-… com hífen é mascarado por inteiro');
    assert.ok(texto.includes('Bearer ***'), 'o par Bearer vira Bearer ***');
    assert.ok(texto.includes('***'));
  });

  it('trunca a 160 chars + … e NUNCA corta uma chave ao meio (máscara vem primeiro)', () => {
    const payload = { campo: 'x'.repeat(40) + ' ' + KEY + ' ' + 'y'.repeat(200) };
    const texto = renderSanitizedBodyFragment(payload, KEY, 'campo');
    assert.ok(texto.endsWith('…'), 'truncado com reticências');
    assert.equal(texto.length, 161, '160 chars + …');
    assert.ok(!texto.includes(KEY));
  });

  it('navega campo pontilhado; corpo não-serializável nunca lança', () => {
    assert.equal(
      renderSanitizedBodyFragment({ error: { message: 'boom' } }, KEY, 'error.message'),
      '"boom"',
    );
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    assert.doesNotThrow(() => renderSanitizedBodyFragment(circular, KEY));
  });

  it('campo `field` que NÃO existe ainda devolve string utilizável (nunca lança)', () => {
    assert.equal(
      typeof renderSanitizedBodyFragment({ error: { message: 'boom' } }, KEY, 'nao.existe'),
      'string',
    );
  });

  it(
    'BUG: campo inexistente devolve a string "undefined" em vez do corpo inteiro — llmClient.ts:322-347',
    { todo: 'BUG: renderSanitizedBodyFragment(payload, key, field-inexistente) devolve "undefined" em vez do corpo — llmClient.ts:322-347' },
    () => {
      // O docstring da função promete: "Devolve o campo alvo … ou o corpo
      // inteiro se `field` não existir". O código faz `target = undefined` no
      // break do else e a mensagem de erro termina com "Corpo (sanitizado):
      // undefined".
      const corpo = { error: { message: 'boom' } };
      assert.equal(
        renderSanitizedBodyFragment(corpo, KEY, 'nao.existe'),
        JSON.stringify(corpo),
        'comportamento CORRETO prometido pelo docstring (o corpo inteiro sanitizado)',
      );
    },
  );
});

// ─── createLlmClient — contrato do transporte (fetch injetado) ───────────────

describe('cx/llmClient: createLlmClient — validações antes da rede', () => {
  it('sem mensagens ⇒ NETWORK antes de qualquer fetch', async () => {
    const { fn, calls } = fakeFetch(200, {});
    const client = clientCom(fn);
    await assert.rejects(
      () => client.chatCompletion({ messages: [] }),
      (e: unknown) =>
        e instanceof LlmError && e.code === LLM_ERROR_CODES.NETWORK && /sem mensagens/.test(e.message),
    );
    assert.equal(calls.length, 0);
  });

  it('sem chave (dep ausente, vazia ou só espaços) ⇒ KEY_MISSING sem chegar à rede', async () => {
    for (const apiKey of [undefined, async () => '', async () => '   ']) {
      const { fn, calls } = fakeFetch(200, {});
      const client = createLlmClient({ fetchImpl: fn, apiKey });
      await assert.rejects(
        () => client.chatCompletion({ messages: MSGS }),
        (e: unknown) =>
          e instanceof LlmError && e.code === LLM_ERROR_CODES.KEY_MISSING && /não configurada/.test(e.message),
      );
      assert.equal(calls.length, 0, 'nenhum fetch sem chave');
    }
  });
});

describe('cx/llmClient: createLlmClient — shape do request (contrato congelado do OpenRouter)', () => {
  it('POST {base}/chat/completions com model, reasoning.max, provider.require_parameters e usage.include', async () => {
    const { fn, calls } = fakeFetch(200, {
      choices: [{ message: { content: 'ok' } }],
      model: 'modelo-da-resposta',
    });
    const client = clientCom(fn, { baseUrl: 'https://api.teste/v1///' });
    const res = await client.chatCompletion({ messages: MSGS });

    assert.deepEqual(res, { content: 'ok', model: 'modelo-da-resposta' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.teste/v1/chat/completions', 'barra final do baseUrl é removida');
    assert.equal(calls[0].init?.method, 'POST');
    const headers = calls[0].init?.headers as Record<string, string>;
    assert.equal(headers.Authorization, `Bearer ${KEY}`);
    assert.equal(headers['Content-Type'], 'application/json');
    assert.equal(headers['HTTP-Referer'], 'https://github.com/ondokai/study-method');
    assert.equal(headers['X-Title'], 'study-method');

    const body = bodyEnviado(calls[0]);
    assert.equal(body.model, 'z-ai/glm-5.3-flash', 'model default é o literal do contrato');
    assert.equal(body.temperature, 0, 'temperature default 0 (determinístico)');
    assert.equal('max_tokens' in body, false, 'max_tokens só entra quando pedido');
    assert.deepEqual(body.reasoning, { enabled: true, effort: 'max' }, 'raciocínio SEMPRE ligado, no máximo');
    assert.deepEqual(body.provider, { require_parameters: true }, 'load-bearing: sem isto o reasoning some');
    assert.deepEqual(body.usage, { include: true });
  });

  it('max_tokens e reasoningEffort explícitos entram; model sobrescrito', async () => {
    const { fn, calls } = fakeFetch(200, { choices: [{ message: { content: 'ok' } }] });
    const client = clientCom(fn);
    await client.chatCompletion({
      messages: MSGS,
      maxTokens: 77,
      temperature: 0.5,
      reasoningEffort: 'low',
      model: 'outro/modelo',
    });
    const body = bodyEnviado(calls[0]);
    assert.equal(body.max_tokens, 77);
    assert.equal(body.temperature, 0.5);
    assert.equal(body.model, 'outro/modelo');
    assert.deepEqual(body.reasoning, { enabled: true, effort: 'low' });
  });
});

describe('cx/llmClient: createLlmClient — mapeamento HTTP → erro tipado', () => {
  it('401/403 ⇒ KEY_INVALID com o status na mensagem', async () => {
    for (const status of [401, 403]) {
      const { fn } = fakeFetch(status, {});
      await assert.rejects(
        () => clientCom(fn).chatCompletion({ messages: MSGS }),
        (e: unknown) =>
          e instanceof LlmError &&
          e.code === LLM_ERROR_CODES.KEY_INVALID &&
          e.message.includes(`HTTP ${status}`),
      );
    }
  });

  it('429 ⇒ RATE_LIMIT com retryAfterMs do header e o atraso citado na mensagem', async () => {
    const { fn } = fakeFetch(429, {}, { 'Retry-After': '12' });
    await assert.rejects(
      () => clientCom(fn).chatCompletion({ messages: MSGS }),
      (e: unknown) => {
        assert.ok(e instanceof LlmError);
        assert.equal(e.code, LLM_ERROR_CODES.RATE_LIMIT);
        assert.equal(e.retryAfterMs, 12_000);
        assert.ok(e.message.includes('Retry-After: 12000ms.'));
        return true;
      },
    );
  });

  it('429 SEM Retry-After ⇒ RATE_LIMIT sem retryAfterMs e sem citar atraso', async () => {
    const { fn } = fakeFetch(429, {});
    await assert.rejects(
      () => clientCom(fn).chatCompletion({ messages: MSGS }),
      (e: unknown) => {
        assert.ok(e instanceof LlmError);
        assert.equal(e.code, LLM_ERROR_CODES.RATE_LIMIT);
        assert.equal(e.retryAfterMs, undefined);
        assert.ok(!e.message.includes('Retry-After:'));
        return true;
      },
    );
  });

  it('400 com error.message ⇒ BAD_REQUEST com a mensagem do gateway MASCARADA + corpo sanitizado', async () => {
    const { fn } = fakeFetch(400, {
      error: { message: `Authorization: Bearer ${KEY} foi recusada` },
    });
    await assert.rejects(
      () => clientCom(fn).chatCompletion({ messages: MSGS }),
      (e: unknown) => {
        assert.ok(e instanceof LlmError);
        assert.equal(e.code, LLM_ERROR_CODES.BAD_REQUEST);
        assert.ok(!e.message.includes(KEY), 'a chave ecoada pelo gateway NÃO chega à mensagem');
        assert.ok(e.message.includes('Bearer ***'));
        assert.ok(e.message.includes('Corpo do erro (sanitizado)'));
        assert.ok(e.message.includes('(HTTP 400)'));
        return true;
      },
    );
  });

  it('400 com corpo ilegível ⇒ BAD_REQUEST com a mensagem padrão (sem fragmento)', async () => {
    const { fn } = fakeFetch(400, 'isto nao é json');
    await assert.rejects(
      () => clientCom(fn).chatCompletion({ messages: MSGS }),
      (e: unknown) => {
        assert.ok(e instanceof LlmError);
        assert.equal(e.code, LLM_ERROR_CODES.BAD_REQUEST);
        assert.equal(e.message, 'OpenRouter: erro de requisição (HTTP 400).');
        return true;
      },
    );
  });

  it('5xx ⇒ SERVER_ERROR mascarando a mensagem; Retry-After em data passada vira 0', async () => {
    const { fn } = fakeFetch(
      503,
      { message: `tente com ${KEY}` },
      { 'Retry-After': 'Wed, 21 Oct 2020 07:27:00 GMT' },
    );
    await assert.rejects(
      () => clientCom(fn).chatCompletion({ messages: MSGS }),
      (e: unknown) => {
        assert.ok(e instanceof LlmError);
        assert.equal(e.code, LLM_ERROR_CODES.SERVER_ERROR);
        assert.ok(!e.message.includes(KEY));
        assert.equal(e.retryAfterMs, 0);
        return true;
      },
    );
  });

  it('200 não-JSON ⇒ NETWORK "resposta não-JSON"', async () => {
    const { fn } = fakeFetch(200, '<html>ops</html>', { 'Content-Type': 'text/html' });
    await assert.rejects(
      () => clientCom(fn).chatCompletion({ messages: MSGS }),
      (e: unknown) =>
        e instanceof LlmError &&
        e.code === LLM_ERROR_CODES.NETWORK &&
        /resposta não-JSON/.test(e.message),
    );
  });

  it('200 sem content utilizável ⇒ EMPTY_CONTENT com o corpo sanitizado; só raciocínio ⇒ EMPTY_CONTENT nomeando o caso', async () => {
    const { fn } = fakeFetch(200, { choices: [{ message: { content: '' } }] });
    await assert.rejects(
      () => clientCom(fn).chatCompletion({ messages: MSGS }),
      (e: unknown) => {
        assert.ok(e instanceof LlmError);
        assert.equal(e.code, LLM_ERROR_CODES.EMPTY_CONTENT);
        assert.ok(/sem choices\[0\]\.message\.content/.test(e.message));
        assert.ok(e.message.includes('Corpo (sanitizado)'));
        return true;
      },
    );

    const soRaciocinio = fakeFetch(200, { choices: [{ message: { reasoning: 'pensando' } }] });
    await assert.rejects(
      () => clientCom(soRaciocinio.fn).chatCompletion({ messages: MSGS }),
      (e: unknown) => {
        assert.ok(e instanceof LlmError);
        assert.equal(e.code, LLM_ERROR_CODES.EMPTY_CONTENT);
        assert.ok(/apenas raciocínio/.test(e.message), 'nomeia o caso de só-raciocínio');
        return true;
      },
    );
  });

  it('timeout (AbortError) ⇒ NETWORK citando os ms; falha de rede crua ⇒ NETWORK com o motivo', async () => {
    const pendurado = (async (_url: unknown, init?: RequestInit) =>
      new Promise((_res, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('abortado');
          err.name = 'AbortError';
          reject(err);
        });
      })) as unknown as typeof fetch;
    await assert.rejects(
      () => clientCom(pendurado).chatCompletion({ messages: MSGS, timeoutMs: 30 }),
      (e: unknown) =>
        e instanceof LlmError &&
        e.code === LLM_ERROR_CODES.NETWORK &&
        e.message === 'OpenRouter: timeout após 30ms.',
    );

    const quebrado = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    await assert.rejects(
      () => clientCom(quebrado).chatCompletion({ messages: MSGS }),
      (e: unknown) =>
        e instanceof LlmError &&
        e.code === LLM_ERROR_CODES.NETWORK &&
        /falha de rede \(ECONNREFUSED\)/.test(e.message),
    );
  });

  it('sucesso: content TRIMMADO, model fallback do pedido e usage mapeado (reasoning_tokens ANINHADO + cost)', async () => {
    const { fn } = fakeFetch(200, {
      choices: [{ message: { content: '  resposta final  ' } }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 20,
        completion_tokens_details: { reasoning_tokens: 7 },
        cost: 0.001,
      },
    });
    const res = await clientCom(fn).chatCompletion({ messages: MSGS });
    assert.deepEqual(res, {
      content: 'resposta final',
      model: 'z-ai/glm-5.3-flash',
      usage: { promptTokens: 100, completionTokens: 20, reasoningTokens: 7, costUsd: 0.001 },
    });
  });

  it('usage ausente/malformado ⇒ resposta SEM usage; model ausente no corpo usa o do pedido', async () => {
    const { fn } = fakeFetch(200, {
      choices: [{ message: { content: 'ok' } }],
      usage: { prompt_tokens: '100', completion_tokens: 20 },
    });
    const res = await clientCom(fn).chatCompletion({ messages: MSGS, model: 'pedido/modelo' });
    assert.equal(res.model, 'pedido/modelo');
    assert.equal('usage' in res, false, 'usage com tipo errado não vira meia-leitura');
  });
});
