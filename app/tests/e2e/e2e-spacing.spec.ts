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

let app: ElectronApplication | undefined;
let page: Page;

test.afterEach(async () => {
  if (app) await closeApp(app);
});

/**
 * Os QUATRO overrides do SC 1.4.12, verbatim do §4.3 do contrato. Nada além
 * disto pode ser mexido — o critério diz *"and by changing no other style
 * property"*.
 */
const SPACING_OVERRIDES = `
  * {
    line-height: 1.5 !important;
    letter-spacing: 0.12em !important;
    word-spacing: 0.16em !important;
  }
  p { margin-bottom: 2em !important; }
`;

/** Assunto longo e plausível — o que uma aula de verdade coloca no quadro. */
const LONG_SUBJECT = 'Ownership, borrow checker e lifetimes em Rust para quem vem de TypeScript';

/**
 * Fatia do DOM usada dentro de `page.evaluate`. O tsconfig destes testes é o de
 * NODE (`lib: ["ES2022"]`, sem DOM) porque o processo de teste é Node — mas o
 * corpo do `evaluate` roda no RENDERER, que tem DOM. Mesma técnica já usada em
 * `e2e-theme.spec.ts`.
 */
interface RendererRect {
  width: number;
  height: number;
  top: number;
  left: number;
  right: number;
  bottom: number;
}
interface RendererElement {
  tagName: string;
  textContent: string | null;
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
  childNodes: ArrayLike<{ nodeType: number; textContent: string | null }>;
  getBoundingClientRect(): RendererRect;
  querySelectorAll(selector: string): ArrayLike<RendererElement>;
  contains(other: RendererElement): boolean;
}
interface RendererDom {
  document: {
    querySelector(selector: string): RendererElement | null;
    querySelectorAll(selector: string): ArrayLike<RendererElement>;
  };
  getComputedStyle(element: RendererElement): {
    overflowX: string;
    overflowY: string;
    textOverflow: string;
    whiteSpace: string;
    display: string;
    visibility: string;
  };
}

/** O que o probe devolve — listas de VIOLAÇÕES, já legíveis na mensagem de erro. */
interface SpacingReport {
  /** Elementos varridos com caixa visível (guarda contra varredura vazia). */
  sampled: number;
  /** Recorte: reticências, ou conteúdo maior que a caixa num eixo que não é visible. */
  clipped: string[];
  /** Conteúdo que saiu da caixa do cabeçalho (some atrás do rail / do conteúdo). */
  outside: string[];
  /** Pares de folhas de texto cujas caixas se cruzam (texto sobre texto). */
  overlaps: string[];
}

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
  const report = await page.evaluate((): SpacingReport => {
    const dom = globalThis as unknown as RendererDom;
    // `<header>` (papel banner IMPLÍCITO — ver a nota na semeadura acima).
    const banner = dom.document.querySelector('header, [role="banner"]');
    if (banner == null) throw new Error('cabeçalho (header / role="banner") não encontrado');
    const bannerRect = banner.getBoundingClientRect();

    const label = (el: RendererElement): string =>
      `<${el.tagName.toLowerCase()}> "${(el.textContent ?? '').trim().slice(0, 48)}"`;

    /** Elemento com texto PRÓPRIO (nó de texto direto não vazio). */
    const hasOwnText = (el: RendererElement): boolean =>
      Array.from(el.childNodes).some(
        (n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '',
      );

    const clipped: string[] = [];
    const outside: string[] = [];
    const overlaps: string[] = [];
    const leaves: RendererElement[] = [];
    let sampled = 0;

    for (const el of Array.from(banner.querySelectorAll('*'))) {
      const cs = dom.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      sampled += 1;

      // (a) Reticências: F104, causa nº 1. Não pode existir no cabeçalho.
      if (cs.textOverflow === 'ellipsis') {
        clipped.push(`${label(el)} tem text-overflow: ellipsis`);
      }
      // (b) Conteúdo maior que a caixa num eixo que RECORTA (hidden/auto/scroll).
      //     1px de tolerância para o arredondamento sub-pixel do Blink.
      if (cs.overflowX !== 'visible' && el.scrollWidth > el.clientWidth + 1) {
        clipped.push(
          `${label(el)} recorta no eixo inline (scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}, overflow-x: ${cs.overflowX})`,
        );
      }
      if (cs.overflowY !== 'visible' && el.scrollHeight > el.clientHeight + 1) {
        clipped.push(
          `${label(el)} recorta no eixo de bloco (scrollHeight ${el.scrollHeight} > clientHeight ${el.clientHeight}, overflow-y: ${cs.overflowY})`,
        );
      }
      // (c) Saiu da faixa: o cabeçalho não recorta, mas o que passa da borda
      //     fica ATRÁS do rail / do conteúdo — perda de conteúdo igual.
      if (
        rect.left < bannerRect.left - 1 ||
        rect.right > bannerRect.right + 1 ||
        rect.top < bannerRect.top - 1 ||
        rect.bottom > bannerRect.bottom + 1
      ) {
        outside.push(
          `${label(el)} escapa do cabeçalho (caixa ${Math.round(rect.left)}..${Math.round(rect.right)} x ${Math.round(rect.top)}..${Math.round(rect.bottom)} contra ${Math.round(bannerRect.left)}..${Math.round(bannerRect.right)} x ${Math.round(bannerRect.top)}..${Math.round(bannerRect.bottom)})`,
        );
      }

      if (hasOwnText(el)) leaves.push(el);
    }

    // (d) Texto sobre texto. Só entre folhas de texto que NÃO se contêm.
    for (let i = 0; i < leaves.length; i += 1) {
      for (let j = i + 1; j < leaves.length; j += 1) {
        const a = leaves[i] as RendererElement;
        const b = leaves[j] as RendererElement;
        if (a.contains(b) || b.contains(a)) continue;
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        const dx = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const dy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (dx > 1 && dy > 1) {
          overlaps.push(`${label(a)} sobrepõe ${label(b)} (${Math.round(dx)}x${Math.round(dy)}px)`);
        }
      }
    }

    return { sampled, clipped, outside, overlaps };
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
