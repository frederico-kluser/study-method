/**
 * tests/terminalBanner.test.ts — buildTestBannerLines (lógica pura do banner
 * PASS/FAIL do terminal).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildTestBannerLines } from '../src/lib/terminalBanner';

describe('buildTestBannerLines', () => {
  it('banner de PASS com contagens e saída real', () => {
    const lines = buildTestBannerLines({
      passed: true,
      testsRun: 3,
      expectedTests: 3,
      output: 'ok\nok\nok\n',
    });
    assert.equal(lines[0].text, '=== TESTES (fase determinística) ===');
    assert.equal(lines[0].color, 'muted');
    assert.equal(lines[1].text, 'PASSOU');
    assert.equal(lines[1].color, 'green');
    assert.equal(lines[2].text, 'TESTS_RUN=3 ESPERADOS=3');
    assert.equal(lines[2].color, 'muted');
    // saída real entra linha a linha
    assert.ok(lines.some((l) => l.text === 'ok' && l.color === 'default'));
  });

  it('banner de FAIL usa vermelho', () => {
    const lines = buildTestBannerLines({
      passed: false,
      testsRun: 1,
      expectedTests: 2,
      output: 'boom',
    });
    assert.equal(lines[1].text, 'NÃO PASSOU');
    assert.equal(lines[1].color, 'red');
  });

  it('desserta as linhas de saída vazias ignorando trailing whitespace', () => {
    const lines = buildTestBannerLines({
      passed: true,
      testsRun: 1,
      expectedTests: 1,
      output: '   \n  ',
    });
    // saída em branco → sem as linhas de saída default; sem regra separadora extra.
    const defaultLines = lines.filter((l) => l.color === 'default');
    assert.equal(defaultLines.length, 0);
  });

  it('termina com a regra de fechamento', () => {
    const lines = buildTestBannerLines({
      passed: true,
      testsRun: 0,
      expectedTests: 0,
      output: '',
    });
    assert.equal(lines[lines.length - 1].text, '==========================================');
    assert.equal(lines[lines.length - 1].color, 'muted');
  });
});