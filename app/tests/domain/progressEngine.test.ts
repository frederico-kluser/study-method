/**
 * tests/domain/progressEngine.test.ts — contrato do MOTOR DE PROGRESSÃO + ÁRVORE +
 * PRÓXIMA-AULA (domínio puro, sem jsdom/sqlite/electron).
 *
 * Escritos para MORDER os quatro contratos do módulo:
 *   1. nextStep — aula incompleta mais básica vem primeiro (`continue-existing`);
 *      todas completas → `generate-new` com difficultyRamp; sem aulas → `none`.
 *   2. progressionDifficulty — answered=0 → baseline; respostas sobem; cap em 5.
 *   3. breakIntoChildren — 2+ sub-aulas do breakPlan → 2+ filhas, cada uma com
 *      parentLessonId = originLessonId = id da aula quebrada, body preenchido e a 1ª
 *      filha no nível base (mais gradual).
 *   4. treeToView — `{root, nodes}` simples (raiz + 2 filhos via parentLessonId) →
 *      aninhamento correto; NÃO deixa loops (cada nó aparece UMA vez).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  breakIntoChildren,
  MASTERY_THRESHOLD,
  nextStep,
  progressionDifficulty,
  treeToView,
} from '../../electron/main/domain/progressEngine';

import type { NextStepParams, ProgressTree } from '../../electron/main/domain/progressEngine';

describe('nextStep — próxima aula do mesmo assunto', () => {
  it('aula incompleta (difficulty 1) e uma completa (difficulty 3) → continue-existing com a difficulty 1', () => {
    const tree: ProgressTree = {
      root: { lessonId: 'a', title: 'Root', parentLessonId: null, originLessonId: null, completedAt: null },
      nodes: [
        { lessonId: 'a', title: 'A', parentLessonId: null, originLessonId: null, completedAt: '2026-01-01' },
        { lessonId: 'b', title: 'B', parentLessonId: 'a', originLessonId: null, completedAt: null },
      ],
    };
    const lessons: NextStepParams['lessons'] = [
      { id: 'a', title: 'A', body: 'x', difficulty: 3, completedAt: '2026-01-01' },
      { id: 'b', title: 'B', body: 'y', difficulty: 1, completedAt: null },
    ];
    const res = nextStep({ subjectSlug: 'alg', completedLessonIds: ['a'], tree, lessons, answeredTotal: 0 });
    assert.equal(res.type, 'continue-existing');
    if (res.type === 'continue-existing') {
      assert.equal(res.lessonId, 'b');
    }
  });

  it('todas completas com aulas → generate-new com difficultyRamp', () => {
    const tree: ProgressTree = {
      root: { lessonId: 'a', title: 'A', parentLessonId: null, originLessonId: null, completedAt: '2026-01-01' },
      nodes: [
        { lessonId: 'a', title: 'A', parentLessonId: null, originLessonId: null, completedAt: '2026-01-01' },
      ],
    };
    const lessons: NextStepParams['lessons'] = [
      { id: 'a', title: 'A', body: 'x', difficulty: 3, completedAt: '2026-01-01' },
    ];
    const res = nextStep({ subjectSlug: 'alg', completedLessonIds: ['a'], tree, lessons, answeredTotal: 0 });
    assert.equal(res.type, 'generate-new');
    if (res.type === 'generate-new') {
      assert.ok(res.difficultyRamp >= 1, `ramp deve ser >= 1, veio ${res.difficultyRamp}`);
      assert.ok(res.reason.length > 0);
    }
  });

  it('answeredTotal alto eleva o difficultyRamp (mais complexidade)', () => {
    const tree: ProgressTree = {
      root: { lessonId: 'a', title: 'A', parentLessonId: null, originLessonId: null, completedAt: '2026-01-01' },
      nodes: [
        { lessonId: 'a', title: 'A', parentLessonId: null, originLessonId: null, completedAt: '2026-01-01' },
      ],
    };
    const lessons: NextStepParams['lessons'] = [
      { id: 'a', title: 'A', body: 'x', difficulty: 1, completedAt: '2026-01-01' },
    ];
    const low = nextStep({ subjectSlug: 'alg', completedLessonIds: ['a'], tree, lessons, answeredTotal: 2 });
    const high = nextStep({ subjectSlug: 'alg', completedLessonIds: ['a'], tree, lessons, answeredTotal: MASTERY_THRESHOLD + 5 });
    const rLow = low.type === 'generate-new' ? low.difficultyRamp : 0;
    const rHigh = high.type === 'generate-new' ? high.difficultyRamp : 0;
    assert.ok(rHigh >= rLow, `rampa alta (${rHigh}) deve ser >= baixa (${rLow})`);
    // Com MASTERY_THRESHOLD+5 o ramp sobe de fato em relação a poucas respostas.
    assert.ok(rHigh > rLow, `com muita prática a rampa deve subir: ${rLow} → ${rHigh}`);
  });

  it('sem aulas nenhuma (tree.nodes vazio) → none', () => {
    const res = nextStep({
      subjectSlug: 'alg',
      completedLessonIds: [],
      tree: { root: null, nodes: [] },
      lessons: [],
      answeredTotal: 0,
    });
    assert.equal(res.type, 'none');
  });
});

describe('progressionDifficulty — complexidade crescente com a evolução', () => {
  it('answered=0 → baseline (default 1)', () => {
    assert.equal(progressionDifficulty(0), 1);
    assert.equal(progressionDifficulty(0, 2), 2);
  });

  it('respostas sobem gradualmente a dificuldade', () => {
    assert.equal(progressionDifficulty(2), 1); // ainda abaixo do alvo
    assert.equal(progressionDifficulty(3), 2); // alvo atingido → +1
    assert.equal(progressionDifficulty(6), 3);
  });

  it('cap em 5', () => {
    assert.equal(progressionDifficulty(1000), 5);
    assert.equal(progressionDifficulty(1000, 4), 5);
    assert.equal(progressionDifficulty(1000, 9), 5);
  });
});

describe('breakIntoChildren — quebra da aula em filhas', () => {
  it('2+ sub-aulas do breakPlan → 2+ filhas com parent/origin = aula quebrada e 1ª no nível base', () => {
    const children = breakIntoChildren({
      lessonId: 'orig-1',
      lessonTitle: 'Loops',
      lessonBody: 'corpo original',
      difficulty: 3,
      breakPlan: {
        items: [
          { title: 'Como o for roda', bodySubset: 'parte focada 1' },
          { title: 'Quando o while trava', bodySubset: 'parte focada 2' },
          { title: 'Treinar um for sozinho', bodySubset: 'parte focada 3' },
        ],
      },
    });

    assert.ok(children.length >= 2, `esperava 2+ filhas, veio ${children.length}`);
    for (const child of children) {
      assert.equal(child.parentLessonId, 'orig-1');
      assert.equal(child.originLessonId, 'orig-1');
      assert.ok(child.body.length > 0, 'body (bodySubset) deve estar preenchido');
      assert.ok(child.title.length > 0);
    }
    // 1ª filha recomeça no nível base (mais gradual).
    assert.equal(children[0].difficultyK, 1);
  });

  it('baselineDifficulty custom na 1ª filha e as seguintes sobem', () => {
    const children = breakIntoChildren({
      lessonId: 'orig-2',
      lessonTitle: 'Funções',
      lessonBody: 'x',
      difficulty: 3,
      baselineDifficulty: 2,
      breakPlan: {
        items: [
          { title: 'Definir função', bodySubset: 'p1' },
          { title: 'Parâmetros', bodySubset: 'p2' },
          { title: 'Retorno', bodySubset: 'p3' },
          { title: 'Treino', bodySubset: 'p4' },
        ],
      },
    });
    assert.equal(children[0].difficultyK, 2);
    assert.ok(children[1].difficultyK > children[0].difficultyK, '2ª filha deve subir em relação à 1ª');
  });

  it('breakPlan vazio com lessonBody vazio → nenhuma filha (sem conteúdo para quebrar)', () => {
    const children = breakIntoChildren({
      lessonId: 'orig-3',
      lessonTitle: 'X',
      lessonBody: '',
      difficulty: 2,
      breakPlan: { items: [] },
    });
    assert.deepEqual(children, []);
  });

  it('breakPlan vazio MAS lessonBody não vazio → devolve ≥2 filhas de prática guiada derivadas', () => {
    const children = breakIntoChildren({
      lessonId: 'orig-3b',
      lessonTitle: 'X',
      lessonBody: 'corpo para recapitular',
      difficulty: 2,
      breakPlan: { items: [] },
    });
    assert.ok(children.length >= 2, `esperava 2+ filhas, veio ${children.length}`);
    for (const child of children) {
      assert.equal(child.parentLessonId, 'orig-3b');
      assert.equal(child.originLessonId, 'orig-3b');
      assert.ok(child.body.length > 0, 'corpo derivado deve estar preenchido');
    }
  });
});

describe('treeToView — árvore aninhada pronta para a UI', () => {
  it('raiz + 2 filhos via parentLessonId → output aninhado correto', () => {
    const tree: ProgressTree = {
      root: { lessonId: 'r', title: 'Raiz', parentLessonId: null, originLessonId: null, completedAt: '2026-01-01' },
      nodes: [
        { lessonId: 'r', title: 'Raiz', parentLessonId: null, originLessonId: null, completedAt: '2026-01-01' },
        { lessonId: 'c1', title: 'Filha 1', parentLessonId: 'r', originLessonId: 'r', completedAt: null },
        { lessonId: 'c2', title: 'Filha 2', parentLessonId: 'r', originLessonId: 'r', completedAt: null },
      ],
    };
    const view = treeToView(tree);
    assert.equal(view.length, 1);
    assert.equal(view[0].lessonId, 'r');
    assert.equal(view[0].children.length, 2);
    assert.deepEqual(
      view[0].children.map((c) => c.lessonId).sort(),
      ['c1', 'c2'],
    );
  });

  it('nós sem pai resolvido não cravam em loop (cada nó aparece uma vez)', () => {
    // 'orphan' tem parent apontando para id que NÃO existe no conjunto → cai como
    // raiz de último recurso; 'a' é raiz flutuante. Nenhum nó aparece duas vezes.
    const tree: ProgressTree = {
      root: { lessonId: 'a', title: 'A', parentLessonId: null, originLessonId: null, completedAt: null },
      nodes: [
        { lessonId: 'a', title: 'A', parentLessonId: null, originLessonId: null, completedAt: null },
        { lessonId: 'orphan', title: 'Sem pai', parentLessonId: 'nao-existe', originLessonId: null, completedAt: null },
      ],
    };
    const view = treeToView(tree);
    const flat = flattenProgress(view);
    assert.equal(flat.length, 2, 'cada nó (a + orphan) aparece uma vez');
    assert.equal(new Set(flat.map((n) => n.lessonId)).size, 2, 'sem ids repetidos (loop)');
  });

  it('tree vazia → []', () => {
    assert.deepEqual(treeToView({ root: null, nodes: [] }), []);
  });
});

interface Flattenable {
  lessonId: string;
  children: Flattenable[];
}

/** Achata uma árvore aninhada numa lista (para assert de unicidade/loop). */
function flattenProgress(nodes: Flattenable[]): Array<{ lessonId: string }> {
  const out: Array<{ lessonId: string }> = [];
  const walk = (level: Flattenable[]): void => {
    for (const n of level) {
      out.push({ lessonId: n.lessonId });
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}
