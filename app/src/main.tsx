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
 * TEMA (onda 7 → onda 11): <AppGate/> e toda a UI abaixo ficam dentro do
 * <ThemeProvider> + <CssBaseline> (único lugar onde o fundo do colorSchemes é
 * aplicado no body). A onda 11 troca o dark-only fixo por CLARO+ESCURO:
 *   - `defaultMode="system"` → o modo default segue `prefers-color-scheme`
 *     (e o nativeTheme do Electron, que espelha o SO no Chromium);
 *   - `modeStorageKey="theme-mode"` → a escolha manual persiste em
 *     `localStorage['theme-mode']` (o MUI lê no boot e grava no setMode;
 *     ver src/theme.ts e o ThemeToggleButton). Default = system (não-guardado).
 *   - `colorSchemeSelector: 'class'` no tema habilita o toggle manual.
 *
 * PRIMEIRO PAINT SEM FLASH: com `cssVariables: true` + `modeStorageKey`, o MUI
 * resolve o scheme SÍNCRONO no inicializador do useState do useColorScheme
 * (lê `localStorage['theme-mode']`; se ausente segue o matchMedia do SO) e
 * aplica a classe `.light`/`.dark` no <html> antes do primeiro paint. Como
 * garantia adicional (task: "inicie com o valor do SO antes do primeiro render
 * se necessário"), `primeColorSchemeClass()` roda no bootstrap, ANTES do
 * createRoot().render(), aplicando a classe correta no <html> — assim mesmo em
 * timing de borda o primeiro frame já traz o scheme certo. Não usamos
 * `InitColorSchemeScript`: ele é anti-flicker só no SSR e seria bloqueado pelo
 * CSP `script-src 'self'` (inline script) desta app.
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

/** Chave do localStorage que guarda a escolha manual de tema (ver toggle). */
export const THEME_MODE_STORAGE_KEY = 'theme-mode';

const VALID_MODES = ['light', 'dark', 'system'] as const;
type ThemeMode = (typeof VALID_MODES)[number];

function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && (VALID_MODES as readonly string[]).includes(value);
}

/** Resolve o tema efetivo (light/dark) a partir do localStorage (se válido) ou do SO. */
export function resolveEffectiveScheme(): 'light' | 'dark' {
  let mode: string | null = null;
  try {
    mode = typeof localStorage !== 'undefined' ? localStorage.getItem(THEME_MODE_STORAGE_KEY) : null;
  } catch {
    mode = null; // localStorage indisponível/quota — segue o SO.
  }
  if (isThemeMode(mode)) {
    if (mode === 'system' || mode === 'light' || mode === 'dark') {
      const systemDark =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (mode === 'dark') return 'dark';
      if (mode === 'light') return 'light';
      return systemDark ? 'dark' : 'light';
    }
  }
  // Sem escolha salva → segue o SO (defaultMode="system" já cobre; aqui só
  // garantimos a classe no <html> antes do primeiro render).
  const systemDark =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  return systemDark ? 'dark' : 'light';
}

/**
 * Aplica a classe de scheme (`dark`/`light`) no <html> antes do primeiro render.
 * Casa com o `colorSchemeSelector: 'class'` do tema (classes `.dark`/`.light`).
 * Idempotente e seguro em SSR/testes (sem jsdom): no-op sem document.
 */
export function primeColorSchemeClass(): void {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  if (!html) return;
  const scheme = resolveEffectiveScheme();
  html.classList.remove('dark', 'light');
  html.classList.add(scheme);
}

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

  // Anti-flash defensivo: aplica a classe de scheme no <html> ANTES do render.
  primeColorSchemeClass();

  await initI18nSafe();

  createRoot(rootElement).render(
    <StrictMode>
      <ThemeProvider theme={theme} defaultMode="system" modeStorageKey={THEME_MODE_STORAGE_KEY}>
        <CssBaseline />
        <AppGate />
      </ThemeProvider>
    </StrictMode>,
  );
}

void bootstrap();