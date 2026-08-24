/**
 * src/components/theme/ThemeToggleButton.tsx — botão de troca de tema (onda 11).
 *
 * IconButton na AppBar que cicla o modo do tema: light → dark → system → light…
 * Usa `useColorScheme()` do MUI (`mode`, `setMode`) com o `colorSchemeSelector:
 * 'class'` configurado no tema (o `setMode` não teria efeito com o default
 * 'media'). A PERSISTÊNCIA fica a cargo do ThemeProvider via
 * `modeStorageKey="theme-mode"`: o MUI LÊ o valor salvo no boot (montagem) e
 * GRAVA no `setMode` — o botão só chama `setMode(next)`. Default = 'system'
 * (sem valor salvo → segue o SO).
 *
 * Tooltip/aria-label vêm de `t('translation:theme.mode.<mode>')` (i18n
 * strictKeyChecks; chaves em src/i18n/locales/{pt-BR,en}/translation.json).
 *
 * Nota do MUI: `mode` é `undefined` no primeiro render (o provider marca a
 * etapa de hidratação). Tratamos com fallback para `system` para não piscar
 * uma decisão errada antes da montagem completa.
 */
import { type ReactElement } from 'react';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { useColorScheme } from '@mui/material/styles';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import SettingsBrightnessIcon from '@mui/icons-material/SettingsBrightness';
import { useTranslation } from 'react-i18next';
import {
  nextThemeMode,
  THEME_MODE_I18N_KEY,
  type ThemeMode,
} from './themeModeState';

const MODE_ICON: Record<ThemeMode, ReactElement> = {
  light: <LightModeIcon />,
  dark: <DarkModeIcon />,
  system: <SettingsBrightnessIcon />,
};

export default function ThemeToggleButton(): ReactElement {
  const { t } = useTranslation();
  const { mode, setMode } = useColorScheme();

  // `mode` é undefined no primeiro render (hidratação MUI) — caímos em 'system'.
  const current: ThemeMode = mode ?? 'system';

  const label = t(THEME_MODE_I18N_KEY[current]);
  const toggleLabel = t('translation:theme.mode.toggle');

  return (
    <Tooltip title={`${toggleLabel}: ${label}`}>
      <IconButton
        size="small"
        color="inherit"
        aria-label={`${toggleLabel}: ${label}`}
        onClick={() => setMode(nextThemeMode(current))}
        sx={{ border: 1, borderColor: 'divider' }}
      >
        {MODE_ICON[current]}
      </IconButton>
    </Tooltip>
  );
}