/**
 * src/components/course/courseSelectionState.ts — lógica PURA da seleção de
 * curso (state/view — STORY-SPEC §5).
 *
 * Extraída do `CourseSelector.tsx` para testes node:test sem jsdom. O que era
 * uma decisão de ESTADO escondida na view — "este curso é de GERAR nova aula
 * ou de CONTINUAR?" comparando o texto do rótulo — vive aqui sobre o dado: o
 * campo semântico `CourseItem.action` (preenchido por `buildCourseList` em
 * `src/lib/lessonSelection.ts`). O rótulo é APRESENTAÇÃO traduzida e nunca
 * decide comportamento. O componente passa a só renderizar o que estas
 * funções decidem.
 *
 * A copy sai pelas chaves `course.progress` / `course.noLessons` via `tr`
 * (`lib/i18nText` — traduz com o i18n de produção, fallback pt-BR legado sem
 * i18n; nada de texto novo aqui).
 *
 * Nada aqui depende de React/DOM/MUI.
 */
import { type CourseActionKind, type CourseItem } from '../../lib/lessonSelection';
import { tr } from '../../lib/i18nText';

/**
 * Ação que o botão do curso executa (`continue` | `generate`) — o tipo vive em
 * `src/lib/lessonSelection.ts`, junto do dado que o carrega, e é re-exportado
 * para manter o export público desta camada de estado.
 */
export type { CourseActionKind };

/**
 * Decide a ação do curso pelo CAMPO semântico `CourseItem.action` (fonte de
 * verdade de `buildCourseList`) — nunca pela comparação do texto do rótulo.
 */
export function courseActionKind(course: Pick<CourseItem, 'action'>): CourseActionKind {
  return course.action;
}

/**
 * Texto de progresso do curso: "Progresso: 3/5" quando há progresso compacto;
 * "Ainda sem aulas" quando o rótulo de progresso vem vazio/ausente.
 */
export function courseProgressText(progressLabel: string | undefined): string {
  return progressLabel
    ? tr('translation:course.progress', `Progresso: ${progressLabel}`, { progress: progressLabel })
    : tr('translation:course.noLessons', 'Ainda sem aulas');
}
