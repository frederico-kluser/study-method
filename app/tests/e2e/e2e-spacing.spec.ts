/**
 * e2e-spacing.spec.ts — RESILIÊNCIA DE ESPAÇAMENTO, SC 1.4.12 (AA, normativo).
 *
 * O §4.3 do contrato (docs/ux-redesign.md) é literal: o critério **não** manda
 * adotar os valores, manda SOBREVIVER a eles — *"no loss of content or
 * functionality occurs by setting all of the following and by changing no other
 * style property"*. Os quatro overrides são injetados aqui exatamente como o
 * contrato os escreve, e a asserção é geométrica, no app RODANDO: nada recorta,
 * nada escapa da faixa, nada se sobrepõe.
 *
 * ─── ESCOPO DESTA SPEC: O QUADRO DE ESTADO DA SESSÃO (o cabeçalho) ─────────
 * Cobre `role="banner"` — título do app + `SessionFrame` + toggle de tema +
 * seletor de idioma. É deliberadamente PARCIAL: o §4.3 pede a PÁGINA INTEIRA
 * (chips, gutter do CodeMirror, contadores, verdict do desafio), e essa
 * varredura pertence à onda 4. O que está coberto aqui é o cabeçalho, porque foi
 * nele que a onda 2 introduziu superfície de truncamento (`noWrap` +
 * `maxWidth: '32ch'` nos valores do quadro) — a causa nº 1 da F104.
 *
 * O que esta spec NÃO cobre: ela roda na HOME, na largura inicial do sidebar e
 * com o slot da view ativa VAZIO (`#shell-sidebar-view-slot`, `display: none`
 * quando vazio). O cabeçalho da AULA que a LessonView publica nesse slot
 * (LessonSidebarHeader) — no piso de 180px da divisória, sob os mesmos quatro
 * overrides, nos dois idiomas e na altura mínima da janela — é medido em
 * tests/e2e/e2e-sidebar-aula-spacing.spec.ts, com a mesma varredura
 * (./spacingScan) mais os ajustes de geometria que aquela spec documenta
 * (coluna que rola, recortes de desenho do MUI). Aqui a varredura roda com as
 * opções PADRÃO — a medida desta spec não mudou com a extração.
 *
 * ─── POR QUE O VALOR DO QUADRO É SEMEADO PELO DOM ──────────────────────────
 * O `SessionStateProvider` já está montado, mas quem PUBLICA assunto e fase é a
 * LessonView, e essa ligação é da ONDA 3 — hoje o quadro só mostra os
 * placeholders curtos ("Nenhum assunto ainda"), que passariam no teste mesmo com
 * o `noWrap` de volta. Semear um assunto longo e real direto no nó de texto é o
 * que faz a asserção MORDER: é o container que está sendo testado, não o
 * caminho de dados. Quando a onda 3 ligar a publicação, trocar a semeadura por
 * um `publishSession` real é uma linha.
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, closeApp } from './helpers';
// A metodologia (os quatro overrides + a varredura) mora em ./spacingScan desde
// que o cabeçalho da aula passou a morar no sidebar: esta spec e a
// e2e-sidebar-aula-spacing medem com a MESMA régua. Aqui ela roda com as
// opções PADRÃO (faixa = a raiz, limite = a caixa visível nos dois eixos) —
// exatamente a medida que esta spec sempre fez.
import { SPACING_OVERRIDES, scanSpacing, type RendererDom } from './spacingScan';

let app: ElectronApplication | undefined;
let page: Page;

test.afterEach(async () => {
  if (app) await closeApp(app);
});

/** Assunto longo e plausível — o que uma aula de verdade coloca no quadro. */
const LONG_SUBJECT = 'Ownership, borrow checker e lifetimes em Rust para quem vem de TypeScript';

test('e2e-spacing: o quadro de sessão sobrevive aos quatro overrides do SC 1.4.12 (nada trunca, nada sobrepõe)', async () => {
  const launched = await launchApp({ env: { E2E_GATE: 'ready' } });
  app = launched.app;
  page = launched.page;

  const banner = page.getByRole('banner');
  await expect(banner).toBeVisible();
  // O quadro de estado (role="status") tem que estar montado ANTES — é a mesma
  // condição do SC 4.1.3 que o SessionFrame já cumpre.
  const frame = banner.getByRole('status');
  await expect(frame).toBeVisible();

  // 1) Semeia um assunto longo no valor do campo (ver o cabeçalho desta spec).
  await page.evaluate((subject: string) => {
    const dom = globalThis as unknown as RendererDom;
    // O AppBar do MUI renderiza `<header>`, cujo papel `banner` é IMPLÍCITO —
    // não existe atributo `role="banner"` no DOM (o `getByRole` do Playwright lê
    // a árvore de acessibilidade; um seletor CSS não). Daí `header` no seletor.
    const status = dom.document.querySelector(
      'header [role="status"], [role="banner"] [role="status"]',
    );
    if (status == null) throw new Error('quadro de sessão (role="status") não encontrado');
    // Estrutura do SessionField: <Box><span rótulo/><span valor/></Box>. O valor
    // é o ÚLTIMO span de cada campo.
    const spans = Array.from(status.querySelectorAll('span'));
    const value = spans[1];
    if (value == null) throw new Error('valor do campo de assunto não encontrado');
    value.textContent = subject;
  }, LONG_SUBJECT);

  await expect(frame).toContainText(LONG_SUBJECT);

  // 2) Injeta os quatro overrides do critério — e NADA além deles.
  await page.addStyleTag({ content: SPACING_OVERRIDES });
  // Um frame para o layout assentar com o CSS novo.
  await page.waitForTimeout(150);

  // 3) Mede. A varredura é do cabeçalho inteiro, não só do campo semeado.
  //    `<header>` (papel banner IMPLÍCITO — ver a nota na semeadura acima). A
  //    faixa é o próprio cabeçalho, limitado pela caixa visível nos dois eixos
  //    (as opções padrão de `scanSpacing`).
  const report = await page.evaluate(scanSpacing, {
    root: 'header, [role="banner"]',
    rootMissing: 'cabeçalho (header / role="banner") não encontrado',
    bandPhrase: 'do cabeçalho',
  });

  // Guarda contra varredura vazia: um cabeçalho sem elementos passaria em tudo.
  expect(report.sampled, 'a varredura tem que ter visto o cabeçalho de fato').toBeGreaterThan(5);

  expect(
    report.clipped,
    `SC 1.4.12: nada no cabeçalho pode truncar sob os overrides — ${report.clipped.join(' | ')}`,
  ).toEqual([]);
  expect(
    report.outside,
    `SC 1.4.12: nada pode escapar da faixa do cabeçalho — ${report.outside.join(' | ')}`,
  ).toEqual([]);
  expect(
    report.overlaps,
    `SC 1.4.12: nada pode se sobrepor sob os overrides — ${report.overlaps.join(' | ')}`,
  ).toEqual([]);

  // E o assunto longo continua INTEIRO na tela (não só no DOM): o texto visível
  // é o texto completo, sem reticências no meio.
  const rendered = await frame.textContent();
  expect(rendered ?? '').toContain(LONG_SUBJECT);
});
