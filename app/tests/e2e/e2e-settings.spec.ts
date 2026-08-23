/**
 * e2e-settings.spec.ts — desbloqueio via Setup (preencher chaves → app destrava).
 *
 * No gate bloqueado (sem chaves) o SetupView exige as DUAS chaves, validadas
 * sem rede (stub), para liberar. Configuradas e válidas → AppGate re-executa o
 * gate (keys:startup-status) → phase 'ready' → entra no App.
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, closeApp } from './helpers';

let app: ElectronApplication | undefined;
let page: Page;

test.afterEach(async () => {
  if (app) await closeApp(app);
});

test('e2e-settings: preencher DeepSeek+Brave no Setup destrava o app', async () => {
  const launched = await launchApp({}); // sem chaves → SetupView
  app = launched.app;
  page = launched.page;

  await expect(page.getByRole('heading', { name: 'Antes de começar' })).toBeVisible();

  // Preenche e valida a chave DeepSeek.
  const ds = page.getByLabel('Chave DeepSeek');
  await ds.fill('sk-test-e2e-deepseek');
  await page.getByRole('button', { name: 'Validar' }).nth(0).click();
  await expect(page.getByText('Válida', { exact: true })).toBeVisible();

  // Preenche e valida a chave Brave.
  const brave = page.getByLabel('Chave Brave Search');
  await brave.fill('bs-test-e2e-brave');
  await page.getByRole('button', { name: 'Validar' }).nth(1).click();
  await expect(page.getByText('Válida', { exact: true })).toHaveCount(2);

  // Salvar (habilita quando ambas válidas) → onDone reexecuta o gate → ready.
  await page.getByRole('button', { name: 'Salvar' }).click();

  // App montou: AppBar + tab de navegação.
  await expect(page.getByRole('banner').getByText('Study Method — Tutor', { exact: false })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Aula' })).toBeVisible();
});