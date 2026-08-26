/**
 * tests/ui/lessonSelection.test.ts — seleção de aulas por assunto (lógica pura).
 *
 * Cobre `buildCourseList` e `activeCourseLabel` de src/lib/lessonSelection,
 * SEM jsdom (node:test). Os componentes React (CourseSelector/EvolutionTree)
 * NÃO são unit-testados — convenção do repo: só o módulo puro é testado.
 *
 * Contratos que mordem:
 *   1. "Continuar" SEMPRE mostra o nº de aulas feitas do assunto ("Continuar · 3
 *      aulas feitas") — requisito explícito do usuário; usar `answeredCount`.
 *   2. Assunto sem aulas → botão "Gerar nova aula" (a primeira ação cria).
 *   3. Singular/plural ("1 aula feita" vs "N aulas feitas").
 *   4. `activeCourseLabel` devolve o rótulo + contagem de concluídas; fallback.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCourseList,
  activeCourseLabel,
  type CourseSubject,
} from '../../src/lib/lessonSelection';

const subjects: CourseSubject[] = [
  { id: '1', name: 'Árvores binárias', slug: 'arvores', lessonCount: 5, answeredCount: 3 },
  { id: '2', name: 'Equações', slug: 'equacoes', lessonCount: 3, answeredCount: 1 },
  { id: '3', name: 'Recursão', slug: 'recursao', lessonCount: 0, answeredCount: 0 },
];

describe('buildCourseList', () => {
  it('anexa a contagem de aulas feitas ao rótulo Continuar (answeredCount)', () => {
    const list = buildCourseList(subjects);
    const arvores = list.find((c) => c.slug === 'arvores');
    assert.ok(arvores);
    assert.equal(arvores.continueLabel, 'Continuar · 3 aulas feitas');
    assert.equal(arvores.lessonsDone, 3);
    assert.equal(arvores.progressLabel, '3/5');
  });

  it('usa singular quando só há UMA aula feita', () => {
    const list = buildCourseList(subjects);
    const equacoes = list.find((c) => c.slug === 'equacoes');
    assert.ok(equacoes);
    assert.equal(equacoes.continueLabel, 'Continuar · 1 aula feita');
    assert.equal(equacoes.progressLabel, '1/3');
  });

  it('vira "Gerar nova aula" quando o assunto ainda não tem aulas', () => {
    const list = buildCourseList(subjects);
    const recursao = list.find((c) => c.slug === 'recursao');
    assert.ok(recursao);
    assert.equal(recursao.continueLabel, 'Gerar nova aula');
    assert.equal(recursao.lessonsDone, 0);
    assert.equal(recursao.progressLabel, '0');
  });

  it('preserva slug e rótulo legível do assunto', () => {
    const list = buildCourseList(subjects);
    assert.equal(list.length, 3);
    assert.equal(list[0]?.slug, 'arvores');
    assert.equal(list[0]?.label, 'Árvores binárias');
  });

  it('lida com entrada vazia / nula sem derrubar', () => {
    assert.deepEqual(buildCourseList([]), []);
    assert.deepEqual(buildCourseList(null as unknown as CourseSubject[]), []);
  });

  it('normaliza contagens ausentes/negativas para 0', () => {
    const list = buildCourseList([
      { id: 'x', name: 'Faltando', slug: 'f', lessonCount: NaN, answeredCount: -4 },
    ]);
    assert.equal(list[0]?.lessonsDone, 0);
    assert.equal(list[0]?.progressLabel, '0');
    assert.equal(list[0]?.continueLabel, 'Gerar nova aula');
  });
});

describe('activeCourseLabel', () => {
  const tree = [
    {
      lessonId: 'a',
      title: 'Intro',
      completedAt: '2026-01-01',
      children: [
        { lessonId: 'b', title: 'Filha', completedAt: null, children: [] as never[] },
        { lessonId: 'c', title: 'Filha2', completedAt: '2026-01-02', children: [] as never[] },
      ],
    },
  ];

  it('rótulo do curso ativo sem contagem quando nada concluído', () => {
    const label = activeCourseLabel({
      slug: 'arvores',
      label: 'Árvores binárias',
      lessons: [{ lessonId: 'a', title: 'Intro', completedAt: null, children: [] }],
    });
    assert.equal(label, 'Árvores binárias');
  });

  it('apensa a contagem de concluídas quando há', () => {
    const label = activeCourseLabel({ slug: 'arvores', label: 'Árvores binárias', lessons: tree });
    assert.equal(label, 'Árvores binárias (2)');
  });

  it('fallback legível quando não há curso', () => {
    assert.equal(activeCourseLabel(null), 'Nenhuma aula em andamento');
    assert.equal(activeCourseLabel({ slug: 'x', label: '', lessons: [] }), 'Nenhuma aula em andamento');
  });
});
