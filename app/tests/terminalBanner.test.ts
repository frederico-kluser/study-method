/**
 * tests/terminalBanner.test.ts — buildTestBannerLines (lógica pura do banner
 * PASS/FAIL do terminal).
 *
 * Além da composição das linhas, guarda a JUNÇÃO com `lib/codeTheme`: toda cor
 * que o banner emite tem que ser resolvível pela paleta de código NAS DUAS
 * polaridades. Enquanto `TerminalBannerColor` era uma união copiada à mão de
 * `draculaTheme.ts`, acrescentar um nome aqui e esquecê-lo lá compilava e
 * quebrava só em runtime, num terminal, no esquema que ninguém testou.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildTestBannerLines } from '../src/lib/terminalBanner';
import { TERMINAL_COLOR_NAMES, terminalColors } from '../src/lib/codeTheme';

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

describe('banner ⇄ paleta de código — mesma fonte de verdade', () => {
  it('toda cor emitida pelo banner existe nas DUAS polaridades', () => {
    const lines = [
      ...buildTestBannerLines({ passed: true, testsRun: 2, expectedTests: 2, output: 'ok' }),
      ...buildTestBannerLines({ passed: false, testsRun: 1, expectedTests: 2, output: 'boom' }),
    ];
    assert.ok(lines.length > 0, 'o banner não pode ser vazio');
    for (const scheme of ['light', 'dark'] as const) {
      const colors = terminalColors(scheme);
      for (const line of lines) {
        assert.match(
          colors[line.color] ?? '',
          /^#[0-9a-f]{6}$/,
          `cor "${line.color}" não resolve no esquema ${scheme}`,
        );
      }
    }
  });

  it('o banner não inventa nome fora do contrato de writeLine', () => {
    const emitted = new Set(
      buildTestBannerLines({ passed: false, testsRun: 0, expectedTests: 1, output: 'x' }).map(
        (l) => l.color,
      ),
    );
    for (const name of emitted) {
      assert.ok(
        (TERMINAL_COLOR_NAMES as readonly string[]).includes(name),
        `"${name}" não está em TERMINAL_COLOR_NAMES`,
      );
    }
  });

  it('as duas polaridades pintam o mesmo papel com hex DIFERENTES', () => {
    const light = terminalColors('light');
    const dark = terminalColors('dark');
    for (const name of TERMINAL_COLOR_NAMES) {
      assert.notEqual(
        light[name],
        dark[name],
        `"${name}" tem o mesmo hex nos dois esquemas — polaridade única de novo?`,
      );
    }
  });
});
