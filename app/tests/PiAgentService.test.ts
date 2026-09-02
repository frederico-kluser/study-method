/**
 * tests/PiAgentService.test.ts — integração PiAgentService com loaders fakes.
 * Nenhuma rede real: loadPiAi/loadPiCodingAgent e getAuthBridge injetados.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPiAgentService } from '../electron/main/services/PiAgentService';
import type { PiAgentServiceDeps } from '../electron/main/services/PiAgentService';
import type { PiAuthBridge } from '../electron/main/services/piAuthBridge';
import type { PiExecuteRequest, PiStreamEvent } from '@shared/ipc-contract';
import { OPENROUTER_MODEL } from '@shared/llm/constants';

interface RecordedSession {
  setRuntimeKey: [string, string];
  sessionConfig: Record<string, unknown>;
  promptText?: string;
  disposeCalls: number;
  abortCalls: number;
  streamEvents: Record<string, unknown>[];
}

interface FakeCtx {
  recorded: RecordedSession;
  fakeSession: any;
}

function makeSession(recorded: RecordedSession, opts: { failPrompt?: boolean } = {}) {
  const fakeSession: any = {
    agent: { streamFn: (_m: unknown, _c: unknown, o?: Record<string, unknown>) => o },
    subscribe: (cb: (e: unknown) => void) => {
      (fakeSession.__subs ??= []).push(cb);
      return () => undefined;
    },
    prompt: (text: string) => {
      recorded.promptText = text;
      return new Promise<void>((resolve, reject) => {
        if (opts.failPrompt) {
          reject(new Error('prompt failed'));
          return;
        }
        // Resolve only when told (permite abort/timeout enquanto pendente).
        fakeSession.__resolvePrompt = resolve;
      });
    },
    abort: () => {
      recorded.abortCalls += 1;
      return Promise.resolve();
    },
    dispose: () => {
      recorded.disposeCalls += 1;
    },
  };
  return fakeSession;
}

/** Emite um evento de streaming no 1º subscriber registrado. */
function emitStream(fakeSession: any, event: unknown) {
  const subs: ((e: unknown) => void)[] = fakeSession.__subs ?? [];
  assert.ok(subs.length > 0, 'expected at least one subscribe handler');
  subs[0](event);
}

function makeService(
  fakeSession: any,
  recorded: RecordedSession,
  extra?: Partial<PiAgentServiceDeps>
) {
  const loadPiCodingAgent = async () => ({
    createAgentSession: async (config: unknown) => {
      recorded.sessionConfig = config as Record<string, unknown>;
      return { session: fakeSession };
    },
    SessionManager: { inMemory: () => ({}) },
    createCodingTools: () => [],
    createReadTool: () => ({}),
    AuthStorage: {
      create: () => ({
        setRuntimeApiKey: (p: string, k: string) => {
          recorded.setRuntimeKey = [p, k];
        },
      }),
    },
    ModelRegistry: { inMemory: () => ({ find: () => undefined }) },
  });
  const loadPiAi = async () => ({ getModel: () => undefined });
  const authBridge: PiAuthBridge = {
    getApiKey: async (provider: string) => (provider === 'openrouter' ? 'sk-or-v1-key' : ''),
    getEnvVars: async (provider: string): Promise<Record<string, string>> =>
      provider === 'openrouter' ? { OPENROUTER_API_KEY: 'sk-or-v1-key' } : {},
    getConfiguredProviders: async () => ['openrouter'],
  };

  return createPiAgentService({
    loadPiAi,
    loadPiCodingAgent,
    getAuthBridge: async () => authBridge,
    ...extra,
  });
}

function makeRequest(overrides?: Partial<PiExecuteRequest>): PiExecuteRequest {
  return {
    prompt: 'Faz X',
    modelConfig: { provider: 'openrouter', model: OPENROUTER_MODEL.id },
    ...overrides,
  };
}

test('openrouter: setRuntimeApiKey antes do createAgentSession; modelo explícito usado', async () => {
  const recorded: RecordedSession = {
    setRuntimeKey: ['', ''],
    sessionConfig: {},
    disposeCalls: 0,
    abortCalls: 0,
    streamEvents: [],
  };
  const fakeSession = makeSession(recorded);
  const service = makeService(fakeSession, recorded);

  // Deixa o prompt resolver e coleta eventos.
  const events: PiStreamEvent[] = [];
  const run = service.execute(makeRequest(), (e) => events.push(e));
  setImmediate(() => fakeSession.__resolvePrompt?.());
  const result = await run;

  assert.equal(result.success, true);
  assert.deepEqual(recorded.setRuntimeKey, ['openrouter', 'sk-or-v1-key']);
  const model = recorded.sessionConfig.model as Record<string, unknown>;
  assert.equal(model.id, OPENROUTER_MODEL.id);
  assert.equal(model.provider, 'openrouter');
  assert.equal(model.baseUrl, OPENROUTER_MODEL.baseUrl);
  assert.equal((model.headers as Record<string, string>).Authorization, 'Bearer sk-or-v1-key');
  // O Model explícito carrega o mapa de effort — sem ele um thinkingLevel do
  // meio do enum iria cru na API e voltaria 400.
  const compat = model.compat as Record<string, unknown>;
  assert.deepEqual(compat.reasoningEffortMap, {
    minimal: 'low', low: 'low', medium: 'high', high: 'high', xhigh: 'max',
  });
  assert.equal(recorded.sessionConfig.cwd !== undefined, true);
  // Dispose no finally.
  assert.equal(recorded.disposeCalls, 1);
  // Eventos: starting + running + completed.
  assert.equal(events.some((e) => e.type === 'status_change' && e.status === 'starting'), true);
  assert.equal(events.some((e) => e.type === 'status_change' && e.status === 'completed'), true);
  // BLOCK 2: o status_change 'running' E o 'starting' carregam o MESMO sessionId
  // nos `data` (antes o 'running' mandava data:'running' e sobrescrevia o id na
  // UI, quebrando o abort). Nenhum consumer depende de data === 'running'.
  const startEv = events.find((e) => e.type === 'status_change' && e.status === 'starting') as
    { data?: string } | undefined;
  const runEv = events.find((e) => e.type === 'status_change' && e.status === 'running') as
    { data?: string } | undefined;
  assert.ok(runEv, 'esperava status_change running');
  assert.ok(startEv?.data, 'starting deve carregar sessionId nos data');
  assert.equal(runEv.data, startEv.data, 'running deve carregar o MESMO sessionId (não a string "running")');
  assert.notEqual(runEv.data, 'running');
});

test('streaming: message_update text_delta acumula output e emite PiStreamEvent com timestamp', async () => {
  const recorded: RecordedSession = {
    setRuntimeKey: ['', ''],
    sessionConfig: {},
    disposeCalls: 0,
    abortCalls: 0,
    streamEvents: [],
  };
  const fakeSession = makeSession(recorded);
  const service = makeService(fakeSession, recorded);

  const events: PiStreamEvent[] = [];
  const run = service.execute(makeRequest(), (e) => events.push(e));
  // Emite deltas via o subscriber registrado, depois resolve o prompt.
  setImmediate(() => {
    try {
      emitStream(fakeSession, { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Olá' } });
      emitStream(fakeSession, { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: ' mundo' } });
      emitStream(fakeSession, { type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: 'raciocínio' } });
      emitStream(fakeSession, { type: 'tool_execution_start', toolName: 'bash' });
      emitStream(fakeSession, { type: 'tool_execution_update', toolName: 'bash', partialResult: { content: [{ text: 'prog' }] } });
      emitStream(fakeSession, { type: 'tool_execution_end', toolName: 'bash' });
      emitStream(fakeSession, { type: 'turn_start' });
      emitStream(fakeSession, { type: 'turn_end' });
      emitStream(fakeSession, { type: 'agent_end' });
    } finally {
      fakeSession.__resolvePrompt?.();
    }
  });
  const result = await run;

  assert.equal(result.success, true);
  assert.equal(result.output, 'Olá mundo');
  assert.equal(events.some((e) => e.type === 'text_delta' && e.data === 'Olá'), true);
  assert.equal(events.some((e) => e.type === 'text_delta' && e.data === 'prog'), true);
  assert.equal(events.some((e) => e.type === 'thinking_delta' && e.data === 'raciocínio'), true);
  assert.equal(events.some((e) => e.type === 'tool_start' && e.toolName === 'bash'), true);
  assert.equal(events.some((e) => e.type === 'tool_end' && e.toolName === 'bash'), true);
  assert.equal(events.some((e) => e.type === 'turn_start'), true);
  assert.equal(events.some((e) => e.type === 'turn_end'), true);
  assert.equal(events.some((e) => e.type === 'agent_end'), true);
  // Todos os eventos streamados têm timestamp.
  assert.equal(events.every((e) => typeof e.timestamp === 'number' && e.timestamp > 0), true);
});

test('timeout: prompt pendente além do timeout → erro "Timeout after"', async () => {
  const recorded: RecordedSession = {
    setRuntimeKey: ['', ''],
    sessionConfig: {},
    disposeCalls: 0,
    abortCalls: 0,
    streamEvents: [],
  };
  const fakeSession = makeSession(recorded);
  const service = makeService(fakeSession, recorded);

  const result = await service.execute(makeRequest({ timeout: 20 }));
  // Também dispara dispose no finally.
  assert.equal(result.success, false);
  assert.ok(result.error && result.error.includes('Timeout after 20ms'));
  assert.equal(recorded.disposeCalls, 1);
});

test('abort: marca aborted e o execute retorna "Execution aborted by user"', async () => {
  const recorded: RecordedSession = {
    setRuntimeKey: ['', ''],
    sessionConfig: {},
    disposeCalls: 0,
    abortCalls: 0,
    streamEvents: [],
  };
  const fakeSession = makeSession(recorded);
  const service = makeService(fakeSession, recorded);

  let startedSessionId: string | undefined;
  const events: PiStreamEvent[] = [];
  const run = service.execute(makeRequest(), (e) => {
    events.push(e);
    if (e.type === 'status_change' && e.status === 'starting') startedSessionId = e.data;
  });

  setImmediate(async () => {
    service.abort(startedSessionId!);
    fakeSession.__resolvePrompt?.();
  });
  const result = await run;

  assert.equal(result.success, false);
  assert.equal(result.error, 'Execution aborted by user');
  assert.equal(recorded.abortCalls, 1);
  assert.equal(recorded.disposeCalls, 1);
});

test('prompt lançou → execute retorna erro', async () => {
  const recorded: RecordedSession = {
    setRuntimeKey: ['', ''],
    sessionConfig: {},
    disposeCalls: 0,
    abortCalls: 0,
    streamEvents: [],
  };
  const fakeSession = makeSession(recorded, { failPrompt: true });
  const service = makeService(fakeSession, recorded);

  const result = await service.execute(makeRequest());
  assert.equal(result.success, false);
  assert.equal(result.error, 'prompt failed');
  assert.equal(recorded.disposeCalls, 1);
});

test('sem chave: provider sem key → erro de configuração', async () => {
  const recorded: RecordedSession = {
    setRuntimeKey: ['', ''],
    sessionConfig: {},
    disposeCalls: 0,
    abortCalls: 0,
    streamEvents: [],
  };
  const fakeSession = makeSession(recorded);
  const service = createPiAgentService({
    loadPiAi: async () => ({ getModel: () => undefined }),
    loadPiCodingAgent: async () => ({
      createAgentSession: async () => ({ session: fakeSession }),
      SessionManager: { inMemory: () => ({}) },
      createCodingTools: () => [],
      createReadTool: () => ({}),
      AuthStorage: { create: () => ({ setRuntimeApiKey: () => undefined }) },
      ModelRegistry: { inMemory: () => ({ find: () => undefined }) },
    }),
    getAuthBridge: async () => ({
      getApiKey: async () => '',
      getEnvVars: async () => ({}),
      getConfiguredProviders: async () => [],
    }),
  });

  const result = await service.execute(makeRequest());
  assert.equal(result.success, false);
  assert.ok(result.error && result.error.includes('No API key configured'));
});

test('sessões são efêmeras: dispose no finally mesmo em sucesso (cada execute recria)', async () => {
  const recorded: RecordedSession = {
    setRuntimeKey: ['', ''],
    sessionConfig: {},
    disposeCalls: 0,
    abortCalls: 0,
    streamEvents: [],
  };
  const fakeSession = makeSession(recorded);
  const service = makeService(fakeSession, recorded);

  const run1 = service.execute(makeRequest({ prompt: 'primeiro' }));
  setImmediate(() => fakeSession.__resolvePrompt?.());
  const res1 = await run1;
  assert.equal(res1.success, true);
  assert.equal(recorded.disposeCalls, 1);
  assert.equal(recorded.promptText, 'primeiro');
});

test('SDK não carrega (loader lança) → execute retorna "Pi SDK not available" sem rede', async () => {
  const service = createPiAgentService({
    loadPiAi: async () => {
      throw new Error('module missing');
    },
    loadPiCodingAgent: async () => {
      throw new Error('module missing');
    },
    getAuthBridge: async () => ({
      getApiKey: async () => 'sk-x',
      getEnvVars: async () => ({}),
      getConfiguredProviders: async () => ['openrouter'],
    }),
  });

  const result = await service.execute(makeRequest());
  assert.equal(result.success, false);
  assert.ok(result.error && result.error.includes('Pi SDK not available'));
});

test('thinkingLevel != off é TRADUZIDO para o nível do SDK na config da sessão', async () => {
  const recorded: RecordedSession = {
    setRuntimeKey: ['', ''],
    sessionConfig: {},
    disposeCalls: 0,
    abortCalls: 0,
    streamEvents: [],
  };
  const fakeSession = makeSession(recorded);
  const service = makeService(fakeSession, recorded);

  const run = service.execute(
    makeRequest({ modelConfig: { provider: 'openrouter', model: 'x', thinkingLevel: 'medium' } }),
  );
  setImmediate(() => fakeSession.__resolvePrompt?.());
  const res = await run;

  assert.equal(res.success, true);
  assert.equal(recorded.sessionConfig.thinkingLevel, 'medium');
});

test("thinkingLevel 'max' vira 'xhigh' na sessão — NUNCA 'max' cru", async () => {
  // 'max' não existe no ThinkingLevel do pi-ai; o _clampThinkingLevel derruba
  // um nível desconhecido para 'off' e o raciocínio sumiria em silêncio.
  const recorded: RecordedSession = {
    setRuntimeKey: ['', ''],
    sessionConfig: {},
    disposeCalls: 0,
    abortCalls: 0,
    streamEvents: [],
  };
  const fakeSession = makeSession(recorded);
  const service = makeService(fakeSession, recorded);

  const run = service.execute(
    makeRequest({
      modelConfig: { provider: 'openrouter', model: OPENROUTER_MODEL.id, thinkingLevel: 'max' },
    }),
  );
  setImmediate(() => fakeSession.__resolvePrompt?.());
  const res = await run;

  assert.equal(res.success, true);
  assert.equal(recorded.sessionConfig.thinkingLevel, 'xhigh');
  assert.notEqual(recorded.sessionConfig.thinkingLevel, 'max');
  // E 'xhigh' + o reasoningEffortMap do Model = effort 'max' no fio.
  const compat = (recorded.sessionConfig.model as Record<string, unknown>).compat as Record<string, unknown>;
  const effortMap = compat.reasoningEffortMap as Record<string, string>;
  assert.equal(effortMap[recorded.sessionConfig.thinkingLevel as string], 'max');
});

test("thinkingLevel 'off' (e ausente) NÃO seta o campo na sessão", async () => {
  for (const thinkingLevel of ['off', undefined] as const) {
    const recorded: RecordedSession = {
      setRuntimeKey: ['', ''],
      sessionConfig: {},
      disposeCalls: 0,
      abortCalls: 0,
      streamEvents: [],
    };
    const fakeSession = makeSession(recorded);
    const service = makeService(fakeSession, recorded);

    const run = service.execute(
      makeRequest({
        modelConfig: { provider: 'openrouter', model: OPENROUTER_MODEL.id, thinkingLevel },
      }),
    );
    setImmediate(() => fakeSession.__resolvePrompt?.());
    const res = await run;

    assert.equal(res.success, true);
    assert.equal('thinkingLevel' in recorded.sessionConfig, false);
  }
});

test('skillSystemPrompt e additionalContext são prefixados ao prompt final', async () => {
  const recorded: RecordedSession = {
    setRuntimeKey: ['', ''],
    sessionConfig: {},
    disposeCalls: 0,
    abortCalls: 0,
    streamEvents: [],
  };
  const fakeSession = makeSession(recorded);
  const service = makeService(fakeSession, recorded);

  const run = service.execute(
    makeRequest({
      prompt: 'prompt do usuário',
      skillSystemPrompt: 'SKILL-PROMPT',
      additionalContext: 'CONTEXTO-EXTRA',
    }),
  );
  setImmediate(() => fakeSession.__resolvePrompt?.());
  const res = await run;

  assert.equal(res.success, true);
  assert.ok(recorded.promptText, 'prompt deveria ter sido chamado');
  assert.ok(recorded.promptText!.includes('SKILL-PROMPT\n\n---\n\nprompt do usuário'));
  assert.ok(recorded.promptText!.startsWith('CONTEXTO-EXTRA'));
});

test('temperatura 0 forçada no streamFn para openrouter; omitida p/ OpenAI-native reasoning', async () => {
  const recorded: RecordedSession = {
    setRuntimeKey: ['', ''],
    sessionConfig: {},
    disposeCalls: 0,
    abortCalls: 0,
    streamEvents: [],
  };
  const fakeSession = makeSession(recorded);
  const service = makeService(fakeSession, recorded);

  const run = service.execute(makeRequest());
  setImmediate(() => fakeSession.__resolvePrompt?.());
  const res = await run;
  assert.equal(res.success, true);

  // O streamFn original foi substituído na sessão; invoca o wrapped capturado.
  const wrapped = fakeSession.agent.streamFn as (
    model: unknown,
    ctx: unknown,
    opts?: Record<string, unknown>,
  ) => Record<string, unknown>;
  // openrouter (openai-completions) → força temperature:0.
  const orOpts = wrapped({ provider: 'openrouter', reasoning: true }, {}, { maxTokens: 5 });
  assert.equal(orOpts.temperature, 0);
  assert.equal(orOpts.maxTokens, 5);
  // OpenAI-native reasoning → NÃO injeta temperature (mantém opções).
  const openAiOpts = wrapped({ provider: 'openai', reasoning: true }, {}, { maxTokens: 5 });
  assert.equal('temperature' in openAiOpts, false);
  assert.equal(openAiOpts.maxTokens, 5);
});

test('provider não-openrouter com chave: resolve model via getModel/modelRegistry', async () => {
  const recorded: RecordedSession = {
    setRuntimeKey: ['', ''],
    sessionConfig: {},
    disposeCalls: 0,
    abortCalls: 0,
    streamEvents: [],
  };
  const fakeSession = makeSession(recorded);

  const service = createPiAgentService({
    loadPiAi: async () => ({
      getModel: (provider: string, model: string) =>
        provider === 'anthropic' ? { id: model, provider: 'anthropic', api: 'anthropic-chat' } : undefined,
    }),
    loadPiCodingAgent: async () => ({
      createAgentSession: async (config: unknown) => {
        recorded.sessionConfig = config as Record<string, unknown>;
        return { session: fakeSession };
      },
      SessionManager: { inMemory: () => ({}) },
      createCodingTools: () => [],
      createReadTool: () => ({}),
      AuthStorage: { create: () => ({ setRuntimeApiKey: () => undefined }) },
      ModelRegistry: { inMemory: () => ({ find: () => undefined }) },
    }),
    getAuthBridge: async () => ({
      getApiKey: async (provider: string) => (provider === 'anthropic' ? 'sk-anthropic' : ''),
      getEnvVars: async () => ({}),
      getConfiguredProviders: async () => ['anthropic'],
    }),
  });

  const run = service.execute(
    makeRequest({ modelConfig: { provider: 'anthropic', model: 'claude-sonnet-4' } }),
  );
  setImmediate(() => fakeSession.__resolvePrompt?.());
  const res = await run;

  assert.equal(res.success, true);
  const model = recorded.sessionConfig.model as Record<string, unknown>;
  assert.ok(model, 'model deveria vir do catálogo');
  assert.equal(model.id, 'claude-sonnet-4');
  assert.equal(model.provider, 'anthropic');
});

/** Cria várias sessões distintas (uma por execute) para abortAll/dispose. */
function makeMultiSession() {
  const sessions: any[] = [];
  const authBridge: PiAuthBridge = {
    getApiKey: async () => 'sk-or-v1-key',
    getEnvVars: async () => ({ OPENROUTER_API_KEY: 'sk-or-v1-key' }),
    getConfiguredProviders: async () => ['openrouter'],
  };
  const service = createPiAgentService({
    loadPiAi: async () => ({ getModel: () => undefined }),
    loadPiCodingAgent: async () => {
      const factory = async (config: unknown) => {
        const recorded: RecordedSession = {
          setRuntimeKey: ['', ''],
          sessionConfig: config as Record<string, unknown>,
          disposeCalls: 0,
          abortCalls: 0,
          streamEvents: [],
        };
        const s = makeSession(recorded);
        sessions.push({ session: s, recorded });
        return { session: s };
      };
      return {
        createAgentSession: factory,
        SessionManager: { inMemory: () => ({}) },
        createCodingTools: () => [],
        createReadTool: () => ({}),
        AuthStorage: { create: () => ({ setRuntimeApiKey: () => undefined }) },
        ModelRegistry: { inMemory: () => ({ find: () => undefined }) },
      };
    },
    getAuthBridge: async () => authBridge,
  });
  return { service, sessions };
}

test('abortAll: aborta toda sessão ativa e os executes retornam "aborted"', async () => {
  const { service, sessions } = makeMultiSession();
  const events1: PiStreamEvent[] = [];
  const events2: PiStreamEvent[] = [];
  const run1 = service.execute(makeRequest({ prompt: 'um' }), (e) => events1.push(e));
  const run2 = service.execute(makeRequest({ prompt: 'dois' }), (e) => events2.push(e));

  setImmediate(() => {
    service.abortAll();
    for (const { session } of sessions) session.__resolvePrompt?.();
  });
  const [res1, res2] = await Promise.all([run1, run2]);

  assert.equal(res1.success, false);
  assert.equal(res2.success, false);
  assert.equal(res1.error, 'Execution aborted by user');
  assert.equal(res2.error, 'Execution aborted by user');
  // Cada sessão ativa foi abortada (abort chamado ao menos uma vez por sessão).
  for (const { recorded } of sessions) {
    assert.ok(recorded.abortCalls >= 1);
    assert.equal(recorded.disposeCalls, 1);
  }
});

test('dispose: encerra todas as sessões ativas e limpa o registro', async () => {
  const { service, sessions } = makeMultiSession();
  const run1 = service.execute(makeRequest({ prompt: 'um' }));
  const run2 = service.execute(makeRequest({ prompt: 'dois' }));

  await new Promise<void>((r) => setImmediate(() => r()));
  await service.dispose();
  // Depois do dispose, as sessões que continuarem pendentes ainda recebem dispose.
  for (const { session } of sessions) session.__resolvePrompt?.();
  const [res1, res2] = await Promise.all([run1, run2]);

  assert.equal(res1.success, true);
  assert.equal(res2.success, true);
  for (const { recorded } of sessions) {
    assert.ok(recorded.disposeCalls >= 1, 'dispose() deveria chamar dispose na sessão');
  }
});

test('abort de id inexistente é no-op (não lança)', async () => {
  const { service } = makeMultiSession();
  assert.doesNotThrow(() => service.abort('pi-inexistente'));
  // abortAll/dispose com zero sessões também não lançam.
  await assert.doesNotReject(() => service.dispose());
  assert.doesNotThrow(() => service.abortAll());
});