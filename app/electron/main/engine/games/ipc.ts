/**
 * app/electron/main/engine/games/ipc.ts — HANDLERS IPC do motor de games.
 *
 * ONDA-GAMES (motor). Segue o padrão dos handlers do repositório
 * (`ipc/keys-handlers.ts` / `ipc/track-handlers.ts`):
 *
 *   - `buildGamesHandlers(deps)` — função PURA: `Map<canal, handler>` sem
 *     tocar electron (testável com deps fake);
 *   - `registerGamesHandlers(deps, ipc?)` — entry real: `safeHandleMap`
 *     (idempotente — substitui placeholder se existir); o `ipcMain` real é
 *     importado LAZY quando não injetado.
 *
 * CONTRATO DO RENDERER (para a UI — os três canais do grupo `games`):
 *
 *   getApi().games.listWorlds()                    → GameWorldSummary[]
 *   getApi().games.loadLevel(worldId, levelId, lang) → GameLevelPayload
 *   getApi().games.run(worldId, levelId, lang, code) → GameRunResult
 *
 * `games:run` grava a TENTATIVA sempre (ok ou não) e conclui o nível quando
 * `ok` — o `GameRunResult` sai já com `best`/`histogram`/`completed`
 * calculados sobre o progresso atualizado (é o contrato travado).
 *
 * Localização por decisão do brief: `engine/games/` (junto do motor). A
 * dependência em `ipc/safeHandle` é só o registo idempotente — a lógica toda
 * é dos módulos do motor (`worlds`/`runner`/`progress`).
 */

import { GAMES_CHANNELS } from '@shared/ipc-contract';

import type {
  GameLang,
  GameLevelPayload,
  GameRunResult,
  GameWorldSummary,
} from '../../../../src/types/games';
import { safeHandleMap, type IpcHandlerFn, type IpcMainHandleLike } from '../../ipc/safeHandle';
import { histogramFor, type GamesProgressStore } from './progress';
import { runGameCases } from './runner';
import { loadGameLevel, loadGameLevelPayload, listGameWorlds } from './worlds';

/** As linguagens do contrato de game (validação de argumento do renderer). */
const GAME_LANGS: readonly GameLang[] = ['c', 'python', 'rust'];

/** Type guard do token de linguagem (fail-closed: desconhecido rejeita). */
export function isGameLang(value: unknown): value is GameLang {
  return typeof value === 'string' && (GAME_LANGS as readonly string[]).includes(value);
}

function exigirString(value: unknown, nome: string): string {
  if (typeof value !== 'string' || value === '') {
    throw new Error(`games: argumento '${nome}' inválido — esperava string não vazia`);
  }
  return value;
}

export interface GamesHandlerDeps {
  /** `resources/games` (o wiring passa `resolveGamesDir(...)`). */
  getGamesDir(): string;
  /** store de progresso (userData) — lazy/DI. */
  getProgressStore(): GamesProgressStore | Promise<GamesProgressStore>;
  /** runner injetável (testes). Default: `runGameCases` real. */
  runCases?: typeof runGameCases;
}

/** Monta o mapa canal→handler dos canais `games:*` (PURA — sem electron). */
export function buildGamesHandlers(deps: GamesHandlerDeps): Map<string, IpcHandlerFn> {
  const map: Map<string, IpcHandlerFn> = new Map();

  // games:list-worlds → mundos + progresso do aluno (mapa do mundo).
  map.set(GAMES_CHANNELS.LIST_WORLDS, async (): Promise<GameWorldSummary[]> => {
    const store = await deps.getProgressStore();
    const progress = await store.load();
    return listGameWorlds(deps.getGamesDir(), progress);
  });

  // games:load-level → payload de JOGO sem spoilers (sem hidden/reference).
  map.set(
    GAMES_CHANNELS.LOAD_LEVEL,
    async (_event, worldId, levelId, lang): Promise<GameLevelPayload> => {
      const id = exigirString(worldId, 'worldId');
      const level = exigirString(levelId, 'levelId');
      if (!isGameLang(lang)) {
        throw new Error(`games: argumento 'lang' inválido — esperava ${GAME_LANGS.join(' | ')}`);
      }
      return loadGameLevelPayload(deps.getGamesDir(), id, level, lang);
    },
  );

  // games:run → corre os casos, GRAVA a tentativa, devolve GameRunResult.
  map.set(
    GAMES_CHANNELS.RUN,
    async (_event, worldId, levelId, lang, code): Promise<GameRunResult> => {
      const id = exigirString(worldId, 'worldId');
      const level = exigirString(levelId, 'levelId');
      if (!isGameLang(lang)) {
        throw new Error(`games: argumento 'lang' inválido — esperava ${GAME_LANGS.join(' | ')}`);
      }
      const codigo = exigirString(code, 'code');
      const runCases = deps.runCases ?? runGameCases;

      // Conteúdo primeiro (fail-closed: nível inválido/ausente NUNCA corre).
      const levelContent = await loadGameLevel(deps.getGamesDir(), id, level);
      const run = await runCases(levelContent, lang, codigo);

      // A tentativa conta SEMPRE (ok ou não) — o histograma é da distribuição
      // do aluno; records e conclusão só em `ok` (regras de progress.ts).
      const store = await deps.getProgressStore();
      const recorded = await store.recordAttempt(
        id,
        level,
        { lines: run.metrics.lines, timeMs: run.metrics.timeMs },
        run.ok,
        { par: levelContent.optimize.lines.par },
      );
      const history = recorded.progress.worlds[id]?.[level]?.history ?? [];

      return {
        ok: run.ok,
        cases: run.cases,
        metrics: run.metrics,
        best: recorded.best,
        histogram: histogramFor(history, run.metrics.lines, levelContent.optimize.lines.par),
        completed: recorded.completed,
      };
    },
  );

  return map;
}

/** Registra os handlers reais (safeHandle — idempotente com placeholders). */
export async function registerGamesHandlers(
  deps: GamesHandlerDeps,
  ipc?: IpcMainHandleLike,
): Promise<void> {
  const map = buildGamesHandlers(deps);
  if (ipc) {
    safeHandleMap(ipc, map);
    return;
  }
  const { ipcMain } = await import('electron');
  safeHandleMap(ipcMain as unknown as IpcMainHandleLike, map);
}
