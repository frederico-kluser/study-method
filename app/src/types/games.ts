/**
 * app/src/types/games.ts — CONTRATO PARTILHADO da secção Games.
 *
 * ONDA-GAMES (vertical slice): este ficheiro é a fronteira entre o motor
 * (app/electron/main/engine/games/*), o conteúdo (app/resources/games/**) e a
 * UI (app/src/views/GamesView/*). É TRAVADO por decisão do orquestrador: os
 * agentes que consomem o contrato NÃO o editam — mudanças aqui exigem
 * atualizar os três lados de uma vez.
 *
 * A mecânica do jogo fala um CONTRATO DE I/O (stdin → stdout) e nunca a
 * linguagem do aluno: o mesmo nível corre em C, Python ou Rust e o veredito
 * sai do harness de testes existente (engine/exec) pelo adaptador da linguagem.
 */

/** Linguagens suportadas pelo contrato de jogo (adaptadores do lang/registry). */
export type GameLang = 'c' | 'python' | 'rust';

/** Resumo de um nível no mapa do mundo. */
export interface GameLevelSummary {
  id: string;
  title: string;
  /** O chefe de módulo (avaliação cumulativa; invólucro leve opcional). */
  boss: boolean;
  completed: boolean;
  /** Melhor nº de linhas já atingido (modo otimização). */
  bestLines?: number;
  /** Melhor tempo mediano (ms) já atingido (modo otimização). */
  bestTimeMs?: number;
}

/** Resumo de um mundo (mapa). */
export interface GameWorldSummary {
  id: string;
  title: string;
  description: string;
  levels: GameLevelSummary[];
}

/** Nível carregado para JOGAR (sem spoilers: sem casos hidden, sem referência). */
export interface GameLevelPayload {
  id: string;
  title: string;
  enunciado: string;
  /** Conceitos que o nível introduz (vocabulário do app: lacos, arrays, funcoes…). */
  introduces: string[];
  /** Starter da linguagem escolhida. */
  starter: string;
  /** Casos VISÍVEIS (os hidden ficam de fora por definição). */
  caseCount: number;
  hiddenCount: number;
  optimize: { lines: { par: number }; timeMs: { parMs: number } };
  boss: boolean;
}

/** Resultado de um caso de teste. Hidden: só ok, sem expected/actual. */
export interface GameCaseResult {
  name: string;
  ok: boolean;
  expected?: string;
  actual?: string;
}

/** Resultado de uma submissão (correr a resposta). */
export interface GameRunResult {
  ok: boolean;
  cases: GameCaseResult[];
  metrics: { lines: number; timeMs: number };
  best: { lines?: number; timeMs?: number };
  /** Histograma local das linhas das tentativas do próprio + marcador do par. */
  histogram: { bins: number[]; myIndex: number; par: number };
  /** true quando ok e o nível passou a concluído nesta submissão. */
  completed: boolean;
}

/** Progresso em disco por mundo/nível. */
export interface GameProgress {
  worlds: Record<
    string,
    Record<
      string,
      {
        completedAt?: string;
        bestLines?: number;
        bestTimeMs?: number;
        attempts: number;
        /** Linhas de cada tentativa (histograma; máx. 50). */
        history: number[];
      }
    >
  >;
}
