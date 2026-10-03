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
 * O controle de expandir/selecionar/formulários é estado de UI PURO
 * (`lib/fileExplorerState.ts` — reducer testável sem DOM, ver o contrato
 * state/view do STORY-SPEC §5); este componente é apresentação + emissão de
 * callbacks. Nenhuma dependência nova (sem @mui/x-tree-view) — usa List
 * aninhado.
 */
import { useMemo, useReducer, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
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
import DescriptionIcon from '@mui/icons-material/Description';
import RefreshIcon from '@mui/icons-material/Refresh';
import NoteAddIcon from '@mui/icons-material/NoteAdd';
import DeleteIcon from '@mui/icons-material/Delete';
import type { WorkspaceFile } from '../../../shared/ipc-contract';
import { buildTreeFromFiles, sortTree, type FileTreeNode } from '../../lib/editorFiles';
import {
  canSubmitNewFile,
  fileExplorerReducer,
  initialFileExplorerState,
  pendingDeleteName,
} from '../../lib/fileExplorerState';
import { touchTargetBoxSx, touchTargetSx } from '../../lib/layoutSx';
import { ConfirmDialog } from '../ui/ConfirmDialog';

/**
 * Alvo de toque mínimo — o piso de 44 que o design system cobra para qualquer
 * controle apontável. Era uma constante local (`TOUCH_TARGET_PX`, auditoria
 * §1); agora vem dos primitivos `touchTargetBoxSx` (caixa de botão de ícone) e
 * `touchTargetSx` (minHeight) de `lib/layoutSx.ts`, que leem
 * `TARGET.minTouchTargetPx` de `designTokens.ts`. Os botões/ícones da toolbar
 * nascem pequenos (`size="small"`): a CAIXA cresce até o piso, o glifo
 * continua do tamanho compacto.
 */

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
  // Estado de UI PURO (expansão/seleção/formulários) — reducer de
  // `lib/fileExplorerState.ts`; inicializado com os diretórios todos abertos.
  const [state, dispatch] = useReducer(
    fileExplorerReducer,
    files,
    initialFileExplorerState,
  );
  const { openDirs, selectedPath, newName, showNew, pendingDelete } = state;

  const tree = useMemo(() => sortTree(buildTreeFromFiles(files)), [files]);

  const submitNew = (): void => {
    if (!canSubmitNewFile(state)) return;
    onCreateFile(newName.trim());
    dispatch({ type: 'new_file_submitted' });
  };

  // Botão excluir: ENFILEIRA a confirmação (C2). Só o "Excluir" do diálogo
  // chama `onDeleteFile` — o risco de clique errado some.
  const confirmDelete = (): void => {
    dispatch({ type: 'request_delete' });
  };

  // Confirmação dada: apaga (o reducer limpa seleção + diálogo).
  const acceptDelete = (): void => {
    if (pendingDelete) {
      onDeleteFile(pendingDelete);
    }
    dispatch({ type: 'delete_confirmed' });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar — alvos no piso de toque (`touchTargetBoxSx`) */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 0.5, py: 0.25 }}>
        <Tooltip title={t('translation:editor.newFile')}>
          <IconButton
            size="small"
            aria-label={t('translation:editor.newFile')}
            onClick={() => dispatch({ type: 'toggle_new_form' })}
            sx={touchTargetBoxSx}
          >
            <NoteAddIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={t('translation:editor.refresh')}>
          <IconButton
            size="small"
            aria-label={t('translation:editor.refresh')}
            onClick={onRefresh}
            sx={touchTargetBoxSx}
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
              sx={touchTargetBoxSx}
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
            onChange={(e) => dispatch({ type: 'set_new_name', name: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitNew();
              if (e.key === 'Escape') dispatch({ type: 'close_new_form' });
            }}
            sx={{
              // Piso de alvo de toque: o campo small nasce ~34px — o ALVO é o
              // próprio input, então o minHeight vai para ele.
              '& .MuiInputBase-input': { minHeight: touchTargetSx.minHeight },
            }}
          />
          <Button
            size="small"
            variant="contained"
            onClick={submitNew}
            disabled={!canSubmitNewFile(state)}
            sx={touchTargetSx}
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
                toggleDir={(path) => dispatch({ type: 'toggle_dir', path })}
                activePath={activePath}
                onOpenFile={onOpenFile}
                onSelect={(path) => dispatch({ type: 'select_file', path })}
              />
            ))}
          </List>
        )}
      </Box>

      {/* C2 — CONFIRMAÇÃO de exclusão (primitivo `ConfirmDialog`, auditoria
          §9): pergunta pelo NOME do arquivo e só apaga no botão destrutivo.
          `initialFocus="confirm"` mantém o padrão histórico deste explorador
          (o foco no destrutivo), tal como o primitivo documenta. */}
      <ConfirmDialog
        open={pendingDelete !== null}
        title={tI('translation:editor.confirmDelete', { name: pendingDeleteName(state) })}
        confirmLabel={t('translation:editor.deleteFile')}
        cancelLabel={t('translation:common.cancel')}
        initialFocus="confirm"
        onCancel={() => dispatch({ type: 'cancel_delete' })}
        onConfirm={acceptDelete}
      />
    </Box>
  );
}