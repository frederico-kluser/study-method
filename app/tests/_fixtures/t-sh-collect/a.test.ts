// Fixture da coleta recursiva do tools/t.sh — profundidade 1.
// NÃO é um teste de verdade: só marca que o t.sh encontrou e executou este
// arquivo (a regressão da Onda 1 é justamente não perder arquivos em subdirs).
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('t-sh coletou a.test.ts (profundidade 1)', () => {
  assert.ok(true);
});
