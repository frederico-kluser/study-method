/**
 * e2e-i18n.spec.ts — idioma padrão pt-BR e troca via LanguageSwitcher.
 *
 * Default: pt-BR. Ao trocar para English pelo switcher, a UI reflete na hora e o
 * localStorage ('app-language') persiste. (Testes não usam t(); verifica-se o
 * texto real da UI.)
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, closeApp } from './helpers';

let app: ElectronApplication | undefined;
let page: Page;

test.afterEach(async () => {
  if (app) await closeApp(app);
});

test('e2e-i18n: default pt-BR; trocar para en reflete e grava localStorage', async () => {
  const launched = await launchApp({ env: { E2E_GATE: 'ready' } });
  app = launched.app;
  page = launched.page;

  // Default pt-BR: aba "Aula" visível.
  await expect(page.getByRole('tab', { name: 'Aula' })).toBeVisible();
  await expect(page.getByRole('banner').getByText('Study Method — Tutor', { exact: false })).toBeVisible();

  // Abre o switcher de idioma (AppBar) e escolhe English.
  await page.getByLabel('Select language').click();
  await page.getByRole('menuitem', { name: /English/ }).click();

  // UI reflete imediatamente: aba vira "Lesson".
  await expect(page.getByRole('tab', { name: 'Lesson' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Aula' })).toHaveCount(0);

  // localStorage persistiu.
  expect(await page.evaluate(() => localStorage.getItem('app-language'))).toBe('en');
});