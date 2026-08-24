/**
 * real-didactics.spec.ts — E2E REAL da DIDÁTICA CERTA/ERRADA (pedido explícito):
 * a resposta do aluno é avaliada PELO JUIZ/avaliador DeepSeek de verdade e o
 * feedback didático chega à UI.
 *
 * Fluxo (1 aula real + 2 avaliações no MESMO desafio — o mínimo aceito pelo
 * orquestrador quando a chamada real é cara):
 *   1. gera UMA aula real ("Inverter uma árvore binária") e abre um desafio;
 *   2. RESPONDIDA CORRETAMENTE: escreve a solução de referência no stub real,
 *      clica "Testar resposta" → veredito determinístico "PASSOU" (runner real
 *      rodando os testes reais) + feedback didático do DeepSeek na UI;
 *   3. RESPONDIDA ERRADA/parcial: restaura o stub vazio/incompleto, clica
 *      "Testar resposta" → veredito "NÃO PASSOU" + feedback didático com dicas.
 *
 * O stub é escrito pelo canal REAL `study:write-workspace-file` (o mesmo save
 * da UI); o veredito vem do runner real (`runner.sh` + testes reais); o
 * feedback vem do pi DeepSeek streamado no painel de Feedback da ChallengeView.
 *
 * SKIP automático SEM chaves reais. Timeout generoso (geração real + 2 evals).
 */
import { test, expect, type Page } from '@playwright/test';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { launchRealApp, closeRealApp, skipIfNoRealKeys, generateRealLesson, type RealApp } from './helpers-real';

// CÁLCULO DO TIMEOUT (pior caso real):
//   geração: até 2 tentativas × perAttemptMs 420s = 840s (14min);
//   + 2 avaliações didáticas DeepSeek (feedback certa + errada) ≈ até ~5min;
//   + vereditos/asserts do runner e latência de rede/LLM.
//   840s + ~2×150s avaliações + folga ≈ 25min. O teto de 30min (1.8×10⁶ ms)
//   absorve a cauda lenta e o retry 1x sem matar progresso real.
test.setTimeout(1_800_000);

let real: RealApp | undefined;
let page: Page;

test.beforeEach(() => {
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

test('real-didactics: resposta CORRETA → PASSOU + feedback DeepSeek; resposta ERRADA → NÃO PASSOU + feedback/dicas', async () => {
  const setupsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-real-setups-'));
  real = await launchRealApp({ setupsDir });
  page = real.page;

  // Gera a aula real (com repetição transiente do DeepSeek) e aguarda o `done`.
  await expect(page.getByRole('banner').getByText('Study Method — Tutor', { exact: false })).toBeVisible();
  const gen = await generateRealLesson(page, 'Inverter uma árvore binária', {
    attempts: 2,
    perAttemptMs: 420_000,
  });
  expect(gen.ok, (gen as { error: string }).error).toBe(true);
  await expect(page.locator('[data-onboarding-signal="lesson-status:done"]')).toBeVisible({ timeout: 30_000 });

  // Lista os desafios reais e abre o primeiro.
  const challenges = (await page.evaluate(() => (globalThis as any).api.study.listChallenges())) as Array<{
    challengeId: string;
    workspaceDir: string;
  }>;
  expect(challenges.length).toBeGreaterThan(0);
  const wsDir = challenges[0].workspaceDir;
  await page.getByRole('tab', { name: 'Desafio' }).click();
  const picker = page.locator('#challenge-picker');
  await expect(picker).toBeEnabled({ timeout: 60_000 });
  await picker.click();
  const firstOption = page.getByRole('option').first();
  await expect(firstOption).toBeVisible({ timeout: 15_000 });
  await firstOption.click();
  await expect(page.getByRole('button', { name: 'Testar resposta' })).toBeVisible({ timeout: 60_000 });

  // Descobre o stub do desafio (arquivo de código primário) e a referência real.
  const files = (await page.evaluate((dir) => (globalThis as any).api.study.listWorkspaceFiles({ workspaceDir: dir }), wsDir)) as Array<{ path: string; dir: boolean }>;
  const stubFile = files.find(
    (f) => !f.dir && /\.(py|mjs|js|go|rs|c)$/i.test(f.path) && !/test|README/i.test(f.path),
  );
  expect(stubFile, `stub de código não encontrado em ${wsDir}`).toBeTruthy();
  const stubPath = stubFile!.path;
  const ext = path.extname(stubPath).replace(/^\./, '');

  // Lê o stub ORIGINAL (será usado como resposta ERRADA — implementação vazia).
  const originalStub = (await page.evaluate(
    (a) => (globalThis as any).api.study.readWorkspaceFile(a),
    { workspaceDir: wsDir, path: stubPath },
  )) as string;
  // Lê a REFERÊNCIA (solução correta) — o teste roda contra o stub do aluno SEM
  // `.solution/`, então escrever a referência no stub garante o veredito PASSOU.
  const reference = (await page.evaluate(
    (a) => (globalThis as any).api.study.readWorkspaceFile(a),
    { workspaceDir: wsDir, path: `.solution/reference.${ext}` },
  )) as string;
  expect(reference.trim().length).toBeGreaterThan(0);

  // ── RESPOSTA CORRETA ────────────────────────────────────────────────────────
  await page.evaluate(
    (a) => (globalThis as any).api.study.writeWorkspaceFile(a),
    { workspaceDir: wsDir, path: stubPath, content: reference },
  );
  await page.getByRole('button', { name: 'Testar resposta' }).click();

  // Veredito determinístico REAL: PASSOU + contagem de testes.
  await expect(page.getByText('PASSOU', { exact: false }).first()).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/TESTS_RUN=\d+/).first()).toBeVisible({ timeout: 60_000 });

  // Feedback didático do DeepSeek chega à UI (painel de feedback — `pre` do
  // piFinal, renderizado por último após o enunciado/raciocínio). Não vazio.
  await expect(page.getByText('Feedback', { exact: false }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('main pre').last()).not.toBeEmpty({ timeout: 120_000 });

  // ── RESPOSTA ERRADA/parcial ────────────────────────────────────────────────
  // Restaura o stub vazio/incompleto (implementação ausente) → testes reais falham.
  await page.evaluate(
    (a) => (globalThis as any).api.study.writeWorkspaceFile(a),
    { workspaceDir: wsDir, path: stubPath, content: originalStub },
  );
  await page.getByRole('button', { name: 'Testar resposta' }).click();

  // Veredito NÃO PASSOU (runner real rejeitou a implementação ausente).
  await expect(page.getByText('NÃO PASSOU', { exact: false }).first()).toBeVisible({ timeout: 90_000 });

  // Feedback didático (dicas/pistas sobre o erro) chega à UI — novo conteúdo do
  // DeepSeek após a resposta errada.
  await expect(page.getByText('Feedback', { exact: false }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('main pre').last()).not.toBeEmpty({ timeout: 120_000 });

  console.log('REAL_DIDACTICS_OK: correta→PASSOU+feedback; errada→NÃO PASSOU+feedback');
});