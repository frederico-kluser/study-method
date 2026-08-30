/**
 * tests/engineCallLlm.test.ts — o transporte único de LLM da engine de
 * trilhas (P-01, docs/16-engine-de-trilha.md §4.1 e §11).
 *
 * Os contratos que mordem aqui (critérios de aceitação A-P01-1/3/4):
 *   - semaphore: o SEM_LLM respeita o teto — com limite 2, o pico de
 *     concorrência observado NUNCA passa de 2 (um limitador frouxo deixaria
 *     passar; um limitador que não libera slot travaria o teste 7).
 *   - backoff: POR CÓDIGO, não uniforme — 429 retenta com intervalos
 *     CRESCENTES (observados nos delays entregues ao sleep injetado, com
 *     jitter 0 para não flakear); KEY_INVALID e BAD_REQUEST NÃO retentam
 *     (uma chamada só — retry de chave inválida é vão; retry de bug de
 *     prompt só queima token).
 *   - 429 NUNCA vira fallback de provedor (A-P01-4): existe UM cliente
 *     injetado e é o único a receber chamadas — não há segundo transporte.
 *   - cache: chave = entrada (prompt+schema+params+model+stage_version);
 *     duas chamadas idênticas = UMA ida ao provedor; bumpar stageVersion
 *     invalida EXPLICITAMENTE; etapa NÃO entra na chave (o artefato é função
 *     da entrada) e acerto de cache não gasta slot.
 *   - usage: agregado POR ETAPA e acumulado entre chamadas do mesmo
 *     transporte (nunca se perde); etapas diferentes não se contaminam.
 *   - sanitização: a chave de API não aparece em mensagem de erro NEM em
 *     log, mesmo quando o transporte injetado vaza a chave na mensagem.
 *   - timeout por etapa: etapa travada é CANCELADA com erro estruturado
 *     (LLM_STAGE_TIMEOUT) e o slot do semáforo é liberado — com limite 1, a
 *     chamada seguinte conclui (se o slot vazasse, o teste penduraria).
 *
 * Sem rede, sem disco real, sem chave real: transport fake injetado, cache
 * em memória, apiKey fake. Nada fora de memória roda.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createCallLlm,
  LLM_TRANSPORT_CODES,
  LlmStageError,
  type LlmCallRequest,
} from '../electron/main/engine/runtime/callLlm';
import { DEFAULT_LLM_CONCURRENCY, createSemaphore, defaultExecConcurrency, type Semaphore } from '../electron/main/engine/runtime/semaphore';
import { createInMemoryCacheStore, type CacheStore } from '../electron/main/engine/runtime/llmCache';
import type { BackoffConfig } from '../electron/main/engine/runtime/backoff';
import {
  DEEPSEEK_ERROR_CODES,
  DeepSeekError,
  type DeepSeekChatRequest,
  type DeepSeekChatResponse,
  type DeepSeekClient,
} from '../electron/main/services/deepseekClient';

// ---------------------------------------------------------------------------
// Fakes (PURAS — nenhum IO, nenhuma rede, nenhuma chave real)
// ---------------------------------------------------------------------------

const SECRET = 'sk-1234567890abcdef0123456789abcdef';

function okResponse(over: Partial<DeepSeekChatResponse> = {}): DeepSeekChatResponse {
  return {
    content: '{"ok":true}',
    model: 'deepseek-v4-flash',
    usage: { promptTokens: 10, completionTokens: 5 },
    ...over,
  };
}

/** Requisição base de etapa — timeout alto por default (o teste reduz quando precisa). */
function baseReq(over: Partial<LlmCallRequest> = {}): LlmCallRequest {
  return {
    prompt: 'gere a aula 1',
    stageVersion: 'v1',
    timeoutMs: 5_000,
    ...over,
  };
}

/**
 * Cliente fake que conta chamadas e mede o pico de chamadas em voo — é com
 * esse pico que o teste 1 prova o teto do semáforo.
 */
function makeFakeClient(
  respond: (req: DeepSeekChatRequest, callIndex: number) => Promise<unknown> | unknown,
): { client: DeepSeekClient; calls: DeepSeekChatRequest[]; peak: () => number } {
  const calls: DeepSeekChatRequest[] = [];
  let inflight = 0;
  let peakSeen = 0;
  return {
    calls,
    peak: () => peakSeen,
    client: {
      async chatCompletion(req: DeepSeekChatRequest): Promise<DeepSeekChatResponse> {
        calls.push(req);
        inflight += 1;
        if (inflight > peakSeen) peakSeen = inflight;
        try {
          return (await respond(req, calls.length - 1)) as DeepSeekChatResponse;
        } finally {
          inflight -= 1;
        }
      },
    },
  };
}

interface SetupOverrides {
  respond?: (req: DeepSeekChatRequest, callIndex: number) => Promise<unknown> | unknown;
  apiKey?: () => Promise<string>;
  semaphore?: Semaphore;
  cache?: CacheStore;
  backoff?: BackoffConfig;
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
}

/** Monta transporte com os fakes; o logger padrão coleta (para asserções). */
function setup(over: SetupOverrides = {}) {
  const logs: string[] = [];
  const fake = makeFakeClient(over.respond ?? (async () => okResponse()));
  const transport = createCallLlm({
    client: fake.client,
    apiKey: over.apiKey ?? (async () => SECRET),
    semaphore: over.semaphore,
    cache: over.cache,
    backoff: over.backoff,
    sleep: over.sleep,
    log: over.log ?? ((line: string) => { logs.push(line); }),
  });
  return { transport, fake, logs };
}

// ---------------------------------------------------------------------------
// 1. Semáforo
// ---------------------------------------------------------------------------

describe('semáforo — SEM_LLM respeita o teto', () => {
  it('com limite 2 e 10 chamadas, o pico de concorrência observado é 2', async () => {
    const semaphore = createSemaphore(2);
    let active = 0;
    let peakSeen = 0;
    const { transport, fake } = setup({
      semaphore,
      respond: async () => {
        active += 1;
        if (active > peakSeen) peakSeen = active;
        await new Promise((r) => setTimeout(r, 15)); // atraso artificial
        active -= 1;
        return okResponse();
      },
    });

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        transport.callLlm(`etapa-${i}`, baseReq({ stageVersion: `v-etapa-${i}` })),
      ),
    );

    assert.equal(results.length, 10);
    assert.equal(fake.calls.length, 10);
    assert.equal(peakSeen, 2, `pico observado fora do teto: ${peakSeen}`);
    assert.ok(peakSeen > 1, 'precisa ser paralelo de verdade — senão o teto não está sendo testado');
  });

  it('release em finally: etapa que falha devolve o slot do SEM_LLM', async () => {
    const semaphore = createSemaphore(1);
    const { transport } = setup({
      semaphore,
      respond: async () => {
        throw new DeepSeekError(DEEPSEEK_ERROR_CODES.BAD_REQUEST, 'erro de pipeline');
      },
    });
    await assert.rejects(transport.callLlm('etapa', baseReq()), () => true);
    // Slot devolvido: adquirir direto não pendura (se o release vazasse, a
    // promessa do acquire ficaria na fila e o race devolveria 'timeout').
    const acquired = await Promise.race([
      semaphore.acquire(),
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 300)),
    ]);
    assert.notEqual(acquired, 'timeout', 'o slot não foi liberado após a falha da etapa');
    (acquired as () => void)();
  });

  it('defaults dos semáforos: LLM = 8 (plano §4.1) e EXEC derivado da CPU ≥ 1', () => {
    assert.equal(DEFAULT_LLM_CONCURRENCY, 8);
    assert.ok(defaultExecConcurrency() >= 1);
  });
});

// ---------------------------------------------------------------------------
// 2. Backoff por código
// ---------------------------------------------------------------------------

describe('backoff — política POR código de erro', () => {
  it('429 retenta com intervalos CRESCENTES (exponencial observado) e nunca vira fallback', async () => {
    const delays: number[] = [];
    const { transport, fake } = setup({
      backoff: {
        jitterRatio: 0, // determinístico — sem flakiness
        policies: { [DEEPSEEK_ERROR_CODES.RATE_LIMIT]: { baseDelayMs: 10, maxDelayMs: 1_000 } },
      },
      sleep: async (ms) => { delays.push(ms); },
      respond: async (_req, callIndex) => {
        if (callIndex < 3) throw new DeepSeekError(DEEPSEEK_ERROR_CODES.RATE_LIMIT, 'quota excedida');
        return okResponse();
      },
    });

    const res = await transport.callLlm('etapa', baseReq({ timeoutMs: 10_000 }));

    assert.equal(res.content, '{"ok":true}');
    assert.equal(fake.calls.length, 4); // 1 tentativa + 3 retentativas
    assert.deepEqual(delays, [10, 20, 40], 'backoff exponencial com jitter 0');
    for (let i = 1; i < delays.length; i += 1) {
      assert.ok(delays[i] > delays[i - 1], 'intervalos devem crescer entre retentativas');
    }
    // A-P01-4: 429 é backoff, nunca fallback — todas as idas foram no MESMO
    // cliente injetado; o transporte não constrói nem conhece outro provedor.
    assert.equal(fake.calls.length, 4);
  });

  it('KEY_INVALID aborta sem retentar — uma chamada só, erro estruturado', async () => {
    const { transport, fake } = setup({
      respond: async () => {
        throw new DeepSeekError(DEEPSEEK_ERROR_CODES.KEY_INVALID, 'chave sem permissão (HTTP 401)');
      },
    });
    await assert.rejects(
      transport.callLlm('etapa', baseReq()),
      (e: unknown) =>
        e instanceof LlmStageError &&
        e.code === DEEPSEEK_ERROR_CODES.KEY_INVALID &&
        e.etapa === 'etapa' &&
        e.attempts === 1,
    );
    assert.equal(fake.calls.length, 1);
  });

  it('KEY_MISSING aborta antes de chegar à rede — zero chamadas', async () => {
    const { transport, fake } = setup({ apiKey: async () => '' });
    await assert.rejects(
      transport.callLlm('etapa', baseReq()),
      (e: unknown) => e instanceof LlmStageError && e.code === DEEPSEEK_ERROR_CODES.KEY_MISSING,
    );
    assert.equal(fake.calls.length, 0);
  });
});

// ---------------------------------------------------------------------------
// 3. BAD_REQUEST
// ---------------------------------------------------------------------------

describe('backoff — BAD_REQUEST', () => {
  it('não retenta: bug de prompt não melhora repetindo a mesma chamada', async () => {
    const { transport, fake } = setup({
      respond: async () => {
        throw new DeepSeekError(DEEPSEEK_ERROR_CODES.BAD_REQUEST, 'invalid_request_error: modelo inválido');
      },
    });
    await assert.rejects(
      transport.callLlm('etapa', baseReq()),
      (e: unknown) =>
        e instanceof LlmStageError &&
        e.code === DEEPSEEK_ERROR_CODES.BAD_REQUEST &&
        e.retried === 0,
    );
    assert.equal(fake.calls.length, 1);
  });

  it('campos obrigatórios quebrados (prompt vazio/timeoutMs inválido) também não retentam', async () => {
    const { transport, fake } = setup();
    await assert.rejects(
      transport.callLlm('etapa', baseReq({ prompt: '   ' })),
      (e: unknown) => e instanceof LlmStageError && e.code === DEEPSEEK_ERROR_CODES.BAD_REQUEST,
    );
    await assert.rejects(
      transport.callLlm('etapa', baseReq({ timeoutMs: 0 })),
      (e: unknown) => e instanceof LlmStageError && e.code === DEEPSEEK_ERROR_CODES.BAD_REQUEST,
    );
    assert.equal(fake.calls.length, 0);
  });
});

// ---------------------------------------------------------------------------
// 4. Cache
// ---------------------------------------------------------------------------

describe('cache — artefato por entrada, invalidação só explícita', () => {
  it('duas chamadas idênticas produzem UMA ida à LLM fake', async () => {
    const cache = createInMemoryCacheStore();
    let trips = 0;
    const { transport, fake } = setup({
      cache,
      respond: async () => {
        trips += 1;
        return okResponse({ content: 'artefato-da-aula' });
      },
    });

    // Mesma entrada; etapas DIFERENTES — a chave é função da entrada, não da
    // etapa (documentado no llmCache.ts).
    const first = await transport.callLlm('etapa-alfa', baseReq({ prompt: 'mesma entrada' }));
    const second = await transport.callLlm('etapa-beta', baseReq({ prompt: 'mesma entrada' }));

    assert.equal(first.cached, false);
    assert.equal(second.cached, true);
    assert.equal(second.content, 'artefato-da-aula');
    assert.equal(trips, 1);
    assert.equal(fake.calls.length, 1);
    assert.equal(second.attempts, 0); // acerto de cache: zero tentativas
  });

  it('cache desligado sem store: mesma entrada chama o provedor de novo', async () => {
    let trips = 0;
    const { transport, fake } = setup({
      respond: async () => {
        trips += 1;
        return okResponse();
      },
    });
    await transport.callLlm('etapa', baseReq());
    await transport.callLlm('etapa', baseReq());
    assert.equal(trips, 2);
    assert.equal(fake.calls.length, 2);
  });

  it('bumpar stageVersion é a invalidação EXPLÍCITA: nova ida ao provedor', async () => {
    const cache = createInMemoryCacheStore();
    let trips = 0;
    const { transport } = setup({
      cache,
      respond: async () => {
        trips += 1;
        return okResponse({ content: `artefato-${trips}` });
      },
    });
    const a = await transport.callLlm('etapa', baseReq({ prompt: 'p', stageVersion: 'v1' }));
    const b = await transport.callLlm('etapa', baseReq({ prompt: 'p', stageVersion: 'v1' }));
    const c = await transport.callLlm('etapa', baseReq({ prompt: 'p', stageVersion: 'v2' }));
    assert.equal(a.cached, false);
    assert.equal(b.cached, true);
    assert.equal(c.cached, false); // v2 ≠ v1 ⇒ miss ⇒ nova ida
    assert.equal(trips, 2);
  });

  it('temperatura diferente tem chave diferente — não colide no cache', async () => {
    const cache = createInMemoryCacheStore();
    let trips = 0;
    const { transport } = setup({
      cache,
      respond: async () => {
        trips += 1;
        return okResponse();
      },
    });
    // A temperatura EFETIVA (o knob top-level que o transporte envia ao
    // provedor) entra na chave via params — mesmo prompt com knobs diferentes
    // não pode compartilhar artefato.
    await transport.callLlm('etapa', baseReq({ prompt: 'p', temperature: 0 }));
    await transport.callLlm('etapa', baseReq({ prompt: 'p', temperature: 0.7 }));
    assert.equal(trips, 2);
  });
});

// ---------------------------------------------------------------------------
// 5. Uso agregado por etapa
// ---------------------------------------------------------------------------

describe('usage — agregado por etapa', () => {
  it('acumula prompt/completion tokens por etapa e não se perde entre chamadas', async () => {
    const { transport } = setup(); // okResponse: 10 prompt + 5 completion
    await transport.callLlm('etapa-x', baseReq({ prompt: 'a' }));
    await transport.callLlm('etapa-x', baseReq({ prompt: 'b' }));
    const third = await transport.callLlm('etapa-x', baseReq({ prompt: 'c' }));

    assert.deepEqual(third.stageUsage, {
      promptTokens: 30,
      completionTokens: 15,
      llmCalls: 3,
      cachedHits: 0,
      retries: 0,
    });
    assert.deepEqual(transport.getStageUsage('etapa-x'), {
      promptTokens: 30,
      completionTokens: 15,
      llmCalls: 3,
      cachedHits: 0,
      retries: 0,
    });
    // Etapas diferentes não se contaminam; a telemetria total expõe as duas.
    await transport.callLlm('etapa-y', baseReq({ prompt: 'd' }));
    assert.deepEqual(transport.getAllStageUsage(), {
      'etapa-x': { promptTokens: 30, completionTokens: 15, llmCalls: 3, cachedHits: 0, retries: 0 },
      'etapa-y': { promptTokens: 10, completionTokens: 5, llmCalls: 1, cachedHits: 0, retries: 0 },
    });
  });

  it('realça retries e acertos de cache na contabilidade da etapa', async () => {
    const cache = createInMemoryCacheStore();
    const { transport } = setup({
      cache,
      backoff: {
        jitterRatio: 0,
        policies: { [DEEPSEEK_ERROR_CODES.NETWORK]: { baseDelayMs: 1, maxDelayMs: 10 } },
      },
      sleep: async () => {},
      respond: async (_req, callIndex) => {
        if (callIndex === 0) throw new DeepSeekError(DEEPSEEK_ERROR_CODES.NETWORK, 'timeout de rede');
        return okResponse();
      },
    });
    await transport.callLlm('etapa', baseReq()); // 1 retry
    const hit = await transport.callLlm('etapa', baseReq()); // cache hit
    assert.equal(hit.cached, true);
    assert.deepEqual(transport.getStageUsage('etapa'), {
      promptTokens: 10,
      completionTokens: 5,
      llmCalls: 1,
      cachedHits: 1,
      retries: 1,
    });
  });
});

// ---------------------------------------------------------------------------
// 6. A chave nunca vaza
// ---------------------------------------------------------------------------

describe('sanitização — a chave de API não vaza', () => {
  it('não aparece em mensagem de erro nem em log, mesmo com transporte que vaza a chave', async () => {
    const { transport, logs } = setup({
      apiKey: async () => SECRET,
      respond: async () => {
        // Transporte MALICIOSO/defeituoso: ecoa o Authorization no corpo do
        // erro. O transporte único precisa mascarar antes de propagar/logar.
        throw new DeepSeekError(
          DEEPSEEK_ERROR_CODES.KEY_INVALID,
          `Authorization inválida: Bearer ${SECRET} (HTTP 401)`,
        );
      },
    });

    await assert.rejects(transport.callLlm('etapa', baseReq()), (e: unknown) => {
      assert.ok(e instanceof LlmStageError);
      if (e instanceof LlmStageError) {
        assert.equal(e.code, DEEPSEEK_ERROR_CODES.KEY_INVALID);
        assert.ok(!e.message.includes(SECRET), `erro vazou a chave: ${e.message}`);
      }
      return true;
    });

    assert.ok(logs.length > 0, 'o transporte deveria ter logado a falha');
    for (const line of logs) {
      assert.ok(!line.includes(SECRET), `log vazou a chave: ${line}`);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Timeout de etapa
// ---------------------------------------------------------------------------

describe('timeout de etapa — não trava a onda', () => {
  it('cancela a chamada travada com erro estruturado e a chamada seguinte segue', async () => {
    // Limite 1: se o timeout não liberar o slot, a segunda chamada pendura
    // para sempre e o teste falha por timeout — é a rede de segurança do
    // contrato "etapa travada não segura a onda".
    const semaphore = createSemaphore(1);
    const { transport, fake } = setup({
      semaphore,
      respond: async (req) => {
        const text = req.messages.map((m) => m.content).join(' ');
        if (text.includes('travada')) {
          return new Promise<DeepSeekChatResponse>(() => {}); // nunca resolve
        }
        return okResponse({ content: 'sana' });
      },
    });

    const t0 = Date.now();
    await assert.rejects(
      transport.callLlm('etapa-travada', baseReq({ prompt: 'etapa travada', timeoutMs: 40 })),
      (e: unknown) =>
        e instanceof LlmStageError &&
        e.code === LLM_TRANSPORT_CODES.STAGE_TIMEOUT &&
        e.etapa === 'etapa-travada' &&
        e.attempts === 1,
    );
    const elapsed = Date.now() - t0;
    assert.ok(elapsed < 1_000, `timeout deveria disparar em ~40ms, levou ${elapsed}ms`);
    assert.equal(fake.calls.length, 1, 'etapa travada: uma única tentativa, sem retry');

    // O slot foi liberado: com limite 1, a etapa seguinte conclui.
    const next = await transport.callLlm('etapa-sana', baseReq({ prompt: 'sana', timeoutMs: 5_000 }));
    assert.equal(next.content, 'sana');
    assert.equal(next.cached, false);
  });
});