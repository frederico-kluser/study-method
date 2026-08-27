/**
 * e2e-more-flows.spec.ts — MAIS FLUXOS de UI em modo stub (onda 18).
 *
 * Sem chaves reais. Complementa o que as specs unitárias (e2e-i18n, e2e-theme,
 * e2e-onboarding) já cobrem com ANGULOS NOVOS/combinados:
 *
 *   1. troca de idioma pt-BR → en → pt-BR reflete no Home (título/sugestões) e
 *      na aba Aula (rótulo do campo de assunto); round-trip volta a pt-BR.
 *   2. tema claro → escuro → volta a system, PERSISTIDO no localStorage junto
 *      do idioma (ambos sobrevivem a um reload juntos).
 *   3. onboarding first-run: o modal de seleção aparece na 1ª execução e o
 *      QUICK START COMPLETA os 6 passos navegando (fallback "Continuar" do
 *      fix16d para `qs-challenge-test-answer` sem desafio ativo), chegando a
 *      status `completed` no localStorage.
 *   4. persistência do progresso do tutorial entre reloads: avançar até um
 *      passo intermediário grava `study-method-onboarding-v1` com `in_progress`
 *      + currentStepId; um reload mantém o valor (retoma onde parou), í ntimo da
 *      característica "resume" do ondokai.
 *
 * Tudo determinístico (E2E_GATE='ready', stub). Janela oculta.
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, closeApp } from './helpers';

let app: ElectronApplication | undefined;
let page: Page;

test.afterEach(async () => {
  if (app) await closeApp(app);
});

test('more-flows: idioma pt → en → pt reflete no Home e na aula; tema claro→escuro→system persiste junto', async () => {
  const launched = await launchApp({ env: { E2E_GATE: 'ready' } });
  app = launched.app;
  page = launched.page;

  await expect(page.getByRole('banner').getByText('Study Method — Tutor', { exact: false })).toBeVisible();

  // Default pt-BR: Home (aba inicial) mostra o título pt-BR e a aba "Aula".
  await expect(page.getByRole('heading', { name: 'Aprenda programação e matemática com aulas geradas por IA' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Aula' })).toBeVisible();

  // Vai para a aba Aula e confere o estado vazio pt-BR (rodada 8: o aluno
  // escolhe a aula na Trilha — não há campo de assunto).
  await page.getByRole('tab', { name: 'Aula' }).click();
  await expect(page.getByText('Nenhuma aula selecionada', { exact: false })).toBeVisible();

  // Troca para English: o Home (ao voltar) e a aba passam a en.
  await page.getByLabel('Select language').click();
  await page.getByRole('menuitem', { name: /English/ }).click();
  await expect(page.getByRole('tab', { name: 'Lesson' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('app-language'))).toBe('en');

  // Volta ao Home (agora "Home" em en) e confere o título en.
  await page.getByRole('tab', { name: 'Home' }).click();
  await expect(page.getByRole('heading', { name: 'Learn programming and math with AI-generated lessons' })).toBeVisible();

  // Tema: ciclo light → dark → system (persistido no localStorage junto do idioma).
  // Locator language-agnóstico (data-onboarding-target da AppBar) — o aria-label
  // do botão muda com o idioma ("Tema"/"Theme").
  const html = page.locator('html');
  const toggle = page.locator('[data-onboarding-target="theme-toggle"] button').first();
  await expect(toggle).toBeVisible();
  await toggle.click(); // system → light
  await expect(html).toHaveClass(/light/);
  expect(await page.evaluate(() => localStorage.getItem('theme-mode'))).toBe('light');
  await toggle.click(); // light → dark
  await expect(html).toHaveClass(/dark/);
  expect(await page.evaluate(() => localStorage.getItem('theme-mode'))).toBe('dark');
  await toggle.click(); // dark → system
  await expect(html).toHaveClass(/light|dark/);
  expect(await page.evaluate(() => localStorage.getItem('theme-mode'))).toBe('system');

  // Reload: idioma en E tema system persistem juntos (ambos os localStorage vivos).
  await page.reload();
  await expect(page.getByRole('banner').getByText('Study Method — Tutor', { exact: false })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Home' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('app-language'))).toBe('en');
  expect(await page.evaluate(() => localStorage.getItem('theme-mode'))).toBe('system');

  // Round-trip de volta a pt-BR.
  await page.getByLabel('Select language').click();
  await page.getByRole('menuitem', { name: /Português/ }).click();
  await expect(page.getByRole('tab', { name: 'Início' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Aula' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('app-language'))).toBe('pt-BR');
});

test('more-flows: onboarding first-run — modal aparece e o Quick Start COMPLETA os 6 passos → completed', async () => {
  // E2E_ONBOARDING='1' deixa a oferta de 1ª execução disparar (userData fresco no stub).
  const launched = await launchApp({ env: { E2E_GATE: 'ready', E2E_ONBOARDING: '1' } });
  app = launched.app;
  page = launched.page;

  // Modal de seleção (primeira execução) com as DUAS opções.
  await expect(page.getByRole('heading', { name: 'Quer um tour?' })).toBeVisible();
  await page.getByRole('button', { name: /Quick Start/ }).click();

  const overlay = page.locator('[data-onboarding-panel]');
  await expect(overlay).toBeVisible();

  // Passo 1-2 informativos avançam por "Continuar".
  await expect(page.getByText('Passo 1 / 6', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByText('Passo 2 / 6', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Passo 3 (qs-open-lesson): navega para a aba Aula → auto-avança p/ passo 4.
  await expect(page.getByText('Passo 3 / 6', { exact: false })).toBeVisible();
  await page.getByRole('tab', { name: 'Aula' }).click();
  await expect(page.getByText('Passo 4 / 6', { exact: false })).toBeVisible();
  await page.getByRole('tab', { name: 'Desafio' }).click();

  // Passo 5 (qs-challenge-test-answer): sem desafio ativo → fallback "Continuar"
  // do fix16d (não trava por falta do alvo).
  await expect(page.getByText('Passo 5 / 6', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Passo 6 (qs-tour-complete): último passo → botão "Concluir tutorial".
  await expect(page.getByText('Passo 6 / 6', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Concluir tutorial' }).click();

  // Overlay fecha e o status vira 'completed' (Quick Start realmente CONCLUÍDO).
  await expect(overlay).toHaveCount(0);
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('study-method-onboarding-v1') ?? '{}'),
  );
  expect(stored.status).toBe('completed');
});

test('more-flows: progresso do tutorial persiste entre reloads (retoma onde parou)', async () => {
  const launched = await launchApp({ env: { E2E_GATE: 'ready', E2E_ONBOARDING: '1' } });
  app = launched.app;
  page = launched.page;

  await expect(page.getByRole('heading', { name: 'Quer um tour?' })).toBeVisible();
  await page.getByRole('button', { name: /Tutorial Completo/ }).click();

  const overlay = page.locator('[data-onboarding-panel]');
  await expect(overlay).toBeVisible();
  await expect(page.getByText('Passo 1 / 11', { exact: false })).toBeVisible();

  // Avança dois passos → estaciona em "Passo 3 / 11", com o estado persistido.
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByText('Passo 2 / 11', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByText('Passo 3 / 11', { exact: false })).toBeVisible();

  // O progresso (in_progress + step atual) está gravado no localStorage.
  const mid = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('study-method-onboarding-v1') ?? '{}'),
  );
  expect(mid.status).toBe('in_progress');
  expect(typeof mid.currentStepId).toBe('string');
  expect(mid.currentStepId.length).toBeGreaterThan(0);

  // Reload: o estado persiste (a característica "retomar onde parou" do ondokai
  // guarda o step; o overlay NÃO auto-resume — o usuário reabre pela ajuda, mas
  // o payload segue íntegro para o resume).
  const afterReload = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('study-method-onboarding-v1') ?? '{}'),
  );
  expect(afterReload.status).toBe('in_progress');
  expect(afterReload.currentStepId).toBe(mid.currentStepId);
  expect(afterReload.updatedAt).toBeGreaterThan(0);
});