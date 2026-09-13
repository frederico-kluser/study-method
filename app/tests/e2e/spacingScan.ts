/**
 * tests/e2e/spacingScan.ts — a METODOLOGIA do SC 1.4.12 (resiliência de
 * espaçamento, AA) compartilhada pelas specs que a medem no app RODANDO.
 *
 * Extraída de tests/e2e/e2e-spacing.spec.ts SEM mudança de comportamento: com
 * as opções padrão, os mesmos quatro overrides, as mesmas quatro medidas, as
 * mesmas tolerâncias e as mesmas mensagens de antes. Existe para que a spec do
 * quadro de sessão (Home, slot vazio) e a do cabeçalho da aula no sidebar
 * (tests/e2e/e2e-sidebar-aula-spacing.spec.ts) meçam com a MESMA régua — duas
 * cópias da varredura derivariam, e uma delas passaria a aprovar o que a outra
 * reprova.
 *
 * ─── AS QUATRO MEDIDAS (por elemento com caixa visível, dentro da RAIZ) ────
 *   (a) `text-overflow: ellipsis` computado — a causa nº 1 da F104;
 *   (b) conteúdo maior que a caixa num eixo que RECORTA (overflow ≠ visible):
 *       `scrollWidth > clientWidth` / `scrollHeight > clientHeight`;
 *   (c) caixa que ESCAPA da FAIXA (a caixa que nada pode deixar): o que passa
 *       da borda some atrás do vizinho, ou é recortado por ela;
 *   (d) folhas de texto (elementos com nó de texto próprio) que se cruzam —
 *       texto sobre texto.
 * 1px de tolerância em tudo, para o arredondamento sub-pixel do Blink.
 *
 * ─── AS EXTENSÕES OPCIONAIS (todas desligadas por padrão) ──────────────────
 * O e2e-spacing mede o quadro de sessão da Home: uma faixa que NÃO rola, sem
 * componente nenhum que desenhe fora da própria caixa. Lá, "caixa do elemento"
 * é uma aproximação exata do que está pintado. O sidebar com o cabeçalho da
 * aula dentro é outra geometria, e cada opção abaixo existe por uma medida
 * feita no app rodando (tests/e2e/e2e-sidebar-aula-spacing.spec.ts):
 *
 *   · `blockAxis: 'scroll'` — no eixo de BLOCO o limite deixa de ser a caixa
 *     visível da faixa e passa a ser a extensão ROLÁVEL dela: o sidebar rola no
 *     eixo de bloco por desenho (`overflowY: 'auto'` do SessionFrame), e o que
 *     está abaixo da dobra não se perdeu. No eixo INLINE nada muda.
 *
 *   · `checkBand: true` — mede também a PRÓPRIA faixa pela régua (b). Com
 *     `overflow-x: hidden` na faixa, qualquer descendente que estoure a largura
 *     vira `scrollWidth > clientWidth` NELA — inclusive o que só escapa para
 *     baixo de uma barra de rolagem clássica, que a régua (c) não enxerga. No
 *     eixo de bloco a faixa só é medida com `blockAxis: 'box'` (numa faixa que
 *     rola, `scrollHeight > clientHeight` é o desenho, não perda).
 *
 *   · `paintedBox: true` — a régua (c) mede a caixa PINTADA: a caixa do
 *     elemento cortada pelos ancestrais que recortam (overflow ≠ visible) ENTRE
 *     ele e a faixa. Motivo medido: o `LinearProgress` determinado desenha o
 *     preenchimento com `translateX(valor − 100%)` dentro de uma trilha com
 *     `overflow: hidden` — a 0% a caixa do preenchimento fica INTEIRA à
 *     esquerda da trilha (e da faixa), a 50% metade dela; o que o aluno vê é só
 *     a parte dentro da trilha. Pela caixa crua a régua (c) reprovaria toda
 *     aula abaixo de ~92% de progresso. Em troca, esta opção é MAIS estrita com
 *     texto: folha de texto recortada por QUALQUER um desses ancestrais (em
 *     qualquer direção — inclusive a esquerda/cima, que o `scrollWidth` de (b)
 *     não conta) vira violação de recorte. Sem ancestral que recorte, a caixa
 *     pintada É a caixa do elemento e (c) mede exatamente como antes.
 *
 *   · `textBoxes: true` — a régua (d) compara as caixas de LINHA do texto
 *     PRÓPRIO de cada folha (`Range.getClientRects()` dos nós de texto), não a
 *     caixa do elemento. Motivo medido: a bolha do `Badge` fica, por desenho,
 *     centrada no canto superior direito do botão que ela ancora — as caixas
 *     de ELEMENTO se cruzam ~10×10px, mas o que a bolha cobre é o padding e a
 *     borda do botão: o rótulo termina 13px antes da borda (12px de padding +
 *     1px de borda) e a bolha de um algarismo só entra 10px. "Texto sobre
 *     texto" é glifo sobre glifo; e a caixa de linha ainda pega o que a caixa
 *     do elemento deixa passar (texto que transborda uma caixa de altura fixa
 *     por cima do vizinho — o F104 clássico).
 *
 * ─── POR QUE AS INTERFACES `Renderer*` ─────────────────────────────────────
 * O tsconfig destes testes é o de NODE (`lib: ["ES2022"]`, sem DOM) porque o
 * processo de teste é Node — mas o corpo do `page.evaluate` roda no RENDERER,
 * que tem DOM. As interfaces abaixo são a fatia do DOM que a varredura usa
 * (mesma técnica de `e2e-theme.spec.ts`).
 *
 * ─── REGRA DE OURO DE `scanSpacing` ────────────────────────────────────────
 * Ela é passada POR VALOR para `page.evaluate(scanSpacing, opts)`: o Playwright
 * serializa o texto da função e o avalia no renderer. Logo, o corpo dela não
 * pode citar NADA do escopo deste módulo (nenhuma constante, nenhum import) —
 * tudo o que ela usa chega em `opts` ou vive dentro dela.
 */

/**
 * Os QUATRO overrides do SC 1.4.12, verbatim do §4.3 do contrato
 * (docs/ux-redesign.md). Nada além disto pode ser mexido — o critério diz
 * *"and by changing no other style property"*.
 */
export const SPACING_OVERRIDES = `
  * {
    line-height: 1.5 !important;
    letter-spacing: 0.12em !important;
    word-spacing: 0.16em !important;
  }
  p { margin-bottom: 2em !important; }
`;

/** Fatia de `DOMRect` usada pela varredura. */
export interface RendererRect {
  width: number;
  height: number;
  top: number;
  left: number;
  right: number;
  bottom: number;
}

/** Fatia de `Node` usada pela varredura (os nós de texto de uma folha). */
export interface RendererNode {
  nodeType: number;
  textContent: string | null;
}

/** Fatia de `Element` usada pela varredura. */
export interface RendererElement {
  tagName: string;
  textContent: string | null;
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
  scrollTop: number;
  clientTop: number;
  clientLeft: number;
  parentElement: RendererElement | null;
  childNodes: ArrayLike<RendererNode>;
  getBoundingClientRect(): RendererRect;
  querySelectorAll(selector: string): ArrayLike<RendererElement>;
  contains(other: RendererElement): boolean;
}

/** Fatia de `Range` usada pela varredura (caixas de linha de um nó de texto). */
export interface RendererRange {
  selectNodeContents(node: RendererNode): void;
  getClientRects(): ArrayLike<RendererRect>;
}

/** Fatia de `window` usada pela varredura. */
export interface RendererDom {
  document: {
    querySelector(selector: string): RendererElement | null;
    querySelectorAll(selector: string): ArrayLike<RendererElement>;
    createRange(): RendererRange;
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

/** O que a varredura devolve — listas de VIOLAÇÕES, já legíveis na mensagem de erro. */
export interface SpacingReport {
  /** Elementos varridos com caixa visível (guarda contra varredura vazia). */
  sampled: number;
  /** Recorte: reticências, ou conteúdo maior que a caixa num eixo que não é visible. */
  clipped: string[];
  /** Conteúdo que saiu da caixa da faixa (some atrás do vizinho / é recortado). */
  outside: string[];
  /** Pares de folhas de texto que se cruzam (texto sobre texto). */
  overlaps: string[];
}

/** Onde e contra o quê medir. */
export interface SpacingScanOptions {
  /** Seletor da RAIZ: TODO descendente dela é medido (a raiz em si, não). */
  readonly root: string;
  /** Mensagem do erro quando a raiz não existe na página. */
  readonly rootMissing: string;
  /** Seletor da FAIXA — a caixa que nada pode deixar. Padrão: a própria raiz. */
  readonly band?: string;
  /** Mensagem do erro quando a faixa não existe (só com `band`). */
  readonly bandMissing?: string;
  /** Complemento de "escapa …" na mensagem de (c) — ex.: 'do cabeçalho'. */
  readonly bandPhrase: string;
  /** Rótulo da faixa nas mensagens de `checkBand` — ex.: 'o sidebar'. */
  readonly bandName?: string;
  /**
   * Limite no eixo de BLOCO: 'box' (padrão) = a caixa visível da faixa;
   * 'scroll' = a extensão rolável dela (ver o cabeçalho do arquivo).
   */
  readonly blockAxis?: 'box' | 'scroll';
  /** Mede também a própria faixa pela régua (b) (ver o cabeçalho do arquivo). */
  readonly checkBand?: boolean;
  /** (c) sobre a caixa PINTADA + texto recortado por ancestral (ver o cabeçalho). */
  readonly paintedBox?: boolean;
  /** (d) sobre as caixas de LINHA do texto próprio (ver o cabeçalho do arquivo). */
  readonly textBoxes?: boolean;
}

/**
 * A varredura. Roda NO RENDERER, via `page.evaluate(scanSpacing, opts)` —
 * auto-contida por construção (ver "REGRA DE OURO" no cabeçalho do arquivo).
 */
export function scanSpacing(opts: SpacingScanOptions): SpacingReport {
  const dom = globalThis as unknown as RendererDom;
  const root = dom.document.querySelector(opts.root);
  if (root == null) throw new Error(opts.rootMissing);
  const band = opts.band == null ? root : dom.document.querySelector(opts.band);
  if (band == null) throw new Error(opts.bandMissing ?? `${opts.band} não encontrado`);
  const bandRect = band.getBoundingClientRect();
  // Limites da faixa no eixo de BLOCO. 'box': a caixa visível (o quadro não
  // rola). 'scroll': a extensão rolável, em coordenadas da viewport — do topo
  // do conteúdo rolado (borda de cima menos o quanto já rolou) até esse topo
  // mais o scrollHeight.
  const scrollOrigin = bandRect.top + band.clientTop - band.scrollTop;
  const blockStart = opts.blockAxis === 'scroll' ? scrollOrigin : bandRect.top;
  const blockEnd = opts.blockAxis === 'scroll' ? scrollOrigin + band.scrollHeight : bandRect.bottom;

  const label = (el: RendererElement): string =>
    `<${el.tagName.toLowerCase()}> "${(el.textContent ?? '').trim().slice(0, 48)}"`;

  /** Elemento com texto PRÓPRIO (nó de texto direto não vazio). */
  const hasOwnText = (el: RendererElement): boolean =>
    Array.from(el.childNodes).some(
      (n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '',
    );

  /**
   * As caixas que contam para (d): a caixa do elemento (padrão) ou, com
   * `textBoxes`, as caixas de LINHA dos nós de texto próprios dele.
   */
  const overlapBoxesOf = (el: RendererElement): RendererRect[] => {
    if (opts.textBoxes !== true) return [el.getBoundingClientRect()];
    const boxes: RendererRect[] = [];
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType !== 3 || (n.textContent ?? '').trim() === '') continue;
      const range = dom.document.createRange();
      range.selectNodeContents(n);
      for (const r of Array.from(range.getClientRects())) {
        if (r.width > 0 && r.height > 0) boxes.push(r);
      }
    }
    return boxes;
  };

  const clipped: string[] = [];
  const outside: string[] = [];
  const overlaps: string[] = [];
  const leaves: RendererElement[] = [];
  let sampled = 0;

  // A PRÓPRIA faixa pela régua (b) — só com `checkBand`.
  if (opts.checkBand === true) {
    const bcs = dom.getComputedStyle(band);
    const name = opts.bandName ?? 'a faixa';
    if (bcs.overflowX !== 'visible' && band.scrollWidth > band.clientWidth + 1) {
      clipped.push(
        `${name} recorta no eixo inline (scrollWidth ${band.scrollWidth} > clientWidth ${band.clientWidth}, overflow-x: ${bcs.overflowX})`,
      );
    }
    if (
      opts.blockAxis !== 'scroll' &&
      bcs.overflowY !== 'visible' &&
      band.scrollHeight > band.clientHeight + 1
    ) {
      clipped.push(
        `${name} recorta no eixo de bloco (scrollHeight ${band.scrollHeight} > clientHeight ${band.clientHeight}, overflow-y: ${bcs.overflowY})`,
      );
    }
  }

  for (const el of Array.from(root.querySelectorAll('*'))) {
    const cs = dom.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    sampled += 1;

    // (a) Reticências: F104, causa nº 1. Não pode existir na raiz.
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

    // A caixa que conta para (c): a do elemento, ou — com `paintedBox` — a
    // PINTADA (cortada pelos ancestrais que recortam entre ele e a faixa, cada
    // um no seu padding box: é nele que o `overflow` recorta).
    let left = rect.left;
    let right = rect.right;
    let top = rect.top;
    let bottom = rect.bottom;
    if (opts.paintedBox === true) {
      let clipper: RendererElement | null = null;
      for (let a = el.parentElement; a != null && a !== band; a = a.parentElement) {
        const acs = dom.getComputedStyle(a);
        const clipsInline = acs.overflowX !== 'visible';
        const clipsBlock = acs.overflowY !== 'visible';
        if (!clipsInline && !clipsBlock) continue;
        const ar = a.getBoundingClientRect();
        const padLeft = ar.left + a.clientLeft;
        const padTop = ar.top + a.clientTop;
        if (clipsInline) {
          left = Math.max(left, padLeft);
          right = Math.min(right, padLeft + a.clientWidth);
        }
        if (clipsBlock) {
          top = Math.max(top, padTop);
          bottom = Math.min(bottom, padTop + a.clientHeight);
        }
        if (clipper == null) clipper = a;
      }
      // Texto recortado por um ancestral (em QUALQUER direção) é recorte.
      if (
        clipper != null &&
        hasOwnText(el) &&
        (left > rect.left + 1 || right < rect.right - 1 || top > rect.top + 1 || bottom < rect.bottom - 1)
      ) {
        clipped.push(
          `${label(el)} tem texto recortado por ${label(clipper)} (caixa ${Math.round(rect.left)}..${Math.round(rect.right)} x ${Math.round(rect.top)}..${Math.round(rect.bottom)}, pintado ${Math.round(left)}..${Math.round(right)} x ${Math.round(top)}..${Math.round(bottom)})`,
        );
      }
    }
    // (c) Saiu da faixa: o que passa da borda fica ATRÁS do vizinho (ou é
    //     recortado pela faixa) — perda de conteúdo igual. Uma caixa pintada
    //     VAZIA (inteira dentro do recorte de um ancestral) não pinta nada fora.
    if (
      right - left > 0 &&
      bottom - top > 0 &&
      (left < bandRect.left - 1 ||
        right > bandRect.right + 1 ||
        top < blockStart - 1 ||
        bottom > blockEnd + 1)
    ) {
      outside.push(
        `${label(el)} escapa ${opts.bandPhrase} (caixa ${Math.round(left)}..${Math.round(right)} x ${Math.round(top)}..${Math.round(bottom)} contra ${Math.round(bandRect.left)}..${Math.round(bandRect.right)} x ${Math.round(blockStart)}..${Math.round(blockEnd)})`,
      );
    }

    if (hasOwnText(el)) leaves.push(el);
  }

  // (d) Texto sobre texto. Só entre folhas de texto que NÃO se contêm.
  const leafBoxes = leaves.map(overlapBoxesOf);
  for (let i = 0; i < leaves.length; i += 1) {
    for (let j = i + 1; j < leaves.length; j += 1) {
      const a = leaves[i] as RendererElement;
      const b = leaves[j] as RendererElement;
      if (a.contains(b) || b.contains(a)) continue;
      let hit: { dx: number; dy: number } | null = null;
      for (const ra of leafBoxes[i] as RendererRect[]) {
        for (const rb of leafBoxes[j] as RendererRect[]) {
          const dx = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
          const dy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
          if (dx > 1 && dy > 1) {
            hit = { dx, dy };
            break;
          }
        }
        if (hit != null) break;
      }
      if (hit != null) {
        overlaps.push(`${label(a)} sobrepõe ${label(b)} (${Math.round(hit.dx)}x${Math.round(hit.dy)}px)`);
      }
    }
  }

  return { sampled, clipped, outside, overlaps };
}
