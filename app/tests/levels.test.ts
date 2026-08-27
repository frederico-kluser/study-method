/**
 * tests/levels.test.ts — níveis de dificuldade da trilha (onda2-trilha).
 *
 * Cobre `difficultyToLevel`, `LEVEL_ORDER`, `levelI18nKey`, `levelIndex` e
 * `levelLessThan` de src/lib/levels, SEM jsdom (node:test).
 *
 * Contratos que mordem:
 *   1. difficulty 1–2 → 'beginner'; 3 → 'intermediate'; 4–5 → 'advanced'.
 *   2. Ausente/undefined/null/NaN/fora de 1..5 → 'beginner' (piso conservador
 *      — o renderer compila sem strict e o DTO vem por IPC).
 *   3. LEVEL_ORDER é exatamente ['beginner','intermediate','advanced'].
 *   4. levelI18nKey devolve as chaves 'trilha.levels.*' (paridade i18n é
 *      coberta pelo i18n-resources.test.ts; aqui só o mapeamento literal).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  difficultyToLevel,
  levelI18nKey,
  levelIndex,
  levelLessThan,
  LEVEL_ORDER,
  type DifficultyLevel,
} from '../src/lib/levels';

describe('difficultyToLevel', () => {
  it('mapeia 1–2 → beginner', () => {
    assert.equal(difficultyToLevel(1), 'beginner');
    assert.equal(difficultyToLevel(2), 'beginner');
  });

  it('mapeia 3 → intermediate', () => {
    assert.equal(difficultyToLevel(3), 'intermediate');
  });

  it('mapeia 4–5 → advanced', () => {
    assert.equal(difficultyToLevel(4), 'advanced');
    assert.equal(difficultyToLevel(5), 'advanced');
  });

  it('ausente/undefined/null/NaN → beginner (piso conservador)', () => {
    assert.equal(difficultyToLevel(undefined), 'beginner');
    assert.equal(difficultyToLevel(null), 'beginner');
    assert.equal(difficultyToLevel(Number.NaN), 'beginner');
  });

  it('fora do intervalo 1..5 → beginner (nunca derruba a UI)', () => {
    assert.equal(difficultyToLevel(0), 'beginner');
    assert.equal(difficultyToLevel(-1), 'beginner');
    assert.equal(difficultyToLevel(6), 'beginner');
    assert.equal(difficultyToLevel(999), 'beginner');
    assert.equal(difficultyToLevel(Number.POSITIVE_INFINITY), 'beginner');
  });
});

describe('LEVEL_ORDER', () => {
  it('é exatamente Iniciante → Intermediário → Avançado', () => {
    assert.deepEqual(LEVEL_ORDER, ['beginner', 'intermediate', 'advanced']);
  });

  it('não tem níveis duplicados (cada seção é única)', () => {
    assert.equal(new Set(LEVEL_ORDER).size, LEVEL_ORDER.length);
  });
});

describe('levelIndex / levelLessThan', () => {
  it('levelIndex segue a ordem canônica (0,1,2)', () => {
    assert.equal(levelIndex('beginner'), 0);
    assert.equal(levelIndex('intermediate'), 1);
    assert.equal(levelIndex('advanced'), 2);
  });

  it('levelLessThan compara pela ordem de exibição', () => {
    assert.equal(levelLessThan('beginner', 'intermediate'), true);
    assert.equal(levelLessThan('beginner', 'advanced'), true);
    assert.equal(levelLessThan('intermediate', 'advanced'), true);
    assert.equal(levelLessThan('advanced', 'beginner'), false);
    assert.equal(levelLessThan('intermediate', 'intermediate'), false);
  });
});

describe('levelI18nKey', () => {
  it('devolve as chaves trilha.levels.* (sem namespace)', () => {
    assert.equal(levelI18nKey('beginner'), 'trilha.levels.beginner');
    assert.equal(levelI18nKey('intermediate'), 'trilha.levels.intermediate');
    assert.equal(levelI18nKey('advanced'), 'trilha.levels.advanced');
  });

  it('cobre todos os níveis de LEVEL_ORDER (totalidade)', () => {
    const keys = LEVEL_ORDER.map(levelI18nKey);
    assert.equal(new Set(keys).size, LEVEL_ORDER.length);
    for (const k of keys) {
      assert.match(k, /^trilha\.levels\./);
    }
  });

  it('os tipos combinam: levelI18nKey(difficultyToLevel(n)) compila e resolve', () => {
    for (const n of [1, 2, 3, 4, 5]) {
      const level: DifficultyLevel = difficultyToLevel(n);
      assert.ok(typeof levelI18nKey(level) === 'string');
    }
  });
});
