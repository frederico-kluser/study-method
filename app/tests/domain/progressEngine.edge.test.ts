/**
 * tests/domain/progressEngine.edge.test.ts — TESTES DE BORDA do motor de progressão
 * (electron/main/domain/progressEngine.ts), complemento do progressEngine.test.ts.
 *
 * Cobre o que a suíte básica não pina: nextStep com nós raiz DUPLICADOS na árvore,
 * breakIntoChildren com breakPlan de 1 item (contrato "≥2 ou trata", comportamento
 * observado: 1 filha), treeToView com nó órfão (parent aponta para id ausente), e
 * treeToView com ciclo (A ⊆ B, B ⊆ A) que não trava nem duplica nós.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  breakIntoChildren,
  nextStep,
  progressionDifficulty,
  treeToView,
} from '../../electron/main/domain/progressEngine';

import type { NextStepParams, ProgressTree } from '../../electron/main/domain/progressEngine';

interface FlatNode {
  lessonId: string;
  children: FlatNode[];
}
function flattenProgress(nodes: FlatNode[]): string[] {
  const out: string[] = [];
  const walk = (level: FlatNode[]): void => {
    for (const n of level) {
      out.push(n.lessonId);
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

describe('nextStep — árvores degeneradas', () => {
  it('nós raiz duplicados (mesmo lessonId) não quebram; continua pela pendente', () => {
    const tree: ProgressTree = {
      root: { lessonId: 'a', title: 'A', parentLessonId: null, originLessonId: null, completedAt: null },
      nodes: [
        { lessonId: 'a', title: 'A', parentLessonId: null, originLessonId: null, completedAt: null },
        { lessonId: 'a', title: 'A', parentLessonId: null, originLessonId: null, completedAt: null },
      ],
    };
    const lessons: NextStepParams['lessons'] = [
      { id: 'a', title: 'A', body: 'x', difficulty: 2, completedAt: null },
    ];
    const res = nextStep({ subjectSlug: 's', completedLessonIds: [], tree, lessons, answeredTotal: 0 });
    // Duplicatas não quebram: ainda é continue-existing apontando para a pendente.
    assert.equal(res.type, 'continue-existing');
    if (res.type === 'continue-existing') assert.equal(res.lessonId, 'a');
  });

  it('nós duplicados com lessons ausentes caem no fallback da árvore (pendente)', () => {
    const tree: ProgressTree = {
      root: { lessonId: 'a', title: 'A', parentLessonId: null, originLessonId: null, completedAt: null },
      nodes: [
        { lessonId: 'a', title: 'A', parentLessonId: null, originLessonId: null, completedAt: null },
        { lessonId: 'a', title: 'A', parentLessonId: null, originLessonId: null, completedAt: null },
      ],
    };
    const res = nextStep({ subjectSlug: 's', completedLessonIds: [], tree, lessons: [], answeredTotal: 0 });
    assert.equal(res.type, 'continue-existing');
    if (res.type === 'continue-existing') assert.equal(res.lessonId, 'a');
  });

  it('lessons undefined (sem lista) → ainda usa o fallback da árvore, não crashei', () => {
    const tree: ProgressTree = {
      root: { lessonId: 'a', title: 'A', parentLessonId: null, originLessonId: null, completedAt: null },
      nodes: [
        { lessonId: 'a', title: 'A', parentLessonId: null, originLessonId: null, completedAt: null },
      ],
    };
    const res = nextStep({
      subjectSlug: 's',
      completedLessonIds: [],
      tree,
      lessons: undefined as unknown as NextStepParams['lessons'],
      answeredTotal: 0,
    });
    assert.equal(res.type, 'continue-existing');
  });
});

describe('progressionDifficulty — extremos', () => {
  it('answeredCount negativo/NaN/Infinity → baseline', () => {
    assert.equal(progressionDifficulty(-5), 1);
    assert.equal(progressionDifficulty(NaN), 1);
    // Infinity NÃO é finito → clampDifficulty retorna o baseline (não crashei, não cap).
    assert.equal(progressionDifficulty(Infinity), 1, 'Infinity → baseline (finite-guard)');
    assert.equal(progressionDifficulty(-Infinity), 1);
  });

  it('baseline NaN/Infinity → fallback 1', () => {
    assert.equal(progressionDifficulty(0, NaN), 1);
    // baseline Infinity NÃO é finito → cai no fallback 1 (não crashei).
    assert.equal(progressionDifficulty(0, Infinity), 1, 'baseline Infinity → baseline fallback');
  });
});

describe('breakIntoChildren — breakPlan de 1 item (contrato ≥2 ou trata)', () => {
  it('comportamento observado: breakPlan de 1 item → 1 filha (não garante ≥2 no motor puro)', () => {
    const children = breakIntoChildren({
      lessonId: 'orig-1',
      lessonTitle: 'Loops',
      lessonBody: 'corpo',
      difficulty: 3,
      breakPlan: { items: [{ title: 'Só uma', bodySubset: 'x' }] },
    });
    assert.equal(children.length, 1);
    assert.equal(children[0].parentLessonId, 'orig-1');
    assert.equal(children[0].originLessonId, 'orig-1');
    assert.equal(children[0].difficultyK, 1, '1ª filha no nível base');
    assert.deepEqual(children[0].title, 'Só uma');
  });

  it('breakPlan com item sem title → usa `${lessonTitle} (parte N)`', () => {
    const children = breakIntoChildren({
      lessonId: 'orig-2',
      lessonTitle: 'Funções',
      lessonBody: 'x',
      difficulty: 2,
      breakPlan: { items: [{ title: '  ', bodySubset: 'p1' }] },
    });
    assert.equal(children[0].title, 'Funções (parte 1)');
    assert.equal(children[0].body, 'p1');
  });

  it('baselineDifficulty NaN → fallback 1 na 1ª filha', () => {
    const children = breakIntoChildren({
      lessonId: 'orig-3',
      lessonTitle: 'X',
      lessonBody: 'x',
      difficulty: 2,
      baselineDifficulty: NaN,
      breakPlan: { items: [{ title: 'T', bodySubset: 'p' }] },
    });
    assert.equal(children[0].difficultyK, 1);
  });
});

describe('treeToView — nós órfãos e ciclos', () => {
  it('nó com parent apontando para id AUSENTE vira raiz de último recurso (sem crash)', () => {
    const tree: ProgressTree = {
      root: { lessonId: 'a', title: 'A', parentLessonId: null, originLessonId: null, completedAt: null },
      nodes: [
        { lessonId: 'a', title: 'A', parentLessonId: null, originLessonId: null, completedAt: null },
        { lessonId: 'orphan', title: 'Sem pai', parentLessonId: 'ghost-inexistente', originLessonId: null, completedAt: null },
      ],
    };
    const view = treeToView(tree);
    const flat = flattenProgress(view);
    assert.equal(flat.length, 2, 'cada nó aparece uma vez (nenhum cai fora)');
    assert.equal(new Set(flat).size, 2, 'sem duplicata');
    assert.ok(flat.includes('orphan'), 'órfão sempre presente na view');
  });

  it('ciclo (A pai B, B pai A) não trava e não duplica nós', () => {
    const tree: ProgressTree = {
      root: null,
      nodes: [
        { lessonId: 'a', title: 'A', parentLessonId: 'b', originLessonId: null, completedAt: null },
        { lessonId: 'b', title: 'B', parentLessonId: 'a', originLessonId: null, completedAt: null },
      ],
    };
    const view = treeToView(tree);
    const flat = flattenProgress(view);
    assert.equal(flat.length, 2);
    assert.equal(new Set(flat).size, 2, 'guarda de ciclo impede loop infinito/duplicação');
  });

  it('tree.root aponta para nó AUSENTE → não cravia; nós com pai resolvido viram raízes', () => {
    const tree: ProgressTree = {
      root: { lessonId: 'ghost-root', title: 'R', parentLessonId: null, originLessonId: null, completedAt: null },
      nodes: [
        { lessonId: 'a', title: 'A', parentLessonId: null, originLessonId: null, completedAt: null },
        { lessonId: 'b', title: 'B', parentLessonId: 'a', originLessonId: null, completedAt: null },
      ],
    };
    const view = treeToView(tree);
    const flat = flattenProgress(view);
    assert.equal(flat.length, 2, 'a e b presentes');
    assert.ok(!flat.includes('ghost-root'), 'root fantasma não vira nó');
  });
});
