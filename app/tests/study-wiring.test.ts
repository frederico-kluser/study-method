/**
 * tests/study-wiring.test.ts — FIAÇÃO da onda 3 (ui-wiring). Cobre:
 *   (a) buildMainSetup chama os 5 registradores na ordem ipc→keys→localAi→pi→study;
 *   (b) pi:execute valida args e chama o serviço (fake), streamando eventos via emit;
 *   (c) study:generate-lesson chama lesson.generateLesson com onProgress emitindo
 *       LESSON_PROGRESS e devolve { lesson, rejected };
 *   (d) workspace files: path traversal rejeitado/não lido fora; leitura dentro ok;
 *   (e) safeHandle registra 2x sem lançar (remove+handle);
 *   (f) keys-handlers: chave digitada validada (fetch fake registra o Authorization).
 *
 * Os handlers testados via build*Handlers são PURAS (não tocam electron); para o
 * wiring do bootstrap (a) injetamos fakes direto em buildMainSetup; para (e)/(f)
 * interceptamos require/import de electron por Módulo._load e fetch global.
 */
import { describe, it, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Module } from 'node:module';
import * as path from 'node:path';
import { promises as fsp } from 'node:fs';
import * as os from 'node:os';

import { STUDY_CHANNELS, PI_CHANNELS, KEYS_CHANNELS, LOCAL_AI_CHANNELS,
  type ChallengeInfo, type WorkspaceFile, type TestAnswerResult, type PiExecuteResult,
  type HardwareInfo, type LocalModelInfo } from '../shared/ipc-contract';
import { buildMainSetup } from '../electron/main/main-setup';
import { safeHandle, safeHandleMap, type IpcMainHandleLike } from '../electron/main/ipc/safeHandle';
import { buildPiHandlers, registerPiHandlers, type PiAgentServiceLike } from '../electron/main/ipc/pi-handlers';
import {
  buildStudyHandlers,
  registerStudyHandlers,
  resolveContainedWorkspacePath,
  __resetStudyHandlersMemory,
  type RunnerLike,
  type LessonServiceLike,
} from '../electron/main/ipc/study-handlers';
import { registerLocalAiHandlers, type LlmLike } from '../electron/main/ipc/localAi-handlers';
import type { SettingsStore } from '../electron/main/services/settingsStore';

/** ipcMain fake que retém handlers por canal e implementa removeHandler (safeHandle). */
function makeFakeIpc(): IpcMainHandleLike & { handlers: Map<string, (...args: unknown[]) => unknown> } {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    handlers,
    removeHandler(channel) {
      handlers.delete(channel);
    },
    handle(channel, fn) {
      handlers.set(channel, fn);
    },
  };
}

// ─── (a) ordem de registro do bootstrap ─────────────────────────────────────
describe('(a) buildMainSetup ordem de registro', () => {
  it('chama os 5 registradores na ordem ipc→keys→localAi→pi→study', async () => {
    const called: string[] = [];
    await buildMainSetup({
      registerIpc: async () => {
        called.push('registerIpc');
      },
      registerKeys: () => {
        called.push('registerKeys');
      },
      registerLocalAi: async () => {
        called.push('registerLocalAi');
      },
      registerPi: async () => {
        called.push('registerPi');
      },
      registerStudy: async () => {
        called.push('registerStudy');
      },
    });
    assert.deepEqual(called, ['registerIpc', 'registerKeys', 'registerLocalAi', 'registerPi', 'registerStudy']);
  });

  it('registerIpc é await antes de registerKeys (genéricos/placeholders primeiro)', async () => {
    let order = 'none';
    await buildMainSetup({
      registerIpc: async () => {
        order = order === 'keys' ? 'ipc-depois' : 'ipc';
      },
      registerKeys: () => {
        order = order === 'ipc' ? 'keys-apos' : 'keys-antes';
      },
      registerLocalAi: async () => {},
      registerPi: async () => {},
      registerStudy: async () => {},
    });
    assert.equal(order, 'keys-apos');
  });
});

// ─── (b) pi:execute ─────────────────────────────────────────────────────────
describe('(b) pi:execute via buildPiHandlers', () => {
  it('valida o shape e chama o serviço, streamando eventos via emit', async () => {
    const events: Array<{ channel: string; ev: unknown }> = [];
    const calls: Array<{ request: unknown }> = [];
    const fakeService: PiAgentServiceLike = {
      execute: async (request, onEvent) => {
        calls.push({ request });
        onEvent?.({ type: 'text_delta', data: 'oi', timestamp: Date.now() });
        return { success: true, output: 'oi', executionTimeMs: 1 };
      },
      abort: () => {},
    };
    const handlers = buildPiHandlers({
      getService: async () => fakeService,
      emit: (channel, ev) => events.push({ channel, ev }),
    });
    const execute = handlers.get(PI_CHANNELS.EXECUTE)!;
    const result = await execute(undefined, {
      prompt: 'escreva um teste',
      modelConfig: { provider: 'openrouter', model: 'z-ai/glm-5.3-flash' },
    });

    assert.equal(calls.length, 1);
    assert.deepEqual((calls[0].request as { prompt: string }).prompt, 'escreva um teste');
    assert.equal((result as { success: boolean }).success, true);
    // o onEvent do serviço é encaminhado ao emit no canal STREAM_EVENT.
    const streamEv = events.find((e) => e.channel === PI_CHANNELS.STREAM_EVENT);
    assert.ok(streamEv, 'esperava evento pi:stream-event');
    assert.equal((streamEv.ev as { type: string }).type, 'text_delta');
  });

  it('shape inválido → devolve PiExecuteResult estruturado de erro (NÃO lança)', async () => {
    const handlers = buildPiHandlers({
      getService: async () => ({ execute: async () => ({ success: false, output: '', executionTimeMs: 0 }), abort: () => {} }),
      emit: () => {},
    });
    const execute = handlers.get(PI_CHANNELS.EXECUTE)!;
    // Sem `prompt` → erro estruturado com output/executionTimeMs zerados.
    const r1 = (await execute(undefined, { modelConfig: { provider: 'x', model: 'y' } })) as {
      success: boolean;
      error?: string;
      output: string;
      executionTimeMs: number;
    };
    assert.equal(r1.success, false);
    assert.match(r1.error ?? '', /prompt/);
    assert.equal(r1.output, '');
    assert.equal(r1.executionTimeMs, 0);
    // modelConfig inválido → idem.
    const r2 = (await execute(undefined, { prompt: 'ok', modelConfig: {} })) as {
      success: boolean;
      error?: string;
    };
    assert.equal(r2.success, false);
    assert.match(r2.error ?? '', /modelConfig/);
  });

  it('pi:abort sem sessionId → devolve { ok:false, error } (NÃO lança)', async () => {
    let aborted = false;
    const handlers = buildPiHandlers({
      getService: async () => ({ execute: async () => ({ success: true, output: '', executionTimeMs: 0 }), abort: () => { aborted = true; } }),
      emit: () => {},
    });
    const abort = handlers.get(PI_CHANNELS.ABORT)!;
    const res = (await abort(undefined)) as { ok: boolean; error?: string };
    assert.equal(res.ok, false);
    assert.match(res.error ?? '', /sessionId/);
    assert.equal(aborted, false, 'não deve chamar svc.abort sem sessionId');

    const ok = (await abort(undefined, 'abc')) as { ok: boolean };
    assert.equal(ok.ok, true);
    assert.equal(aborted, true);
  });
});

// ─── (c) study:generate-lesson ──────────────────────────────────────────────
describe('(c) study:generate-lesson', () => {
  it('chama lesson.generateLesson com onProgress emitindo LESSON_PROGRESS e devolve {lesson, rejected}', async () => {
    const emitted: Array<{ channel: string; ev: unknown }> = [];
    let onProgressCaptured: ((p: unknown) => void) | undefined;
    const lesson = {
      generateLesson: async (subject: string, opts: { onProgress?: (p: unknown) => void }) => {
        onProgressCaptured = opts.onProgress;
        return {
          lesson: {
            title: 'Aula',
            subject,
            markdown: '# Aula',
            findings: [],
            challenges: [],
            createdAt: 'now',
          },
          rejected: [{ slug: 'x', verdict: 'weak' }],
        };
      },
      testAnswer: async () => ({ success: true, testsRun: 1, expectedTests: 1, passed: true, output: '' }),
      listSetups: async () => ({ rows: [] }),
      resolveSkillDirInfo: async () => ({ skillDir: '/tmp/skill' }),
    } as unknown as LessonServiceLike;
    const runner = {
      resolveSkillDir: async () => '/tmp/skill',
    } as unknown as RunnerLike;

    const handlers = buildStudyHandlers({ runner, lesson, emit: (channel, ev) => emitted.push({ channel, ev }) });
    const gen = handlers.get(STUDY_CHANNELS.GENERATE_LESSON)!;
    const result = (await gen(undefined, { subject: 'Closures' })) as { lesson: { title: string }; rejected: unknown[] };

    assert.equal(result.lesson.title, 'Aula');
    assert.equal(result.rejected.length, 1);

    // o onProgress passado ao generateLesson emite LESSON_PROGRESS.
    onProgressCaptured?.({ phase: 'research', message: 'pesquisando' });
    const progEv = emitted.find((e) => e.channel === STUDY_CHANNELS.LESSON_PROGRESS);
    assert.ok(progEv, 'esperava evento study:lesson-progress');
    assert.equal((progEv.ev as { phase: string }).phase, 'research');
  });

  it('aceita STRING AVULSA no payload (UI chama generateLesson(subject)) e emite LESSON_PROGRESS', async () => {
    const emitted: Array<{ channel: string; ev: unknown }> = [];
    const receivedSubjects: string[] = [];
    let onProgressCaptured: ((p: unknown) => void) | undefined;
    const lesson = {
      generateLesson: async (subject: string, opts: { onProgress?: (p: unknown) => void }) => {
        receivedSubjects.push(subject);
        onProgressCaptured = opts.onProgress;
        return {
          lesson: { title: 'Aula', subject, markdown: '# Aula', findings: [], challenges: [], createdAt: 'now' },
          rejected: [],
        };
      },
      testAnswer: async () => ({ success: true, testsRun: 1, expectedTests: 1, passed: true, output: '' }),
      listSetups: async () => ({ rows: [] }),
      resolveSkillDirInfo: async () => ({ skillDir: '' }),
    } as unknown as LessonServiceLike;
    const runner = { resolveSkillDir: async () => '' } as unknown as RunnerLike;

    const handlers = buildStudyHandlers({ runner, lesson, emit: (channel, ev) => emitted.push({ channel, ev }) });
    const gen = handlers.get(STUDY_CHANNELS.GENERATE_LESSON)!;

    // STRING AVULSA (como a UI: subject.trim()).
    const r = (await gen(undefined, 'Closures')) as { lesson: { subject: string }; rejected: unknown[] };
    assert.equal(r.lesson.subject, 'Closures');
    assert.deepEqual(receivedSubjects, ['Closures']);

    // O onProgress repassado ao generateLesson emite LESSON_PROGRESS.
    onProgressCaptured?.({ phase: 'lesson', message: 'escrevendo' });
    const progEv = emitted.find((e) => e.channel === STUDY_CHANNELS.LESSON_PROGRESS);
    assert.ok(progEv, 'esperava evento study:lesson-progress');
    assert.equal((progEv.ev as { phase: string }).phase, 'lesson');
  });

  it('aceita OBJETO com language/goal no payload e repassa ao generateLesson', async () => {
    const emitted: Array<{ channel: string; ev: unknown }> = [];
    const capturedOpts: Array<{ language?: string; goal?: string }> = [];
    const lesson = {
      generateLesson: async (subject: string, opts: { language?: string; goal?: string; onProgress?: () => void }) => {
        capturedOpts.push({ language: opts.language, goal: opts.goal });
        return { lesson: { title: 'A', subject, markdown: '#', findings: [], challenges: [], createdAt: 'now' }, rejected: [] };
      },
      testAnswer: async () => ({ success: true, testsRun: 1, expectedTests: 1, passed: true, output: '' }),
      listSetups: async () => ({ rows: [] }),
      resolveSkillDirInfo: async () => ({ skillDir: '' }),
    } as unknown as LessonServiceLike;
    const runner = { resolveSkillDir: async () => '' } as unknown as RunnerLike;

    const handlers = buildStudyHandlers({ runner, lesson, emit: (channel, ev) => emitted.push({ channel, ev }) });
    const gen = handlers.get(STUDY_CHANNELS.GENERATE_LESSON)!;
    const r = (await gen(undefined, { subject: 'Closures', language: 'pt-BR', goal: 'entender closures' })) as {
      lesson: { subject: string };
      rejected: unknown[];
    };
    assert.equal(r.lesson.subject, 'Closures');
    assert.deepEqual(capturedOpts, [{ language: 'pt-BR', goal: 'entender closures' }]);
  });

  it('get-lesson devolve o último resultado; antes de gerar lança erro', async () => {
    __resetStudyHandlersMemory();
    const lesson = {
      generateLesson: async (subject: string) => ({
        lesson: { title: 'A', subject, markdown: '#', findings: [], challenges: [], createdAt: 'now' },
        rejected: [],
      }),
      testAnswer: async () => ({ success: true, testsRun: 0, expectedTests: 0, passed: true, output: '' }),
      listSetups: async () => ({ rows: [] }),
      resolveSkillDirInfo: async () => ({ skillDir: '' }),
    } as unknown as LessonServiceLike;
    const runner = { resolveSkillDir: async () => '' } as unknown as RunnerLike;
    const handlers = buildStudyHandlers({ runner, lesson, emit: () => {} });

    await assert.rejects(async () => handlers.get(STUDY_CHANNELS.GET_LESSON)!(), /nenhuma aula gerada ainda/);
    await handlers.get(STUDY_CHANNELS.GENERATE_LESSON)!(undefined, { subject: 'Z' });
    const got = (await handlers.get(STUDY_CHANNELS.GET_LESSON)!()) as { title: string };
    assert.equal(got.title, 'A');
  });
});

// ─── (d) workspace files + traversal ────────────────────────────────────────
describe('(d) workspace files (FS restrito)', () => {
  it('resolveContainedWorkspacePath rejeita traversal (../../) e caminhos fora', () => {
    const base = '/tmp/ws';
    assert.ok('error' in resolveContainedWorkspacePath(base, '../../etc/passwd'));
    assert.ok('error' in resolveContainedWorkspacePath(base, '/etc/passwd'));
    assert.ok('error' in resolveContainedWorkspacePath(base, 'x/../../../etc/passwd'));
    assert.ok(!('error' in resolveContainedWorkspacePath(base, 'stub.py')));
    assert.ok(!('error' in resolveContainedWorkspacePath(base, 'tests/test_stub.py')));
  });

  it('há um teste de integração que NÃO LÊ fora do workspace', async () => {
    const ws = await fsp.mkdtemp(path.join(os.tmpdir(), 'study-ws-'));
    await fsp.writeFile(path.join(ws, 'stub.py'), '# stub', 'utf8');
    const lesson = { generateLesson: async () => ({ lesson: {}, rejected: [] }), testAnswer: async () => ({}), listSetups: async () => ({ rows: [] }), resolveSkillDirInfo: async () => ({ skillDir: '' }) } as unknown as LessonServiceLike;
    const runner = { resolveSkillDir: async () => '' } as unknown as RunnerLike;

    const handlers = buildStudyHandlers({ runner, lesson, emit: () => {} });
    // leitura DENTRO → ok (devolve a STRING pura, sem wrapper).
    const read = await handlers.get(STUDY_CHANNELS.READ_WORKSPACE_FILE)!(undefined, { workspaceDir: ws, path: 'stub.py' });
    assert.equal(read, '# stub');
    // traversal → NÃO lê fora (erro claro), mesmo que o alvo exista em /etc.
    await assert.rejects(
      async () => handlers.get(STUDY_CHANNELS.READ_WORKSPACE_FILE)!(undefined, { workspaceDir: ws, path: '../../etc/passwd' }),
      /fora do workspace/
    );
  });

  it('list/read/write/decode refletem diretórios, tamanhos e linguagem por extensão', async () => {
    const ws = await fsp.mkdtemp(path.join(os.tmpdir(), 'study-ws-'));
    await fsp.mkdir(path.join(ws, 'tests'), { recursive: true });
    await fsp.writeFile(path.join(ws, 'stub.py'), 'x', 'utf8');
    await fsp.writeFile(path.join(ws, 'tests', 'test_stub.py'), 'y', 'utf8');
    const lesson = { generateLesson: async () => ({ lesson: {}, rejected: [] }), testAnswer: async () => ({}), listSetups: async () => ({ rows: [] }), resolveSkillDirInfo: async () => ({ skillDir: '' }) } as unknown as LessonServiceLike;
    const runner = { resolveSkillDir: async () => '' } as unknown as RunnerLike;
    const handlers = buildStudyHandlers({ runner, lesson, emit: () => {} });

    const list = (await handlers.get(STUDY_CHANNELS.LIST_WORKSPACE_FILES)!(undefined, { workspaceDir: ws })) as
      Array<{ path: string; dir: boolean; language?: string }>;
    // Contrato: devolve WorkspaceFile[] DIRETO (sem wrapper {files}).
    assert.ok(Array.isArray(list), 'list-workspace-files deve devolver array');
    const stub = list.find((f) => f.path === 'stub.py');
    assert.ok(stub);
    assert.equal(stub.dir, false);
    assert.equal(stub.language, 'python');
    assert.ok(list.some((f) => f.path === 'tests' && f.dir));

    const written = (await handlers.get(STUDY_CHANNELS.WRITE_WORKSPACE_FILE)!(undefined, { workspaceDir: ws, path: 'novo.mjs', content: 'const a=1;' })) as { ok: boolean };
    assert.equal(written.ok, true);
    const readBack = (await handlers.get(STUDY_CHANNELS.READ_WORKSPACE_FILE)!(undefined, { workspaceDir: ws, path: 'novo.mjs' }));
    assert.equal(readBack, 'const a=1;');
  });
});

// ─── (e) safeHandle idempotente ─────────────────────────────────────────────
describe('(e) safeHandle', () => {
  it('registra 2x o mesmo canal sem lançar (remove+handle)', () => {
    const ipc = makeFakeIpc();
    const h1 = () => 1;
    const h2 = () => 2;
    safeHandle(ipc, 'canal:x', h1);
    safeHandle(ipc, 'canal:x', h2); // não deve lançar (remove+handle)
    assert.equal(ipc.handlers.get('canal:x')!(), 2, 'o último handler vence');

    // safeHandleMap também é idempotente.
    const map = new Map<string, (...args: unknown[]) => unknown>([['canal:y', () => 'y']]);
    safeHandleMap(ipc, map);
    safeHandleMap(ipc, map);
    assert.equal(ipc.handlers.get('canal:y')!(), 'y');
  });
});

// ─── (f) keys-handlers: chave digitada validada ─────────────────────────────
describe('(f) keys-handlers: chave digitada', () => {
  let origLoad: ((...a: unknown[]) => unknown) | null = null;
  let ipcFake: IpcMainHandleLike & { handlers: Map<string, (...args: unknown[]) => unknown> };
  let ipcFakeErr: unknown;
  afterEach(() => {
    if (origLoad) {
      (Module as any)._load = origLoad;
      origLoad = null;
    }
    fetchMock?.mock.restore();
    fetchMock = undefined;
  });

  function fakeResponse(status: number, body: unknown = {}): Response {
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  }

  it('keys:validate-llm com chave digitada → Authorization da digitada', async () => {
    ipcFake = makeFakeIpc();
    ipcFakeErr = null;
    origLoad = (Module as any)._load as (...a: unknown[]) => unknown;
    (Module as any)._load = function (request: string, ...args: unknown[]) {
      if (request === 'electron') return { ipcMain: ipcFake };
      return (origLoad as any).apply(this, [request, ...args]);
    };

    // MIGRAÇÃO OPENROUTER: a validação faz DUAS chamadas — `/key` (a que decide
    // a validade) e, como COMPLEMENTO, `/models` (só preenche modelAvailable).
    // Só a primeira interessa aqui, então o Authorization é registrado por URL.
    const headersSeen: Array<string | undefined> = [];
    fetchMock = mock.method(globalThis, 'fetch', async (url: unknown, init?: { headers?: Record<string, string> }) => {
      const h = (init?.headers ?? {}) as Record<string, string>;
      const u = String(url);
      if (u.endsWith('/key')) headersSeen.push(h.Authorization ?? h.authorization);
      return fakeResponse(200, { data: [{ id: 'z-ai/glm-5.3-flash' }] });
    });

    const { registerKeysHandlers } = await (await import('../electron/main/ipc/keys-handlers')) as {
      registerKeysHandlers: (deps?: { getStore?: () => Promise<SettingsStore> }) => void;
    };
    registerKeysHandlers({
      getStore: async () =>
        ({ getApiKey: async () => '', setValue: async () => {}, getValue: async () => undefined } as unknown as SettingsStore),
    });

    const handler = ipcFake.handlers.get(KEYS_CHANNELS.VALIDATE_LLM)!;
    const result = (await handler(undefined, 'sk-digitada')) as { isValid: boolean };
    assert.equal(result.isValid, true);
    assert.deepEqual(
      headersSeen,
      ['Bearer sk-digitada'],
      'o fetch de GET /api/v1/key deve carregar a chave digitada no Authorization',
    );
  });
});

// ─── (g) contrato de shape dos retornos IPC (regressão BLOCK 1) ─────────────
// Os handlers DEVOLVEM o tipo tipado do contrato DIRETO (sem wrapper):
//   list-challenges → ChallengeInfo[] ; list-workspace-files → WorkspaceFile[]
//   read-workspace-file → string (content pura) ; test-answer → TestAnswerResult
//   pi:execute → PiExecuteResult.
// Capturamos via ipcMain fake (register*Handlers) para espelhar o runtime real.
describe('(g) contrato de shape dos retornos IPC', () => {
  it('estudo: list-challenges→ChallengeInfo[] / list-workspace-files→WorkspaceFile[] / read-workspace-file→string', async () => {
    const ws = await fsp.mkdtemp(path.join(os.tmpdir(), 'study-shape-'));
    await fsp.mkdir(path.join(ws, 'challenges', '0001-soma'), { recursive: true });
    await fsp.writeFile(
      path.join(ws, 'challenges', '0001-soma', 'meta.json'),
      JSON.stringify({ challenge_id: '0001', title: 'Soma', language: 'python', verdict: 'approved' }),
      'utf8',
    );
    await fsp.writeFile(path.join(ws, 'stub.py'), '# stub', 'utf8');
    const lesson = { generateLesson: async () => ({ lesson: {}, rejected: [] }), testAnswer: async () => ({}), listSetups: async () => ({ rows: [] }), resolveSkillDirInfo: async () => ({ skillDir: '' }) } as unknown as LessonServiceLike;
    const runner = { resolveSkillDir: async () => '' } as unknown as RunnerLike;

    const ipc = makeFakeIpc();
    await registerStudyHandlers({ runner, lesson, emit: () => {} }, ipc);

    // list-challenges → ARRAY (não {challenges}).
    const challenges = await ipc.handlers.get(STUDY_CHANNELS.LIST_CHALLENGES)!(undefined, { setupRoot: ws });
    assert.ok(Array.isArray(challenges), 'study:list-challenges deve devolver ARRAY');
    assert.equal((challenges as ChallengeInfo[])[0].challengeId, '0001');

    // list-workspace-files → ARRAY (não {files}).
    const files = await ipc.handlers.get(STUDY_CHANNELS.LIST_WORKSPACE_FILES)!(undefined, { workspaceDir: ws });
    assert.ok(Array.isArray(files), 'study:list-workspace-files deve devolver ARRAY');
    assert.ok((files as WorkspaceFile[]).some((f) => f.path === 'stub.py'));

    // read-workspace-file → STRING content pura (não {content, encoding}).
    const content = await ipc.handlers.get(STUDY_CHANNELS.READ_WORKSPACE_FILE)!(undefined, { workspaceDir: ws, path: 'stub.py' });
    assert.equal(typeof content, 'string', 'study:read-workspace-file deve devolver string');
    assert.equal(content, '# stub');
  });

  it('estudo: test-answer devolve TestAnswerResult direto', async () => {
    const ipc = makeFakeIpc();
    const lesson = { generateLesson: async () => ({ lesson: {}, rejected: [] }), testAnswer: async () => ({ success: true, testsRun: 3, expectedTests: 3, passed: true, output: 'ok' }), listSetups: async () => ({ rows: [] }), resolveSkillDirInfo: async () => ({ skillDir: '' }) } as unknown as LessonServiceLike;
    const runner = { resolveSkillDir: async () => '' } as unknown as RunnerLike;
    await registerStudyHandlers({ runner, lesson, emit: () => {} }, ipc);

    const ta = await ipc.handlers.get(STUDY_CHANNELS.TEST_ANSWER)!(undefined, { challengeDir: '/tmp/c' });
    assert.equal((ta as TestAnswerResult).passed, true);
    assert.equal((ta as TestAnswerResult).testsRun, 3);
    assert.equal(Object.prototype.hasOwnProperty.call(ta, 'passed'), true);
  });

  it('pi: execute devolve PiExecuteResult direto (sem wrapper)', async () => {
    const ipcPi = makeFakeIpc();
    const fakeService: PiAgentServiceLike = {
      execute: async () => ({ success: true, output: 'oi', executionTimeMs: 5 }),
      abort: () => {},
    };
    await registerPiHandlers({ getService: async () => fakeService, emit: () => {} }, ipcPi);

    const piRes = await ipcPi.handlers.get(PI_CHANNELS.EXECUTE)!(undefined, {
      prompt: 'x',
      modelConfig: { provider: 'openrouter', model: 'm' },
    });
    assert.equal((piRes as PiExecuteResult).success, true);
    assert.equal((piRes as PiExecuteResult).executionTimeMs, 5);
    assert.equal(Object.prototype.hasOwnProperty.call(piRes, 'executionTimeMs'), true);
  });
});

// ─── (h) contrato de shape dos retornos IPC — GRUPO localAi ─────────────────
// Os handlers localAi devolvem o valor NU do contrato (o preload repassa o
// invoke cru, sem unwrap): detect-hardware → HardwareInfo; recommend →
// LocalModelInfo; list → LocalModelInfo[]; get-active → string|null;
// set-active/delete/download → {ok}; chat → {text}. Erros REJEITAM (throw).
// Capturamos via ipcMain fake (registerLocalAiHandlers) p/ espelhar o runtime.
describe('(h) contrato de shape dos retornos IPC — localAi', () => {
  const HARDWARE: HardwareInfo = { backend: 'CPU', ramGb: 16, vramGb: null, cpuModel: 'x' };
  const MODEL: LocalModelInfo = {
    id: 'LiquidAI/LFM2.5-8B-A1B-GGUF:Q4_K_M',
    label: 'LFM2.5 8B',
    hfRepo: 'x',
    filename: 'm.gguf',
    quant: 'Q4_K_M',
    sizeBytes: 100,
    recommended: true,
    agentReady: true,
  };
  const MODEL2: LocalModelInfo = { ...MODEL, id: 'other', label: 'other', recommended: false };

  /** Store fake mínimo (nu, sem disco) para os handlers de estado. */
  function fakeStore(active: string | null) {
    return {
      dir: '/tmp/models',
      list: async () => [MODEL, MODEL2],
      download: async () => '/tmp/models/m.gguf',
      delete: async () => {},
      getActive: async () => active,
      setActive: async () => {},
      getModelPath: async () => null,
      isDownloaded: async () => false,
    };
  }
  const fakeEngine: LlmLike = {
    load: async () => {},
    unload: async () => {},
    chat: async () => ({ text: 'avaliação local' }),
    status: async () => ({}),
    getActive: () => null,
  };

  it('detect-hardware → HardwareInfo DIRETO; recommend → LocalModelInfo DIRETO', async () => {
    const ipc = makeFakeIpc();
    await registerLocalAiHandlers({ detect: async () => HARDWARE }, ipc);

    const hw = await ipc.handlers.get(LOCAL_AI_CHANNELS.DETECT_HARDWARE)!(undefined);
    assert.equal((hw as HardwareInfo).backend, 'CPU');
    assert.equal(Object.prototype.hasOwnProperty.call(hw, 'success'), false);

    const rec = await ipc.handlers.get(LOCAL_AI_CHANNELS.RECOMMEND)!(undefined);
    assert.equal((rec as LocalModelInfo).recommended, true);
    assert.equal(Object.prototype.hasOwnProperty.call(rec, 'success'), false);
  });

  it('list → LocalModelInfo[] DIRETO', async () => {
    const ipc = makeFakeIpc();
    await registerLocalAiHandlers({ getStore: async () => fakeStore('other') }, ipc);
    const list = await ipc.handlers.get(LOCAL_AI_CHANNELS.LIST)!(undefined);
    assert.ok(Array.isArray(list), 'localAi:list deve devolver ARRAY');
    assert.equal((list as LocalModelInfo[]).length, 2);
    assert.equal((list as LocalModelInfo[]).find((m) => m.id === 'other')?.active, true);
  });

  it('get-active → string|null DIRETO; set-active/delete/download → {ok} DIRETO', async () => {
    const ipc = makeFakeIpc();
    await registerLocalAiHandlers(
      { getStore: async () => fakeStore('abc'), getEngine: async () => fakeEngine },
      ipc,
    );
    const ev = {};
    const active = await ipc.handlers.get(LOCAL_AI_CHANNELS.GET_ACTIVE)!(undefined);
    assert.equal(active, 'abc', 'get-active deve devolver a string nua');

    const setRes = await ipc.handlers.get(LOCAL_AI_CHANNELS.SET_ACTIVE)!(undefined, 'abc');
    assert.equal((setRes as { ok: boolean }).ok, true);

    const delRes = await ipc.handlers.get(LOCAL_AI_CHANNELS.DELETE)!(undefined, 'other');
    assert.equal((delRes as { ok: boolean }).ok, true);

    const dlRes = await ipc.handlers.get(LOCAL_AI_CHANNELS.DOWNLOAD)!(ev, 'abc');
    assert.equal((dlRes as { ok: boolean }).ok, true);
  });

  it('chat → {text} DIRETO', async () => {
    const ipc = makeFakeIpc();
    await registerLocalAiHandlers({ getEngine: async () => fakeEngine }, ipc);
    const res = (await ipc.handlers.get(LOCAL_AI_CHANNELS.CHAT)!(undefined, {
      modelId: 'abc',
      prompt: 'corrija',
    })) as { text: string };
    assert.deepEqual(res, { text: 'avaliação local' });
    assert.equal(Object.prototype.hasOwnProperty.call(res, 'success'), false);
  });

  it('erros do chat REJEITAM (throw → rejeição do invoke)', async () => {
    const ipc = makeFakeIpc();
    await registerLocalAiHandlers({ getEngine: async () => fakeEngine }, ipc);
    const p = ipc.handlers.get(LOCAL_AI_CHANNELS.CHAT)!(undefined, { modelId: 'abc', prompt: '' }) as Promise<unknown>;
    await assert.rejects(p, (err: unknown) => String((err as Error)?.message).includes('Prompt vazio'));
  });
});

let fetchMock: ReturnType<typeof mock.method> | undefined;