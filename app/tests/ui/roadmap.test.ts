/**
 * tests/ui/roadmap.test.ts — montagem das seções da trilha (onda2-trilha).
 *
 * Cobre `buildRoadmapSections` (+ isRoadmapEmpty/isRoadmapComplete) de
 * src/lib/roadmap, SEM jsdom (node:test).
 *
 * Contratos que mordem:
 *   1. Agrupamento por nível via difficultyToLevel (1–2, 3, 4–5), ordem da
 *      lista preservada DENTRO de cada nível.
 *   2. Seções apenas com aulas, em ordem Iniciante → Intermediário → Avançado.
 *   3. 'done' quando completedAt preenchido; 'current' = a PRIMEIRA pendente
 *      na varredura de níveis (existe no máximo um); resto 'pending'.
 *   4. Trilha 100% concluída não tem 'current'.
 *   5. Entrada vazia/nula → resultado vazio (não derruba a UI); aulas inválidas
 *      (sem id) são descartadas.
 *   6. Dificuldade ausente/inválida cai em 'beginner' (piso conservador).
 *   7. Agregados total/done da matéria inteira.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { LessonSummary } from '../../shared/ipc-contract';
import {
  buildRoadmapSections,
  isRoadmapComplete,
  isRoadmapEmpty,
  type RoadmapLessonNode,
  type RoadmapResult,
} from '../../src/lib/roadmap';

function lesson(partial: Partial<LessonSummary> & { id: string }): LessonSummary {
  return {
    title: 'Aula',
    body: '',
    difficulty: 1,
    completedAt: null,
    ...partial,
  };
}

function lessonIds(nodes: RoadmapLessonNode[]): string[] {
  return nodes.map((n) => n.lessonId);
}

describe('buildRoadmapSections — agrupamento por nível', () => {
  it('agrupa por difficultyToLevel e ordena seções Iniciante → Avançado', () => {
    const lessons: LessonSummary[] = [
      lesson({ id: 'a1', difficulty: 5 }), // advanced
      lesson({ id: 'b1', difficulty: 1 }), // beginner
      lesson({ id: 'c1', difficulty: 3 }), // intermediate
      lesson({ id: 'b2', difficulty: 2 }), // beginner
    ];
    const result = buildRoadmapSections(lessons);
    assert.deepEqual(
      result.sections.map((s) => s.level),
      ['beginner', 'intermediate', 'advanced'],
    );
    // ordem da lista preservada dentro de cada nível
    assert.deepEqual(lessonIds(result.sections[0]!.lessons), ['b1', 'b2']);
    assert.deepEqual(lessonIds(result.sections[1]!.lessons), ['c1']);
    assert.deepEqual(lessonIds(result.sections[2]!.lessons), ['a1']);
  });

  it('dificuldade ausente/inválida cai em beginner (nunca some da trilha)', () => {
    const result = buildRoadmapSections([
      lesson({ id: 'x', difficulty: undefined as unknown as number }),
      lesson({ id: 'y', difficulty: 7 }),
      lesson({ id: 'z', difficulty: 2 }),
    ]);
    assert.equal(result.sections.length, 1);
    assert.equal(result.sections[0]!.level, 'beginner');
    assert.deepEqual(lessonIds(result.sections[0]!.lessons), ['x', 'y', 'z']);
  });

  it('não cria seções vazias para níveis sem aulas', () => {
    const result = buildRoadmapSections([lesson({ id: 'b', difficulty: 1 })]);
    assert.deepEqual(
      result.sections.map((s) => s.level),
      ['beginner'],
    );
  });

  it('descarta aulas inválidas (sem id) sem derrubar a montagem', () => {
    const result = buildRoadmapSections([
      lesson({ id: 'ok', difficulty: 1 }),
      { title: 'sem id', body: '', difficulty: 3, completedAt: null } as unknown as LessonSummary,
      null as unknown as LessonSummary,
      undefined as unknown as LessonSummary,
    ]);
    assert.deepEqual(lessonIds(result.sections[0]!.lessons), ['ok']);
    assert.equal(result.total, 1);
  });

  it('título em branco ganha fallback legível', () => {
    const result = buildRoadmapSections([lesson({ id: 'x', title: '   ' })]);
    assert.equal(result.sections[0]!.lessons[0]!.title, 'Aula sem título');
  });
});

describe('buildRoadmapSections — estados done/current/pending', () => {
  it('completedAt presente → done; a primeira pendente vira current', () => {
    const result = buildRoadmapSections([
      lesson({ id: 'done1', difficulty: 1, completedAt: '2026-01-01T00:00:00.000Z' }),
      lesson({ id: 'cur', difficulty: 1 }), // primeira pendente
      lesson({ id: 'pend', difficulty: 1 }),
    ]);
    const nodes = result.sections[0]!.lessons;
    assert.deepEqual(nodes.map((n) => n.state), ['done', 'current', 'pending']);
    assert.equal(result.currentLessonId, 'cur');
  });

  it('current é a primeira pendente varrendo os NÍVEIS em ordem', () => {
    const result = buildRoadmapSections([
      lesson({ id: 'int-ok', difficulty: 3, completedAt: '2026-01-01T00:00:00.000Z' }),
      lesson({ id: 'adv', difficulty: 5 }), // pendente no nível avançado
      lesson({ id: 'beg', difficulty: 1 }), // pendente no nível iniciante
    ]);
    // varredura Iniciante → ...: 'beg' (beginner) vem antes de 'adv' (advanced)
    assert.equal(result.currentLessonId, 'beg');
    const byId = new Map(
      result.sections.flatMap((s) => s.lessons.map((n) => [n.lessonId, n.state] as const)),
    );
    assert.equal(byId.get('int-ok'), 'done');
    assert.equal(byId.get('beg'), 'current');
    assert.equal(byId.get('adv'), 'pending');
  });

  it('existe no máximo UM current', () => {
    const result = buildRoadmapSections([
      lesson({ id: 'a', difficulty: 1 }),
      lesson({ id: 'b', difficulty: 1 }),
      lesson({ id: 'c', difficulty: 2 }),
    ]);
    const currents = result.sections.flatMap((s) => s.lessons).filter((n) => n.state === 'current');
    assert.equal(currents.length, 1);
    assert.equal(currents[0]!.lessonId, 'a');
  });

  it('trilha 100% concluída não tem current', () => {
    const result = buildRoadmapSections([
      lesson({ id: 'a', difficulty: 1, completedAt: '2026-01-01T00:00:00.000Z' }),
      lesson({ id: 'b', difficulty: 3, completedAt: '2026-01-02T00:00:00.000Z' }),
    ]);
    assert.equal(result.currentLessonId, null);
    for (const s of result.sections) {
      for (const n of s.lessons) assert.equal(n.state, 'done');
    }
  });
});

describe('buildRoadmapSections — agregados e vazios', () => {
  it('agrega total/done por seção e para a matéria inteira', () => {
    const result = buildRoadmapSections([
      lesson({ id: 'a', difficulty: 1, completedAt: '2026-01-01T00:00:00.000Z' }),
      lesson({ id: 'b', difficulty: 1 }),
      lesson({ id: 'c', difficulty: 3, completedAt: '2026-01-02T00:00:00.000Z' }),
    ]);
    assert.equal(result.total, 3);
    assert.equal(result.done, 2);
    assert.equal(result.sections[0]!.total, 2);
    assert.equal(result.sections[0]!.done, 1);
    assert.equal(result.sections[1]!.total, 1);
    assert.equal(result.sections[1]!.done, 1);
  });

  it('entrada vazia/nula → resultado vazio (não derruba a UI)', () => {
    const empty: RoadmapResult = {
      sections: [],
      total: 0,
      done: 0,
      currentLessonId: null,
    };
    assert.deepEqual(buildRoadmapSections([]), empty);
    assert.deepEqual(buildRoadmapSections(null), empty);
    assert.deepEqual(buildRoadmapSections(undefined), empty);
  });

  it('completedAt vazio (string em branco) NÃO conta como concluído', () => {
    const result = buildRoadmapSections([lesson({ id: 'a', completedAt: '' })]);
    assert.equal(result.sections[0]!.lessons[0]!.state, 'current');
    assert.equal(result.sections[0]!.lessons[0]!.completedAt, null);
  });
});

describe('isRoadmapEmpty / isRoadmapComplete', () => {
  const empty = buildRoadmapSections([]);
  const partial = buildRoadmapSections([lesson({ id: 'a', difficulty: 1 })]);
  const complete = buildRoadmapSections([
    lesson({ id: 'a', difficulty: 1, completedAt: '2026-01-01T00:00:00.000Z' }),
  ]);

  it('isRoadmapEmpty: true só sem aulas', () => {
    assert.equal(isRoadmapEmpty(empty), true);
    assert.equal(isRoadmapEmpty(partial), false);
    assert.equal(isRoadmapEmpty(complete), false);
  });

  it('isRoadmapComplete: true só com ≥1 aula e todas concluídas', () => {
    assert.equal(isRoadmapComplete(empty), false);
    assert.equal(isRoadmapComplete(partial), false);
    assert.equal(isRoadmapComplete(complete), true);
  });
});
