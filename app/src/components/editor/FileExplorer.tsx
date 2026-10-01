/**
 * src/components/editor/FileExplorer.tsx — árvore de arquivos do workspace.
 *
 * Recebe a lista PLANA de `WorkspaceFile` (via props; o carregamento/IPC fica
 * na view), converte em árvore por `lib/editorFiles.ts` (puro) e renderiza com
 * CHROME MUI (List aninhada):
 *  - diretórios expandíveis/colapsáveis;
 *  - clique num arquivo → `onOpenFile(path)`;
 *  - toolbar: novo arquivo (pede nome → `onCreateFile(name, content?)`),
 *    atualizar (→ `onRefresh()`), excluir (→ diálogo de confirmação e só
 *    depois `onDeleteFile(path)` — C2: excluir NUNCA é 1 clique).
 *
 * O controle de expandir é estado local (não precisa sobreviver à navegação).
 * Nenhuma dependência nova (sem @mui/x-tree-view) — usa List aninhado.
 */
import { useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
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

/**
 * Alvo de toque mínimo (px) — o piso de 44 que o design system cobra para
 * qualquer controle apontável (mesma receita do LessonView/TrackChallengePanel).
 * Os botões/ícones da toolbar nascem pequenos (`size="small"`): a CAIXA cresce
 * até o piso, o glifo continua do tamanho compacto.
 */
const TOUCH_TARGET_PX = 44;

/** Callbacks de ação da toolbar/árvore. */
export interface FileExplorerCallbacks {
  /** Clique num arquivo → abre a aba. */
  onOpenFile: (path: string) => void;
  /** Novo arquivo: recebe o nome desejado, devolve o path criado ou null. */
  onCreateFile: (name: string) => void;
  /** Recarrega a lista do workspace. */
  onRefresh: () => void;
  /**
   * Exclui um arquivo. Chamado SÓ depois de o usuário confirmar no diálogo
   * (`editor.confirmDelete`) — o callback não precisa de confirmar de novo.
   */
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
            // Regra da base (SC 1.4.12): o nome do arquivo QUEBRA, nunca
            // trunca — `noWrap` era overflow:hidden + ellipsis (F104). O
            // `title` acima continua com o path completo para o rato.
            <Typography component="span" variant="body2" sx={{ overflowWrap: 'anywhere' }}>
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
  const { t } = useTranslation();
  // t() com interpolação (mesmo cast documentado da ChallengeView): o t()
  // strict-typed desta base não resolve InterpolationMap, mas o runtime
  // interpola normal — `editor.confirmDelete` leva {{name}}.
  const tI = t as unknown as (key: string, options?: Record<string, string | number>) => string;
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
  // C2: exclusão confirmada num diálogo — `pendingDelete` é o path AGUARDANDO
  // confirmação (null = diálogo fechado). Excluir arquivo é destrutivo e
  // irreversível: 1 clique nunca apaga.
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

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

  // Botão excluir: abre o diálogo de confirmação (C2). Só o "Excluir" do
  // diálogo chama `onDeleteFile` — o risco de clique errado some.
  const confirmDelete = (): void => {
    if (selectedPath) setPendingDelete(selectedPath);
  };

  // Confirmação dada: apaga e limpa a seleção.
  const acceptDelete = (): void => {
    if (pendingDelete) {
      onDeleteFile(pendingDelete);
      setSelectedPath(null);
    }
    setPendingDelete(null);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar — alvos no piso de toque (TOUCH_TARGET_PX) */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 0.5, py: 0.25 }}>
        <Tooltip title={t('translation:editor.newFile')}>
          <IconButton
            size="small"
            aria-label={t('translation:editor.newFile')}
            onClick={() => setShowNew((s) => !s)}
            sx={{ width: TOUCH_TARGET_PX, height: TOUCH_TARGET_PX }}
          >
            <NoteAddIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={t('translation:editor.refresh')}>
          <IconButton
            size="small"
            aria-label={t('translation:editor.refresh')}
            onClick={onRefresh}
            sx={{ width: TOUCH_TARGET_PX, height: TOUCH_TARGET_PX }}
          >
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={t('translation:editor.deleteFile')}>
          <span>
            <IconButton
              size="small"
              aria-label={t('translation:editor.deleteFile')}
              disabled={!selectedPath}
              onClick={confirmDelete}
              color="error"
              sx={{ width: TOUCH_TARGET_PX, height: TOUCH_TARGET_PX }}
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
            // i18n: o placeholder era string crua em pt ("novo.txt (path
            // relativo)") — a chave `editor.newFilePlaceholder` já existe.
            placeholder={t('translation:editor.newFilePlaceholder')}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitNew();
              if (e.key === 'Escape') setShowNew(false);
            }}
            sx={{
              // Piso de alvo de toque (TOUCH_TARGET_PX): o campo small nasce
              // ~34px — o ALVO é o próprio input, então o minHeight vai para ele.
              '& .MuiInputBase-input': { minHeight: TOUCH_TARGET_PX },
            }}
          />
          <Button
            size="small"
            variant="contained"
            onClick={submitNew}
            disabled={!newName.trim()}
            sx={{ minHeight: TOUCH_TARGET_PX }}
          >
            {t('translation:editor.create')}
          </Button>
        </Box>
      ) : null}

      {/* Árvore */}
      <Box component="div" sx={{ flexGrow: 1, overflow: 'auto' }}>
        {tree.length === 0 ? (
          <Typography variant="body2" sx={{ color: 'text.secondary', p: 1 }}>
            {t('translation:editor.workspaceEmpty')}
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

      {/* C2 — CONFIRMAÇÃO de exclusão (mesmo padrão do OrphanTracksPanel):
          pergunta pelo NOME do arquivo e só apaga no botão destrutivo. */}
      <Dialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        aria-labelledby="editor-confirm-delete-title"
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle id="editor-confirm-delete-title">
          {tI('translation:editor.confirmDelete', {
            name: (pendingDelete ?? '').split('/').pop() ?? pendingDelete ?? '',
          })}
        </DialogTitle>
        <DialogActions>
          <Button onClick={() => setPendingDelete(null)}>{t('translation:common.cancel')}</Button>
          <Button onClick={acceptDelete} color="error" variant="contained" autoFocus>
            {t('translation:editor.deleteFile')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}