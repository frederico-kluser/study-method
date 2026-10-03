/**
 * src/components/tree/evolutionTreeState.ts — lógica PURA da árvore de evolução.
 *
 * Extraída do `EvolutionTree.tsx` (state/view — STORY-SPEC §5) para ser
 * testável sob node:test sem jsdom. Nada aqui depende de React/DOM/MUI:
 *
 *   1. ESTADO DE LAYOUT DO GRAFO — que nós-pasta estão abertos. É um
 *      `ReadonlySet<string>` de `lessonId`, imutável (cada transição devolve um
 *      conjunto novo). O modelo espelha EXATAMENTE o comportamento que o
 *      TreeNode tinha com `useState(!defaultCollapsed)` + `<Collapse
 *      unmountOnExit>`: fechar uma pasta desmonta a subárvore inteira (os
 *      descendentes saem do estado) e reabri-la remonta os filhos com o
 *      estado INICIAL (`!collapsed`), tal como o `useState` faria ao montar.
 *   2. DERIVAÇÕES DE APRESENTAÇÃO — texto de estado, sufixo de nível,
 *      `aria-label` do nó e o recuo por profundidade (o layout da lista
 *      aninhada). Só funções das props/labels.
 *
 * Os RÓTULOS vivem aqui como dados (`TreeStateLabels`) porque são o contrato
 * de i18n do componente (a trilha é multilíngue; os defaults legados seguem
 * em pt-BR, tal como estavam no .tsx). O componente re-exporta o tipo para
 * manter o export público de sempre.
 *
 * Regra da casa: valores de design NÃO são inventados aqui — os números que
 * saem daqui (`NODE_INDENT_STEP`) são os mesmos que o .tsx escrevia, movidos
 * sem mudança de valor (ver nota de `nodeIndent` sobre unidades de `sx`).
 */
import type { DifficultyLevel } from '../../lib/levels';
import type { TreeNodeState, TreeViewNode } from '../../lib/treeView';
import { tr } from '../../lib/i18nText';

/** Rótulos de estado do nó — usados no `aria-label` (i18n quando fornecido). */
export interface TreeStateLabels {
  done: string;
  current: string;
  pending: string;
  /** Rótulo do nível (semântico — entra no aria-label; o selo é aria-hidden). */
  level?: (level: DifficultyLevel) => string;
}

/**
 * Defaults LEGADOS em pt-BR — hoje o FALLBACK das chaves `trilha.tree.*` (o
 * i18n de produção resolve via `tr` de `lib/i18nText`; estes valores são o
 * que se vê sem i18n — testes e ferramentas). As views usam os acessores
 * `defaultTreeTitle()` / `defaultTreeEmpty()` / `defaultStateLabels()`, que
 * apontam para as chaves.
 */
export const DEFAULT_TREE_TITLE = 'Evolução da aprendizagem';
export const DEFAULT_TREE_EMPTY =
  'Nenhuma evolução registrada ainda. Gere sua primeira aula para começar.';
export const DEFAULT_STATE_LABELS: TreeStateLabels = {
  done: 'concluído',
  current: 'em andamento',
  pending: 'pendente',
};

/** Título da secção — `trilha.tree.title` (fallback: `DEFAULT_TREE_TITLE`). */
export function defaultTreeTitle(): string {
  return tr('translation:trilha.tree.title', DEFAULT_TREE_TITLE);
}

/** Árvore vazia — `trilha.tree.empty` (fallback: `DEFAULT_TREE_EMPTY`). */
export function defaultTreeEmpty(): string {
  return tr('translation:trilha.tree.empty', DEFAULT_TREE_EMPTY);
}

/**
 * Rótulos de estado por omissão — `trilha.tree.stateDone/stateCurrent/
 * statePending` (fallback: `DEFAULT_STATE_LABELS`). Sem rótulo de nível: o
 * selo de nível só aparece quando a view passa `stateLabels.level`.
 */
export function defaultStateLabels(): TreeStateLabels {
  return {
    done: tr('translation:trilha.tree.stateDone', DEFAULT_STATE_LABELS.done),
    current: tr('translation:trilha.tree.stateCurrent', DEFAULT_STATE_LABELS.current),
    pending: tr('translation:trilha.tree.statePending', DEFAULT_STATE_LABELS.pending),
  };
}

/**
 * Recuo por nível de profundidade. ATENÇÃO à semântica: o `sx` do nó usa
 * `pl: depth * NODE_INDENT_STEP`, e em `sx` um número de padding passa por
 * `theme.spacing` (16 = 128px) — é o MESMO valor que o .tsx sempre emitiu,
 * movido sem mudança de medida (mudar para px seria uma decisão de design
 * nova, e este módulo não inventa valores).
 */
export const NODE_INDENT_STEP = 16;

/** Recuo do nó (em unidades de `theme.spacing`, ver nota de NODE_INDENT_STEP). */
export function nodeIndent(depth: number): number {
  return depth * NODE_INDENT_STEP;
}

/** Nó com filhos = pasta colapsável; folha não tem o que dobrar. */
export function nodeIsFolder(node: Pick<TreeViewNode, 'children'>): boolean {
  return node.children.length > 0;
}

/** Texto de estado do nó (para o `aria-label`). */
export function nodeStateText(state: TreeNodeState, labels: TreeStateLabels): string {
  return state === 'done' ? labels.done : state === 'current' ? labels.current : labels.pending;
}

/** Sufixo " · <nível>" quando o nó tem nível E há rótulo de nível; senão ''. */
export function nodeLevelText(
  level: DifficultyLevel | undefined,
  labels: TreeStateLabels,
): string {
  return level && labels.level ? ` · ${labels.level(level)}` : '';
}

/**
 * `aria-label` do nó: rótulo — estado[, N sub-aula(s)][ · nível].
 * O contador de filhos só aparece nas pastas (o formato histórico do
 * componente, preservado) e sai pela chave `trilha.tree.nodeChildren`.
 */
export function nodeAriaLabel(node: TreeViewNode, labels: TreeStateLabels): string {
  const stateText = nodeStateText(node.state, labels);
  const levelText = nodeLevelText(node.level, labels);
  const count = node.children.length;
  return nodeIsFolder(node)
    ? `${node.label} — ${stateText}, ${tr('translation:trilha.tree.nodeChildren', `${count} sub-aula(s)`, { count })}${levelText}`
    : `${node.label} — ${stateText}${levelText}`;
}

/* ─── ESTADO DE LAYOUT DO GRAFO (pastas abertas) ────────────────────────── */

/**
 * Pastas abertas, indexadas por `lessonId`. Folhas nunca entram (não têm o
 * que dobrar). Estado imutável: `toggleTreeOpenState` devolve um conjunto NOVO.
 */
export type TreeOpenState = ReadonlySet<string>;

/** Ids de todas as pastas da subárvore de `node` (recursivo, inclui a raiz). */
function folderIdsIn(node: TreeViewNode, out: Set<string>): void {
  if (nodeIsFolder(node)) {
    out.add(node.lessonId);
    for (const child of node.children) folderIdsIn(child, out);
  }
}

/**
 * Estado inicial: pastas abertas quando `!collapsed`, fechadas quando
 * `collapsed` — a mesma regra do `useState(!defaultCollapsed)` de cada nó.
 * Folhas não entram no estado.
 */
export function initialTreeOpenState(nodes: TreeViewNode[], collapsed: boolean): TreeOpenState {
  const open = new Set<string>();
  for (const node of nodes ?? []) {
    if (!collapsed) folderIdsIn(node, open);
  }
  return open;
}

/**
 * Abre/fecha uma pasta, espelhando o `<Collapse unmountOnExit>`:
 *  - FECHAR remove a pasta e TODA a subárvore do estado (os descendentes
 *    desmontam; ao remontar voltam ao estado inicial);
 *  - ABIR adiciona a pasta e, quando `!collapsed`, também as pastas
 *    descendentes (é o que o `useState(!defaultCollapsed)` daria ao montar);
 *    quando `collapsed`, os descendentes nascem fechados.
 */
export function toggleTreeOpenState(
  state: TreeOpenState,
  node: TreeViewNode,
  collapsed: boolean,
): TreeOpenState {
  const next = new Set(state);
  if (next.has(node.lessonId)) {
    next.delete(node.lessonId);
    for (const child of node.children) {
      for (const id of collectFolderIds(child)) next.delete(id);
    }
    return next;
  }
  next.add(node.lessonId);
  if (!collapsed) {
    for (const child of node.children) folderIdsIn(child, next);
  }
  return next;
}

/** Ids de todas as pastas da subárvore (recursivo) — helper puro de teste. */
function collectFolderIds(node: TreeViewNode): Set<string> {
  const out = new Set<string>();
  folderIdsIn(node, out);
  return out;
}

/** Uma pasta está aberta? (Folhas devolvem false — não têm estado.) */
export function isTreeOpen(state: TreeOpenState, lessonId: string): boolean {
  return state.has(lessonId);
}
