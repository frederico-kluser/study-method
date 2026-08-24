/**
 * e2e-theme.spec.ts — toggle de tema claro/escuro na AppBar (onda 11/13).
 *
 * O ThemeToggleButton na AppBar cicla light → dark → system (via
 * useColorScheme do MUI com colorSchemeSelector:'class'). Esta spec valida:
 *   - a classe `.light`/`.dark` no <html> muda a cada clique (useColorScheme +
 *     colorSchemeSelector class — ver src/theme.ts);
 *   - o `localStorage['theme-mode']` é gravado (modeStorageKey do ThemeProvider);
 *   - no fim do ciclo volta a `system` (e o scheme efetivo segue o SO).
 * Tudo determinístico em modo stub (E2E_GATE='ready', janela oculta).
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, closeApp } from './helpers';

let app: ElectronApplication | undefined;
let page: Page;

test.afterEach(async () => {
  if (app) await closeApp(app);
});

test('e2e-theme: toggle → classe .light/.dark no <html> + localStorage theme-mode; ciclo volta a system', async () => {
  const launched = await launchApp({ env: { E2E_GATE: 'ready' } });
  app = launched.app;
  page = launched.page;

  // App montou: AppBar com o título e o botão de tema.
  await expect(page.getByRole('banner').getByText('Study Method — Tutor', { exact: false })).toBeVisible();
  const toggle = page.getByRole('button', { name: 'Tema:' });
  await expect(toggle).toBeVisible();

  const html = page.locator('html');
  const storedMode = async (): Promise<string | null> =>
    await page.evaluate(() => localStorage.getItem('theme-mode'));

  // Default = 'system' (sem valor salvo) → <html> tem exatamente um de light/dark,
  // e nada persistido no localStorage ainda.
  await expect(html).toHaveClass(/light|dark/);
  expect(await storedMode()).toBeNull();

  // 1º clique: system → light → .light no <html> e 'light' no localStorage.
  // Onda 20B: LIGHT INTACTO — o header continua primary azul (#1565c0 →
  // rgb(21,101,192)) e o body usa o background.default claro do MUI (branco).
  await toggle.click();
  await expect(html).toHaveClass(/light/);
  expect(await storedMode()).toBe('light');
  await expect(page.getByRole('banner')).toHaveCSS('background-color', 'rgb(21, 101, 192)');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');

  // 2º clique: light → dark → .dark. Onda 20B (dark Dracula): o header NÃO é
  // mais primary (nada de azul/roxo) — vira superfície Dracula
  // (background.paper #2f3142 → rgb(47,49,66) + borda divider #44475a →
  // rgb(68,71,90)); o body usa o fundo Dracula canônico background.default
  // #282a36 (rgb(40,42,54)).
  await toggle.click();
  await expect(html).toHaveClass(/dark/);
  expect(await storedMode()).toBe('dark');
  const banner = page.getByRole('banner');
  await expect(banner).toHaveCSS('background-color', 'rgb(47, 49, 66)');
  await expect(banner).toHaveCSS('border-bottom-color', 'rgb(68, 71, 90)');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(40, 42, 54)');

  // 3º clique: dark → system → volta a ter exatamente um de light/dark (segue o SO).
  await toggle.click();
  await expect(html).toHaveClass(/light|dark/);
  expect(await storedMode()).toBe('system');
});