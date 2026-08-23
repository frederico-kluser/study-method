/**
 * src/components/editor/EditorTabs.tsx — abas dos arquivos abertos no editor.
 *
 * Renderiza a coleção de abas do EditorPaneState (puro `lib/editorTabs.ts`),
 * marca a aba ativa, mostra o indicador de não-salvo (dirty) e oferece o
 * fechamento de cada aba. Controlado: recebe estado + callbacks, não guarda
 * estado próprio.
 */
import type { ReactElement } from 'react';
import { X } from 'lucide-react';
import type { EditorTab } from '../../lib/editorTabs';

/** Callbacks emitidos pela barra de abas. */
export interface EditorTabsCallbacks {
  onActivate: (path: string) => void;
  onClose: (path: string) => void;
}

/** Props de {@link EditorTabs}. */
export interface EditorTabsProps extends EditorTabsCallbacks {
  tabs: EditorTab[];
  activePath: string | null;
}

/**
 * Barra de abas horizontal. Quando não há abas, retorna `null` (o pane mostra
 * um estado vazio por fora). Fechar uma aba chama `onClose(path)`.
 */
export function EditorTabs({
  tabs,
  activePath,
  onActivate,
  onClose,
}: EditorTabsProps): ReactElement | null {
  if (tabs.length === 0) return null;

  return (
    <div className="editor-tabs" role="tablist" aria-label="Arquivos abertos">
      {tabs.map((tab) => {
        const active = tab.path === activePath;
        return (
          <div
            key={tab.path}
            role="tab"
            aria-selected={active}
            className={'editor-tab' + (active ? ' is-active' : '') + (tab.dirty ? ' is-dirty' : '')}
            title={tab.path}
            onClick={() => onActivate(tab.path)}
          >
            <span className="editor-tab__name">{tab.name}</span>
            {tab.dirty ? <span className="editor-tab__dirty" aria-label="não salvo" /> : null}
            <button
              type="button"
              className="editor-tab__close"
              aria-label={`Fechar ${tab.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.path);
              }}
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}