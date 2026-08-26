// Fixture da coleta recursiva do tools/t.sh — profundidade 3.
// O globstar do bash 5 degradaria para 1 nível no bash 3.2; o find precisa
// alcançar ESTE arquivo a 3 níveis de profundidade.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('t-sh coletou sub/sub/c.test.ts (profundidade 3)', () => {
  assert.ok(true);
});
