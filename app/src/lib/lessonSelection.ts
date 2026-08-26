/**
 * src/lib/lessonSelection.ts — LÓGICA PURA da SELEÇÃO DE AULAS por assunto.
 * (onda3-arvore-ui)
 *
 * ONda 3.1 da repo injeta os dados via IPC como `listSubjects()` da repo:
 * cada assunto vem com `{ id, name, slug, lessonCount, answeredCount }`. Aqui
 * convertemos ESSE shape cru no que a UI RENDERIZA: por assunto, o rótulo do
 * botão "Continuar" (com a contagem de aulas feitas) e o rótulo do curso ativo.
 *
 * "Aulas feitas" = `answeredCount` (a métrica que a repo define em `SubjectSummary`
 * — soma de `p.answered` do progress por assunto). Usamos `lessonCount` como
 * contexto ("N aulas no total") e `answeredCount` como o progresso feito.
 *
 * PURO/DI-FRIENDLY: recebe tudo por parâmetro; NÃO importa a repo do banco nem
 * Electron. Testável sob node:test sem jsdom (tests/ui/lessonSelection.test.ts).
 *
 * Regra do usuário: quando um assunto ainda não tem NENHUMA aula, o botão que
 * gera deixa de ser "Continuar" e vira "Gerar nova aula" (não há o que
 * continuar — o primeiro toque cria a primeira aula do assunto).
 */
import type { ReactNode } from 'react';

/** Assunto cru vindo da repo (`listSubjects` → `SubjectSummary`). */
export interface CourseSubject {
  id: string;
  name: string;
  slug: string;
  lessonCount: number;
  answeredCount: number;
}

/** Curso já convertido para render — o que o CourseSelector consome. */
export interface CourseItem {
  slug: string;
  /** Nome legível do assunto. */
  label: string;
  /** Rótulo do botão de continuar/gerar (já com a contagem). */
  continueLabel: string;
  /** Quantas aulas respondidas/feitas do assunto. */
  lessonsDone: number;
  /** Rótulo de progresso curto (ex.: "3/5") para consumos compactos. */
  progressLabel: string;
}

/**
 * Monta a lista de cursos pronta para render. Para CADA assunto:
 *  - `continueLabel`: "Continuar · N aulas feitas" (N = answeredCount);
 *    sem aulas (`lessonCount <= 0`) → "Gerar nova aula" (não há o que continuar).
 *  - `lessonsDone`: `answeredCount` ("aulas feitas" segundo a repo).
 *  - `progressLabel`: ex. "3/5" (answeredCount/lessonCount) — compacta;
 *    com lessonCount <= 0 → "0".
 */
export function buildCourseList(subjects: CourseSubject[]): CourseItem[] {
  return (subjects ?? []).map((s) => {
    const done = Number.isFinite(s.answeredCount) ? Math.max(0, s.answeredCount) : 0;
    const total = Number.isFinite(s.lessonCount) ? Math.max(0, s.lessonCount) : 0;
    const lessonsDone = done;
    let continueLabel: string;
    if (total <= 0) {
      // Sem aulas ainda → a primeira ação cria a primeira aula do assunto.
      continueLabel = 'Gerar nova aula';
    } else {
      const unit = lessonsDone === 1 ? 'aula feita' : 'aulas feitas';
      continueLabel = `Continuar · ${lessonsDone} ${unit}`;
    }
    return {
      slug: s.slug,
      label: s.name,
      continueLabel,
      lessonsDone,
      progressLabel: total > 0 ? `${Math.min(lessonsDone, total)}/${total}` : '0',
    };
  });
}

/** Shape opcional de aula para `activeCourseLabel` (evita depender do tipo da repo). */
export interface CourseLessonRef {
  lessonId?: string;
  title?: string;
  completedAt?: string | null;
  children?: CourseLessonRef[];
}

/** Estrutura mínima de um curso com aulas (p/ `activeCourseLabel`). */
export interface ActiveCourseInput {
  slug: string;
  label: string;
  lessons: CourseLessonRef[];
}

/**
 * Rótulo do curso ativo (exibido como título do contexto atual).
 *  - Sem curso → fallback legível "Nenhuma aula em andamento".
 *  - Com curso → "<label>" (+ contagem de aulas concluídas entre parênteses,
 *    quando houver aulas concluídas).
 */
export function activeCourseLabel(course: ActiveCourseInput | null): string {
  if (!course || !course.label) return 'Nenhuma aula em andamento';
  const base = course.label;
  const done = countCompletedLessons(course.lessons ?? []);
  return done > 0 ? `${base} (${done})` : base;
}

/** Conta aulas concluídas (`completedAt` presente) recursivamente pela árvore. */
function countCompletedLessons(nodes: CourseLessonRef[]): number {
  let count = 0;
  for (const n of nodes ?? []) {
    if (n && typeof n.completedAt === 'string' && n.completedAt.length > 0) count += 1;
    if (n && Array.isArray(n.children)) count += countCompletedLessons(n.children);
  }
  return count;
}

/** Componente/ReactNode de apoio à acessibilidade (expande ReactNode em string). */
export function nodeToText(node: ReactNode): string {
  if (node == null || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeToText).join('');
  return '';
}
