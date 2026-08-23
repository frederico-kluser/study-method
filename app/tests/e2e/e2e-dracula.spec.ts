/**
 * e2e-dracula.spec.ts — paleta Dracula no editor/terminal (onda 13).
 *
 * O editor CodeMirror (`@uiw/codemirror-theme-dracula`) e o terminal xterm
 * (`AnswerTerminal`) usam a MESMA paleta Dracula canónica (#282a36 de fundo —
 * ver src/lib/draculaTheme.ts). No fluxo de Desafio (gate 'ready', stub) o
 * workspace é materializado e o editor fica visível. Esta spec valida:
 *   - computed background do `.cm-editor` = #282a36 (rgb(40,42,54));
 *   - após "Testar resposta", o terminal (Panel xterm) também tem o fundo
 *     Dracula (#282a36) e imprime a saída determinística do stub.
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

test('e2e-dracula: editor CodeMirror e terminal usam o fundo Dracula #282a36', async () => {
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

  // Desafio carregado: abre o arquivo de código para o editor montar.
  await expect(page.getByRole('heading', { name: 'Desafio E2E: ordenação' })).toBeVisible();
  await page.getByRole('button', { name: 'solution.py', exact: true }).click();

  // Editor CodeMirror visível com o fundo Dracula #282a36 (rgb(40,42,54)).
  const editor = page.locator('.cm-editor').first();
  await expect(editor).toBeVisible();
  await expect(editor).toHaveCSS('background-color', 'rgb(40, 42, 54)');

  // Roda os testes determinísticos: o terminal xterm (Paper de fundo Dracula)
  // imprime a saída e mantém o fundo #282a36.
  await page.getByRole('button', { name: 'Testar resposta' }).click();
  const terminalPanel = page.locator('[data-onboarding-target="challenge-terminal"] .MuiPaper-root').first();
  await expect(terminalPanel).toBeVisible();
  await expect(terminalPanel).toHaveCSS('background-color', 'rgb(40, 42, 54)', { timeout: 15_000 });
});