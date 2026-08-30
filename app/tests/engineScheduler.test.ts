/**
 * tests/engineScheduler.test.ts — o escalonador de tarefas da engine de
 * trilhas (pacote P-02, `docs/16-engine-de-trilha.md` §4.1 e §3.4).
 *
 * Os contratos que mordem aqui:
 *   - PAR-02: onda com DOIS outputs que designam o MESMO arquivo é REJEITADA
 *     antes de qualquer execução, com mensagem nomeando o caminho e as duas
 *     tarefas — a igualdade é comparada pela CHAVE CANÔNICA (normalize +
 *     trailing slash + case), então 'a/./b' vs 'a/b', 'x.md/' vs 'x.md' e
 *     'Aula.md' vs 'aula.md' colidem; paths genuinamente distintos passam;
 *   - A-P02-3: nenhum caminho de código deixa uma onda com colisão rodar;
 *   - dependência não satisfeita BLOQUEIA a tarefa — ela roda quando a dep
 *     conclui;
 *   - recursos diferentes (llm/exec/cpu) NÃO competem pelo mesmo semáforo —
 *     pico de concorrência medido POR recurso;
 *   - chave multi-escritor sem reducer é erro de CONFIGURAÇÃO, não silêncio;
 *   - retomada: tarefa done com o mesmo cacheKey não reexecuta (idempotência);
 *   - A-P02-4: ciclo entre tarefas é detectado e reportado COM o caminho.
 *   - bônus: reducers append, append_dedup_by e majority_vote (empate ⇒ nada
 *     gravado) funcionam.
 *
 * PURA: executor e semáforos são INJETADOS (fakes em memória) — sem rede, sem
 * disco, sem processo (A-P02-2). Controle de ordem por deferreds, nunca timer.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { Task, TaskId, TaskResource } from '../electron/main/engine/runtime/task';
import {
  SchedulerError,
  collectOutputCollisions,
  findDependencyCycle,
  reduceWave,
  runWave,
  validateWave,
} from '../electron/main/engine/runtime/scheduler';
import type { Executor, RateLimiter, RateLimiters, TaskRunResult, WaveConfig } from '../electron/main/engine/runtime/scheduler';

// ---------------------------------------------------------------------------
// Fakes (PURAS, em memória)
// ---------------------------------------------------------------------------

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Espera uma condição no event loop sem timer (só microtasks/setImmediate). */
async function until(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 10_000 && !cond(); i += 1) {
    await new Promise<void>((res) => setImmediate(res));
  }
  assert.ok(cond(), 'condição nunca satisfeita no event loop');
}

function task(over: Partial<Task> & { id: string }): Task {
  return {
    fase: 'F7',
    deps: [],
    recurso: 'exec',
    cacheKey: `key-${over.id}`,
    outputs: [],
    writes: [],
    status: 'pending',
    ...over,
  };
}

function wave(tasks: Task[], reducers: WaveConfig['reducers'] = {}): WaveConfig {
  return { tasks, reducers };
}

interface FakeExecutor {
  execute: Executor;
  calls: TaskId[];
}

/** Executor fake com contagem de chamadas e impl controlável por tarefa. */
function fakeExecutor(impl?: (t: Task) => TaskRunResult | Promise<TaskRunResult>): FakeExecutor {
  const calls: TaskId[] = [];
  return {
    calls,
    execute: async (t: Task): Promise<TaskRunResult> => {
      calls.push(t.id);
      if (impl) return impl(t);
      return { ok: true };
    },
  };
}

/**
 * Limitador de slot com fila (capacidade por recurso) + rastreadores de pico:
 * `per` mede o pico POR recurso; `global` mede o pico somando os recursos.
 * Se recursos diferentes compartilhassem o semáforo, `global.peak` colaria em
 * `per.peak`; independentes, `global.peak` é a soma dos ativos simultâneos.
 *
 * PROTOCOLO UNIFICADO (P-27): o release VEM do acquire (`acquire` resolve com
 * a função de liberação) e é IDEMPOTENTE — liberar a mesma vaga duas vezes é
 * no-op (não corrompe a contagem; espelha a garantia do P-01).
 */
function slotLimiters(capacity: number): {
  limiters: RateLimiters;
  per: Record<TaskResource, { active: number; peak: number }>;
  global: { active: number; peak: number };
} {
  const per: Record<TaskResource, { active: number; peak: number }> = {
    llm: { active: 0, peak: 0 },
    exec: { active: 0, peak: 0 },
    cpu: { active: 0, peak: 0 },
  };
  const global = { active: 0, peak: 0 };
  const slots: Record<TaskResource, { active: number; waiters: (() => void)[] }> = {
    llm: { active: 0, waiters: [] },
    exec: { active: 0, waiters: [] },
    cpu: { active: 0, waiters: [] },
  };

  const bump = (r: TaskResource) => {
    per[r].active += 1;
    per[r].peak = Math.max(per[r].peak, per[r].active);
    global.active += 1;
    global.peak = Math.max(global.peak, global.active);
  };

  const makeRelease = (r: TaskResource): (() => void) => {
    let released = false;
    return () => {
      if (released) return; // idempotente — liberar duas vezes corromperia a contagem
      released = true;
      const slot = slots[r];
      slot.active -= 1;
      per[r].active -= 1;
      global.active -= 1;
      if (per[r].active < 0) per[r].active = 0; // underflow = bug do env
      const next = slot.waiters.shift();
      if (next) next();
    };
  };

  const limiters = {} as RateLimiters;
  for (const r of ['llm', 'exec', 'cpu'] as const) {
    limiters[r] = {
      acquire(): Promise<() => void> {
        const slot = slots[r];
        if (slot.active < capacity) {
          slot.active += 1;
          bump(r);
          return Promise.resolve(makeRelease(r));
        }
        return new Promise<() => void>((resolve) => {
          slot.waiters.push(() => {
            slot.active += 1;
            bump(r);
            resolve(makeRelease(r));
          });
        });
      },
    };
  }
  return { limiters, per, global };
}

/** Limitadores "infinitos" — nunca bloqueiam; só rastreiam o pico global. */
function freeLimiters(): RateLimiters {
  const one: RateLimiter = {
    acquire: async () => () => {},
  };
  return { llm: one, exec: one, cpu: one };
}

// ---------------------------------------------------------------------------
// 1. PAR-02: colisão de posse rejeita a onda ANTES de qualquer execução
// ---------------------------------------------------------------------------

describe('escalonador — colisão de posse (PAR-02, A-P02-3)', () => {
  it('onda com dois outputs iguais é REJEITADA com caminho e as duas tarefas nomeadas', () => {
    const a = task({ id: 'autora-a', outputs: ['trilha/01/aula.md'] });
    const b = task({ id: 'autora-b', outputs: ['trilha/01/aula.md'] });

    const collisions = collectOutputCollisions([a, b]);
    assert.deepEqual([...collisions.keys()], ['trilha/01/aula.md']);
    assert.deepEqual(collisions.get('trilha/01/aula.md'), ['autora-a', 'autora-b']);

    const validation = validateWave(wave([a, b]));
    assert.equal(validation.errors.length, 1);
    const error = validation.errors[0];
    assert.ok(error instanceof SchedulerError);
    assert.equal(error.code, 'ownership-collision');
    assert.equal(error.details.caminho, 'trilha/01/aula.md');
    assert.deepEqual(error.details.tarefas, ['autora-a', 'autora-b']);
    assert.match(error.message, /trilha\/01\/aula\.md/);
    assert.match(error.message, /autora-a/);
    assert.match(error.message, /autora-b/);
  });

  it('runWave NÃO executa NADA quando a onda tem colisão (A-P02-3)', async () => {
    const a = task({ id: 'a', outputs: ['x.md'] });
    const b = task({ id: 'b', outputs: ['x.md'] });
    const fake = fakeExecutor();

    await assert.rejects(
      () => runWave(wave([a, b]), { limiters: freeLimiters(), execute: fake.execute }),
      (err: unknown) => err instanceof SchedulerError && err.code === 'ownership-collision',
    );
    assert.deepEqual(fake.calls, [], 'nenhuma execução pode ter ocorrido');
  });

  it('colisão também é rejeitada entre uma tarefa retomável (done) e uma pendente', () => {
    const doneTask = task({
      id: 'd',
      status: 'done',
      doneCacheKey: 'key-d',
      outputs: ['compartilhado.json'],
    });
    const pendingTask = task({ id: 'p', outputs: ['compartilhado.json'] });
    const validation = validateWave(wave([doneTask, pendingTask]));
    assert.ok(validation.errors.some((e) => e.code === 'ownership-collision'));
  });

  it('aliases canônicos colidem: "a/./b" vs "a/b" (path.posix.normalize)', async () => {
    const a = task({ id: 'a', outputs: ['a/./b'] });
    const b = task({ id: 'b', outputs: ['a/b'] });
    const fake = fakeExecutor();

    const collisions = collectOutputCollisions([a, b]);
    assert.deepEqual([...collisions.keys()], ['a/b'], 'a/./b e a/b denotam o MESMO arquivo físico');

    const validation = validateWave(wave([a, b]));
    assert.equal(validation.errors.length, 1);
    assert.equal(validation.errors[0].code, 'ownership-collision');

    await assert.rejects(
      () => runWave(wave([a, b]), { limiters: freeLimiters(), execute: fake.execute }),
      (err: unknown) => err instanceof SchedulerError && err.code === 'ownership-collision',
    );
    assert.deepEqual(fake.calls, [], 'nenhuma execução pode ter ocorrido (A-P02-3)');
  });

  it('aliases canônicos colidem: "x.md/" vs "x.md" (trailing slash)', () => {
    const a = task({ id: 'a', outputs: ['x.md/'] });
    const b = task({ id: 'b', outputs: ['x.md'] });

    assert.deepEqual([...collectOutputCollisions([a, b]).keys()], ['x.md']);
    const validation = validateWave(wave([a, b]));
    assert.equal(validation.errors.length, 1);
    assert.equal(validation.errors[0].code, 'ownership-collision');
  });

  it('aliases canônicos colidem: "Trilha/Aula.md" vs "trilha/aula.md" (case, DELIBERADO)', () => {
    // A comparação case-insensitive é DELIBERADA: em APFS (default do macOS)
    // os dois são o MESMO arquivo; em FS case-sensitive é um falso-positivo
    // conservador declarado — rejeitar nunca deixa colisão real escapar.
    const a = task({ id: 'a', outputs: ['Trilha/Aula.md'] });
    const b = task({ id: 'b', outputs: ['trilha/aula.md'] });

    assert.deepEqual([...collectOutputCollisions([a, b]).keys()], ['trilha/aula.md']);
    const validation = validateWave(wave([a, b]));
    assert.equal(validation.errors.length, 1);
    assert.equal(validation.errors[0].code, 'ownership-collision');
  });

  it('paths genuinamente distintos NÃO colidem — a onda roda as duas', async () => {
    const a = task({ id: 'a', outputs: ['a/b.md'] });
    const b = task({ id: 'b', outputs: ['a/c.md'] });
    const fake = fakeExecutor();

    assert.deepEqual([...collectOutputCollisions([a, b]).keys()], [], 'sem colisão entre arquivos distintos');
    assert.equal(validateWave(wave([a, b])).errors.length, 0);

    const result = await runWave(wave([a, b]), { limiters: freeLimiters(), execute: fake.execute });
    assert.deepEqual([...fake.calls].sort(), ['a', 'b'], 'as DUAS tarefas executam');
    assert.equal(result.executed.length, 2);
  });
});

// ---------------------------------------------------------------------------
// 2. Dependência não satisfeita bloqueia; roda quando a dep conclui
// ---------------------------------------------------------------------------

describe('escalonador — dependências (DAG)', () => {
  it('tarefa com dep pendente fica bloqueada e roda quando a dep conclui', async () => {
    const gate = deferred<void>();
    const fake = fakeExecutor((t) => {
      if (t.id === 'a') return gate.promise.then(() => ({ ok: true }));
      return { ok: true };
    });
    const a = task({ id: 'a' });
    const b = task({ id: 'b', deps: ['a'] });

    const running = runWave(wave([a, b]), { limiters: freeLimiters(), execute: fake.execute });
    await until(() => fake.calls.includes('a'));
    await Promise.resolve();
    assert.deepEqual(fake.calls, ['a'], 'b não pode rodar enquanto a dep a está pendente');

    gate.resolve();
    const result = await running;

    assert.deepEqual(fake.calls, ['a', 'b'], 'b roda DEPOIS de a concluir');
    assert.deepEqual(result.executed, ['a', 'b']);
    assert.equal(result.tasks.find((t) => t.id === 'b')?.status, 'done');
  });

  it('tarefa que falha bloqueia as dependentes (status blocked, fail-closed)', async () => {
    const fake = fakeExecutor((t) =>
      t.id === 'a' ? { ok: false, error: 'explodiu' } : { ok: true },
    );
    const a = task({ id: 'a' });
    const b = task({ id: 'b', deps: ['a'] });
    const c = task({ id: 'c' });

    const result = await runWave(wave([a, b, c]), {
      limiters: freeLimiters(),
      execute: fake.execute,
    });

    assert.equal(result.tasks.find((t) => t.id === 'a')?.status, 'failed');
    assert.equal(result.tasks.find((t) => t.id === 'b')?.status, 'blocked');
    assert.equal(result.tasks.find((t) => t.id === 'c')?.status, 'done');
    assert.deepEqual(fake.calls, ['a', 'c']);
  });
});

// ---------------------------------------------------------------------------
// 3. Recursos diferentes NÃO competem pelo mesmo semáforo
// ---------------------------------------------------------------------------

describe('escalonador — semáforos independentes por recurso (§4.1)', () => {
  it('pico de concorrência POR recurso respeita a capacidade, sem competição cruzada', async () => {
    const gates = {
      l1: deferred<void>(),
      l2: deferred<void>(),
      e1: deferred<void>(),
      e2: deferred<void>(),
    };
    const wait: Record<string, Promise<void>> = {
      l1: gates.l1.promise,
      l2: gates.l2.promise,
      e1: gates.e1.promise,
      e2: gates.e2.promise,
    };
    const fake = fakeExecutor((t) => wait[t.id].then(() => ({ ok: true })));

    const llm1 = task({ id: 'l1', recurso: 'llm' });
    const llm2 = task({ id: 'l2', recurso: 'llm' });
    const exec1 = task({ id: 'e1', recurso: 'exec' });
    const exec2 = task({ id: 'e2', recurso: 'exec' });
    const { limiters, per, global } = slotLimiters(1);

    const running = runWave(wave([llm1, llm2, exec1, exec2]), {
      limiters,
      execute: fake.execute,
    });

    // l1 e e1 ocupam cada um o SEU semáforo ⇒ os dois rodam SIMULTÂNEOS.
    await until(() => fake.calls.includes('l1') && fake.calls.includes('e1'));
    await Promise.resolve();
    assert.ok(!fake.calls.includes('l2') && !fake.calls.includes('e2'), 'segunda tarefa do mesmo recurso espera a vaga');
    assert.equal(global.peak, 2, 'llm + exec simultâneos ⇒ pico GLOBAL 2 (semáforos independentes)');
    assert.equal(per.llm.peak, 1, 'pico do semáforo llm é a capacidade 1');
    assert.equal(per.exec.peak, 1, 'pico do semáforo exec é a capacidade 1');

    gates.l1.resolve();
    gates.e1.resolve();
    await until(() => fake.calls.includes('l2') && fake.calls.includes('e2'));
    gates.l2.resolve();
    gates.e2.resolve();
    await running;

    assert.deepEqual(fake.calls.sort(), ['e1', 'e2', 'l1', 'l2']);
    assert.equal(global.peak, 2, 'nunca mais que llm1+exec1 ao mesmo tempo');
    assert.equal(per.llm.peak, 1);
    assert.equal(per.exec.peak, 1);
  });
});

// ---------------------------------------------------------------------------
// 3.5. Contrato UNIFICADO do limitador (P-27): release vem do acquire
// ---------------------------------------------------------------------------

describe('escalonador — contrato do limitador unificado com o P-01 (P-27)', () => {
  it('o scheduler libera o slot devolvido pelo acquire, uma vez por tarefa executada', async () => {
    const releases: string[] = [];
    const limiter = (nome: TaskResource): RateLimiter => ({
      acquire: async () => () => {
        releases.push(nome);
      },
    });
    const fake = fakeExecutor();

    const result = await runWave(
      wave([task({ id: 'a', recurso: 'llm' }), task({ id: 'b', recurso: 'exec' }), task({ id: 'c', recurso: 'cpu' })]),
      {
        limiters: { llm: limiter('llm'), exec: limiter('exec'), cpu: limiter('cpu') },
        execute: fake.execute,
      },
    );

    assert.equal(result.executed.length, 3);
    assert.deepEqual([...releases].sort(), ['cpu', 'exec', 'llm'], 'cada tarefa executada liberou o próprio slot uma vez');
  });

  it('release devolvida pelo acquire é IDEMPOTENTE no scheduler: liberação dupla é no-op', async () => {
    // A garantia é do P-01 (runtime/semaphore); aqui provamos que o scheduler
    // NÃO chama release() próprio nem depende de release dupla — só da fn do
    // acquire — e que um limiter cuja release é idempotente não corrompe nada.
    let active = 0;
    let releases = 0;
    const limiters: RateLimiters = {
      llm: {
        async acquire() {
          active += 1;
          return () => {
            releases += 1;
            active -= 1;
            // simulando idempotência: a contagem real do release duplo não cai abaixo de 0
            if (active < 0) active = 0;
          };
        },
      },
      exec: { acquire: async () => () => {} },
      cpu: { acquire: async () => () => {} },
    };
    const fake = fakeExecutor();
    const result = await runWave(wave([task({ id: 'a', recurso: 'llm' })]), {
      limiters,
      execute: fake.execute,
    });
    assert.equal(result.executed.length, 1);
    assert.equal(releases, 1, 'uma liberação por acquire — nunca dupla pelo scheduler');
    assert.equal(active, 0);
  });

  it('compile-proof (P-27): o protocolo antigo (acquire→Promise<void> + release próprio) NÃO é assignable', () => {
    const antigo = { acquire: async () => {}, release: () => {} };
    // @ts-expect-error P-27: protocolo antigo não é assignable ao RateLimiter unificado (release vem do acquire)
    const limitador: RateLimiter = antigo;
    assert.ok(limitador, 'a atribuição é REJEITADA em compile-time — a mudança é de contrato, não de convenção');
  });
});

// ---------------------------------------------------------------------------
// 4. Reducer ausente em chave multi-escritor é erro de CONFIGURAÇÃO
// ---------------------------------------------------------------------------

describe('escalonador — chaves multi-escritor exigem reducer (§4.1)', () => {
  it('chave escrita por ≥2 tarefas sem reducer é erro de configuração, nunca silêncio', () => {
    const a = task({ id: 'a', writes: ['trilha.aulas'] });
    const b = task({ id: 'b', writes: ['trilha.aulas'] });

    const validation = validateWave(wave([a, b]));
    const error = validation.errors.find((e) => e.code === 'missing-reducer');
    assert.ok(error, 'deve haver erro missing-reducer');
    assert.equal(error?.details.chave, 'trilha.aulas');
    assert.deepEqual(error?.details.tarefas, ['a', 'b']);
    assert.match(error?.message ?? '', /trilha\.aulas/);
  });

  it('runWave com reducer ausente NÃO executa nada', async () => {
    const a = task({ id: 'a', writes: ['k'] });
    const b = task({ id: 'b', writes: ['k'] });
    const fake = fakeExecutor();

    await assert.rejects(
      () => runWave(wave([a, b]), { limiters: freeLimiters(), execute: fake.execute }),
      (err: unknown) => err instanceof SchedulerError && err.code === 'missing-reducer',
    );
    assert.deepEqual(fake.calls, []);
  });

  it('reducer declarado para chave de escritor único é aviso, não erro', () => {
    const a = task({ id: 'a', writes: ['k'] });
    const validation = validateWave(wave([a], { k: { type: 'append' } }));
    assert.equal(validation.errors.length, 0);
    assert.equal(validation.warnings.length, 1);
    assert.match(validation.warnings[0], /uma tarefa só/);
  });

  it('onda com >20 tarefas é erro de configuração; 16–20 é aviso + permitido', async () => {
    const huge = Array.from({ length: 21 }, (_, i) => task({ id: `t${i}` }));
    const validation = validateWave(wave(huge));
    const error = validation.errors.find((e) => e.code === 'wave-too-large');
    assert.ok(error);
    assert.equal(error?.details.tamanho, 21);

    const fifteenPlus = Array.from({ length: 16 }, (_, i) => task({ id: `u${i}` }));
    const fake = fakeExecutor();
    const result = await runWave(wave(fifteenPlus), {
      limiters: freeLimiters(),
      execute: fake.execute,
    });
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /acima do recomendado de 15/);
    assert.equal(fake.calls.length, 16, '16 tarefas rodam (aviso + permitido)');
  });
});

// ---------------------------------------------------------------------------
// 5. Retomada: done com o mesmo cacheKey não reexecuta (idempotência)
// ---------------------------------------------------------------------------

describe('escalonador — retomada/idempotência', () => {
  it('tarefa done com o mesmo cacheKey não reexecuta', async () => {
    const a = task({ id: 'a', cacheKey: 'k1', status: 'done', doneCacheKey: 'k1' });
    const b = task({ id: 'b', deps: ['a'] });
    const fake = fakeExecutor();

    const result = await runWave(wave([a, b]), {
      limiters: freeLimiters(),
      execute: fake.execute,
    });

    assert.deepEqual(fake.calls, ['b'], 'a não reexecuta — só b roda');
    assert.deepEqual(result.executed, ['b']);
    assert.deepEqual(result.skipped, ['a']);
    assert.equal(result.tasks.find((t) => t.id === 'a')?.status, 'done');
  });

  it('done com cacheKey DIFERENTE reexecuta (o conteúdo mudou)', async () => {
    const a = task({ id: 'a', cacheKey: 'k2', status: 'done', doneCacheKey: 'k1' });
    const fake = fakeExecutor();

    const result = await runWave(wave([a]), { limiters: freeLimiters(), execute: fake.execute });

    assert.deepEqual(fake.calls, ['a'], 'cacheKey novo invalida o done anterior');
    assert.deepEqual(result.executed, ['a']);
    assert.deepEqual(result.skipped, []);
    assert.equal(result.tasks.find((t) => t.id === 'a')?.status, 'done');
    assert.equal(result.tasks.find((t) => t.id === 'a')?.doneCacheKey, 'k2');
  });

  it('done sem doneCacheKey é estado inconsistente (erro de configuração)', () => {
    const a = task({ id: 'a', status: 'done' });
    const validation = validateWave(wave([a]));
    assert.ok(validation.errors.some((e) => e.code === 'inconsistent-done-state'));
  });
});

// ---------------------------------------------------------------------------
// 6. Ciclo entre tarefas: detectado e reportado COM o caminho (A-P02-4)
// ---------------------------------------------------------------------------

describe('escalonador — ciclos de dependência (A-P02-4)', () => {
  it('ciclo de 3 nós é reportado com o caminho a→b→c→a', () => {
    const a = task({ id: 'a', deps: ['b'] });
    const b = task({ id: 'b', deps: ['c'] });
    const c = task({ id: 'c', deps: ['a'] });

    assert.deepEqual(findDependencyCycle([a, b, c]), ['a', 'b', 'c', 'a']);

    const error = validateWave(wave([a, b, c])).errors.find((e) => e.code === 'dependency-cycle');
    assert.ok(error);
    assert.deepEqual(error?.details.ciclo, ['a', 'b', 'c', 'a']);
    assert.match(error?.message ?? '', /a→b→c→a/);
  });

  it('ciclo de 2 nós e auto-dependência também são pegos', () => {
    const a = task({ id: 'a', deps: ['b'] });
    const b = task({ id: 'b', deps: ['a'] });
    assert.deepEqual(findDependencyCycle([a, b]), ['a', 'b', 'a']);

    const self = task({ id: 's', deps: ['s'] });
    assert.deepEqual(findDependencyCycle([self]), ['s', 's']);
  });

  it('grafo acíclico retorna null e a onda roda', async () => {
    const a = task({ id: 'a' });
    const b = task({ id: 'b', deps: ['a'] });
    const c = task({ id: 'c', deps: ['a'] });
    assert.equal(findDependencyCycle([a, b, c]), null);
    const validation = validateWave(wave([a, b, c]));
    assert.equal(validation.errors.length, 0);

    const fake = fakeExecutor();
    const result = await runWave(wave([a, b, c]), {
      limiters: freeLimiters(),
      execute: fake.execute,
    });
    assert.equal(result.executed.length, 3);
  });

  it('runWave com ciclo lança erro estruturado sem executar nada', async () => {
    const a = task({ id: 'a', deps: ['b'] });
    const b = task({ id: 'b', deps: ['a'] });
    const fake = fakeExecutor();

    await assert.rejects(
      () => runWave(wave([a, b]), { limiters: freeLimiters(), execute: fake.execute }),
      (err: unknown) => {
        assert.ok(err instanceof SchedulerError);
        assert.equal(err.code, 'dependency-cycle');
        assert.match(err.message, /a→b→a/);
        return true;
      },
    );
    assert.deepEqual(fake.calls, []);
  });
});

// ---------------------------------------------------------------------------
// Bônus: reducers
// ---------------------------------------------------------------------------

describe('escalonador — reducers (bônus)', () => {
  function runWithGates(
    tasks: Task[],
    reducers: WaveConfig['reducers'],
    impl: (t: Task) => TaskRunResult | Promise<TaskRunResult>,
  ) {
    const fake = fakeExecutor(impl);
    return {
      promise: runWave(wave(tasks, reducers), { limiters: freeLimiters(), execute: fake.execute }),
      fake,
    };
  }

  it('append concatena em ordem de conclusão', async () => {
    // Ambas esperam o PRÓPRIO gate: a ordem de conclusão é controlada
    // explicitamente (resolve o gate de A, espera A concluir, resolve o de B).
    const gateA = deferred<void>();
    const gateB = deferred<void>();
    const a = task({ id: 'a', writes: ['trilha.aulas'] });
    const b = task({ id: 'b', writes: ['trilha.aulas'] });

    const { promise, fake } = runWithGates(
      [a, b],
      { 'trilha.aulas': { type: 'append' } },
      (t) =>
        t.id === 'a'
          ? gateA.promise.then(() => ({ ok: true, entries: { 'trilha.aulas': [{ slug: 'A' }] } }))
          : gateB.promise.then(() => ({ ok: true, entries: { 'trilha.aulas': [{ slug: 'B' }] } })),
    );

    await until(() => fake.calls.includes('a') && fake.calls.includes('b'));
    gateA.resolve();
    await new Promise<void>((res) => setImmediate(res)); // A conclui e é registrado antes de B
    gateB.resolve();
    const result = await promise;

    assert.deepEqual(result.reduced['trilha.aulas'], [{ slug: 'A' }, { slug: 'B' }]);
  });

  it('append_dedup_by deduplica pela chave do item, mantendo a primeira ocorrência', async () => {
    const a = task({ id: 'a', writes: ['k'] });
    const b = task({ id: 'b', writes: ['k'] });
    const c = task({ id: 'c', writes: ['k'] });

    const { promise } = runWithGates(
      [a, b, c],
      { k: { type: 'append_dedup_by', key: 'slug' } },
      (t) => ({
        ok: true,
        entries: {
          k:
            t.id === 'a'
              ? [{ slug: 'x', v: 1 }, { slug: 'y', v: 2 }]
              : t.id === 'b'
                ? [{ slug: 'x', v: 3 }]
                : [{ slug: 'z', v: 4 }],
        },
      }),
    );

    const result = await promise;
    assert.deepEqual(result.reduced.k, [
      { slug: 'x', v: 1 },
      { slug: 'y', v: 2 },
      { slug: 'z', v: 4 },
    ]);
  });

  it('majority_vote vence com maioria estrita; empate grava NADA', async () => {
    const majority = [task({ id: 'p1', writes: ['decisao'] }), task({ id: 'p2', writes: ['decisao'] }), task({ id: 'p3', writes: ['decisao'] })];
    const { promise } = runWithGates(
      majority,
      { decisao: { type: 'majority_vote' } },
      (t) => ({ ok: true, entries: { decisao: [t.id === 'p3' ? 'refatorar' : 'escrever'] } }),
    );
    const result = await promise;
    assert.equal(result.reduced.decisao, 'escrever');

    const tie = [task({ id: 'q1', writes: ['empate'] }), task({ id: 'q2', writes: ['empate'] })];
    const { promise: tieRun } = runWithGates(
      tie,
      { empate: { type: 'majority_vote' } },
      (t) => ({ ok: true, entries: { empate: [t.id === 'q1' ? 'sim' : 'nao'] } }),
    );
    const tieResult = await tieRun;
    assert.ok(!('empate' in tieResult.reduced), 'empate ⇒ NADA gravado (chave ausente)');
  });

  it('reduceWave é puro e só reduz chave multi-escritor (≥2 escritoras declaradas)', () => {
    const a = task({ id: 'a', writes: ['dupla'] });
    const b = task({ id: 'b', writes: ['dupla'] });
    const config = wave([a, b], { dupla: { type: 'append' } });
    // reduceWave sozinho (sem runWave): redução em ordem de conclusão dada.
    const reduced = reduceWave(config, [
      { task: a, result: { ok: true, entries: { dupla: [{ v: 1 }] } } },
      { task: b, result: { ok: true, entries: { dupla: [{ v: 2 }] } } },
    ]);
    assert.deepEqual(reduced.dupla, [{ v: 1 }, { v: 2 }]);

    // Chave com UMA escritora declarada não é reduzida, mesmo com reducer.
    const single = wave([task({ id: 'c', writes: ['unica'] })], { unica: { type: 'append' } });
    const reducedSingle = reduceWave(single, [
      { task: a, result: { ok: true, entries: { unica: [1] } } },
    ]);
    assert.ok(!('unica' in reducedSingle), 'escritor único não é reduzido');
    assert.ok(!('dupla' in reducedSingle), 'chave sem reducer não aparece');
  });

  it('entrada de executor fora de writes é erro estruturado em execução', async () => {
    const a = task({ id: 'a', writes: ['declarada'] });
    const fake = fakeExecutor(() => ({ ok: true, entries: { 'nao-declarada': [1] } }));

    await assert.rejects(
      () => runWave(wave([a]), { limiters: freeLimiters(), execute: fake.execute }),
      (err: unknown) => err instanceof SchedulerError && err.code === 'undeclared-entry-key',
    );
  });

  it('append_dedup_by com item sem a chave de dedup é erro estruturado', async () => {
    const a = task({ id: 'a', writes: ['k'] });
    const b = task({ id: 'b', writes: ['k'] });
    const fake = fakeExecutor((t) =>
      t.id === 'a' ? { ok: true, entries: { k: [{ slug: 'x' }] } } : { ok: true, entries: { k: [{ semChave: true }] } },
    );

    await assert.rejects(
      () => runWave(wave([a, b], { k: { type: 'append_dedup_by', key: 'slug' } }), {
        limiters: freeLimiters(),
        execute: fake.execute,
      }),
      (err: unknown) => err instanceof SchedulerError && err.code === 'dedup-key-missing',
    );
  });
});