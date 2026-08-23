/**
 * src/App.tsx — shell do Study Method em Material UI v9.
 *
 * Onda 7 (MUI shell): subistitui o shell CSS-custom por AppBar + Tabs do MUI.
 * Navegação por estado (useState — SEM router), fiel ao comportamento antigo:
 *
 *   - AppBar (static) com o título `app.title` e o `<LanguageSwitcher/>` à
 *     direita (i18n da onda 6).
 *   - `<Tabs>` com 4 abas (Início/Settings/Aula/Desafio), rótulos via i18n
 *     `nav.*`, conectadas aos painéis por `id`/`aria-controls` (a11y).
 *   - O conteúdo ativo é renderizado abaixo das abas num `main` com
 *     `overflow: auto` e padding responsivo.
 *
 * Mantém o registry `views/index.ts` (HomeView/SettingsView/LessonView/
 * ChallengeView) e o `ChallengeNavProvider` (Aula↔Desafio compartilham o
 * desafio selecionado — a LessonView navega para o shell via
 * `onNavigateChallenge`).
 *
 * A11y: cada Tab tem `aria-label`/label e o painel ativo é referenciado por
 * `role="tabpanel"` + `aria-labelledby` da aba correspondente.
 */
import { useState, type ComponentType, type ReactElement } from 'react';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import { useTranslation } from 'react-i18next';
import {
  HomeView,
  SettingsView,
  LessonView,
  ChallengeView,
  type ViewProps,
} from './views';
import { ChallengeNavProvider } from './components/challengeNav/ChallengeNavProvider';
import ThemeToggleButton from './components/theme/ThemeToggleButton';
import LanguageSwitcher from './i18n/LanguageSwitcher';
import { NAV_ITEMS, navIndexOf, type NavKey } from './lib/shellNav';
import { OnboardingHost } from './features/onboarding/OnboardingHost';
import { useStartup } from './gate/AppGate';

const VIEWS: Record<NavKey, ComponentType<ViewProps>> = {
  home: HomeView,
  settings: SettingsView,
  lesson: LessonView,
  challenge: ChallengeView,
};

function Shell({
  active,
  setActive,
}: {
  active: NavKey;
  setActive: (k: NavKey) => void;
}): ReactElement {
  const { t } = useTranslation();
  const activeIndex = navIndexOf(active);
  const View = VIEWS[active];
  const panelId = `sm-panel-${active}`;
  const tabId = (key: NavKey) => `sm-tab-${key}`;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <AppBar position="static" color="primary" enableColorOnDark>
        <Toolbar sx={{ gap: 1 }}>
          <Typography
            variant="h6"
            noWrap
            component="div"
            data-onboarding-target="app-title"
            sx={{ flexGrow: 1, minWidth: 0, fontWeight: 600 }}
          >
            {t('translation:app.title')}
          </Typography>
          <Box data-onboarding-target="theme-toggle" component="span" sx={{ display: 'contents' }}>
            <ThemeToggleButton />
          </Box>
          <Box data-onboarding-target="language-switcher" component="span" sx={{ display: 'contents' }}>
            <LanguageSwitcher variant="menu" />
          </Box>
        </Toolbar>
      </AppBar>

      <Tabs
        value={activeIndex}
        onChange={(_e, next: number | false) => {
          const item = typeof next === 'number' ? NAV_ITEMS[next] : undefined;
          if (item) setActive(item.key);
        }}
        variant="scrollable"
        scrollButtons="auto"
        data-onboarding-target="nav-tabs"
        aria-label={t('translation:app.shellNav')}
        sx={{
          px: { xs: 1, sm: 2 },
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        {NAV_ITEMS.map((item, i) => (
          <Tab
            key={item.key}
            id={tabId(item.key)}
            aria-controls={item.key === NAV_ITEMS[activeIndex].key ? panelId : undefined}
            label={t(item.i18nKey)}
            value={i}
          />
        ))}
      </Tabs>

      <Box
        component="main"
        role="tabpanel"
        id={panelId}
        aria-labelledby={tabId(active)}
        sx={{
          flexGrow: 1,
          minWidth: 0,
          overflow: 'auto',
          p: { xs: 2, sm: 3, md: 4 },
        }}
      >
        <View />
      </Box>
    </Box>
  );
}

export default function App(): ReactElement {
  const [active, setActive] = useState<NavKey>('home');
  // O App roda DENTRO do StartupCtx.Provider (ver AppGate). Só liberamos o
  // onboarding quando o gate está 'ready' (app destravado, não 'offline').
  const startup = useStartup();
  const isReady = startup.status?.phase === 'ready';
  return (
    <ChallengeNavProvider onNavigateChallenge={() => setActive('challenge')}>
      <Shell active={active} setActive={setActive} />
      <OnboardingHost isReady={isReady} activeView={active} onNavigateView={setActive} />
    </ChallengeNavProvider>
  );
}