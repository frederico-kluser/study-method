/**
 * e2e-theme.spec.ts — toggle de tema claro/escuro na AppBar (onda 11/13).
 *
 * O ThemeToggleButton na AppBar cicla light → dark → system (via
 * useColorScheme do MUI com colorSchemeSelector:'class'). Esta spec valida:
 *   - a classe `.light`/`.dark` no <html> muda a cada clique (useColorScheme +
 *     colorSchemeSelector class — ver src/theme.ts);
 *   - o `localStorage['theme-mode']` é gravado (modeStorageKey do ThemeProvider);
 *   - no fim do ciclo volta a `system` (e o scheme efetivo segue o SO);
 *   - as cores COMPUTADAS de cada esquema são as do contrato "Cartucho"
 *     (`src/lib/designTokens.ts`) — medidas no Electron buildado, não deduzidas;
 *   - a escala tipográfica é ESTRITAMENTE monotônica NO APP RODANDO: um teste
 *     que só olha o objeto de tema não pega o coeficiente de rem do MUI, que foi
 *     exatamente o que inverteu h4/h5 (25px contra 27,43px).
 * Tudo determinístico em modo stub (E2E_GATE='ready', janela oculta).
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, closeApp } from './helpers';

let app: ElectronApplication | undefined;
let page: Page;

test.afterEach(async () => {
  if (app) await closeApp(app);
});

test('e2e-theme: toggle → classe .light/.dark no <html> + localStorage theme-mode; ciclo volta a system', async () => {
  const launched = await launchApp({ env: { E2E_GATE: 'ready' } });
  app = launched.app;
  page = launched.page;

  // App montou: AppBar com o título e o botão de tema.
  await expect(page.getByRole('banner').getByText('Study Method — Tutor', { exact: false })).toBeVisible();
  const toggle = page.getByRole('button', { name: 'Tema:' });
  await expect(toggle).toBeVisible();

  const html = page.locator('html');
  const storedMode = async (): Promise<string | null> =>
    await page.evaluate(() => localStorage.getItem('theme-mode'));

  // Default = 'system' (sem valor salvo) → <html> tem exatamente um de light/dark,
  // e nada persistido no localStorage ainda.
  await expect(html).toHaveClass(/light|dark/);
  expect(await storedMode()).toBeNull();

  // 1º clique: system → light → .light no <html> e 'light' no localStorage.
  // Cartucho claro: o body é o NÍVEL 0 da rampa tonal (#faf7f2 →
  // rgb(250,247,242)), não mais o branco default do MUI.
  //
  // A AppBar é rgb(222,53,27) = #de351b = `primary.main` porque `src/App.tsx`
  // ainda a pinta com a cor primária (App.tsx:73-75). Com a paleta nova isso é
  // uma BARRA VERMELHA SATURADA de largura inteira, e contraria o princípio §1
  // da spec ("superfície quieta, resposta viva": a personalidade vive em acento,
  // estado e movimento, NUNCA na superfície). É intencionalmente TEMPORÁRIO —
  // o App.tsx pertence à onda seguinte, que vai trocar a AppBar para uma
  // superfície da rampa (nível 3, o chrome). Quando isso acontecer, este valor
  // esperado muda junto; não é regressão, é a onda 2 fazendo o trabalho dela.
  await toggle.click();
  await expect(html).toHaveClass(/light/);
  expect(await storedMode()).toBe('light');
  await expect(page.getByRole('banner')).toHaveCSS('background-color', 'rgb(222, 53, 27)');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(250, 247, 242)');

  // 2º clique: light → dark → .dark. No escuro o header NÃO é primary — vira
  // superfície da rampa tonal Cartucho: `background.paper` = nível 1 (#1b1e26 →
  // rgb(27,30,38)) com borda `divider` (#2c313f → rgb(44,49,63)); o body usa o
  // nível 0 (#12141a → rgb(18,20,26)).
  await toggle.click();
  await expect(html).toHaveClass(/dark/);
  expect(await storedMode()).toBe('dark');
  const banner = page.getByRole('banner');
  await expect(banner).toHaveCSS('background-color', 'rgb(27, 30, 38)');
  await expect(banner).toHaveCSS('border-bottom-color', 'rgb(44, 49, 63)');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(18, 20, 26)');

  // 3º clique: dark → system → volta a ter exatamente um de light/dark (segue o SO).
  await toggle.click();
  await expect(html).toHaveClass(/light|dark/);
  expect(await storedMode()).toBe('system');
});
/**
 * Fatia do DOM que o corpo do `evaluate` usa. O tsconfig destes testes é o de
 * NODE (`lib: ["ES2022"]`, sem DOM) porque o processo de teste é Node — mas o
 * corpo do `evaluate` roda no RENDERER, que tem DOM. Declarar a fatia aqui é o
 * que permite tipar o probe sem mexer no tsconfig do projeto.
 */
interface RendererDom {
  document: {
    querySelector(selector: string): unknown;
    querySelectorAll(selector: string): ArrayLike<{ classList: ArrayLike<string> }>;
  };
  getComputedStyle(element: unknown): { fontSize: string };
}

/**
 * A escala tipográfica medida NO APP RODANDO — a única medição que pega o
 * coeficiente de rem do MUI.
 *
 * `typography.fontSize: 16` re-baseia o rem de 14/14 = 1 para 16/14 = 1,142857 e
 * infla +14,29% TODA variante que não traz o próprio `fontSize`. Enquanto só
 * h1–h4 estavam pinadas, o app rodando mostrava h5 a 27,43px contra h4 a 25px:
 * na LessonView o `variant="h5" component="h2"` renderizava MAIOR que o
 * `variant="h4" component="h1"` logo acima dele, em outra família e outro peso.
 * O teste unitário do objeto de tema não via isso — este vê.
 *
 * A varredura passa por todas as abas do dock e recolhe, de cada variante de
 * título encontrada, o `font-size` computado. Depois exige ordem estrita entre
 * as que apareceram, e que nenhuma fique abaixo do corpo.
 */
test('e2e-theme: a escala tipográfica renderizada é estritamente monotônica (h1 > … > h6)', async () => {
  const launched = await launchApp({ env: { E2E_GATE: 'ready' } });
  app = launched.app;
  page = launched.page;

  await expect(page.getByRole('button', { name: 'Tema:' })).toBeVisible();

  /** Varre a tela atual e devolve variante -> maior font-size computado (px). */
  const sweep = async (): Promise<Record<string, number>> =>
    await page.evaluate(() => {
      const dom = globalThis as unknown as RendererDom;
      const out: Record<string, number> = {};
      const skip = ['root', 'gutterBottom', 'noWrap', 'paragraph'];
      const prefix = 'MuiTypography-';
      for (const el of Array.from(dom.document.querySelectorAll('[class*="MuiTypography-"]'))) {
        const variant = Array.from(el.classList)
          .filter((c) => c.startsWith(prefix))
          .map((c) => c.slice(prefix.length))
          .find((c) => !skip.includes(c) && !c.startsWith('align'));
        if (variant == null) continue;
        const size = Number.parseFloat(dom.getComputedStyle(el).fontSize);
        if (!Number.isFinite(size)) continue;
        out[variant] = Math.max(out[variant] ?? 0, size);
      }
      return out;
    });

  const measured: Record<string, number> = { ...(await sweep()) };
  for (const tab of await page.getByRole('tab').all()) {
    await tab.click();
    await page.waitForFunction(
      () =>
        (globalThis as unknown as RendererDom).document.querySelector('[class*="MuiTypography-"]') !=
        null,
    );
    for (const [variant, size] of Object.entries(await sweep())) {
      measured[variant] = Math.max(measured[variant] ?? 0, size);
    }
  }

  // A varredura tem que ter visto de fato o trecho da escala onde a inversão
  // morava — senão o teste passaria vazio.
  for (const required of ['h4', 'h5', 'h6']) {
    expect(
      measured[required] ?? 0,
      `variante ${required} não foi renderizada em nenhuma aba`,
    ).toBeGreaterThan(0);
  }

  // Ordem ESTRITA entre os níveis de título que apareceram.
  const headings = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].filter((v) => measured[v] != null);
  for (let i = 0; i < headings.length - 1; i += 1) {
    const bigger = headings[i]!;
    const smaller = headings[i + 1]!;
    expect(
      measured[bigger],
      `${bigger} (${measured[bigger]}px) tem que ser maior que ${smaller} (${measured[smaller]}px) no app rodando`,
    ).toBeGreaterThan(measured[smaller]!);
  }

  // E nenhum título abaixo do corpo.
  const body1 = measured['body1'];
  if (body1 != null) {
    for (const heading of headings) {
      expect(
        measured[heading],
        `${heading} (${measured[heading]}px) não pode ficar abaixo de body1 (${body1}px)`,
      ).toBeGreaterThanOrEqual(body1);
    }
  }
});
