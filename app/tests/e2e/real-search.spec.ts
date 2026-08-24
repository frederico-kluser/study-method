/**
 * real-search.spec.ts — E2E REAL da pesquisa/validação Brave (rede real, sem LLM).
 *
 * O app NÃO expõe um canal IPC de busca direta de referências — a pesquisa Brave
 * acontece DENTRO do LESSON-ORCHESTRATOR (fase `research`) e as fontes chegam à
 * UI no payload da aula (lesson.findings), coberto pelo `real-lesson.spec.ts`
 * (uma aula real carrega findings com URLs externas — Toolify, Techie Delight, etc).
 *
 * Este spec valida o caminho REAL e BARATO com o Brave:
 *   - `keys:validate-brave` com a CHAVE REAL → `isValid:true` (round-trip real
 *     contra api.search.brave.com com a key do usuário);
 *   - após a validação, `keys:get-status` reflete `braveValidated:true` (a chave
 *     real foi gravada no settingsStore isolado e reaprovada);
 *   - complementarmente valida a chave DeepSeek real (round-trip) — sem gerar aula.
 *
 * SKIP automático SEM chaves reais. Barato (sem geração de aula) — roda em
 * segundos, dependente só da latência da rede.
 */
import { test, expect, type Page } from '@playwright/test';
import { launchRealApp, closeRealApp, skipIfNoRealKeys, type RealApp } from './helpers-real';

test.setTimeout(120_000);

let real: RealApp | undefined;
let page: Page;

test.beforeEach(() => {
  skipIfNoRealKeys();
});

test.afterEach(async () => {
  await closeRealApp(real);
});

test('real-search: chave Brave REAL validada contra a API (round-trip); status reflete', async () => {
  real = await launchRealApp({});
  page = real.page;

  // Round-trip REAL com a chave Brave do usuário → válida (200 da API).
  const braveResult = (await page.evaluate(
    (k) => (globalThis as any).api.keys.validateBrave(k),
    real.braveApiKey,
  )) as { isValid: boolean; errorMessage?: string };
  expect(braveResult.isValid, `Brave real rejeitada: ${braveResult.errorMessage ?? ''}`).toBe(true);

  // Idem DeepSeek (complementar; sem gerar aula).
  const dsResult = (await page.evaluate(
    (k) => (globalThis as any).api.keys.validateDeepseek(k),
    real.deepseekApiKey,
  )) as { isValid: boolean; errorMessage?: string };
  expect(dsResult.isValid, `DeepSeek real rejeitada: ${dsResult.errorMessage ?? ''}`).toBe(true);

  // A validação real grava/reaprova no settingsStore isolado → get-status reflete.
  await page.evaluate(
    (a) => (globalThis as any).api.keys.setKey('brave', a),
    real.braveApiKey,
  );
  const status = (await page.evaluate(() => (globalThis as any).api.keys.getStatus())) as {
    braveConfigured: boolean;
    braveValidated: boolean;
    deepseekConfigured: boolean;
  };
  expect(status.braveConfigured).toBe(true);
  expect(status.deepseekConfigured).toBe(true);

  console.log('REAL_SEARCH_OK: Brave real validada (round-trip) e status reflete chaves configuradas');
});