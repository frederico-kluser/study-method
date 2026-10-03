/**
 * app/electron/main/engine/games/worlds.ts — LOADER do conteúdo de games em
 * `app/resources/games/<world>/`.
 *
 * ONDA-GAMES (motor). Segue o MESMO mecanismo de paths de `resources/tracks`:
 * `resolveResourcesDir` (`services/resourcesDir.ts`, cadeia de candidatos que
 * sobrevive ao entry `electron out/main/index.js`) + subdiretório `games`.
 * `resourcesDir.resolveTracksDir` é exatamente este shape para `tracks`.
 *
 * LAYOUT EM DISCO (tolerante por decisão — ver abaixo):
 *
 *   app/resources/games/
 *     <mundo>/
 *       world.json          { id, title, description, levels?: [ids ordenados] }
 *       <qualquer>/…*.json  UM NÍVEL por ficheiro (contrato GameLevelSchema):
 *                           <mundo>/l1.json · <mundo>/levels/l1.json ·
 *                           <mundo>/l1/level.json — todos válidos. O loader
 *                           descobre `*.json` recursivamente (exceto o
 *                           world.json da raiz do mundo).
 *
 * ─── ASSIMETRIA DE ESTRICTIDÃO, E PORQUÊ ──────────────────────────────────
 *   - LISTAR (`listGameWorlds`) é TOLERANTE por mundo/nível: um ficheiro
 *     malformado é saltado com diagnóstico no console — um conteúdo quebrado
 *     de um agente de autoria não pode derrubar a secção Games inteira. O
 *     diagnóstico é público (nunca silencioso) e o nível quebrado simplesmente
 *     não aparece (não é prometido à UI).
 *   - JULGAR (`loadGameLevel`/`loadGameLevelPayload`) é FAIL-CLOSED: nível
 *     ausente ou inválido LANÇA `GameContentError`. Um veredito de execução
 *     nunca nasce de conteúdo não validado.
 *
 * Os summaries carregam o PROGRESSO (completed/bestLines/bestTimeMs) porque é
 * o que o mapa do mundo mostra — a fonte do progresso é `progress.ts`.
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import type {
  GameLang,
  GameLevelPayload,
  GameProgress,
  GameWorldSummary,
} from '../../../../src/types/games';
import { resolveResourcesDir, type ResourcesDirInput } from '../../services/resourcesDir';
import {
  GameContentError,
  parseGameLevel,
  parseGameWorld,
  type GameLevelContent,
  type GameWorldContent,
} from './schema';

/** Diretório de games: `resources/games` (espelho de `resolveTracksDir`). */
export function resolveGamesDir(input: ResourcesDirInput): string {
  return path.join(resolveResourcesDir(input), 'games');
}

/** O mundo carregado: metadados + níveis validados, já ordenados. */
export interface LoadedWorld {
  dir: string;
  world: GameWorldContent;
  /** níveis na ordem canónica (`world.levels` quando presente). */
  levels: GameLevelContent[];
}

/** Entra em `dir` e devolve todos os `*.json` (ordenados, recursivo). */
async function collectJsonFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collectJsonFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      out.push(full);
    }
  }
  return out.sort();
}

/** O `world.json` da raiz do mundo, se existir. */
async function readWorldJson(dir: string): Promise<GameWorldContent | null> {
  const file = path.join(dir, 'world.json');
  try {
    const raw = JSON.parse(await fs.readFile(file, 'utf8')) as unknown;
    return parseGameWorld(raw, file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/** Ordena os níveis pela ordem canónica de `world.levels` (resto: por id). */
function ordenarNiveis(world: GameWorldContent, levels: GameLevelContent[]): GameLevelContent[] {
  const ordem = new Map(world.levels.map((id, i) => [id, i]));
  return [...levels].sort((a, b) => {
    const pa = ordem.get(a.id);
    const pb = ordem.get(b.id);
    if (pa !== undefined && pb !== undefined) return pa - pb;
    if (pa !== undefined) return -1; // declarado primeiro
    if (pb !== undefined) return 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Carrega UM mundo do disco (fail-closed: mundo inválido LANÇA).
 * Descoberta de níveis tolerante: ficheiro que não valida é saltado com
 * diagnóstico — a listagem não mente (o nível não aparece) e não se vinga.
 */
export async function loadWorld(dir: string): Promise<LoadedWorld> {
  const world = await readWorldJson(dir);
  if (world === null) {
    throw new GameContentError(path.join(dir, 'world.json'), 'ficheiro ausente');
  }
  const files = await collectJsonFiles(dir);
  const levels: GameLevelContent[] = [];
  for (const file of files) {
    if (file === path.join(dir, 'world.json')) continue;
    try {
      const raw = JSON.parse(await fs.readFile(file, 'utf8')) as unknown;
      levels.push(parseGameLevel(raw, file));
    } catch (err) {
      // TOLERÂNCIA DA LISTAGEM (decisão documentada no cabeçalho): um nível
      // quebrado não derruba o mundo; o diagnóstico aponta o ficheiro.
      console.error(`[games] nível ignorado (${file}): ${String(err)}`);
    }
  }
  return { dir, world, levels: ordenarNiveis(world, levels) };
}

/** Lista os mundos instalados (diretórios com `world.json`). */
export async function listWorldDirs(gamesDir: string): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(gamesDir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => path.join(gamesDir, e.name))
    .sort();
}

/**
 * Encontra o diretório do mundo por id (aceita nome de pasta OU `world.json`
 * com o id — o conteúdo é de outro agente e a convenção de nome de pasta não
 * é garantida).
 */
export async function findWorldDir(gamesDir: string, worldId: string): Promise<string> {
  for (const dir of await listWorldDirs(gamesDir)) {
    if (path.basename(dir) === worldId) return dir;
    try {
      const world = await readWorldJson(dir);
      if (world?.id === worldId) return dir;
    } catch {
      // mundo inválido não candidata (a listagem já o diagnosticou)
    }
  }
  throw new GameContentError(path.join(gamesDir, worldId), 'mundo não encontrado');
}

/**
 * A LISTA de mundos para o mapa (`GameWorldSummary[]`) — conteúdo + progresso.
 * Mundo cujo `world.json` não valida é saltado com diagnóstico (tolerância da
 * listagem).
 */
export async function listGameWorlds(
  gamesDir: string,
  progress: GameProgress,
): Promise<GameWorldSummary[]> {
  const out: GameWorldSummary[] = [];
  for (const dir of await listWorldDirs(gamesDir)) {
    let loaded: LoadedWorld;
    try {
      loaded = await loadWorld(dir);
    } catch (err) {
      console.error(`[games] mundo ignorado (${dir}): ${String(err)}`);
      continue;
    }
    const worldId = loaded.world.id;
    const nivelProgresso = progress.worlds[worldId] ?? {};
    out.push({
      id: worldId,
      title: loaded.world.title,
      description: loaded.world.description,
      levels: loaded.levels.map((level) => {
        const p = nivelProgresso[level.id];
        return {
          id: level.id,
          title: level.title,
          boss: level.boss,
          completed: p?.completedAt !== undefined,
          ...(p?.bestLines !== undefined ? { bestLines: p.bestLines } : {}),
          ...(p?.bestTimeMs !== undefined ? { bestTimeMs: p.bestTimeMs } : {}),
        };
      }),
    });
  }
  return out;
}

/**
 * O nível COMPLETO validado (para o runner). Fail-closed: ausente/inválido
 * LANÇA `GameContentError`.
 */
export async function loadGameLevel(
  gamesDir: string,
  worldId: string,
  levelId: string,
): Promise<GameLevelContent> {
  const dir = await findWorldDir(gamesDir, worldId);
  const loaded = await loadWorld(dir);
  const level = loaded.levels.find((l) => l.id === levelId);
  if (level === undefined) {
    throw new GameContentError(path.join(dir, `${levelId}.json`), `nível '${levelId}' não encontrado no mundo '${worldId}'`);
  }
  return level;
}

/**
 * O payload de JOGO para a UI (`GameLevelPayload`) — SEM spoilers: sem casos
 * hidden no enunciado, sem `expectedOutput`, sem `reference`. `starter` vem da
 * linguagem escolhida; nível sem essa linguagem é erro (fail-closed) — a UI só
 * oferece linguagens suportadas, mas o main não confia no chamador.
 */
export async function loadGameLevelPayload(
  gamesDir: string,
  worldId: string,
  levelId: string,
  lang: GameLang,
): Promise<GameLevelPayload> {
  const level = await loadGameLevel(gamesDir, worldId, levelId);
  const code = level.langs[lang];
  if (code === undefined) {
    throw new GameContentError(
      path.join(gamesDir, worldId, `${levelId}.json`),
      `nível '${levelId}' não suporta a linguagem '${lang}'`,
    );
  }
  return {
    id: level.id,
    title: level.title,
    enunciado: level.enunciado,
    introduces: level.introduces,
    starter: code.starter,
    caseCount: level.contract.cases.filter((c) => !c.hidden).length,
    hiddenCount: level.contract.cases.filter((c) => c.hidden).length,
    optimize: level.optimize,
    boss: level.boss,
  };
}
