/**
 * tests/challengeNav.test.ts — reducer puro da navegação de desafio.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  challengeNavReducer,
  initialChallengeNavState,
  DEFAULT_CHALLENGE_NAV,
} from '../src/lib/challengeNav';
import type { ChallengeInfo, TrackChallengeErrorReport } from '../shared/ipc-contract';

const CHALLENGE: ChallengeInfo = {
  challengeId: 'c1',
  title: 'Fila FIFO',
  language: 'python',
  concept: 'filas',
  difficulty: 2,
  status: 'validated',
  verdict: 'approved',
  workspaceDir: '/tmp/setup/challenges/c1',
  statementPath: 'README.md',
};

/** Relatório de erro de desafio que falhou (onda2-error-flow). */
const ERROR_REPORT: TrackChallengeErrorReport = {
  trackSlug: 'nodejs-do-zero',
  lessonId: 'aula-1',
  challengeId: 'dobro-do-numero',
  challengeTitle: 'O dobro do número',
  files: [{ path: 'solution.mjs', code: 'export function dobroDoNumero(n) { return n; }' }],
  output: '✔ dobro de 0 é 0\n✖ dobro de 2 é 4',
  checks: [
    { name: 'dobro de 2 é 4', passed: false },
    { name: 'dobro de 0 é 0', passed: true },
  ],
  passedCount: 1,
  totalCount: 2,
};

describe('challengeNavReducer', () => {
  it('set seleciona o desafio e incrementa a versão', () => {
    const s = challengeNavReducer(initialChallengeNavState, {
      type: 'set',
      challenge: CHALLENGE,
    });
    assert.equal(s.selectedChallenge?.challengeId, 'c1');
    assert.equal(s.version, 1);
  });

  it('clear limpa a seleção e continua incrementando', () => {
    let s = challengeNavReducer(initialChallengeNavState, {
      type: 'set',
      challenge: CHALLENGE,
    });
    s = challengeNavReducer(s, { type: 'clear' });
    assert.equal(s.selectedChallenge, null);
    assert.equal(s.version, 2);
  });

  it('set com null também serve para limpar (versão avança)', () => {
    const s = challengeNavReducer(initialChallengeNavState, {
      type: 'set',
      challenge: null,
    });
    assert.equal(s.selectedChallenge, null);
    assert.equal(s.version, 1);
  });

  it('DEFAULT_CHALLENGE_NAV tem shape estável e no-ops', () => {
    assert.equal(DEFAULT_CHALLENGE_NAV.selectedChallenge, null);
    assert.equal(DEFAULT_CHALLENGE_NAV.version, 0);
    assert.equal(DEFAULT_CHALLENGE_NAV.challengeErrorReport, null);
    assert.doesNotThrow(() => DEFAULT_CHALLENGE_NAV.selectChallenge(CHALLENGE));
    assert.doesNotThrow(() => DEFAULT_CHALLENGE_NAV.navigateToChallenge());
    assert.doesNotThrow(() => DEFAULT_CHALLENGE_NAV.reportChallengeError(ERROR_REPORT));
    assert.doesNotThrow(() => DEFAULT_CHALLENGE_NAV.clearChallengeError());
    assert.doesNotThrow(() => DEFAULT_CHALLENGE_NAV.navigateToLesson());
  });
});

describe('challengeNavReducer — onda2-error-flow (relatório de erro)', () => {
  it('setChallengeError grava o relatório SEM incrementar version (não muda o desafio)', () => {
    const s = challengeNavReducer(initialChallengeNavState, {
      type: 'setChallengeError',
      report: ERROR_REPORT,
    });
    assert.deepEqual(s.challengeErrorReport, ERROR_REPORT);
    assert.equal(s.version, 0);
  });

  it('clearChallengeError zera o relatório e mantém a seleção/versão intactas', () => {
    let s = challengeNavReducer(initialChallengeNavState, { type: 'set', challenge: CHALLENGE });
    s = challengeNavReducer(s, { type: 'setChallengeError', report: ERROR_REPORT });
    s = challengeNavReducer(s, { type: 'clearChallengeError' });
    assert.equal(s.challengeErrorReport, null);
    assert.equal(s.selectedChallenge?.challengeId, 'c1');
    assert.equal(s.version, 1);
  });

  it('reset: o estado inicial já nasce com challengeErrorReport null', () => {
    assert.equal(initialChallengeNavState.challengeErrorReport, null);
    const s = challengeNavReducer(initialChallengeNavState, {
      type: 'setChallengeError',
      report: ERROR_REPORT,
    });
    const reset = challengeNavReducer(s, { type: 'clearChallengeError' });
    assert.equal(reset.challengeErrorReport, null);
    // Equivale a um novo estado inicial (seleção e versão como nasceram).
    assert.deepEqual(reset, initialChallengeNavState);
  });
});