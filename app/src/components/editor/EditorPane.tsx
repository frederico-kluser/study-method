/**
 * src/components/editor/EditorPane.tsx — painel central do editor (abas +
 * CodeMirrorField) com persistência via `study.writeWorkspaceFile`.
 *
 * Estado de abas (aberta/ativa/suja/conteúdo) vive num reducer PURO
 * (`lib/editorTabs.ts`); este componente amarra o reducer ao CodeMirrorField e
 * às chamadas IPC via `getApi()` (nunca `window` direto):
 *
 *  - abrir arquivo → `study.readWorkspaceFile` e registra a aba;
 *  - Ctrl/Cmd+S (ou botão "Salvar") → `writeWorkspaceFile` e marca `saved`;
 *  - trocar de arquivo com `dirty` → salva automaticamente antes de trocar;
 *  - fechar aba suja → salva antes de fechar (preserva o trabalho se falhar).
 *
 * Nota sobre tipagem: o `ApiSchema` do preload tipa os métodos `study` ainda
 * sem parâmetros (placeholders desta onda); o runtime já espera o payload
 * `{workspaceDir,...}`. Cast explícito local — padrão já usado na LessonView.
 */
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useReducer,
  useState,
  type ReactElement,
} from 'react';
import { Save } from 'lucide-react';
import type { WorkspaceFile } from '../../../shared/ipc-contract';
import { getApi } from '../../lib/apiBridge';
import {
  editorTabsReducer,
  initialEditorTabs,
  activeTab,
} from '../../lib/editorTabs';
import { CodeMirrorField } from '../cm/CodeMirrorField';
import { EditorTabs } from './EditorTabs';

/** Handle imperativa para a ChallengeView abrir arquivos vindo do explorer. */
export interface EditorPaneHandle {
  /** Abre (carrega + registra) um arquivo. Chamado pelo FileExplorer. */
  openFile: (path: string) => void;
  /** Cria um novo arquivo e o abre. */
  createFile: (name: string) => void;
  /** Exclui um arquivo (já confirmado pela UI). */
  deleteFile: (path: string) => void;
}

export interface EditorPaneProps {
  /** Diretório do workspace do desafio (para read/write). */
  workspaceDir: string;
  /** Lista atual de arquivos (vinda da view). */
  files: WorkspaceFile[];
  /** Chamado quando a view precisa recarregar a lista (após novo/exclusão). */
  onFilesChanged?: () => void;
}

/** Tipos dos métodos de workspace (runtime, ver nota no topo). */
type WriteArgs = { workspaceDir: string; path: string; content: string };
type ReadArgs = { workspaceDir: string; path: string };
type DeleteArgs = { workspaceDir: string; path: string };

/**
 * Painel de edição com abas. O estado vem do reducer puro; IPC sob demanda.
 * Expõe `openFile`/`createFile`/`deleteFile` via ref para o FileExplorer.
 */
export const EditorPane = forwardRef<EditorPaneHandle, EditorPaneProps>(function EditorPane(
  { workspaceDir, files, onFilesChanged }: EditorPaneProps,
  ref,
): ReactElement {
  const [tabs, dispatch] = useReducer(editorTabsReducer, initialEditorTabs);
  const [error, setError] = useState('');
  const [busyPath, setBusyPath] = useState<string | null>(null);

  const active = activeTab(tabs);

  const apiRead = useCallback(
    () =>
      (getApi().study.readWorkspaceFile as (args: ReadArgs) => Promise<string>),
    [],
  );
  const apiWrite = useCallback(
    () =>
      (getApi().study.writeWorkspaceFile as (args: WriteArgs) => Promise<{ ok: boolean }>),
    [],
  );
  const apiDelete = useCallback(
    () =>
      (getApi().study.deleteWorkspaceFile as (args: DeleteArgs) => Promise<{ ok: boolean }>),
    [],
  );

  // Abre (carrega + registra) um arquivo.
  const openFile = useCallback(
    async (path: string): Promise<void> => {
      // Se já aberto, só ativa.
      if (tabs.tabs.some((t) => t.path === path)) {
        dispatch({ type: 'activate', path });
        return;
      }
      setBusyPath(path);
      setError('');
      try {
        const content = await apiRead()({ workspaceDir, path });
        const found = files.find((f) => f.path === path);
        const file: WorkspaceFile =
          found ?? ({ path, name: path.split('/').pop() ?? path, size: 0, dir: false } as WorkspaceFile);
        dispatch({ type: 'open', file, content });
      } catch (err) {
        setError(`Não consegui abrir "${path}": ${String(err)}`);
      } finally {
        setBusyPath(null);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [tabs.tabs, workspaceDir, files, apiRead],
  );

  // Salva a aba informada; devolve sucesso.
  const saveTab = useCallback(
    async (path: string): Promise<boolean> => {
      const tab = tabs.tabs.find((t) => t.path === path);
      if (!tab) return false;
      setError('');
      try {
        await apiWrite()({ workspaceDir, path: tab.path, content: tab.content });
        dispatch({ type: 'mark_saved', path: tab.path });
        onFilesChanged?.();
        return true;
      } catch (err) {
        setError(`Falha ao salvar "${path}": ${String(err)}`);
        return false;
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [tabs.tabs, workspaceDir, apiWrite, onFilesChanged],
  );

  // Troca de aba — se a atual está suja, salva antes.
  const activateTab = useCallback(
    async (path: string): Promise<void> => {
      const current = tabs.tabs.find((t) => t.path === tabs.activePath);
      if (current && current.path !== path && current.dirty) {
        const ok = await saveTab(current.path);
        if (!ok) return; // salvar falhou — não troca, preserva o trabalho.
      }
      dispatch({ type: 'activate', path });
    },
    [tabs.tabs, tabs.activePath, saveTab],
  );

  // Fecha aba — se suja, salva antes.
  const closeTab = useCallback(
    async (path: string): Promise<void> => {
      const tab = tabs.tabs.find((t) => t.path === path);
      if (tab?.dirty) {
        const ok = await saveTab(path);
        if (!ok) return;
      }
      dispatch({ type: 'close', path });
    },
    [tabs.tabs, saveTab],
  );

  // Novo arquivo via toolbar do explorer.
  const createFile = useCallback(
    (name: string): void => {
      setError('');
      apiWrite()({ workspaceDir, path: name, content: '' })
        .then(() => {
          onFilesChanged?.();
          return openFile(name);
        })
        .catch((err) => setError(`Falha ao criar "${name}": ${String(err)}`));
    },
    [workspaceDir, apiWrite, onFilesChanged, openFile],
  );

  // Excluir arquivo (a toolbar já confirmou).
  const deleteFile = useCallback(
    async (path: string): Promise<void> => {
      setError('');
      try {
        await apiDelete()({ workspaceDir, path });
        dispatch({ type: 'close', path });
        onFilesChanged?.();
      } catch (err) {
        setError(`Falha ao excluir "${path}": ${String(err)}`);
      }
    },
    [workspaceDir, apiDelete, onFilesChanged],
  );

  // Mudança de conteúdo (buffer) — marca dirty no reducer.
  const onContentChange = useCallback(
    (value: string): void => {
      if (active?.path) {
        dispatch({ type: 'update_content', path: active.path, content: value });
      }
    },
    [active?.path],
  );

  const saveActive = useCallback((): void => {
    if (active) void saveTab(active.path);
  }, [active, saveTab]);

  // Expõe as operações de arquivo ao FileExplorer (pai).
  useImperativeHandle(
    ref,
    (): EditorPaneHandle => ({
      openFile: (path) => void openFile(path),
      createFile,
      deleteFile: (path) => void deleteFile(path),
    }),
    [openFile, createFile, deleteFile],
  );

  const empty = tabs.tabs.length === 0;

  return (
    <div className="editor-pane">
      <div className="editor-pane__toolbar">
        <button
          type="button"
          className="btn btn--secondary editor-pane__btn"
          title="Salvar (Ctrl+S ou ⌘S)"
          onClick={saveActive}
          disabled={!active}
        >
          <Save size={14} /> Salvar
        </button>
      </div>

      <EditorTabs
        tabs={tabs.tabs}
        activePath={tabs.activePath}
        onActivate={(p) => void activateTab(p)}
        onClose={(p) => void closeTab(p)}
      />

      <div className="editor-pane__body">
        {error ? <div className="editor-pane__error">{error}</div> : null}
        {busyPath ? (
          <div className="editor-pane__loading">Abrindo {busyPath}…</div>
        ) : null}
        {empty ? (
          <div className="editor-pane__empty">
            <p>Selecione um arquivo na árvore à esquerda para começar a editar.</p>
          </div>
        ) : active ? (
          <CodeMirrorField
            value={active.content}
            onChange={onContentChange}
            filename={active.name}
            ariaLabel={`Editor — ${active.path}`}
            onSave={saveActive}
          />
        ) : null}
      </div>
    </div>
  );
});

export type { EditorTab } from '../../lib/editorTabs';