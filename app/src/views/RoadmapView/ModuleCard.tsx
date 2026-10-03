/**
 * src/views/RoadmapView/ModuleCard.tsx — bloco do MÓDULO da trilha (cartão
 * colapsável com as aulas e o desafio do módulo).
 *
 * Bloco puro (só props, com o disclosure como estado de apresentação) —
 * documentado em `Componentes/Roadmap/ModuleCard`. O desafio do módulo
 * (rodada 9) é checklist funcional (`AssignmentOutlined`), nunca troféu.
 */
import { useState, type ReactElement } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import type { TrackLessonEntry, TrackModuleEntry } from '../../../shared/ipc-contract';
import { LessonRow } from './LessonRow';
// §1 (LAYOUT-DRY-AUDIT): o piso de alvo de toque são objetos de estilo
// partilhados (`touchTargetSx` = minHeight; `touchTargetBoxSx` = caixa do
// IconButton) — nunca `44` copiado.
import { touchTargetBoxSx, touchTargetSx } from '../../lib/layoutSx';

// (O antigo `TOUCH_TARGET_PX` local saiu — ver `lib/layoutSx.ts`.)

/** Um módulo da trilha (card colapsável). */
export function ModuleCard({
  mod,
  onOpenLesson,
  onOpenModuleChallenge,
  justUnlocked,
  defaultOpen,
  tI,
}: {
  mod: TrackModuleEntry;
  onOpenLesson: (l: TrackLessonEntry) => void;
  onOpenModuleChallenge: (mod: TrackModuleEntry) => void;
  /** ONDA11-CADEADO: slugs que ABRIRAM desde a última visita a esta trilha. */
  justUnlocked: ReadonlySet<string>;
  defaultOpen: boolean;
  tI: (key: string, options?: Record<string, string | number>) => string;
}): ReactElement {
  const [open, setOpen] = useState(defaultOpen);
  const doneCount = mod.lessons.filter((l) => l.done).length;
  return (
    <Card variant="outlined">
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
 <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {mod.title}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {tI('roadmap.moduleCount', { done: doneCount, total: mod.lessons.length })}
            </Typography>
          </Box>
          {/* Piso de alvo de toque (`touchTargetBoxSx`): o IconButton small nasce
              30×30 — a caixa cresce, o ícone continua pequeno. */}
          <IconButton
            size="small"
            onClick={() => setOpen((v) => !v)}
            aria-label={tI('roadmap.toggleModule', { module: mod.title })}
            sx={touchTargetBoxSx}
          >
            <ExpandMoreIcon sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
          </IconButton>
        </Stack>
        <Collapse in={open}>
          <Divider sx={{ my: 1 }} />
 <Stack spacing={0.25}>
            {mod.lessons.map((l) => (
              <LessonRow
                key={l.slug}
                lesson={l}
                onOpen={onOpenLesson}
                justUnlocked={justUnlocked.has(l.slug)}
                tI={tI}
              />
            ))}
          </Stack>
          {/* ADITIVO (rodada 9): DESAFIO DO MÓDULO — o desafio elaborado do fim
              do módulo (mexe em VÁRIOS arquivos), com o estado do aluno. */}
          {mod.challengeAvailable && mod.challenge ? (
            <Box sx={{ mt: 1 }}>
              <Button
                fullWidth
                size="small"
                variant="outlined"
                color="secondary"
                onClick={() => onOpenModuleChallenge(mod)}
                startIcon={<AssignmentOutlinedIcon fontSize="small" />}
                aria-label={`${tI('roadmap.moduleChallenge')} ${mod.challenge.title}`}
                sx={touchTargetSx}
              >
                {tI('roadmap.moduleChallenge')}
                {mod.challengeLastVerdict === 'passed'
                  ? ` · ${tI('roadmap.moduleChallengeDone')}`
                  : mod.challengeLastVerdict
                    ? ` · ${tI('roadmap.moduleChallengeTried')}`
                    : ''}
              </Button>
            </Box>
          ) : null}
        </Collapse>
      </CardContent>
    </Card>
  );
}
