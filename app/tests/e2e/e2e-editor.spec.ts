/**
 * e2e-editor.spec.ts — editor de código do desafio de TRILHA (rodada 8).
 *
 * O editor (CodeMirror sem autocomplete) vive no TrackChallengePanel e só
 * monta DEPOIS de "Começar" (o cronômetro não roda antes do enunciado). O
 * fluxo novo não tem árvore de arquivos nem botão "Salvar": o aluno edita o
 * arquivo único (solution.mjs) e o envia por "Testar resposta" — o main roda
 * o código contra os testes (node --test REAL sobre a fixture).
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, closeApp, makeWorkspaceRoot, openTrackChallenge } from './helpers';

let app: ElectronApplication | undefined;
let page: Page;
let wsRoot: string | undefined;

test.beforeEach(() => {
  wsRoot = makeWorkspaceRoot();
});

test.afterEach(async () => {
  if (app) await closeApp(app);
});

test('e2e-editor: desafio de trilha — editor monta após "Começar" e aceita edição', async () => {
  const launched = await launchApp({
    env: { E2E_GATE: 'ready', E2E_WORKSPACE_ROOT: wsRoot! },
  });
  app = launched.app;
  page = launched.page;

  await openTrackChallenge(page);

  // Enunciado primeiro; editor só depois de "Começar".
  await expect(page.locator('.cm-content')).toHaveCount(0);
  await page.getByRole('button', { name: 'Começar' }).click();
  const editor = page.locator('.cm-content').first();
  await expect(editor).toBeVisible();

  // O editor vem com o STARTER do desafio (o aluno edita por cima).
  await expect(editor).toContainText('não implementado');

  // Digita um marcador determinístico e o conteúdo permanece.
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('// E2E_MARKER_EDITOR');
  await expect(editor).toContainText('E2E_MARKER_EDITOR');

  // Sem botão "Salvar" (fluxo novo: o código vai direto ao "Testar resposta").
  await expect(page.getByRole('button', { name: 'Salvar' })).toHaveCount(0);

  // O código editado é o que o main testa: resposta certa → passa.
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('export function dobroDoNumero(n) { return n * 2; }');
  await page.getByRole('button', { name: 'Testar resposta' }).click();
  await expect(page.getByText('Passou com', { exact: false })).toBeVisible({ timeout: 20_000 });
});
