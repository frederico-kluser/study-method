/**
 * tests/gamesSelection.test.ts — a SELEÇÃO de mundo/nível da secção Games
 * (`src/views/GamesView/gamesSelection.ts`), extraída do contentor `GamesView`
 * para lógica pura (STORY-SPEC §5).
 *
 * O que prova:
 *   1. `focusLevelOf` — o nível em foco do mapa (o cartão + o payload
 *      pré-carregado): primeiro não concluído; mundo concluído → ÚLTIMO
 *      (repetição permitida); mundo sem níveis → null.
 *   2. `buildLevelPick` — a seleção que alimenta a GameLevelView: índice
 *      1-based, chefe e o id do nível seguinte (null no fim do mundo).
 *   3. `advanceLevelPick` — "Avançar ›" dentro do MESMO mundo; id desconhecido
 *      devolve a seleção intocada (o estado atual nunca se perde).
 *
 * Sem jsdom (node:test + tsx), sem React: só dados do contrato
 * (`src/types/games.ts`).
 *
 * Reprodução: `cd app && bash tools/t.sh tests/gamesSelection.test.ts`
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  advanceLevelPick,
  buildLevelPick,
  focusLevelOf,
  type LevelPick,
} from '../src/views/GamesView/gamesSelection';
import type {
  GameLevelSummary,
  GameWorldSummary,
} from '../src/types/games';

/* ─── Fixtures do contrato ────────────────────────────────────────────────── */

function level(over: Partial<GameLevelSummary> & { id: string }): GameLevelSummary {
  return {
    title: `Nível ${over.id}`,
    boss: false,
    completed: false,
    ...over,
  };
}

function world(over: Partial<GameWorldSummary> & { id: string }): GameWorldSummary {
  return {
    title: `Mundo ${over.id}`,
    description: 'Descrição do mundo',
    levels: [],
    ...over,
  };
}

const mundo: GameWorldSummary = world({
  id: 'mundo-1',
  title: 'O robô do depósito',
  levels: [
    level({ id: 'n1', completed: true, bestLines: 4, bestTimeMs: 320 }),
    level({ id: 'n2', completed: true }),
    level({ id: 'n3', title: 'Nível 3' }),
    level({ id: 'n4' }),
    level({ id: 'chefe', boss: true, title: 'O chefe' }),
  ],
});

/* ─── 1. focusLevelOf ─────────────────────────────────────────────────────── */

describe('focusLevelOf', () => {
  it('mundo com progresso parcial → o primeiro NÃO concluído', () => {
    const focus = focusLevelOf(mundo);
    assert.ok(focus);
    assert.equal(focus.level.id, 'n3');
    assert.equal(focus.index, 2);
  });

  it('mundo sem progresso → o primeiro nível', () => {
    const fresh = world({ id: 'mundo-2', levels: [level({ id: 'a' }), level({ id: 'b' })] });
    assert.equal(focusLevelOf(fresh)?.level.id, 'a');
    assert.equal(focusLevelOf(fresh)?.index, 0);
  });

  it('mundo inteiramente concluído → o ÚLTIMO (repetição é permitida)', () => {
    const done = world({
      id: 'mundo-3',
      levels: [level({ id: 'a', completed: true }), level({ id: 'chefe', boss: true, completed: true })],
    });
    assert.equal(focusLevelOf(done)?.level.id, 'chefe');
    assert.equal(focusLevelOf(done)?.index, 1);
  });

  it('mundo sem níveis → null', () => {
    assert.equal(focusLevelOf(world({ id: 'vazio' })), null);
  });
});

/* ─── 2. buildLevelPick ───────────────────────────────────────────────────── */

describe('buildLevelPick', () => {
  it('constrói a seleção com índice 1-based, chefe e próximo nível', () => {
    const n3 = mundo.levels[2]!;
    const pick = buildLevelPick(mundo, n3, 2);
    assert.deepEqual(pick, {
      worldId: 'mundo-1',
      worldTitle: 'O robô do depósito',
      levelId: 'n3',
      levelTitle: 'Nível 3',
      levelIndex: 3,
      boss: false,
      nextLevelId: 'n4',
    });
  });

  it('o chefe é o último nó: nextLevelId é null (sem "Avançar ›")', () => {
    const chefe = mundo.levels[4]!;
    const pick = buildLevelPick(mundo, chefe, 4);
    assert.equal(pick.boss, true);
    assert.equal(pick.nextLevelId, null);
    assert.equal(pick.levelIndex, 5);
  });
});

/* ─── 3. advanceLevelPick ─────────────────────────────────────────────────── */

describe('advanceLevelPick', () => {
  const atual: LevelPick = buildLevelPick(mundo, mundo.levels[2]!, 2);

  it('"Avançar ›" segue para o nível seguinte do MESMO mundo', () => {
    const next = advanceLevelPick([mundo], atual, 'n4');
    assert.equal(next.levelId, 'n4');
    assert.equal(next.levelIndex, 4);
    assert.equal(next.nextLevelId, 'chefe');
    assert.equal(next.worldId, 'mundo-1');
  });

  it('avançar até ao chefe mantém o mundo e esconde o avanço seguinte', () => {
    const next = advanceLevelPick([mundo], advanceLevelPick([mundo], atual, 'n4'), 'chefe');
    assert.equal(next.levelId, 'chefe');
    assert.equal(next.boss, true);
    assert.equal(next.nextLevelId, null);
  });

  it('id desconhecido → devolve a seleção EXATAMENTE igual (identidade preservada)', () => {
    assert.equal(advanceLevelPick([mundo], atual, 'nao-existe'), atual);
  });

  it('mundo divergente (seleção de outro mundo) → seleção intocada', () => {
    const outro = world({ id: 'mundo-9', levels: [level({ id: 'x' })] });
    assert.equal(advanceLevelPick([outro], atual, 'x'), atual);
  });

  it('lista de mundos vazia → seleção intocada', () => {
    assert.equal(advanceLevelPick([], atual, 'n4'), atual);
  });
});
