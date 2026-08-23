/**
 * tests/lessonProgress.test.ts — parser dos eventos de progresso de aula.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseLessonProgressEvent } from '../src/lib/lessonProgress';

describe('parseLessonProgressEvent', () => {
  it('payload não-objeto -> estado gerando padrão', () => {
    const p = parseLessonProgressEvent(null);
    assert.equal(p.phase, 'gerando');
    assert.equal(p.fraction, 0);
    assert.equal(p.done, false);
  });

  it('stage research mapeia para pesquisando', () => {
    const p = parseLessonProgressEvent({ stage: 'research' });
    assert.equal(p.phase, 'pesquisando');
  });

  it('phase nomeado em pt-BR é respeitado', () => {
    assert.equal(parseLessonProgressEvent({ phase: 'autorando' }).phase, 'autorando');
    assert.equal(parseLessonProgressEvent({ phase: 'validando' }).phase, 'validando');
  });

  it('progress 0..1 e percent 0..100', () => {
    assert.equal(parseLessonProgressEvent({ progress: 0.5 }).fraction, 0.5);
    assert.equal(parseLessonProgressEvent({ percent: 75 }).fraction, 0.75);
    // clampa
    assert.equal(parseLessonProgressEvent({ percent: 150 }).fraction, 1);
    assert.equal(parseLessonProgressEvent({ progress: -2 }).fraction, 0);
  });

  it('done/success marcado', () => {
    assert.equal(parseLessonProgressEvent({ done: true }).done, true);
    assert.equal(parseLessonProgressEvent({ phase: 'done' }).done, true);
  });

  it('message custom sobrescreve', () => {
    const p = parseLessonProgressEvent({ phase: 'pesquisando', message: 'Brave…' });
    assert.match(p.message, /Brave/);
  });
});