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
    getApiKey: async (provider: string) => (provider === 'deepseek' ? 'sk-deepseek-key' : ''),
    getEnvVars: async (provider: string): Promise<Record<string, string>> =>
      provider === 'deepseek' ? { DEEPSEEK_API_KEY: 'sk-deepseek-key' } : {},
    getConfiguredProviders: async () => ['deepseek'],
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
    modelConfig: { provider: 'deepseek', model: 'deepseek-v4-flash-0731' },
    ...overrides,
  };
}

test('deepseek: setRuntimeApiKey antes do createAgentSession; modelo explícito usado', async () => {
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
  assert.deepEqual(recorded.setRuntimeKey, ['deepseek', 'sk-deepseek-key']);
  const model = recorded.sessionConfig.model as Record<string, unknown>;
  assert.equal(model.id, 'deepseek-v4-flash-0731');
  assert.equal(model.provider, 'deepseek');
  assert.equal(model.baseUrl, 'https://api.deepseek.com');
  assert.equal((model.headers as Record<string, string>).Authorization, 'Bearer sk-deepseek-key');
  assert.equal(recorded.sessionConfig.cwd !== undefined, true);
  // Dispose no finally.
  assert.equal(recorded.disposeCalls, 1);
  // Eventos: starting + running + completed.
  assert.equal(events.some((e) => e.type === 'status_change' && e.status === 'starting'), true);
  assert.equal(events.some((e) => e.type === 'status_change' && e.status === 'completed'), true);
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