/**
 * tests/draculaTheme.test.ts — paleta Dracula canónica compartilhada entre o
 * editor CodeMirror e o terminal xterm. Sem jsdom (puro). Garante:
 *  - presença das cores oficiais do Dracula (https://draculatheme.com);
 *  - coerência com o tema real do editor (`@uiw/codemirror-theme-dracula`):
 *    background #282a36 e foreground #f8f8f2 batem com o defaultSettingsDracula;
 *  - o mapeamento do terminal aponta para cores Dracula (não one-dark);
 *  - `truecolorForeground` produz SGR 38;2;r;g;b válido (o xterm ignora `#hex`).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DRACULA,
  TERMINAL_DRACULA_COLORS,
  hexToRgb,
  truecolorForeground,
  type TerminalColorName,
} from '../src/lib/draculaTheme';

describe('DRACULA — palette canónica', () => {
  it('tem background and foreground do editor (@uiw/codemirror-theme-dracula)', () => {
    assert.equal(DRACULA.background, '#282a36');
    assert.equal(DRACULA.foreground, '#f8f8f2');
  });

  it('contém as cores oficiais do Dracula (draculatheme.com)', () => {
    assert.equal(DRACULA.comment, '#6272a4');
    assert.equal(DRACULA.cyan, '#8be9fd');
    assert.equal(DRACULA.green, '#50fa7b');
    assert.equal(DRACULA.orange, '#ffb86c');
    assert.equal(DRACULA.pink, '#ff79c6');
    assert.equal(DRACULA.purple, '#bd93f9');
    assert.equal(DRACULA.red, '#ff5555');
    assert.equal(DRACULA.yellow, '#f1fa8c');
  });
});

describe('TERMINAL_DRACULA_COLORS — coerência terminal ⇄ editor', () => {
  it('expõe todos os nomes semânticos aceitos por writeLine', () => {
    const names: TerminalColorName[] = [
      'default',
      'green',
      'red',
      'yellow',
      'accent',
      'muted',
      'cyan',
    ];
    for (const name of names) {
      assert.ok(TERMINAL_DRACULA_COLORS[name], `faltou "${name}"`);
    }
  });

  it('mapeia para cores Dracula canónicas (não one-dark)', () => {
    assert.equal(TERMINAL_DRACULA_COLORS.default, DRACULA.foreground);
    assert.equal(TERMINAL_DRACULA_COLORS.green, DRACULA.green);
    assert.equal(TERMINAL_DRACULA_COLORS.red, DRACULA.red);
    assert.equal(TERMINAL_DRACULA_COLORS.yellow, DRACULA.yellow);
    assert.equal(TERMINAL_DRACULA_COLORS.accent, DRACULA.purple);
    assert.equal(TERMINAL_DRACULA_COLORS.muted, DRACULA.comment);
    assert.equal(TERMINAL_DRACULA_COLORS.cyan, DRACULA.cyan);
  });

  it('nenhum valor é cor de outro esquema (#0f1115/#e6e8ec/#49b36b/#56b6c2)', () => {
    const values = Object.values(TERMINAL_DRACULA_COLORS);
    for (const bad of ['#0f1115', '#e6e8ec', '#49b36b', '#56b6c2', '#e5c07b']) {
      assert.ok(!values.includes(bad), `paleta não pode conter "${bad}" (one-dark/wrong)`);
    }
  });
});

describe('hexToRgb / truecolorForeground — SGR real para o xterm', () => {
  it('decodifica #282a36 em {r,g,b}', () => {
    assert.deepEqual(hexToRgb('#282a36'), { r: 0x28, g: 0x2a, b: 0x36 });
  });

  it('rejeita hex malformada', () => {
    assert.throws(() => hexToRgb('#ff55'), /hex inválida/);
    assert.throws(() => hexToRgb('282a36'), /hex inválida/);
  });

  it('emite truecolor SGR 38;2;r;g;b (não o inválido \\x1b[#hexm)', () => {
    assert.equal(truecolorForeground('#50fa7b'), '\x1b[38;2;80;250;123m');
    assert.equal(truecolorForeground(TERMINAL_DRACULA_COLORS.red), '\x1b[38;2;255;85;85m');
  });
});