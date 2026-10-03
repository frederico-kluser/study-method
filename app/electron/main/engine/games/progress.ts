/**
 * app/electron/main/engine/games/progress.ts — PROGRESSO dos games em disco.
 *
 * ONDA-GAMES (motor). JSON em `userData/games-progress.json` — o MESMO sítio
 * do progresso do app (`userData`): o settingsStore guarda `settings.json` e o
 * repo guarda `study.db` ali (`electron/main/index.ts`, `getPath('userData')`);
 * o padrão de persistência JSON é o do `services/settingsStore.ts` (factory
 * DI-friendly, `fs` injetável, arquivo corrompido ⇒ valor vazio, nunca exceção
 * a explodir na cara do aluno).
 *
 * CONTRATO (`GameProgress`, tipo TRAVADO em src/types/games.ts):
 *
 *   worlds[worldId][levelId] = {
 *     completedAt?: string;  // ISO — MESMA convenção do repo (`now()` =
 *                            // new Date().toISOString(), db/repo.ts:609)
 *     bestLines?: number;    // SÓ MELHORA (mínimo entre runs OK)
 *     bestTimeMs?: number;   // SÓ MELHORA (mínimo entre runs OK)
 *     attempts: number;      // TODA tentativa conta (ok ou não)
 *     history: number[];     // linhas de cada tentativa, máx. 50 (as últimas)
 *   }
 *
 * DECISÕES:
 *   - `bestLines`/`bestTimeMs` só registam runs que PASSARAM (`ok`): um run
 *     que falhou não "atingiu" nada (o tipo diz "melhor já atingido"). Melhor
 *     = MENOR valor, e só substitui quando é de facto menor.
 *   - `history` guarda as linhas de TODA tentativa (o histograma é da
 *     distribuição do aluno, não só dos acertos) e é truncado às últimas 50.
 *   - `completed` da submissão é TRANSIÇÃO (comentário do tipo: "o nível passou
 *     a concluído NESTA submissão") — run OK num nível já concluído devolve
 *     `completed: false` (o estado permanente está em `GameLevelSummary.
 *     completed`, vindo do `completedAt`).
 *   - HISTOGRAMA: `bins[i]` = nº de tentativas com EXATAMENTE `i` linhas — o
 *     índice do bin É o valor de linhas (é isso que faz `myIndex`/`par` serem
 *     posições no mesmo eixo sem precisar de mais campos no tipo travado).
 *     `myIndex` = linhas desta tentativa; `par` = o par do nível
 *     (`optimize.lines.par`) — o marcador que a UI desenha.
 */

import { promises as fsp } from 'node:fs';
import * as path from 'node:path';

import type { GameProgress } from '../../../../src/types/games';

/** O ficheiro de progresso (em userData, ao lado de settings.json/study.db). */
export const GAMES_PROGRESS_FILENAME = 'games-progress.json';

/** Teto do histórico de tentativas (decisão do contrato: máx. 50). */
export const HISTORY_MAX = 50;

/** O progresso vazio — o estado de quem nunca jogou. */
export function emptyGameProgress(): GameProgress {
  return { worlds: {} };
}

/** O resultado de registar UMA tentativa (o que o IPC devolve ao runner). */
export interface RecordAttemptResult {
  /** progresso ATUALIZADO (já com esta tentativa). */
  progress: GameProgress;
  /** true quando o nível passou a concluído NESTA tentativa (transição). */
  completed: boolean;
  /** os melhores ATUAIS (podem ser de tentativas anteriores). */
  best: { lines?: number; timeMs?: number };
}

/**
 * Histograma das linhas: `bins[i]` = contagem de tentativas com `i` linhas
 * (índice = valor), `myIndex` = linhas desta tentativa, `par` = marcador do
 * par do nível. O domínio cobre `max(history, par, myLines)`.
 */
export function histogramFor(
  history: readonly number[],
  myLines: number,
  par: number,
): { bins: number[]; myIndex: number; par: number } {
  const maximo = Math.max(0, myLines, par, ...history);
  const bins = new Array<number>(maximo + 1).fill(0);
  for (const lines of history) {
    if (Number.isInteger(lines) && lines >= 0 && lines <= maximo) bins[lines] += 1;
  }
  return { bins, myIndex: myLines, par };
}

/**
 * Regista UMA tentativa num nível (função PURA — não toca disco).
 * `now` é injetável para teste; default ISO atual (convenção do repo).
 */
export function recordAttempt(
  progress: GameProgress,
  worldId: string,
  levelId: string,
  attempt: { lines: number; timeMs: number },
  ok: boolean,
  opts: { par: number; now?: string },
): RecordAttemptResult {
  const worlds = { ...progress.worlds };
  const world = { ...(worlds[worldId] ?? {}) };
  const previous = world[levelId] ?? { attempts: 0, history: [] };

  const history = [...previous.history, attempt.lines].slice(-HISTORY_MAX);
  const entry = {
    ...(previous.completedAt !== undefined ? { completedAt: previous.completedAt } : {}),
    ...(previous.bestLines !== undefined ? { bestLines: previous.bestLines } : {}),
    ...(previous.bestTimeMs !== undefined ? { bestTimeMs: previous.bestTimeMs } : {}),
    attempts: previous.attempts + 1,
    history,
  };

  // CONCLUSÃO: só a transição seta completedAt (e é ela que o caller vê como
  // `completed: true`).
  let completed = false;
  if (ok && entry.completedAt === undefined) {
    entry.completedAt = opts.now ?? new Date().toISOString();
    completed = true;
  }

  // RECORDS: só run OK conta; só MELHORA (mínimo estrito).
  if (ok) {
    if (entry.bestLines === undefined || attempt.lines < entry.bestLines) {
      entry.bestLines = attempt.lines;
    }
    if (entry.bestTimeMs === undefined || attempt.timeMs < entry.bestTimeMs) {
      entry.bestTimeMs = attempt.timeMs;
    }
  }

  world[levelId] = entry;
  worlds[worldId] = world;
  const next: GameProgress = { worlds };
  return {
    progress: next,
    completed,
    best: {
      ...(entry.bestLines !== undefined ? { lines: entry.bestLines } : {}),
      ...(entry.bestTimeMs !== undefined ? { timeMs: entry.bestTimeMs } : {}),
    },
  };
}

/** Linhas válidas de history (números finitos) — defesa de arquivo editado. */
function linhasValidas(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0)
    .map((v) => Math.round(v))
    .slice(-HISTORY_MAX);
}

/**
 * Normaliza JSON lido do disco para `GameProgress` (defensivo: arquivo
 * editado à mão ou de versão futura nunca lança — entradas inválidas caem
 * fora; o resto preserva).
 */
export function normalizarProgresso(raw: unknown): GameProgress {
  const out = emptyGameProgress();
  if (raw === null || typeof raw !== 'object') return out;
  const worlds = (raw as { worlds?: unknown }).worlds;
  if (worlds === null || typeof worlds !== 'object') return out;
  for (const [worldId, worldRaw] of Object.entries(worlds as Record<string, unknown>)) {
    if (worldRaw === null || typeof worldRaw !== 'object') continue;
    const world: GameProgress['worlds'][string] = {};
    for (const [levelId, entryRaw] of Object.entries(worldRaw as Record<string, unknown>)) {
      if (entryRaw === null || typeof entryRaw !== 'object') continue;
      const e = entryRaw as Record<string, unknown>;
      const entry: GameProgress['worlds'][string][string] = {
        attempts: typeof e.attempts === 'number' && Number.isFinite(e.attempts) ? Math.max(0, Math.round(e.attempts)) : 0,
        history: linhasValidas(e.history),
      };
      if (typeof e.completedAt === 'string') entry.completedAt = e.completedAt;
      if (typeof e.bestLines === 'number' && Number.isFinite(e.bestLines)) entry.bestLines = Math.round(e.bestLines);
      if (typeof e.bestTimeMs === 'number' && Number.isFinite(e.bestTimeMs)) entry.bestTimeMs = Math.round(e.bestTimeMs);
      world[levelId] = entry;
    }
    out.worlds[worldId] = world;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Persistência (padrão settingsStore: DI-friendly, corrompido ⇒ vazio)
// ---------------------------------------------------------------------------

export interface GamesProgressStoreDeps {
  /** `app.getPath('userData')` — o sítio do progresso do app. */
  userDataPath: string;
  /** nome do ficheiro (default `games-progress.json`). */
  fileName?: string;
  /** fs lento injetável (testes). */
  fs?: typeof fsp;
}

export interface GamesProgressStore {
  /** Lê o progresso (ausente/corrompido ⇒ vazio; nunca lança). */
  load(): Promise<GameProgress>;
  /** Grava o progresso (mkdir + write atómico-em-espírito: um único JSON). */
  save(progress: GameProgress): Promise<void>;
  /**
   * Lê, regista a tentativa e grava — o fluxo completo do canal `games:run`.
   * `par` alimenta o histograma; `now` é injetável (teste).
   */
  recordAttempt(
    worldId: string,
    levelId: string,
    attempt: { lines: number; timeMs: number },
    ok: boolean,
    opts: { par: number; now?: string },
  ): Promise<RecordAttemptResult>;
}

export function createGamesProgressStore(deps: GamesProgressStoreDeps): GamesProgressStore {
  const fsImpl = deps.fs ?? fsp;
  const filePath = path.join(deps.userDataPath, deps.fileName ?? GAMES_PROGRESS_FILENAME);

  async function load(): Promise<GameProgress> {
    try {
      const raw = JSON.parse(await fsImpl.readFile(filePath, 'utf8')) as unknown;
      return normalizarProgresso(raw);
    } catch {
      // ausente OU corrompido ⇒ vazio (padrão settingsStore: o aluno nunca
      // vê uma exceção de disco num jogo).
      return emptyGameProgress();
    }
  }

  async function save(progress: GameProgress): Promise<void> {
    await fsImpl.mkdir(deps.userDataPath, { recursive: true });
    await fsImpl.writeFile(filePath, JSON.stringify(progress, null, 2), 'utf8');
  }

  return {
    load,
    save,
    async recordAttempt(worldId, levelId, attempt, ok, opts) {
      const current = await load();
      const result = recordAttempt(current, worldId, levelId, attempt, ok, opts);
      await save(result.progress);
      return result;
    },
  };
}
