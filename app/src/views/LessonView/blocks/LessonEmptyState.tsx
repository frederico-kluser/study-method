/**
 * blocks/LessonEmptyState.tsx — o estado VAZIO da aula (nenhuma aula de trilha
 * selecionada: sem report de erro, sem pendência da trilha, sem "última aula").
 *
 * Bloco de VIEW PURO (contrato STORY-SPEC §5): só props. O desenho é o
 * primitivo `components/ui/EmptyState` (audit LAYOUT-DRY-AUDIT §4 — ícone +
 * título + descrição + CTA centrados, coluna de leitura); aqui só a copy da
 * AULA e a ligação do CTA (o container decide a navegação).
 */
import Button from '@mui/material/Button';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import { useTranslation } from 'react-i18next';
import type { ReactElement } from 'react';
import { EmptyState } from '../../../components/ui/EmptyState';

export interface LessonEmptyStateProps {
  /** O CTA leva para a trilha (roadmap) — a navegação é do container. */
  onGoToRoadmap: () => void;
}

export function LessonEmptyState({ onGoToRoadmap }: LessonEmptyStateProps): ReactElement {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={AutoStoriesIcon}
      title={t('translation:lesson.emptyTitle')}
      description={t('translation:lesson.emptyDescription')}
      action={
        <Button variant="contained" onClick={onGoToRoadmap}>
          {t('translation:lesson.emptyCta')}
        </Button>
      }
    />
  );
}
