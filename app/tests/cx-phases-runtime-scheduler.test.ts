/**
 * tests/cx-phases-runtime-scheduler.test.ts — CARACTERIZAÇÃO (golden master) de
 * `engine/runtime/scheduler.ts` (o escalonador de ondas de tarefas).
 *
 * PINA: a validação pura da onda (todos os códigos de SchedulerError),
 * a colisão de posse pela chave canônica, o caminho do ciclo reportado, os
 * três reducers multi-escritor, e o comportamento de `runWave` (ordem por
 * deps, bloqueio por falha, retomada idempotente, fail-closed de entrada fora
 * de `writes`, contabilidade de acquire/release por recurso).
 *
 * Executor e limitadores são INJETADOS (fakes em memória) — sem rede, sem
 * disco, sem processo.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { Task, TaskResource } from '../electron/main/engine/runtime/task';
import {
  SchedulerError,
  collectOutputCollisions,
  findDependencyCycle,
  reduceWave,
  runWave,
  validateWave,
  type RateLimiter,
  type SchedulerEnv,
  type TaskRunResult,
  type WaveConfig,
} from '../electron/main/engine/runtime/scheduler';

// ---------------------------------------------------------------------------
// Helpers/fakes
// ---------------------------------------------------------------------------

function tarefa(over: Partial<Task> & { id: string }): Task {
  return {
    fase: 'F7',
    deps: [],
    recurso: 'llm',
    cacheKey: `cache-${over.id}`,
    outputs: [`out/${over.id}.md`],
    writes: [],
    status: 'pending',
    ...over,
  };
}

/** Limitador fake que conta acquires/liberações por recurso. */
function limiterFake(contagem: { acquires: number; releases: number }): RateLimiter {
  return {
    async acquire() {
      contagem.acquires += 1;
      let liberado = false;
      return () => {
        if (liberado) return;
        liberado = true;
        contagem.releases += 1;
      };
    },
  };
}

function envFake(
  executor: (t: Task) => Promise<TaskRunResult>,
  contadores: Partial<Record<TaskResource, { acquires: number; releases: number }>> = {},
): SchedulerEnv {
  const c = {
    llm: contadores.llm ?? { acquires: 0, releases: 0 },
    exec: contadores.exec ?? { acquires: 0, releases: 0 },
    cpu: contadores.cpu ?? { acquires: 0, releases: 0 },
  };
  return {
    execute: executor,
    limiters: { llm: limiterFake(c.llm), exec: limiterFake(c.exec), cpu: limiterFake(c.cpu) },
  };
}

function codigosDe(errors: SchedulerError[]): string[] {
  return errors.map((e) => e.code);
}

// ---------------------------------------------------------------------------
// 1. Validação pura da onda
// ---------------------------------------------------------------------------

describe('scheduler — validateWave (rejeição ANTES de rodar)', () => {
  it('onda limpa: zero erros, zero avisos', () => {
    const config: WaveConfig = {
      tasks: [tarefa({ id: 'a' }), tarefa({ id: 'b', deps: ['a'], outputs: ['out/b.md'] })],
      reducers: {},
    };
    assert.deepEqual(validateWave(config), { errors: [], warnings: [] });
  });

  it('dois outputs que designam o MESMO arquivo físico rejeitam a onda (ownership-collision)', () => {
    for (const [parA, parB, rotulo] of [
      ['out/x.md', 'out/./x.md', 'notação com segmento redundante'],
      ['out/x.md', 'out/x.md/', 'barra final'],
      ['out/X.md', 'out/x.md', 'case'],
    ] as const) {
      const config: WaveConfig = {
        tasks: [tarefa({ id: 'a', outputs: [parA] }), tarefa({ id: 'b', outputs: [parB] })],
        reducers: {},
      };
      const { errors } = validateWave(config);
      assert.deepEqual(codigosDe(errors), ['ownership-collision'], `deveria colidir por ${rotulo}`);
      assert.match(errors[0].message, /REJEITADA antes de rodar/);
    }
  });

  it('caminhos distintos não colidem e os outputs ORIGINAIS nunca são reescritos', () => {
    const t1 = tarefa({ id: 'a', outputs: ['out/um.md'] });
    const t2 = tarefa({ id: 'b', outputs: ['out/./dois.md'] });
    const config: WaveConfig = { tasks: [t1, t2], reducers: {} };
    assert.deepEqual(validateWave(config).errors, []);
    assert.deepEqual(t2.outputs, ['out/./dois.md'], 'canonicalização é só para comparação');
  });

  it('collectOutputCollisions mapeia chave canônica → tarefas (só com ≥2)', () => {
    const colisoes = collectOutputCollisions([
      tarefa({ id: 'a', outputs: ['X/Um.md', 'só/a.md'] }),
      tarefa({ id: 'b', outputs: ['x/um.md'] }),
    ]);
    assert.equal(colisoes.size, 1);
    assert.deepEqual(colisoes.get('x/um.md'), ['a', 'b']);
  });

  it('id duplicado e dependência desconhecida são erros nomeando as tarefas', () => {
    const config: WaveConfig = {
      tasks: [tarefa({ id: 'a' }), tarefa({ id: 'a', outputs: ['out/a2.md'] }), tarefa({ id: 'c', deps: ['fantasma'] })],
      reducers: {},
    };
    const { errors } = validateWave(config);
    assert.deepEqual(codigosDe(errors).sort(), ['duplicate-task-id', 'unknown-dependency']);
  });

  it('teto da onda: >20 é wave-too-large; 16..20 é warning (recomendado 15)', () => {
    const grande = Array.from({ length: 21 }, (_, i) => tarefa({ id: `t${i}` }));
    const { errors, warnings } = validateWave({ tasks: grande, reducers: {} });
    assert.deepEqual(codigosDe(errors), ['wave-too-large']);
    assert.deepEqual(warnings, []);

    const media = Array.from({ length: 16 }, (_, i) => tarefa({ id: `m${i}` }));
    const r2 = validateWave({ tasks: media, reducers: {} });
    assert.deepEqual(r2.errors, []);
    assert.equal(r2.warnings.length, 1);
    assert.match(r2.warnings[0], /acima do recomendado de 15/);
  });

  it('estado persistido inconsistente: done sem doneCacheKey é erro', () => {
    const config: WaveConfig = {
      tasks: [tarefa({ id: 'a', status: 'done', doneCacheKey: undefined })],
      reducers: {},
    };
    const { errors } = validateWave(config);
    assert.deepEqual(codigosDe(errors), ['inconsistent-done-state']);
  });

  it('ciclo de dependências é erro com o CAMINHO fechado (a→c→b→a)', () => {
    const config: WaveConfig = {
      tasks: [
        tarefa({ id: 'a', deps: ['c'] }),
        tarefa({ id: 'b', deps: ['a'] }),
        tarefa({ id: 'c', deps: ['b'] }),
      ],
      reducers: {},
    };
    const { errors } = validateWave(config);
    assert.deepEqual(codigosDe(errors), ['dependency-cycle']);
    // O caminho segue a direção das DEPS e fecha repetindo o início.
    assert.equal(errors[0].details.caminho, 'a→c→b→a');
    assert.deepEqual(findDependencyCycle(config.tasks), ['a', 'c', 'b', 'a']);
  });

  it('findDependencyCycle: null em DAG; dep fora da onda não é tratada como ciclo', () => {
    assert.equal(findDependencyCycle([tarefa({ id: 'a' }), tarefa({ id: 'b', deps: ['a'] })]), null);
    assert.equal(findDependencyCycle([tarefa({ id: 'a', deps: ['fora'] })]), null);
  });

  it('chave multi-escritor sem reducer é erro de CONFIGURAÇÃO; reducer ocioso/único-escritor é warning', () => {
    const semReducer: WaveConfig = {
      tasks: [tarefa({ id: 'a', writes: ['trilha.aulas'] }), tarefa({ id: 'b', writes: ['trilha.aulas'] })],
      reducers: {},
    };
    assert.deepEqual(codigosDe(validateWave(semReducer).errors), ['missing-reducer']);

    const avisos: WaveConfig = {
      tasks: [tarefa({ id: 'a', writes: ['sozinha'] })],
      reducers: { sozinha: { type: 'append' }, ociosa: { type: 'append' } },
    };
    const { errors, warnings } = validateWave(avisos);
    assert.deepEqual(errors, []);
    assert.equal(warnings.length, 2);
    assert.ok(warnings.some((w) => w.includes('ociosa')));
    assert.ok(warnings.some((w) => w.includes('uma tarefa só')));
  });
});

// ---------------------------------------------------------------------------
// 2. Redução de chaves multi-escritor
// ---------------------------------------------------------------------------

describe('scheduler — reduceWave (reducers declarados)', () => {
  function ondaComRedutor(spec: WaveConfig['reducers'][string], chaves: string[][]): WaveConfig {
    const tasks = chaves.map((writes, i) =>
      tarefa({ id: `t${i}`, writes, outputs: [`out/t${i}.md`] }),
    );
    return { tasks, reducers: { agregado: spec } };
  }

  it('append concatena na ordem de CONCLUSÃO', () => {
    const config = ondaComRedutor({ type: 'append' }, [['agregado'], ['agregado']]);
    const completions = [
      { task: config.tasks[1], result: { ok: true, entries: { agregado: ['b1', 'b2'] } } },
      { task: config.tasks[0], result: { ok: true, entries: { agregado: ['a1'] } } },
    ];
    assert.deepEqual(reduceWave(config, completions), { agregado: ['b1', 'b2', 'a1'] });
  });

  it('append_dedup_by mantém a PRIMEIRA ocorrência da chave de dedup', () => {
    const config = ondaComRedutor({ type: 'append_dedup_by', key: 'id' }, [['agregado'], ['agregado']]);
    const completions = [
      { task: config.tasks[0], result: { ok: true, entries: { agregado: [{ id: 'x', v: 1 }, { id: 'y', v: 2 }] } } },
      { task: config.tasks[1], result: { ok: true, entries: { agregado: [{ id: 'x', v: 99 }] } } },
    ];
    assert.deepEqual(reduceWave(config, completions), { agregado: [{ id: 'x', v: 1 }, { id: 'y', v: 2 }] });
  });

  it('append_dedup_by com item SEM a chave de dedup é SchedulerError dedup-key-missing', () => {
    const config = ondaComRedutor({ type: 'append_dedup_by', key: 'id' }, [['agregado'], ['agregado']]);
    const completions = [
      { task: config.tasks[0], result: { ok: true, entries: { agregado: [{ semId: true }] } } },
      { task: config.tasks[1], result: { ok: true, entries: { agregado: [] } } },
    ];
    assert.throws(
      () => reduceWave(config, completions),
      (erro: unknown) => erro instanceof SchedulerError && erro.code === 'dedup-key-missing',
    );
  });

  it('majority_vote exige maioria ESTRITA; empate grava NADA (chave ausente)', () => {
    const config = ondaComRedutor({ type: 'majority_vote' }, [['agregado'], ['agregado'], ['agregado']]);
    const maioria = [
      { task: config.tasks[0], result: { ok: true, entries: { agregado: ['sim'] } } },
      { task: config.tasks[1], result: { ok: true, entries: { agregado: ['sim'] } } },
      { task: config.tasks[2], result: { ok: true, entries: { agregado: ['não'] } } },
    ];
    assert.deepEqual(reduceWave(config, maioria), { agregado: 'sim' });

    const empate = [
      { task: config.tasks[0], result: { ok: true, entries: { agregado: ['sim'] } } },
      { task: config.tasks[1], result: { ok: true, entries: { agregado: ['não'] } } },
    ];
    assert.deepEqual(reduceWave(config, empate), {}, 'empate ⇒ nada gravado');
  });

  it('chave de escritor ÚNICO nunca é reduzida; conclusões sem entrada contam vazias', () => {
    const config: WaveConfig = {
      tasks: [tarefa({ id: 'a', writes: ['só-mim'] }), tarefa({ id: 'b', writes: [] })],
      reducers: { 'só-mim': { type: 'append' } },
    };
    assert.deepEqual(reduceWave(config, [{ task: config.tasks[0], result: { ok: true } }]), {});
  });
});

// ---------------------------------------------------------------------------
// 3. runWave — execução como DAG com retomada
// ---------------------------------------------------------------------------

describe('scheduler — runWave (comportamento observável)', () => {
  it('roda deps ANTES das dependentes e devolve executed em ordem de conclusão', async () => {
    const ordem: string[] = [];
    const config: WaveConfig = {
      tasks: [
        tarefa({ id: 'raiz' }),
        tarefa({ id: 'meio', deps: ['raiz'] }),
        tarefa({ id: 'topo', deps: ['meio'] }),
      ],
      reducers: {},
    };
    const env = envFake(async (t) => {
      ordem.push(t.id);
      return { ok: true };
    });
    const r = await runWave(config, env);
    assert.deepEqual(r.executed, ['raiz', 'meio', 'topo']);
    assert.deepEqual(ordem, ['raiz', 'meio', 'topo']);
    assert.deepEqual(r.tasks.map((t) => t.status), ['done', 'done', 'done']);
    assert.ok(r.tasks.every((t) => t.doneCacheKey === t.cacheKey), 'done carrega o cacheKey');
  });

  it('tarefa que FALHA bloqueia as dependentes (status blocked) e falha vira failed', async () => {
    const config: WaveConfig = {
      tasks: [
        tarefa({ id: 'base' }),
        tarefa({ id: 'dependente', deps: ['base'] }),
        tarefa({ id: 'independente' }),
      ],
      reducers: {},
    };
    const env = envFake(async (t) => (t.id === 'base' ? { ok: false, error: 'quebrou' } : { ok: true }));
    const r = await runWave(config, env);
    const porId = new Map(r.tasks.map((t) => [t.id, t]));
    assert.equal(porId.get('base')?.status, 'failed');
    assert.equal(porId.get('dependente')?.status, 'blocked');
    assert.equal(porId.get('independente')?.status, 'done');
    assert.deepEqual(r.executed, ['independente'], 'executed lista só o que concluiu com SUCESSO');
  });

  it('executor que LANÇA vira failed (o erro não escapa do runWave)', async () => {
    const config: WaveConfig = { tasks: [tarefa({ id: 'explosiva' }), tarefa({ id: 'presa', deps: ['explosiva'] })], reducers: {} };
    const env = envFake(async () => {
      throw new Error('executor explodiu');
    });
    const r = await runWave(config, env);
    assert.deepEqual(r.tasks.map((t) => t.status), ['failed', 'blocked']);
  });

  it('retomada: done com MESMO doneCacheKey é pulado; cacheKey novo reexecuta', async () => {
    const execucoes: string[] = [];
    const tasks = [
      tarefa({ id: 'pronta', status: 'done', doneCacheKey: 'cache-pronta', cacheKey: 'cache-pronta' }),
      tarefa({ id: 'velha', status: 'done', doneCacheKey: 'cache-antigo', cacheKey: 'cache-novo' }),
    ];
    const config: WaveConfig = { tasks, reducers: {} };
    const env = envFake(async (t) => {
      execucoes.push(t.id);
      return { ok: true };
    });
    const r = await runWave(config, env);
    assert.deepEqual(r.skipped, ['pronta']);
    assert.deepEqual(r.executed, ['velha']);
    assert.deepEqual(execucoes, ['velha']);
    assert.equal(r.tasks[0].status, 'done');
    assert.equal(r.tasks[1].doneCacheKey, 'cache-novo', 'reexecução atualiza o doneCacheKey');
  });

  it('estado failed/blocked persistido é renormalizado para pending e reexecuta', async () => {
    const config: WaveConfig = {
      tasks: [tarefa({ id: 'x', status: 'failed' }), tarefa({ id: 'y', status: 'blocked', deps: ['x'] })],
      reducers: {},
    };
    const env = envFake(async () => ({ ok: true }));
    const r = await runWave(config, env);
    assert.deepEqual(r.executed, ['x', 'y']);
    assert.deepEqual(r.tasks.map((t) => t.status), ['done', 'done']);
  });

  it('entrada para chave fora de task.writes é fail-closed: SchedulerError undeclared-entry-key', async () => {
    const config: WaveConfig = {
      tasks: [tarefa({ id: 'a', writes: ['declarada'] })],
      reducers: {},
    };
    const env = envFake(async () => ({ ok: true, entries: { 'fora-do-writes': [1] } }));
    await assert.rejects(
      runWave(config, env),
      (erro: unknown) => erro instanceof SchedulerError && erro.code === 'undeclared-entry-key',
    );
  });

  it('onda inválida NÃO roda nada: runWave lança o PRIMEIRO erro de validação', async () => {
    const config: WaveConfig = {
      tasks: [tarefa({ id: 'a', outputs: ['mesmo.md'] }), tarefa({ id: 'b', outputs: ['./mesmo.md'] })],
      reducers: {},
    };
    const env = envFake(async () => ({ ok: true }));
    await assert.rejects(
      runWave(config, env),
      (erro: unknown) => erro instanceof SchedulerError && erro.code === 'ownership-collision',
    );
  });

  it('despacho por recurso: cada tarefa vai ao limitador do SEU recurso; slots sempre liberados', async () => {
    const contadores = {
      llm: { acquires: 0, releases: 0 },
      exec: { acquires: 0, releases: 0 },
      cpu: { acquires: 0, releases: 0 },
    };
    const config: WaveConfig = {
      tasks: [
        tarefa({ id: 'l', recurso: 'llm' }),
        tarefa({ id: 'e', recurso: 'exec' }),
        tarefa({ id: 'c', recurso: 'cpu' }),
        tarefa({ id: 'f', recurso: 'exec', deps: ['e'] }),
      ],
      reducers: {},
    };
    const env = envFake(async () => ({ ok: true }), contadores);
    await runWave(config, env);
    assert.deepEqual(contadores, {
      llm: { acquires: 1, releases: 1 },
      exec: { acquires: 2, releases: 2 },
      cpu: { acquires: 1, releases: 1 },
    });
  });

  it('slot é liberado MESMO quando o executor lança (falha não vaza slot)', async () => {
    const contadores = { llm: { acquires: 0, releases: 0 } };
    const config: WaveConfig = { tasks: [tarefa({ id: 'boom' })], reducers: {} };
    const env = envFake(async () => {
      throw new Error('explosão');
    }, contadores);
    await runWave(config, env);
    assert.deepEqual(contadores, { llm: { acquires: 1, releases: 1 } });
  });

  it('reduced da onda vem das conclusões DESTA execução (puladas não contribuem)', async () => {
    const config: WaveConfig = {
      tasks: [
        tarefa({ id: 'a', writes: ['trilha.aulas'], outputs: ['out/a.md'] }),
        tarefa({ id: 'b', writes: ['trilha.aulas'], outputs: ['out/b.md'] }),
        tarefa({ id: 'c', writes: ['trilha.aulas'], outputs: ['out/c.md'], status: 'done', doneCacheKey: 'cache-c', cacheKey: 'cache-c' }),
      ],
      reducers: { 'trilha.aulas': { type: 'append' } },
    };
    const env = envFake(async (t) => ({ ok: true, entries: { 'trilha.aulas': [`de-${t.id}`] } }));
    const r = await runWave(config, env);
    assert.deepEqual(r.reduced, { 'trilha.aulas': ['de-a', 'de-b'] });
    assert.deepEqual(r.skipped, ['c']);
  });

  it('warnings de validação são propagados no resultado da onda', async () => {
    const config: WaveConfig = {
      tasks: [tarefa({ id: 'a', writes: ['x'] })],
      reducers: { x: { type: 'append' }, ociosa: { type: 'append' } },
    };
    const env = envFake(async () => ({ ok: true }));
    const r = await runWave(config, env);
    assert.equal(r.warnings.length, 2);
  });
});
