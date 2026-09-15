/**
 * perf-settings.spec.ts — FERRAMENTA de medição da abertura de Settings.
 *
 * Não é uma spec de comportamento (não asserta tempos — imprime números): mede
 * com observadores DENTRO da página (MutationObserver — imune ao throttling de
 * timers/rAF da janela oculta do harness) o intervalo clique→primeiro paint do
 * h1 de Settings e clique→painéis carregados (data-testid="settings-orphans-empty"
 * conectado, o último dos painéis a resolver), na 1ª abertura (fria) e na 2ª
 * (morna — com o cache stale-while-revalidate de panelCache.ts).
 *
 * Executar:  npm run build && npx playwright test perf-settings.spec.ts
 *
 * Metodologia (onda1-settings-perf): o polling do Playwright (waitFor/locator)
 * sofre throttling de ~1s em janela oculta e NÃO serve para medir latência de
 * centenas de ms — por isso a medição é microtask/event-driven na própria
 * página, com timestamps de performance.now().
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, closeApp, makeWorkspaceRoot } from './helpers';

let app: ElectronApplication | undefined;
let page: Page;

test.afterEach(async () => {
  if (app) await closeApp(app);
});

test('perf-settings: mede abertura de Settings (fria e morna)', async () => {
  const wsRoot = makeWorkspaceRoot();
  const launched = await launchApp({
    env: { E2E_GATE: 'ready', E2E_WORKSPACE_ROOT: wsRoot },
  });
  app = launched.app;
  page = launched.page;

  await page.getByRole('banner').getByText('Study Method — Tutor', { exact: false }).waitFor();

  // Observadores in-page: timestamps do clique (captura) + microtask pós-mutação
  // que anota o 1º instante em que o h1 e o estado "painéis carregados" estão
  // conectados ao DOM. Resultados lidos via __perfResults.
  const installObservers = (): Promise<void> =>
    page.evaluate(() => {
      const g = globalThis as unknown as {
        __tClick?: number;
        __perfResults: Record<string, number>;
        __perfCleanup?: () => void;
      };
      g.__perfResults = {};
      g.__tClick = undefined;
      g.__perfCleanup?.();
      // Sem lib DOM no tsconfig dos testes: tipos ESTRUTURAIS mínimos para o
      // pedaço de DOM que esta spec toca (padrão dos casts `as any` de
      // e2e-lesson, mas sem `any`).
      interface DomEl {
        textContent?: string | null;
        querySelectorAll(sel: string): ArrayLike<DomEl>;
        querySelector(sel: string): DomEl | null;
        documentElement: DomEl;
        addEventListener(type: string, fn: (ev: unknown) => void, capture: boolean): void;
        removeEventListener(type: string, fn: (ev: unknown) => void, capture: boolean): void;
      }
      interface DomWindow {
        document: DomEl;
        MutationObserver: new (cb: () => void) => {
          observe(target: DomEl, opts: { childList: boolean; subtree: boolean }): void;
          disconnect(): void;
        };
      }
      const win = globalThis as unknown as DomWindow;
      const doc = win.document;
      const onClick = (ev: unknown): void => {
        const target = ev as { target?: { closest?: (sel: string) => { textContent?: string | null } | null } };
        const tab = target.target?.closest?.('[role="tab"]');
        if (tab && tab.textContent?.includes('Settings') && g.__tClick === undefined) {
          g.__tClick = performance.now();
        }
      };
      doc.addEventListener('click', onClick, true);
      const check = (): void => {
        if (g.__tClick === undefined) return;
        const elapsed = Math.round(performance.now() - g.__tClick);
        if (
          g.__perfResults.h1 === undefined &&
          Array.from(doc.querySelectorAll('h1')).some((h) => h.textContent?.includes('Settings'))
        ) {
          g.__perfResults.h1 = elapsed;
        }
        if (
          g.__perfResults.paneis === undefined &&
          doc.querySelector('[data-testid="settings-orphans-empty"]')
        ) {
          g.__perfResults.paneis = elapsed;
        }
      };
      check();
      const obs = new win.MutationObserver(check);
      obs.observe(doc.documentElement, { childList: true, subtree: true });
      g.__perfCleanup = () => {
        doc.removeEventListener('click', onClick, true);
        obs.disconnect();
      };
    });

  const readResults = async (): Promise<Record<string, number>> => {
    await page
      .waitForFunction(
        () =>
          ((globalThis as unknown as { __perfResults?: Record<string, number> }).__perfResults
            ?.paneis ?? -1) >= 0,
        undefined,
        { polling: 250, timeout: 30_000 },
      )
      .catch(() => undefined);
    return page.evaluate(
      () => (globalThis as unknown as { __perfResults: Record<string, number> }).__perfResults,
    );
  };

  // ── 1ª abertura (fria: cache do painel vazio nesta sessão) ──
  await installObservers();
  await page.getByRole('tab', { name: 'Settings' }).click();
  const cold = await readResults();
  // eslint-disable-next-line no-console
  console.log(`[perf-settings] 1ª abertura (fria):  h1=${cold.h1}ms painéis=${cold.paneis}ms`);
  expect(cold.paneis).toBeGreaterThan(0);

  // ── 2ª abertura (morna: painéis nascem do cache stale-while-revalidate) ──
  await page.getByRole('tab', { name: 'Aula' }).click();
  // Saiu de Settings: o h1 desmonta (só a view ativa é montada).
  await page.waitForFunction(
    () => {
      const doc = (globalThis as unknown as {
        document?: { querySelectorAll(sel: string): ArrayLike<{ textContent?: string | null }> };
      }).document;
      if (!doc) return true;
      return !Array.from(doc.querySelectorAll('h1')).some((h) =>
        h.textContent?.includes('Settings'),
      );
    },
    undefined,
    { polling: 250, timeout: 30_000 },
  );
  await installObservers();
  await page.getByRole('tab', { name: 'Settings' }).click();
  const warm = await readResults();
  // eslint-disable-next-line no-console
  console.log(`[perf-settings] 2ª abertura (morna): h1=${warm.h1}ms painéis=${warm.paneis}ms`);
  expect(warm.paneis).toBeGreaterThan(0);
});
