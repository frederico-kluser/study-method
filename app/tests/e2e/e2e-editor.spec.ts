/**
 * e2e-editor.spec.ts — editor de código (CodeMirror sem autocomplete) + IPC save.
 *
 * Fluxo: gate ready → gera aula → abre o desafio → abre solution.py no editor →
 * digita um marcador → clica Salvar → verifica em DISCO (o workspace é FS real)
 * que o conteúdo persistiu. O save usa o canal study:write-workspace-file real
 * do main (mesma contenção/física de produção).
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, closeApp, makeWorkspaceRoot, findFilesContaining } from './helpers';

let app: ElectronApplication | undefined;
let page: Page;
let wsRoot: string | undefined;

test.beforeEach(() => {
  wsRoot = makeWorkspaceRoot();
});

test.afterEach(async () => {
  if (app) await closeApp(app);
});

test('e2e-editor: abre arquivo, edita e salva por IPC (persistência em disco)', async () => {
  const launched = await launchApp({
    env: { E2E_GATE: 'ready', E2E_WORKSPACE_ROOT: wsRoot! },
  });
  app = launched.app;
  page = launched.page;

  await expect(page.getByRole('banner').getByText('Study Method — Tutor', { exact: false })).toBeVisible();
  await page.getByRole('tab', { name: 'Aula' }).click();
  await page.getByLabel('Assunto').fill('Ordenação');
  await page.getByRole('button', { name: 'Gerar nova aula' }).click();

  // Desafio aparece; clica no card → navega para a aba Desafio.
  const card = page.getByText('Ordenação (E2E)', { exact: false }).first();
  await expect(card).toBeVisible();
  await card.click();

  // Workspace carregado: o enunciado do desafio (README.md) é lido e renderizado.
  await expect(page.getByRole('heading', { name: 'Desafio E2E: ordenação' })).toBeVisible();

  // Abre solution.py na árvore de arquivos.
  await page.getByRole('button', { name: 'solution.py', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Salvar' })).toBeEnabled();

  // Editor CodeMirror focado: digita um marcador determinístico.
  const editor = page.locator('.cm-content').first();
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('# E2E_MARKER_SAVED');

  // Salva via botão (IPC + física em disco).
  await page.getByRole('button', { name: 'Salvar' }).click();

  // Verifica persistência REAL no workspace (sob wsRoot).
  await expect
    .poll(
      () => findFilesContaining(wsRoot!, '# E2E_MARKER_SAVED').length,
      { timeout: 15_000 },
    )
    .toBe(1);

  // A aba/editor mantém o conteúdo editado (sem perda no rereder).
  await expect(page.locator('.cm-content').first()).toContainText('E2E_MARKER_SAVED');
});