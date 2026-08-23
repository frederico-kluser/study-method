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
import type { ChallengeInfo } from '../shared/ipc-contract';

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
    assert.doesNotThrow(() => DEFAULT_CHALLENGE_NAV.selectChallenge(CHALLENGE));
    assert.doesNotThrow(() => DEFAULT_CHALLENGE_NAV.navigateToChallenge());
  });
});