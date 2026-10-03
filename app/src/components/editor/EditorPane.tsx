/**
 * src/components/editor/EditorPane.tsx — CONTAINER do painel central do editor:
 * amarra o reducer puro de abas (`lib/editorTabs.ts`) ao IPC de workspace e à
 * view pura (`EditorPaneView.tsx`).
 *
 * ─── CONTRATO STATE/VIEW (STORY-SPEC §5) ──────────────────────────────────
 * A VIEW (`EditorPaneView`) recebe ficheiros/conteúdo por props e devolve
 * intenções por callbacks — é o que o Storybook renderiza. O ACESSO AO DISCO
 * vive AQUI (via `getApi()`, nunca `window` direto):
 *
 *  - abrir arquivo → `study.readWorkspaceFile` e registra a aba;
 *  - Ctrl/Cmd+S (ou botão "Salvar") → `writeWorkspaceFile` e marca `saved`;
 *  - trocar de arquivo com `dirty` → salva automaticamente antes de trocar;
 *  - fechar aba suja → salva antes de fechar (preserva o trabalho se falhar).
 *
 * As DECISÕES (o que salvar antes de trocar/fechar, quais os buffers sujos,
 * qual o ficheiro de uma aba) são funções puras de `lib/editorTabs.ts`
 * (testadas em `tests/editorTabsFlow.test.ts`); este ficheiro só orquestra.
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
import { useTranslation } from 'react-i18next';
import type { WorkspaceFile } from '../../../shared/ipc-contract';
import { getApi } from '../../lib/apiBridge';
import {
  activeTab,
  dirtyPaths,
  editorTabsReducer,
  findTab,
  initialEditorTabs,
  needsAutosaveBeforeClose,
  pathToAutosaveBeforeActivate,
  workspaceFileFor,
} from '../../lib/editorTabs';
import { EditorPaneView } from './EditorPaneView';

/** Handle imperativa para a ChallengeView abrir arquivos vindo do explorer. */
export interface EditorPaneHandle {
  /** Abre (carrega + registra) um arquivo. Chamado pelo FileExplorer. */
  openFile: (path: string) => void;
  /** Cria um novo arquivo e o abre. */
  createFile: (name: string) => void;
  /**
   * Exclui um arquivo. Chamado DEPOIS do diálogo de confirmação do
   * FileExplorer (C2) — a confirmação vive no explorer, não aqui.
   */
  deleteFile: (path: string) => void;
  /**
   * Salva TODOS os buffers sujos em disco; `false` se algum write falhou.
   * A ChallengeView chama ANTES de `study.testAnswer` (C1): o teste roda o
   * código DO DISCO, então um buffer sujo não salvo seria medido como código
   * velho — o "Testar resposta" testaria outra coisa que não o editor.
   */
  save: () => Promise<boolean>;
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
 * Painel de edição com abas. O estado vem do reducer puro; IPC sob demanda;
 * a apresentação é toda da `EditorPaneView`. Expõe `openFile`/`createFile`/
 * `deleteFile` via ref para o FileExplorer.
 */
export const EditorPane = forwardRef<EditorPaneHandle, EditorPaneProps>(function EditorPane(
  { workspaceDir, files, onFilesChanged }: EditorPaneProps,
  ref,
): ReactElement {
  const { t } = useTranslation();
  const [tabs, dispatch] = useReducer(editorTabsReducer, initialEditorTabs);
  const [error, setError] = useState('');
  const [busyPath, setBusyPath] = useState<string | null>(null);

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
      if (findTab(tabs, path)) {
        dispatch({ type: 'activate', path });
        return;
      }
      setBusyPath(path);
      setError('');
      try {
        const content = await apiRead()({ workspaceDir, path });
        dispatch({ type: 'open', file: workspaceFileFor(files, path), content });
      } catch (err) {
        setError(`${t('translation:editor.openError')} "${path}": ${String(err)}`);
      } finally {
        setBusyPath(null);
      }
    },
    [tabs, workspaceDir, files, apiRead, t],
  );

  // Salva a aba informada; devolve sucesso.
  const saveTab = useCallback(
    async (path: string): Promise<boolean> => {
      const tab = findTab(tabs, path);
      if (!tab) return false;
      setError('');
      try {
        await apiWrite()({ workspaceDir, path: tab.path, content: tab.content });
        dispatch({ type: 'mark_saved', path: tab.path });
        onFilesChanged?.();
        return true;
      } catch (err) {
        setError(`${t('translation:editor.saveError')} "${path}": ${String(err)}`);
        return false;
      }
    },
    [tabs, workspaceDir, apiWrite, onFilesChanged, t],
  );

  // Troca de aba — se a atual está suja, salva antes (decisão pura).
  const activateTab = useCallback(
    async (path: string): Promise<void> => {
      const toSave = pathToAutosaveBeforeActivate(tabs, path);
      if (toSave) {
        const ok = await saveTab(toSave);
        if (!ok) return; // salvar falhou — não troca, preserva o trabalho.
      }
      dispatch({ type: 'activate', path });
    },
    [tabs, saveTab],
  );

  // Fecha aba — se suja, salva antes (decisão pura).
  const closeTab = useCallback(
    async (path: string): Promise<void> => {
      if (needsAutosaveBeforeClose(tabs, path)) {
        const ok = await saveTab(path);
        if (!ok) return;
      }
      dispatch({ type: 'close', path });
    },
    [tabs, saveTab],
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
        .catch((err) => setError(`${t('translation:editor.createError')} "${name}": ${String(err)}`));
    },
    [workspaceDir, apiWrite, onFilesChanged, openFile, t],
  );

  // Excluir arquivo (o diálogo de confirmação do FileExplorer já passou).
  const deleteFile = useCallback(
    async (path: string): Promise<void> => {
      setError('');
      try {
        await apiDelete()({ workspaceDir, path });
        dispatch({ type: 'close', path });
        onFilesChanged?.();
      } catch (err) {
        setError(`${t('translation:editor.deleteError')} "${path}": ${String(err)}`);
      }
    },
    [workspaceDir, apiDelete, onFilesChanged, t],
  );

  // Mudança de conteúdo (buffer) — marca dirty no reducer.
  const onContentChange = useCallback(
    (value: string): void => {
      const active = activeTab(tabs);
      if (active) {
        dispatch({ type: 'update_content', path: active.path, content: value });
      }
    },
    [tabs],
  );

  const saveActive = useCallback((): void => {
    const active = activeTab(tabs);
    if (active) void saveTab(active.path);
  }, [tabs, saveTab]);

  /**
   * Salva TODOS os buffers sujos (não só o ativo) e devolve sucesso (C1).
   * Quem chama é a ChallengeView antes de testar: `testAnswer` executa o
   * código do DISCO, e cada aba suja é código que o teste não veria. Falha de
   * write em qualquer aba devolve `false` — o chamador decide não testar.
   */
  const saveAllDirty = useCallback(async (): Promise<boolean> => {
    let ok = true;
    for (const path of dirtyPaths(tabs)) {
      const saved = await saveTab(path);
      if (!saved) ok = false;
    }
    return ok;
  }, [tabs, saveTab]);

  // Expõe as operações de arquivo ao FileExplorer (pai).
  useImperativeHandle(
    ref,
    (): EditorPaneHandle => ({
      openFile: (path) => void openFile(path),
      createFile,
      deleteFile: (path) => void deleteFile(path),
      save: saveAllDirty,
    }),
    [openFile, createFile, deleteFile, saveAllDirty],
  );

  return (
    <EditorPaneView
      tabs={tabs.tabs}
      activePath={tabs.activePath}
      error={error}
      busyPath={busyPath}
      onSaveActive={saveActive}
      onActivate={(p) => void activateTab(p)}
      onClose={(p) => void closeTab(p)}
      onContentChange={onContentChange}
    />
  );
});

export type { EditorTab } from '../../lib/editorTabs';
