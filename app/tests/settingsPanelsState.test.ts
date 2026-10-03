/**
 * tests/settingsPanelsState.test.ts — a MÁQUINA de estados dos painéis de
 * Settings extraída no state/view split (STORY-SPEC §5).
 *
 * O que se prova aqui (sem jsdom — só lógica pura):
 *  - `progressPanelReducer` (src/views/SettingsView/progressPanelState.ts): o
 *    diálogo de confirmação, o `busy` que NUNCA fica preso (o `clearSettled`
 *    roda nos três caminhos: sucesso, falha de negócio e rejeição) e o
 *    feedback honesto de fim de ação;
 *  - `clearProgressErrorKey`: timeout do guard ≠ falha do canal — cada um com a
 *    sua chave i18n (W19: a frase é i18n, nunca `String(err)`).
 *
 * Reprodução: `bash tools/t.sh tests/settingsPanelsState.test.ts`
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  clearProgressErrorKey,
  initialProgressPanelState,
  progressPanelReducer,
  type ProgressPanelVm,
} from '../src/views/SettingsView/progressPanelState';

function run(events: Parameters<typeof progressPanelReducer>[1][]): ProgressPanelVm {
  return events.reduce(progressPanelReducer, initialProgressPanelState);
}

describe('progressPanelReducer (SettingsView/progressPanelState)', () => {
  it('nasce com o diálogo fechado, sem ocupação e sem feedback', () => {
    assert.deepEqual(initialProgressPanelState, {
      confirmOpen: false,
      busy: false,
      feedback: null,
    });
  });

  it('a ação destrutiva SÓ acontece depois do diálogo (abrir não limpa nada)', () => {
    const aberto = run([{ type: 'confirmOpened' }]);
    assert.equal(aberto.confirmOpen, true);
    assert.equal(aberto.busy, false);
    assert.equal(aberto.feedback, null);
  });

  it('cancelar fecha o diálogo sem tocar no disco', () => {
    const s = run([{ type: 'confirmOpened' }, { type: 'confirmClosed' }]);
    assert.equal(s.confirmOpen, false);
    assert.equal(s.busy, false);
  });

  it('caminho de SUCESSO: started → succeeded → settled (fecha e limpa)', () => {
    const s = run([
      { type: 'confirmOpened' },
      { type: 'clearStarted' },
      { type: 'clearSucceeded' },
      { type: 'clearSettled' },
    ]);
    assert.equal(s.confirmOpen, false);
    assert.equal(s.busy, false);
    assert.deepEqual(s.feedback, { kind: 'done' });
  });

  it('caminho de FALHA: o feedback carrega frase i18n + detalhe técnico opcional', () => {
    const s = run([
      { type: 'confirmOpened' },
      { type: 'clearStarted' },
      { type: 'clearFailed', message: 'translation:settings.clearProgressError', detail: 'boom' },
      { type: 'clearSettled' },
    ]);
    assert.equal(s.confirmOpen, false, 'o diálogo fecha em TODOS os caminhos');
    assert.equal(s.busy, false, 'o busy nunca fica preso');
    assert.deepEqual(s.feedback, {
      kind: 'error',
      message: 'translation:settings.clearProgressError',
      detail: 'boom',
    });
  });

  it('uma nova tentativa limpa o feedback da tentativa anterior', () => {
    const s = run([
      { type: 'clearFailed', message: 'antiga', detail: 'x' },
      { type: 'clearStarted' },
    ]);
    assert.equal(s.feedback, null);
    assert.equal(s.busy, true);
  });
});

describe('clearProgressErrorKey (W19: frase i18n, nunca String(err))', () => {
  it('timeout do guard tem chave própria', () => {
    assert.equal(clearProgressErrorKey(true), 'translation:settings.clearProgressTimeout');
    assert.equal(clearProgressErrorKey(false), 'translation:settings.clearProgressError');
  });
});
