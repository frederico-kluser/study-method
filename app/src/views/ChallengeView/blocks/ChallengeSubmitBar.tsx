/**
 * src/views/ChallengeView/blocks/ChallengeSubmitBar.tsx — a BARRA DE AÇÃO
 * PEGAJOSA (W13): "Testar resposta" sempre alcançável sem scroll, colada ao
 * fundo do contentor rolável (mesmo papel do grupo ancorado do fluxo track —
 * ONDA-INPUT-ANCORADO).
 *
 * VIEW PURA (docs/storybook/STORY-SPEC.md §5): só props, zero IPC, zero
 * estado.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import BlockIcon from '@mui/icons-material/Block';
import { Z_INDEX } from '../../../lib/designTokens';

export interface ChallengeSubmitBarProps {
  /** "Testar resposta" habilitado (desafio ativo e nenhuma fase em voo). */
  canTest: boolean;
  /** Há uma fase em voo (spinner no botão + Abortar habilitado). */
  busy: boolean;
  /** Fase determinística + pi — para o sinal de onboarding. */
  testSignal: string;
  onTest: () => void;
  onAbort: () => void;
}

export function ChallengeSubmitBar({
  canTest,
  busy,
  testSignal,
  onTest,
  onAbort,
}: ChallengeSubmitBarProps): ReactElement {
  const { t } = useTranslation();
  return (
    <Paper
      variant="outlined"
      sx={(theme) => ({
        position: 'sticky',
        bottom: 0,
        // Camada nomeada por PAPEL (auditoria §12 — o literal `10` mágico).
        zIndex: Z_INDEX.stickyBar,
        mt: 2,
        p: 1,
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        gap: 1,
        alignItems: 'center',
        // Superfície de chrome (nível 3 da rampa) — a barra flutua sobre o
        // conteúdo e precisa de se separar dele sem sombra.
        backgroundColor: theme.vars.palette.surface.level3,
      })}
    >
      <Button
        variant="contained"
        disabled={!canTest}
        // Onda 1 (botões com ícone): `loading` SEM `loadingPosition` usa
        // 'center' — o MUI v9 pinta o label de `color: transparent` e mostra
        // SÓ o spinner. Com `loadingPosition="start"` o spinner entra EM LINHA
        // no lugar do ícone (startIcon vira `opacity: 0`) e o label "Testar
        // resposta" fica visível o tempo todo.
        loading={busy}
        loadingPosition="start"
        startIcon={<PlayArrowIcon />}
        onClick={onTest}
        data-onboarding-target="challenge-test-answer"
        data-onboarding-signal={`test-status:${testSignal}`}
      >
        {t('translation:challenge.testAnswer')}
      </Button>
      <Button
        variant="outlined"
        color="error"
        // C4: "Abortar" também durante a fase determinística (antes só
        // desativava com o pi parado e a fase determinística ficava presa até
        // o fim do IPC).
        disabled={!busy}
        startIcon={<BlockIcon />}
        onClick={onAbort}
      >
        {t('translation:challenge.abort')}
      </Button>
    </Paper>
  );
}
