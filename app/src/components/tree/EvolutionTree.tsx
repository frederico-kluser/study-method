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
import { effectsTransition, FOCUS_RING, focusRingStyles, spatialTransition } from '../../theme';

/** Rótulos de estado do nó — usados no `aria-label` (i18n quando fornecido). */
export interface TreeStateLabels {
  done: string;
  current: string;
  pending: string;
  /** Rótulo do nível (semântico — entra no aria-label; o selo é aria-hidden). */
  level?: (level: DifficultyLevel) => string;
}

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

const DEFAULT_TITLE = 'Evolução da aprendizagem';
const DEFAULT_EMPTY = 'Nenhuma evolução registrada ainda. Gere sua primeira aula para começar.';
const DEFAULT_STATE_LABELS: TreeStateLabels = {
  done: 'concluído',
  current: 'em andamento',
  pending: 'pendente',
};

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
  defaultCollapsed,
  onSelectLesson,
  stateLabels,
  levelLabel,
}: {
  node: TreeViewNode;
  depth: number;
  defaultCollapsed: boolean;
  onSelectLesson: (lessonId: string) => void;
  stateLabels: TreeStateLabels;
  levelLabel?: (level: DifficultyLevel) => string;
}): ReactElement {
  const hasChildren = node.children.length > 0;
  // Nós com filhos colapsam (pasta); folhas não têm o que dobrar.
  const [open, setOpen] = useState(!defaultCollapsed);

  const stateText =
    node.state === 'done' ? stateLabels.done : node.state === 'current' ? stateLabels.current : stateLabels.pending;
  const levelText = node.level && levelLabel ? ` · ${levelLabel(node.level)}` : '';
  const nodeAriaLabel = hasChildren
    ? `${node.label} — ${stateText}, ${node.children.length} sub-aula(s)${levelText}`
    : `${node.label} — ${stateText}${levelText}`;

  const handleClick = (): void => {
    if (hasChildren) setOpen((o) => !o);
    onSelectLesson(node.lessonId);
  };

  const isCurrent = node.state === 'current';

  return (
    <Box
      role="treeitem"
      aria-expanded={hasChildren ? open : undefined}
      aria-label={nodeAriaLabel}
      sx={{ pl: depth * 16 }}
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
                defaultCollapsed={defaultCollapsed}
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
  title = DEFAULT_TITLE,
  collapsed = false,
  stateLabels = DEFAULT_STATE_LABELS,
  emptyLabel = DEFAULT_EMPTY,
}: EvolutionTreeProps): ReactElement {
  const list = nodes ?? [];
  const levelLabel = stateLabels.level;

  if (list.length === 0) {
    return (
      <Box component="section" sx={(theme) => ({ p: theme.spacing(0.5) })}>
        <Typography variant="body2" color="text.secondary">
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
        maxWidth: 680,
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
            defaultCollapsed={collapsed}
            onSelectLesson={onSelectLesson}
            stateLabels={stateLabels}
            levelLabel={levelLabel}
          />
        ))}
      </Stack>
    </Box>
  );
}
