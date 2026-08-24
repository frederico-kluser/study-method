/**
 * e2e-offline.spec.ts — modo OFFLINE via stub (ambas as chaves falham por rede).
 *
 * Com chaves configuradas + E2E_NETWORK=offline, o gate reporta phase 'offline':
 * o app inicia com banner de aviso e as features locais (LLM local mockado)
 * ficam acessíveis. Assert do aviso + navegação disponível.
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, closeApp } from './helpers';

let app: ElectronApplication | undefined;
let page: Page;

test.afterEach(async () => {
  if (app) await closeApp(app);
});

test('e2e-offline: chaves ok + rede fora → banner offline e app acessível', async () => {
  const launched = await launchApp({
    env: { E2E_GATE: 'ready', E2E_NETWORK: 'offline' },
  });
  app = launched.app;
  page = launched.page;

  // Banner de aviso de offline no topo.
  await expect(page.getByText('Sem conexão com a internet.')).toBeVisible();

  // O app ainda montou (não fica preso no setup) e a navegação existe.
  await expect(page.getByRole('banner').getByText('Study Method — Tutor', { exact: false })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Aula' })).toBeVisible();

  // Aba Settings alcançável (LLM local — mock — segue utilizável).
  await page.getByRole('tab', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'LLM local' })).toBeVisible();
});