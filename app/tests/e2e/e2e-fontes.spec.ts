/**
 * e2e-fontes.spec.ts — ONDA2-FONTES: escolher uma fonte no diálogo de Fontes
 * a EMBEBE no tabpanel da aula.
 *
 * O pedido do dono (verbatim): *"quando clico em fontes, e escolho uma das
 * fontes, quero que renderize ela no 'role="tabpanel"' inteiro ali com um
 * botao de fechar para sair do iframe, e abrir de novo o modal das fontes"*.
 *
 * Fluxo medido (trilha fixture `nodejs-do-zero` — a fonte JÁ EXISTE no stub
 * `e2eStubs.ts`, aula-1: `{ title: 'MDN', url: 'https://example.org' }`;
 * NADA de fixture é editado aqui):
 *   1. Trilha → aula → botão "Fontes" (cabeçalho no SIDEBAR do shell) →
 *      diálogo "Fontes desta aula" abre;
 *   2. clicar o item da fonte → o diálogo fecha e o visualizador cobre o
 *      tabpanel INTEIRO: `[role="tabpanel"] iframe[src="https://example.org"]`
 *      existe, com "Fechar" e o link de reserva "Abrir no navegador" visíveis
 *      (a cobrança é de EXISTÊNCIA — nunca de conteúdo de rede: o iframe pode
 *      não resolver em máquina sem internet, e o teste é sobre O APP);
 *   3. fechar pelo BOTÃO → o visualizador sai (iframe count 0) e o diálogo de
 *      Fontes REABRE;
 *   4. abrir de novo e fechar pelo ESC → MESMO desfecho (o Esc com o
 *      visualizador aberto é do fechar único; sem ele, Esc continua sendo do
 *      diálogo/popover — padrão MUI intacto).
 *
 * Não-colisão com e2e-lesson.spec.ts ("Fechar" lá): o visualizador SÓ existe
 * com `openSource` escolhido — no fluxo do e2e-lesson o item nunca é clicado,
 * então nenhum "Fechar" existe e o `.catch(() => Escape)` de lá segue
 * fechando o diálogo pela tecla, como antes.
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

test('e2e-fontes: fonte escolhida embebe no tabpanel; fechar (botão e Esc) reabre o diálogo', async () => {
  const launched = await launchApp({
    env: { E2E_GATE: 'ready', E2E_WORKSPACE_ROOT: wsRoot! },
  });
  app = launched.app;
  page = launched.page;

  // Trilha → aula (mesma porta de entrada do e2e-lesson).
  await expect(page.getByRole('banner').getByText('Study Method — Tutor', { exact: false })).toBeVisible();
  await page.getByText('Node.js do Zero', { exact: false }).first().click();
  await expect(page.getByRole('heading', { name: 'Node.js do Zero' })).toBeVisible();
  await page.getByText('Aula E2E sobre funções', { exact: false }).first().click();
  await expect(page.getByRole('heading', { name: 'Aula E2E sobre funções' })).toBeVisible();

  // O iframe do visualizador NÃO existe com o diálogo fechado (o portal nem
  // é montado — cobertura do lado "sem fonte" do contrato).
  const frame = page.locator('[role="tabpanel"] iframe[src="https://example.org"][title="MDN"]');
  await expect(frame).toHaveCount(0);

  // Botão "Fontes" (cabeçalho da aula, no SIDEBAR) → diálogo.
  await page.getByRole('button', { name: 'Fontes' }).click();
  await expect(page.getByRole('heading', { name: 'Fontes desta aula' })).toBeVisible();

  // Escolher a fonte = botão do item (ListItemButton; o Link externo saiu —
  // o link de reserva agora mora DENTRO do visualizador).
  await page.getByRole('button', { name: /MDN/ }).click();

  // O visualizador cobre o tabpanel inteiro: iframe com src/title da fonte…
  await expect(frame).toHaveCount(1);
  await expect(frame).toBeVisible();
  // …"Fechar" com nome acessível (e o item de lista não está mais em cena)…
  await expect(page.getByRole('button', { name: 'Fechar' })).toBeVisible();
  // …o link de RESERVA (site que recusa embed)…
  await expect(page.getByRole('link', { name: 'Abrir no navegador' })).toBeVisible();
  // …e o aviso de frame bloqueado (rota de fuga anunciada). Existência de UI —
  // NUNCA de conteúdo de rede.
  await expect(page.getByText('proíbe ser exibido dentro do app')).toBeVisible();

  // FECHAR PELO BOTÃO: visualizador sai E o diálogo de Fontes volta.
  await page.getByRole('button', { name: 'Fechar' }).click();
  await expect(frame).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Fontes desta aula' })).toBeVisible();

  // Segunda rodada: MESMO desfecho pelo ESC (o fechar único, outro caminho).
  await page.getByRole('button', { name: /MDN/ }).click();
  await expect(frame).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(frame).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Fontes desta aula' })).toBeVisible();
});
