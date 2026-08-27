/**
 * src/lib/levels.ts — NÍVEIS de dificuldade da trilha (lógica pura).
 * (onda2-trilha)
 *
 * O contrato `LessonSummary.difficulty` (shared/ipc-contract.ts) é um número
 * 1..5. A Trilha agrupa as aulas em TRÊS seções de nível — Iniciante,
 * Intermediário, Avançado — para que o progresso do usuário se leia de cima
 * para baixo, como um roadmap.
 *
 * ─── REGRA DE MAPEAMENTO (documentada aqui porque é o coração do módulo) ────
 *   difficulty 1–2 → 'beginner' (Iniciante)
 *   difficulty 3   → 'intermediate' (Intermediário)
 *   difficulty 4–5 → 'advanced' (Avançado)
 *
 * ─── DIFICULDADE AUSENTE/INVÁLIDA → 'beginner' ─────────────────────────────
 * O renderer compila SEM `strict` (tsconfig.json do renderer) e o DTO vem do
 * main via IPC: um `difficulty` `undefined`, `null`, `NaN` ou fora de 1..5 é
 * ALCANÇÁVEL em runtime. Em vez de derrubar a UI, esses valores caem no nível
 * mais conservador ('beginner') — a seção Iniciante é o piso natural da trilha
 * e nunca some, então o nó continua visível e ordenável. O teste documenta
 * cada caso.
 *
 * PURO/DI-FRIENDLY: sem React/DOM/Electron. Testável sob node:test sem jsdom
 * (tests/levels.test.ts), dentro do tsconfig.node.json (inclui src/lib).
 */

/** Os TRÊS níveis da trilha, em ordem de exibição (piso → teto). */
export const LEVEL_ORDER = ['beginner', 'intermediate', 'advanced'] as const;

/** Nível de dificuldade de uma aula na trilha. */
export type DifficultyLevel = (typeof LEVEL_ORDER)[number];

/** Valor mínimo de `difficulty` mapeado para 'beginner'. */
const BEGINNER_MAX = 2;
/** Valor máximo de `difficulty` mapeado para 'intermediate'. */
const INTERMEDIATE_MAX = 3;

/** True quando o valor é um número finito dentro do intervalo 1..5. */
function isFiniteDifficulty(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 5;
}

/**
 * Mapeia `LessonSummary.difficulty` (1..5) para o nível da trilha.
 *  1–2 → 'beginner' · 3 → 'intermediate' · 4–5 → 'advanced'.
 * Ausente/`undefined`/`null`/`NaN`/fora de 1..5 → 'beginner' (piso conservador,
 * ver cabeçalho do módulo).
 */
export function difficultyToLevel(difficulty: number | null | undefined): DifficultyLevel {
  if (!isFiniteDifficulty(difficulty)) return 'beginner';
  if (difficulty <= BEGINNER_MAX) return 'beginner';
  if (difficulty <= INTERMEDIATE_MAX) return 'intermediate';
  return 'advanced';
}

/** Chaves i18n dos rótulos de nível (sem namespace — o call-site usa `translation:`). */
export type LevelI18nKey =
  | 'trilha.levels.beginner'
  | 'trilha.levels.intermediate'
  | 'trilha.levels.advanced';

/**
 * Chave i18n do rótulo de um nível. A união literal trava no strictKeyChecks
 * do i18next.d.ts: um nível novo que não tenha chave nos resources não compila.
 * O call-site traduz com `t(`translation:${levelI18nKey(level)}`)` (mesmo
 * padrão de `lessonPhaseLabels.ts` no SessionFrame).
 */
export function levelI18nKey(level: DifficultyLevel): LevelI18nKey {
  switch (level) {
    case 'intermediate':
      return 'trilha.levels.intermediate';
    case 'advanced':
      return 'trilha.levels.advanced';
    case 'beginner':
      return 'trilha.levels.beginner';
  }
}

/** Índice (0-based) de um nível na ordem de exibição; -1 quando desconhecido. */
export function levelIndex(level: DifficultyLevel): number {
  return LEVEL_ORDER.indexOf(level);
}

/** True quando `a` vem ANTES de `b` na ordem de exibição (comparador p/ sort). */
export function levelLessThan(a: DifficultyLevel, b: DifficultyLevel): boolean {
  return levelIndex(a) < levelIndex(b);
}
