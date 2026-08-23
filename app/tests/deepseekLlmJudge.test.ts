/**
 * tests/deepseekLlmJudge.test.ts — juiz LLM do protocolo REQUEST/APPLY.
 * A assinatura é a EXATA de LlmJudge do StudyMethodRunner. O objeto devolvido é
 * o corpo de `items[0]` — o runner monta o envelope da RESPOSTA (buildApplyFile)
 * repetindo protocol/protocol_version/request_id/kind do pedido; o juiz NÃO monta
 * envelope. Cliente fake injetado isola o judge do transporte.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDeepSeekLlmJudge,
  extractFirstJsonObject,
} from '../electron/main/services/deepseekLlmJudge';
import { DEEPSEEK_ERROR_CODES, DeepSeekError } from '../electron/main/services/deepseekClient';
import type { StudyRequestEnvelope } from '../electron/main/services/studyMethodRunner';

/** Implementação do contrato que o runner espera (StudyRequestEnvelope). */
function makeEnvelope(overrides: Partial<StudyRequestEnvelope> = {}): StudyRequestEnvelope {
  return {
    protocol: 'study-method/request-apply',
    protocol_version: '1.0',
    request_id: 'aabbccddeeff',
    script: 'memory-compact.sh',
    kind: 'compact_facts',
    setup_id: '0123456789ab',
    generated_at: '2026-08-23T12:00:00.000Z',
    response_schema: '{"type":"object"}',
    instructions_pt_br: 'Consolide os fatos.',
    payload: { schema_version: '1.0', request_kind: 'memory_compact', sessions: [] },
    ...overrides,
  };
}

/** Cliente fake gravando o pedido recebido e devolvendo content programável. */
function fakeClient(respond: (req: { messages: { role: string; content: string }[]; temperature?: number; model?: string }) => { content: string }) {
  const calls: Array<{ messages: { role: string; content: string }[]; temperature?: number; model?: string }> = [];
  const client = {
    chatCompletion: async (req: any) => {
      calls.push(req);
      const r = respond(req);
      return { content: r.content, model: 'deepseek-v4-flash' };
    },
  };
  return { client, calls };
}

test('extractFirstJsonObject: lê bloco JSON entre crases com texto ao redor', () => {
  const content = 'Claro!\n```json\n{"schema_version":"1.0","items":[1]}\n```\nFim.';
  assert.deepEqual(extractFirstJsonObject(content), { schema_version: '1.0', items: [1] });
});

test('extractFirstJsonObject: texto puro sem chaves → undefined', () => {
  assert.equal(extractFirstJsonObject('sem json aqui'), undefined);
});

test('extractFirstJsonObject: JSON embutido no fim de texto → objeto', () => {
  assert.deepEqual(extractFirstJsonObject('resposta: {"a":1}'), { a: 1 });
});

test('judge: monta system/user com instructions + response_schema + payload, temperature 0', async () => {
  const envelope = makeEnvelope({
    instructions_pt_br: 'Consolide os fatos da sessão.',
    response_schema: '{"type":"object","required":["schema_version"]}',
    payload: { schema_version: '1.0', request_kind: 'memory_compact' },
  });
  const { client, calls } = fakeClient(() => ({
    content: '{"schema_version":"1.0","request_kind":"memory_compact","semantic_facts":[],"procedural_facts":[]}',
  }));

  const judge = createDeepSeekLlmJudge({ client });
  const out = await judge(envelope);

  assert.equal(calls.length, 1);
  const req = calls[0];
  assert.equal(req.temperature, 0, 'temperature deve ser 0');
  assert.equal(req.messages[0].role, 'system');
  assert.match(req.messages[0].content, /juiz automatizado do tutor study-method/);
  assert.equal(req.messages[1].role, 'user');
  assert.match(req.messages[1].content, /Consolide os fatos da sessão/);
  assert.match(req.messages[1].content, /required.*schema_version/);
  assert.match(req.messages[1].content, /PAYLOAD DO PEDIDO/);
  assert.match(req.messages[1].content, /memory_compact/);

  // devolve o OBJETO de items[0] (parsed), não a string nem o envelope.
  assert.deepEqual(out, {
    schema_version: '1.0',
    request_kind: 'memory_compact',
    semantic_facts: [],
    procedural_facts: [],
  });
});

test('judge: request_id/kind do pedido são preservados (o runner monta o envelope)', async () => {
  const envelope = makeEnvelope({
    request_id: 'abcd1234ffff',
    kind: 'compact_facts',
    payload: { schema_version: '1.0', request_kind: 'memory_compact' },
  });
  const { client } = fakeClient(() => ({
    content: 'gerado\n```json\n{"schema_version":"1.0","request_kind":"memory_compact"}\n```\nextra',
  }));
  const judge = createDeepSeekLlmJudge({ client });
  const out = await judge(envelope) as Record<string, unknown>;

  // O objeto devolvido NÃO carrega envelope: quem repete request_id/kind/campos
  // do envelope é o buildApplyFile do runner, com os valores IDÊNTICOS do pedido.
  assert.equal('request_id' in out, false);
  assert.equal('kind' in out, false);
  assert.equal(out.request_kind, 'memory_compact');
});

test('judge: sem chave (getApiKey vazio) → degrada com null, sem lançar', async () => {
  // Sem cliente: se não houver getApiKey, degrada sem disparar rede nem erro.
  const judge = createDeepSeekLlmJudge({ getApiKey: async () => '' });
  const out = await judge(makeEnvelope());
  assert.equal(out, null);
});

test('judge: sem getApiKey e sem cliente → degrada com null', async () => {
  const judge = createDeepSeekLlmJudge({});
  const out = await judge(makeEnvelope());
  assert.equal(out, null);
});

test('judge: cliente rejeita com KEY_MISSING → degrada com null (não estoura)', async () => {
  const client = {
    chatCompletion: async () => {
      throw new DeepSeekError(DEEPSEEK_ERROR_CODES.KEY_MISSING, 'DeepSeek: chave não configurada.');
    },
  };
  const judge = createDeepSeekLlmJudge({ client });
  const out = await judge(makeEnvelope());
  assert.equal(out, null);
});

test('judge: fix15c B2 — cliente lança EMPTY_CONTENT (2xx só com reasoning_content) → degrada com null', async () => {
  // Antes da correção, o EMPTY_CONTENT era RE-LANÇADO e o handleExit10 (que não
  // captura throw do juiz) derrubava a geração da aula inteira. Agora deve
  // degradar como retorno não-objeto → buildApplyFile vira applyExhausted.
  const client = {
    chatCompletion: async () => {
      throw new DeepSeekError(
        DEEPSEEK_ERROR_CODES.EMPTY_CONTENT,
        'DeepSeek: resposta com content vazio (o modelo devolveu apenas reasoning_content).'
      );
    },
  };
  const judge = createDeepSeekLlmJudge({ client });
  assert.equal(await judge(makeEnvelope()), null);
});

test('judge: cliente lança NETWORK → degrada com null (sem conteúdo utilizável)', async () => {
  const client = {
    chatCompletion: async () => {
      throw new DeepSeekError(DEEPSEEK_ERROR_CODES.NETWORK, 'DeepSeek: falha de rede.');
    },
  };
  const judge = createDeepSeekLlmJudge({ client });
  assert.equal(await judge(makeEnvelope()), null);
});

test('judge: erro não-degradante do cliente → propaga como DeepSeekError', async () => {
  const client = {
    chatCompletion: async () => {
      throw new DeepSeekError(DEEPSEEK_ERROR_CODES.RATE_LIMIT, 'DeepSeek: rate limit');
    },
  };
  const judge = createDeepSeekLlmJudge({ client });
  await assert.rejects(
    judge(makeEnvelope()),
    (e: unknown) => e instanceof DeepSeekError && e.code === DEEPSEEK_ERROR_CODES.RATE_LIMIT
  );
});

test('judge: modelo devolve JSON inválido → degrada com null', async () => {
  const { client } = fakeClient(() => ({ content: 'isto não é JSON de jeito nenhum' }));
  const judge = createDeepSeekLlmJudge({ client });
  assert.equal(await judge(makeEnvelope()), null);
});

test('judge: content com array de topo → degrada com null (items[0] precisa de objeto)', async () => {
  const { client } = fakeClient(() => ({ content: '[1,2,3]' }));
  const judge = createDeepSeekLlmJudge({ client });
  assert.equal(await judge(makeEnvelope()), null);
});

test('judge: model injetado repassa ao cliente', async () => {
  const { client, calls } = fakeClient(() => ({ content: '{"a":1}' }));
  const judge = createDeepSeekLlmJudge({ client, model: 'deepseek-v4-flash' });
  await judge(makeEnvelope());
  assert.equal(calls[0].model, 'deepseek-v4-flash');
});

test('judge: deps.client + getApiKey presente em branco → degrada antes de usar o cliente', async () => {
  let called = 0;
  const client = {
    chatCompletion: async () => {
      called += 1;
      return { content: '{"a":1}', model: 'm' };
    },
  };
  const judge = createDeepSeekLlmJudge({ client, getApiKey: async () => '   ' });
  assert.equal(await judge(makeEnvelope()), null);
  assert.equal(called, 0);
});