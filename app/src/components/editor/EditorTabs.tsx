/**
 * src/components/editor/EditorTabs.tsx — abas dos arquivos abertos no editor.
 *
 * Renderiza a coleção de abas do EditorPaneState (puro `lib/editorTabs.ts`),
 * marca a aba ativa, mostra o indicador de não-salvo (dirty) e oferece o
 * fechamento de cada aba. Controlado: recebe estado + callbacks, não guarda
 * estado próprio. Chrome MUI: cada aba é um Chip; o fechamento usa `onDelete`;
 * o dirty usa variante/avatar de "•".
 */
import type { ReactElement } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
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
    <Box
      role="tablist"
      aria-label="Arquivos abertos"
      sx={{
        display: 'flex',
        gap: 0.5,
        overflowX: 'auto',
        px: 0.5,
        py: 0.5,
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      {tabs.map((tab) => {
        const active = tab.path === activePath;
        return (
          <Chip
            key={tab.path}
            role="tab"
            aria-selected={active}
            label={tab.name}
            title={tab.path}
            clickable
            color={active ? 'primary' : 'default'}
            variant={active ? 'filled' : 'outlined'}
            size="small"
            avatar={
              tab.dirty ? (
                <Box
                  aria-label="não salvo"
                  component="span"
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: active ? 'primary.contrastText' : 'warning.main',
                    ml: 1,
                  }}
                />
              ) : undefined
            }
            onDelete={() => onClose(tab.path)}
            onClick={() => onActivate(tab.path)}
            sx={{
              '& .MuiChip-deleteIcon': { fontSize: 14 },
              mr: 0,
            }}
          />
        );
      })}
    </Box>
  );
}