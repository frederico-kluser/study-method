/**
 * e2e-gate.spec.ts — GATE DE INÍCIO (ongo6).
 *
 * Valida que o AppGate bloqueia a entrada no app quando as chaves estão
 * ausentes ou inválidas (phase 'blocked'), mostrando o SetupView obrigatório.
 * O modo E2E lê o estado do gate de envars (E2E_GATE/E2E_KEYS) — sem rede real.
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, closeApp } from './helpers';

let app: ElectronApplication | undefined;
let page: Page;

test.afterEach(async () => {
  if (app) await closeApp(app);
});

test('e2e-gate: sem chaves → SetupView bloqueada (não entra no App)', async () => {
  // E2E_GATE default 'blocked' → nenhuma chave seedada → SetupView.
  const launched = await launchApp({});
  app = launched.app;
  page = launched.page;

  // SetupView aparece (heading do gate).
  await expect(page.getByRole('heading', { name: 'Antes de começar' })).toBeVisible();
  // Botão de salvar visível (mesmo desabilitado enquanto nada válido).
  await expect(page.getByRole('button', { name: 'Salvar' })).toBeVisible();

  // O App NÃO montou: sem AppBar "Study Method — Tutor" nem abas de navegação.
  await expect(page.getByText('Study Method — Tutor', { exact: false })).toHaveCount(0);
});

test('e2e-gate: chaves inválidas no boot → bloqueada com alerta de inválido', async () => {
  // E2E_GATE=invalid seeda claves configuradas porém inválidas → phase 'blocked'
  // com valid:false (o renderer mostra o alerta gate.invalidKeys).
  const launched = await launchApp({ env: { E2E_GATE: 'invalid' } });
  app = launched.app;
  page = launched.page;

  await expect(page.getByRole('heading', { name: 'Antes de começar' })).toBeVisible();
  // Alerta de chaves inválidas explícito.
  await expect(page.getByText('Algumas chaves são inválidas.')).toBeVisible();
  // Botão Salvar continua visível (o usuário pode corrigir).
  await expect(page.getByRole('button', { name: 'Salvar' })).toBeVisible();
  // E o app segue bloqueado (sem shell de navegação).
  await expect(page.getByRole('tab', { name: 'Aula' })).toHaveCount(0);
});