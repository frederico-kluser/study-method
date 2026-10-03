/**
 * app/src/views/GamesView/gamesSelection.ts — SELEÇÃO de mundo/nível da secção
 * Games, em lógica PURA (sem React, sem DOM, sem IPC).
 *
 * ONDA-GAMES + onda Storybook (contrato state/view, STORY-SPEC §5): a
 * `GamesView` misturava a aritmética da seleção com o contentor React — o
 * "Jogar nível N", o "Avançar ›" e a escolha de QUE nível pré-carregar (o
 * cartão do mapa) eram `useCallback`/efeitos com a conta embutida. Aqui mora o
 * estado; a view só despacha. O que os testes node:test mordem é este módulo
 * (`tests/gamesSelection.test.ts`), o mesmo critério de `gamesUi.ts`.
 *
 * ─── REGRAS TRAVADAS AQUI ──────────────────────────────────────────────────
 *  1. `LevelPick` — o "estado de ecrã" da seleção: o mundo + nível escolhidos
 *     no mapa alimentam a `GameLevelView` (título estável, índice 1-based,
 *     chefe, e o id do nível seguinte para "Avançar ›").
 *  2. NÍVEL EM FOCO (`focusLevelOf`) — o nível que o cartão do mapa mostra e
 *     cujo payload o mapa pré-carrega: o PRIMEIRO não concluído ("o que o
 *     aluno pode jogar agora"); num mundo inteiramente concluído cai no
 *     ÚLTIMO (a repetição é permitida — "Jogar nível N" continua vivo para
 *     quem quer otimizar). Era a mesma conta escrita em DOIS sítios da
 *     GamesView (efeito de preview) + GamesMap (índice do cartão).
 *  3. `advanceLevelPick` — "Avançar ›" salta para o próximo nível do MESMO
 *     mundo, mantendo a tela de nível; id desconhecido devolve a seleção
 *     intocada (nunca perde o estado atual por um avanço malformado).
 */
import type {
  GameLevelSummary,
  GameWorldSummary,
} from '../../types/games';
import { firstOpenLevelIndex, nextLevelId } from './gamesUi';

/** O nível escolhido no mapa (alimenta a GameLevelView). */
export interface LevelPick {
  worldId: string;
  worldTitle: string;
  levelId: string;
  levelTitle: string;
  /** Número do nível, 1-based ("Jogar nível 3"). */
  levelIndex: number;
  boss: boolean;
  /** id do nível seguinte, ou null no fim do mundo (esconde "Avançar ›"). */
  nextLevelId: string | null;
}

/**
 * O nível em foco de um mundo (regra 2): o primeiro não concluído, ou o
 * último quando o mundo está inteiramente concluído. Mundo sem níveis → null.
 */
export function focusLevelOf(world: GameWorldSummary): {
  level: GameLevelSummary;
  index: number;
} | null {
  if (world.levels.length === 0) return null;
  const openIndex = firstOpenLevelIndex(world.levels);
  const index = openIndex >= 0 ? openIndex : world.levels.length - 1;
  const level = world.levels[index];
  return level ? { level, index } : null;
}

/** Constrói a seleção de nível (o payload da GameLevelView) a partir do mapa. */
export function buildLevelPick(
  world: GameWorldSummary,
  level: GameLevelSummary,
  index: number,
): LevelPick {
  return {
    worldId: world.id,
    worldTitle: world.title,
    levelId: level.id,
    levelTitle: level.title,
    levelIndex: index + 1,
    boss: level.boss,
    nextLevelId: nextLevelId(world.levels, index),
  };
}

/**
 * "Avançar ›": a seleção seguinte dentro do MESMO mundo. `nextId` desconhecido
 * (ou mundo divergente) → devolve `current` intocado.
 */
export function advanceLevelPick(
  worlds: readonly GameWorldSummary[],
  current: LevelPick,
  nextId: string,
): LevelPick {
  const world = worlds.find((w) => w.id === current.worldId);
  const index = world?.levels.findIndex((l) => l.id === nextId) ?? -1;
  const level = index >= 0 ? world?.levels[index] : undefined;
  if (!world || !level) return current;
  return buildLevelPick(world, level, index);
}
