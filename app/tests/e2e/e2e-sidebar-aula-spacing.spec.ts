/**
 * e2e-sidebar-aula-spacing.spec.ts — O CABEÇALHO DA AULA NO SIDEBAR, NO PISO
 * DE LARGURA DA DIVISÓRIA, SOB OS QUATRO OVERRIDES DO SC 1.4.12 (AA).
 *
 * ─── O BURACO QUE ESTA SPEC FECHA ──────────────────────────────────────────
 * A política da casa para o sidebar é "QUEBRA, NUNCA RECORTA" (SC 1.4.12 /
 * F104). Até aqui a única rede que provava isso no navegador era o
 * tests/e2e/e2e-spacing.spec.ts — que roda na HOME, com o slot da view ativa
 * VAZIO (`display: none`) e na largura inicial do sidebar. Desde a
 * ONDA-AULA-NO-SIDEBAR a LessonView publica o cabeçalho da aula
 * (LessonSidebarHeader: h1, resumo, progresso + "Seção N de M", "Desafios" com
 * badge, "Fontes", chips de pré-requisito) nesse slot, dentro de uma coluna
 * que pode descer a 180px (`SHELL_SPLIT_CONSTRAINTS.minPanePx`) e que tem
 * `overflowX: 'hidden'` — tudo o que estourar a largura é RECORTADO, sem
 * reticências e sem barra. Essa combinação não era exercida por teste nenhum.
 *
 * ─── O QUE ELA FAZ, NA ORDEM ───────────────────────────────────────────────
 *   1. abre uma aula de verdade pelo caminho do aluno (Home → Trilha → aula);
 *   2. leva a divisória do shell ao PISO pelo teclado APG (foco + Home —
 *      `nextRatioForKey` devolve a fronteira efetiva mínima) e confere que o
 *      sidebar MEDE o piso de pixel (180px, ±1);
 *   3. injeta os QUATRO overrides do SC 1.4.12, verbatim (SPACING_OVERRIDES,
 *      a mesma string do e2e-spacing);
 *   4. em CADA configuração da coluna (abaixo), varre TODO elemento do
 *      `<section>` do cabeçalho da aula E do banner inteiro com a varredura do
 *      e2e-spacing (./spacingScan): nenhum `text-overflow: ellipsis` computado,
 *      nada maior que a própria caixa num eixo que recorta, nada fora da caixa
 *      do sidebar no eixo inline (e o próprio sidebar sem
 *      `scrollWidth > clientWidth`), nenhuma folha de texto sobre outra;
 *   5. e confere que o h1, "Desafios" (com a bolha do badge) e "Fontes" (e o
 *      chip de pré-requisito, na aula que tem um) continuam INTEIROS dentro da
 *      área que o sidebar recorta — rolando a coluna quando ela rola — e
 *      CLICÁVEIS: o clique do Playwright só acontece se o alvo recebe o
 *      ponteiro no centro dele, e cada clique é conferido pelo EFEITO (popover,
 *      diálogo, troca de aula).
 *
 * ─── AS QUATRO CONFIGURAÇÕES DA COLUNA (idioma × altura da janela) ─────────
 * No piso, a largura útil do texto não é uma só, e cada eixo abaixo MUDA o
 * resultado — medido nesta spec:
 *   · IDIOMA: os rótulos têm comprimentos diferentes nos dois locales que o app
 *     embarca ("Desafios"/"Challenges", "Fontes"/"Sources"). Trocado pelo
 *     seletor de idioma do próprio sidebar, como o aluno faz;
 *   · ALTURA: na altura inicial (800) o sidebar cabe na janela; na altura
 *     MÍNIMA da janela (o `minHeight` do BrowserWindow) ele passa a ROLAR no
 *     eixo de bloco — e, com barra de rolagem clássica (macOS com mouse,
 *     Windows, Linux), a barra come largura da coluna (medido: clientWidth 179
 *     → 167px). É a configuração mais apertada que o aluno alcança.
 * Nesta altura mínima a spec rola o sidebar até o FIM antes de varrer: a
 * régua de bloco (`blockAxis: 'scroll'`) é exercida com `scrollTop > 0`.
 *
 * ─── A RÉGUA: A DO e2e-spacing, COM AJUSTES MEDIDOS (./spacingScan) ────────
 * As quatro medidas e as tolerâncias são as do e2e-spacing. O que muda é a
 * geometria que o quadro de sessão da Home não tinha — e cada ajuste nasceu de
 * uma medida feita nesta spec, no app rodando, a 180px e sob os overrides:
 *   · `blockAxis: 'scroll'` — o sidebar ROLA no eixo de bloco por desenho
 *     (`overflowY: 'auto'` do SessionFrame: "o rolar é como a coluna cresce em
 *     vez de recortar"); na altura mínima ele rola de fato (medido:
 *     scrollHeight 718 > clientHeight 572). No eixo de BLOCO o limite é a
 *     extensão ROLÁVEL; no eixo INLINE — o que o `overflowX: 'hidden'` recorta
 *     — a régua segue sem folga além do 1px de sub-pixel, e mede também o
 *     PRÓPRIO sidebar (`checkBand`: `scrollWidth > clientWidth` nele é conteúdo
 *     recortado — inclusive o que só some embaixo da barra de rolagem);
 *   · `paintedBox: true` — pela caixa CRUA, a régua (c) acusou o preenchimento
 *     do LinearProgress: a 0% a caixa dele mediu -39..116px contra o sidebar
 *     em 104..284 (a 50%, 38..194) — é o `translateX(valor − 100%)` do MUI,
 *     dentro de uma trilha com `overflow: hidden` que o recorta por desenho
 *     (scrollWidth = clientWidth = 155 na trilha). Com a caixa PINTADA a régua
 *     só vê o que aparece; e em troca fica MAIS estrita com texto: texto
 *     recortado por qualquer ancestral dentro do sidebar vira violação;
 *   · `textBoxes: true` — pela caixa do ELEMENTO, a régua (d) acusou
 *     "<button> Desafios sobrepõe <span> 1 (10x10px)": a bolha do Badge fica
 *     centrada no canto do botão, por desenho, e cobre o padding e a borda
 *     dele. Os glifos não se tocam: o rótulo termina em 242px e a borda do
 *     botão está em 255px (12px de padding + 1px de borda); a bolha de um
 *     algarismo entra 10px. Pelas caixas de LINHA do texto a régua mede glifo
 *     sobre glifo — e ainda pega o texto que transborda a própria caixa.
 * Pela régua crua do e2e-spacing, em pt-BR, essas duas acusações foram as
 * ÚNICAS da varredura — nenhuma é texto perdido. Já em INGLÊS a régua (com os
 * ajustes) pegou um recorte REAL — ver o LessonSidebarHeader, bloco "AÇÕES".
 *
 * ─── AS DUAS AULAS (nenhuma aula fixture tem desafio E pré-requisito) ──────
 *   · "Aula E2E sobre funções" (trilha `nodejs-do-zero`, a MESMA do
 *     e2e-lesson.spec.ts): tem desafio — o "Desafios da aula (1 pendentes)" com
 *     o badge VISÍVEL (a teoria é lida até o fim, como no e2e-lesson, para o
 *     desafio liberar e a bolha do badge existir na varredura) — e fontes;
 *   · "Segunda porta (E2E)" (trilha do cadeado, tests/e2e/cadeadoFixture.ts):
 *     tem o chip de pré-requisito ("Primeira porta (E2E)") — o rótulo do MuiChip
 *     nasce `nowrap` + `ellipsis`, e a 180px ele PRECISA quebrar. Chega-se a ela
 *     pelo caminho do e2e-cadeado (concluir a aula 1 → "Avançar para a próxima
 *     aula"). É também a aula a 0% de teoria (o preenchimento da barra fora da
 *     trilha).
 */
import { test, expect, type ElectronApplication, type Locator, type Page } from '@playwright/test';
import { launchApp, closeApp, makeWorkspaceRoot } from './helpers';
import { LESSON_ONE_TITLE, LESSON_TWO_TITLE, LOCK_TRACK_TITLE, writeLockTrack } from './cadeadoFixture';
import { SPACING_OVERRIDES, scanSpacing, type SpacingReport, type SpacingScanOptions } from './spacingScan';
import {
  ratioToPx,
  SHELL_SIDEBAR_PANE_ID,
  SHELL_SPLIT_CONSTRAINTS,
  SHELL_SPLIT_DIVIDER_ID,
  splitBounds,
} from '../../src/lib/splitRatio';

let app: ElectronApplication | undefined;
let page: Page;
let wsRoot: string;

test.beforeEach(() => {
  wsRoot = makeWorkspaceRoot();
  // A trilha de duas portas (a aula com chip de pré-requisito) precisa existir
  // ANTES de o app subir: o `track:list` do primeiro render já a encontra. A
  // `nodejs-do-zero` o próprio stub escreve no mesmo workspace, sem apagar
  // vizinhos.
  writeLockTrack(wsRoot);
});

test.afterEach(async () => {
  if (app) await closeApp(app);
});

/** O sidebar do shell — o `<AppBar>` (landmark banner) com a largura da divisória. */
const SIDEBAR = `#${SHELL_SIDEBAR_PANE_ID}`;
/** A divisória do shell (`role="separator"`, teclado APG). */
const DIVIDER = `#${SHELL_SPLIT_DIVIDER_ID}`;
/** O slot da view ativa (SHELL_SIDEBAR_SLOT_ID, onde a LessonView publica). */
const SLOT = '#shell-sidebar-view-slot';
/** O cabeçalho da aula publicado no slot (LessonSidebarHeader). */
const LESSON_SECTION = `${SLOT} section[aria-labelledby]`;

/** Aula da trilha `nodejs-do-zero` (a do e2e-lesson): tem desafio e fontes. */
const CHALLENGE_LESSON_TITLE = 'Aula E2E sobre funções';

/** Idioma da UI (os dois locales que o app embarca). */
type Idioma = 'pt-BR' | 'en';
/** Altura da janela: a de criação (800) ou o `minHeight` do BrowserWindow. */
type Altura = 'inicial' | 'minima';

/** Uma configuração da coluna (ver o cabeçalho do arquivo). */
interface Configuracao {
  readonly idioma: Idioma;
  readonly altura: Altura;
}

/**
 * A ordem troca UM eixo por vez (altura, idioma, altura), então a falha de
 * uma configuração aponta a variável que a causou.
 */
const CONFIGURACOES: readonly Configuracao[] = [
  { idioma: 'pt-BR', altura: 'inicial' },
  { idioma: 'pt-BR', altura: 'minima' },
  { idioma: 'en', altura: 'minima' },
  { idioma: 'en', altura: 'inicial' },
];

/**
 * Os textos que o aluno vê, por idioma — os MESMOS de
 * src/i18n/locales/{pt-BR,en}/translation.json (a spec procura o que está na
 * tela, como as outras specs e2e).
 */
const TEXTOS: Record<
  Idioma,
  {
    desafios: (pendentes: number) => string;
    desafiosTitulo: string;
    fontes: string;
    fontesTitulo: string;
    menuItem: RegExp;
  }
> = {
  'pt-BR': {
    desafios: (n) => `Desafios da aula (${n} pendentes)`,
    desafiosTitulo: 'Desafios desta aula',
    fontes: 'Fontes',
    fontesTitulo: 'Fontes desta aula',
    menuItem: /Português/,
  },
  en: {
    desafios: (n) => `Lesson challenges (${n} pending)`,
    desafiosTitulo: 'Challenges in this lesson',
    fontes: 'Sources',
    fontesTitulo: 'Sources for this lesson',
    menuItem: /English/,
  },
};

/**
 * Espera o texto COMPLETO do tutor stub ser digitado (mesma técnica do
 * e2e-lesson.spec.ts e do e2e-cadeado.spec.ts): o indicador "tutor digitando…"
 * só é montado DURANTE a digitação, e o unmount dele É a condição "acabou".
 * `polling: 'raf'` roda no renderer (~16ms) — o poll por CDP perdia a janela
 * transiente. Chamada LOGO após o clique, antes de qualquer outra asserção
 * (ONDA10-FENCE do e2e-lesson).
 */
async function waitFullTypewriter(p: Page): Promise<void> {
  await p.waitForFunction(
    () => {
      // tsconfig.node.json (que cobre tests/) não tem lib DOM — o acesso ao DOM
      // vai por globalThis com cast (o Playwright serializa a função e a avalia
      // no renderer).
      const doc = (globalThis as any).document;
      const statuses = doc?.querySelectorAll('[role="status"]') ?? [];
      for (const el of statuses) {
        if (/tutor digitando|tutor typing/i.test(el.textContent ?? '')) return true;
      }
      return false;
    },
    undefined,
    { polling: 'raf' },
  );
  await p.waitForFunction(
    () => {
      const doc = (globalThis as any).document;
      const statuses = doc?.querySelectorAll('[role="status"]') ?? [];
      for (const el of statuses) {
        if (/tutor digitando|tutor typing/i.test(el.textContent ?? '')) return false;
      }
      return true;
    },
    undefined,
    { polling: 'raf' },
  );
}

/** A geometria do sidebar que a spec usa (tudo em px de viewport). */
interface SidebarGeometry {
  /** Largura da caixa (border box) — a da divisória. */
  sidebarPx: number;
  /** Largura do contêiner do split (sidebar + divisória + main). */
  containerPx: number;
  /** A área que o `overflow` do sidebar deixa ver no eixo inline (padding box
   *  sem a barra de rolagem). */
  clipLeft: number;
  clipRight: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
}

async function medirSidebar(p: Page): Promise<SidebarGeometry> {
  return p.evaluate((selector: string): SidebarGeometry => {
    interface Caixa {
      getBoundingClientRect(): { left: number; width: number };
      clientLeft: number;
      clientWidth: number;
      scrollHeight: number;
      clientHeight: number;
      parentElement: { getBoundingClientRect(): { width: number } } | null;
    }
    const dom = globalThis as unknown as { document: { querySelector(s: string): Caixa | null } };
    const sidebar = dom.document.querySelector(selector);
    if (sidebar == null) throw new Error(`sidebar (${selector}) não encontrado`);
    if (sidebar.parentElement == null) throw new Error('contêiner do split não encontrado');
    const r = sidebar.getBoundingClientRect();
    return {
      sidebarPx: r.width,
      // O pai do sidebar É o contêiner que o App mede (ResizeObserver) para a
      // matemática do split — o rail fica fora dele.
      containerPx: sidebar.parentElement.getBoundingClientRect().width,
      clipLeft: r.left + sidebar.clientLeft,
      clipRight: r.left + sidebar.clientLeft + sidebar.clientWidth,
      clientWidth: sidebar.clientWidth,
      scrollHeight: sidebar.scrollHeight,
      clientHeight: sidebar.clientHeight,
    };
  }, SIDEBAR);
}

/**
 * Leva a divisória ao PISO pelo teclado (APG Window Splitter: "Home: Moves
 * splitter to the position that gives the primary pane its smallest allowed
 * size") e devolve a largura MEDIDA do sidebar, já assentada (o flex-basis
 * anima o passo de teclado — SPLIT_MOTION).
 *
 * O piso esperado sai da MESMA matemática da produção (splitBounds + ratioToPx
 * com SHELL_SPLIT_CONSTRAINTS, sobre o contêiner medido) — e a spec exige que,
 * nesta janela, ele seja o piso de PIXEL (180px): é essa a largura que a
 * política do sidebar promete aguentar.
 */
async function levarDivisoriaAoPiso(p: Page): Promise<number> {
  const divider = p.locator(DIVIDER);
  await expect(divider).toHaveAttribute('role', 'separator');
  await divider.focus();
  await p.keyboard.press('Home');

  // O leitor de tela ouve o mesmo que o layout faz: valuenow na fronteira mínima.
  const valueMin = await divider.getAttribute('aria-valuemin');
  expect(valueMin, 'a divisória declara aria-valuemin').not.toBeNull();
  await expect(divider).toHaveAttribute('aria-valuenow', valueMin as string);

  const { containerPx } = await medirSidebar(p);
  const bounds = splitBounds(containerPx, SHELL_SPLIT_CONSTRAINTS);
  const floorPx = ratioToPx(bounds.min, containerPx, SHELL_SPLIT_CONSTRAINTS).primaryPx;
  expect(
    Math.abs(floorPx - SHELL_SPLIT_CONSTRAINTS.minPanePx),
    `nesta janela (contêiner do split = ${containerPx}px) o piso tem de ser o de PIXEL ` +
      `(${SHELL_SPLIT_CONSTRAINTS.minPanePx}px), não o de razão — a matemática deu ${floorPx}px`,
  ).toBeLessThanOrEqual(1);

  // Assenta a transição do flex-basis e confere a largura REAL. Igualdade
  // EXATA, sem arredondar: no meio da transição a largura passa por valores
  // fracionários (medido: 179,81px) e varrer o layout ainda andando mediria
  // uma coluna que o aluno não vê parada. O flex-basis é px inteiro, e o
  // layout do Blink o devolve exato quando a transição termina.
  await expect
    .poll(async () => (await medirSidebar(p)).sidebarPx, {
      message: `o sidebar tem de assentar no piso de ${floorPx}px`,
      timeout: 5_000,
    })
    .toBe(floorPx);
  const { sidebarPx } = await medirSidebar(p);
  expect(Math.abs(sidebarPx - SHELL_SPLIT_CONSTRAINTS.minPanePx)).toBeLessThanOrEqual(1);
  return sidebarPx;
}

/** Os quatro overrides do SC 1.4.12 — e NADA além deles. */
async function injetarOverrides(p: Page): Promise<void> {
  await p.addStyleTag({ content: SPACING_OVERRIDES });
  // Um frame para o layout assentar com o CSS novo (a mesma espera do e2e-spacing).
  await p.waitForTimeout(150);
}

/** Altura EXTERNA da janela agora (px). */
async function alturaDaJanela(a: ElectronApplication): Promise<number> {
  return a.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win == null) throw new Error('janela do app não encontrada');
    return win.getSize()[1] as number;
  });
}

/**
 * Leva a janela à altura pedida (a largura não muda — o piso da divisória
 * também não) e espera o renderer enxergar a viewport nova.
 */
async function ajustarAltura(a: ElectronApplication, p: Page, altura: Altura, inicial: number): Promise<void> {
  const alvo =
    altura === 'inicial'
      ? inicial
      : await a.evaluate(({ BrowserWindow }) => {
          const win = BrowserWindow.getAllWindows()[0];
          if (win == null) throw new Error('janela do app não encontrada');
          return win.getMinimumSize()[1] as number;
        });
  await a.evaluate(({ BrowserWindow }, h: number) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win == null) throw new Error('janela do app não encontrada');
    const [largura] = win.getSize();
    win.setSize(largura as number, h);
  }, alvo);
  await expect
    .poll(
      async () => {
        const [externa, conteudo] = await a.evaluate(({ BrowserWindow }) => {
          const win = BrowserWindow.getAllWindows()[0];
          return [win?.getSize()[1] ?? -1, win?.getContentSize()[1] ?? -1] as const;
        });
        const viewport = await p.evaluate(() => (globalThis as unknown as { innerHeight: number }).innerHeight);
        return externa === alvo && viewport === conteudo;
      },
      { message: `a janela tem de chegar à altura ${alvo}px (e o renderer enxergar)`, timeout: 5_000 },
    )
    .toBe(true);
}

/** Troca o idioma pelo seletor do PRÓPRIO sidebar (o caminho do aluno). */
async function trocarIdioma(p: Page, idioma: Idioma): Promise<void> {
  await p.getByLabel('Select language').click();
  await p.getByRole('menuitem', { name: TEXTOS[idioma].menuItem }).click();
  await expect(p.locator(SIDEBAR).getByRole('button', { name: TEXTOS[idioma].fontes, exact: true })).toBeVisible();
}

/** Aplica UMA configuração a partir da anterior (só o eixo que mudou). */
async function aplicar(
  a: ElectronApplication,
  p: Page,
  atual: Configuracao | null,
  alvo: Configuracao,
  alturaInicial: number,
): Promise<void> {
  if (atual == null || atual.altura !== alvo.altura) await ajustarAltura(a, p, alvo.altura, alturaInicial);
  if (atual != null && atual.idioma !== alvo.idioma) await trocarIdioma(p, alvo.idioma);
}

/**
 * A varredura, duas vezes, com a MESMA régua: o `<section>` do cabeçalho da
 * aula (a superfície nova) e o banner inteiro (tudo o que divide a coluna com
 * ele). A faixa é SEMPRE o sidebar — é a caixa dele que recorta. Os ajustes
 * de régua estão justificados, com as medidas, no cabeçalho deste arquivo.
 */
async function varrerSidebar(p: Page): Promise<{ secao: SpacingReport; banner: SpacingReport }> {
  const naSecao: SpacingScanOptions = {
    root: LESSON_SECTION,
    rootMissing: `cabeçalho da aula (${LESSON_SECTION}) não encontrado`,
    band: SIDEBAR,
    bandMissing: `sidebar (${SIDEBAR}) não encontrado`,
    bandPhrase: 'do sidebar',
    bandName: 'o sidebar',
    blockAxis: 'scroll',
    paintedBox: true,
    textBoxes: true,
  };
  const noBanner: SpacingScanOptions = {
    ...naSecao,
    root: SIDEBAR,
    rootMissing: `sidebar (${SIDEBAR}) não encontrado`,
    // Só aqui: a própria faixa (o sidebar, `overflowX: 'hidden'`) também é
    // medida — `scrollWidth > clientWidth` nela é conteúdo recortado.
    checkBand: true,
  };
  const secao = await p.evaluate(scanSpacing, naSecao);
  const banner = await p.evaluate(scanSpacing, noBanner);
  return { secao, banner };
}

/** As três asserções do SC 1.4.12 sobre um relatório (mensagens com as violações). */
function esperarNadaPerdido(report: SpacingReport, onde: string): void {
  expect(
    report.clipped,
    `SC 1.4.12: nada ${onde} pode truncar sob os overrides — ${report.clipped.join(' | ')}`,
  ).toEqual([]);
  expect(
    report.outside,
    `SC 1.4.12: nada ${onde} pode escapar da caixa do sidebar — ${report.outside.join(' | ')}`,
  ).toEqual([]);
  expect(
    report.overlaps,
    `SC 1.4.12: nada ${onde} pode se sobrepor sob os overrides — ${report.overlaps.join(' | ')}`,
  ).toEqual([]);
}

/**
 * Deixa o sidebar EM REPOUSO antes de medir. Os cliques da configuração
 * anterior deixam dois efeitos transitórios que não são layout:
 *   · o RIPPLE do MUI — um círculo que o `.MuiTouchRipple-root` (overflow
 *     hidden) recorta no formato do botão, até a animação de saída acabar
 *     (medido: "scrollHeight 72 > clientHeight 31" na raiz do ripple, logo
 *     depois do clique em "Fontes");
 *   · o HOVER do tema (`transform: scale(1.02)` em todo botão) — o ponteiro
 *     fica parado em cima do último botão clicado.
 * O ponteiro vai para o canto do `main` (fora do sidebar) e a spec espera o
 * último ripple sair do DOM.
 */
async function sidebarEmRepouso(p: Page): Promise<void> {
  const largura = await p.evaluate(() => (globalThis as unknown as { innerWidth: number }).innerWidth);
  await p.mouse.move(largura - 8, 8);
  await expect(p.locator(`${SIDEBAR} .MuiTouchRipple-ripple`)).toHaveCount(0, { timeout: 5_000 });
}

/**
 * Mede a configuração ATUAL: a coluna no piso, a rolagem de bloco quando a
 * altura é a mínima (rolada até o FIM antes de varrer), a varredura e o log
 * do que foi medido (vai para o relatório da onda).
 */
async function varrerConfiguracao(p: Page, aula: string, cfg: Configuracao): Promise<void> {
  const onde = `[${aula} · ${cfg.idioma} · altura ${cfg.altura}]`;
  await sidebarEmRepouso(p);
  const geo = await medirSidebar(p);
  expect(
    Math.abs(geo.sidebarPx - SHELL_SPLIT_CONSTRAINTS.minPanePx),
    `${onde} o sidebar continua no piso (o conteúdo mais largo não empurra a coluna)`,
  ).toBeLessThanOrEqual(1);
  if (cfg.altura === 'minima') {
    // A configuração só vale se a coluna ROLA de fato — senão ela seria a
    // mesma da altura inicial e a régua de bloco não estaria sendo exercida.
    expect(geo.scrollHeight, `${onde} na altura mínima o sidebar rola no eixo de bloco`).toBeGreaterThan(
      geo.clientHeight,
    );
    await p.locator(SIDEBAR).evaluate((el) => {
      const e = el as unknown as { scrollTop: number; scrollHeight: number };
      e.scrollTop = e.scrollHeight;
    });
  }
  const { secao, banner } = await varrerSidebar(p);
  const rolado = await p.locator(SIDEBAR).evaluate((el) => (el as unknown as { scrollTop: number }).scrollTop);
  console.log(
    `[sidebar-aula-spacing] ${onde} sidebar=${geo.sidebarPx}px (clientWidth ${geo.clientWidth}, ` +
      `scrollHeight ${geo.scrollHeight}/clientHeight ${geo.clientHeight}, scrollTop ${rolado}) · ` +
      `seção: ${secao.sampled} elementos (recortes ${secao.clipped.length}, fora ${secao.outside.length}, ` +
      `sobreposições ${secao.overlaps.length}) · banner: ${banner.sampled} elementos (recortes ` +
      `${banner.clipped.length}, fora ${banner.outside.length}, sobreposições ${banner.overlaps.length})`,
  );
  // Guardas contra varredura vazia: a seção tem h1, resumo, progresso,
  // contador, os botões (com ícones) — e a bolha do badge ou o chip.
  expect(secao.sampled, `${onde} a varredura tem que ter visto o cabeçalho da aula de fato`).toBeGreaterThan(10);
  expect(banner.sampled, `${onde} o banner inteiro contém a seção e o quadro`).toBeGreaterThan(secao.sampled);
  esperarNadaPerdido(secao, `${onde} no cabeçalho da aula`);
  esperarNadaPerdido(banner, `${onde} no sidebar`);
}

/**
 * O alvo está INTEIRO na tela: rola o sidebar até ele se preciso (a coluna rola
 * no eixo de bloco por desenho), exige 100% da caixa dentro da viewport — o
 * IntersectionObserver desconta o que o `overflow` do sidebar recorta — e a
 * caixa dentro da área que o sidebar deixa ver no eixo inline (o padding box
 * SEM a barra de rolagem: o que passa dali some embaixo dela ou é recortado).
 */
async function esperarInteiroNoSidebar(p: Page, alvo: Locator, nome: string): Promise<void> {
  await alvo.scrollIntoViewIfNeeded();
  await expect(alvo, `${nome}: visível`).toBeVisible();
  await expect(alvo, `${nome}: inteiro na tela (nada recortado pelo sidebar)`).toBeInViewport({ ratio: 1 });
  const caixa = await alvo.boundingBox();
  expect(caixa, `${nome}: tem caixa`).not.toBeNull();
  if (caixa == null) return;
  const { clipLeft, clipRight } = await medirSidebar(p);
  expect(caixa.x, `${nome}: não passa da borda ESQUERDA da área visível do sidebar`).toBeGreaterThanOrEqual(
    clipLeft - 1,
  );
  expect(
    caixa.x + caixa.width,
    `${nome}: não passa da borda DIREITA da área visível do sidebar (${Math.round(clipRight)}px)`,
  ).toBeLessThanOrEqual(clipRight + 1);
}

test('e2e-sidebar-aula-spacing: a aula COM desafio (badge) no piso de 180px sob os overrides do SC 1.4.12 — nada recorta, Desafios e Fontes clicáveis', async () => {
  test.setTimeout(150_000);
  const launched = await launchApp({ env: { E2E_GATE: 'ready', E2E_WORKSPACE_ROOT: wsRoot } });
  app = launched.app;
  page = launched.page;
  const alturaInicial = await alturaDaJanela(app);

  // ── 1. O CAMINHO DO e2e-lesson até a aula aberta ─────────────────────────
  await expect(page.getByRole('banner').getByText('Study Method — Tutor', { exact: false })).toBeVisible();
  await page.getByText('Node.js do Zero', { exact: false }).first().click();
  await expect(page.getByRole('heading', { name: 'Node.js do Zero' })).toBeVisible();
  await page.getByText(CHALLENGE_LESSON_TITLE, { exact: false }).first().click();
  const sidebar = page.locator(SIDEBAR);
  const h1 = page.locator(SLOT).getByRole('heading', { level: 1, name: CHALLENGE_LESSON_TITLE });
  await expect(h1).toBeVisible();

  // A teoria até o fim (duas seções): o desafio LIBERA e o badge de pendentes
  // passa a existir de verdade (durante a teoria ele é `MuiBadge-invisible`,
  // escala 0 — a varredura nem o veria). ONDA10-FENCE: o wait logo após o clique.
  await page.getByRole('button', { name: 'Começar aula' }).click();
  await waitFullTypewriter(page);
  await page.getByRole('button', { name: 'Próximo →' }).click();
  await waitFullTypewriter(page);
  await expect(sidebar.locator('.MuiBadge-badge:not(.MuiBadge-invisible)')).toHaveCount(1);

  // ── 2. A DIVISÓRIA NO PISO + 3. OS QUATRO OVERRIDES ─────────────────────
  await levarDivisoriaAoPiso(page);
  await injetarOverrides(page);

  // ── 4 e 5. CADA CONFIGURAÇÃO: varredura + inteiros e clicáveis ──────────
  let atual: Configuracao | null = null;
  for (const cfg of CONFIGURACOES) {
    await aplicar(app, page, atual, cfg, alturaInicial);
    atual = cfg;
    const txt = TEXTOS[cfg.idioma];
    await varrerConfiguracao(page, 'aula com desafio', cfg);

    await esperarInteiroNoSidebar(page, h1, `[${cfg.idioma}/${cfg.altura}] o h1 da aula`);
    await expect(h1).toHaveText(CHALLENGE_LESSON_TITLE);

    const desafios = sidebar.getByRole('button', { name: txt.desafios(1), exact: true });
    const bolha = desafios.locator('xpath=..').locator('.MuiBadge-badge');
    await expect(bolha).toHaveText('1');
    await esperarInteiroNoSidebar(page, desafios, `[${cfg.idioma}/${cfg.altura}] "${txt.desafios(1)}"`);
    await esperarInteiroNoSidebar(page, bolha, `[${cfg.idioma}/${cfg.altura}] a bolha do badge de pendentes`);
    await desafios.click();
    await expect(page.getByRole('heading', { name: txt.desafiosTitulo })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: txt.desafiosTitulo })).toHaveCount(0);

    const fontes = sidebar.getByRole('button', { name: txt.fontes, exact: true });
    await esperarInteiroNoSidebar(page, fontes, `[${cfg.idioma}/${cfg.altura}] "${txt.fontes}"`);
    await fontes.click();
    await expect(page.getByRole('heading', { name: txt.fontesTitulo })).toBeVisible();
    await expect(page.getByText('MDN', { exact: false })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: txt.fontesTitulo })).toHaveCount(0);

    // E o h1 continua lá (voltar ao topo do sidebar é rolar, não procurar).
    await esperarInteiroNoSidebar(page, h1, `[${cfg.idioma}/${cfg.altura}] o h1 da aula (depois dos cliques)`);
  }
});

test('e2e-sidebar-aula-spacing: a aula COM chip de pré-requisito no piso de 180px sob os overrides do SC 1.4.12 — o chip quebra e continua clicável', async () => {
  test.setTimeout(150_000);
  const launched = await launchApp({ env: { E2E_GATE: 'ready', E2E_WORKSPACE_ROOT: wsRoot } });
  app = launched.app;
  page = launched.page;
  const alturaInicial = await alturaDaJanela(app);

  // ── 1. O CAMINHO DO e2e-cadeado até a aula 2 (a do pré-requisito) ────────
  await expect(page.getByRole('banner').getByText('Study Method — Tutor', { exact: false })).toBeVisible();
  await page.getByText(LOCK_TRACK_TITLE, { exact: false }).first().click();
  await expect(page.getByRole('heading', { name: LOCK_TRACK_TITLE })).toBeVisible();
  await page.getByRole('button', { name: new RegExp(LESSON_ONE_TITLE.replace(/[()]/g, '\\$&')) }).click();
  await expect(page.getByRole('heading', { name: LESSON_ONE_TITLE })).toBeVisible();
  await page.getByRole('button', { name: 'Começar aula' }).click();
  await waitFullTypewriter(page);
  await page.getByRole('button', { name: 'Próximo →' }).click();
  await waitFullTypewriter(page);
  await page.getByRole('button', { name: 'Concluir aula' }).click();
  await page.getByRole('button', { name: 'Avançar para a próxima aula' }).click();

  const sidebar = page.locator(SIDEBAR);
  const h1 = page.locator(SLOT).getByRole('heading', { level: 1, name: LESSON_TWO_TITLE });
  await expect(h1).toBeVisible();
  // O chip do pré-requisito (MuiChip clicável → role="button", nome = o título
  // da aula anterior, que não muda com o idioma da UI). Esta aula não tem
  // desafio: o "Desafios" nem existe — a bolha do badge é medida no teste de
  // cima.
  const chip = sidebar.getByRole('button', { name: LESSON_ONE_TITLE, exact: true });
  await expect(chip).toBeVisible();
  await expect(sidebar.getByRole('button', { name: /Desafios da aula|Lesson challenges/ })).toHaveCount(0);

  // ── 2. A DIVISÓRIA NO PISO + 3. OS QUATRO OVERRIDES ─────────────────────
  await levarDivisoriaAoPiso(page);
  await injetarOverrides(page);

  // ── 4 e 5. CADA CONFIGURAÇÃO: varredura + inteiros e clicáveis ──────────
  let atual: Configuracao | null = null;
  for (const cfg of CONFIGURACOES) {
    await aplicar(app, page, atual, cfg, alturaInicial);
    atual = cfg;
    const txt = TEXTOS[cfg.idioma];
    await varrerConfiguracao(page, 'aula com pré-requisito', cfg);

    // O rótulo do chip QUEBROU mesmo (e não foi só "coube"): a 180px, com o
    // espaçamento do SC 1.4.12, "Primeira porta (E2E)" não cabe numa linha —
    // o rótulo tem de ocupar mais de uma linha, inteiro, sem reticências.
    const rotulo = chip.locator('.MuiChip-label');
    await expect(rotulo).toHaveText(LESSON_ONE_TITLE);
    await expect(rotulo).toHaveCSS('text-overflow', 'clip');
    const linhas = await rotulo.evaluate((el) => {
      // Sem lib DOM no tsconfig destes testes (ver ./spacingScan): a fatia do
      // DOM usada vai tipada à mão, como no e2e-code-theme.
      const dom = globalThis as unknown as {
        document: {
          createRange(): { selectNodeContents(n: unknown): void; getClientRects(): ArrayLike<{ top: number }> };
        };
      };
      const range = dom.document.createRange();
      range.selectNodeContents(el);
      // Linhas distintas = tops distintos das caixas de linha do texto.
      return new Set(Array.from(range.getClientRects()).map((r) => Math.round(r.top))).size;
    });
    expect(linhas, `[${cfg.idioma}/${cfg.altura}] o rótulo do chip quebrou em mais de uma linha`).toBeGreaterThan(1);
    await esperarInteiroNoSidebar(page, chip, `[${cfg.idioma}/${cfg.altura}] o chip "${LESSON_ONE_TITLE}"`);

    await esperarInteiroNoSidebar(page, h1, `[${cfg.idioma}/${cfg.altura}] o h1 da aula`);
    await expect(h1).toHaveText(LESSON_TWO_TITLE);

    const fontes = sidebar.getByRole('button', { name: txt.fontes, exact: true });
    await esperarInteiroNoSidebar(page, fontes, `[${cfg.idioma}/${cfg.altura}] "${txt.fontes}"`);
    await fontes.click();
    await expect(page.getByRole('heading', { name: txt.fontesTitulo })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: txt.fontesTitulo })).toHaveCount(0);
  }

  // O clique no chip por ÚLTIMO (ele TROCA de aula — openPrerequisite): na
  // configuração mais larga de texto (en) e na altura inicial, o sidebar passa
  // a mostrar o cabeçalho da aula anterior.
  await esperarInteiroNoSidebar(page, chip, `o chip "${LESSON_ONE_TITLE}" (antes do clique)`);
  await chip.click();
  await expect(page.locator(SLOT).getByRole('heading', { level: 1 })).toHaveText(LESSON_ONE_TITLE);
});
