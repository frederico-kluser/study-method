/**
 * src/main.tsx — ponto de entrada do renderer React.
 *
 * A raiz monta o <AppGate> (onda 6 — gate de início), que envolve o <App/>:
 * valida as chaves DeepSeek/Brave no main antes de liberar a UI (setup
 * obrigatório quando faltam/invalidam; offline com aviso quando ambas falham
 * por rede). AppGate renderiza <App/> internamente nas fases liberadas.
 *
 * I18N (onda 6): `initI18n()` é chamado ANTES da primeira renderização para
 * ativar o i18n global (react-i18next usa a instância default). Se falhar,
 * não quebramos o app — o i18n tem `fallbackLng: 'pt-BR'` internamente e os
 * textos caem no fallback hardcoded (o gate usa tSafe); apenas logamos um
 * console.warn.
 *
 * TEMA (onda 7 — MUI v9): o <AppGate/> e toda a UI abaixo ficam dentro do
 * <ThemeProvider> + <CssBaseline> (único lugar onde o fundo escuro do
 * colorSchemes é aplicado no body). `defaultMode="dark"` força o esquema dark
 * (o app é dark-only; não há toggle). O InitColorSchemeScript não é necessário
 * no SPA/Vite (é para anti-flicker SSR).
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { AppGate } from './gate/AppGate';
import { initI18n } from './i18n';
import { theme } from './theme';
import './index.css';

const rootElement = document.getElementById('root');

/** Inicializa o i18n antes da primeira renderização (try/catch + warn). */
async function initI18nSafe(): Promise<void> {
  try {
    await initI18n();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[i18n] falha ao inicializar; seguindo com fallback pt-BR.', err);
  }
}

async function bootstrap(): Promise<void> {
  if (!rootElement) {
    throw new Error('root #root não encontrado');
  }

  await initI18nSafe();

  createRoot(rootElement).render(
    <StrictMode>
      <ThemeProvider theme={theme} defaultMode="dark">
        <CssBaseline />
        <AppGate />
      </ThemeProvider>
    </StrictMode>,
  );
}

void bootstrap();