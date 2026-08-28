/**
 * tests/lastLesson.test.ts — store da ÚLTIMA AULA ABERTA (onda1-nav-ui).
 *
 * Sem jsdom: save/peek/reset são funções puras sobre a variável de módulo.
 * Contratos que mordem:
 *   1. save grava o par — peek devolve o MESMO par;
 *   2. save é idempotente/sobrescreve (a última aula aberta vence);
 *   3. save com vazio/espaços normaliza para null (nunca grava lixo);
 *   4. peek NÃO consome (duas leituras devolvem o mesmo valor — a restauração
 *      da LessonView na montagem depende disto: o double-invoke do StrictMode
 *      no dev re-restaura a MESMA aula sem drain one-shot);
 *   5. __reset esvazia TUDO (beforeEach da suíte).
 */
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetLastLessonForTests,
  peekLastLesson,
  saveLastLesson,
} from '../src/lib/lastLesson';

beforeEach(() => {
  __resetLastLessonForTests();
});

describe('lastLesson (onda1-nav-ui)', () => {
  it('save grava e peek devolve o par (trackSlug + lessonId)', () => {
    assert.equal(peekLastLesson(), null, 'começa vazio');
    saveLastLesson('nodejs-do-zero', 'aula-1');
    assert.deepEqual(peekLastLesson(), { trackSlug: 'nodejs-do-zero', lessonId: 'aula-1' });
  });

  it('a última aula aberta vence (sobrescreve)', () => {
    saveLastLesson('nodejs-do-zero', 'aula-1');
    saveLastLesson('nodejs-do-zero', 'aula-2');
    assert.deepEqual(peekLastLesson(), { trackSlug: 'nodejs-do-zero', lessonId: 'aula-2' });
  });

  it('save com vazio/espaços normaliza para null (nunca grava lixo)', () => {
    saveLastLesson('   ', 'aula-1');
    assert.equal(peekLastLesson(), null);
    saveLastLesson('nodejs-do-zero', '  ');
    assert.equal(peekLastLesson(), null);
  });

  it('save faz trim nos dois campos (contrato não assume slugs limpos)', () => {
    saveLastLesson('  nodejs-do-zero  ', ' aula-1 ');
    assert.deepEqual(peekLastLesson(), { trackSlug: 'nodejs-do-zero', lessonId: 'aula-1' });
  });

  it('peek NÃO consome — leituras repetidas devolvem o mesmo valor', () => {
    saveLastLesson('nodejs-do-zero', 'aula-1');
    assert.deepEqual(peekLastLesson(), peekLastLesson());
    assert.deepEqual(peekLastLesson(), { trackSlug: 'nodejs-do-zero', lessonId: 'aula-1' });
  });

  it('__reset esvazia TUDO (beforeEach da suíte)', () => {
    saveLastLesson('nodejs-do-zero', 'aula-1');
    __resetLastLessonForTests();
    assert.equal(peekLastLesson(), null);
  });
});
