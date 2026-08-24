/**
 * src/lib/editorTabs.ts — reducer puro para o estado de abas do EditorPane.
 *
 * O EditorPane gerencia uma coleção de abas abertas + o conteúdo editado de
 * cada uma (buffer) + o flag `dirty` (não salvo). Toda mutação passa por este
 * reducer para que a lógica (abrir/fechar/trocar/salvar/marcar-sujo/descartar)
 * seja testável sem jsdom.
 */
import type { WorkspaceFile } from '../../shared/ipc-contract';

/** Uma aba aberta no editor. */
export interface EditorTab {
  /** Path relativo do arquivo. */
  path: string;
  /** Basename para a etiqueta da aba. */
  name: string;
  /** Conteúdo editado atual (buffer). */
  content: string;
  /** True quando há mudanças não salvas desde o último save/load. */
  dirty: boolean;
  /** Língua/realce (extensão do arquivo), quando o WorkspaceFile informa. */
  language?: string;
}

/** Estado agregado das abas. */
export interface EditorTabsState {
  /** Todas as abas abertas, na ordem de abertura. */
  tabs: EditorTab[];
  /** Path da aba ativa (nula quando não há abas). */
  activePath: string | null;
}

export const initialEditorTabs: EditorTabsState = { tabs: [], activePath: null };

/** Ações do reducer. */
export type EditorTabsAction =
  | { type: 'open'; file: WorkspaceFile; content: string }
  | { type: 'activate'; path: string }
  | { type: 'update_content'; path: string; content: string }
  | { type: 'mark_saved'; path: string }
  | { type: 'mark_dirty'; path: string }
  | { type: 'close'; path: string };

/** Path da aba ativa (baseado no state), nulo quando nenhuma. */
function nextActivePath(
  tabs: EditorTab[],
  closedPath: string,
  previous: string | null,
): string | null {
  if (tabs.length === 0) return null;
  if (previous !== closedPath && tabs.some((t) => t.path === previous)) return previous;
  // Se a ativa foi fechada, volta para a primeira ainda aberta.
  return tabs[0].path;
}

export function editorTabsReducer(
  state: EditorTabsState,
  action: EditorTabsAction,
): EditorTabsState {
  switch (action.type) {
    case 'open': {
      const exists = state.tabs.some((t) => t.path === action.file.path);
      const tabs = exists
        ? state.tabs
        : [
            ...state.tabs,
            {
              path: action.file.path,
              name: action.file.name,
              content: action.content,
              dirty: false,
              language: action.file.language,
            },
          ];
      return { tabs, activePath: action.file.path };
    }

    case 'activate':
      if (!state.tabs.some((t) => t.path === action.path)) return state;
      return { ...state, activePath: action.path };

    case 'update_content':
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.path === action.path
            ? {
                ...t,
                content: action.content,
                // Suja apenas quando o conteúdo realmente mudou; só `mark_saved`
                // limpa (nunca desfaz per se ao voltar pro texto salvo).
                dirty: t.content !== action.content ? true : t.dirty,
              }
            : t,
        ),
      };

    case 'mark_saved':
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.path === action.path ? { ...t, dirty: false } : t,
        ),
      };

    case 'mark_dirty':
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.path === action.path ? { ...t, dirty: true } : t,
        ),
      };

    case 'close': {
      const remaining = state.tabs.filter((t) => t.path !== action.path);
      return {
        tabs: remaining,
        activePath: nextActivePath(remaining, action.path, state.activePath),
      };
    }

    default:
      return state;
  }
}

/** Helpers de consulta (puros) usados pela UI. */
/** Devolve a aba ativa ou `undefined`. */
export function activeTab(state: EditorTabsState): EditorTab | undefined {
  return state.tabs.find((t) => t.path === state.activePath);
}

/** True quando há alguma aba suja. */
export function hasDirty(state: EditorTabsState): boolean {
  return state.tabs.some((t) => t.dirty);
}