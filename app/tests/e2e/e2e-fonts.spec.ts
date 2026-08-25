/**
 * e2e-fonts.spec.ts — as três famílias do contrato CARREGARAM no app rodando.
 *
 * ─── O DEFEITO QUE ESTA SPEC EXISTE PARA MORDER ────────────────────────────
 * A onda 1 empacotou Inter, Nunito e JetBrains Mono via @fontsource (arquivos
 * LOCAIS — o renderer roda sob `font-src 'self'` e o app precisa abrir offline)
 * e apontou `FONT_STACK` para elas. Mas `src/fonts.ts` — módulo de efeito
 * colateral, sem exports — não era importado por ninguém. Resultado medido no
 * Electron, largura de canvas da MESMA string a 16px:
 *
 *     "Inter Variable"           223.98
 *     "Nunito Variable"          223.98
 *     "JetBrains Mono Variable"  223.98
 *     "__NoSuchFontZZZ__"        223.98   <- família INEXISTENTE, mesmo valor
 *     system-ui                  245.54
 *
 * Três famílias distintas medindo IGUAL a uma família inventada é a assinatura
 * do fallback silencioso: o navegador não achou nenhuma delas e usou o mesmo
 * default para as quatro. E a suíte inteira passou verde por cima disso, porque
 * nenhum teste olhava para o resultado — só para o objeto de tema.
 *
 * ─── POR QUE MEDIR, E NÃO PERGUNTAR ────────────────────────────────────────
 * `document.fonts.check('16px "X"')` NÃO serve como discriminador: para uma
 * família sem @font-face ele devolve `true` (não há nada a carregar, o sistema
 * "tem" como renderizar caindo no fallback). A pergunta que separa carregado de
 * não-carregado é a MÉTRICA: se 'Inter Variable' desenha a mesma string com a
 * mesma largura de '__NoSuchFontZZZ__', ela não está pintando.
 *
 * Esta spec cruza três evidências independentes:
 *   1. as três famílias existem como FontFace em `document.fonts` — prova que
 *      as @font-face entraram no bundle, ou seja, que o import existe;
 *   2. `document.fonts.load()` resolve com pelo menos uma face por família —
 *      prova que o ARQUIVO carregou (é aqui que uma CSP barrando o .woff2
 *      apareceria, porque a face ficaria em status 'error'/'unloaded');
 *   3. a largura em canvas de cada família DIFERE da família inventada — prova
 *      que o que carregou é realmente usado para desenhar.
 * Nenhuma das três sozinha fecha o caso; as três juntas, sim.
 *
 * Verificado que MORDE: com `import './fonts';` removido de `src/main.tsx` e o
 * app rebuildado, a invariante (1) falha na primeira família (nenhuma FontFace
 * registrada) — ver o handoff da onda.
 *
 * ─── SEGUNDO TESTE: CARREGADA != APLICADA ──────────────────────────────────
 * As três evidências acima olham para o DOCUMENTO (`document.fonts`) e para o
 * CANVAS. Nenhuma delas olha para o ELEMENTO. E existe uma classe inteira de
 * bug que vive exatamente nessa fresta: a fonte está carregada, o canvas a
 * desenha quando pedida pelo nome, e mesmo assim o editor não a usa — porque a
 * regra que deveria aplicá-la ao editor caiu.
 *
 * Foi o que aconteceu. `src/index.css` faz
 *     .cm-editor, .xterm { font: var(--mui-font-code) }
 * e `--mui-font-code` saía do MUI como `14/1.5 'JetBrains Mono Variable', …`.
 * `14` SEM UNIDADE não é <font-size> válido no shorthand `font` (unitless só é
 * length para 0, e app/index.html é standards mode): a declaração inteira era
 * *invalid at computed-value time* e caía EM SILÊNCIO. Medido no Blink do
 * Electron, `.cm-editor` computava family="Inter Variable", size=16px,
 * lh=normal — e `.cm-gutters`, que não declara tamanho próprio e herda de
 * `.cm-editor`, subia de 13px para 16px. Os três testes de `document.fonts`
 * passavam verdes por cima disso, porque a fonte ESTAVA carregada.
 *
 * O segundo teste fecha a fresta: mede o COMPUTED do elemento no app rodando.
 *   - `.cm-editor` e `.xterm`: a família tem que ABRIR em 'JetBrains Mono
 *     Variable' e o tamanho tem que bater com `TYPE.codeSize`;
 *   - `.cm-gutters`: o TAMANHO, que é onde a regressão de 13->16px apareceu;
 *   - `--mui-font-code` em si: o <font-size> tem que trazer unidade.
 *
 * POR QUE `.cm-gutters` NÃO TEM ASSERÇÃO DE FAMÍLIA: a sarjeta mora dentro de
 * `.cm-scroller`, e o base theme do CodeMirror declara
 * `.ͼ1 .cm-scroller { font-family: monospace }` — 0,2,0 de especificidade,
 * contra 0,1,0 da nossa `.cm-editor`. A família de `.cm-scroller`/`.cm-content`
 * /`.cm-gutters` é o `monospace` GENÉRICO do CodeMirror, não a do contrato;
 * quem manda na fonte do TEXTO do editor é a `EditorView.theme` de
 * `src/components/cm/CodeMirrorField.tsx` (mesma coisa do lado do terminal: a
 * opção `fontFamily` do construtor do xterm pinta `.xterm-rows`). Herdado por
 * `.cm-editor`/`.xterm` fica o que este CSS de bootstrap controla — e é só isso
 * que esta spec afirma. Medido: `.cm-gutters` = monospace/14px,
 * `.cm-content` = monospace/16px, `.xterm-rows` = SFMono-Regular…/13px.
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, closeApp, makeWorkspaceRoot } from './helpers';
import { FONT_STACK, TYPE } from '../../src/lib/designTokens';

let app: ElectronApplication | undefined;
let page: Page;

test.afterEach(async () => {
  if (app) await closeApp(app);
});

/** Família inventada: o CONTROLE da medição (nunca resolve, sempre fallback). */
const BOGUS_FAMILY = '__NoSuchFontZZZ__';

/** String de medição — latina, larga o bastante para a diferença aparecer. */
const SPECIMEN = 'Superficie quieta, resposta viva 0123456789';

/**
 * Primeira família de uma stack CSS (`'Inter Variable', 'Inter', ...`). É a
 * ÚNICA que o @fontsource registra; as demais são fallback de sistema, e é
 * justamente para elas que o app caía quando o fio estava partido.
 */
function firstFamily(stack: string): string {
  return stack.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
}

const EXPECTED_FAMILIES = [
  { role: 'display (Nunito — títulos h1..h6)', family: firstFamily(FONT_STACK.display) },
  { role: 'body (Inter — corpo e UI)', family: firstFamily(FONT_STACK.body) },
  { role: 'mono (JetBrains Mono — código e terminal)', family: firstFamily(FONT_STACK.mono) },
];

/**
 * Fatia do DOM usada dentro dos `evaluate`. O tsconfig destes testes é o de
 * NODE (sem `lib: DOM`), porque o processo de teste é Node — mas o corpo do
 * `evaluate` roda no RENDERER, que tem DOM. Declarar a fatia aqui tipa o probe
 * sem mexer no tsconfig (mesmo padrão de `e2e-theme.spec.ts`).
 */
interface RendererFontFace {
  family: string;
  status: string;
  load(): Promise<unknown>;
}

interface RendererCanvasContext {
  font: string;
  measureText(text: string): { width: number };
}

interface RendererComputedStyle {
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
  getPropertyValue(property: string): string;
}

interface RendererDom {
  document: {
    fonts: Iterable<RendererFontFace> & { ready: Promise<unknown> };
    createElement(tag: string): { getContext(kind: string): RendererCanvasContext | null };
    documentElement: unknown;
    querySelector(selector: string): unknown;
  };
  getComputedStyle(element: unknown): RendererComputedStyle;
}

/** O que o probe de computed devolve por seletor (`null` = elemento ausente). */
interface ComputedFont {
  family: string;
  size: string;
  lineHeight: string;
}

test('e2e-fonts: Inter, Nunito e JetBrains Mono carregam de verdade (sem fallback silencioso)', async () => {
  const launched = await launchApp({ env: { E2E_GATE: 'ready' } });
  app = launched.app;
  page = launched.page;

  // App montou (o shell é o mesmo das outras specs).
  await expect(
    page.getByRole('banner').getByText('Study Method — Tutor', { exact: false }),
  ).toBeVisible();

  const families = EXPECTED_FAMILIES.map((f) => f.family);

  /* ─── (1) As @font-face entraram no bundle ──────────────────────────────
   * `document.fonts` só lista uma família se alguma regra @font-face a
   * declarou. Zero ocorrências = `src/fonts.ts` não foi importado (ou o CSS
   * dele não entrou no bundle do renderer). */
  const registered: Record<string, number> = await page.evaluate((wanted: string[]) => {
    const dom = globalThis as unknown as RendererDom;
    const counts: Record<string, number> = {};
    for (const name of wanted) counts[name] = 0;
    for (const face of dom.document.fonts) {
      if (face.family in counts) counts[face.family] += 1;
    }
    return counts;
  }, families);

  for (const { role, family } of EXPECTED_FAMILIES) {
    expect(
      registered[family],
      `nenhuma @font-face de '${family}' (${role}) foi registrada no renderer — ` +
        "sinal de que `import './fonts';` sumiu de src/main.tsx ou de que o CSS " +
        'do @fontsource não entrou no bundle',
    ).toBeGreaterThan(0);
  }

  /* ─── (2) Pelo menos uma face de cada família CARREGOU o arquivo ─────────
   * `face.load()` resolve quando o .woff2 chega. Uma CSP barrando o arquivo
   * (o caso `url(data:…)` contra `font-src 'self'`) deixaria a face em erro e
   * nenhuma delas chegaria a 'loaded'. */
  const loaded: Record<string, number> = await page.evaluate(async (wanted: string[]) => {
    const dom = globalThis as unknown as RendererDom;
    const counts: Record<string, number> = {};
    for (const name of wanted) counts[name] = 0;
    await dom.document.fonts.ready;
    for (const face of dom.document.fonts) {
      if (!(face.family in counts)) continue;
      try {
        await face.load();
      } catch {
        /* face que não carrega fica fora da contagem — é o que queremos ver */
      }
      if (face.status === 'loaded') counts[face.family] += 1;
    }
    return counts;
  }, families);

  for (const { role, family } of EXPECTED_FAMILIES) {
    expect(
      loaded[family],
      `'${family}' (${role}) está declarada mas nenhuma face chegou a 'loaded' — ` +
        'o arquivo .woff2 não carregou (CSP barrando, asset ausente do bundle ou ' +
        'caminho quebrado)',
    ).toBeGreaterThan(0);
  }

  /* ─── (3) O que carregou é o que DESENHA ────────────────────────────────
   * A medição do achado original, virada do avesso: agora cada família tem que
   * medir DIFERENTE da família inventada. */
  const widths: Record<string, number> = await page.evaluate(
    async (probe: { families: string[]; bogus: string; specimen: string }) => {
      const dom = globalThis as unknown as RendererDom;
      await dom.document.fonts.ready;
      const ctx = dom.document.createElement('canvas').getContext('2d');
      if (!ctx) return {};
      const out: Record<string, number> = {};
      for (const name of [...probe.families, probe.bogus]) {
        ctx.font = `16px "${name}"`;
        out[name] = ctx.measureText(probe.specimen).width;
      }
      return out;
    },
    { families, bogus: BOGUS_FAMILY, specimen: SPECIMEN },
  );

  const bogusWidth = widths[BOGUS_FAMILY];
  expect(bogusWidth, 'a medição de controle não produziu largura').toBeGreaterThan(0);

  for (const { role, family } of EXPECTED_FAMILIES) {
    expect(
      widths[family],
      `'${family}' (${role}) mede ${widths[family]}px, o MESMO que a família ` +
        `inventada '${BOGUS_FAMILY}' (${bogusWidth}px): o canvas está desenhando ` +
        'com o fallback, não com a fonte do contrato',
    ).not.toBe(bogusWidth);
  }

  /* As três também têm que diferir ENTRE SI: duas famílias distintas medindo
   * igual seriam o mesmo fallback usado duas vezes. */
  const distinct = new Set(families.map((f) => widths[f]));
  expect(
    distinct.size,
    `as três famílias mediram ${JSON.stringify(families.map((f) => widths[f]))} — ` +
      'valores repetidos indicam que mais de uma caiu no mesmo fallback',
  ).toBe(families.length);
});

/**
 * Lê o `font-family` / `font-size` / `line-height` COMPUTADOS de cada seletor
 * no renderer. `null` quando o elemento não existe — a mensagem de falha
 * distingue "não montou" de "montou com a fonte errada".
 */
async function computedFonts(
  target: Page,
  selectors: string[],
): Promise<Record<string, ComputedFont | null>> {
  return target.evaluate((wanted: string[]) => {
    const dom = globalThis as unknown as RendererDom;
    const out: Record<string, ComputedFont | null> = {};
    for (const selector of wanted) {
      const element = dom.document.querySelector(selector);
      if (!element) {
        out[selector] = null;
        continue;
      }
      const style = dom.getComputedStyle(element);
      out[selector] = {
        family: style.fontFamily,
        size: style.fontSize,
        lineHeight: style.lineHeight,
      };
    }
    return out;
  }, selectors);
}

test('e2e-fonts: a mono do contrato é APLICADA ao editor, à sarjeta e ao terminal', async () => {
  const launched = await launchApp({
    env: { E2E_GATE: 'ready', E2E_WORKSPACE_ROOT: makeWorkspaceRoot() },
  });
  app = launched.app;
  page = launched.page;

  await expect(
    page.getByRole('banner').getByText('Study Method — Tutor', { exact: false }),
  ).toBeVisible();

  /* ─── (0) O VAR em si: <font-size> COM UNIDADE ──────────────────────────
   * Esta é a asserção mais rasa e a que aponta o dedo direto para a causa: se
   * `--mui-font-code` voltar a `14/1.5 '…'`, o shorthand `font` de
   * src/index.css cai inteiro e TODAS as asserções abaixo caem junto — melhor
   * ler o motivo aqui do que deduzi-lo de um `font-family: Inter Variable`. */
  const fontCodeVar = (
    await page.evaluate(() => {
      const dom = globalThis as unknown as RendererDom;
      return dom
        .getComputedStyle(dom.document.documentElement)
        .getPropertyValue('--mui-font-code');
    })
  ).trim();

  expect(
    fontCodeVar,
    `--mui-font-code = "${fontCodeVar}". O MUI monta esse var concatenando ` +
      '`typography.code.fontSize` CRU no shorthand `font` ' +
      '(@mui/system/cssVars/prepareTypographyVars.mjs): com um NÚMERO o ' +
      '<font-size> sai sem unidade, `font: var(--mui-font-code)` é inválido no ' +
      'computed-value time e a declaração de src/index.css cai EM SILÊNCIO. ' +
      'Conserto: `code.fontSize` = `${TYPE.codeSize}px` em src/theme.ts.',
  ).toMatch(/^\d+(?:\.\d+)?(?:px|rem|em|pt|%)\//);

  /* ─── Navega até o Desafio e abre o arquivo (o editor só monta aí) ─────── */
  await page.getByRole('tab', { name: 'Aula' }).click();
  await page.getByLabel('Assunto').fill('Ordenação');
  await page.getByRole('button', { name: 'Gerar aula' }).click();
  await page.getByText('Ordenação (E2E)', { exact: false }).first().click();
  await expect(page.getByRole('heading', { name: 'Desafio E2E: ordenação' })).toBeVisible();
  await page.getByRole('button', { name: 'solution.py', exact: true }).click();
  await expect(page.locator('.cm-editor').first()).toBeVisible();

  const MONO = firstFamily(FONT_STACK.mono);
  const CODE_SIZE = `${TYPE.codeSize}px`;

  const editor = await computedFonts(page, ['.cm-editor', '.cm-gutters']);

  /* ─── (1) `.cm-editor`: família E tamanho ───────────────────────────────
   * É o alvo direto de `.cm-editor { font: var(--mui-font-code) }`. Com o var
   * quebrado media family="Inter Variable" / 16px / lh normal. */
  const cm = editor['.cm-editor'];
  expect(cm, 'o `.cm-editor` não montou — a navegação até o Desafio mudou?').not.toBeNull();
  expect(
    cm && firstFamily(cm.family),
    `.cm-editor computa font-family "${cm?.family}" — a stack tem que ABRIR em ` +
      `'${MONO}'. Se veio 'Inter Variable' (a stack de CORPO), ` +
      '`font: var(--mui-font-code)` de src/index.css caiu inteira: o var é ' +
      `"${fontCodeVar}".`,
  ).toBe(MONO);
  expect(
    cm && cm.size,
    `.cm-editor computa font-size ${cm?.size}, esperado ${CODE_SIZE} ` +
      `(TYPE.codeSize). 16px é o default do <html> aparecendo porque a ` +
      `declaração de fonte caiu; var = "${fontCodeVar}".`,
  ).toBe(CODE_SIZE);

  /* ─── (2) `.cm-gutters`: o TAMANHO — a regressão de 13 -> 16px ──────────
   * A sarjeta não declara `font-size` (nem o base theme do CodeMirror, nem o
   * tema do @uiw): ela HERDA de `.cm-editor`. Quando o shorthand caiu, a
   * numeração de linha pulou de 13px para os 16px do documento sem que nenhum
   * teste reclamasse. A FAMÍLIA dela não é asserida de propósito — ver o
   * cabeçalho: `.ͼ1 .cm-scroller { font-family: monospace }` do CodeMirror
   * ganha por especificidade e é o dono legítimo da fonte do texto. */
  const gutters = editor['.cm-gutters'];
  expect(gutters, 'a sarjeta `.cm-gutters` não montou (números de linha sumiram?)').not.toBeNull();
  expect(
    gutters && gutters.size,
    `.cm-gutters computa font-size ${gutters?.size}, esperado ${CODE_SIZE}. ` +
      'A sarjeta não tem tamanho próprio: ela herda de `.cm-editor`. Se este ' +
      'valor virou 16px, a numeração de linha está no tamanho do documento ' +
      `porque a fonte de código não foi aplicada; var = "${fontCodeVar}".`,
  ).toBe(CODE_SIZE);

  /* ─── (3) `.xterm`: o outro DOM de terceiro da mesma regra ──────────────
   * "Testar resposta" monta o AnswerTerminal. O `.xterm` (raiz) é o elemento
   * que `src/index.css` pinta; `.xterm-rows` é pintado pela opção `fontFamily`
   * do construtor do xterm e não é assunto desta spec. */
  await page.getByRole('button', { name: 'Testar resposta' }).click();
  await expect(page.locator('.xterm').first()).toBeVisible({ timeout: 20_000 });

  const term = (await computedFonts(page, ['.xterm']))['.xterm'];
  expect(term, 'o `.xterm` não montou após "Testar resposta"').not.toBeNull();
  expect(
    term && firstFamily(term.family),
    `.xterm computa font-family "${term?.family}" — a stack tem que ABRIR em ` +
      `'${MONO}'. Mesma causa do editor: as duas superfícies dividem a ÚNICA ` +
      `regra \`.cm-editor, .xterm { font: var(--mui-font-code) }\`; var = "${fontCodeVar}".`,
  ).toBe(MONO);
  expect(
    term && term.size,
    `.xterm computa font-size ${term?.size}, esperado ${CODE_SIZE} (TYPE.codeSize).`,
  ).toBe(CODE_SIZE);
});
