/**
 * tests/ui/treeView.test.ts — mapeamento da árvore de evolução para render.
 *
 * Cobre `toTreeView` (e countTreeNodes/countDoneNodes) de src/lib/treeView,
 * SEM jsdom (node:test). O componente React (EvolutionTree) NÃO é unit-testado
 * — convenção do repo.
 *
 * Contratos que mordem:
 *   1. `completedAt` presente → state 'done'; ausente/null → 'pending'.
 *   2. Filhos mapeados recursivamente, ordem preservada.
 *   3. Entrada vazia/nula → [] (árvore vazia não derruba a UI).
 *   4. Nó sem título → fallback legível.
 *   5. Contagem total vs concluídas (recursiva) p/ o rodapé.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  toTreeView,
  countTreeNodes,
  countDoneNodes,
  type TreeViewSourceNode,
} from '../../src/lib/treeView';

const source: TreeViewSourceNode[] = [
  {
    lessonId: 'a',
    title: 'Raiz',
    completedAt: '2026-01-01T00:00:00.000Z',
    children: [
      { lessonId: 'b', title: 'Filha pendente', completedAt: null, children: [] },
      {
        lessonId: 'c',
        title: 'Filha concluída',
        completedAt: '2026-01-02T00:00:00.000Z',
        children: [
          { lessonId: 'd', title: 'Neta', completedAt: '2026-01-03T00:00:00.000Z', children: [] },
        ],
      },
    ],
  },
];

describe('toTreeView', () => {
  it('mapeia completedAt → state done / pendente → pending', () => {
    const [root] = toTreeView(source) ?? [];
    assert.ok(root);
    assert.equal(root.state, 'done');
    assert.equal(root.children[0]?.state, 'pending');
    assert.equal(root.children[1]?.state, 'done');
  });

  it('mapeia filhos recursivamente preservando a ordem', () => {
    const [root] = toTreeView(source) ?? [];
    assert.equal(root?.children.length, 2);
    assert.equal(root?.children[0]?.lessonId, 'b');
    assert.equal(root?.children[1]?.children[0]?.lessonId, 'd');
    assert.equal(root?.children[1]?.children[0]?.state, 'done');
  });

  it('alimenta label a partir do título; fallback quando vazio', () => {
    const [root] = toTreeView(source) ?? [];
    assert.equal(root?.label, 'Raiz');
    const empty = toTreeView([{ lessonId: 'x', title: '   ', completedAt: null, children: [] }]);
    assert.equal(empty[0]?.label, 'Aula sem título');
  });

  it('entrada vazia / nula devolve array vazio (não derruba UI)', () => {
    assert.deepEqual(toTreeView([]), []);
    assert.deepEqual(toTreeView(null), []);
    assert.deepEqual(toTreeView(undefined), []);
  });

  it('descarta nós inválidos (sem lessonId)', () => {
    const bad = [{ title: 'sem id', completedAt: null, children: [] }] as unknown as TreeViewSourceNode[];
    assert.deepEqual(toTreeView(bad), []);
  });
});

describe('contagens recursivas', () => {
  it('countTreeNodes soma pai + todos os filhos', () => {
    assert.equal(countTreeNodes(source), 4);
    assert.equal(countTreeNodes([]), 0);
  });

  it('countDoneNodes conta só concluídas, recursivamente', () => {
    const view = toTreeView(source);
    assert.equal(countDoneNodes(view), 3); // a, c, d
  });
});
