/**
 * tests/terminalBanner.test.ts — buildTestBannerLines (lógica pura do banner
 * PASS/FAIL do terminal).
 *
 * Além da composição das linhas, guarda a JUNÇÃO com `lib/codeTheme`: toda cor
 * que o banner emite tem que ser resolvível pela paleta de código NAS DUAS
 * polaridades. Enquanto `TerminalBannerColor` era uma união copiada à mão de
 * `draculaTheme.ts`, acrescentar um nome aqui e esquecê-lo lá compilava e
 * quebrava só em runtime, num terminal, no esquema que ninguém testou.
 *
 * S4 (auditoria de UX): os TEXTOS do banner deixaram de viver neste módulo —
 * chegam TRADUZIDOS por argumento (`TerminalBannerLabels`, quem chama tem
 * `t()`). Os testes provam o PASS-THROUGH dos labels e a estrutura (ordem,
 * cores, saída linha a linha); a copy em si vive nos locales (paridade por
 * tests/i18n-resources.test.ts).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildTestBannerLines, type TerminalBannerLabels } from '../src/lib/terminalBanner';
import { TERMINAL_COLOR_NAMES, terminalColors } from '../src/lib/codeTheme';

/** Labels de teste — sempre os MESMOS para provar que o módulo os usa verbatim. */
function labels(counts: string): TerminalBannerLabels {
  return { title: '=== TESTES ===', passed: 'PASSOU', failed: 'NÃO PASSOU', counts };
}

describe('buildTestBannerLines', () => {
  it('banner de PASS com contagens e saída real', () => {
    const lines = buildTestBannerLines(
      {
        passed: true,
        testsRun: 3,
        expectedTests: 3,
        output: 'ok\nok\nok\n',
      },
      labels('3 de 3 testes'),
    );
    assert.equal(lines[0].text, '=== TESTES ===');
    assert.equal(lines[0].color, 'muted');
    assert.equal(lines[1].text, 'PASSOU');
    assert.equal(lines[1].color, 'green');
    assert.equal(lines[2].text, '3 de 3 testes');
    assert.equal(lines[2].color, 'muted');
    // saída real entra linha a linha
    assert.ok(lines.some((l) => l.text === 'ok' && l.color === 'default'));
  });

  it('banner de FAIL usa vermelho', () => {
    const lines = buildTestBannerLines(
      {
        passed: false,
        testsRun: 1,
        expectedTests: 2,
        output: 'boom',
      },
      labels('1 de 2 testes'),
    );
    assert.equal(lines[1].text, 'NÃO PASSOU');
    assert.equal(lines[1].color, 'red');
  });

  it('os textos vêm TODOS dos labels — o módulo não tem frase própria (S4)', () => {
    const custom: TerminalBannerLabels = {
      title: 'TITLE-XX',
      passed: 'PASS-XX',
      failed: 'FAIL-XX',
      counts: 'COUNTS-XX',
    };
    const pass = buildTestBannerLines(
      { passed: true, testsRun: 1, expectedTests: 1, output: '' },
      custom,
    );
    assert.deepEqual(
      pass.map((l) => l.text),
      ['TITLE-XX', 'PASS-XX', 'COUNTS-XX', '=========================================='],
    );
    const fail = buildTestBannerLines(
      { passed: false, testsRun: 0, expectedTests: 1, output: '' },
      custom,
    );
    assert.equal(fail[1].text, 'FAIL-XX');
  });

  it('desserta as linhas de saída vazias ignorando trailing whitespace', () => {
    const lines = buildTestBannerLines(
      {
        passed: true,
        testsRun: 1,
        expectedTests: 1,
        output: '   \n  ',
      },
      labels('1 de 1 testes'),
    );
    // saída em branco → sem as linhas de saída default; sem regra separadora extra.
    const defaultLines = lines.filter((l) => l.color === 'default');
    assert.equal(defaultLines.length, 0);
  });

  it('termina com a regra de fechamento', () => {
    const lines = buildTestBannerLines(
      {
        passed: true,
        testsRun: 0,
        expectedTests: 0,
        output: '',
      },
      labels('0 de 0 testes'),
    );
    assert.equal(lines[lines.length - 1].text, '==========================================');
    assert.equal(lines[lines.length - 1].color, 'muted');
  });
});

describe('banner ⇄ paleta de código — mesma fonte de verdade', () => {
  it('toda cor emitida pelo banner existe nas DUAS polaridades', () => {
    const lines = [
      ...buildTestBannerLines(
        { passed: true, testsRun: 2, expectedTests: 2, output: 'ok' },
        labels('2 de 2 testes'),
      ),
      ...buildTestBannerLines(
        { passed: false, testsRun: 1, expectedTests: 2, output: 'boom' },
        labels('1 de 2 testes'),
      ),
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
      buildTestBannerLines(
        { passed: false, testsRun: 0, expectedTests: 1, output: 'x' },
        labels('0 de 1 testes'),
      ).map((l) => l.color),
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
