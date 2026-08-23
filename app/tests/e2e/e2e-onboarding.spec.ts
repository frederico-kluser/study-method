/**
 * e2e-onboarding.spec.ts — tutorial rápido de primeira execução (onda 13).
 *
 * Com o gate 'ready' e userData FRESCO (a fixture usa tmp isolado), o
 * OnboardingHost monta e o `useFirstRunTutorialPrompt` abre o
 * TutorialSelectionModal UMA vez. Esta spec valida:
 *   - o modal aparece na primeira abertura pós-gate (isReady);
 *   - iniciar o tutorial → o overlay abre com o step focado no alvo
 *     (data-onboarding-target presente no DOM — app-title/nav-tabs/etc);
 *   - navegar próximo e pular (com confirmação) → overlay fecha e o estado
 *     persiste (offered + skipped);
 *   - após reload, o modal NÃO reaparece (persistência one-shot).
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, closeApp } from './helpers';

let app: ElectronApplication | undefined;
let page: Page;

test.afterEach(async () => {
  if (app) await closeApp(app);
});

test('e2e-onboarding: modal de 1ª execução → overlay no alvo → concluir/skip → não reaparece', async () => {
  // E2E_ONBOARDING='1' deixa a oferta de primeira execução disparar (por padrão
  // a fixture pré-marca a oferta como mostrada para não bloquear as outras specs).
  const launched = await launchApp({ env: { E2E_GATE: 'ready', E2E_ONBOARDING: '1' } });
  app = launched.app;
  page = launched.page;

  // App destravado e o modal de tutorial aparece (primeira execução).
  await expect(page.getByRole('heading', { name: 'Quer um tour?' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Tour rápido/ })).toBeVisible();

  // Inicia o tutorial: fecha o modal e abre o overlay com o 1º step no alvo.
  await page.getByRole('button', { name: /Tour rápido/ }).click();
  const overlay = page.locator('[data-onboarding-panel]');
  await expect(overlay).toBeVisible();
  await expect(page.getByRole('heading', { name: 'O Study Method' })).toBeVisible();

  // O alvo do primeiro step está no DOM (app-title) e o overlay o cobre.
  await expect(page.locator('[data-onboarding-target="app-title"]')).toBeVisible();
  await expect(page.getByText('Passo 1 / 10', { exact: false })).toBeVisible();

  // Avança um step: o próximo alvo (theme-toggle) também está presente.
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('[data-onboarding-target="theme-toggle"]')).toBeVisible();
  await expect(page.getByText('Passo 2 / 10', { exact: false })).toBeVisible();

  // Skip com confirmação encerra o tutorial.
  await page.getByRole('button', { name: 'Pular', exact: true }).click();
  await page.getByRole('button', { name: 'Sim, pular' }).click();
  await expect(overlay).toHaveCount(0);

  // Persistência: oferta one-shot e status 'skipped' gravados no localStorage.
  expect(await page.evaluate(() => localStorage.getItem('study-method-onboarding-offered-v1'))).toBe('true');
  expect(await page.evaluate(() => localStorage.getItem('study-method-onboarding-v1'))).toContain('"skipped"');

  // Reload: o app re-monta, mas o modal/overlay NÃO reaparece (já oferecido/pulado).
  await page.reload();
  await expect(page.getByRole('banner').getByText('Study Method — Tutor', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Quer um tour?' })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});