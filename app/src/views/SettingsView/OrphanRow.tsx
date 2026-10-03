/**
 * src/views/SettingsView/OrphanRow.tsx — UMA linha de resquício (bloco visual):
 * o slug + o inventário do que seria removido (chips por contagem).
 *
 * Bloco puro (só props) — documentado em `Componentes/Definições/OrphanRow`.
 * Cartão de lista do LAYOUT-DRY-AUDIT §10 (padding canónico `p: 1.5`).
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { TrackOrphanEntry } from '../../../shared/ipc-contract';
import { InfoCard } from '../../components/ui/InfoCard';

/** Interpolação ({{n}}): mesmo cast aprovado das demais views (tI). */
export type TranslateWithVars = (key: string, options?: Record<string, string | number>) => string;

export interface OrphanRowProps {
  orphan: TrackOrphanEntry;
  tI: TranslateWithVars;
}

/** Uma linha do resquício: o slug + o inventário do que seria removido. */
export function OrphanRow({
  orphan,
  tI,
}: {
  orphan: TrackOrphanEntry;
  tI: (key: string, options?: Record<string, string | number>) => string;
}): ReactElement {
  const { t } = useTranslation();
  const chips: string[] = [];
  if (orphan.attemptCount > 0) chips.push(tI('settings.orphansAttempts', { n: orphan.attemptCount }));
  if (orphan.lessonsDoneCount > 0) chips.push(tI('settings.orphansLessonsDone', { n: orphan.lessonsDoneCount }));
  if (orphan.generatedChallengeCount > 0) {
    chips.push(tI('settings.orphansGenerated', { n: orphan.generatedChallengeCount }));
  }
  if (orphan.hasProficiency) chips.push(t('translation:settings.orphansProficiency'));
  chips.push(tI('settings.orphansRowCount', { n: orphan.rowCount }));

  return (
    <InfoCard
      title={
        orphan.subjectName && orphan.subjectName !== orphan.slug
          ? `${orphan.subjectName} (${orphan.slug})`
          : orphan.slug
      }
      subtitle={
        <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
          {chips.map((label) => (
            <Chip key={label} size="small" variant="outlined" label={label} />
          ))}
        </Stack>
      }
    />
  );
}
