/**
 * tests/lessonProgress.test.ts — parser dos eventos de progresso de aula.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseLessonProgressEvent } from '../src/lib/lessonProgress';
import type { LessonPhaseKey } from '../src/lib/lessonProgress';

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

describe('parseLessonProgressEvent — borda: contrato real do main e precedências', () => {
  it('sequência real do main (lessonOrchestrator) vira as fases/fractions certas', () => {
    // Vocabulário real de electron/main/services/lessonOrchestrator.ts:
    //   research 0.1 → authoring 0.35 → materializing 0.55/0.575 →
    //   validating 0.75 → done 1 (fraction 0..1 + message pt-BR).
    const seq: Array<[Record<string, unknown>, LessonPhaseKey, number]> = [
      [{ phase: 'research', message: 'Pesquisando "Brave"…', fraction: 0.1 }, 'pesquisando', 0.1],
      [{ phase: 'authoring', message: 'Autorando a aula…', fraction: 0.35 }, 'autorando', 0.35],
      [{ phase: 'materializing', message: 'Criando setup onda1…', fraction: 0.55 }, 'materializando', 0.55],
      [{ phase: 'materializing', message: 'Setup criado: /tmp/setup', fraction: 0.575 }, 'materializando', 0.575],
      [{ phase: 'materializing', message: 'Materializando desafio 1/3: "x"', fraction: 0.55 }, 'materializando', 0.55],
      [{ phase: 'validating', message: 'Validando desafio 1/3: "x"', fraction: 0.75 }, 'validando', 0.75],
      [{ phase: 'done', message: 'Aula pronta.', fraction: 1 }, 'concluindo', 1],
    ];
    for (const [payload, phase, fraction] of seq) {
      const p = parseLessonProgressEvent(payload);
      assert.equal(p.phase, phase, `phase de ${JSON.stringify(payload)}`);
      assert.equal(p.fraction, fraction, `fraction de ${JSON.stringify(payload)}`);
      assert.equal(p.failed, false);
    }
    assert.equal(parseLessonProgressEvent(seq[6][0]).done, true);
  });

  it('campos aditivos do main (setupRoot/setupId) são tolerados sem quebrar o parse', () => {
    const p = parseLessonProgressEvent({
      phase: 'materializing',
      message: 'Setup criado: /tmp/setup',
      fraction: 0.575,
      setupRoot: '/tmp/setup',
      setupId: 's-42',
    });
    assert.equal(p.phase, 'materializando');
    assert.equal(p.fraction, 0.575);
    assert.match(p.message, /Setup criado/);
    assert.equal(p.failed, false);
    assert.equal(p.done, false);
  });

  it('precedência de progresso: progress > percent > fraction', () => {
    assert.equal(parseLessonProgressEvent({ progress: 0.5, percent: 75, fraction: 0.1 }).fraction, 0.5);
    assert.equal(parseLessonProgressEvent({ percent: 75, fraction: 0.1 }).fraction, 0.75);
    assert.equal(parseLessonProgressEvent({ fraction: 0.1 }).fraction, 0.1);
    // percent (escala 0..100) combinado com phase nomeada
    assert.equal(parseLessonProgressEvent({ phase: 'authoring', percent: 35 }).fraction, 0.35);
  });

  it('error junto com done:true → failed vence done (done=false), fase permanece concluindo', () => {
    const p = parseLessonProgressEvent({ phase: 'error', done: true, message: 'Falhou na geração' });
    assert.equal(p.failed, true);
    assert.equal(p.done, false);
    assert.equal(p.phase, 'concluindo');
    assert.match(p.message, /Falhou na geração/);
  });

  it('error:true junto com success:true → failed vence success', () => {
    const p = parseLessonProgressEvent({ error: true, success: true });
    assert.equal(p.failed, true);
    assert.equal(p.done, false);
    assert.equal(p.message, 'Falha na geração da aula.');
  });

  it('success/complete marcam done e concluindo (além de done:true)', () => {
    assert.equal(parseLessonProgressEvent({ success: true }).done, true);
    assert.equal(parseLessonProgressEvent({ success: true }).phase, 'concluindo');
    assert.equal(parseLessonProgressEvent({ complete: true }).done, true);
    assert.equal(parseLessonProgressEvent({ complete: true }).phase, 'concluindo');
  });

  it("message de erro só com espaços cai no fallback pt-BR", () => {
    const p = parseLessonProgressEvent({ phase: 'error', message: '   ' });
    assert.equal(p.failed, true);
    assert.equal(p.message, 'Falha na geração da aula.');
  });

  it('phase/stage são case-insensitive (pt-BR e inglês)', () => {
    assert.equal(parseLessonProgressEvent({ phase: 'Research' }).phase, 'pesquisando');
    assert.equal(parseLessonProgressEvent({ phase: 'Validando' }).phase, 'validando');
    assert.equal(parseLessonProgressEvent({ phase: 'DONE' }).done, true);
    assert.equal(parseLessonProgressEvent({ phase: 'DONE' }).phase, 'concluindo');
    assert.equal(parseLessonProgressEvent({ stage: 'Authoring' }).phase, 'autorando');
  });

  it('error + stage juntos: failed permanece, fase vira a do stage, message do erro vence', () => {
    const p = parseLessonProgressEvent({ phase: 'error', message: 'Falhou', stage: 'research' });
    assert.equal(p.failed, true);
    assert.equal(p.done, false);
    assert.equal(p.phase, 'pesquisando');
    assert.match(p.message, /Falhou/);
  });

  it('error:true + fraction: fracção de progresso é preservada mesmo em falha', () => {
    const p = parseLessonProgressEvent({ error: true, fraction: 0.4, message: 'LLM caiu' });
    assert.equal(p.failed, true);
    assert.equal(p.fraction, 0.4);
    assert.match(p.message, /LLM caiu/);
  });

  it("stage:'done' mapeia a fase mas NÃO marca done (comportamento atual do parser)", () => {
    const p = parseLessonProgressEvent({ stage: 'done' });
    assert.equal(p.phase, 'concluindo');
    assert.equal(p.done, false);
    assert.equal(p.failed, false);
  });
});