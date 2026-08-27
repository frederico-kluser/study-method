/**
 * src/lib/roadmap.ts — MONTAGEM da trilha (roadmap) por matéria (lógica pura).
 * (onda2-trilha)
 *
 * A Trilha pega a lista ACHATADA de aulas de uma matéria
 * (`study:list-lessons-by-subject` → `LessonSummary[]`) e devolve SEÇÕES por
 * nível — Iniciante → Intermediário → Avançado — com cada aula em um dos três
 * estados: 'done' (concluída), 'current' (em andamento), 'pending'.
 *
 * ─── DECISÃO: TRILHA NÃO ÁRVORE-ANINHADA ────────────────────────────────────
 * O `LessonSummary` do contrato NÃO traz `parent_lesson_id` (só o `LessonRow`
 * completo tem). Portanto não há hierarquia pai→filho para reconstruir no
 * renderer: a trilha de cada nível é uma SEQUÊNCIA (trail) na ordem em que a
 * repo devolveu (ordem de criação). A "árvore" da UI é a árvore de SEÇÕES:
 * três galhos (níveis) colapsáveis, cada um com sua sequência de aulas.
 *
 * ─── DECISÃO: SEÇÕES SÓ COM AULAS ───────────────────────────────────────────
 * Níveis sem nenhuma aula NÃO aparecem (renderizar "Avançado: 0 aulas" para
 * um usuário iniciante seria ruído). A seção aparece quando a primeira aula
 * daquele nível é criada — e o estado 'current' só pisa em seções existentes.
 *
 * ─── REGRA DO 'current' ─────────────────────────────────────────────────────
 * 'current' = a PRIMEIRA aula PENDENTE da trilha, varrendo os níveis em ordem
 * (Iniciante → Intermediário → Avançado) e, dentro do nível, a ordem da lista.
 * É a "próxima aula" do usuário — o destaque visual que avança conforme o
 * progresso. Existe NO MÁXIMO UM 'current' por trilha. Trilha 100% concluída
 * não tem 'current' (o usuário terminou a matéria — o estado fica todo 'done').
 * Aula concluída (`completedAt` presente) é 'done' SEMPRE, mesmo que seja a
 * primeira da lista.
 *
 * PURO/DI-FRIENDLY: recebe tudo por parâmetro; sem React/DOM/Electron.
 * Testável sob node:test sem jsdom (tests/ui/roadmap.test.ts).
 */
import type { LessonSummary } from '../../shared/ipc-contract';
import { difficultyToLevel, LEVEL_ORDER, type DifficultyLevel } from './levels';

/** Estado visual de uma aula na trilha. */
export type RoadmapNodeState = 'done' | 'current' | 'pending';

/** Aula pronta para render, dentro de uma seção de nível. */
export interface RoadmapLessonNode {
  lessonId: string;
  /** Título da aula (fallback legível quando vazio). */
  title: string;
  /** `difficulty` cru da repo (pode faltar — nível já resolvido em `level`). */
  difficulty: number | null;
  /** Nível da seção onde a aula cai (via `difficultyToLevel`). */
  level: DifficultyLevel;
  /** Estado na trilha: 'done' | 'current' | 'pending'. */
  state: RoadmapNodeState;
  /** `completedAt` cru (para title/aria-label de contexto). */
  completedAt: string | null;
}

/** Seção de nível: a sequência de aulas + a contagem de progresso da seção. */
export interface RoadmapSection {
  level: DifficultyLevel;
  lessons: RoadmapLessonNode[];
  /** Total de aulas da seção. */
  total: number;
  /** Aulas concluídas da seção. */
  done: number;
}

/** Resultado da montagem: seções em ordem + agregados da matéria inteira. */
export interface RoadmapResult {
  /** Seções com ≥1 aula, em ordem de `LEVEL_ORDER` (Iniciante → Avançado). */
  sections: RoadmapSection[];
  /** Aulas da matéria inteira. */
  total: number;
  /** Concluídas da matéria inteira. */
  done: number;
  /** lessonId do 'current' (primeira pendente); null quando tudo concluído. */
  currentLessonId: string | null;
}

/** Aula sem id não entra na trilha (mesma guarda do `toTreeView`). */
function isUsableLesson(lesson: LessonSummary | null | undefined): lesson is LessonSummary {
  return Boolean(lesson && typeof lesson.id === 'string' && lesson.id.length > 0);
}

/** Normaliza o título: trim; vazio → fallback legível. */
function normalizeTitle(title: unknown): string {
  if (typeof title === 'string' && title.trim().length > 0) return title.trim();
  return 'Aula sem título';
}

/** True quando `completedAt` está preenchido (aula concluída). */
function isCompleted(completedAt: unknown): boolean {
  return typeof completedAt === 'string' && completedAt.length > 0;
}

/**
 * Monta as seções da trilha a partir da lista achatada de aulas da matéria.
 *  - agrupa por nível (`difficultyToLevel`), preservando a ordem da lista;
 *  - marca 'done' (completedAt) e EXATAMENTE UM 'current' (primeira pendente
 *    na varredura Iniciante → Avançado);
 *  - devolve seções só com aulas, na ordem de `LEVEL_ORDER`, + agregados.
 * Entrada `null`/`undefined`/vazia → `{ sections: [], total: 0, done: 0,
 * currentLessonId: null }` (matéria sem aulas não derruba a UI).
 */
export function buildRoadmapSections(lessons: LessonSummary[] | null | undefined): RoadmapResult {
  const byLevel = new Map<DifficultyLevel, RoadmapLessonNode[]>();

  for (const lesson of lessons ?? []) {
    if (!isUsableLesson(lesson)) continue;
    const level = difficultyToLevel(lesson.difficulty);
    const nodes = byLevel.get(level);
    const node: RoadmapLessonNode = {
      lessonId: lesson.id,
      title: normalizeTitle(lesson.title),
      difficulty: typeof lesson.difficulty === 'number' && Number.isFinite(lesson.difficulty)
        ? lesson.difficulty
        : null,
      level,
      state: isCompleted(lesson.completedAt) ? 'done' : 'pending',
      completedAt: typeof lesson.completedAt === 'string' && lesson.completedAt.length > 0
        ? lesson.completedAt
        : null,
    };
    if (nodes) nodes.push(node);
    else byLevel.set(level, [node]);
  }

  // Seções em ordem canônica de nível; só níveis com ≥1 aula.
  const sections: RoadmapSection[] = [];
  for (const level of LEVEL_ORDER) {
    const lessons = byLevel.get(level);
    if (!lessons || lessons.length === 0) continue;
    const done = lessons.filter((n) => n.state === 'done').length;
    sections.push({ level, lessons, total: lessons.length, done });
  }

  // 'current' = primeira pendente varrendo as seções em ordem.
  let currentLessonId: string | null = null;
  outer: for (const section of sections) {
    for (const node of section.lessons) {
      if (node.state === 'pending') {
        node.state = 'current';
        currentLessonId = node.lessonId;
        break outer;
      }
    }
  }

  const total = sections.reduce((acc, s) => acc + s.total, 0);
  const done = sections.reduce((acc, s) => acc + s.done, 0);

  return { sections, total, done, currentLessonId };
}

/** True quando a matéria não tem nenhuma aula na trilha. */
export function isRoadmapEmpty(result: RoadmapResult): boolean {
  return result.total <= 0;
}

/** True quando TODAS as aulas da matéria estão concluídas. */
export function isRoadmapComplete(result: RoadmapResult): boolean {
  return result.total > 0 && result.done >= result.total;
}
