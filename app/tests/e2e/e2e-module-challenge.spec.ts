/**
 * e2e-module-challenge.spec.ts — DESAFIO DO MÓDULO MULTI-ARQUIVO (rodada 9).
 *
 * O módulo da trilha fixture tem um desafio próprio (module.json challenge) que
 * MEXE EM MAIS ARQUIVOS: lib/soma.mjs + lib/multiplica.mjs, com testes que
 * importam dos dois (node:test REAL no submit). Asserts:
 *  - o card "Desafio do módulo" aparece no módulo da trilha (com estado);
 *  - abrir → enunciado do desafio do módulo (pré-"Começar");
 *  - após "Começar": SELETOR DE ARQUIVOS com 2 abas (lib/soma.mjs e
 *    lib/multiplica.mjs), um editor por arquivo;
 *  - editar OS DOIS arquivos e "Testar resposta" → submissão com AMBOS os
 *    arquivos → "Passou";
 *  - um arquivo errado → veredito parcial (1 de 2) — o submit envia os dois;
 *  - veredito FALHOU no desafio do módulo → a regeneração NÃO aparece
 *    ("Gerar novo desafio" é só de aula — conteúdo autoral).
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, closeApp, makeWorkspaceRoot, openModuleChallenge } from './helpers';

let app: ElectronApplication | undefined;
let page: Page;
let wsRoot: string | undefined;

test.beforeEach(() => {
  wsRoot = makeWorkspaceRoot();
});

test.afterEach(async () => {
  if (app) await closeApp(app);
});

test('e2e-module-challenge: card do módulo → 2 abas de arquivo → editar os dois → submit passa', async () => {
  const launched = await launchApp({
    env: { E2E_GATE: 'ready', E2E_WORKSPACE_ROOT: wsRoot! },
  });
  app = launched.app;
  page = launched.page;

  await openModuleChallenge(page);

  // ENUNCIADO primeiro; o editor SÓ aparece depois de "Começar".
  await expect(page.getByText('Implemente as funções de soma e multiplicação', { exact: false })).toBeVisible();
  await expect(page.locator('.cm-content')).toHaveCount(0);

  // "Começar" → cronômetro começa e o SELETOR DE ARQUIVOS aparece com as 2 abas.
  await page.getByRole('button', { name: 'Começar' }).click();
  await expect(page.getByRole('tab', { name: 'lib/soma.mjs' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'lib/multiplica.mjs' })).toBeVisible();
  await expect(page.getByRole('timer')).toBeVisible();
  await expect(page.locator('.cm-content').first()).toBeVisible();

  // Arquivo 1 (aba ativa por default): implementa a soma.
  await page.locator('.cm-content').first().click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('export function soma(a, b) { return a + b; }');

  // Troca para o arquivo 2 e implementa a multiplicação.
  await page.getByRole('tab', { name: 'lib/multiplica.mjs' }).click();
  await page.locator('.cm-content').first().click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('export function multiplica(a, b) { return a * b; }');

  // Submit com AMBOS os arquivos → passa (os testes importam dos dois).
  await page.getByRole('button', { name: 'Testar resposta' }).click();
  await expect(page.getByText('Passou com', { exact: false })).toBeVisible({ timeout: 20_000 });

  // Reload → recomeça do enunciado → UM arquivo errado → veredito PARCIAL (1 de 2).
  await page.reload();
  await openModuleChallenge(page);
  await page.getByRole('button', { name: 'Começar' }).click();
  await page.locator('.cm-content').first().click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('export function soma(a, b) { return a - b; }');
  await page.getByRole('tab', { name: 'lib/multiplica.mjs' }).click();
  await page.locator('.cm-content').first().click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('export function multiplica(a, b) { return a * b; }');
  await page.getByRole('button', { name: 'Testar resposta' }).click();
  // soma errada quebra o teste da soma E o "juntos" (que chama soma) — 1 de 3.
  await expect(page.getByText('1 de 3 testes passaram', { exact: false })).toBeVisible({ timeout: 20_000 });

  // F8: veredito FALHOU — e MESMO ASSIM a regeneração NÃO aparece para o
  // desafio do MÓDULO (o conteúdo é autoral; "Gerar novo desafio" é só de aula).
  await expect(page.getByRole('button', { name: 'Gerar novo desafio' })).toHaveCount(0);
});
