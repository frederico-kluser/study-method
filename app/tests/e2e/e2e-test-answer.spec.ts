/**
 * e2e-test-answer.spec.ts — "Testar resposta" no desafio de TRILHA (rodada 8).
 *
 * O desafio só começa depois de ler o enunciado e clicar em "Começar" (o
 * cronômetro não roda antes). O main roda o código do aluno contra os testes
 * (node --test REAL sobre a fixture — determinístico). Asserts:
 *  - antes de "Começar" o editor NÃO está ativo (enunciado primeiro);
 *  - após "Começar", o editor CodeMirror aparece e o cronômetro roda;
 *  - resposta CORRETA → "Passou" (confete + estrelas);
 *  - resposta ERRADA → ONDA2 (error-flow): o painel FECHA e a aba Aula reabre
 *    (em tela cheia) com a BOLHA DE ERRO no role=log (razão parcial "1 de 3
 *    testes passaram" + checklist individual ✔/✖ + saída) seguida da BOLHA DA
 *    PERGUNTA do tutor ("O que você acha que errou?"); o "Gerar novo desafio"
 *    agora vive NA BOLHA → clicar leva à superfície de falha HONESTA do stub
 *    (regeneração desativada no modo E2E — sem LLM) exibida como chat.lastError
 *    (Alert fixo, NÃO movido); a segunda metade REENTRA no desafio pelo CARD da
 *    lista — no POPOVER do botão "Desafios" do cabeçalho (UX do dono: nada
 *    entre o chat e o input) — e passa com a resposta certa.
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

test('e2e-test-answer: errada fecha o painel → bolha de erro + pergunta no chat da aula; certa passa', async () => {
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

  // Resposta ERRADA (return n → dobro(2)=2≠4 ✖, dobro(0)=0 ✓, dobro(-3)=-3≠-6 ✖
  // → 1 de 3). ONDA2: o painel FECHA e a aba Aula reabre com a bolha de erro.
  await page.locator('.cm-content').first().click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('export function dobroDoNumero(n) { return n; }');
  await page.getByRole('button', { name: 'Testar resposta' }).click();

  // O painel do desafio fechou (nenhum heading com o título do desafio).
  await expect(page.getByRole('heading', { name: 'O dobro do número' })).toHaveCount(0, { timeout: 20_000 });

  // A AULA reabriu (em tela cheia) — a bolha de erro está no role=log:
  // razão parcial (N de M) + checklist com ✔/✖ + a pergunta do tutor.
  await expect(page.getByRole('heading', { name: 'Aula E2E sobre funções' })).toBeVisible({ timeout: 20_000 });
  const log = page.getByRole('log');
  await expect(log.getByText('1 de 3 testes passaram', { exact: false })).toBeVisible({ timeout: 20_000 });
  // Timeout explícito — a review digita a 10 tps (Onda 1): a ~40 chars/s a
  // bolha alcança "Resultado por teste" em ~5.1s e o checklist em ~5.6s —
  // contra o timeout default de 5s do Playwright a margem era ~0.3-0.5s
  // (flake latente em CI/jitter). 15s cobre a review do stub (~250 chars ≈
  // 6.3s) com folga.
  await expect(log.getByText('Resultado por teste', { exact: false })).toBeVisible({ timeout: 15_000 });
  // Checklist isolada da saída bruta (a MESMA linha do check existe no code
  // block — o escopo do <ul> da bolha isola os itens; âncora ^$ no li).
  const checklist = log.getByRole('list');
  await expect(checklist.getByText(/^✔ dobro de 0 é 0$/)).toBeVisible({ timeout: 15_000 });
  await expect(checklist.getByText(/^✖ dobro de 2 é 4$/)).toBeVisible({ timeout: 15_000 });
  // Bolha da pergunta do tutor ("o que você acha que errou?") — última bolha
  // do par semeado; timeout explícito — a review digita a 10 tps (Onda 1).
  await expect(log.getByText('O que você acha que errou?', { exact: false })).toBeVisible({ timeout: 15_000 });

  // O aluno responde (texto) — o turno 'answer' leva o challengeError no
  // payload (contrato Onda 1; o stub ecoa a última pergunta do aluno). O envio
  // é o Enter no textbox (o IconButton do Send não tem aria-label — gap de
  // a11y PRÉ-EXISTENTE, fora do escopo desta onda).
  await page.getByRole('textbox', { name: 'Sua dúvida…' }).fill('eu acho que errei no retorno');
  await page.getByRole('textbox', { name: 'Sua dúvida…' }).press('Enter');
  await expect(
    page.getByText('Tutor E2E responde a dúvida: eu acho que errei no retorno', { exact: false }),
  ).toBeVisible({ timeout: 20_000 });

  // "Gerar novo desafio" AGORA VIVE NA BOLHA (o painel fechou). ONDA3
  // (generate-flow): o clique abre o MODAL GLOBAL de etapas — o stub responde
  // {ok:false} (regeneração exige LLM — OFF no modo E2E) e o modal mostra o
  // ERRO (o chat.lastError segue por compat). Fechar o modal para seguir.
  await expect(page.getByRole('button', { name: 'Gerar novo desafio' })).toBeVisible();
  await page.getByRole('button', { name: 'Gerar novo desafio' }).click();
  const genModal = page.getByRole('dialog', { name: 'Gerando novo desafio' });
  await expect(
    genModal.getByText('regeneração desativada no modo E2E', { exact: false }),
  ).toBeVisible();
  await genModal.getByRole('button', { name: 'Fechar' }).click();
  await expect(genModal).toHaveCount(0);

  // Segunda metade: REENTRA no desafio pelo CARD da lista — agora no POPOVER
  // do botão "Desafios" do cabeçalho (UX do dono: nada entre o chat e o
  // input; o texto da bolha NÃO é um botão — o locator por role button isola
  // o card) e passa com a resposta certa.
  await page.getByRole('button', { name: 'Desafios' }).click();
  await page.getByRole('button', { name: /O dobro do número/ }).first().click();
  await expect(page.getByRole('heading', { name: 'O dobro do número' }).first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Começar' }).click();
  await page.locator('.cm-content').first().click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('export function dobroDoNumero(n) { return n * 2; }');
  await page.getByRole('button', { name: 'Testar resposta' }).click();
  await expect(page.getByText('Passou com', { exact: false })).toBeVisible({ timeout: 20_000 });
});
