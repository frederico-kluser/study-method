/**
 * .storybook/preview.tsx — provedores globais de cada história.
 *
 * A regra deste preview é FIDELIDADE: o que envolve a árvore de uma história é
 * o MESMO envolvente do app real (src/main.tsx) — `ThemeProvider` +
 * `CssBaseline` com o tema de src/theme.ts, as fontes de src/fonts.ts, o CSS de
 * bootstrap de src/index.css, o KaTeX, o i18n de src/i18n e uma API falsa no
 * slot de `getApi()`. Sem isto, uma história bonita mente sobre o produto.
 *
 * ─── TEMA: A MESMA MECÂNICA DO APP ────────────────────────────────────────
 * O tema corre com `cssVariables: { colorSchemeSelector: 'class' }`, ou seja,
 * as variáveis MUI vivem em `:root/.light` e `.dark` e a classe é aplicada ao
 * `<html>`. O app aplica-a em `primeColorSchemeClass()` (src/main.tsx) antes do
 * primeiro render; aqui o `SchemeSync` faz o mesmo papel por baixo do
 * `ThemeProvider`: o toolbar global `themeMode` (light/dark/system) chama
 * `useColorScheme().setMode(...)`, que é o MESMO caminho do ThemeModeSelector
 * do app (persistindo em localStorage['theme-mode'], como no produto).
 *
 * ─── API FALSA SEMPRE INSTALADA ────────────────────────────────────────────
 * Um loader instala o mock de src/storybook/mockApi.ts ANTES de cada história,
 * para que qualquer componente que chame `getApi()` renderize sem Electron.
 * Uma história pode sobrescrever dados concretos com `installMockApi({...})`
 * no seu próprio `beforeEach`/`loaders` — o contrato está no HANDBOOK.
 *
 * ─── MOVIMENTO ─────────────────────────────────────────────────────────────
 * O design system tem um contrato de movimento (src/lib/animationTokens.ts) e
 * o Storybook respeita `prefers-reduced-motion` tal como o app. Para capturas
 * determinísticas, o toolbar `motion` força `data-motion="off"` numa folha de
 * estilo de utilidade que neutraliza animações/transições dentro da história.
 */
import { useEffect, type ReactElement } from 'react';
import type { Decorator, Preview } from '@storybook/react';
import { ThemeProvider, useColorScheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { theme } from '../src/theme';
import { initI18n } from '../src/i18n';
import { installMockApi, resetMockApi } from '../src/storybook/mockApi';
import '../src/fonts';
import '../src/index.css';
import 'katex/dist/katex.min.css';
import './motion.css';

/** Espelha THEME_MODE_STORAGE_KEY de src/main.tsx (mesma persistência do app). */
const THEME_MODE_STORAGE_KEY = 'theme-mode';

type ThemeMode = 'light' | 'dark' | 'system';

/** Sincroniza o toolbar global com o `useColorScheme` do MUI (caminho do app). */
function SchemeSync({ mode }: { mode: ThemeMode }): ReactElement | null {
  const { mode: current, setMode } = useColorScheme();
  useEffect(() => {
    if (current !== mode) setMode(mode);
  }, [current, mode, setMode]);
  return null;
}

/** Aplica `data-motion` quando o utilizador força movimento ligado/desligado. */
function MotionSync({ motion }: { motion: 'system' | 'on' | 'off' }): null {
  useEffect(() => {
    const root = document.documentElement;
    root.removeAttribute('data-motion');
    if (motion !== 'system') root.setAttribute('data-motion', motion);
  }, [motion]);
  return null;
}

const withAppProviders: Decorator = (Story, context) => {
  const mode = (context.globals.themeMode ?? 'system') as ThemeMode;
  const motion = (context.globals.motion ?? 'system') as 'system' | 'on' | 'off';
  return (
    <ThemeProvider theme={theme} defaultMode="system" modeStorageKey={THEME_MODE_STORAGE_KEY}>
      <CssBaseline />
      <SchemeSync mode={mode} />
      <MotionSync motion={motion} />
      <Story />
    </ThemeProvider>
  );
};

const preview: Preview = {
  decorators: [withAppProviders],
  globalTypes: {
    themeMode: {
      description: 'Modo de tema (a mesma mecânica do app: classe .light/.dark no <html>)',
      defaultValue: 'system',
      toolbar: {
        title: 'Tema',
        icon: 'mirror',
        items: [
          { value: 'system', title: 'Sistema' },
          { value: 'light', title: 'Claro' },
          { value: 'dark', title: 'Escuro' },
        ],
        dynamicTitle: true,
      },
    },
    motion: {
      description: 'Força movimento ligado/desligado (para capturas determinísticas)',
      defaultValue: 'system',
      toolbar: {
        title: 'Movimento',
        icon: 'play',
        items: [
          { value: 'system', title: 'Sistema' },
          { value: 'on', title: 'Ligado' },
          { value: 'off', title: 'Desligado' },
        ],
      },
    },
  },
  parameters: {
    layout: 'centered',
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    options: {
      storySort: {
        order: [
          'Fundamentos',
          'Componentes',
          'Padrões',
          'Vistas',
          'Funcionalidades',
        ],
      },
    },
  },
  // Toda a história herda docs autogerados; as de referência (Fundamentos)
  // definem `docs: { page: ... }` própria.
  tags: ['autodocs'],
  loaders: [
    async () => {
      await initI18n('pt-BR');
      return {};
    },
  ],
  beforeEach: () => {
    // Cada história recomeça com uma API falsa limpa (mock global).
    installMockApi();
    return () => {
      resetMockApi();
    };
  },
};

export default preview;