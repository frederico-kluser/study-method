/**
 * src/views/ChallengeView/blocks/ChallengeStatusRegion.tsx — a REGIÃO DE
 * STATUS (SC 4.1.3 / docs §8): sempre no DOM, visualmente oculta;
 * `announceStatus()` reutiliza este elemento.
 *
 * VIEW PURA (docs/storybook/STORY-SPEC.md §5): só props (nenhuma), zero IPC,
 * zero estado. O sr-only vem de `lib/a11yStyles.SR_ONLY_SX` (auditoria §5 —
 * a cópia local tinha o bug latente `width: 1` → 100% / `m: -1` → -8px; o
 * token usa medidas absolutas em px).
 */
import type { ReactElement } from 'react';
import Box from '@mui/material/Box';
import { SR_ONLY_SX } from '../../../lib/a11yStyles';

export function ChallengeStatusRegion(): ReactElement {
  return (
    <Box
      component="div"
      role="status"
      aria-live="polite"
      sx={SR_ONLY_SX}
    />
  );
}
