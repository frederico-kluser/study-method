/**
 * src/components/tree/EvolutionTree.tsx — ÁRVORE DE EVOLUÇÃO das aulas.
 * (onda3-arvore-ui · onda2-trilha)
 *
 * Renderiza a árvore de evolução do motor (`progressEngine.treeToView` mapeada
 * por `src/lib/treeView.ts`) como uma lista aninhada COLAPSÁVEL: uma aula
 * quebrada → filhas; nós de aulas concluídas aparecem marcados (✓, preenchidos),
 * pendentes mais claros; cada nó é clicável para navegar à aula.
 *
 * Acessível por teclado: cada nó é um botão real (Enter/Espaço), com estados
 * `aria-expanded`/`aria-label` (título + estado concluído/pendente). Mobile-first
 * (sx responsivo) e colapsável/scroll. NÃO introduz XP/streak/placar — só o
 * status concluído-pendente da evolução.
 *
 * ─── ONDA 2 (trilha): EXTENSÕES ADITIVAS ─────────────────────────────────────
 * O componente estava ÓRFÃO (nenhuma view o importava) e a RoadmapView passou
 * a usá-lo. As extensões mantêm o comportamento antigo quando as props novas
 * não vêm (defaults legados), então nada quebraria um consumo futuro:
 *  - `state: 'current'` (treeView.ts): o nó "em andamento" ganha borda de
 *    acento + ponto preenchido + `aria-current="true"` — o destaque da próxima
 *    aula da trilha;
 *  - `stateLabels`: rótulos de estado i18n para o `aria-label` do nó (a trilha
 *    é multilíngue; os defaults legados seguem em pt-BR);
 *  - `levelLabel` + `node.level`: um selo discreto do nível da trilha por nó
 *    (o selo é puramente visual — `aria-hidden` — porque o nível entra no
 *    `aria-label` do nó via `stateLabels.level`);
 *  - `emptyLabel`: mensagem de árvore vazia i18n (default legado preservado).
 *
 * Integração: recebe a árvore pronta por props. Nenhum `data-onboarding-target`
 * existente é perdido; `tree-node` é NOVO (ainda não catalogado).
 */
import { useState, type ReactElement } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import type { DifficultyLevel } from '../../lib/levels';
import type { TreeViewNode } from '../../lib/treeView';
import { LAYOUT } from '../../lib/designTokens';
import { effectsTransition, FOCUS_RING, focusRingStyles, spatialTransition } from '../../theme';
import {
  defaultStateLabels,
  defaultTreeEmpty,
  defaultTreeTitle,
  initialTreeOpenState,
  isTreeOpen,
  nodeAriaLabel,
  nodeIndent,
  nodeIsFolder,
  toggleTreeOpenState,
  type TreeOpenState,
  type TreeStateLabels,
} from './evolutionTreeState';

/**
 * Rótulos de estado do nó — o contrato de i18n vive em `evolutionTreeState.ts`
 * (lógica pura, testada sem jsdom); a re-exportação mantém o export público.
 */
export type { TreeStateLabels };

export interface EvolutionTreeProps {
  /** Árvore pronta para render (saída de `toTreeView`). */
  nodes: TreeViewNode[];
  /** Navega para a aula (`lessonId`). */
  onSelectLesson: (lessonId: string) => void;
  /** Rótulo da seção (opcional). */
  title?: string;
  /** Collapse de TODA a árvore quando true (opcional). */
  collapsed?: boolean;
  /** Rótulos de estado i18n (onda2-trilha; defaults legados em pt-BR). */
  stateLabels?: TreeStateLabels;
  /** Mensagem de árvore vazia i18n (onda2-trilha; default legado preservado). */
  emptyLabel?: string;
}

/** Selo visual do nível (aria-hidden: o nível já vai no aria-label do nó). */
function LevelBadge({
  level,
  levelLabel,
}: {
  level: DifficultyLevel;
  levelLabel: (level: DifficultyLevel) => string;
}): ReactElement {
  return (
    <Chip
      aria-hidden="true"
      size="small"
      variant="outlined"
      label={levelLabel(level)}
      sx={(theme) => ({
        ml: 1,
        height: 20,
        fontSize: '0.6875rem',
        // Selo é tinta sobre chrome — fronteira de nível: nunca acento-como-texto.
        color: theme.vars.palette.text.secondary,
        borderColor: theme.vars.palette.divider,
        '& .MuiChip-label': { px: 1 },
      })}
    />
  );
}

/** Um nó "folha ou pasta" da árvore — recursivo. */
function TreeNode({
  node,
  depth,
  openState,
  onToggle,
  onSelectLesson,
  stateLabels,
  levelLabel,
}: {
  node: TreeViewNode;
  depth: number;
  openState: TreeOpenState;
  onToggle: (node: TreeViewNode) => void;
  onSelectLesson: (lessonId: string) => void;
  stateLabels: TreeStateLabels;
  levelLabel?: (level: DifficultyLevel) => string;
}): ReactElement {
  const hasChildren = nodeIsFolder(node);
  // Estado de LAYOUT do grafo: a abertura das pastas vive na RAIZ como
  // conjunto imutável (evolutionTreeState.ts — lógica pura, testada sem
  // jsdom). Aqui só se lê (`isTreeOpen`) e se pede o toggle ao dono.
  const open = isTreeOpen(openState, node.lessonId);

  const nodeAria = nodeAriaLabel(node, stateLabels);

  const handleClick = (): void => {
    if (hasChildren) onToggle(node);
    onSelectLesson(node.lessonId);
  };

  const isCurrent = node.state === 'current';

  return (
    <Box
      role="treeitem"
      aria-expanded={hasChildren ? open : undefined}
      aria-label={nodeAria}
      sx={{ pl: nodeIndent(depth) }}
    >
      <Button
        variant={node.state === 'done' ? 'contained' : 'outlined'}
        size="small"
        aria-current={isCurrent ? 'true' : undefined}
        startIcon={
          node.state === 'done' ? (
            <CheckRounded fontSize="inherit" />
          ) : isCurrent ? (
            // Ponto preenchido de ACENTO: preenchimento, não texto (regra 3b).
            <Box
              sx={(theme) => ({
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: theme.vars.palette.primary.fill,
                flexShrink: 0,
              })}
            />
          ) : undefined
        }
        endIcon={
          hasChildren ? (
            <ChevronRightRounded
              fontSize="small"
              sx={(theme) => ({
                transition: spatialTransition(theme, ['transform'], 'fast'),
                transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
              })}
            />
          ) : undefined
        }
        onClick={handleClick}
        data-onboarding-target="tree-node"
        sx={(theme) => ({
          justifyContent: 'flex-start',
          textAlign: 'left',
          textTransform: 'none',
          minHeight: 36,
          width: '100%',
          // ONDA 1 (game-foundations): px 1 → 1.5 — ícone+texto dos nós da
          // árvore com respiro lateral (o piso do tamanho small é 12px).
          px: 1.5,
          ...(node.state === 'done'
            ? {}
            : isCurrent
              ? {
                  // Em andamento: tinta forte + borda de acento (o destaque da
                  // próxima aula). Acento só como BORDA, nunca como texto.
                  color: theme.vars.palette.text.primary,
                  borderColor: theme.vars.palette.primary.fill,
                }
              : { color: theme.vars.palette.text.secondary, opacity: 0.9 }),
          '&.Mui-focusVisible': focusRingStyles(theme),
          '&:focus-visible': focusRingStyles(theme),
          transition: effectsTransition(theme, ['background-color', 'color'], 'fast'),
        })}
      >
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', minWidth: 0 }}>
          <Box component="span" sx={{ overflowWrap: 'anywhere' }}>
            {node.label}
          </Box>
          {node.level && levelLabel ? <LevelBadge level={node.level} levelLabel={levelLabel} /> : null}
        </Box>
      </Button>

      {hasChildren ? (
        <Collapse in={open} unmountOnExit>
          <Stack spacing={0.5} sx={{ mt: 0.5 }}>
            {node.children.map((child) => (
              <TreeNode
                key={child.lessonId}
                node={child}
                depth={depth + 1}
                openState={openState}
                onToggle={onToggle}
                onSelectLesson={onSelectLesson}
                stateLabels={stateLabels}
                levelLabel={levelLabel}
              />
            ))}
          </Stack>
        </Collapse>
      ) : null}
    </Box>
  );
}

export default function EvolutionTree({
  nodes,
  onSelectLesson,
  title = defaultTreeTitle(),
  collapsed = false,
  stateLabels = defaultStateLabels(),
  emptyLabel = defaultTreeEmpty(),
}: EvolutionTreeProps): ReactElement {
  const list = nodes ?? [];
  const levelLabel = stateLabels.level;
  // Estado de LAYOUT do grafo (puro — evolutionTreeState.ts, testado em
  // tests/evolutionTreeState.test.ts): que pastas estão abertas. Nasce
  // `!collapsed`, tal como o `useState(!defaultCollapsed)` de cada nó antigo.
  const [openState, setOpenState] = useState<TreeOpenState>(() =>
    initialTreeOpenState(list, collapsed),
  );
  const handleToggle = (node: TreeViewNode): void => {
    setOpenState((current) => toggleTreeOpenState(current, node, collapsed));
  };

  if (list.length === 0) {
    return (
      <Box component="section" sx={(theme) => ({ p: theme.spacing(0.5) })}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {emptyLabel}
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      component="section"
      role="tree"
      aria-label={title}
      sx={{
        maxWidth: LAYOUT.chooserColumnPx,
        maxHeight: 420,
        overflow: 'auto',
        mx: 'auto',
        px: 0.5,
      }}
    >
      <Typography variant="h6" component="h2" gutterBottom>
        {title}
      </Typography>
      <Stack spacing={0.5}>
        {list.map((root) => (
          <TreeNode
            key={root.lessonId}
            node={root}
            depth={0}
            openState={openState}
            onToggle={handleToggle}
            onSelectLesson={onSelectLesson}
            stateLabels={stateLabels}
            levelLabel={levelLabel}
          />
        ))}
      </Stack>
    </Box>
  );
}
