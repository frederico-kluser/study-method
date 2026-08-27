/**
 * e2e-test-answer.spec.ts — "Testar resposta" no desafio de TRILHA (rodada 8).
 *
 * O desafio só começa depois de ler o enunciado e clicar em "Começar" (o
 * cronômetro não roda antes). O main roda o código do aluno contra os testes
 * (node --test REAL sobre a fixture — determinístico). Asserts:
 *  - antes de "Começar" o editor NÃO está ativo (enunciado primeiro);
 *  - após "Começar", o editor CodeMirror aparece e o cronômetro roda;
 *  - resposta CORRETA → "Passou" (confete + estrelas);
 *  - resposta ERRADA → ONDA 1: razão parcial "N de M testes passaram" +
 *    CHECKLIST individual (✓/✗ com o nome de cada teste) + botão "Gerar novo
 *    desafio" (veredito não é tudo-ou-nada).
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

test('e2e-test-answer: Começar → editor → resposta certa passa; errada mostra checklist parcial + gerar novo', async () => {
  const launched = await launchApp({
    env: { E2E_GATE: 'ready', E2E_WORKSPACE_ROOT: wsRoot! },
  });
  app = launched.app;
  page = launched.page;

  await openTrackChallenge(page);

  // ENUNCIADO primeiro; o editor SÓ aparece depois de "Começar".
  await expect(page.getByText('Escreva uma função que devolve o dobro', { exact: false })).toBeVisible();
  await expect(page.locator('.cm-content')).toHaveCount(0);

  // "Começar" → cronômetro começa e o editor aparece.
  await page.getByRole('button', { name: 'Começar' }).click();
  await expect(page.locator('.cm-content').first()).toBeVisible();
  await expect(page.getByRole('timer')).toBeVisible();

  // Resposta ERRADA → ONDA 1: razão PARCIAL + CHECKLIST dos 3 testes
  // (return n → dobro(2)=2≠4 ✖, dobro(0)=0 ✓, dobro(-3)=-3≠-6 ✖ → 1 de 3).
  // O editor trava após o veredito — o caminho de saída é o novo desafio.
  await page.locator('.cm-content').first().click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('export function dobroDoNumero(n) { return n; }');
  await page.getByRole('button', { name: 'Testar resposta' }).click();
  await expect(page.getByText('1 de 3 testes passaram', { exact: false })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Resultado por teste', { exact: false })).toBeVisible();
  // O nome do teste aparece na checklist (ListItemText) E na saída bruta (pre)
  // — exact:true isola o item da checklist.
  await expect(page.getByText('dobro de 0 é 0', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gerar novo desafio' })).toBeVisible();
  // E2E: a regeneração exige LLM — OFF no stub; o erro é honesto (sem inventar).
  await page.getByRole('button', { name: 'Gerar novo desafio' }).click();
  await expect(page.getByText('regeneração desativada no modo E2E', { exact: false })).toBeVisible();

  // Reload → desafio recomeça do enunciado (estado fresco) → resposta CERTA.
  await page.reload();
  await openTrackChallenge(page);
  await page.getByRole('button', { name: 'Começar' }).click();
  await page.locator('.cm-content').first().click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('export function dobroDoNumero(n) { return n * 2; }');
  await page.getByRole('button', { name: 'Testar resposta' }).click();
  await expect(page.getByText('Passou com', { exact: false })).toBeVisible({ timeout: 20_000 });
});
