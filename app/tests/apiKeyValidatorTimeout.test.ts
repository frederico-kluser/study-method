/**
 * tests/apiKeyValidatorTimeout.test.ts — RODADA 10 (onda 2b): timeout dos
 * validadores de chave (sem spinner infinito).
 *
 * Cobre o AbortSignal de timeout adicionado a validateDeepseekKey/
 * validateBraveKey: fetch que PENDURA (rede que engole pacotes) nunca segura a
 * validação — o timeout dispara e o resultado é um erro de REDE identificável
 * ("Network error: timed out after Nms"), que o classificador do startup
 * handler (isNetworkError) reconhece.
 *
 * O timeout cobre o pipeline COMPLETO (fetch + leitura do corpo): aqui também
 * o BODY-STALL (headers chegam, corpo nunca chega — response.json()
 * pendurado) e o throw SÍNCRONO do fetchImpl (timer não vaza). Cobre ainda a
 * divisão do orçamento entre as DUAS chamadas do OpenRouter: `/key` (validade)
 * e o probe COMPLEMENTAR de `/models` — um probe pendurado gasta o que sobrou
 * do prazo e é ENGOLIDO, sem derrubar a chave já aprovada. É esta suíte
 * que prova o timeout do VALIDADOR do main — o e2e-setup-timeout.spec.ts
 * substitui o handler do ipcMain e só exercita a guarda do renderer (ver
 * cabeçalho da spec). Fetch mockado por injeção de `fetchImpl` + `timeoutMs`
 * (nunca usa rede real nem timers longos).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_VALIDATE_TIMEOUT_MS,
  validateBraveKey,
  validateDeepseekKey,
} from '../electron/main/services/apiKeyValidator';
import { isNetworkError } from '../electron/main/ipc/startup-handlers';

/** Model id alvo do contrato congelado (shared/llm/constants.ts). */
const TARGET_MODEL = 'z-ai/glm-5.3-flash';

/** Cria um Response fake compatível com `fetch`. */
function fakeResponse(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    json: async () => body,
  } as Response;
}

/**
 * fetch que NUNCA responde sozinha — simula rede que engole pacotes. Só
 * rejeita quando o AbortSignal (passado pelo validador) dispara, como o fetch
 * real faria num host inalcançável/pendurado.
 */
function hangingFetch(): typeof fetch {
  return ((_input: unknown, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) return; // sem sinal: pendura para sempre (caso sem timeout).
      const abort = (): void => {
        reject(new DOMException('This operation was aborted', 'AbortError'));
      };
      if (signal.aborted) {
        abort();
        return;
      }
      signal.addEventListener('abort', abort, { once: true });
    })) as unknown as typeof fetch;
}

test('validateDeepseekKey: fetch pendurada além do timeout → erro de rede "timed out" rápido', async () => {
  const t0 = Date.now();
  const result = await validateDeepseekKey('sk-or-v1-123', {
    fetchImpl: hangingFetch(),
    timeoutMs: 50,
  });
  const elapsed = Date.now() - t0;

  assert.equal(result.isValid, false);
  assert.equal(result.provider, 'openrouter');
  // Mensagem identificável como REDE: prefixo exato + marcador "timed out"
  // (regex do classificador isNetworkError do startup-handlers).
  assert.match(result.errorMessage ?? '', /^Network error:/i);
  assert.match(result.errorMessage ?? '', /timed out/i);
  assert.match(result.errorMessage ?? '', /50ms/);
  // Resolveu perto do timeout (não pendurou além de ~2s).
  assert.ok(elapsed < 2000, `deveria resolver em ~50ms, levou ${elapsed}ms`);
  // O classificador de startup-handlers trata como erro de REDE (≠ chave inválida).
  assert.equal(isNetworkError(result), true);
});

test('validateBraveKey: fetch pendurada além do timeout → erro de rede "timed out"', async () => {
  const result = await validateBraveKey('key-abc', {
    fetchImpl: hangingFetch(),
    timeoutMs: 50,
  });

  assert.equal(result.isValid, false);
  assert.equal(result.provider, 'brave');
  assert.match(result.errorMessage ?? '', /^Network error:/i);
  assert.match(result.errorMessage ?? '', /timed out/i);
  assert.equal(isNetworkError(result), true);
});

test('validateDeepseekKey: timeout configurável — 0 desliga (fetch lenta ainda valida)', async () => {
  const slowOk = (async () => {
    await new Promise((r) => setTimeout(r, 80));
    return fakeResponse(200, { data: [{ id: TARGET_MODEL }] });
  }) as unknown as typeof fetch;

  const result = await validateDeepseekKey('sk-or-v1-123', { fetchImpl: slowOk, timeoutMs: 0 });

  assert.equal(result.isValid, true);
  assert.equal(result.modelAvailable, true);
});

test('validateDeepseekKey: rejeição TypeError (rede) → erro de rede identificável', async () => {
  const fetchImpl = (async () => {
    throw new TypeError('fetch failed');
  }) as unknown as typeof fetch;

  const result = await validateDeepseekKey('sk-or-v1-123', { fetchImpl, timeoutMs: 5000 });

  assert.equal(result.isValid, false);
  assert.match(result.errorMessage ?? '', /^Network error:/i);
  assert.match(result.errorMessage ?? '', /fetch failed/i);
  assert.equal(isNetworkError(result), true);
});

test('validateBraveKey: rejeição de rede (ENOTFOUND) → erro de rede identificável', async () => {
  const fetchImpl = (async () => {
    throw new Error('ENOTFOUND openrouter.ai');
  }) as unknown as typeof fetch;

  const result = await validateBraveKey('key-abc', { fetchImpl, timeoutMs: 5000 });

  assert.equal(result.isValid, false);
  assert.match(result.errorMessage ?? '', /^Network error:/i);
  assert.equal(isNetworkError(result), true);
});

test('DEFAULT_VALIDATE_TIMEOUT_MS: default ~8s (alinhado ao startup handler)', () => {
  assert.equal(DEFAULT_VALIDATE_TIMEOUT_MS, 8000);
});

test('validateDeepseekKey: timeout alto NÃO dispara quando a fetch responde rápido', async () => {
  const fastOk = (async () =>
    fakeResponse(200, { data: [{ id: TARGET_MODEL }] })) as unknown as typeof fetch;

  const result = await validateDeepseekKey('sk-or-v1-123', { fetchImpl: fastOk, timeoutMs: 5000 });

  assert.equal(result.isValid, true);
  assert.equal(result.errorMessage, undefined);
});

test('validateDeepseekKey: chave vazia NÃO espera o timeout (valida antes do fetch)', async () => {
  const result = await validateDeepseekKey('   ', { fetchImpl: hangingFetch(), timeoutMs: 50 });
  assert.equal(result.isValid, false);
  assert.equal(result.errorMessage, 'API key is empty');
});

test('validateDeepseekKey: BODY-STALL — headers chegam, corpo nunca chega → "timed out" no prazo', async () => {
  // W1: rede que engole pacotes DEPOIS dos headers no endpoint de VALIDADE
  // (/key). O fetch resolve rápido com status 200, mas response.json() NUNCA
  // resolve (corpo nunca termina) — e o corpo é drenado ali mesmo. O
  // timeout cobre a leitura do corpo: a validação resolve no prazo com erro de
  // REDE, não fica pendurada.
  let seenSignal: AbortSignal | null | undefined;
  const bodyStallFetch = ((_input: unknown, init?: RequestInit) => {
    seenSignal = init?.signal ?? undefined;
    return Promise.resolve({
      ok: true,
      status: 200,
      statusText: '',
      json: () => new Promise(() => {}), // corpo que nunca chega — NUNCA resolve
    } as Response);
  }) as unknown as typeof fetch;

  const t0 = Date.now();
  const result = await validateDeepseekKey('sk-or-v1-123', {
    fetchImpl: bodyStallFetch,
    timeoutMs: 60,
  });
  const elapsed = Date.now() - t0;

  assert.equal(result.isValid, false);
  assert.equal(result.provider, 'openrouter');
  // Mensagem exata do contrato: prefixo de rede + marcador "timed out" + ms.
  assert.match(result.errorMessage ?? '', /^Network error:/i);
  assert.match(result.errorMessage ?? '', /timed out/i);
  assert.match(result.errorMessage ?? '', /60ms/);
  assert.ok(elapsed < 2000, `deveria resolver em ~60ms, levou ${elapsed}ms`);
  // O classificador do startup-handlers trata como erro de REDE (≠ chave válida).
  assert.equal(isNetworkError(result), true);
  // O sinal foi abortado no prazo — o que cortaria o body read do fetch real.
  assert.ok(seenSignal?.aborted === true, 'sinal deveria ter sido abortado no timeout');
});

test('validateBraveKey: BODY-STALL em status de erro — corpo nunca chega → "timed out" no prazo', async () => {
  // Mesmo body-stall, mas no caminho de status não-200 (parse do corpo de
  // erro): o timeout também cobre a leitura do corpo aqui.
  const bodyStallErrorFetch = (() =>
    Promise.resolve({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => new Promise(() => {}), // corpo que nunca chega — NUNCA resolve
    } as Response)) as unknown as typeof fetch;

  const t0 = Date.now();
  const result = await validateBraveKey('key-abc', {
    fetchImpl: bodyStallErrorFetch,
    timeoutMs: 60,
  });
  const elapsed = Date.now() - t0;

  assert.equal(result.isValid, false);
  assert.equal(result.provider, 'brave');
  assert.match(result.errorMessage ?? '', /^Network error:/i);
  assert.match(result.errorMessage ?? '', /timed out/i);
  assert.ok(elapsed < 2000, `deveria resolver em ~60ms, levou ${elapsed}ms`);
  assert.equal(isNetworkError(result), true);
});

test('validateDeepseekKey: probe de /models PENDURADO não derruba a chave (válida, modelAvailable indefinido)', async () => {
  // O catálogo é COMPLEMENTAR: /key já aprovou a chave. Se o probe pendurar, o
  // que sobrou do orçamento é gasto nele, o abort é ENGOLIDO e a validação
  // resolve VÁLIDA — só sem saber `modelAvailable`. O prazo TOTAL (as duas
  // chamadas juntas) continua sendo `timeoutMs`.
  const hanging = hangingFetch();
  const fetchImpl = ((input: unknown, init?: RequestInit) => {
    if (String(input).includes('/models')) return hanging(input as string, init);
    return Promise.resolve(fakeResponse(200, { data: { label: 'k' } }));
  }) as unknown as typeof fetch;

  const t0 = Date.now();
  const result = await validateDeepseekKey('sk-or-v1-123', { fetchImpl, timeoutMs: 80 });
  const elapsed = Date.now() - t0;

  assert.equal(result.isValid, true, 'o complemento NUNCA decide validade');
  assert.equal(result.provider, 'openrouter');
  assert.equal(result.modelAvailable, undefined);
  assert.equal(result.errorMessage, undefined);
  assert.ok(elapsed < 2000, `deveria resolver perto do orçamento, levou ${elapsed}ms`);
});

test('validateDeepseekKey: fetchImpl que lança SINCRONAMENTE → erro de rede imediato, sem timer vazado', async () => {
  // W3: throw síncrono do fetchImpl (mock) não pode vazar o timer nem segurar
  // a validação — rejeita imediatamente, ANTES do prazo do timeout (se o timer
  // vazasse segurando o evento, o teste só terminaria depois do timeout).
  const syncThrowFetch = ((_input: unknown, _init?: RequestInit) => {
    throw new TypeError('sync boom');
  }) as unknown as typeof fetch;

  const t0 = Date.now();
  const result = await validateDeepseekKey('sk-or-v1-123', {
    fetchImpl: syncThrowFetch,
    timeoutMs: 60,
  });
  const elapsed = Date.now() - t0;

  assert.equal(result.isValid, false);
  assert.match(result.errorMessage ?? '', /^Network error:/i);
  assert.match(result.errorMessage ?? '', /sync boom/i);
  assert.equal(isNetworkError(result), true);
  // Rejeição IMEDIATA (< timeout) prova que o clearTimeout rodou no caminho
  // do sync throw — o timer não retém o processo até o prazo.
  assert.ok(elapsed < 60, `deveria rejeitar na hora, levou ${elapsed}ms`);
});
