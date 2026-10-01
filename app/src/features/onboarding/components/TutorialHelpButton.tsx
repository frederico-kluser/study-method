/**
 * src/features/onboarding/components/TutorialHelpButton.tsx
 *
 * O BOTÃO DE AJUDA do shell — a promessa que o tutorial sempre fez
 * ("você pode reabrir-lo depois pelo botão de ajuda") finalmente tem um alvo.
 *
 * ─── O QUE ELE FAZ ─────────────────────────────────────────────────────────
 * Abre o MESMO modal de seleção da primeira execução (Quick Start ⟷ Tutorial
 * Completo) via `tutorialLauncherService` — quem reabre pelo botão de ajuda
 * pode estar atrás do tour curto, e o modal já trata o gate de chaves
 * (Tutorial Completo exige OpenRouter + Brave, com CTA "Configurar chaves").
 * Sem o `OnboardingHost` montado, o serviço devolve `false` e nada acontece:
 * o botão nunca derruba a UI por falta de registo.
 *
 * ─── ONDE VIVE ─────────────────────────────────────────────────────────────
 * Na linha de controles do pé da `SessionFrame` (ao lado de tema e idioma) —
 * o mesmo arranjo do VS Code, com as ações de suporte no fundo da coluna. O
 * alvo `data-onboarding-target="help-button"` está no catálogo
 * (`onboardingTargets.ts`, `everywhere: true`): o botão existe em todas as
 * abas e o futuro step de "onde está a ajuda" pode iluminá-lo.
 *
 * ─── A11Y ──────────────────────────────────────────────────────────────────
 * `Tooltip` + `aria-label` com a MESMA string (`tutorial.helpButton.label`) —
 * leitor de tela e hover dizem o mesmo. Alvo de 40px (acima do piso de 24px
 * do SC 2.5.8, folga para o clique); o `size="small"` do MUI é visual, não
 * geométrico — a caixa é a dos `sx`.
 */
import type { ReactElement } from 'react';
import HelpRoundedIcon from '@mui/icons-material/HelpRounded';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { useTranslation } from 'react-i18next';

import { tutorialLauncherService } from '../services/tutorialLauncher.service';

/** Alvo de toque do botão (≥ 24px do SC 2.5.8, generoso para o clique). */
const HELP_BUTTON_TARGET_PX = 40;

export function TutorialHelpButton(): ReactElement {
  const { t } = useTranslation();
  const label = t('translation:tutorial.helpButton.label');

  return (
    <Tooltip title={label}>
      <IconButton
        size="small"
        color="inherit"
        aria-label={label}
        data-onboarding-target="help-button"
        onClick={() => {
          tutorialLauncherService.openSelection();
        }}
        sx={{
          border: 1,
          borderColor: 'divider',
          minWidth: HELP_BUTTON_TARGET_PX,
          minHeight: HELP_BUTTON_TARGET_PX,
        }}
      >
        <HelpRoundedIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}

export default TutorialHelpButton;
