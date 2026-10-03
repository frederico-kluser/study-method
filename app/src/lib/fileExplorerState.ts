/**
 * src/lib/fileExplorerState.ts — máquina de estado PURA da UI do FileExplorer
 * (expansão de pastas, seleção, formulário de novo ficheiro, diálogo de
 * exclusão confirmada).
 *
 * Extraído de `components/editor/FileExplorer.tsx` no âmbito do contrato
 * state/view do Storybook (STORY-SPEC §5): o componente é só apresentação e
 * este módulo decide o estado — sem React, sem DOM, testável no gate
 * `node:test` (mesma convenção de `lib/editorTabs.ts`).
 *
 * Os invariantes do fluxo vivem aqui e são cobertos por teste:
 *  - C2 — excluir é SEMPRE a dois passos (`request_delete` só ENFILEIRA o
 *    diálogo; só `delete_confirmed` autoriza o chamador a apagar);
 *  - a seleção limpa-se depois de confirmar (o botão excluir volta a ficar
 *    desabilitado);
 *  - o formulário de novo ficheiro só submete com nome não-vazio
 *    (`canSubmitNewFile`) e limpa-se depois de submetido.
 */
import type { WorkspaceFile } from '../../shared/ipc-contract';

/** Estado de UI do FileExplorer. */
export interface FileExplorerState {
  /** Paths de diretório expandidos. */
  openDirs: ReadonlySet<string>;
  /** Path do ficheiro selecionado na árvore (null = sem seleção). */
  selectedPath: string | null;
  /** Nome digitado no formulário de novo ficheiro. */
  newName: string;
  /** True quando o formulário de novo ficheiro está visível. */
  showNew: boolean;
  /**
   * Path AGUARDANDO confirmação de exclusão (null = diálogo fechado).
   * C2: excluir arquivo é destrutivo e irreversível — 1 clique nunca apaga.
   */
  pendingDelete: string | null;
}

/** Ações do reducer de UI do FileExplorer. */
export type FileExplorerAction =
  | { type: 'toggle_dir'; path: string }
  | { type: 'select_file'; path: string }
  | { type: 'set_new_name'; name: string }
  | { type: 'toggle_new_form' }
  | { type: 'close_new_form' }
  | { type: 'new_file_submitted' }
  | { type: 'request_delete' }
  | { type: 'cancel_delete' }
  | { type: 'delete_confirmed' };

/**
 * Estado inicial: TODOS os diretórios expandidos (o workspace do desafio é
 * pequeno; começar aberto evita um clique extra para ver o que existe).
 */
export function initialFileExplorerState(files: readonly WorkspaceFile[]): FileExplorerState {
  const openDirs = new Set<string>();
  for (const f of files) {
    if (f.dir) openDirs.add(f.path);
  }
  return {
    openDirs,
    selectedPath: null,
    newName: '',
    showNew: false,
    pendingDelete: null,
  };
}

/** Reducer puro da UI do FileExplorer. */
export function fileExplorerReducer(
  state: FileExplorerState,
  action: FileExplorerAction,
): FileExplorerState {
  switch (action.type) {
    case 'toggle_dir': {
      const openDirs = new Set(state.openDirs);
      if (openDirs.has(action.path)) openDirs.delete(action.path);
      else openDirs.add(action.path);
      return { ...state, openDirs };
    }

    case 'select_file':
      return { ...state, selectedPath: action.path };

    case 'set_new_name':
      return { ...state, newName: action.name };

    case 'toggle_new_form':
      // Fechar descarta o rascunho (o mesmo que o Escape do formulário).
      return state.showNew
        ? { ...state, showNew: false, newName: '' }
        : { ...state, showNew: true };

    case 'close_new_form':
      return { ...state, showNew: false, newName: '' };

    case 'new_file_submitted':
      return { ...state, showNew: false, newName: '' };

    case 'request_delete':
      // Só ENFILEIRA: sem seleção não há diálogo (o botão excluir é que
      // chega desabilitado — dupla travagem).
      return state.selectedPath ? { ...state, pendingDelete: state.selectedPath } : state;

    case 'cancel_delete':
      return { ...state, pendingDelete: null };

    case 'delete_confirmed':
      // A confirmação limpa seleção E diálogo: depois de apagar, o botão
      // excluir volta a ficar desabilitado.
      return { ...state, pendingDelete: null, selectedPath: null };

    default:
      return state;
  }
}

/** True quando o diretório `path` está expandido. */
export function isDirOpen(state: FileExplorerState, path: string): boolean {
  return state.openDirs.has(path);
}

/** True quando o formulário de novo ficheiro pode submeter (nome não-vazio). */
export function canSubmitNewFile(state: FileExplorerState): boolean {
  return state.newName.trim().length > 0;
}

/** Nome (basename) do ficheiro em confirmação de exclusão — para o diálogo. */
export function pendingDeleteName(state: FileExplorerState): string {
  const path = state.pendingDelete ?? '';
  return path.split('/').filter(Boolean).pop() ?? path;
}
