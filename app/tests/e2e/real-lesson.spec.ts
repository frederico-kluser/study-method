/**
 * real-lesson.spec.ts — E2E REAL: geração de uma aula de verdade (pesquisa Brave
 * + autoria pelo LLM remoto + runner materializando/validando os desafios).
 *
 * MODO REAL (onda 18): o app é lançado SEM `STUDY_METHOD_E2E` — a fiação real
 * da onda 3 flui de ponta a ponta com as CHAVES REAIS injetadas por env (ver
 * helpers-real.ts). Este fluxo valida:
 *   - a geração REAL de uma aula ("Inverter uma árvore binária") via o
 *     LESSON-ORCHESTRATOR (pesquisa → autoria → materialização → validação);
 *   - o markdown da aula renderiza com conteúdo real (título + seções + código);
 *   - os DESAFIOS LISTAM (regressão B1: list-challenges NÃO pode falhar com
 *     "requer setupRoot" — o orchestrator emite `setupRoot` na materialização e
 *     a ChallengeView lista com ele);
 *   - abrir um desafio carrega o workspace real (botão "Testar resposta" pronto).
 *
 * SKIP automático quando as chaves reais não estão no ambiente (a suíte mock
 * `npm run test:e2e` segue verde). GENEROSO timeout: geração real costuma levar
 * 3-6min (research + authoring + validação com juiz LLM) e pode variar com a
 * latência da rede/LLM — ver o README do harness.
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { launchRealApp, closeRealApp, skipIfNoRealKeys, generateRealLesson, type RealApp } from './helpers-real';

// CÁLCULO DO TIMEOUT (pior caso real):
//   geração: até 2 tentativas × perAttemptMs 420s = 840s (14min);
//   + validação com juiz LLM + asserts de render/lista/abertura do desafio.
//   O teto de 30min (1.8×10⁶ ms) absorve a cauda lenta da rede/LLM sem matar
//   o progresso real (o antigo 900s podia estourar na ponta lenta).
test.setTimeout(1_800_000);

let real: RealApp | undefined;
let page: Page;

test.beforeEach(() => {
  // Skip automático SEM keys reais → a suíte mock nunca falha por isso.
  skipIfNoRealKeys();
});

test.afterEach(async () => {
  await closeRealApp(real);
  try {
    fs.rmSync(real?.userDataDir ?? '', { recursive: true, force: true });
  } catch {
    /* tmp já removido */
  }
});

test('real-lesson: aula real gerada (pesquisa+autoria+validação); desafios LISTAM (B1) e abrem', async () => {
  // Setup dir temporário (não toca `~/.local/share/study-method/setups` do dev).
  const setupsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-real-setups-'));
  real = await launchRealApp({ setupsDir });
  page = real.page;

  // App destravado (gate ready com chaves reais).
  await expect(page.getByRole('banner').getByText('Study Method — Tutor', { exact: false })).toBeVisible();

  // Gera a aula REAL (com repetição transiente do LLM remoto). O sinal
  // lesson-status:done (data attr da LessonView) só é setado quando a geração
  // terminou (não confundir com o rótulo do Stepper).
  const gen = await generateRealLesson(page, 'Inverter uma árvore binária', {
    attempts: 2,
    perAttemptMs: 420_000,
  });
  expect(gen.ok, (gen as { error: string }).error).toBe(true);
  await expect(page.locator('[data-onboarding-signal="lesson-status:done"]')).toBeVisible({ timeout: 30_000 });

  // A aula REAL renderizou: ao menos um heading (o título da aula é um h2) e um
  // bloco de markdown. Asserção propositalmente ampla (título/estrutura variam).
  await expect(page.locator('main h2').first()).toBeVisible({ timeout: 45_000 });
  // A aula inclui código (a autoria gera exemplos com blocos de código).
  await expect(page.locator('main pre').first()).toBeVisible({ timeout: 45_000 });
  // A seção de desafios (h3 "Desafios") existe.
  await expect(page.getByRole('heading', { name: 'Desafios' })).toBeVisible({ timeout: 45_000 });

  // REGRESSÃO B1: listChallenges via IPC direto não deve falhar com "requer setupRoot".
  let listed: unknown[];
  try {
    listed = await page.evaluate(() => (globalThis as any).api.study.listChallenges());
  } catch (err) {
    throw new Error(`real-lesson B1: list-challenges falhou com: ${String(err)}`);
  }
  expect(Array.isArray(listed)).toBe(true);
  expect(listed.length).toBeGreaterThan(0);
  for (const c of listed as Array<{ challengeId: string }>) {
    expect(typeof c.challengeId).toBe('string');
  }

  // Navega para a aba Desafio (sem clique em card): a ChallengeView lista com o
  // `setupRoot` emitido na materialização — NÃO pode mostrar o erro B1.
  await page.getByRole('tab', { name: 'Desafio' }).click();
  await expect(page.getByText(/requer setupRoot/i)).toHaveCount(0, { timeout: 20_000 });

  // Abre um desafio real pelo seletor da ba Desafio e confere que o workspace
  // carrega ("Testar resposta" pronto ⇒ desafio materializado/ativo).
  const picker = page.locator('#challenge-picker');
  await expect(picker).toBeVisible({ timeout: 60_000 });
  await expect(picker).toBeEnabled({ timeout: 60_000 });
  await picker.click();
  // MUI Select renderiza as opções em div[role="option"] dentro de um
  // listbox — sem depender da palavra exata do desafio (títulos reais variam).
  const firstOption = page.getByRole('option').first();
  await expect(firstOption).toBeVisible({ timeout: 15_000 });
  await firstOption.click();
  await expect(page.getByRole('button', { name: 'Testar resposta' })).toBeVisible({ timeout: 60_000 });

  console.log('REAL_LESSON_OK: aula real renderizada, desafios listados (B1 ok) e aberto');
});