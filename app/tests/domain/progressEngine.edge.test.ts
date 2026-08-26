/**
 * tests/domain/progressEngine.edge.test.ts — TESTES DE BORDA do motor de progressão
 * (electron/main/domain/progressEngine.ts), complemento do progressEngine.test.ts.
 *
 * Cobre o que a suíte básica não pina: nextStep com nós raiz DUPLICADOS na árvore,
 * breakIntoChildren com breakPlan DEGENERADO (0 ou 1 item) garantindo o contrato "≥2
 * filhas por quebra" (auto-suficiente mesmo quando a fiação injeta plano de 0/1 item),
 * treeToView com nó órfão (parent aponta para id ausente), e treeToView com ciclo
 * (A ⊆ B, B ⊆ A) que não trava nem duplica nós.
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

describe('breakIntoChildren — breakPlan de 1 item (contrato ≥2 por quebra)', () => {
  it('breakPlan de 1 item → devolve ≥2 filhas, cada uma com parent/origin = id quebrado e body não vazio', () => {
    const children = breakIntoChildren({
      lessonId: 'orig-1',
      lessonTitle: 'Loops',
      lessonBody: 'corpo',
      difficulty: 3,
      breakPlan: { items: [{ title: 'Só uma', bodySubset: 'x' }] },
    });
    assert.ok(children.length >= 2, 'garante ≥2 filhas por quebra');
    for (const c of children) {
      assert.equal(c.parentLessonId, 'orig-1');
      assert.equal(c.originLessonId, 'orig-1');
      assert.ok(c.title.trim(), 'título não vazio');
    }
    assert.equal(children[0].title, 'Só uma', '1ª filha = a ideia-chave do plano');
    assert.equal(children[0].difficultyK, 1, '1ª filha no nível base');
    // 2ª filha é revisão/prática derivada do corpo (não vazia).
    assert.ok(children[1].body.trim(), '2ª filha (revisão guiada) tem body não vazio');
  });

  it('breakPlan com item sem title → 1ª usa `${lessonTitle} (parte N)`; ainda gera 2ª filha', () => {
    const children = breakIntoChildren({
      lessonId: 'orig-2',
      lessonTitle: 'Funções',
      lessonBody: 'x',
      difficulty: 2,
      breakPlan: { items: [{ title: '  ', bodySubset: 'p1' }] },
    });
    assert.ok(children.length >= 2);
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

describe('breakIntoChildren — breakPlan vazio (contrato ≥2 por quebra)', () => {
  it('breakPlan vazio MAS lessonBody não vazio → devolve ≥2 filhas de prática guiada derivadas', () => {
    const children = breakIntoChildren({
      lessonId: 'orig-empty',
      lessonTitle: 'Vocabulário',
      lessonBody: 'corpo robusto a recapitular',
      difficulty: 2,
      breakPlan: { items: [] },
    });
    assert.ok(children.length >= 2, 'garante ≥2 filhas mesmo sem plano');
    for (const c of children) {
      assert.equal(c.parentLessonId, 'orig-empty');
      assert.equal(c.originLessonId, 'orig-empty');
      assert.ok(c.body.trim(), 'corpo derivado não vazio');
    }
  });

  it('breakPlan vazio E lessonBody vazio → devolve [] (sem conteúdo para quebrar)', () => {
    const children = breakIntoChildren({
      lessonId: 'orig-no-content',
      lessonTitle: 'Vazio',
      lessonBody: '   ',
      difficulty: 2,
      breakPlan: { items: [] },
    });
    assert.equal(children.length, 0, 'sem corpo não fabrica conteúdo do nada');
  });
});

describe('breakIntoChildren — regressão 1:1 para breakPlan de 2+ itens', () => {
  it('breakPlan de 2 itens → devolve exatamente 2 filhas (1:1 preservada)', () => {
    const children = breakIntoChildren({
      lessonId: 'orig-n',
      lessonTitle: 'Assunto',
      lessonBody: 'corpo',
      difficulty: 2,
      breakPlan: {
        items: [
          { title: 'P1', bodySubset: 'a' },
          { title: 'P2', bodySubset: 'b' },
        ],
      },
    });
    assert.equal(children.length, 2, '1:1 preservada para 2 itens');
    assert.equal(children[0].title, 'P1');
    assert.equal(children[1].title, 'P2');
    assert.equal(children[0].body, 'a');
    assert.equal(children[1].body, 'b');
  });

  it('dificuldades seguem a ramp (base, base+1...) sem cap 5 e valem 1..5', () => {
    const children = breakIntoChildren({
      lessonId: 'orig-ramp',
      lessonTitle: 'Assunto',
      lessonBody: 'corpo',
      difficulty: 1,
      breakPlan: {
        items: [
          { title: 'A', bodySubset: 'a' },
          { title: 'B', bodySubset: 'b' },
          { title: 'C', bodySubset: 'c' },
        ],
      },
    });
    assert.equal(children.length, 3);
    assert.deepEqual(
      children.map((c) => c.difficultyK),
      [1, 2, 3],
      'ramp gradual base+unidade, sem cap aqui',
    );
    for (const c of children) {
      assert.ok(c.difficultyK >= 1 && c.difficultyK <= 5);
    }
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
