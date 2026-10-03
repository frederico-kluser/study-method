/**
 * tests/evolutionTreeState.test.ts — estado de LAYOUT do grafo + derivações da
 * árvore de evolução (lógica pura, sem jsdom/React/DOM).
 *
 * O `EvolutionTree.tsx` é só view (convenção do repo: componentes React não
 * são unit-testados); a lógica que ele consumia inline — que pastas estão
 * abertas, o `aria-label` dos nós, o texto de estado e o recuo por
 * profundidade — vive em src/components/tree/evolutionTreeState.ts e é o que
 * este arquivo prova.
 *
 * Contratos que mordem:
 *   1. ESTADO INICIAL = `!collapsed` para TODAS as pastas (folhas não entram).
 *   2. FECHAR uma pasta remove a SUBÁRVORE inteira do estado (o
 *      `<Collapse unmountOnExit>` desmonta os descendentes — ao remontarem
 *      voltam ao estado inicial, exatamente como o `useState` faria).
 *   3. ABRIR uma pasta re-adiciona as descendentes quando `!collapsed`
 *      (é o que o `useState(!defaultCollapsed)` daria ao montar) e mantém-nas
 *      fechadas quando `collapsed`.
 *   4. Transições são IMUTÁVEIS (o conjunto de entrada nunca muda).
 *   5. `aria-label`: "rótulo — estado[, N sub-aula(s)][ · nível]" — pasta
 *      mostra o contador de filhos, folha não; o nível só entra com rótulo.
 *
 * Reprodução: `bash tools/t.sh tests/evolutionTreeState.test.ts`
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_STATE_LABELS,
  DEFAULT_TREE_EMPTY,
  DEFAULT_TREE_TITLE,
  defaultStateLabels,
  defaultTreeEmpty,
  defaultTreeTitle,
  initialTreeOpenState,
  isTreeOpen,
  nodeAriaLabel,
  nodeIndent,
  nodeIsFolder,
  nodeLevelText,
  nodeStateText,
  toggleTreeOpenState,
  NODE_INDENT_STEP,
  type TreeOpenState,
  type TreeStateLabels,
} from '../src/components/tree/evolutionTreeState';
import type { TreeViewNode } from '../src/lib/treeView';
// A copy assertada vem dos resources (pt-BR): o fallback legado de
// `lib/i18nText` tem de ficar em PARIDADE com os locales (chaves `trilha.tree.*`
// — a resolução real via i18next é provada em tests/i18nText.test.ts).
import ptBR from '../src/i18n/locales/pt-BR/translation.json';

const labels: TreeStateLabels = {
  done: 'concluído',
  current: 'em andamento',
  pending: 'pendente',
  level: (level) => `nível ${level}`,
};

function node(
  lessonId: string,
  label: string,
  state: TreeViewNode['state'],
  children: TreeViewNode[] = [],
  level?: TreeViewNode['level'],
): TreeViewNode {
  return { lessonId, label, state, completedAt: null, children, ...(level ? { level } : {}) };
}

/** a (done) ─┬ b (pending, folha)
 *            └ c (current) ─┬ d (pending)
 *                           └ e (done, folha) */
const tree: TreeViewNode[] = [
  node('a', 'Raiz', 'done', [
    node('b', 'Filha folha', 'pending'),
    node('c', 'Filha pasta', 'current', [
      node('d', 'Neta', 'pending'),
      node('e', 'Neta folha', 'done'),
    ]),
  ]),
];

describe('evolutionTreeState — derivações de apresentação', () => {
  it('nodeIsFolder: só nós com filhos são pastas', () => {
    assert.equal(nodeIsFolder(tree[0]), true);
    assert.equal(nodeIsFolder(tree[0].children[0]), false);
    assert.equal(nodeIsFolder(node('x', 'X', 'pending', [])), false);
  });

  it('nodeStateText segue o estado do nó', () => {
    assert.equal(nodeStateText('done', labels), 'concluído');
    assert.equal(nodeStateText('current', labels), 'em andamento');
    assert.equal(nodeStateText('pending', labels), 'pendente');
  });

  it('nodeLevelText: " · <nível>" só com nível E rótulo de nível', () => {
    assert.equal(nodeLevelText('beginner', labels), ' · nível beginner');
    assert.equal(nodeLevelText(undefined, labels), '');
    assert.equal(nodeLevelText('advanced', { ...labels, level: undefined }), '');
  });

  it('aria-label de FOLHA: rótulo — estado (sem contador de filhos)', () => {
    assert.equal(nodeAriaLabel(tree[0].children[0], labels), 'Filha folha — pendente');
  });

  it('aria-label de PASTA: inclui o contador de sub-aulas (chave trilha.tree.nodeChildren)', () => {
    assert.equal(
      nodeAriaLabel(tree[0], labels),
      `Raiz — concluído, ${ptBR.trilha.tree.nodeChildren.replace('{{count}}', '2')}`,
    );
  });

  it('aria-label acrescenta o nível quando há rótulo', () => {
    const comNivel = node('n', 'Com nível', 'current', [], 'advanced');
    assert.equal(nodeAriaLabel(comNivel, labels), 'Com nível — em andamento · nível advanced');
    const pastaComNivel = node('p', 'Pasta', 'pending', [node('f', 'F', 'done')], 'beginner');
    assert.equal(
      nodeAriaLabel(pastaComNivel, labels),
      `Pasta — pendente, ${ptBR.trilha.tree.nodeChildren.replace('{{count}}', '1')} · nível beginner`,
    );
  });

  it('defaults legados (fallback sem i18n) ficam em paridade com trilha.tree.*', () => {
    assert.equal(DEFAULT_TREE_TITLE, ptBR.trilha.tree.title);
    assert.equal(DEFAULT_TREE_EMPTY, ptBR.trilha.tree.empty);
    assert.equal(DEFAULT_STATE_LABELS.done, ptBR.trilha.tree.stateDone);
    assert.equal(DEFAULT_STATE_LABELS.current, ptBR.trilha.tree.stateCurrent);
    assert.equal(DEFAULT_STATE_LABELS.pending, ptBR.trilha.tree.statePending);
  });

  it('acessores defaultTree*/defaultStateLabels apontam para as chaves (pt-BR sem i18n)', () => {
    assert.equal(defaultTreeTitle(), ptBR.trilha.tree.title);
    assert.equal(defaultTreeEmpty(), ptBR.trilha.tree.empty);
    const semNivel = defaultStateLabels();
    assert.equal(nodeStateText('done', semNivel), ptBR.trilha.tree.stateDone);
    assert.equal(nodeStateText('current', semNivel), ptBR.trilha.tree.stateCurrent);
    assert.equal(nodeStateText('pending', semNivel), ptBR.trilha.tree.statePending);
    assert.equal(semNivel.level, undefined);
    assert.equal(nodeAriaLabel(tree[0].children[0], semNivel), 'Filha folha — pendente');
  });

  it('nodeIndent: recuo por profundidade (unidades de spacing — ver nota)', () => {
    assert.equal(nodeIndent(0), 0);
    assert.equal(nodeIndent(1), NODE_INDENT_STEP);
    assert.equal(nodeIndent(3), 3 * NODE_INDENT_STEP);
  });
});

describe('evolutionTreeState — estado de layout do grafo (pastas abertas)', () => {
  it('inicial SEM collapse: todas as pastas abertas, folhas fora do estado', () => {
    const open = initialTreeOpenState(tree, false);
    assert.equal(isTreeOpen(open, 'a'), true);
    assert.equal(isTreeOpen(open, 'c'), true);
    assert.equal(isTreeOpen(open, 'b'), false); // folha
    assert.equal(open.size, 2);
  });

  it('inicial COM collapse: estado vazio (tudo fechado)', () => {
    const open = initialTreeOpenState(tree, true);
    assert.equal(open.size, 0);
  });

  it('entradas vazias/nulas não derrubam', () => {
    assert.equal(initialTreeOpenState([], false).size, 0);
    assert.equal(initialTreeOpenState(undefined as unknown as TreeViewNode[], true).size, 0);
  });

  it('FECHAR uma pasta remove a subárvore inteira (unmountOnExit)', () => {
    const open = initialTreeOpenState(tree, false);
    const closed = toggleTreeOpenState(open, tree[0], false);
    assert.equal(isTreeOpen(closed, 'a'), false);
    assert.equal(isTreeOpen(closed, 'c'), false); // descendente fora também
    assert.equal(closed.size, 0);
  });

  it('ABRIR com !collapsed re-adiciona as pastas descendentes (re-mount aberto)', () => {
    let open: TreeOpenState = initialTreeOpenState(tree, true); // tudo fechado
    open = toggleTreeOpenState(open, tree[0], false);
    assert.equal(isTreeOpen(open, 'a'), true);
    assert.equal(isTreeOpen(open, 'c'), true); // filhas nascem abertas
  });

  it('ABRIR com collapsed mantém os descendentes fechados', () => {
    let open: TreeOpenState = initialTreeOpenState(tree, true);
    open = toggleTreeOpenState(open, tree[0], true);
    assert.equal(isTreeOpen(open, 'a'), true);
    assert.equal(isTreeOpen(open, 'c'), false);
  });

  it('toggle é imutável: o conjunto de entrada nunca muda', () => {
    const open = initialTreeOpenState(tree, false);
    const snapshot = [...open].sort();
    const closed = toggleTreeOpenState(open, tree[0], false);
    assert.deepEqual([...open].sort(), snapshot);
    assert.notEqual(closed, open);
  });

  it('abrir depois de fechar recupera o estado inicial dos descendentes', () => {
    // a e c abertos → fecha a (some a subárvore) → abre a (c volta a abrir,
    // porque !collapsed) — o mesmo que o `useState(!defaultCollapsed)` faria
    // ao remontar os nós desmontados.
    const open = initialTreeOpenState(tree, false);
    const closed = toggleTreeOpenState(open, tree[0], false);
    const reopened = toggleTreeOpenState(closed, tree[0], false);
    assert.equal(isTreeOpen(reopened, 'a'), true);
    assert.equal(isTreeOpen(reopened, 'c'), true);
    assert.equal(reopened.size, 2);
  });
});
