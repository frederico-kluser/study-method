/**
 * tests/i18nText.test.ts — `tr()` de src/lib/i18nText.ts: tradução com FALLBACK
 * para módulos PUROS. Sem jsdom.
 *
 * Prova os DOIS caminhos do helper:
 *   1. SEM i18n inicializado (o caso dos testes e ferramentas) → o texto LEGADO
 *      em pt-BR, em paridade byte a byte com o resource correspondente;
 *   2. COM o singleton inicializado (o caso do app e das STORIES — o
 *      `main.tsx` e o loader do preview chamam `initI18n()`) → a tradução REAL
 *      nos DOIS idiomas, para TODA a copy ligada nesta onda:
 *      `course.*` (buildCourseList/courseProgressText), `trilha.tree.*`
 *      (defaults + nodeChildren da árvore) e `lesson.untitled` (toTreeView).
 *
 * Nota: este arquivo usa `initI18n()` (o singleton) porque é EXATAMENTE o que
 * os módulos puros resolvem — cada ficheiro de teste corre no seu PRÓPRIO
 * processo (node --test), por isso não há poluição dos testes irmãos. A regra
 * "testes usam instâncias isoladas via createAppI18n" aplica-se aos RENDERS
 * com i18n (ver tests/lessonSidebarHeader.test.ts), não à prova do singleton.
 *
 * Reprodução: `bash tools/t.sh tests/i18nText.test.ts`
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { tr } from '../src/lib/i18nText';
import { initI18n, getDefaultI18n } from '../src/i18n';
import { buildCourseList } from '../src/lib/lessonSelection';
import { toTreeView } from '../src/lib/treeView';
import { courseProgressText } from '../src/components/course/courseSelectionState';
import {
  defaultStateLabels,
  defaultTreeEmpty,
  defaultTreeTitle,
  nodeAriaLabel,
} from '../src/components/tree/evolutionTreeState';
import ptBR from '../src/i18n/locales/pt-BR/translation.json';
import en from '../src/i18n/locales/en/translation.json';

const pasta = {
  lessonId: 'a',
  label: 'Raiz',
  state: 'done' as const,
  completedAt: null,
  children: [{ lessonId: 'b', label: 'Filha', state: 'pending' as const, completedAt: null, children: [] }],
};

describe('tr() SEM i18n — fallback legado em pt-BR (ordem importa: corre antes do init)', () => {
  it('devolve o fallback quando o singleton não está inicializado', () => {
    assert.equal(tr('translation:course.generate', 'Gerar nova aula'), 'Gerar nova aula');
    assert.equal(tr('translation:course.noLessons', 'Ainda sem aulas'), 'Ainda sem aulas');
    assert.equal(tr('translation:lesson.untitled', 'Aula sem título'), 'Aula sem título');
  });

  it('o fallback é paridade byte a byte dos resources pt-BR', () => {
    assert.equal('Gerar nova aula', ptBR.course.generate);
    assert.equal('Ainda sem aulas', ptBR.course.noLessons);
    assert.equal('Aula sem título', ptBR.lesson.untitled);
    assert.equal('Evolução da aprendizagem', ptBR.trilha.tree.title);
  });
});

describe('tr() COM singleton pt-BR (initI18n — o caminho do app/stories)', () => {
  it('resolve course.* nos módulos puros', async () => {
    await initI18n('pt-BR');
    const [um, gerar] = buildCourseList([
      { id: '1', name: 'Árvores', slug: 'arvores', lessonCount: 5, answeredCount: 3 },
      { id: '2', name: 'Recursão', slug: 'recursao', lessonCount: 0, answeredCount: 0 },
    ]);
    assert.ok(um);
    assert.ok(gerar);
    assert.equal(um.continueLabel, ptBR.course.continue_other.replace('{{count}}', '3'));
    assert.equal(gerar.continueLabel, ptBR.course.generate);
    assert.equal(courseProgressText('3/5'), ptBR.course.progress.replace('{{progress}}', '3/5'));
    assert.equal(courseProgressText(undefined), ptBR.course.noLessons);
  });

  it('resolve trilha.tree.* na árvore (defaults + nodeChildren)', async () => {
    await initI18n('pt-BR');
    assert.equal(defaultTreeTitle(), ptBR.trilha.tree.title);
    assert.equal(defaultTreeEmpty(), ptBR.trilha.tree.empty);
    const labels = defaultStateLabels();
    assert.equal(labels.done, ptBR.trilha.tree.stateDone);
    assert.equal(
      nodeAriaLabel(pasta, labels),
      `Raiz — ${ptBR.trilha.tree.stateDone}, ${ptBR.trilha.tree.nodeChildren.replace('{{count}}', '1')}`,
    );
  });
});

describe('tr() COM singleton EN (changeLanguage — o caminho do LanguageSwitcher)', () => {
  it('resolve toda a copy em inglês', async () => {
    const inst = await initI18n('en');
    assert.equal(inst.language, 'en');
    assert.equal(getDefaultI18n()?.language, 'en');

    const [um, gerar] = buildCourseList([
      { id: '1', name: 'Trees', slug: 'trees', lessonCount: 5, answeredCount: 3 },
      { id: '2', name: 'Recursion', slug: 'recursion', lessonCount: 0, answeredCount: 0 },
    ]);
    assert.ok(um);
    assert.ok(gerar);
    assert.equal(um.continueLabel, en.course.continue_other.replace('{{count}}', '3'));
    assert.equal(gerar.continueLabel, en.course.generate);
    assert.equal(courseProgressText('3/5'), en.course.progress.replace('{{progress}}', '3/5'));
    assert.equal(courseProgressText(undefined), en.course.noLessons);

    assert.equal(defaultTreeTitle(), en.trilha.tree.title);
    assert.equal(defaultTreeEmpty(), en.trilha.tree.empty);
    const labels = defaultStateLabels();
    assert.equal(labels.done, en.trilha.tree.stateDone);
    assert.equal(
      nodeAriaLabel({ ...pasta, label: 'Root' }, labels),
      `Root — ${en.trilha.tree.stateDone}, ${en.trilha.tree.nodeChildren.replace('{{count}}', '1')}`,
    );

    // `lesson.untitled` no fallback de `toTreeView` (título vazio).
    const [noTitle] = toTreeView([{ lessonId: 'x', title: '', completedAt: null, children: [] }]);
    assert.ok(noTitle);
    assert.equal(noTitle.label, en.lesson.untitled);
  });
});
