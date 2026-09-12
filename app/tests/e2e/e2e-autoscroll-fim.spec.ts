/**
 * e2e-autoscroll-fim.spec.ts — R1 DO DONO, PROVADO NA GUI REAL (Electron).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O PEDIDO, AO PÉ DA LETRA
 * ══════════════════════════════════════════════════════════════════════════
 * "durante a aula quero auto scroll do conteúdo sempre pro final da tela".
 *
 * Até esta spec o pedido só tinha prova UNITÁRIA: `pinLogToBottom` /
 * `nudgeLogToBottom` (exportadas de `src/views/LessonView/LessonView.tsx`) eram
 * medidas com um elemento FAKE (objeto com `scrollTop`/`scrollHeight`, sem DOM)
 * em `tests/lessonAutoScroll.test.ts`, e a ausência do guard antigo era cobrada
 * por CERCA DE FONTE (`NEAR_BOTTOM_PX`/`isNearBottom` não existem no arquivo).
 * Nenhuma das duas prova o que o dono pediu: que a TELA role. Um elemento fake
 * não tem layout, não tem overflow e não tem o roladador de verdade no meio;
 * e uma cerca de fonte não distingue "sem guard" de "guard reintroduzido com
 * outro nome". Aqui a medida é no DOM do renderer de PRODUÇÃO, no container
 * que REALMENTE rola (o PAI do `[role="log"]` — medir no filho daria verde
 * vacuoso: o filho cresce, mas quem tem `overflowY` e `scrollTop` é o pai).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O QUE ESTA SPEC FAZ (o cenário do dono, sem atalho)
 * ══════════════════════════════════════════════════════════════════════════
 *   1. abre a aula (Home → Trilha → aula → "Começar aula") e deixa a 1ª seção
 *      ser DIGITADA até o fim;
 *   2. ENCOLHE a janela do Electron (700×480 — o porquê do par está medido em
 *      `SHRUNK_WINDOW`) — sem overflow não há o que rolar e o teste não
 *      provaria nada — e ESPERA o layout assentar por CONDIÇÃO OBSERVÁVEL
 *      (`waitForLayoutSettled`: viewport do renderer no tamanho novo + caixa do
 *      roladador estável entre amostras), nunca por `waitForTimeout`;
 *   3. GUARDA ANTI-VACUIDADE (três frentes): exige overflow REAL medido
 *      (`scrollHeight > clientHeight + margem`), exige que o elemento medido
 *      seja mesmo o roladador (o PAI do `[role="log"]`, com `overflowY: auto`)
 *      e exige que a região do chat tenha ALTURA VISÍVEL e esteja DENTRO da
 *      janela (com `clientHeight = 0` — o que ACONTECE nesta app em 700×380 —
 *      a asserção de fim viraria uma conta degenerada);
 *   4. rola o painel para o TOPO (`scrollTop = 0`) e confere que ele FICOU no
 *      topo, longe do fim (senão o passo 6 mediria um estado que nunca saiu do
 *      lugar);
 *   5. provoca CONTEÚDO NOVO: clica "Próximo →" — a 2ª seção entra e é
 *      digitada (o gatilho do auto-scroll é conteúdo novo, nunca um listener de
 *      `scroll`);
 *   6. assere que o painel VOLTOU AO FIM
 *      (`scrollTop + clientHeight >= scrollHeight - folga`) DEPOIS de o
 *      conteúdo novo ter chegado (o `scrollHeight` cresceu de verdade — sem
 *      essa conferência a asserção poderia estar medindo o estado antigo).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * A MUTAÇÃO QUE ESTA SPEC MATA (medida, não deduzida)
 * ══════════════════════════════════════════════════════════════════════════
 * Reintroduzir o guard antigo da ONDA2-CHAT-NINTENDO (early-return quando o
 * aluno está longe do fim) em `handleStreamTick` E no efeito de nudge faz esta
 * spec FALHAR nos dois pontos: o painel fica no topo enquanto o texto novo é
 * digitado. A cerca de fonte antiga NÃO pegava esse mutante se ele trocasse o
 * nome das constantes; a medida no DOM pega, porque ela olha a POSIÇÃO.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * POR QUE ENCOLHER A JANELA (e por que `setMinimumSize` ANTES)
 * ══════════════════════════════════════════════════════════════════════════
 * A janela E2E nasce 1280×800 e a teoria do stub é curta: num viewport alto o
 * conteúdo NÃO transborda e o teste seria verde sem provar nada. O main cria a
 * janela com `minWidth: 900, minHeight: 600`
 * (`electron/main/index.ts:267-268`) — um `setSize(700, 480)` cru é CLAMPADO
 * silenciosamente para 900×600 e o encolhimento (a única alavanca do teste para
 * forçar overflow) não aconteceria. Por isso o probe derruba o mínimo com
 * `setMinimumSize` ANTES e CONFERE o tamanho efetivo com `getSize()`: se a
 * janela não encolheu, o spec falha alto em vez de virar verde vacuoso.
 * Nada disso toca código de produção — é controle de janela pelo MAIN, do
 * próprio teste.
 *
 * ─── O que NÃO é medido aqui (e não deveria ser) ───────────────────────────
 * A física da animação (smooth × instantâneo) e o texto do indicador
 * "tutor digitando" vivem nas specs unitárias e na e2e-lesson.spec.ts. Esta
 * spec mede POSIÇÃO DE SCROLL — o pedido do dono é sobre a tela.
 */
import { test, expect, type ElectronApplication, type Locator, type Page } from '@playwright/test';
import { launchApp, closeApp, makeWorkspaceRoot } from './helpers';

/**
 * Fatia do DOM do renderer usada dentro de `evaluate`/`waitForFunction`. O
 * tsconfig destes testes é o de NODE (`lib: ["ES2022"]`, SEM DOM) porque o
 * processo de teste é Node — mas o corpo do `evaluate` roda no RENDERER, que
 * tem DOM. Mesma técnica de `e2e-spacing.spec.ts`/`e2e-theme.spec.ts`.
 */
interface RendererElement {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  parentElement: RendererElement | null;
  textContent: string | null;
  getBoundingClientRect(): { top: number; left: number; width: number; height: number; bottom: number };
}
interface RendererDom {
  document: {
    querySelector(selector: string): RendererElement | null;
    querySelectorAll(selector: string): ArrayLike<RendererElement>;
  };
  getComputedStyle(element: RendererElement): { overflowY: string };
  /** Altura do VIEWPORT do renderer (a janela por dentro). */
  innerHeight: number;
  /** Largura do VIEWPORT do renderer (prova de que o `setSize` chegou aqui). */
  innerWidth: number;
}

/** Métricas do ROLADOR real (o PAI do `[role="log"]`) — o que a asserção morde. */
interface LogScrollerMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  /** `overflowY` computado do container medido (tem de ser auto/scroll). */
  overflowY: string;
  /** Bolhas do tutor no log (prova de que o CONTEÚDO cresceu de verdade). */
  bubbles: number;
  /** Altura do viewport do renderer — a régua de "está na tela". */
  viewportHeight: number;
  /** Topo do roladador em coordenadas do viewport. */
  rectTop: number;
  /** Altura REAL da caixa do roladador (tem de ser > 0 para a prova valer). */
  rectHeight: number;
}

/** Distância do topo do conteúdo à borda de baixo da janela visível. */
function distanceFromBottom(m: LogScrollerMetrics): number {
  return m.scrollHeight - m.clientHeight - m.scrollTop;
}

/**
 * Tamanho da janela E2E encolhida. MEDIDO (curva de tamanhos nesta máquina,
 * largura 700): 380 de altura → `clientHeight = 0` (o chrome do shell não cabe
 * e a região do chat COLAPSA — medir ali seria medir um elemento invisível);
 * 440 → 55px; 480 → 95px (overflow 157px); 520 → 135px (overflow 117px);
 * 560 → 175px (overflow 77px); 900×600 → 199px (overflow 25px, quase nada);
 * 1000×700 → overflow ZERO (o teste não teria o que rolar). 700×480 é o ponto
 * que ainda dá uma região de chat REALMENTE visível e um overflow FOLGADO.
 */
const SHRUNK_WINDOW = { width: 700, height: 480 };

/** Overflow mínimo exigido ANTES de o teste valer alguma coisa (px). */
const MIN_OVERFLOW_PX = 100;

/**
 * Altura MÍNIMA da região visível do chat. Sem esta guarda o teste passaria
 * medindo um roladador de altura ZERO (acontece de verdade nesta janela em
 * 700×380: `clientHeight = 0` e a "distância até o fim" vira uma conta
 * degenerada — `scrollTop + 0 >= scrollHeight` é verdade para qualquer
 * conteúdo). A prova só vale com o chat na tela.
 */
const MIN_CLIENT_HEIGHT_PX = 80;

/**
 * Folga da asserção de FIM. O DOM clampa `scrollTop` em
 * `scrollHeight - clientHeight`, então o estado correto é distância 0; a folga
 * cobre arredondamento sub-pixel do layout.
 */
const BOTTOM_TOLERANCE_PX = 8;

/**
 * EIXO DO CONTEÚDO NOVO: a 2ª seção da teoria do stub
 * (`electron/main/services/e2eStubs.ts` — aula 'aula-1', teoria
 * ['introducao', 'funcoes']). O texto do tutor é determinístico:
 * `Tutor E2E: <título da seção> — <markdown truncado em 80 chars>`.
 */
const SECOND_SECTION_BUBBLE = 'Tutor E2E: Funções';

let app: ElectronApplication | undefined;
let page: Page;
let wsRoot: string | undefined;

test.beforeEach(() => {
  wsRoot = makeWorkspaceRoot();
});

test.afterEach(async () => {
  if (app) await closeApp(app);
});

/**
 * Indicador "tutor digitando…" do `[role="status"]` (i18n pt/en). Varredura em
 * vez de `querySelector` no primeiro: o app tem outros `role="status"` SEMPRE
 * montados (SessionFrame, AppGate, OnboardingOverlay, ChallengeView) — o
 * primeiro da ordem do DOM não é o indicador. Predicado AUTO-CONTIDO: o
 * Playwright serializa a função e a avalia no escopo global da página (nenhuma
 * closure sobrevive).
 */
function typingIndicatorPresent(): boolean {
  const doc = (globalThis as unknown as { document?: { querySelectorAll(s: string): ArrayLike<{ textContent: string | null }> } })
    .document;
  const statuses = doc?.querySelectorAll('[role="status"]') ?? [];
  for (const el of Array.from(statuses)) {
    if (/tutor digitando|tutor typing/i.test(el.textContent ?? '')) return true;
  }
  return false;
}

/**
 * O irmão negativo. O corpo é DUPLICADO de propósito: o Playwright serializa a
 * função SOZINHA para o renderer e o escopo do módulo não viaja junto — uma
 * chamada a `typingIndicatorPresent()` aqui dentro estoura
 * `ReferenceError: typingIndicatorPresent is not defined` (medido).
 */
function typingIndicatorAbsent(): boolean {
  const doc = (globalThis as unknown as { document?: { querySelectorAll(s: string): ArrayLike<{ textContent: string | null }> } })
    .document;
  const statuses = doc?.querySelectorAll('[role="status"]') ?? [];
  for (const el of Array.from(statuses)) {
    if (/tutor digitando|tutor typing/i.test(el.textContent ?? '')) return false;
  }
  return true;
}

/**
 * Espera um ciclo COMPLETO de digitação: o indicador APARECE e depois SOME (o
 * unmount dele é a condição "texto completo no DOM" — mesmo contrato da
 * e2e-lesson.spec.ts). Precisa ser chamada LOGO APÓS o clique que dispara a
 * digitação: a janela do indicador é transiente e um "aparece" perdido trava
 * até o timeout (foi o flake documentado na ONDA3-E2E-FENCE).
 */
async function waitTypewriterCycle(page: Page): Promise<void> {
  await page.waitForFunction(typingIndicatorPresent, undefined, { polling: 'raf', timeout: 30_000 });
  await page.waitForFunction(typingIndicatorAbsent, undefined, { polling: 'raf', timeout: 60_000 });
}

/**
 * WARM-UP DO HARNESS — falha CONHECIDA do AMBIENTE, não do produto (e por isso
 * o guarda é explícito e separado do objeto do teste).
 *
 * Cada launch usa um `E2E_WORKSPACE_ROOT` NOVO (`makeWorkspaceRoot`) e o main
 * reescreve a fixture da trilha do zero: a "primeira vez" é paga em TODA
 * execução, e sob máquina carregada a 1ª chamada de IPC de uma view estoura o
 * `IPC_TIMEOUT_MS` de 10s. Medido aqui: "As trilhas não responderam a tempo"
 * (`home.tracksTimeout`) e "A aula não respondeu a tempo"
 * (`lesson.trackLoadTimeout`) — a própria UI oferece a recuperação, o botão
 * "Tentar de novo" (`common.tryAgain`), que é o caminho do aluno.
 *
 * Esta função espera o ALVO ou o alerta de timeout e usa a recuperação da UI
 * até `retries` vezes. Ela NÃO afrouxa nenhuma asserção do auto-scroll (o
 * objeto do teste): só evita que a spec morra por um warm-up que não é dela.
 */
async function waitForUiOrRetry(page: Page, target: Locator, retries = 2): Promise<void> {
  const alvo = target.first();
  const retry = page.getByRole('button', { name: 'Tentar de novo' }).first();
  for (let i = 0; i < retries; i += 1) {
    await expect
      .poll(async () => (await alvo.isVisible()) || (await retry.isVisible()), {
        timeout: 20_000,
        message:
          'nem o alvo nem o alerta de timeout do warm-up apareceram — a view não chegou a montar',
      })
      .toBe(true);
    if (await alvo.isVisible()) return;
    console.log(`[autoscroll-fim] warm-up do harness: IPC estourou o timeout — "Tentar de novo" (${i + 1}/${retries})`);
    await retry.click();
  }
  await expect(alvo).toBeVisible({ timeout: 30_000 });
}

/**
 * Abre a AULA em modo chat (Home → cartão da trilha → item da aula), dispara
 * "Começar aula" e espera a 1ª seção ser digitada inteira. Fluxo idêntico ao
 * das specs irmãs (e2e-lesson/e2e-editor) — a fixture é a mesma.
 */
async function openLessonChat(page: Page): Promise<void> {
  await page.getByRole('banner').getByText('Study Method — Tutor', { exact: false }).first().waitFor();
  await waitForUiOrRetry(page, page.getByText('Node.js do Zero', { exact: false }));
  await page.getByText('Node.js do Zero', { exact: false }).first().click();
  // A GUARDA VEM ANTES DO CLIQUE: a lista da trilha é outra carga assíncrona —
  // clicar num elemento que ainda não existe estoura os 30s do auto-wait sem
  // passar pela recuperação de warm-up.
  await waitForUiOrRetry(page, page.getByText('Aula E2E sobre funções', { exact: false }));
  await page.getByText('Aula E2E sobre funções', { exact: false }).first().click();
  await waitForUiOrRetry(page, page.getByRole('heading', { name: 'Aula E2E sobre funções' }));
  // O wait do ciclo vem IMEDIATAMENTE depois do clique (ver `waitTypewriterCycle`).
  await page.getByRole('button', { name: 'Começar aula' }).click();
  await waitTypewriterCycle(page);
}

/**
 * Encolhe a janela do Electron para forçar overflow e devolve o tamanho
 * EFETIVO. `setMinimumSize` antes do `setSize` porque o main declara
 * minWidth 900 / minHeight 600 — sem derrubar o mínimo o pedido é clampado em
 * silêncio. O chamador CONFERE o retorno (guarda anti-vacuidade).
 */
async function shrinkWindow(
  app: ElectronApplication,
  size: { width: number; height: number },
): Promise<{ width: number; height: number }> {
  return await app.evaluate(({ BrowserWindow }, dims: { width: number; height: number }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return { width: 0, height: 0 };
    win.setMinimumSize(360, 240);
    win.setSize(dims.width, dims.height);
    const [width, height] = win.getSize();
    return { width, height };
  }, size);
}

/** Lê as métricas do roladador REAL: o PAI do `[role="log"]`. */
async function readLogScroller(page: Page): Promise<LogScrollerMetrics> {
  return await page.evaluate((): LogScrollerMetrics => {
    const dom = globalThis as unknown as RendererDom;
    const log = dom.document.querySelector('[role="log"]');
    if (log === null) {
      throw new Error('e2e-autoscroll: [role="log"] não está no DOM — o chat da aula não montou');
    }
    // O PAI é quem tem `overflowY`/`scrollTop` (o `role="log"` é o filho
    // interno que cresce). Medir o filho daria verde vacuoso.
    const scroller = log.parentElement;
    if (scroller === null) {
      throw new Error('e2e-autoscroll: [role="log"] sem PAI — impossível medir o roladador');
    }
    const rect = scroller.getBoundingClientRect();
    return {
      scrollTop: scroller.scrollTop,
      scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight,
      overflowY: dom.getComputedStyle(scroller).overflowY,
      bubbles: dom.document.querySelectorAll('[role="log"] [style*="background-color"]').length,
      viewportHeight: dom.innerHeight,
      rectTop: rect.top,
      rectHeight: rect.height,
    };
  });
}

/**
 * AMOSTRA do layout para a espera de assentamento: viewport do renderer + caixa
 * do roladador. `innerWidth`/`innerHeight` são a prova de que o `setSize` da
 * janela CHEGOU ao renderer; as medidas do roladador são a prova de que a caixa
 * parou de mudar.
 */
interface LayoutSample {
  innerWidth: number;
  innerHeight: number;
  scrollHeight: number;
  clientHeight: number;
  rectTop: number;
  rectHeight: number;
  /** Assinatura estável da amostra (comparação entre dois instantes). */
  signature: string;
}

/**
 * ESPERA O LAYOUT ASSENTAR depois do `setSize` da janela — por CONDIÇÃO
 * OBSERVÁVEL, nunca por relógio.
 *
 * O DEFEITO QUE ISTO MATA (medido): aqui havia um `waitForTimeout(400)` como
 * ÚNICA sincronização entre o encolhimento da janela e a medição de layout. Sob
 * carga o layout pode não ter assentado em 400ms e a spec morria na guarda de
 * overflow (ou, pior, media uma caixa que ainda estava mudando) — um vermelho
 * barulhento que não é do produto.
 *
 * A CONDIÇÃO (duas exigências, ambas observáveis):
 *   1. o VIEWPORT do renderer já reflete o tamanho pedido
 *      (`innerWidth <= largura` e `innerHeight <= altura` — o `setSize` é menor
 *      que o quadro inicial 1280×800, então o viewport tem de CABER no pedido);
 *   2. a caixa do roladador está ESTÁVEL: a assinatura da amostra é idêntica à
 *      da amostra anterior (`expect.poll` reamostra a cada ~100ms; duas
 *      amostras consecutivas iguais = o layout parou de mexer).
 * Nenhuma das guardas anti-vacuidade que vêm depois foi afrouxada: elas seguem
 * medindo overflow REAL, elemento certo, altura visível e caixa dentro da
 * janela — e agora sobre um layout assentado.
 */
async function waitForLayoutSettled(
  page: Page,
  requested: { width: number; height: number },
): Promise<LayoutSample> {
  const sample = async (): Promise<LayoutSample> =>
    await page.evaluate((): LayoutSample => {
      const dom = globalThis as unknown as RendererDom;
      const log = dom.document.querySelector('[role="log"]');
      const scroller = log?.parentElement ?? null;
      if (scroller === null) {
        throw new Error('e2e-autoscroll: roladador do chat não encontrado para medir o layout');
      }
      const rect = scroller.getBoundingClientRect();
      const innerWidth = dom.innerWidth;
      const innerHeight = dom.innerHeight;
      return {
        innerWidth,
        innerHeight,
        scrollHeight: scroller.scrollHeight,
        clientHeight: scroller.clientHeight,
        rectTop: rect.top,
        rectHeight: rect.height,
        // Arredonda o sub-pixel: oscilação de fração de pixel não é "layout se
        // mexendo" e travaria a espera para sempre.
        signature: [
          innerWidth,
          innerHeight,
          scroller.scrollHeight,
          scroller.clientHeight,
          Math.round(rect.top),
          Math.round(rect.height),
        ].join(','),
      };
    });

  let previous: LayoutSample | null = null;
  let last: LayoutSample | null = null;
  await expect
    .poll(
      async () => {
        last = await sample();
        const fits = last.innerWidth <= requested.width && last.innerHeight <= requested.height;
        const stable = previous !== null && previous.signature === last.signature;
        previous = last;
        return fits && stable;
      },
      {
        timeout: 15_000,
        message:
          `o layout NÃO assentou depois do setSize(${requested.width}×${requested.height}): ` +
          'o viewport do renderer não caberia no tamanho pedido ou a caixa do roladador ' +
          'continuou mudando entre amostras consecutivas (medir agora daria uma caixa em movimento)',
      },
    )
    .toBe(true);
  // `last` é a amostra que satisfez a condição (o poll só retorna depois de
  // atribuí-la); a leitura abaixo é para o log/evidência.
  if (last === null) throw new Error('e2e-autoscroll: espera de layout sem amostra (não deveria acontecer)');
  return last;
}

/** Posiciona o scroll do roladador real (o PAI do `[role="log"]`). */
async function setLogScrollTop(page: Page, top: number): Promise<void> {
  await page.evaluate((value: number): void => {
    const dom = globalThis as unknown as RendererDom;
    const log = dom.document.querySelector('[role="log"]');
    const scroller = log?.parentElement ?? null;
    if (scroller === null) {
      throw new Error('e2e-autoscroll: roladador do chat não encontrado para posicionar o scroll');
    }
    scroller.scrollTop = value;
  }, top);
}

test('e2e-autoscroll-fim: painel da aula volta ao FIM com o aluno no TOPO, longe do fim', async () => {
  // A digitação da teoria é lenta de propósito (7 tps) e a spec faz DOIS ciclos
  // completos + navegação + launch: o teto default de 90s fica apertado sem
  // significar problema. O timeout é generoso mas FINITO — um travamento de
  // verdade ainda estoura.
  test.setTimeout(180_000);

  const launched = await launchApp({
    env: { E2E_GATE: 'ready', E2E_WORKSPACE_ROOT: wsRoot! },
  });
  app = launched.app;
  page = launched.page;

  // ─── 1) Aula aberta, 1ª seção digitada inteira ──────────────────────────
  await openLessonChat(page);
  await expect(page.getByText('Tutor E2E: Introdução', { exact: false })).toBeVisible();

  // ─── 2) Janela encolhida (a alavanca que CRIA o overflow) ───────────────
  const size = await shrinkWindow(app, SHRUNK_WINDOW);
  expect(
    size.width <= SHRUNK_WINDOW.width && size.height <= SHRUNK_WINDOW.height,
    `a janela E2E NÃO encolheu (getSize() = ${size.width}×${size.height}): sem isso o ` +
      'conteúdo pode não transbordar e o teste inteiro vira verde vacuoso',
  ).toBe(true);
  // O layout assentar é uma CONDIÇÃO OBSERVÁVEL (viewport do renderer no
  // tamanho novo + caixa do roladador estável entre amostras), não um
  // `waitForTimeout` cego: com 400ms fixos a medição abaixo podia pegar uma
  // caixa ainda em movimento (vermelho barulhento na guarda de overflow).
  const settled = await waitForLayoutSettled(page, SHRUNK_WINDOW);
  console.log(
    `[autoscroll-fim] layout assentado: viewport=${settled.innerWidth}x${settled.innerHeight} ` +
      `clientHeight=${settled.clientHeight} scrollHeight=${settled.scrollHeight}`,
  );

  // ─── 3) GUARDA ANTI-VACUIDADE: overflow REAL no roladador REAL ──────────
  const before = await readLogScroller(page);
  // A prova IMPRIME os números que mordeu (nada de verde mudo): sem eles não
  // há como auditar depois se o overflow era folgado ou raspando na guarda.
  console.log(
    `[autoscroll-fim] ANTES: janela=${size.width}x${size.height} viewport=${before.viewportHeight}px ` +
      `overflow=${before.scrollHeight - before.clientHeight}px scrollHeight=${before.scrollHeight} ` +
      `clientHeight=${before.clientHeight} rect=${before.rectTop}..${before.rectTop + before.rectHeight} ` +
      `overflowY=${before.overflowY} bolhas=${before.bubbles}`,
  );
  expect(
    before.overflowY,
    `o PAI do [role="log"] não é o roladador (overflowY computado = "${before.overflowY}") — ` +
      'a medida estaria no elemento errado',
  ).toMatch(/auto|scroll/);
  const overflowBefore = before.scrollHeight - before.clientHeight;
  expect(
    before.clientHeight,
    `a região do chat está SEM ALTURA VISÍVEL (clientHeight=${before.clientHeight}px, mínimo exigido=` +
      `${MIN_CLIENT_HEIGHT_PX}px): com viewport 0 a asserção de fim vira uma conta degenerada e a prova ` +
      'não vale nada. Escolha uma janela em que o chat apareça de verdade.',
  ).toBeGreaterThanOrEqual(MIN_CLIENT_HEIGHT_PX);
  // O chat tem de estar DENTRO da janela, não recortado fora dela: a caixa do
  // roladador é medida em coordenadas do viewport do renderer. Sem isto a prova
  // poderia estar falando de uma região que o aluno não vê.
  expect(
    before.rectHeight,
    `a caixa do roladador tem altura degenerada (${before.rectHeight}px) — o chat não está na tela`,
  ).toBeGreaterThanOrEqual(MIN_CLIENT_HEIGHT_PX);
  expect(
    before.rectTop >= 0 && before.rectTop + before.rectHeight <= before.viewportHeight + 1,
    `o roladador está FORA da janela (rect ${before.rectTop}..${before.rectTop + before.rectHeight} ` +
      `num viewport de ${before.viewportHeight}px) — mediria uma região invisível`,
  ).toBe(true);
  expect(
    overflowBefore,
    `SEM OVERFLOW não há o que rolar: scrollHeight=${before.scrollHeight} ` +
      `clientHeight=${before.clientHeight} (excedente=${overflowBefore}px, mínimo exigido=${MIN_OVERFLOW_PX}px). ` +
      'O teste não provaria nada neste estado — falha alto de propósito.',
  ).toBeGreaterThan(MIN_OVERFLOW_PX);

  // ─── 4) Aluno ROLA PARA O TOPO e fica lá ────────────────────────────────
  // Três posicionamentos com folga entre eles: um smooth scroll pendente
  // (o nudge do fim da digitação) poderia reancorar o painel DEPOIS do nosso
  // `scrollTop = 0` e falsear o cenário "aluno longe do fim".
  for (let i = 0; i < 3; i += 1) {
    await setLogScrollTop(page, 0);
    await page.waitForTimeout(250);
  }
  const atTop = await readLogScroller(page);
  expect(atTop.scrollTop, 'o painel não ficou no TOPO — o cenário do teste não é o do dono').toBeLessThanOrEqual(1);
  const distanceAtTop = distanceFromBottom(atTop);
  expect(
    distanceAtTop,
    `com o aluno no topo a distância até o fim tem de ser GRANDE (medida: ${distanceAtTop}px; ` +
      `scrollHeight=${atTop.scrollHeight} clientHeight=${atTop.clientHeight} scrollTop=${atTop.scrollTop}). ` +
      'Se ela for pequena, "voltar ao fim" não prova nada.',
  ).toBeGreaterThan(MIN_OVERFLOW_PX);

  // ─── 5) CONTEÚDO NOVO: "Próximo →" apresenta a 2ª seção (que é digitada) ─
  const bubblesBefore = atTop.bubbles;
  await page.getByRole('button', { name: 'Próximo →' }).click();
  await waitTypewriterCycle(page);

  // O conteúdo novo CHEGOU (prova de que a asserção abaixo mede um estado
  // novo, e não o antigo): a bolha da 2ª seção está na tela...
  await expect(page.getByText(SECOND_SECTION_BUBBLE, { exact: false })).toBeVisible();

  // ─── 6) O PAINEL VOLTOU AO FIM, sozinho, com o aluno longe dele ─────────
  // Poll no DOM (o estado "no fim" é ESTÁVEL — não é um frame transiente): a
  // cada iteração lê o roladador real e exige distância ~0 até o fim.
  await expect
    .poll(async () => distanceFromBottom(await readLogScroller(page)), {
      timeout: 20_000,
      message:
        'o painel NÃO voltou ao fim depois de entrar conteúdo novo com o aluno no topo ' +
        '(é exatamente o pedido do dono que estaria quebrado)',
    })
    .toBeLessThanOrEqual(BOTTOM_TOLERANCE_PX);

  const after = await readLogScroller(page);
  console.log(
    `[autoscroll-fim] DEPOIS: scrollTop=${after.scrollTop} distanciaAteOFim=${distanceFromBottom(after)}px ` +
      `scrollHeight=${after.scrollHeight} (era ${atTop.scrollHeight}) bolhas=${after.bubbles} (eram ${bubblesBefore}) ` +
      `— aluno estava a ${distanceAtTop}px do fim`,
  );
  // O conteúdo cresceu (o `scrollHeight` novo é maior que o de antes do
  // clique) — sem isto a asserção poderia ter passado pelo estado ANTIGO.
  expect(
    after.scrollHeight,
    `o conteúdo novo não aumentou o scrollHeight (antes=${atTop.scrollHeight}, depois=${after.scrollHeight}) — ` +
      'a asserção de fim mediria o estado antigo',
  ).toBeGreaterThan(atTop.scrollHeight);
  expect(after.bubbles, 'a bolha da 2ª seção não entrou no log').toBeGreaterThan(bubblesBefore);
  // E, no fim das contas, o aluno segue colado no fim.
  expect(distanceFromBottom(after)).toBeLessThanOrEqual(BOTTOM_TOLERANCE_PX);
});
