/**
 * src/components/editor/FileExplorer.tsx — árvore de arquivos do workspace.
 *
 * Recebe a lista PLANA de `WorkspaceFile` (via props; o carregamento/IPC fica
 * na view), converte em árvore por `lib/editorFiles.ts` (puro) e renderiza:
 *  - diretórios expandíveis/colapsáveis;
 *  - clique num arquivo → `onOpenFile(path)`;
 *  - toolbar: novo arquivo (pede nome → `onCreateFile(name, content?)`),
 *    atualizar (→ `onRefresh()`), excluir (→ `onDeleteFile(path)`).
 *
 * O controle de expandir é estado local (não precisa sobreviver à navegação).
 */
import { useMemo, useState, type ReactElement } from 'react';
import { Folder, FolderOpen, FileText, RefreshCw, FilePlus2, Trash2 } from 'lucide-react';
import type { WorkspaceFile } from '../../../shared/ipc-contract';
import { buildTreeFromFiles, sortTree, type FileTreeNode } from '../../lib/editorFiles';

/** Callbacks de ação da toolbar/árvore. */
export interface FileExplorerCallbacks {
  /** Clique num arquivo → abre a aba. */
  onOpenFile: (path: string) => void;
  /** Novo arquivo: recebe o nome desejado, devolve o path criado ou null. */
  onCreateFile: (name: string) => void;
  /** Recarrega a lista do workspace. */
  onRefresh: () => void;
  /** Exclui um arquivo (a UI já confirmou). */
  onDeleteFile: (path: string) => void;
}

export interface FileExplorerProps extends FileExplorerCallbacks {
  files: WorkspaceFile[];
  /** Path do arquivo ativo (destaca na árvore). */
  activePath: string | null;
}

/** Uma linha (nó) recursiva da árvore. */
function TreeNodeRow({
  node,
  depth,
  openDirs,
  toggleDir,
  activePath,
  onOpenFile,
}: {
  node: FileTreeNode;
  depth: number;
  openDirs: ReadonlySet<string>;
  toggleDir: (path: string) => void;
  activePath: string | null;
  onOpenFile: (path: string) => void;
}): ReactElement {
  const isOpen = node.dir && openDirs.has(node.path);
  const active = !node.dir && node.path === activePath;

  return (
    <div>
      <div
        className={'file-row' + (active ? ' is-active' : '')}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onClick={() => (node.dir ? toggleDir(node.path) : onOpenFile(node.path))}
        title={node.path}
      >
        <span className="file-row__icon" aria-hidden="true">
          {node.dir ? (
            isOpen ? (
              <FolderOpen size={14} />
            ) : (
              <Folder size={14} />
            )
          ) : (
            <FileText size={14} />
          )}
        </span>
        <span className="file-row__name">{node.name}</span>
      </div>
      {node.dir && isOpen
        ? node.children.map((child) => (
            <TreeNodeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              openDirs={openDirs}
              toggleDir={toggleDir}
              activePath={activePath}
              onOpenFile={onOpenFile}
            />
          ))
        : null}
    </div>
  );
}

/** Explorer de arquivos com toolbar (novo/atualizar/excluir). */
export function FileExplorer({
  files,
  activePath,
  onOpenFile,
  onCreateFile,
  onRefresh,
  onDeleteFile,
}: FileExplorerProps): ReactElement {
  // Diretórios expandidos (default: todos expandidos inicialmente).
  const [openDirs, setOpenDirs] = useState<ReadonlySet<string>>(() => {
    const all = new Set<string>();
    for (const f of files) {
      if (f.dir) all.add(f.path);
    }
    return all;
  });
  const [newName, setNewName] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const tree = useMemo(() => sortTree(buildTreeFromFiles(files)), [files]);

  const toggleDir = (path: string): void => {
    setOpenDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const submitNew = (): void => {
    const name = newName.trim();
    if (!name) return;
    onCreateFile(name);
    setNewName('');
    setShowNew(false);
  };

  const confirmDelete = (): void => {
    if (selectedPath) {
      onDeleteFile(selectedPath);
      setSelectedPath(null);
    }
  };

  return (
    <div className="file-explorer">
      <div className="file-explorer__toolbar">
        <button
          type="button"
          className="btn btn--secondary file-explorer__btn"
          title="Novo arquivo"
          aria-label="Novo arquivo"
          onClick={() => setShowNew((s) => !s)}
        >
          <FilePlus2 size={14} />
        </button>
        <button
          type="button"
          className="btn btn--secondary file-explorer__btn"
          title="Atualizar"
          aria-label="Atualizar workspace"
          onClick={onRefresh}
        >
          <RefreshCw size={14} />
        </button>
        <button
          type="button"
          className="btn btn--secondary file-explorer__btn file-explorer__btn--danger"
          title="Excluir arquivo selecionado"
          aria-label="Excluir arquivo"
          disabled={!selectedPath}
          onClick={confirmDelete}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {showNew ? (
        <div className="file-explorer__new">
          <input
            className="form-field__input"
            value={newName}
            placeholder="novo.txt (path relativo)"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitNew();
              if (e.key === 'Escape') setShowNew(false);
            }}
            autoFocus
          />
          <button
            type="button"
            className="btn btn--primary"
            onClick={submitNew}
            disabled={!newName.trim()}
          >
            Criar
          </button>
        </div>
      ) : null}

      <div className="file-explorer__tree">
        {tree.length === 0 ? (
          <p className="file-explorer__empty">Workspace vazio. Crie um arquivo.</p>
        ) : (
          tree.map((node) => (
            <div
              key={node.path}
              onClick={(e) => {
                // Seleção para a toolbar de exclusão — só em nós não-dir.
                if (!node.dir) {
                  e.stopPropagation();
                  setSelectedPath(node.path);
                }
              }}
            >
              <TreeNodeRow
                node={node}
                depth={0}
                openDirs={openDirs}
                toggleDir={toggleDir}
                activePath={activePath}
                onOpenFile={onOpenFile}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}