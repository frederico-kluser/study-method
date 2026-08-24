/**
 * src/lib/editorFiles.ts — lógica pura da árvore de arquivos do workspace.
 *
 * A API `study.listWorkspaceFiles` devolve uma lista PLANA de `WorkspaceFile`
 * (path relativo). Para o FileExplorer precisamos de uma árvore aninhada com
 * diretórios expandíveis. Este módulo converte a lista plana numa árvore de
 * forma PURA (sem DOM, sem React), testável no gate `node:test`.
 */
import type { WorkspaceFile } from '../../shared/ipc-contract';

/** Nó (arquivo) da árvore, mantendo o `WorkspaceFile` original. */
export interface FileTreeNode {
  /** Nome do nó (basename). */
  name: string;
  /** Path relativo completo para o nó. */
  path: string;
  /** True quando é um diretório. */
  dir: boolean;
  /** Filhos (só para diretórios). */
  children: FileTreeNode[];
  /** Referência ao arquivo original, se não-dir. */
  file?: WorkspaceFile;
}

/**
 * Converte a lista plana de WorkspaceFile numa árvore de FileTreeNode.
 *
 * Passo 1: cria um nó por path único (dirs por itens `dir:true` OU por serem
 * prefixo de caminho de arquivo). Passo 2: encadeia cada nó ao seu pai pelo
 * segmento acima; nós de topo vão na raiz. A ordem dos irmãos preserva a
 * entrada (a UI ordena depois com `sortTree`).
 */
export function buildTreeFromFiles(files: WorkspaceFile[]): FileTreeNode[] {
  const nodesByPath = new Map<string, FileTreeNode>();
  const isDir = new Set<string>();

  // Pré-coleta: quais paths são diretórios (itens dir:true + prefixos).
  for (const f of files) {
    if (f.dir) isDir.add(f.path);
    const segs = f.path.split('/').filter(Boolean);
    for (let i = 1; i < segs.length; i++) {
      isDir.add(segs.slice(0, i).join('/'));
    }
  }

  // Cria nós únicos.
  for (const f of files) {
    if (nodesByPath.has(f.path)) continue;
    const node: FileTreeNode = {
      name: f.path.split('/').filter(Boolean).pop() ?? f.path,
      path: f.path,
      dir: f.dir,
      children: [],
      file: f.dir ? undefined : f,
    };
    nodesByPath.set(f.path, node);
    // Se é prefixo de um arquivo e aparece também como dir:true livre, marca.
    if (f.dir && !isDir.has(f.path)) isDir.add(f.path);
  }

  // Garante nós para diretórios implícitos (prefixos sem item dir:true).
  for (const dirPath of isDir) {
    if (!nodesByPath.has(dirPath)) {
      nodesByPath.set(dirPath, {
        name: dirPath.split('/').filter(Boolean).pop() ?? dirPath,
        path: dirPath,
        dir: true,
        children: [],
      });
    }
  }

  // Encadeia filhos sob pais.
  const root: FileTreeNode[] = [];
  for (const node of nodesByPath.values()) {
    const segs = node.path.split('/').filter(Boolean);
    const parentPath = segs.slice(0, -1).join('/');
    const parent = parentPath ? nodesByPath.get(parentPath) : undefined;
    if (parent && parent.dir) {
      parent.children.push(node);
    } else {
      root.push(node);
    }
  }

  // Remove duplicados na raiz (caso o mesmo path tenha entrado duas vezes).
  const seenRoot = new Set<string>();
  const dedupedRoot: FileTreeNode[] = [];
  for (const n of root) {
    if (!seenRoot.has(n.path)) {
      seenRoot.add(n.path);
      dedupedRoot.push(n);
    }
  }
  return dedupedRoot;
}

/**
 * Ordena a árvore: diretórios primeiro, depois arquivos, ambos por nome em
 * ordem lexicográfica simples. Retorna nova árvore (não muta a entrada).
 */
export function sortTree(nodes: FileTreeNode[]): FileTreeNode[] {
  return nodes
    .map((n) => ({
      ...n,
      children: n.dir ? sortTree(n.children) : [],
    }))
    .sort((a, b) => {
      if (a.dir !== b.dir) return a.dir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

/**
 * Acha um nó da árvore pelo path. Devolve `undefined` quando não existe.
 */
export function findNode(nodes: FileTreeNode[], path: string): FileTreeNode | undefined {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.dir && path.startsWith(`${node.path}/`)) {
      const found = findNode(node.children, path);
      if (found) return found;
    }
  }
  return undefined;
}