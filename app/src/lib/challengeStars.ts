/**
 * src/lib/challengeStars.ts — máquina de estado PURA das estrelas do desafio
 * (sem DOM, sem React, sem API — 100% testável em node:test).
 *
 * Requisito direto do dono do produto (pedido explícito; docs/ux-redesign.md §8.2
 * proíbe XP/pontos/streak/leaderboard — aqui SÓ as estrelas, sem gamificação
 * extra): o desafio começa com 3 estrelas; cada CAUSA de perda dispara no máximo
 * 1× (idempotente) e o saldo nunca fica abaixo de 0:
 *
 *   - onBlur()          — janela perdeu o foco (evento window 'blur' ou
 *                         document.visibilitychange com document.hidden): -1
 *   - onTimeout()       — tempo esgotou antes de concluir: -1
 *   - onWrongAnswer()   — teste determinístico falhou: -1
 *   - onTick(elapsed)   — decaimento por VELOCIDADE: elapsed ≥ 60% do limite
 *                         → -1 (perdida por demora, sem repetir); elapsed ≥ 85%
 *                         → mais -1.
 *
 * Limite de tempo por dificuldade: T = 90s + difficulty*60s (difficulty 1..5 →
 * 2min30s a 6min30s). Se o desafio não expuser difficulty (undefined/NaN/<1),
 * usa T = 300s (fallback documentado em `timeLimitForDifficulty`).
 *
 * Eventos: `getEvents()` devolve o log de perdas (causa + estrelas restantes) —
 * a UI pode registrar/inspecionar mudanças; `lostCauses()` devolve as causas já
 * disparadas. `onChange` NÃO existe de propósito: a UI é a única chamadora das
 * mutações e pode ler `stars()` depois de cada chamada; o log existe para a UI
 * detectar perdas que ela não dispara diretamente (decaimento por demora no
 * tick).
 */

/** Causas de perda de estrela (cada uma dispara no máximo 1× por tracker). */
export type StarLossCause = 'blur' | 'timeout' | 'wrong-answer' | 'slowness-60' | 'slowness-85';

/** Evento de perda registrado no log (para a UI reagir a mudanças). */
export interface StarEvent {
  cause: StarLossCause;
  /** Estrelas restantes APÓS a perda (nunca < 0). */
  starsLeft: number;
}

export interface StarTracker {
  /** Estrelas restantes (0..INITIAL_STARS). */
  stars(): number;
  /** Alimenta o decaimento por velocidade: elapsed ≥ 60% → -1; ≥ 85% → -1. */
  onTick(elapsedMs: number): void;
  /** Janela perdeu o foco (window blur / document.hidden): -1 (1×). */
  onBlur(): void;
  /** Tempo esgotou antes de concluir: -1 (1×). */
  onTimeout(): void;
  /** Teste determinístico falhou: -1 (1×). */
  onWrongAnswer(): void;
  /** `elapsedMs >= timeLimitMs`? (função pura do relógio). */
  isTimedOut(elapsedMs: number): boolean;
  /** Log de perdas na ordem em que ocorreram (cópia defensiva). */
  getEvents(): readonly StarEvent[];
  /** Causas que já dispararam (ordem de disparo). */
  lostCauses(): readonly StarLossCause[];
}

export const INITIAL_STARS = 3;

/** Fallback documentado: desafio sem difficulty exposta → 5 min. */
export const DEFAULT_TIME_LIMIT_MS = 300_000;
/** T = 90s + difficulty*60s. */
export const BASE_TIME_MS = 90_000;
export const TIME_PER_DIFFICULTY_MS = 60_000;

/** Limiar de decaimento por demora (elapsed/timeLimit). */
export const SLOWNESS_60_RATIO = 0.6;
export const SLOWNESS_85_RATIO = 0.85;

/** Maior cota de estrelas que um único desafio pode perder. */
export const MAX_STARS = INITIAL_STARS;

/**
 * Limite de tempo por dificuldade do desafio: T = 90s + difficulty*60s.
 * difficulty ausente/inválida (< 1, NaN, não-número) → DEFAULT_TIME_LIMIT_MS
 * (300s), conforme contrato do dono do produto ("se o desafio não expuser
 * difficulty, use T=300s e documente").
 */
export function timeLimitForDifficulty(difficulty?: number): number {
  if (typeof difficulty !== 'number' || !Number.isFinite(difficulty) || difficulty < 1) {
    return DEFAULT_TIME_LIMIT_MS;
  }
  return BASE_TIME_MS + difficulty * TIME_PER_DIFFICULTY_MS;
}

/** Formata ms em relógio mm:ss (clampa negativo em "00:00"; não estoura 99:59). */
export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.min(99, Math.floor(totalSeconds / 60));
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** Chaves i18n de perda de estrela (unions literais para o t() strict-typed). */
export type StarLossI18nKey =
  | 'challenge.starLostFocus'
  | 'challenge.timedOutAnnounce'
  | 'challenge.starLostSlow';

/**
 * Chave i18n da mensagem de perda por causa (para a UI anunciar). 'wrong-answer'
 * fica FORA (retorna null): a perda por teste falho é anunciada junto com o
 * resultado do teste (challenge.announceFailed), não como mensagem isolada.
 */
export function starLossI18nKey(cause: StarLossCause): StarLossI18nKey | null {
  switch (cause) {
    case 'blur':
      return 'challenge.starLostFocus';
    case 'timeout':
      return 'challenge.timedOutAnnounce';
    case 'slowness-60':
    case 'slowness-85':
      return 'challenge.starLostSlow';
    case 'wrong-answer':
      return null;
    default:
      return null;
  }
}

/**
 * Cria um tracker de estrelas para UM desafio (reset = criar outro tracker).
 *
 * @param opts.timeLimitMs limite de tempo do desafio (default 300s). Usar
 *   `timeLimitForDifficulty(difficulty)` para derivar da dificuldade.
 */
export function createStarTracker(opts: { timeLimitMs?: number } = {}): StarTracker {
  const rawLimit = opts.timeLimitMs;
  const timeLimitMs =
    typeof rawLimit === 'number' && Number.isFinite(rawLimit) && rawLimit > 0
      ? rawLimit
      : DEFAULT_TIME_LIMIT_MS;

  let starsLeft = INITIAL_STARS;
  const fired = new Set<StarLossCause>();
  const events: StarEvent[] = [];

  const applyLoss = (cause: StarLossCause): void => {
    if (fired.has(cause)) return; // idempotente: cada causa dispara no máximo 1×
    fired.add(cause);
    if (starsLeft > 0) starsLeft -= 1; // nunca abaixo de 0
    events.push({ cause, starsLeft });
  };

  return {
    stars(): number {
      return starsLeft;
    },
    onTick(elapsedMs: number): void {
      if (elapsedMs >= timeLimitMs * SLOWNESS_60_RATIO) applyLoss('slowness-60');
      if (elapsedMs >= timeLimitMs * SLOWNESS_85_RATIO) applyLoss('slowness-85');
    },
    onBlur(): void {
      applyLoss('blur');
    },
    onTimeout(): void {
      applyLoss('timeout');
    },
    onWrongAnswer(): void {
      applyLoss('wrong-answer');
    },
    isTimedOut(elapsedMs: number): boolean {
      return elapsedMs >= timeLimitMs;
    },
    getEvents(): readonly StarEvent[] {
      return events.slice();
    },
    lostCauses(): readonly StarLossCause[] {
      return Array.from(fired);
    },
  };
}

/**
 * Guarda de identidade do teste em voo (corrida cross-desafio): o resultado de
 * `testAnswer` só pode ser aplicado na tela se o desafio que COMEÇOU o teste
 * continua sendo o desafio ATIVO quando o resultado volta. `startedKey` é a key
 * do desafio capturada no início do teste (`challengeId:workspaceDir`);
 * `currentKey` é a key atual. Se o teste começou sem desafio ativo
 * (`startedKey === null`) não há nada a aplicar — sempre false.
 */
export function isStillCurrent(startedKey: string | null, currentKey: string | null): boolean {
  return startedKey !== null && startedKey === currentKey;
}
