/**
 * src/components/theme/ThemeModeSelector.tsx — o seletor de tema da interface.
 *
 * ─── POR QUE NÃO MAIS UM BOTÃO QUE CICLA ───────────────────────────────────
 * O antigo `ThemeToggleButton` era um IconButton que AVANÇAVA o modo
 * (light → dark → system → light…) — o clique só fazia sentido depois de se
 * saber onde o ciclo estava, o ícone dizia o modo ATUAL (não o que ia fazer) e
 * três estados num ciclo de um botão são uma roleta. Queixa do dono, verbatim:
 * *"arrume o botão de toggle de theme para um botão intuitivo"*. O padrão
 * intuitivo é a SELEÇÃO DIRETA: um segmentado que mostra TODAS as opções de
 * uma vez com a atual destacada — é o que o VS Code (Settings → Theme), o
 * macOS e o Material Design fazem. Um clique = o modo que se vê.
 *
 * ─── UM COMPONENTE, DOIS TAMANHOS ──────────────────────────────────────────
 * A MESMA lógica serve os dois lugares (nunca duplicar estado de tema — o
 * `useColorScheme` do MUI é a única fonte, e a persistência continua toda no
 * `ThemeProvider` via `modeStorageKey="theme-mode"` — ver main.tsx):
 *   · `variant="compact"` — o pé da coluna lateral (SessionFrame): só ícones,
 *     `size="small"`, Tooltip por segmento (o ícone sozinho merece nome);
 *   · `variant="full"` — o painel "Aparência" das Configurações: ícone +
 *     rótulo, `size="medium"`, sem tooltip (o rótulo JÁ é o nome).
 *
 * ─── ORDEM VISUAL: CLARO · SISTEMA · ESCURO ────────────────────────────────
 * A ordem de EXIBição é a clássica do material (claro à esquerda, escuro à
 * direita, o "segue o sistema" no meio como ponte) — não a ordem do ciclo
 * antigo (`nextThemeMode` em themeModeState.ts, que os testes ainda cobrem).
 *
 * ─── A11Y ──────────────────────────────────────────────────────────────────
 * O grupo é `role="group"` (inseto do MUI) com nome acessível
 * (`theme.mode.toggle`); cada segmento tem o próprio `aria-label` (regra da
 * casa: um por botão) IGUAL ao rótulo visível no `full` (WCAG 2.5.3 Label in
 * Name trivialmente satisfeito). No `compact` o rótulo visível é o ícone e o
 * nome acessível é o modo. O MUI gere roving tabindex no grupo (setas
 * navegam; só o selecionado entra na ordem de tab).
 *
 * ─── CONTRATO DE TESTES (data-theme-mode) ──────────────────────────────────
 * Cada segmento carrega `data-theme-mode="light|system|dark"`: é a alça
 * ESTÁVEL e agnóstica de idioma dos specs e2e (o aria-label muda com o locale
 * — os testes nunca devem depender de texto). Os alvos de onboarding ficam nos
 * WRAPPERS de cada colocação (SessionFrame mantém `data-onboarding-target=
 * "theme-toggle"` no invólucro de `display:contents` — ver shellSidebarSlot
 * .test.ts para as guardas de fonte que protegem esse literal).
 *
 * Nota do MUI: `mode` é `undefined` no primeiro render (hidratação do
 * `useColorScheme`). Tratamos com fallback para `system` para não marcar o
 * segmento errado antes da montagem — mesmo contrato do botão antigo.
 */
import { type ReactElement } from 'react';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import { useColorScheme } from '@mui/material/styles';
// Família ÚNICA `*Rounded` no chrome do shell (ONDA-UX-RAIL-ICON, achado 7 da
// auditoria UX): o rail de navegação é todo `*Rounded` e este seletor vive no
// MESMO nível de chrome (pé da sidebar) — duas famílias de ícone lado a lado
// eram uma rachadura de consistência silenciosa (C.1.1.01).
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded';
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded';
import SettingsBrightnessRoundedIcon from '@mui/icons-material/SettingsBrightnessRounded';
import { useTranslation } from 'react-i18next';

import { THEME_MODE_I18N_KEY, type ThemeMode } from './themeModeState';

/** Ordem VISUAL dos segmentos: claro → sistema → escuro. */
const DISPLAY_MODES: readonly ThemeMode[] = ['light', 'system', 'dark'] as const;

const MODE_ICON: Record<ThemeMode, ReactElement> = {
  light: <LightModeRoundedIcon fontSize="small" />,
  system: <SettingsBrightnessRoundedIcon fontSize="small" />,
  dark: <DarkModeRoundedIcon fontSize="small" />,
};

export interface ThemeModeSelectorProps {
  /**
   * `compact` = pé da coluna lateral (só ícones, com tooltip);
   * `full` = painel "Aparência" das Configurações (ícone + rótulo).
   */
  readonly variant?: 'full' | 'compact';
}

export default function ThemeModeSelector({
  variant = 'full',
}: ThemeModeSelectorProps): ReactElement {
  const { t } = useTranslation();
  const { mode, setMode } = useColorScheme();

  // `mode` é undefined no primeiro render (hidratação MUI) — caímos em 'system'.
  const current: ThemeMode = mode ?? 'system';
  const compact = variant === 'compact';

  return (
    <ToggleButtonGroup
      exclusive
      size={compact ? 'small' : 'medium'}
      value={current}
      aria-label={t('translation:theme.mode.toggle')}
      onChange={(_event, next: ThemeMode | null) => {
        // exclusive: clicar no selecionado devolve null — é no-op, o modo fica.
        if (next !== null) setMode(next);
      }}
    >
      {DISPLAY_MODES.map((m) => {
        const label = t(THEME_MODE_I18N_KEY[m]);
        const button = (
          <ToggleButton
            key={m}
            value={m}
            aria-label={label}
            data-theme-mode={m}
            // Ícone + rótulo lado a lado (ButtonBase é inline-flex): sem o
            // `gap` o texto colava no ícone. No compacto não há rótulo.
            // PISO DE TOQUE (TOUCH_TARGET_PX = 44 do design system): o
            // IconButton `small` que este seletor substituía tinha 32px e
            // reprovava o piso — os segmentos cumprem-no nos dois tamanhos.
            sx={{
              minHeight: 44,
              ...(compact ? { minWidth: 44 } : { gap: 0.75 }),
            }}
          >
            {MODE_ICON[m]}
            {compact ? null : label}
          </ToggleButton>
        );
        return compact ? (
          <Tooltip
            key={m}
            title={`${t('translation:theme.mode.toggle')}: ${label}`}
            // ONDA-UX: `disableInteractive` é OBRIGATÓRIO aqui — o tooltip
            // abria POR CIMA do controlo de idioma logo abaixo e interceptava
            // os cliques nele (popper `tooltipInteractive` à moda do MUI).
            // Tooltip informativo não deve nunca roubar ponteiro.
            disableInteractive
          >
            {button}
          </Tooltip>
        ) : (
          button
        );
      })}
    </ToggleButtonGroup>
  );
}
