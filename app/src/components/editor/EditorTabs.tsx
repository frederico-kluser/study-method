/**
 * src/components/editor/EditorTabs.tsx — abas dos arquivos abertos no editor.
 *
 * Renderiza a coleção de abas do EditorPaneState (puro `lib/editorTabs.ts`),
 * marca a aba ativa, mostra o indicador de não-salvo (dirty) e oferece o
 * fechamento de cada aba. Controlado: recebe estado + callbacks, não guarda
 * estado próprio. Chrome MUI: cada aba é um Chip.
 *
 * ─── W3+W4: FECHAR FOCÁVEL + "NÃO SALVO" PARA AT ──────────────────────────
 * O `onDelete` do Chip desenha o X como SVG com onClick — não entra na ordem
 * de tabulação nem tem nome acessível (um rato era obrigatório para fechar).
 * O fecho passa a ser um `IconButton` DENTRO do label do Chip: focável,
 * rotulado ("Fechar {{name}}"), e com o clique isolado (`stopPropagation`)
 * para não ativar a aba junto. O `role="tab"`/`aria-selected` do Chip não
 * muda — a barra continua uma tablist válida.
 * O "não salvo" era um ponto colorido com `aria-label` num span decorativo
 * (leitores de ecrã ignoram aria-label em span não interativo). Agora o ponto
 * é `aria-hidden` (marca visual) e o estado carrega TEXTO real do i18n
 * (`editor.unsaved`) numa região visually-hidden — a AT anuncia o estado em
 * vez de depender de uma cor.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
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
 * Texto visualmente oculto mas LÍVEL por AT (receita da região role="status"
 * da ChallengeView — SC 4.1.3): sai da caixa visual sem sair da árvore de
 * acessibilidade.
 */
const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: 1,
  height: 1,
  m: -1,
  p: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

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
  const { t } = useTranslation();
  // t() com interpolação (cast documentado na ChallengeView): `closeTabAria`
  // leva {{name}} e o t() strict-typed não resolve InterpolationMap.
  const tI = t as unknown as (key: string, options?: Record<string, string | number>) => string;
  if (tabs.length === 0) return null;

  return (
    <Box
      role="tablist"
      aria-label={t('translation:editor.openTabsAria')}
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
            label={
              <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}>
                <Box component="span">{tab.name}</Box>
                {tab.dirty ? (
                  // W4: o estado "não salvo" em TEXTO real para a AT (o ponto
                  // colorido continua como marca visual, aria-hidden).
                  <Box component="span" sx={VISUALLY_HIDDEN}>
                    {t('translation:editor.unsaved')}
                  </Box>
                ) : null}
                {/* W3: fecho FOCÁVEL e rotulado. stopPropagation isola o
                    clique do fecho da ativação da aba (o Chip inteiro é
                    clicável). O ::after estende o alvo de toque a 44px sem
                    inflar a barra de abas (piso do design system). */}
                <IconButton
                  size="small"
                  aria-label={tI('translation:editor.closeTabAria', { name: tab.name })}
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(tab.path);
                  }}
                  sx={{
                    position: 'relative',
                    width: 24,
                    height: 24,
                    '&:hover': { bgcolor: 'action.hover' },
                    '&::after': { content: '""', position: 'absolute', inset: -10 },
                  }}
                >
                  <CloseIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Box>
            }
            title={tab.path}
            clickable
            color={active ? 'primary' : 'default'}
            variant={active ? 'filled' : 'outlined'}
            size="small"
            avatar={
              tab.dirty ? (
                // Marca VISUAL de não-salvo (decorativa para AT — o texto
                // real está no label acima).
                <Box
                  aria-hidden="true"
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
            onClick={() => onActivate(tab.path)}
            sx={{
              mr: 0,
            }}
          />
        );
      })}
    </Box>
  );
}