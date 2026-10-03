/**
 * components/ui/SectionHeader.tsx — a LINHA DE CABEÇALHO de secção/painel:
 * título + slot de chips/ações, com a descrição por baixo (auditoria de layout
 * §8).
 *
 * As ~12 cópias (ChallengeView ×4, TrackChallengePanel ×2, RoadmapView,
 * OnboardingOverlay ×2, TutorialSelectionModal, LessonSidebarHeader,
 * SessionFrame) eram sempre o mesmo `Stack row + Typography flexGrow + slot`.
 * A variante com descrição (`body2` secundária) repetia-se 5× (SettingsView
 * ×3, ProgressPanel, OrphanTracksPanel) — o `sx` dela vive em
 * `lib/layoutSx.ts` (`sectionDescriptionSx`).
 *
 * VIEW PURA: só props. O nível do cabeçalho (a única decisão — `variant` vs
 * `component`) é `SectionHeader.state.ts`, testado sem jsdom. A copy vive no
 * chamador.
 */
import type { ReactElement, ReactNode } from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { sectionDescriptionSx } from '../../lib/layoutSx';
import {
  sectionHeadingStyle,
  type SectionHeadingLevel,
  type SectionHeadingVariant,
} from './SectionHeader.state';

export interface SectionHeaderProps {
  readonly title: ReactNode;
  /** Descrição `body2` secundária (a variante das 5 cópias de Settings). */
  readonly description?: ReactNode;
  /** Chips, botões, contadores — o slot da direita (nunca texto solto aqui). */
  readonly actions?: ReactNode;
  /**
   * Nível semântico do título — 2 por omissão (o das cópias). `1` é o
   * cabeçalho de PÁGINA (`<h1>`): ChallengeViewHeader, TrackChallengeHeader.
   */
  readonly level?: SectionHeadingLevel;
  /**
   * Talhe explícito (escape hatch do nível 1: o TrackChallengeHeader é h5/h1
   * enquanto o ChallengeViewHeader é h4/h1). NUNCA muda a semântica — o
   * `component` continua a nascer do `level` (`SectionHeader.state.ts`).
   */
  readonly variant?: SectionHeadingVariant;
  /** Id do título (para `aria-labelledby` de quem envolve) — só se precisarem dele. */
  readonly titleId?: string;
}

export function SectionHeader({
  title,
  description,
  actions,
  level = 2,
  variant,
  titleId,
}: SectionHeaderProps): ReactElement {
  const cabecalho = sectionHeadingStyle(level, variant);

  return (
    <>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
        <Typography
          variant={cabecalho.variant}
          component={cabecalho.component}
          id={titleId}
          sx={{ flexGrow: 1 }}
        >
          {title}
        </Typography>
        {actions}
      </Stack>
      {description ? (
        <Typography variant="body2" sx={sectionDescriptionSx}>
          {description}
        </Typography>
      ) : null}
    </>
  );
}
