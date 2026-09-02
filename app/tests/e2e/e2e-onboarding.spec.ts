/**
 * e2e-onboarding.spec.ts — tutorial de primeira execução (onda 16: Quick Start vs Completo).
 *
 * Com o gate 'ready' e userData FRESCO (a fixture usa tmp isolado), o
 * OnboardingHost monta e o `useFirstRunTutorialPrompt` abre o
 * TutorialSelectionModal UMA vez. Esta spec valida:
 *   - o modal de seleção aparece com as DUAS opções (Quick Start / Completo);
 *   - iniciar o Tutorial Completo → o overlay abre com o step focado no alvo
 *     (data-onboarding-target presente no DOM — app-title/nav-tabs/etc);
 *   - navegar próximo (Continuar) e pular (com confirmação) → overlay fecha e o
 *     estado persiste (offered + skipped);
 *   - após reload, o modal NÃO reaparece (persistência one-shot).
 *
 * No E2E com gate 'ready' as chaves OpenRouter+Brave vêm válidas do stub, então o
 * Tutorial Completo (gateado por hasKeys) fica HABILITADO.
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, closeApp } from './helpers';

let app: ElectronApplication | undefined;
let page: Page;

test.afterEach(async () => {
  if (app) await closeApp(app);
});

test('e2e-onboarding: modal com 2 opções → overlay no alvo → concluir/skip → não reaparece', async () => {
  // E2E_ONBOARDING='1' deixa a oferta de primeira execução disparar (por padrão
  // a fixture pré-marca a oferta como mostrada para não bloquear as outras specs).
  const launched = await launchApp({ env: { E2E_GATE: 'ready', E2E_ONBOARDING: '1' } });
  app = launched.app;
  page = launched.page;

  // App destravado e o modal de tutorial aparece (primeira execução), com as duas opções.
  await expect(page.getByRole('heading', { name: 'Quer um tour?' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Quick Start/ })).toBeVisible();
  const fullButton = page.getByRole('button', { name: /Tutorial Completo/ });
  await expect(fullButton).toBeVisible();
  await expect(fullButton).toBeEnabled(); // chaves válidas no stub → Completo habilitado

  // Inicia o Tutorial Completo: fecha o modal e abre o overlay com o 1º step no alvo.
  await fullButton.click();
  const overlay = page.locator('[data-onboarding-panel]');
  await expect(overlay).toBeVisible();
  await expect(page.getByRole('heading', { name: 'O Study Method' })).toBeVisible();

  // O alvo do primeiro step está no DOM (app-title) e o overlay o cobre.
  await expect(page.locator('[data-onboarding-target="app-title"]')).toBeVisible();
  await expect(page.getByText('Passo 1 / 11', { exact: false })).toBeVisible();

  // Avança um step (informativos avançam por "Continuar"): o próximo alvo
  // (theme-toggle) também está presente.
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('[data-onboarding-target="theme-toggle"]')).toBeVisible();
  await expect(page.getByText('Passo 2 / 11', { exact: false })).toBeVisible();

  // Skip com confirmação encerra o tutorial.
  await page.getByRole('button', { name: 'Pular tutorial', exact: true }).click();
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

test('e2e-onboarding: Quick Start atinge qs-challenge-test-answer sem desafio ativo → NÃO trava (fallback Continuar)', async () => {
  // userData fresco, sem nenhum desafio selecionado. Após navegar o Quick Start
  // até a aba Desafio, o alvo `challenge-test-answer` NÃO existe (só monta com
  // desafio ativo). O ACHADO-1 garante: em vez de travar (sem Continuar), o
  // step mostra o fallback de "Continuar".
  const launched = await launchApp({ env: { E2E_GATE: 'ready', E2E_ONBOARDING: '1' } });
  app = launched.app;
  page = launched.page;

  await expect(page.getByRole('heading', { name: 'Quer um tour?' })).toBeVisible();
  await page.getByRole('button', { name: /Quick Start/ }).click();

  const overlay = page.locator('[data-onboarding-panel]');
  await expect(overlay).toBeVisible();
  // Passo 1-2 informativos avançam por "Continuar".
  await expect(page.getByText('Passo 1 / 6', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByText('Passo 2 / 6', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Passo 3 (`qs-open-lesson`): precisa navegar para a aba Aula (alvo nav-tabs).
  await expect(page.getByText('Passo 3 / 6', { exact: false })).toBeVisible();
  await page.getByRole('tab', { name: 'Aula' }).click();
  // Auto-avança após satisfeito (~220ms) → passo 4 (`qs-open-challenge`).
  await expect(page.getByText('Passo 4 / 6', { exact: false })).toBeVisible();
  await page.getByRole('tab', { name: 'Desafio' }).click();

  // Passo 5 (`qs-challenge-test-answer`) em userData sem desafio: alvo ausente.
  // O passo mostra o fallback de "Continuar" (não trava por falta do botão).
  await expect(page.getByText('Passo 5 / 6', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continuar' })).toBeVisible();

  // Continua e chega ao passo final sem dead-lock.
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByText('Passo 6 / 6', { exact: false })).toBeVisible();
});