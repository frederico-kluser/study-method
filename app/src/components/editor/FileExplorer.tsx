/**
 * src/components/editor/FileExplorer.tsx — árvore de arquivos do workspace.
 *
 * Recebe a lista PLANA de `WorkspaceFile` (via props; o carregamento/IPC fica
 * na view), converte em árvore por `lib/editorFiles.ts` (puro) e renderiza com
 * CHROME MUI (List aninhada):
 *  - diretórios expandíveis/colapsáveis;
 *  - clique num arquivo → `onOpenFile(path)`;
 *  - toolbar: novo arquivo (pede nome → `onCreateFile(name, content?)`),
 *    atualizar (→ `onRefresh()`), excluir (→ `onDeleteFile(path)`).
 *
 * O controle de expandir é estado local (não precisa sobreviver à navegação).
 * Nenhuma dependência nova (sem @mui/x-tree-view) — usa List aninhado.
 */
import { useMemo, useState, type ReactElement } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FolderIcon from '@mui/icons-material/Folder';
import DescriptionIcon from '@mui/icons-material/Description';
import RefreshIcon from '@mui/icons-material/Refresh';
import NoteAddIcon from '@mui/icons-material/NoteAdd';
import DeleteIcon from '@mui/icons-material/Delete';
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

/** Ícone de uma linha da árvore (pasta expandida/colapsada ou arquivo). */
function NodeIcon({ node, isOpen }: { node: FileTreeNode; isOpen: boolean }): ReactElement {
  if (!node.dir) return <DescriptionIcon fontSize="small" />;
  return isOpen ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />;
}

/** Uma linha (nó) recursiva da árvore — List aninhado. */
function TreeNodeRow({
  node,
  depth,
  openDirs,
  toggleDir,
  activePath,
  onOpenFile,
  onSelect,
}: {
  node: FileTreeNode;
  depth: number;
  openDirs: ReadonlySet<string>;
  toggleDir: (path: string) => void;
  activePath: string | null;
  onOpenFile: (path: string) => void;
  onSelect: (path: string) => void;
}): ReactElement {
  const isOpen = node.dir && openDirs.has(node.path);
  const active = !node.dir && node.path === activePath;

  return (
    <Box>
      <ListItemButton
        dense
        sx={{ pl: 0.5 + depth * 2 }}
        selected={active}
        onClick={() => {
          if (node.dir) {
            toggleDir(node.path);
          } else {
            onSelect(node.path);
            onOpenFile(node.path);
          }
        }}
        title={node.path}
      >
        <ListItemIcon sx={{ minWidth: 28 }}>
          <NodeIcon node={node} isOpen={isOpen} />
        </ListItemIcon>
        <ListItemText
          primary={
            <Typography component="span" variant="body2" noWrap>
              {node.name}
            </Typography>
          }
        />
      </ListItemButton>
      {node.dir && isOpen ? (
        <List disablePadding dense>
          {node.children.map((child) => (
            <TreeNodeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              openDirs={openDirs}
              toggleDir={toggleDir}
              activePath={activePath}
              onOpenFile={onOpenFile}
              onSelect={onSelect}
            />
          ))}
        </List>
      ) : null}
    </Box>
  );
}

/** Expluso de arquivos com toolbar (novo/atualizar/excluir) em chrome MUI. */
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
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 0.5, py: 0.25 }}>
        <Tooltip title="Novo arquivo">
          <IconButton
            size="small"
            aria-label="Novo arquivo"
            onClick={() => setShowNew((s) => !s)}
          >
            <NoteAddIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Atualizar">
          <IconButton size="small" aria-label="Atualizar workspace" onClick={onRefresh}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Excluir arquivo selecionado">
          <span>
            <IconButton
              size="small"
              aria-label="Excluir arquivo"
              disabled={!selectedPath}
              onClick={confirmDelete}
              color="error"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {/* Novo arquivo */}
      {showNew ? (
        <Box sx={{ display: 'flex', gap: 1, px: 1, py: 0.5, alignItems: 'center' }}>
          <TextField
            size="small"
            autoFocus
            fullWidth
            variant="outlined"
            value={newName}
            placeholder="novo.txt (path relativo)"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitNew();
              if (e.key === 'Escape') setShowNew(false);
            }}
          />
          <Button size="small" variant="contained" onClick={submitNew} disabled={!newName.trim()}>
            Criar
          </Button>
        </Box>
      ) : null}

      {/* Árvore */}
      <Box component="div" sx={{ flexGrow: 1, overflow: 'auto' }}>
        {tree.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
            Workspace vazio. Crie um arquivo.
          </Typography>
        ) : (
          <List disablePadding dense>
            {tree.map((node) => (
              <TreeNodeRow
                key={node.path}
                node={node}
                depth={0}
                openDirs={openDirs}
                toggleDir={toggleDir}
                activePath={activePath}
                onOpenFile={onOpenFile}
                onSelect={setSelectedPath}
              />
            ))}
          </List>
        )}
      </Box>
    </Box>
  );
}