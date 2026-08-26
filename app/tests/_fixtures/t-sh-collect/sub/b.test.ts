// Fixture da coleta recursiva do tools/t.sh — profundidade 2.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('t-sh coletou sub/b.test.ts (profundidade 2)', () => {
  assert.ok(true);
});
