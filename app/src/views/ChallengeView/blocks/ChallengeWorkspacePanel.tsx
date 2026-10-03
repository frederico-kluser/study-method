/**
 * src/views/ChallengeView/blocks/ChallengeWorkspacePanel.tsx — o EDITOR do
 * desafio: árvore de ficheiros (FileExplorer) + painel de edição (EditorPane)
 * dentro do Paper com borda e altura fixa.
 *
 * VIEW PURA (docs/storybook/STORY-SPEC.md §5): só props, zero IPC, zero
 * estado — os callbacks são do container. O `key` do EditorPane é por
 * workspace: ao trocar de desafio o React DESMONTA/MONTA o EditorPane
 * (reducer de abas zerado) — impede um buffer dirty do workspace A salvar no
 * workspaceDir B (WARNING 4).
 */
import type { ReactElement, RefObject } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import type { WorkspaceFile } from '../../../../shared/ipc-contract';
import { FileExplorer } from '../../../components/editor/FileExplorer';
import { EditorPane, type EditorPaneHandle } from '../../../components/editor/EditorPane';

export interface ChallengeWorkspacePanelProps {
  /** Workspace do desafio (também é a `key` do EditorPane). */
  workspaceDir: string;
  files: WorkspaceFile[];
  /** Handle imperativo do editor (save/abrir/criar/apagar). */
  editorRef: RefObject<EditorPaneHandle | null>;
  onOpenFile: (path: string) => void;
  onCreateFile: (name: string) => void;
  onDeleteFile: (path: string) => void;
  onRefresh: () => void;
  onFilesChanged: () => void;
}

export function ChallengeWorkspacePanel({
  workspaceDir,
  files,
  editorRef,
  onOpenFile,
  onCreateFile,
  onDeleteFile,
  onRefresh,
  onFilesChanged,
}: ChallengeWorkspacePanelProps): ReactElement {
  return (
    <Paper
      variant="outlined"
      data-onboarding-target="challenge-editor"
      sx={{ height: { xs: 480, md: 560 }, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      <Box sx={{ display: 'flex', flexGrow: 1, minHeight: 0 }}>
        <Box sx={{ width: { xs: 200, sm: 240 }, borderRight: 1, borderColor: 'divider', overflow: 'auto' }}>
          <FileExplorer
            files={files}
            activePath={null}
            onOpenFile={onOpenFile}
            onCreateFile={onCreateFile}
            onDeleteFile={onDeleteFile}
            onRefresh={onRefresh}
          />
        </Box>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <EditorPane
            // key por workspace: ao trocar de desafio o React DESMONTA/MONTA o
            // EditorPane (reducer de abas zerado) — impede um buffer dirty do
            // workspace A salvar no workspaceDir B (WARNING 4).
            key={workspaceDir}
            ref={editorRef}
            workspaceDir={workspaceDir}
            files={files}
            onFilesChanged={onFilesChanged}
          />
        </Box>
      </Box>
    </Paper>
  );
}
