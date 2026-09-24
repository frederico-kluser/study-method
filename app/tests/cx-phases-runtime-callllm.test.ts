/**
 * tests/cx-phases-runtime-callllm.test.ts — CARACTERIZAÇÃO (golden master) de
 * `engine/runtime/callLlm.ts` (o transporte ÚNICO de LLM da engine).
 *
 * PINA o contrato observável do transporte: erros estruturados tipados
 * (KEY_MISSING / BAD_REQUEST / STAGE_TIMEOUT / LLM_UNKNOWN / códigos do
 * cliente), política de retentativa observável via `attempts`/`retried`,
 * cache por entrada (incluindo a identidade de `reasoningEffort`), usage
 * agregado por etapa, mensagem montada entregue ao cliente injetado e a
 * liberação do slot do semáforo em TODOS os caminhos.
 *
 * Sem rede e sem chave real: cliente LLM FAKE, chave fake, sleep/relógio
 * injetados — exatamente o idioma dos testes existentes da engine.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  LLM_ERROR_CODES,
  LlmError,
  type LlmChatRequest,
  type LlmChatResponse,
  type LlmClient,
} from '../electron/main/services/llmClient';
import {
  LLM_TRANSPORT_CODES,
  LlmStageError,
  createCallLlm,
  type EngineLlm,
  type LlmCallRequest,
} from '../electron/main/engine/runtime/callLlm';
import { createInMemoryCacheStore, type CacheStore } from '../electron/main/engine/runtime/llmCache';
import { createSemaphore } from '../electron/main/engine/runtime/semaphore';
import { OPENROUTER_MAX_EFFORT, OPENROUTER_MODEL } from '@shared/llm/constants';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

type Script = (req: LlmChatRequest, chamada: number) => Promise<LlmChatResponse>;

/** Cliente fake: roteiro por chamada + registro de todas as requisições. */
function clienteFake(script: Script): { client: LlmClient; pedidos: LlmChatRequest[] } {
  const pedidos: LlmChatRequest[] = [];
  let chamada = 0;
  const client: LlmClient = {
    async chatCompletion(req) {
      pedidos.push(req);
      chamada += 1;
      return script(req, chamada);
    },
  };
  return { client, pedidos };
}

function resposta(content: string, over: Partial<LlmChatResponse> = {}): LlmChatResponse {
  return { content, model: 'modelo-fake', usage: { promptTokens: 10, completionTokens: 4 }, ...over };
}

interface Harness {
  llm: EngineLlm;
  pedidos: LlmChatRequest[];
  dormiu: number[];
  logs: string[];
  resolveuChave: number;
}

function harness(script: Script, over: Partial<Parameters<typeof createCallLlm>[0]> = {}): Harness {
  const { client, pedidos } = clienteFake(script);
  const dormiu: number[] = [];
  const logs: string[] = [];
  const h: Harness = {
    llm: null as unknown as EngineLlm,
    pedidos,
    dormiu,
    logs,
    resolveuChave: 0,
  };
  h.llm = createCallLlm({
    client,
    apiKey: async () => {
      h.resolveuChave += 1;
      return 'sk-chave-fake-super-secreta';
    },
    backoff: { jitterRatio: 0 },
    sleep: async (ms) => {
      dormiu.push(ms);
    },
    log: (linha) => logs.push(linha),
    ...over,
  });
  return h;
}

function requisicao(over: Partial<LlmCallRequest> = {}): LlmCallRequest {
  return { prompt: 'gere o brief', stageVersion: 'etapa-v1', timeoutMs: 1_000, ...over };
}

async function esperaStageError(fn: () => Promise<unknown>): Promise<LlmStageError> {
  let capturado: unknown;
  try {
    await fn();
  } catch (erro) {
    capturado = erro;
  }
  assert.ok(capturado instanceof LlmStageError, `esperado LlmStageError, veio ${String(capturado)}`);
  return capturado;
}

// ---------------------------------------------------------------------------
// 1. Caminho feliz e forma da requisição ao cliente
// ---------------------------------------------------------------------------

describe('callLlm — caminho feliz', () => {
  it('devolve conteúdo/modelo intactos, cached=false, attempts=1 e usage da chamada', async () => {
    const h = harness(async () => resposta('conteudo-gerado'));
    const r = await h.llm.callLlm('f0-brief', requisicao());
    assert.equal(r.content, 'conteudo-gerado');
    assert.equal(r.model, 'modelo-fake');
    assert.equal(r.cached, false);
    assert.equal(r.attempts, 1);
    assert.deepEqual(r.usage, { promptTokens: 10, completionTokens: 4 });
    assert.ok(r.elapsedMs >= 0);
    assert.equal(r.stageUsage.llmCalls, 1);
    assert.equal(r.stageUsage.retries, 0);
  });

  it('a requisição montada ao cliente: messages [system?/user], temperature 0, modelo e timeout repassados', async () => {
    const h = harness(async () => resposta('ok'));
    await h.llm.callLlm('etapa', requisicao({ system: 'sistema', maxTokens: 500 }));
    assert.equal(h.pedidos.length, 1);
    const p = h.pedidos[0];
    assert.deepEqual(p.messages, [
      { role: 'system', content: 'sistema' },
      { role: 'user', content: 'gere o brief' },
    ]);
    assert.equal(p.temperature, 0, 'default de temperatura é 0');
    assert.equal(p.maxTokens, 500);
    assert.equal(p.model, OPENROUTER_MODEL.id, 'modelo default é o contrato congelado');
    assert.equal(p.timeoutMs, 1_000);
  });

  it('system vazio/branco NÃO vira mensagem; reasoningEffort omitido não vai ao body', async () => {
    const h = harness(async () => resposta('ok'));
    await h.llm.callLlm('etapa', requisicao({ system: '   ' }));
    assert.equal(h.pedidos[0].messages.length, 1);
    assert.equal(h.pedidos[0].messages[0].role, 'user');
    assert.equal('reasoningEffort' in h.pedidos[0], false, 'ausência = cliente aplica o máximo');
  });

  it('reasoningEffort pedido pelo chamador é repassado ao body', async () => {
    const h = harness(async () => resposta('ok'));
    await h.llm.callLlm('etapa', requisicao({ reasoningEffort: 'low' }));
    assert.equal(h.pedidos[0].reasoningEffort, 'low');
  });

  it('uso acumula POR ETAPA; getStageUsage devolve CÓPIA e getAllStageUsage o mapa todo', async () => {
    const h = harness(async () => resposta('ok'));
    await h.llm.callLlm('f0', requisicao());
    await h.llm.callLlm('f0', requisicao());
    await h.llm.callLlm('f1', requisicao());
    assert.equal(h.llm.getStageUsage('f0')?.llmCalls, 2);
    assert.equal(h.llm.getStageUsage('f0')?.promptTokens, 20);
    assert.equal(h.llm.getStageUsage('f0')?.completionTokens, 8);
    assert.equal(h.llm.getStageUsage('f1')?.llmCalls, 1);
    assert.equal(h.llm.getStageUsage('nunca-chamada'), undefined);

    const copia = h.llm.getStageUsage('f0') as { llmCalls: number };
    copia.llmCalls = 999;
    assert.equal(h.llm.getStageUsage('f0')?.llmCalls, 2, 'o acumulador não vaza por referência');

    const tudo = h.llm.getAllStageUsage();
    assert.deepEqual(Object.keys(tudo).sort(), ['f0', 'f1']);
  });
});

// ---------------------------------------------------------------------------
// 2. Validação de requisição (BAD_REQUEST — bug de chamador, nunca retenta)
// ---------------------------------------------------------------------------

describe('callLlm — requisição inválida é LLM_BAD_REQUEST sem retentativa', () => {
  for (const [nome, req] of [
    ['prompt vazio', requisicao({ prompt: '  ' })],
    ['stageVersion vazia', requisicao({ stageVersion: '' })],
    ['timeoutMs zero', requisicao({ timeoutMs: 0 })],
    ['timeoutMs não-inteiro', requisicao({ timeoutMs: 2.5 })],
    ['timeoutMs negativo', requisicao({ timeoutMs: -1 })],
  ] as const) {
    it(`${nome}: erro estruturado com attempts=0`, async () => {
      const h = harness(async () => resposta('não deveria chegar aqui'));
      const erro = await esperaStageError(() => h.llm.callLlm('etapa', req as LlmCallRequest));
      assert.equal(erro.code, LLM_ERROR_CODES.BAD_REQUEST);
      assert.equal(erro.etapa, 'etapa');
      assert.equal(erro.attempts, 0);
      assert.equal(erro.retried, 0);
      assert.equal(h.pedidos.length, 0, 'nada vai ao provedor');
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Chave de API (memoizada, fail-closed antes de rede/cache)
// ---------------------------------------------------------------------------

describe('callLlm — chave de API', () => {
  it('chave vazia é KEY_MISSING determinístico ANTES de tocar o provedor', async () => {
    const { client } = clienteFake(async () => resposta('x'));
    let chamadas = 0;
    const llm = createCallLlm({
      client,
      apiKey: async () => {
        chamadas += 1;
        return '';
      },
    });
    for (let i = 0; i < 2; i += 1) {
      const erro = await esperaStageError(() => llm.callLlm('etapa', requisicao()));
      assert.equal(erro.code, LLM_ERROR_CODES.KEY_MISSING);
      assert.equal(erro.attempts, 0);
    }
    assert.equal(chamadas, 1, 'a chave é resolvida UMA vez e memoizada');
  });

  it('resolução que LANÇA vira KEY_MISSING com causa; memoização repete o MESMO fracasso', async () => {
    const { client } = clienteFake(async () => resposta('x'));
    let chamadas = 0;
    const llm = createCallLlm({
      client,
      apiKey: async () => {
        chamadas += 1;
        throw new Error('sem env');
      },
    });
    const e1 = await esperaStageError(() => llm.callLlm('etapa', requisicao()));
    const e2 = await esperaStageError(() => llm.callLlm('outra-etapa', requisicao()));
    assert.equal(e1.code, LLM_ERROR_CODES.KEY_MISSING);
    assert.equal(e2.code, LLM_ERROR_CODES.KEY_MISSING);
    assert.ok(e1.cause instanceof Error);
    assert.equal(chamadas, 1);
  });
});

// ---------------------------------------------------------------------------
// 4. Timeout de etapa (nunca trava a onda; libera o slot)
// ---------------------------------------------------------------------------

describe('callLlm — timeout de etapa', () => {
  it('chamada pendurada é cancelada com LLM_STAGE_TIMEOUT (attempts=1, sem retry)', async () => {
    const h = harness(() => new Promise<LlmChatResponse>(() => {}));
    const erro = await esperaStageError(() => h.llm.callLlm('etapa-travada', requisicao({ timeoutMs: 30 })));
    assert.equal(erro.code, LLM_TRANSPORT_CODES.STAGE_TIMEOUT);
    assert.equal(erro.etapa, 'etapa-travada');
    assert.equal(erro.attempts, 1);
    assert.equal(erro.retried, 0);
    assert.match(erro.message, /excedeu o teto de 30ms/);
  });

  it('abort do cliente (LlmError NETWORK + AbortError) também é STAGE_TIMEOUT', async () => {
    const abort = new Error('abortado');
    abort.name = 'AbortError';
    const h = harness(async () => {
      throw new LlmError(LLM_ERROR_CODES.NETWORK, 'fetch abortado', abort);
    });
    const erro = await esperaStageError(() => h.llm.callLlm('etapa', requisicao()));
    assert.equal(erro.code, LLM_TRANSPORT_CODES.STAGE_TIMEOUT);
    assert.match(erro.message, /abort do transporte/);
  });

  it('o SLOT do semáforo é liberado no timeout (a etapa seguinte passa)', async () => {
    const semaforo = createSemaphore(1);
    let chamada = 0;
    const h = harness(
      async () => {
        chamada += 1;
        if (chamada === 1) return new Promise<LlmChatResponse>(() => {});
        return resposta('segunda passa');
      },
      { semaphore: semaforo },
    );
    await assert.rejects(h.llm.callLlm('etapa', requisicao({ timeoutMs: 20 })));
    assert.equal(semaforo.active, 0, 'slot liberado no finally');
    const r = await h.llm.callLlm('etapa', requisicao());
    assert.equal(r.content, 'segunda passa');
  });
});

// ---------------------------------------------------------------------------
// 5. Política de retentativa OBSERVÁVEL (attempts/retried) por código
// ---------------------------------------------------------------------------

describe('callLlm — retentativas por código de erro', () => {
  it('RATE_LIMIT retenta até esgotar o default (5 tentativas, 4 retentativas)', async () => {
    const h = harness(async () => {
      throw new LlmError(LLM_ERROR_CODES.RATE_LIMIT, '429');
    });
    const erro = await esperaStageError(() => h.llm.callLlm('etapa', requisicao()));
    assert.equal(erro.code, LLM_ERROR_CODES.RATE_LIMIT);
    assert.equal(erro.attempts, 5, '1 + maxRetries 4 do default');
    assert.equal(erro.retried, 4);
    assert.equal(h.dormiu.length, 4, 'um backoff por retentativa');
  });

  it('RATE_LIMIT que se resolve na 2ª tentativa: attempts=2, stageUsage.retries=1', async () => {
    const h = harness(async (_req, n) => {
      if (n === 1) throw new LlmError(LLM_ERROR_CODES.RATE_LIMIT, '429');
      return resposta('recuperado');
    });
    const r = await h.llm.callLlm('etapa', requisicao());
    assert.equal(r.attempts, 2);
    assert.equal(r.content, 'recuperado');
    assert.equal(r.stageUsage.retries, 1);
    assert.equal(r.stageUsage.llmCalls, 1, 'só o sucesso conta como ida ao provedor');
  });

  it('BAD_REQUEST e KEY_INVALID NUNCA retentam (attempts=1)', async () => {
    for (const code of [LLM_ERROR_CODES.BAD_REQUEST, LLM_ERROR_CODES.KEY_INVALID]) {
      const h = harness(async () => {
        throw new LlmError(code, 'definitivo');
      });
      const erro = await esperaStageError(() => h.llm.callLlm('etapa', requisicao()));
      assert.equal(erro.code, code);
      assert.equal(erro.attempts, 1);
      assert.equal(erro.retried, 0);
      assert.deepEqual(h.dormiu, [], 'nem backoff para erro definitivo');
    }
  });

  it('EMPTY_CONTENT retenta EXATAMENTE UMA vez (default)', async () => {
    const h = harness(async () => {
      throw new LlmError(LLM_ERROR_CODES.EMPTY_CONTENT, 'sem conteúdo');
    });
    const erro = await esperaStageError(() => h.llm.callLlm('etapa', requisicao()));
    assert.equal(erro.code, LLM_ERROR_CODES.EMPTY_CONTENT);
    assert.equal(erro.attempts, 2);
    assert.equal(erro.retried, 1);
  });

  it('erro NÃO tipado do transporte é LLM_UNKNOWN e não retenta (fail-closed)', async () => {
    const h = harness(async () => {
      throw new TypeError('estouro estranho');
    });
    const erro = await esperaStageError(() => h.llm.callLlm('etapa', requisicao()));
    assert.equal(erro.code, LLM_TRANSPORT_CODES.UNKNOWN);
    assert.equal(erro.attempts, 1);
    assert.equal(erro.retried, 0);
    assert.ok(erro.cause instanceof TypeError);
  });

  it('Retry-After do 429 manda no atraso (dentro do teto da política)', async () => {
    const h = harness(async () => {
      throw new LlmError(LLM_ERROR_CODES.RATE_LIMIT, '429', undefined, 1234);
    });
    await esperaStageError(() => h.llm.callLlm('etapa', requisicao()));
    assert.deepEqual(h.dormiu, [1234, 1234, 1234, 1234], 'atraso do SERVIDOR, não o exponencial');
  });

  it('override de backoff por código é respeitado (maxRetries 1 → 2 tentativas)', async () => {
    const h = harness(
      async () => {
        throw new LlmError(LLM_ERROR_CODES.NETWORK, 'queda');
      },
      { backoff: { jitterRatio: 0, policies: { LLM_NETWORK: { maxRetries: 1, baseDelayMs: 1, maxDelayMs: 1 } } } },
    );
    const erro = await esperaStageError(() => h.llm.callLlm('etapa', requisicao()));
    assert.equal(erro.attempts, 2);
    assert.equal(erro.retried, 1);
  });
});

// ---------------------------------------------------------------------------
// 6. Cache por entrada (presença do store = ligado)
// ---------------------------------------------------------------------------

describe('callLlm — cache por chave de entrada', () => {
  it('segunda chamada idêntica é cache-hit: sem ida ao provedor, attempts=0, usage ausente', async () => {
    const h = harness(async () => resposta('artefato'), { cache: createInMemoryCacheStore() });
    const r1 = await h.llm.callLlm('etapa', requisicao());
    const r2 = await h.llm.callLlm('etapa', requisicao());
    assert.equal(r1.cached, false);
    assert.equal(r2.cached, true);
    assert.equal(r2.content, 'artefato');
    assert.equal(r2.attempts, 0);
    assert.equal(r2.usage, undefined, 'acerto de cache não gasta token');
    assert.equal(h.pedidos.length, 1, 'uma única ida ao provedor');
    assert.equal(r2.stageUsage.cachedHits, 1);
    assert.equal(r2.stageUsage.llmCalls, 1, 'o acumulado da etapa mantém a ida anterior');
  });

  it('stageVersion/temperatura/system/modelo distintos NÃO compartilham artefato', async () => {
    const h = harness(async (_req, n) => resposta(`artefato-${n}`), { cache: createInMemoryCacheStore() });
    const base = requisicao();
    await h.llm.callLlm('etapa', base);
    const r2 = await h.llm.callLlm('etapa', { ...base, stageVersion: 'etapa-v2' });
    const r3 = await h.llm.callLlm('etapa', { ...base, temperature: 0.7 });
    const r4 = await h.llm.callLlm('etapa', { ...base, system: 'outro sistema' });
    const r5 = await h.llm.callLlm('etapa', { ...base, modelId: 'outro-modelo' });
    for (const r of [r2, r3, r4, r5]) {
      assert.equal(r.cached, false, 'cada identidade distinta produz artefato próprio');
    }
    assert.equal(h.pedidos.length, 5);
  });

  it('reasoningEffort EXPLÍCITO "max" e omissão compartilham o MESMO artefato (a chave usa o effort efetivo)', async () => {
    const h = harness(async () => resposta('artefato'), { cache: createInMemoryCacheStore() });
    await h.llm.callLlm('etapa', requisicao());
    const r2 = await h.llm.callLlm('etapa', requisicao({ reasoningEffort: OPENROUTER_MAX_EFFORT }));
    assert.equal(r2.cached, true);
    assert.equal(h.pedidos.length, 1);
  });

  it('reasoningEffort DIFERENTE do efetivo é artefato distinto (reprodutibilidade)', async () => {
    const h = harness(async (_req, n) => resposta(`artefato-${n}`), { cache: createInMemoryCacheStore() });
    await h.llm.callLlm('etapa', requisicao());
    const r2 = await h.llm.callLlm('etapa', requisicao({ reasoningEffort: 'low' }));
    assert.equal(r2.cached, false);
    assert.equal(h.pedidos.length, 2);
  });

  it('falha de IO do cache nunca derruba o transporte (miss/malha silenciosos)', async () => {
    const storeQuebrado: CacheStore = {
      async get() {
        throw new Error('disco do cache morreu');
      },
      async set() {
        throw new Error('disco do cache morreu');
      },
      async delete() {},
      async clear() {},
    };
    const h = harness(async () => resposta('sobrevive'), { cache: storeQuebrado });
    const r = await h.llm.callLlm('etapa', requisicao());
    assert.equal(r.content, 'sobrevive');
    assert.equal(r.cached, false);
    assert.ok(h.logs.some((l) => l.includes('cache-erro')), 'o incidente é logado');
  });

  it('sem store, cache está DESLIGADO: duas chamadas vão ao provedor', async () => {
    const h = harness(async (_req, n) => resposta(`artefato-${n}`));
    await h.llm.callLlm('etapa', requisicao());
    const r2 = await h.llm.callLlm('etapa', requisicao());
    assert.equal(r2.cached, false);
    assert.equal(h.pedidos.length, 2);
  });

  it('acerto de cache acontece ANTES do semáforo e não consome slot', async () => {
    const semaforo = createSemaphore(1);
    const h = harness(async () => resposta('artefato'), {
      cache: createInMemoryCacheStore(),
      semaphore: semaforo,
    });
    await h.llm.callLlm('etapa', requisicao());
    assert.equal(semaforo.active, 0);
    const r2 = await h.llm.callLlm('etapa', requisicao());
    assert.equal(r2.cached, true);
    assert.equal(semaforo.active, 0);
  });
});

// ---------------------------------------------------------------------------
// 7. Sanitização de log e mensagem (a chave NUNCA vaza)
// ---------------------------------------------------------------------------

describe('callLlm — sanitização', () => {
  it('nenhuma linha de log nem mensagem de erro contém a chave de API', async () => {
    const h = harness(async () => {
      throw new LlmError(LLM_ERROR_CODES.SERVER_ERROR, 'erro com a sk-chave-fake-super-secreta no meio');
    });
    const erro = await esperaStageError(() => h.llm.callLlm('etapa', requisicao()));
    const tudo = [...h.logs, erro.message].join('\n');
    assert.ok(!tudo.includes('sk-chave-fake-super-secreta'), 'a chave foi mascarada em log e erro');
    assert.ok(h.logs.length > 0, 'o caminho de erro loga evento estruturado');
  });
});
