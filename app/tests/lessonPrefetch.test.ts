/**
 * tests/lessonPrefetch.test.ts — hook renderer de pré-carga de aula
 * (onda2-load).
 *
 * Cobre src/lib/lessonPrefetch.ts sem jsdom (API fake via apiBridge):
 *   1. `prefetchLesson` chama `track.lesson` UMA vez por lançamento e nunca
 *      lança nem deixa unhandledRejection — inclusive com api que rejeita;
 *   2. guarda anti-burst: no máximo UMA pré-carga EM VOO por trilha e no
 *      mínimo PREFETCH_MIN_INTERVAL_MS entre lançamentos — chamadas em rajada
 *      são ignoradas (a função é fire-and-forget puro, nunca loading);
 *   3. argumentos inválidos são no-op;
 *   4. `__resetLessonPrefetchForTests` restaura o estado (burst não trava).
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import type { ApiSchema } from '../electron/preload/api-schema';
import { __resetApiForTests, __setApiForTests } from '../src/lib/apiBridge';
import {
  __resetLessonPrefetchForTests,
  prefetchLesson,
} from '../src/lib/lessonPrefetch';

const tick = (): Promise<void> => new Promise((r) => setImmediate(r));

/** API fake que conta chamadas a track.lesson e (opcionalmente) falha/presa. */
function fakeApi(opts: { fail?: boolean; gate?: Promise<void> } = {}): { api: ApiSchema; calls: () => number } {
  let calls = 0;
  const api = {
    track: {
      lesson: async (): Promise<{ ok: true; lesson: null }> => {
        calls += 1;
        if (opts.gate) await opts.gate;
        if (opts.fail) throw new Error('api-fake-falhou');
        return { ok: true, lesson: null };
      },
    },
  };
  return { api: api as unknown as ApiSchema, calls: () => calls };
}

describe('lessonPrefetch — pré-carga do renderer', () => {
  beforeEach(() => {
    __resetLessonPrefetchForTests();
    __resetApiForTests();
  });

  it('chama track.lesson exatamente uma vez por lançamento e nunca lança', async () => {
    const { api, calls } = fakeApi();
    __setApiForTests(api);
    prefetchLesson('python-iniciante', 'aula-2');
    await tick();
    assert.equal(calls(), 1);
    assert.equal(calls(), 1, 'acabou em voo — nenhuma chamada duplicada');
  });

  it('augura anti-burst: no máximo UMA em voo por trilha (rajada = uma chamada só)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { api, calls } = fakeApi({ gate });
    __setApiForTests(api as never);

    prefetchLesson('python-iniciante', 'aula-2');
    // rajada: segunda chamada no mesmo instante (mesma aula e aula diferente)
    prefetchLesson('python-iniciante', 'aula-2');
    prefetchLesson('python-iniciante', 'aula-3');
    await tick();
    assert.equal(calls(), 1, 'uma pré-carga em voo por trilha — as outras foram ignoradas');

    release();
    await tick();
    // intervalo mínimo ainda segura o próximo lançamento
    prefetchLesson('python-iniciante', 'aula-3');
    await tick();
    assert.equal(calls(), 1, 'intervalo mínimo de 1 s entre lançamentos');
  });

  it('erro da API é engolido: prefetchLesson não lança, sem unhandledRejection', async () => {
    let unhandled = 0;
    const onUnhandled = (): void => {
      unhandled += 1;
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      const { api, calls } = fakeApi({ fail: true });
      __setApiForTests(api as never);
      prefetchLesson('python-iniciante', 'aula-2'); // não lança (síncrono)
      await tick();
      await tick();
      assert.equal(calls(), 1, 'a chamada aconteceu mesmo falhando');
      assert.equal(unhandled, 0, 'rejeição foi engolida pelo catch interno');
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('argumentos inválidos são no-op (nunca chegam à API)', async () => {
    const { api, calls } = fakeApi();
    __setApiForTests(api);
    prefetchLesson('', 'aula-2');
    prefetchLesson('python-iniciante', '');
    prefetchLesson('', '');
    await tick();
    assert.equal(calls(), 0);
  });

  it('reset libera o estado: depois do reset, uma nova pré-carga lança', async () => {
    const { api, calls } = fakeApi();
    __setApiForTests(api);
    prefetchLesson('python-iniciante', 'aula-2');
    await tick();
    assert.equal(calls(), 1);

    __resetLessonPrefetchForTests();
    prefetchLesson('python-iniciante', 'aula-2');
    await tick();
    assert.equal(calls(), 2, 'o reset zerou o anti-burst');
  });
});