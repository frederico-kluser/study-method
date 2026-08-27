/**
 * e2e-lesson.spec.ts — TRILHA → AULA em modo CHAT (rodada 8).
 *
 * O aluno NÃO gera mais aula: a Home mostra as TRILHAS (fixture do harness
 * E2E), a Trilha lista os itens já prontos e a aula é um chat com o tutor.
 * Asserts do fluxo novo:
 *   - Home mostra o cartão da trilha (com contagem de aulas);
 *   - a Trilha abre com módulos/aulas pré-carregados (item já existe, sem
 *     geração) e o teste de proficiência disponível;
 *   - a aula abre como CHAT: "Começar aula" → mensagem do tutor (stub
 *     determinístico) → "Próximo" → segunda seção → "Concluir aula";
 *   - as FONTES ficam atrás do botão "Fontes" (nunca no fluxo);
 *   - os DESAFIOS da aula aparecem abaixo (card clicável → aba Desafio).
 * No modo E2E o tutor é stub (sem LLM/rede).
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

test('e2e-lesson: trilha → aula em chat (teoria progressiva + fontes + desafios)', async () => {
  const launched = await launchApp({
    env: { E2E_GATE: 'ready', E2E_WORKSPACE_ROOT: wsRoot! },
  });
  app = launched.app;
  page = launched.page;

  await expect(page.getByRole('banner').getByText('Study Method — Tutor', { exact: false })).toBeVisible();

  // Home: a TRILHA já aparece como cartão (conteúdo pronto, nada a gerar).
  await expect(page.getByText('Node.js do Zero', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Trilhas', { exact: true }).first()).toBeVisible();

  // Abre a trilha → a aba Trilha já vem com os ITENS prontos.
  await page.getByText('Node.js do Zero', { exact: false }).first().click();
  await expect(page.getByRole('heading', { name: 'Node.js do Zero' })).toBeVisible();
  await expect(page.getByText('Aula E2E sobre funções', { exact: false })).toBeVisible();
  await expect(page.getByText('Aula E2E seguinte', { exact: false })).toBeVisible();
  // Teste de proficiência disponível (cobre tudo).
  await expect(page.getByRole('heading', { name: 'Teste de proficiência' })).toBeVisible();

  // Abre a aula → CHAT com o tutor (nada de gerar).
  await page.getByText('Aula E2E sobre funções', { exact: false }).first().click();
  await expect(page.getByRole('heading', { name: 'Aula E2E sobre funções' })).toBeVisible();

  // O chat começa vazio: "Começar aula" apresenta a 1ª seção (stub).
  await page.getByRole('button', { name: 'Começar aula' }).click();
  await expect(page.getByText('Tutor E2E:', { exact: false }).first()).toBeVisible();
  // ONDA 1 (teoria-pronta): 'next' é DETERMINÍSTICO (sem LLM) — o indicador
  // "tutor digitando…" NUNCA aparece nesse fluxo (só existe em 'answer').
  await expect(page.getByText(/tutor digitando|tutor typing/i)).toHaveCount(0);

  // Próximo → segunda seção da teoria (progressiva, uma por vez).
  await page.getByRole('button', { name: 'Próximo →' }).click();
  await expect(page.getByText('Tutor E2E:', { exact: false }).nth(1)).toBeVisible();
  await expect(page.getByText(/tutor digitando|tutor typing/i)).toHaveCount(0);

  // Concluir aula → botão vira "Concluída ✓".
  await page.getByRole('button', { name: 'Concluir aula' }).click();
  await expect(page.getByRole('button', { name: 'Concluída ✓' })).toBeVisible();

  // FONTES: atrás do botão, nunca no fluxo (o diálogo lista a fonte fixture).
  await page.getByRole('button', { name: 'Fontes' }).click();
  await expect(page.getByRole('heading', { name: 'Fontes desta aula' })).toBeVisible();
  await expect(page.getByText('MDN', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Fechar' }).click().catch(() => page.keyboard.press('Escape'));

  // DESAFIOS da aula: card clicável → aba Desafio (fluxo track).
  await expect(page.getByRole('heading', { name: 'Desafios desta aula' })).toBeVisible();
  await page.getByText('O dobro do número', { exact: false }).first().click();
  await expect(page.getByRole('heading', { name: 'O dobro do número' }).first()).toBeVisible();
  // Enunciado presente e o botão "Começar" (cronômetro só depois dele).
  await expect(page.getByRole('button', { name: 'Começar' })).toBeVisible();
});
