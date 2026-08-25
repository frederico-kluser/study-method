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
    assert.equal(p.failed, false);
  });

  it('stage research mapeia para pesquisando', () => {
    const p = parseLessonProgressEvent({ stage: 'research' });
    assert.equal(p.phase, 'pesquisando');
  });

  it('phase nomeado em pt-BR é respeitado', () => {
    assert.equal(parseLessonProgressEvent({ phase: 'autorando' }).phase, 'autorando');
    assert.equal(parseLessonProgressEvent({ phase: 'validando' }).phase, 'validando');
  });

  it('phase em inglês (payload real do main) → fase pt-BR', () => {
    assert.equal(parseLessonProgressEvent({ phase: 'research' }).phase, 'pesquisando');
    assert.equal(parseLessonProgressEvent({ phase: 'authoring' }).phase, 'autorando');
    assert.equal(parseLessonProgressEvent({ phase: 'materializing' }).phase, 'materializando');
    assert.equal(parseLessonProgressEvent({ phase: 'validating' }).phase, 'validando');
  });

  it('payload real do main (phase+message+fraction) → fase certa, mensagem e fraction preservadas', () => {
    const p = parseLessonProgressEvent({ phase: 'research', message: 'Pesquisando "Brave"…', fraction: 0.1 });
    assert.equal(p.phase, 'pesquisando');
    assert.match(p.message, /Pesquisando/);
    assert.equal(p.fraction, 0.1);
    assert.equal(p.done, false);
    assert.equal(p.failed, false);
  });

  it('fraction do main (0..1) avança o progresso (barra do Stepper)', () => {
    assert.equal(parseLessonProgressEvent({ phase: 'authoring', fraction: 0.35 }).fraction, 0.35);
    assert.equal(parseLessonProgressEvent({ phase: 'materializing', fraction: 0.75 }).fraction, 0.75);
    assert.equal(parseLessonProgressEvent({ phase: 'done', fraction: 1 }).fraction, 1);
    // clampa como os demais (fraction > 1 é tratado como escala 0..100)
    assert.equal(parseLessonProgressEvent({ fraction: -1 }).fraction, 0);
    assert.equal(parseLessonProgressEvent({ fraction: 150 }).fraction, 1);
  });

  it('payload real do main de conclusão → concluindo + done', () => {
    const p = parseLessonProgressEvent({ phase: 'done', message: 'Aula pronta.', fraction: 1 });
    assert.equal(p.phase, 'concluindo');
    assert.equal(p.done, true);
    assert.equal(p.failed, false);
    assert.match(p.message, /Aula pronta/);
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

  it("phase 'error' → failed true com a mensagem do erro preservada", () => {
    const p = parseLessonProgressEvent({ phase: 'error', message: 'Brave falhou' });
    assert.equal(p.failed, true);
    assert.equal(p.done, false);
    assert.match(p.message, /Brave falhou/);
  });

  it('error:true → failed true', () => {
    const p = parseLessonProgressEvent({ error: true, message: 'LLM indisponível' });
    assert.equal(p.failed, true);
    assert.match(p.message, /LLM indisponível/);
  });

  it('erro sem message usa fallback pt-BR', () => {
    const p = parseLessonProgressEvent({ phase: 'error' });
    assert.equal(p.failed, true);
    assert.equal(p.message, 'Falha na geração da aula.');
  });

  it('eventos normais não marcam failed', () => {
    assert.equal(parseLessonProgressEvent({ phase: 'pesquisando' }).failed, false);
    assert.equal(parseLessonProgressEvent({ done: true }).failed, false);
    assert.equal(parseLessonProgressEvent({ stage: 'authoring' }).failed, false);
  });
});