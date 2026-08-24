/**
 * e2e-test-answer.spec.ts — "Testar resposta" com runner mockado.
 *
 * No desafio aberto, clicar em "Testar resposta" dispara a fase determinística
 * (study:test-answer → stub com TESTS_RUN determinístico, evento started/done)
 * e depois a fase pi (pi:execute → stub streaming + score fixo). Assert:
 *  - a fase 'executando' é refletida (chip "rodando…");
 *  - o resultado final aparece com score determinístico (pi <pre>);
 *  - o feedback usa o provider DeepSeek (stub, sem rede).
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, closeApp, makeWorkspaceRoot } from './helpers';

let app: ElectronApplication | undefined;
let page: Page;
let wsRoot: string | undefined;

test.beforeEach(() => {
  wsRoot = makeWorkspaceRoot();
});

test.afterEach(async () => {
  if (app) await closeApp(app);
});

test('e2e-test-answer: executando → sucesso com score determinístico', async () => {
  const launched = await launchApp({
    env: { E2E_GATE: 'ready', E2E_WORKSPACE_ROOT: wsRoot! },
  });
  app = launched.app;
  page = launched.page;

  await expect(page.getByRole('banner').getByText('Study Method — Tutor', { exact: false })).toBeVisible();
  await page.getByRole('tab', { name: 'Aula' }).click();
  await page.getByLabel('Assunto').fill('Ordenação');
  await page.getByRole('button', { name: 'Gerar aula' }).click();
  await page.getByText('Ordenação (E2E)', { exact: false }).first().click();

  // Desafio carregado e botão "Testar resposta" pronto.
  await expect(page.getByRole('button', { name: 'Testar resposta' })).toBeVisible();
  await page.getByRole('button', { name: 'Testar resposta' }).click();

  // Fase 'executando' → chip "rodando…" reflete (determinístico stub).
  await expect(page.getByText('rodando…', { exact: false }).first()).toBeVisible({ timeout: 15_000 });

  // Resultado com score determinístico do stub pi.
  await expect(
    page.locator('pre').filter({ hasText: 'score: 87/100' }).first(),
  ).toBeVisible({ timeout: 20_000 });

  // Provider de feedback: DeepSeek (stub resolved via flag default), sem rede.
  await expect(page.getByText('DeepSeek', { exact: false })).toBeVisible();

  // Nada mais "rodando" ao final.
  await expect(page.getByText('rodando…', { exact: false })).toHaveCount(0);
});