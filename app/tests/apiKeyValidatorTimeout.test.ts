/**
 * tests/apiKeyValidatorTimeout.test.ts — RODADA 10 (onda 2b): timeout dos
 * validadores de chave (sem spinner infinito).
 *
 * Cobre o AbortSignal de timeout adicionado a validateDeepseekKey/
 * validateBraveKey: fetch que PENDURA (rede que engole pacotes) nunca segura a
 * validação — o timeout dispara e o resultado é um erro de REDE identificável
 * ("Network error: timed out after Nms"), que o classificador do startup
 * handler (isNetworkError) reconhece. Fetch mockado por injeção de
 * `fetchImpl` + `timeoutMs` (nunca usa rede real nem timers longos).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_VALIDATE_TIMEOUT_MS,
  validateBraveKey,
  validateDeepseekKey,
} from '../electron/main/services/apiKeyValidator';
import { isNetworkError } from '../electron/main/ipc/startup-handlers';

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
  const result = await validateDeepseekKey('sk-123', {
    fetchImpl: hangingFetch(),
    timeoutMs: 50,
  });
  const elapsed = Date.now() - t0;

  assert.equal(result.isValid, false);
  assert.equal(result.provider, 'deepseek');
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
    return fakeResponse(200, { data: [{ id: 'deepseek-v4-flash' }] });
  }) as unknown as typeof fetch;

  const result = await validateDeepseekKey('sk-123', { fetchImpl: slowOk, timeoutMs: 0 });

  assert.equal(result.isValid, true);
  assert.equal(result.modelAvailable, true);
});

test('validateDeepseekKey: rejeição TypeError (rede) → erro de rede identificável', async () => {
  const fetchImpl = (async () => {
    throw new TypeError('fetch failed');
  }) as unknown as typeof fetch;

  const result = await validateDeepseekKey('sk-123', { fetchImpl, timeoutMs: 5000 });

  assert.equal(result.isValid, false);
  assert.match(result.errorMessage ?? '', /^Network error:/i);
  assert.match(result.errorMessage ?? '', /fetch failed/i);
  assert.equal(isNetworkError(result), true);
});

test('validateBraveKey: rejeição de rede (ENOTFOUND) → erro de rede identificável', async () => {
  const fetchImpl = (async () => {
    throw new Error('ENOTFOUND api.deepseek.com');
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
    fakeResponse(200, { data: [{ id: 'deepseek-v4-flash' }] })) as unknown as typeof fetch;

  const result = await validateDeepseekKey('sk-123', { fetchImpl: fastOk, timeoutMs: 5000 });

  assert.equal(result.isValid, true);
  assert.equal(result.errorMessage, undefined);
});

test('validateDeepseekKey: chave vazia NÃO espera o timeout (valida antes do fetch)', async () => {
  const result = await validateDeepseekKey('   ', { fetchImpl: hangingFetch(), timeoutMs: 50 });
  assert.equal(result.isValid, false);
  assert.equal(result.errorMessage, 'API key is empty');
});
