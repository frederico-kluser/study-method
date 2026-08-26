/**
 * src/lib/treeView.ts — HELPER PURO que mapeia a árvore de evolução do motor
 * (`progressEngine.treeToView`) para o shape de render que o EvolutionTree
 * consome. (onda3-arvore-ui)
 *
 * O motor (onda 2, electron/main/domain/progressEngine.ts) devolve:
 *   `Array<{ lessonId, title, completedAt, children: [...] }>`
 * A UI não conversa com o `electron/` (direção errada no renderer): este módulo
 * REDECLARA estruturalmente o nó e injeta só os LABELS/estados de que o
 * componente precisa, numa forma fácil de consumir.
 *
 * PURO/DI-FRIENDLY: recebe a árvore por parâmetro; sem DOM/React/Electron.
 * Testável sob node:test sem jsdom (tests/ui/treeView.test.ts).
 *
 * O EvolutionTree NÃO introduz XP/streak/placar — este helper NÃO calcula
 * gamificação; só deriva "concluído vs pendente" de `completedAt`.
 */

/** Nó da árvore do motor (redeclarado estruturalmente; sem import de electron/). */
export interface TreeViewSourceNode {
  lessonId: string;
  title: string;
  completedAt: string | null;
  children: TreeViewSourceNode[];
}

/** Estado visual derivado de um nó. */
export type TreeNodeState = 'done' | 'pending';

/** Nó pronto para o EvolutionTree renderizar. */
export interface TreeViewNode {
  lessonId: string;
  label: string;
  state: TreeNodeState;
  /** `completedAt` cru (para title/aria-label de contexto). */
  completedAt: string | null;
  children: TreeViewNode[];
}

/**
 * Mapeia o output do `treeToView` para o shape de render. Cada nó:
 *  - `label`: título da aula (fallback legível quando vazio).
 *  - `state`: 'done' quando há `completedAt` preenchido; senão 'pending'.
 *  - filhos mapeados recursivamente (ordem preservada).
 * Passa `undefined`/`null`/array vazio → `[]` (árvore vazia não derruba o UI).
 */
export function toTreeView(tree: TreeViewSourceNode[] | null | undefined): TreeViewNode[] {
  const roots = tree ?? [];
  return roots
    .filter((n) => n && typeof n.lessonId === 'string')
    .map(mapNode);
}

function mapNode(node: TreeViewSourceNode): TreeViewNode {
  const done = typeof node.completedAt === 'string' && node.completedAt.length > 0;
  return {
    lessonId: node.lessonId,
    label: node.title && node.title.trim() ? node.title : 'Aula sem título',
    state: done ? 'done' : 'pending',
    completedAt: node.completedAt ?? null,
    children: (node.children ?? []).filter((c) => c && typeof c.lessonId === 'string').map(mapNode),
  };
}

/** Conta o total de nós (recursivo) — utilidade p/ o rodapé de progresso. */
export function countTreeNodes(nodes: TreeViewSourceNode[] | TreeViewNode[]): number {
  let count = 0;
  for (const n of nodes ?? []) {
    count += 1;
    if (Array.isArray(n.children)) count += countTreeNodes(n.children);
  }
  return count;
}

/** Conta nós concluídos (recursivo) — p/ o rodapé "N de M conclusões". */
export function countDoneNodes(nodes: TreeViewNode[] | TreeViewSourceNode[]): number {
  let count = 0;
  for (const n of nodes ?? []) {
    const done =
      typeof (n as { completedAt?: string | null }).completedAt === 'string' &&
      (n as { completedAt?: string | null }).completedAt !== '';
    if (done) count += 1;
    if (Array.isArray(n.children)) count += countDoneNodes(n.children);
  }
  return count;
}
