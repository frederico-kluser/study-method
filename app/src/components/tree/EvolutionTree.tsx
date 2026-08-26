/**
 * src/components/tree/EvolutionTree.tsx — ÁRVORE DE EVOLUÇÃO das aulas.
 * (onda3-arvore-ui)
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
 * Integração: recebe a árvore pronta por props (agente paralelo onda 3.1 entrega
 * os dados; aqui a UI RENDERIZA o que recebe). Nenhum `data-onboarding-target`
 * existente é perdido; `tree-node` é NOVO (ainda não catalogado).
 */
import { useState, type ReactElement } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import type { TreeViewNode } from '../../lib/treeView';
import { effectsTransition, FOCUS_RING, focusRingStyles, spatialTransition } from '../../theme';

export interface EvolutionTreeProps {
  /** Árvore pronta para render (saída de `toTreeView`). */
  nodes: TreeViewNode[];
  /** Navega para a aula (`lessonId`). */
  onSelectLesson: (lessonId: string) => void;
  /** Rótulo da seção (opcional). */
  title?: string;
  /** Collapse de TODA a árvore quando true (opcional). */
  collapsed?: boolean;
}

const DEFAULT_TITLE = 'Evolução da aprendizagem';

/** Um nó "folha ou pasta" da árvore — recursivo. */
function TreeNode({
  node,
  depth,
  defaultCollapsed,
  onSelectLesson,
}: {
  node: TreeViewNode;
  depth: number;
  defaultCollapsed: boolean;
  onSelectLesson: (lessonId: string) => void;
}): ReactElement {
  const hasChildren = node.children.length > 0;
  // Nós com filhos colapsam (pasta); folhas não têm o que dobrar.
  const [open, setOpen] = useState(!defaultCollapsed);

  const stateLabel = node.state === 'done' ? 'concluído' : 'pendente';
  const nodeAriaLabel = hasChildren
    ? `${node.label} — ${stateLabel}, ${node.children.length} sub-aula(s)`
    : `${node.label} — ${stateLabel}`;

  const handleClick = (): void => {
    if (hasChildren) setOpen((o) => !o);
    onSelectLesson(node.lessonId);
  };

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
        startIcon={node.state === 'done' ? <CheckRounded fontSize="inherit" /> : undefined}
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
          px: 1,
          // Pedido: concluído = preenchido/marcado; pendente = mais claro.
          ...(node.state === 'pending'
            ? { color: theme.vars.palette.text.secondary, opacity: 0.9 }
            : {}),
          '&.Mui-focusVisible': focusRingStyles(theme),
          '&:focus-visible': focusRingStyles(theme),
          transition: effectsTransition(theme, ['background-color', 'color'], 'fast'),
        })}
      >
        {node.label}
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
}: EvolutionTreeProps): ReactElement {
  const list = nodes ?? [];

  if (list.length === 0) {
    return (
      <Box component="section" sx={(theme) => ({ p: theme.spacing(0.5) })}>
        <Typography variant="body2" color="text.secondary">
          Nenhuma evolução registrada ainda. Gere sua primeira aula para começar.
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
          />
        ))}
      </Stack>
    </Box>
  );
}
