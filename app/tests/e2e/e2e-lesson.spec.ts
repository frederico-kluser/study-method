/**
 * e2e-lesson.spec.ts — fluxo assunto → aula (research/author materializados).
 *
 * Com o gate 'ready', vai para a aba Aula, digita o assunto, gera a aula e
 * aguarda: Stepper de fases + conteúdo markdown + lista de desafios.
 * No modo E2E o orchestrator/author são stub (sem LLM/rede).
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

test('e2e-lesson: assunto → aula com Stepper + fases + markdown + desafios', async () => {
  const launched = await launchApp({
    env: { E2E_GATE: 'ready', E2E_WORKSPACE_ROOT: wsRoot! },
  });
  app = launched.app;
  page = launched.page;

  // App pronto: navega para a aba "Aula".
  await expect(page.getByRole('banner').getByText('Study Method — Tutor', { exact: false })).toBeVisible();
  await page.getByRole('tab', { name: 'Aula' }).click();

  // Digita o assunto e gera.
  await page.getByLabel('Assunto').fill('Ordenação');
  await page.getByRole('button', { name: 'Gerar aula' }).click();

  // Aguarda o Stepper de fases renderizar (a geração emite events + resolve).
  await expect(page.getByText('Pesquisando', { exact: true })).toBeVisible();
  await expect(page.getByText('Concluído', { exact: true })).toBeVisible();

  // Conteúdo da aula: título (markdown) + heading dos desafios.
  await expect(page.getByText('Aula E2E sobre Ordenação', { exact: false })).toBeVisible();
  await expect(page.getByText('Imagine uma fila ordenada.', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Desafios' })).toBeVisible();

  // fix17c ACHADO-6: a aula contém fórmula $...$ → KaTeX renderiza .katex live.
  await expect(page.locator('.katex').first()).toBeVisible({ timeout: 10000 });

  // Lista de desafios: o card mockado está presente.
  await expect(page.getByText('Ordenação (E2E)', { exact: false })).toBeVisible();
});