/**
 * app/src/views/GamesView/gamesApi.ts — SHIM DE TIPOS da API `games` do
 * renderer (ONDA-GAMES).
 *
 * ─── POR QUE ESTE ARQUIVO EXISTE ───────────────────────────────────────────
 * A UI da secção Games foi construída EM PARALELO com o motor
 * (`app/electron/main/engine/games/*`) e o contrato de tipos está TRAVADO em
 * `src/types/games.ts`. A API chega ao renderer por `getApi().games.*` com
 * exatamente três métodos — `listWorlds()`, `loadLevel(worldId, levelId, lang)`
 * e `run(worldId, levelId, lang, code)` — e este módulo é a ÚNICA porta de
 * acesso da UI a ela (um accessor tipado, nunca o `getApi()` cru nas views).
 *
 * ─── ESTADO ATUAL ──────────────────────────────────────────────────────────
 * O `ApiSchema` do preload (`app/electron/preload/api-schema.ts`) já expõe a
 * fatia `games` (ONDA-GAMES do agente do motor) com os TRÊS membros e os
 * argumentos posicionais que a UI fixou. A asserção de tipos no fim deste
 * arquivo liga o shim ao schema oficial: se um dos lados divergir, o
 * `npm run lint` falha em vez de a UI morrer em runtime.
 *
 * ─── REGRAS ────────────────────────────────────────────────────────────────
 *  - Este shim NÃO implementa nem faz mock de dados: quando `getApi().games`
 *    ainda não existir em runtime (preload antigo, motor em construção),
 *    `getGamesApi()` lança um erro legível que a view mostra no estado de erro
 *    (Alert + retentativa) — honesto, nunca uma tela de mentira.
 *  - Os consumidores usam sempre `await` (via `Promise.resolve(...)`) — o
 *    contrato do orquestrador escreve o tipo de DADO; o canal IPC devolve
 *    Promise. `Promise.resolve` cobre os dois sem casts.
 */
import { getApi } from '../../lib/apiBridge';
import type { ApiSchema } from '../../../electron/preload/api-schema';
import type {
  GameLang,
  GameLevelPayload,
  GameRunResult,
  GameWorldSummary,
} from '../../types/games';

/**
 * A fatia `games` do contrato — os TRÊS métodos, nem mais um. Escrita à mão
 * (e não `ApiSchema['games']`) de propósito: é o contrato que a UI foi feita
 * para consumir, e a asserção no fim do arquivo é que o prende ao schema real.
 */
export interface GamesApiSlice {
  listWorlds(): GameWorldSummary[] | Promise<GameWorldSummary[]>;
  loadLevel(
    worldId: string,
    levelId: string,
    lang: GameLang,
  ): GameLevelPayload | Promise<GameLevelPayload>;
  run(
    worldId: string,
    levelId: string,
    lang: GameLang,
    code: string,
  ): GameRunResult | Promise<GameRunResult>;
}

/**
 * Travão de DRIFT em tempo de compilação: o schema oficial do preload tem de
 * satisfazer o shim da UI. Se o motor mudar um nome/argumento, a UI não
 * apanha o erro às escondidas — o lint falha primeiro.
 */
type AssertGamesApiMatchesSchema = ApiSchema extends { games: GamesApiSlice } ? true : never;
const _SHIM_MATCHES_SCHEMA: AssertGamesApiMatchesSchema = true;
void _SHIM_MATCHES_SCHEMA;

/**
 * Devolve a fatia `games` da API exposta pelo preload.
 *
 * @throws Error legível quando `getApi().games` ainda não existe em runtime —
 * a view apanha e mostra o estado de erro com retentativa.
 */
export function getGamesApi(): GamesApiSlice {
  const slice = (getApi() as unknown as { games?: GamesApiSlice }).games;
  if (!slice) {
    throw new Error(
      'getApi().games ainda não está exposto (motor de games em construção) — tente de novo quando o motor estiver ligado.',
    );
  }
  return slice;
}
