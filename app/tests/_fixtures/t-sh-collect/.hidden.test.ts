// Fixture da coleta recursiva do tools/t.sh — dotfile.
// find inclui dotfiles por padrão; a coleta precisa enxergar ESTE arquivo.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('t-sh coletou .hidden.test.ts (dotfile)', () => {
  assert.ok(true);
});
