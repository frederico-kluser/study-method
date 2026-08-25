/**
 * e2e-code-theme.spec.ts — editor CodeMirror e terminal xterm SEGUEM o tema.
 *
 * ─── O QUE ESTA SPEC SUBSTITUIU ───────────────────────────────────────────
 * Era `e2e-dracula.spec.ts`, e provava que os dois pintavam `#282a36` — o fundo
 * Dracula, FIXO nos dois esquemas do app. A `docs/ux-redesign.md` §7.4 declara
 * isso um defeito (editor preto dentro de um app claro) e o quebra de propósito.
 * O que a spec prova agora é ESTRITAMENTE MAIS FORTE: além da coerência
 * editor ⇄ terminal que o arranjo Dracula já tinha, ela exige POLARIDADE — que
 * os dois pintem CLARO no tema claro e ESCURO no tema escuro.
 *
 * ─── AS SEIS AFIRMAÇÕES ───────────────────────────────────────────────────
 *  1. **Polaridade, medida e não declarada.** A superfície do editor no tema
 *     claro tem luminância relativa ALTA e, no escuro, BAIXA. Isto é o que
 *     falha se alguém religar um tema de polaridade única: uma asserção contra
 *     hex constante passaria feliz se o app inteiro virasse escuro.
 *  2. **Mesma fonte de verdade.** O fundo computado do `.cm-editor` e o do
 *     <Paper> do terminal são IGUAIS entre si, nos dois esquemas — a propriedade
 *     boa que o Dracula tinha e que o redesign preserva.
 *  3. **O contrato de `codeTheme.ts` chega à tela.** Os valores são importados
 *     de `src/lib/codeTheme` (não copiados à mão): a spec falha se o produto
 *     divergir do contrato, e não pode "passar por acidente" com um hex velho.
 *  4. **O terminal repinta o que JÁ ESTAVA IMPRESSO.** O "PASSOU" do banner é
 *     escrito com SGR truecolor ABSOLUTO; trocar `options.theme` não desfaz um
 *     `38;2;r;g;b` que já está no scrollback. A spec roda os testes no tema
 *     claro, troca para escuro e exige que a MESMA linha passe a ter o verde do
 *     esquema escuro — é a única verificação possível da armadilha 3 do
 *     `AnswerTerminal.tsx` (a decisão de REIMPRIMIR em vez de limpar).
 *  5. **A TIPOGRAFIA do código é a mesma nos dois** — família E corpo, do
 *     contrato único `codeTypography()`. Medida no app rodando. No terminal
 *     isso NÃO é redundante com o `index.css`: o DomRenderer do xterm injeta
 *     `<seletor> .xterm-rows { font-family: …; font-size: <options.fontSize>px }`,
 *     mais específico que qualquer `.xterm` de folha global — regra de CSS
 *     nenhuma governa a tipografia do terminal, só as opções do construtor.
 *     A família é a parte que mais silenciosamente divergia: a pilha antiga do
 *     terminal omitia a `'JetBrains Mono Variable'` (a única empacotada), então
 *     ele caía no `monospace` do sistema enquanto o editor usava a fonte real —
 *     e enquanto nenhuma fonte carregava, os dois pareciam iguais.
 *  6. **O `.xterm-viewport` segue a superfície do esquema.** `xterm.css` pinta
 *     esse elemento de `#000` e o xterm aplica o tema INLINE apenas no
 *     scrollable element, que cobre só a content box; o viewport é
 *     `position: absolute` com inset 0, então o padding lateral do `.xterm`
 *     vazava PRETO PURO nas bordas. Contra o Dracula #282a36 isso era
 *     invisível; contra o papel #f3eee5 é uma moldura preta. Medir o <Paper>
 *     ou a cor dos <span> das rows NÃO pega isso — só medir o viewport pega.
 *
 * Modo stub determinístico (E2E_GATE='ready', janela oculta). A polaridade é
 * forçada pelo toggle da AppBar: o modo default é 'system' (nada em
 * `localStorage['theme-mode']`), e o primeiro clique cai SEMPRE em 'light' —
 * o mesmo ciclo que `e2e-theme.spec.ts` documenta. Nada aqui depende do tema do
 * SO da máquina que roda o teste.
 */
import { test, expect, type ElectronApplication, type Page, type Locator } from '@playwright/test';
import { launchApp, closeApp, makeWorkspaceRoot } from './helpers';
import {
  codeMirrorSettings,
  codePalette,
  codeTypography,
  hexToRgb,
} from '../../src/lib/codeTheme';

let app: ElectronApplication | undefined;
let page: Page;
let wsRoot: string | undefined;

test.beforeEach(() => {
  wsRoot = makeWorkspaceRoot();
});

test.afterEach(async () => {
  if (app) await closeApp(app);
  app = undefined;
});

/** `#rrggbb` → a forma `rgb(r, g, b)` que o `getComputedStyle` devolve. */
function cssRgb(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Luminância relativa (WCAG 2.x) de uma cor `rgb(r, g, b)` lida do DOM.
 * Serve à afirmação 1: polaridade MEDIDA. Um tema de polaridade única passa em
 * qualquer asserção de igualdade e falha aqui.
 */
function relativeLuminance(rgb: string): number {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb);
  if (!m) throw new Error(`cor não parseável: "${rgb}"`);
  const lin = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(Number(m[1])) + 0.7152 * lin(Number(m[2])) + 0.0722 * lin(Number(m[3]));
}

/**
 * Fatia do DOM do renderer usada dentro dos `page.evaluate`. O tsconfig destes
 * testes é o de NODE (`lib: ["ES2022"]`, sem DOM) porque o processo de teste é
 * Node — mas o corpo do `evaluate` roda no RENDERER, que tem DOM. Mesmo padrão
 * do `RendererDom` de `e2e-theme.spec.ts`.
 */
interface RendererDom {
  document: {
    querySelectorAll(selector: string): ArrayLike<{ textContent: string | null }>;
  };
  getComputedStyle(element: unknown): { color: string };
}

/**
 * Cor computada do PRIMEIRO elemento cujo texto contém `needle`, dentro de
 * `selector`. É assim que se lê o que o xterm (renderer DOM: cada corrida de
 * estilo vira um <span> com `color` inline) e o CodeMirror realmente pintaram.
 */
async function colorOfTextIn(
  target: Page,
  selector: string,
  needle: string,
): Promise<string | null> {
  return await target.evaluate(
    ({ sel, text }: { sel: string; text: string }) => {
      const dom = globalThis as unknown as RendererDom;
      for (const el of Array.from(dom.document.querySelectorAll(sel))) {
        if ((el.textContent ?? '').includes(text)) {
          return dom.getComputedStyle(el).color;
        }
      }
      return null;
    },
    { sel: selector, text: needle },
  );
}

/**
 * `font-family` computada de um locator, SEM as aspas. O Chromium re-serializa
 * a lista com as aspas dele (e sem elas onde o nome é um identificador CSS
 * válido), então comparar a string crua com a do contrato compararia estilo de
 * aspas, não fonte. Tirar as aspas dos dois lados compara o que importa.
 */
async function fontFamilyOf(locator: Locator): Promise<string> {
  const raw = await locator.evaluate((el) =>
    (
      globalThis as unknown as { getComputedStyle(e: unknown): { fontFamily: string } }
    ).getComputedStyle(el).fontFamily,
  );
  return raw.replace(/['"]/g, '');
}

/** Fundo computado de um locator. */
async function backgroundOf(locator: Locator): Promise<string> {
  return await locator.evaluate((el) =>
    (
      globalThis as unknown as { getComputedStyle(e: unknown): { backgroundColor: string } }
    ).getComputedStyle(el).backgroundColor,
  );
}

test('e2e-code-theme: editor e terminal pintam CLARO no tema claro e ESCURO no escuro, da mesma paleta', async () => {
  const launched = await launchApp({
    env: { E2E_GATE: 'ready', E2E_WORKSPACE_ROOT: wsRoot! },
  });
  app = launched.app;
  page = launched.page;

  await expect(
    page.getByRole('banner').getByText('Study Method — Tutor', { exact: false }),
  ).toBeVisible();

  const toggle = page.getByRole('button', { name: 'Tema:' });
  const html = page.locator('html');
  const editor = page.locator('.cm-editor').first();
  const terminalPaper = page
    .locator('[data-onboarding-target="challenge-terminal"] .MuiPaper-root')
    .first();

  // ── Polaridade CLARA, sem depender do tema do SO ────────────────────────
  // Default = 'system' (nada salvo) → o primeiro clique cai em 'light'.
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(html).toHaveClass(/light/);
  expect(await page.evaluate(() => localStorage.getItem('theme-mode'))).toBe('light');

  // ── Chega ao Desafio e abre o arquivo (o editor só monta com aba ativa) ──
  await page.getByRole('tab', { name: 'Aula' }).click();
  await page.getByLabel('Assunto').fill('Ordenação');
  await page.getByRole('button', { name: 'Gerar aula' }).click();
  await page.getByText('Ordenação (E2E)', { exact: false }).first().click();
  await expect(page.getByRole('heading', { name: 'Desafio E2E: ordenação' })).toBeVisible();
  await page.getByRole('button', { name: 'solution.py', exact: true }).click();
  await expect(editor).toBeVisible();

  const light = codePalette('light');
  const dark = codePalette('dark');

  // AFIRMAÇÃO 3 — o cromo do editor é o do contrato (nível 2 da rampa clara).
  await expect(editor).toHaveCSS('background-color', cssRgb(light.chrome.surface));
  await expect(editor).toHaveCSS('color', cssRgb(light.chrome.ink));

  // AFIRMAÇÃO 5 — o corpo é `TYPE.codeSize`, medido NO APP RODANDO.
  // O `createTheme` do `@uiw/codemirror-themes` aplica `settings.fontSize` no
  // seletor `&`, que o CodeMirror expande para UMA classe gerada (`.ͼN`) —
  // mesma especificidade de um `.cm-editor` global, e o style-mod injeta a
  // folha dele no TOPO do <head>, ou seja ANTES do `index.css`. Num empate de
  // especificidade quem vem depois vence, então uma regra global de `font-size`
  // em `.cm-editor` derrotaria o token EM SILÊNCIO. Só a medição pega isso.
  await expect(page.locator('.cm-content').first()).toHaveCSS(
    'font-size',
    codeMirrorSettings('light').fontSize,
  );

  // AFIRMAÇÃO 3 — a PONTE de sintaxe existe: o comentário de solution.py
  // ('# Implemente sua solução aqui (E2E stub)') recebe `syntax.comment`.
  // Se o mapa de tags do CodeMirrorField sumir, isto cai para a tinta padrão.
  await expect
    .poll(() => colorOfTextIn(page, '.cm-content span', 'Implemente sua solução'), {
      timeout: 10_000,
    })
    .toBe(cssRgb(light.syntax.comment));

  // AFIRMAÇÃO 1 — polaridade MEDIDA: a superfície clara é mesmo clara.
  const editorLightBg = await backgroundOf(editor);
  expect(relativeLuminance(editorLightBg)).toBeGreaterThan(0.5);

  // ── Terminal: roda os testes determinísticos e mede o que foi pintado ───
  await page.getByRole('button', { name: 'Testar resposta' }).click();
  await expect(terminalPaper).toBeVisible();
  await expect(terminalPaper).toHaveCSS('background-color', cssRgb(light.chrome.surface), {
    timeout: 15_000,
  });

  // AFIRMAÇÃO 6 — o viewport do xterm, e não só o <Paper> em volta dele.
  // Sem a sobrescrita no `sx` do AnswerTerminal isto lê `rgb(0, 0, 0)`.
  await expect(page.locator('.xterm-viewport')).toHaveCSS(
    'background-color',
    cssRgb(light.chrome.surface),
  );

  // AFIRMAÇÃO 5 — a tipografia do TERMINAL é a do contrato. As regras que
  // vencem aqui são as que o DomRenderer injeta a partir de `options.fontSize`
  // e `options.fontFamily` (em `.xterm-rows`, mais específicas que `.xterm`),
  // então isto falha se o construtor voltar a fixar valores literais.
  const rows = page.locator('.xterm-rows');
  await expect(rows).toHaveCSS('font-size', codeTypography().fontSize);
  expect(await fontFamilyOf(rows)).toBe(codeTypography().fontFamily.replace(/['"]/g, ''));

  // …e é a MESMA que a do editor, medida na tela. O `.cm-scroller` é onde o
  // `createTheme` do `@uiw/codemirror-themes` põe `settings.fontFamily`
  // (seletor `&.cm-editor .cm-scroller`); o `.cm-content` herda dele. Se um dos
  // dois lados voltar a escrever a própria pilha à mão, esta igualdade cai.
  expect(await fontFamilyOf(rows)).toBe(await fontFamilyOf(page.locator('.cm-scroller').first()));

  // AFIRMAÇÃO 3 — o banner PASSOU sai no verde de ESTADO do esquema claro
  // (o stub determinístico sempre passa: e2eStubs.testAnswer → passed:true).
  await expect
    .poll(() => colorOfTextIn(page, '.xterm-rows span', 'PASSOU'), { timeout: 20_000 })
    .toBe(cssRgb(light.state.success));

  // AFIRMAÇÃO 2 — editor e terminal leem a MESMA fonte de verdade.
  expect(await backgroundOf(terminalPaper)).toBe(editorLightBg);

  // ── Toggle → ESCURO. Tudo tem que virar, inclusive o que já está na tela ─
  await toggle.click();
  await expect(html).toHaveClass(/dark/);

  await expect(editor).toHaveCSS('background-color', cssRgb(dark.chrome.surface));
  await expect(editor).toHaveCSS('color', cssRgb(dark.chrome.ink));
  await expect
    .poll(() => colorOfTextIn(page, '.cm-content span', 'Implemente sua solução'), {
      timeout: 10_000,
    })
    .toBe(cssRgb(dark.syntax.comment));

  const editorDarkBg = await backgroundOf(editor);
  // AFIRMAÇÃO 1 — polaridade MEDIDA na outra ponta.
  expect(relativeLuminance(editorDarkBg)).toBeLessThan(0.1);

  await expect(terminalPaper).toHaveCSS('background-color', cssRgb(dark.chrome.surface));
  expect(await backgroundOf(terminalPaper)).toBe(editorDarkBg);

  // AFIRMAÇÃO 6 na outra polaridade — o viewport acompanha o toggle.
  await expect(page.locator('.xterm-viewport')).toHaveCSS(
    'background-color',
    cssRgb(dark.chrome.surface),
  );

  // AFIRMAÇÃO 4 — a linha JÁ IMPRESSA foi REIMPRESSA na paleta nova. Sem o
  // efeito de repintura do AnswerTerminal (armadilha 3), este `PASSOU`
  // continuaria em rgb(25, 105, 65) — o verde calibrado para papel — sobre o
  // well escuro.
  await expect
    .poll(() => colorOfTextIn(page, '.xterm-rows span', 'PASSOU'), { timeout: 15_000 })
    .toBe(cssRgb(dark.state.success));

  // E a saída determinística do stub continua lá: repintar não pode apagar
  // o trabalho do usuário.
  await expect(page.locator('.xterm-rows')).toContainText('2 passed in 0.01s');
});
