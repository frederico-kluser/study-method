/**
 * tests/terminalBuffer.test.ts — o BUFFER de linhas impressas do terminal de
 * saída (lógica pura extraída de `components/terminal/AnswerTerminal.tsx`).
 * Sem jsdom, sem xterm: `src/lib/terminalBuffer.ts` sobre a paleta real de
 * `src/lib/codeTheme.ts`.
 *
 * O que se prova é a decisão da "armadilha 3" do componente: cada linha é
 * guardada pelo NOME SEMÂNTICO da cor e RE-RESOLVIDA quando o esquema muda
 * (o scrollback do xterm guarda o SGR antigo — reimprimir é a única forma de
 * trocar o tema sem destruir o resultado que o utilizador está a ver).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearTerminalBuffer,
  formatTerminalLine,
  pushTerminalLine,
  replayTerminalLines,
  TERMINAL_SCROLLBACK_LINES,
  type TerminalBufferLine,
} from '../src/lib/terminalBuffer';
import { terminalColors, truecolorForeground } from '../src/lib/codeTheme';

const LIGHT = terminalColors('light');
const DARK = terminalColors('dark');

describe('pushTerminalLine', () => {
  it('acrescenta com cor default e guarda o NOME (não o hex)', () => {
    const buf: TerminalBufferLine[] = [];
    pushTerminalLine(buf, 'PASSOU');
    assert.deepEqual(buf, [{ text: 'PASSOU', color: 'default' }]);
  });

  it('acrescenta na ordem com a cor semântica pedida', () => {
    const buf: TerminalBufferLine[] = [];
    pushTerminalLine(buf, 'a', 'muted');
    pushTerminalLine(buf, 'b', 'green');
    assert.deepEqual(buf.map((l) => l.color), ['muted', 'green']);
  });

  it('descarta pela frente quando passa do teto (memória limitada)', () => {
    const buf: TerminalBufferLine[] = [];
    for (let i = 0; i < 5; i++) pushTerminalLine(buf, `l${i}`, 'default', 3);
    assert.deepEqual(buf.map((l) => l.text), ['l2', 'l3', 'l4']);
    assert.equal(buf.length, 3);
  });

  it('nunca cresce além do teto do scrollback', () => {
    const buf: TerminalBufferLine[] = [];
    for (let i = 0; i < TERMINAL_SCROLLBACK_LINES + 10; i++) {
      pushTerminalLine(buf, `l${i}`);
    }
    assert.equal(buf.length, TERMINAL_SCROLLBACK_LINES);
    assert.equal(buf[buf.length - 1].text, `l${TERMINAL_SCROLLBACK_LINES + 9}`);
    assert.equal(buf[0].text, 'l10');
  });
});

describe('clearTerminalBuffer', () => {
  it('esvazia o buffer (histórico de repintura incluído)', () => {
    const buf: TerminalBufferLine[] = [];
    pushTerminalLine(buf, 'x', 'red');
    clearTerminalBuffer(buf);
    assert.equal(buf.length, 0);
  });
});

describe('formatTerminalLine', () => {
  it('envolve o texto no truecolor da paleta + reset', () => {
    const line: TerminalBufferLine = { text: 'boom', color: 'red' };
    const out = formatTerminalLine(line, LIGHT);
    assert.ok(out.startsWith(truecolorForeground(LIGHT.red)), 'começa pelo SGR da cor');
    assert.ok(out.endsWith('\x1b[0m'), 'termina no reset');
    assert.ok(out.includes('boom'), 'carrega o texto');
  });

  it('resolve o MESMO nome de cor contra paletas diferentes (armadilha 3)', () => {
    const line: TerminalBufferLine = { text: 'PASSOU', color: 'green' };
    const inLight = formatTerminalLine(line, LIGHT);
    const inDark = formatTerminalLine(line, DARK);
    assert.notEqual(inLight, inDark, 'o hex muda com o esquema; o NOME guardado não');
    assert.ok(inLight.startsWith(truecolorForeground(LIGHT.green)));
    assert.ok(inDark.startsWith(truecolorForeground(DARK.green)));
  });
});

describe('replayTerminalLines', () => {
  it('reimprime o buffer inteiro, na ordem, contra a paleta nova', () => {
    const buf: TerminalBufferLine[] = [];
    pushTerminalLine(buf, 'um', 'muted');
    pushTerminalLine(buf, 'dois', 'green');
    const replayed = replayTerminalLines(buf, DARK);
    assert.deepEqual(replayed, [
      formatTerminalLine({ text: 'um', color: 'muted' }, DARK),
      formatTerminalLine({ text: 'dois', color: 'green' }, DARK),
    ]);
    assert.equal(replayed.length, 2);
  });

  it('buffer vazio não devolve linhas (o efeito é um no-op)', () => {
    assert.deepEqual(replayTerminalLines([], LIGHT), []);
  });
});
