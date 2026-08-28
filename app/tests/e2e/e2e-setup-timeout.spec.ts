/**
 * e2e-setup-timeout.spec.ts — RODADA 10 (onda 2b): SEM SPINNER INFINITO na
 * validação de chaves (SetupView do gate + KeysPanel das Settings).
 *
 * Causa raiz (docs/relatorio-rodada10-diag.md): o fetch dos validadores no
 * main (apiKeyValidator) não tinha AbortSignal — rede que engole pacotes
 * deixava `keys:validate-*` pendurado INDEFINIDAMENTE e o spinner eterno.
 * Fix: timeout no validador (main, ~8s) + guarda de 10s no renderer.
 *
 * O harness E2E STUBÁ os canais keys:validate (e2eStubs responde imediato),
 * então esta spec INTERCEPTA no nível certo — o ipcMain do app, via
 * app.evaluate — substituindo o handler stub por um que PENDURA a resposta
 * por ~20s (mais que a guarda de 10s do renderer). Assim prova-se o contrato
 * real da UI: spinner liga, mensagem de erro clara aparece em ≤15s, spinner
 * some e o botão volta habilitado (retry). Segundo caso: resposta de erro
 * RÁPIDA (chave inválida) → mensagem clara sem espera.
 *
 * Os canais são os do contrato congelado (KEYS_CHANNELS, shared/ipc-contract).
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, closeApp } from './helpers';

let app: ElectronApplication | undefined;
let page: Page;

test.afterEach(async () => {
  if (app) await closeApp(app);
});

/**
 * Intercepta `keys:validate-deepseek` e `keys:validate-brave` no ipcMain do
 * app: remove o handler do stub E2E e registra um que PENDURA ~20s antes de
 * responder (simula a rede que engole pacotes do diagnóstico). Roda no MAIN
 * PROCESS via app.evaluate — os canais são os do contrato congelado.
 */
async function hangValidateChannels(app: ElectronApplication, hangMs: number): Promise<void> {
  await app.evaluate(({ ipcMain }, ms: number) => {
    const hang = (timeout: number) => new Promise<void>((r) => setTimeout(r, timeout));
    for (const channel of ['keys:validate-deepseek', 'keys:validate-brave']) {
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, async (): Promise<Record<string, unknown>> => {
        await hang(ms);
        return {
          isValid: false,
          provider: channel === 'keys:validate-deepseek' ? 'deepseek' : 'brave',
          errorMessage: 'Network error: timed out after 20000ms (E2E intercept)',
          checkedAt: new Date().toISOString(),
        };
      });
    }
  }, hangMs);
}

test('e2e-setup-timeout: validação pendurada no SetupView → erro claro e spinner some em ≤15s', async () => {
  const launched = await launchApp({}); // sem chaves → SetupView obrigatória
  app = launched.app;
  page = launched.page;

  await expect(page.getByRole('heading', { name: 'Antes de começar' })).toBeVisible();

  // Intercepta ANTES de validar: o handler stub é substituído por um que
  // pendura ~20s (a guarda do renderer é 10s — muito abaixo).
  await hangValidateChannels(app, 20_000);

  await page.getByLabel('Chave DeepSeek').fill('sk-pendurada-e2e');
  await page.getByRole('button', { name: 'Validar' }).first().click();

  // Spinner LIGOU (CircularProgress do botão — role progressbar).
  await expect(page.getByRole('progressbar').first()).toBeVisible();

  // Mensagem de erro clara de timeout aparece e o spinner SOME em ≤15s.
  const start = Date.now();
  await expect(page.getByText('Tempo esgotado', { exact: false })).toBeVisible({
    timeout: 15_000,
  });
  const elapsed = Date.now() - start;
  expect(elapsed, `erro deveria chegar em <15s, levou ${elapsed}ms`).toBeLessThan(15_000);

  // Spinner desapareceu e o botão voltou HABILITADO (retry possível).
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Validar' }).first()).toBeEnabled();
  // A mensagem de erro segue visível (não foi sobrescrita pelo retorno tardio).
  await expect(page.getByText('Tempo esgotado', { exact: false })).toBeVisible();
});

test('e2e-setup-timeout: resposta rápida de chave INVÁLIDA → mensagem clara e botão reabilitado', async () => {
  const launched = await launchApp({});
  app = launched.app;
  page = launched.page;

  await expect(page.getByRole('heading', { name: 'Antes de começar' })).toBeVisible();

  // Stub E2E padrão: chave com prefixo reservado 'invalid-' → resposta RÁPIDA
  // de erro ('Invalid API key') — sem interceptação.
  await page.getByLabel('Chave DeepSeek').fill('invalid-e2e-key');
  await page.getByRole('button', { name: 'Validar' }).first().click();

  // Mensagem clara de chave inválida (humanizeValidationError), spinner some,
  // botão reabilitado — tudo rápido (default do expect).
  await expect(page.getByText('Chave inválida', { exact: false })).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Validar' }).first()).toBeEnabled();
});

test('e2e-setup-timeout: validação pendurada no KeysPanel (Settings) → erro claro em ≤15s', async () => {
  // Gate READY (chaves seedadas válidas) → app monta e a aba Settings abre o
  // KeysPanel — o MESMO fluxo de validação do SetupView, com a mesma guarda.
  const launched = await launchApp({ env: { E2E_GATE: 'ready' } });
  app = launched.app;
  page = launched.page;

  await page.getByRole('tab', { name: 'Settings' }).click();
  const validar = page.getByRole('button', { name: 'Validar' }).first();
  await expect(validar).toBeVisible();

  await hangValidateChannels(app, 20_000);

  await validar.click();
  await expect(page.getByRole('progressbar').first()).toBeVisible();

  const start = Date.now();
  await expect(page.getByText('Tempo esgotado', { exact: false })).toBeVisible({
    timeout: 15_000,
  });
  const elapsed = Date.now() - start;
  expect(elapsed, `erro deveria chegar em <15s, levou ${elapsed}ms`).toBeLessThan(15_000);

  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await expect(validar).toBeEnabled();
  await expect(page.getByText('Tempo esgotado', { exact: false })).toBeVisible();
});
