/**
 * tests/e2e/gamesShots.ts — CAPTURA DE PRINTS da secção Games (ONDA-GAMES).
 *
 * Helper de captura da suíte `tests/e2e/e2e-games.spec.ts`: tira os prints da
 * secção Games para `.recon/games-shots/` (fora de `app/` — evidência de
 * auditoria, não artefacto de build) com viewport CONTROLADO e espera ESTÁVEL
 * antes de cada captura. Só captura e geometria de janela: nenhum assert de
 * produto vive aqui (os cenários são da spec).
 *
 * ─── DECISÕES ──────────────────────────────────────────────────────────────
 *
 * 1. VIEWPORT PELO TAMANHO DE CONTEÚDO DA JANELA (e não por emulação): o app
 *    roda em Electron e as specs existentes medem o layout REAL da janela
 *    (`shrinkWindow` do e2e-autoscroll-fim: `setMinimumSize` ANTES do
 *    `setSize`, porque o main declara minWidth 900 / minHeight 600 e sem
 *    derrubar o mínimo o pedido é clampado em silêncio). Aqui é o mesmo, com
 *    `setContentSize`: o pedido é EXATAMENTE o viewport do renderer
 *    (1280×800 no desktop, 360×740 no mobile), sem a barra de título entrar
 *    na conta. A espera é por CONDIÇÃO OBSERVÁVEL (o renderer enxerga o
 *    tamanho pedido) e nunca por relógio.
 *
 * 2. ESPERA ESTÁVEL ANTES DE CADA PRINT (pedido do orquestrador: "sem
 *    skeletons"): duas condições, ambas observáveis —
 *      (a) nenhum `[role="progressbar"]` montado (o LinearProgress do
 *          loading dos mundos/níveis e o `loading` do botão "Testar resposta"
 *          são os dois skeletons desta secção);
 *      (b) o layout PAROU de mexer: duas amostras consecutivas idênticas de
 *          `[viewport, altura do corpo, comprimento do texto]` (mesma
 *          metodologia do `waitForLayoutSettled` do e2e-autoscroll-fim).
 *    Em cima disso, `page.screenshot({ animations: 'disabled' })` congela as
 *    transições do MUI para o frame capturado ser o estado, não o meio-termo.
 *
 * 3. NOMES DOS PRINTS são o contrato do pedido: `01-mapa.png` … `08-…`. O
 *    diretório é criado à primeira captura (`mkdirSync` recursivo) — um clone
 *    limpo não exige passo de preparação.
 */
import { expect, type ElectronApplication, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** Raiz do REPO (tests/e2e → app → study-method): `.recon/` é irmão de `app/`. */
export const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

/** Saída dos prints da secção Games (pedido do orquestrador, path absoluto). */
export const SHOTS_DIR = path.join(REPO_ROOT, '.recon', 'games-shots');

/**
 * Fatia do `window` do renderer usada pela espera estável. O tsconfig destes
 * testes é o de NODE (sem lib DOM) — o acesso ao DOM usa `globalThis` com
 * cast explícito (mesma técnica de `spacingScan.ts` e `e2e-lesson.spec.ts`).
 */
interface RendererGlobals {
  innerWidth: number;
  innerHeight: number;
  document: {
    body: { scrollHeight: number; innerText: string };
    querySelectorAll(selector: string): ArrayLike<unknown>;
  };
}

/** Caminho absoluto de um print (cria o diretório de saída à primeira). */
export function shotsPath(name: string): string {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  const file = name.endsWith('.png') ? name : `${name}.png`;
  return path.join(SHOTS_DIR, file);
}

/** Amostra do layout usada pela condição "o layout parou de mexer". */
async function layoutSample(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const g = globalThis as unknown as RendererGlobals;
    return [
      g.innerWidth,
      g.innerHeight,
      g.document.body.scrollHeight,
      g.document.body.innerText.length,
    ].join(',');
  });
}

/**
 * Espera a UI assentar: sem skeletons (progressbars) e com o layout estável
 * entre duas amostras consecutivas. Condições observáveis, nunca relógio.
 */
export async function waitForStableUi(page: Page): Promise<void> {
  // (a) Skeletons: o LinearProgress do loading e o `loading` do botão de
  // submissão são os únicos `[role="progressbar"]` desta secção.
  await expect
    .poll(async () => await page.locator('[role="progressbar"]').count(), {
      timeout: 20_000,
      message: 'a secção Games ainda mostrava um skeleton ([role="progressbar"]) — print seria de carregamento',
    })
    .toBe(0);
  // (b) Layout estável: duas amostras consecutivas idênticas.
  let previous: string | null = null;
  await expect
    .poll(
      async () => {
        const sample = await layoutSample(page);
        const stable = previous !== null && sample === previous;
        previous = sample;
        return stable;
      },
      {
        timeout: 15_000,
        message: 'o layout da secção Games não assentou (amostras consecutivas ainda divergiam)',
      },
    )
    .toBe(true);
}

/**
 * Captura UM print da secção Games: espera a UI assentar e grava o PNG em
 * `.recon/games-shots/`. Devolve o caminho absoluto (para o relatório).
 */
export async function captureShot(page: Page, name: string): Promise<string> {
  await waitForStableUi(page);
  const file = shotsPath(name);
  // `animations: 'disabled'`: congela transições/ripples do MUI para o frame
  // capturado ser o ESTADO e não o meio-termo de uma animação.
  await page.screenshot({ path: file, animations: 'disabled' });
  return file;
}

/**
 * Leva o VIEWPORT do renderer ao tamanho pedido (px de conteúdo da janela) e
 * espera o renderer enxergar o tamanho novo. `setMinimumSize(320, 240)` antes
 * porque o main declara minWidth 900 / minHeight 600 — sem derrubar o mínimo,
 * `setContentSize(360, 740)` seria clampado em silêncio (o defeito que o
 * `shrinkWindow` do e2e-autoscroll-fim já documentou).
 */
export async function setViewport(
  app: ElectronApplication,
  page: Page,
  dims: { width: number; height: number },
): Promise<void> {
  await app.evaluate(({ BrowserWindow }, size: { width: number; height: number }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) throw new Error('janela do app não encontrada');
    win.setMinimumSize(320, 240);
    win.setContentSize(size.width, size.height);
  }, dims);
  // 1px de tolerância (arredondamento sub-pixel do Blink): o renderer tem de
  // ENXERGAR o tamanho pedido, com ou sem scrollbar fantasma.
  await expect
    .poll(
      async () =>
        await page.evaluate((size: { width: number; height: number }) => {
          const g = globalThis as unknown as RendererGlobals;
          return (
            Math.abs(g.innerWidth - size.width) <= 1 && Math.abs(g.innerHeight - size.height) <= 1
          );
        }, dims),
      {
        timeout: 10_000,
        message: `o renderer não enxergou o viewport pedido (${dims.width}×${dims.height})`,
      },
    )
    .toBe(true);
  await waitForStableUi(page);
}
