/**
 * tests/courseSelectionState.test.ts — lógica PURA da seleção de curso
 * (state/view — STORY-SPEC §5). Sem jsdom/React/DOM.
 *
 * O `CourseSelector.tsx` é só view (convenção do repo: componentes React não
 * são unit-testados); a decisão que ele fazia inline — "este botão é de GERAR
 * nova aula ou de CONTINUAR?" comparando o texto do rótulo — vive em
 * src/components/course/courseSelectionState.ts e é o que este arquivo prova.
 *
 * ─── COPY FIXADA PELOS RESOURCES ───────────────────────────────────────────
 * Os textos assertados vêm dos JSONs de i18n (`ptBR.course.*`): o fallback
 * legado de `lib/i18nText` tem de ficar em PARIDADE com o que os locales dizem
 * (se um locale mudar, este teste obriga a atualizar o fallback). A resolução
 * REAL via i18next (singleton, os DOIS idiomas) é provada em
 * tests/i18nText.test.ts.
 *
 * Contratos que mordem:
 *   1. A ação vem do CAMPO `CourseItem.action` (fonte de verdade de
 *      `buildCourseList`) — o rótulo é apresentação traduzida e nunca decide.
 *   2. Assunto SEM aulas → `generate` + `course.generate`; com aulas →
 *      `continue` + `course.continue_one`/`course.continue_other` (singular
 *      EXATO só para 1 — as regras CLDR do pt levam 0 para "one").
 *   3. Texto de progresso: `course.progress` ({{progress}} interpolado) ou
 *      `course.noLessons`.
 *
 * Reprodução: `bash tools/t.sh tests/courseSelectionState.test.ts`
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  courseActionKind,
  courseProgressText,
} from '../src/components/course/courseSelectionState';
import { buildCourseList, GENERATE_COURSE_LABEL } from '../src/lib/lessonSelection';
import ptBR from '../src/i18n/locales/pt-BR/translation.json';

describe('courseActionKind — ação do curso (continue | generate)', () => {
  it('decide pelo CAMPO action — nunca pela comparação do rótulo', () => {
    assert.equal(courseActionKind({ action: 'generate' }), 'generate');
    assert.equal(courseActionKind({ action: 'continue' }), 'continue');
  });

  it('integra com buildCourseList: sem aulas gera, com aulas continua (e o rótulo segue)', () => {
    const [comAulas, semAulas] = buildCourseList([
      { id: '1', name: 'Árvores', slug: 'arvores', lessonCount: 5, answeredCount: 3 },
      { id: '2', name: 'Recursão', slug: 'recursao', lessonCount: 0, answeredCount: 0 },
    ]);
    assert.ok(comAulas);
    assert.ok(semAulas);
    assert.equal(courseActionKind(comAulas), 'continue');
    assert.equal(courseActionKind(semAulas), 'generate');
    assert.equal(comAulas.continueLabel, ptBR.course.continue_other.replace('{{count}}', '3'));
    assert.equal(semAulas.continueLabel, ptBR.course.generate);
  });

  it('singular EXATO só para 1 aula feita (CLDR pt leva 0 para "one" — escolha por chave)', () => {
    const [uma, zero] = buildCourseList([
      { id: '1', name: 'Equações', slug: 'equacoes', lessonCount: 3, answeredCount: 1 },
      { id: '2', name: 'Vazio', slug: 'vazio', lessonCount: 2, answeredCount: 0 },
    ]);
    assert.ok(uma);
    assert.ok(zero);
    assert.equal(uma.continueLabel, ptBR.course.continue_one);
    assert.equal(zero.continueLabel, ptBR.course.continue_other.replace('{{count}}', '0'));
  });

  it('o fallback legado continua em paridade com o resource pt-BR', () => {
    assert.equal(GENERATE_COURSE_LABEL, ptBR.course.generate);
  });
});

describe('courseProgressText — texto de progresso do curso', () => {
  it('com progresso compacto → course.progress ({{progress}} interpolado)', () => {
    assert.equal(courseProgressText('3/5'), ptBR.course.progress.replace('{{progress}}', '3/5'));
    assert.equal(courseProgressText('0'), ptBR.course.progress.replace('{{progress}}', '0'));
  });

  it('sem progresso (vazio/ausente) → course.noLessons', () => {
    assert.equal(courseProgressText(''), ptBR.course.noLessons);
    assert.equal(courseProgressText(undefined), ptBR.course.noLessons);
  });
});
