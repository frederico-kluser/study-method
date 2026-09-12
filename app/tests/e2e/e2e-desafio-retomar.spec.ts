/**
 * e2e-desafio-retomar.spec.ts — R3 DO DONO, PROVADO NA GUI REAL (Electron).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O PEDIDO, AO PÉ DA LETRA
 * ══════════════════════════════════════════════════════════════════════════
 * "quando eu saio de um desafio e volto ele recomeça do zero, arrume isso
 * também".
 *
 * Até esta spec o pedido só tinha prova UNITÁRIA: `persistDraftOnUnmount`
 * (exportada de `src/views/ChallengeView/TrackChallengePanel.tsx`) e o cache de
 * sessão `src/lib/challengeDraftCache.ts` eram medidos com o cache REAL, mas
 * SEM a tela — nenhum deles prova que o ALUNO sai da aba Desafio, volta e
 * encontra a tentativa onde deixou. O que o dono pediu é sobre a TELA; é isso
 * que esta spec mede, no app BUILDADO, com o shell de produção montando só a
 * view ativa (é a troca de aba que desmonta o painel e é o unmount que salva).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O QUE ESTA SPEC FAZ (o cenário do dono, sem atalho)
 * ══════════════════════════════════════════════════════════════════════════
 *   1. Home → Trilha → aula → "Começar aula" → "Desafios" (cabeçalho) → card
 *      do desafio (o MESMO caminho de e2e-editor.spec.ts/e2e-lesson.spec.ts —
 *      reproduzido localmente para pendurar o guarda de warm-up do harness em
 *      cada carga assíncrona, ver `waitForUiOrRetry`);
 *   2. guarda o estado ANTERIOR a "Começar": relógio inicial cheio, editor
 *      AUSENTE (o CodeMirror só monta depois de "Começar");
 *   3. "Começar" → digita no `.cm-content` um MARCADOR que NÃO existe no
 *      `starterCode` da fixture (conferido ANTES de digitar — se ele já
 *      estivesse lá, a asserção de retomada seria vacuosa);
 *   4. espera o CRONÔMETRO ANDAR de verdade (poll no `[role="timer"]` até o
 *      tempo restante cair — não é um `waitForTimeout` cego) e lê o relógio;
 *   5. perde UMA estrela de propósito (blur da janela — o caminho do painel
 *      "janela perdeu foco → -1 estrela imediata") e lê a linha de estrelas;
 *   6. troca para a aba AULA e volta para a aba DESAFIO (é esta troca que
 *      desmonta o painel e dispara o save do rascunho);
 *   7. assere, na tela que voltou:
 *        (a) o editor CONTÉM o marcador (o código digitado continua lá);
 *        (b) o relógio NÃO voltou ao valor inicial — o tempo restante é MENOR
 *            que o inicial (o relógio é REGRESSIVO: `formatClock(timeLimitMs -
 *            elapsedMs)`), e ficou perto de onde estava ao sair (pausou, não
 *            correu durante a ausência);
 *        (c) NÃO existe botão "Começar" — a tentativa continua iniciada;
 *        (d) as estrelas continuam EXATAMENTE como o aluno deixou (a perdida
 *            NÃO volta e nenhuma outra some).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * POR QUE A PÁGINA NÃO PODE RECARREGAR
 * ══════════════════════════════════════════════════════════════════════════
 * O rascunho vive num Map de MÓDULO (`challengeDraftCache.ts`) — memória do
 * PROCESSO do renderer. `page.reload()` mataria o cache e a retomada falharia
 * por um motivo que não é o do dono (seria perda de memória, não de navegação).
 * Por isso a spec só usa TROCA DE ABA — e o `launchApp` do harness recarrega a
 * página UMA vez no boot (para semear o onboarding); isso acontece ANTES do
 * fluxo, com o cache ainda vazio, e não toca em nada daqui.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * AS MUTAÇÕES QUE ESTA SPEC MATA (medidas, não deduzidas)
 * ══════════════════════════════════════════════════════════════════════════
 *   - Desligar o save no unmount (um `return;` antes de
 *     `persistDraftOnUnmount(...)` no cleanup) faz a spec FALHAR: ao voltar, o
 *     painel recomeça do zero — `.cm-content` nunca aparece, "Começar" volta e
 *     o relógio volta ao valor inicial. As asserções cobrem cada um desses
 *     eixos.
 *   - DEIXAR O RELÓGIO CORRER durante a ausência (o rascunho passa a carregar o
 *     instante inicial ABSOLUTO — um `startTs` salvo no unmount — e o `loadSpec`
 *     restaura `startTsRef.current = draft.startTs` em vez de
 *     `Date.now() - draft.elapsedMs`): medido NESTA spec, o relógio perde os
 *     segundos de ausência e a asserção de PAUSA falha. (Com o `AWAY_MS`
 *     antigo de 1,5s esse mutante PASSAVA VERDE — a folga de 2s da asserção
 *     engolia a ausência; ver o bloco de `AWAY_MS`.)
 *   - DEVOLVER a estrela perdida na retomada (remover a compensação de
 *     `restoreStarTracker`, que repõe a perda explícita de blur no tracker novo):
 *     o aluno perde 1 estrela antes de sair e ela reaparece ao voltar, então a
 *     comparação "estrelas antes == depois" falha.
 */
import { test, expect, type ElectronApplication, type Locator, type Page } from '@playwright/test';
import { launchApp, closeApp, makeWorkspaceRoot } from './helpers';

/**
 * MARCADOR ÚNICO do rascunho: um comentário que NÃO existe no `starterCode` da
 * fixture (`electron/main/services/e2eStubs.ts` — 'dobro-do-numero' tem só
 * `// TODO: implemente`). A spec CONFERE essa ausência antes de digitar.
 */
const RETOMADA_MARKER = '// RETOMADA_MARKER_DO_DONO_E2E';

/**
 * Tempo que o aluno fica AUSENTE da aba Desafio (troca de aba) — ms.
 *
 * POR QUE 5s (e não 1,5s): a asserção de PAUSA compara o relógio de antes de
 * sair com o de depois de voltar com folga de 2s, e a implementação CORRETA
 * gasta ~1s dessa folga (o rascunho guarda o `elapsedMs` do ÚLTIMO TICK, então
 * a reancoragem em `Date.now() - draft.elapsedMs` devolve um relógio ~1s mais
 * novo — mais o tempo de montagem/restauração do painel).
 *
 * MEDIÇÃO DA REVISÃO ADVERSARIAL (o defeito que este valor corrige): com
 * `AWAY_MS = 1_500` a ausência era MENOR que a própria folga (1,5s < 2s) e a
 * asserção NÃO MORDIA. Um mutante que deixava o relógio CORRER durante a
 * ausência (o rascunho passa a guardar o instante inicial ABSOLUTO e o
 * `loadSpec` o restaura verbatim, em vez de reancorar em
 * `Date.now() - draft.elapsedMs`) perdia apenas 1-2 unidades — dentro da folga —
 * e a spec ficava VERDE. Ou seja: o pedido do dono ("não recomeça do zero")
 * estava provado, mas a propriedade que o cabeçalho desta spec declara
 * ("relógio PAUSADO durante a ausência") não estava.
 *
 * Com 5s a asserção MORDE: o relógio correto continua dentro da folga (~1s
 * consumido) e um relógio que corra perde os ~5s inteiros (+ montagem), muito
 * acima dos 2s tolerados.
 */
const AWAY_MS = 5_000;

/** Converte o relógio `mm:ss` em segundos restantes. */
function clockToSeconds(text: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(text);
  if (m === null) throw new Error(`relógio em formato inesperado: "${text}"`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Normaliza o texto do editor para comparar ANTES × DEPOIS: o CodeMirror
 * renderiza espaços de indentação como NBSP (`\u00a0`) e o layout pode variar
 * com a largura — a comparação é do CONTEÚDO, não do espaçamento.
 */
function normalizeCode(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
    .trim();
}

let app: ElectronApplication | undefined;
let page: Page;
let wsRoot: string | undefined;

test.beforeEach(() => {
  wsRoot = makeWorkspaceRoot();
});

test.afterEach(async () => {
  if (app) await closeApp(app);
});

/** Texto do relógio do desafio (`[role="timer"]`), já validado no formato. */
async function readTimerText(page: Page): Promise<string> {
  const el = page.locator('[role="timer"]').first();
  await el.waitFor({ state: 'visible', timeout: 15_000 });
  const text = (await el.innerText()).trim();
  // Guarda de forma: sem `mm:ss` o parse abaixo mediria lixo.
  if (!/^\d{2}:\d{2}$/.test(text)) throw new Error(`relógio em formato inesperado: "${text}"`);
  return text;
}

/** Texto do editor de código (`.cm-content`), só depois de ele montar. */
async function readEditorText(page: Page): Promise<string> {
  const editor = page.locator('.cm-content').first();
  try {
    await editor.waitFor({ state: 'visible', timeout: 15_000 });
  } catch {
    throw new Error(
      'o editor do desafio (`.cm-content`) NÃO está na tela: ou "Começar" não foi clicado, ' +
        'ou a tentativa NÃO foi retomada ao voltar para a aba Desafio (o painel voltou ao ' +
        'enunciado pré-"Começar")',
    );
  }
  return await editor.innerText();
}

/**
 * Fatia do DOM do renderer usada dentro do `evaluate` das estrelas. O tsconfig
 * destes testes é o de NODE (`lib: ["ES2022"]`, SEM DOM) — o corpo do
 * `evaluate` roda no RENDERER, que tem DOM. Mesma técnica de
 * `e2e-autoscroll-fim.spec.ts`.
 */
interface RendererStarElement {
  querySelectorAll(selector: string): ArrayLike<RendererStarElement>;
  querySelector(selector: string): RendererStarElement | null;
  getAttribute(name: string): string | null;
  parentElement: RendererStarElement | null;
  firstElementChild: RendererStarElement | null;
}
interface RendererStarDom {
  document: { querySelector(selector: string): RendererStarElement | null };
  getComputedStyle(element: RendererStarElement): { color: string };
  dispatchEvent(event: unknown): boolean;
  Event: new (type: string) => unknown;
}

/** Linha de estrelas do cabeçalho: quantas e com que cara. */
interface StarRow {
  /** Ícones na linha (tem de ser 3 — guarda anti-vacuidade). */
  count: number;
  /** Uma assinatura por estrela: `d` do `path` + cor COMPUTADA. */
  signature: string[];
}

/**
 * AS ESTRELAS DO CABEÇALHO (eixo "estrelas preservadas"): os 3 ícones
 * `StarIcon`/`StarBorderIcon` que o painel renderiza no `Box` IRMÃO do
 * `[role="timer"]` dentro do MESMO `Stack` (`TrackChallengePanel.tsx`,
 * cabeçalho: título/dificuldade à esquerda, estrelas + relógio à direita).
 *
 * POR QUE NÃO `data-testid="StarIcon"`: o MUI só emite esse atributo quando
 * `process.env.NODE_ENV !== 'production'` (`@mui/material/SvgIcon/
 * createSvgIcon.js`); esta spec roda o build de PRODUÇÃO (`npm run build` →
 * `out/renderer`), onde ele é `undefined`. A leitura é ESTRUTURAL: a linha é o
 * irmão do relógio e a identidade de cada estrela é o `d` do `path` (as formas
 * CHEIA e VAZIA têm `d` diferentes, determinísticos no bundle) + a cor
 * computada (`warning.main` na cheia, `action.disabled` na vazia).
 */
async function readStars(page: Page): Promise<StarRow> {
  return await page.evaluate((): StarRow => {
    const dom = globalThis as unknown as RendererStarDom;
    const timer = dom.document.querySelector('[role="timer"]');
    if (timer === null) {
      throw new Error('e2e-desafio-retomar: [role="timer"] não está no DOM — o painel do desafio não montou');
    }
    const row = timer.parentElement?.firstElementChild ?? null;
    if (row === null || row === timer) {
      throw new Error('e2e-desafio-retomar: o cabeçalho não tem a linha de estrelas (irmã do relógio)');
    }
    const icons = Array.from(row.querySelectorAll('svg'));
    return {
      count: icons.length,
      signature: icons.map((icon) => {
        const path = icon.querySelector('path');
        return `${path?.getAttribute('d') ?? ''}|${dom.getComputedStyle(icon).color}`;
      }),
    };
  });
}

/** Quantas estrelas da linha estão IGUAIS à referência (a 1ª da assinatura —
 *  no estado inicial do painel as 3 estão CHEIAS, então a referência é a
 *  "estrela cheia" sem precisar de cor/`d` hardcoded). */
function starsLikeReference(row: StarRow): number {
  return row.signature.filter((s) => s === row.signature[0]).length;
}

/**
 * PERDE UMA ESTRELA de propósito, pelo caminho REAL do produto: o painel
 * escuta `blur` da janela e tira 1 estrela na hora ("janela perdeu foco → -1
 * estrela imediata", `TrackChallengePanel.tsx`). O evento é despachado no
 * renderer — o app E2E sobe com janela oculta e não-focável
 * (`STUDY_METHOD_WINDOW_VISIBLE=0`, `helpers.ts`), então nenhum blur real
 * chega.
 *
 * POR QUE ISTO EXISTE: sem uma estrela PERDIDA antes de sair, "estrelas antes
 * == depois de voltar" compararia 3 cheias com 3 cheias e seria vacuoso — o
 * eixo "estrelas preservadas" só morde quando o aluno tinha menos de 3. Com a
 * perda forçada, uma retomada que DEVOLVA a estrela (tracker novo, sem repor a
 * perda explícita de blur em `restoreStarTracker`) ou que a cobre DUAS VEZES
 * falha aqui.
 */
async function loseOneStarByWindowBlur(page: Page): Promise<void> {
  await page.evaluate((): void => {
    const dom = globalThis as unknown as RendererStarDom;
    dom.dispatchEvent(new dom.Event('blur'));
  });
}

/**
 * Troca de aba pelo rail de navegação e CONFERE que a troca aconteceu (o
 * `aria-selected` do `role="tab"` é a prova — sem ela, um clique que não pegou
 * faria o teste medir a tela errada).
 */
async function switchTab(page: Page, name: 'Aula' | 'Desafio'): Promise<void> {
  const tab = page.getByRole('tab', { name, exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

/**
 * WARM-UP DO HARNESS — falha CONHECIDA do AMBIENTE, não do produto (e por isso
 * o guarda é explícito e separado do objeto do teste).
 *
 * Cada launch usa um `E2E_WORKSPACE_ROOT` NOVO (`makeWorkspaceRoot`) e o main
 * reescreve a fixture da trilha do zero: a "primeira vez" é paga em TODA
 * execução, e sob máquina carregada a 1ª chamada de IPC de uma view estoura o
 * `IPC_TIMEOUT_MS` de 10s. Medido aqui: "As trilhas não responderam a tempo"
 * (`home.tracksTimeout`) na Home e "O desafio não respondeu a tempo"
 * (`challenge.trackLoadTimeout`) no painel — a própria UI oferece a
 * recuperação, o botão "Tentar de novo" (`common.tryAgain`), que é o caminho do
 * aluno.
 *
 * Esta função espera o ALVO ou o alerta de timeout e usa a recuperação da UI
 * até `retries` vezes. Ela NÃO afrouxa nenhuma asserção da RETOMADA (o objeto
 * do teste): só evita que a spec morra por um warm-up que não é dela.
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
    console.log(`[desafio-retomar] warm-up do harness: IPC estourou o timeout — "Tentar de novo" (${i + 1}/${retries})`);
    await retry.click();
  }
  await expect(alvo).toBeVisible({ timeout: 30_000 });
}

/**
 * Caminho do ALUNO até o desafio da AULA — o MESMO de `helpers.openTrackChallenge`
 * (que é o usado por e2e-editor.spec.ts/e2e-lesson.spec.ts e segue sendo a
 * referência), reproduzido aqui porque cada carga assíncrona precisa do guarda
 * de warm-up acima. A navegação em si é idêntica, inclusive os rótulos: o botão
 * "Desafios" do CABEÇALHO abre o popover da lista (UX do dono: nada entre o
 * chat e o input) e o card do desafio leva à aba Desafio.
 */
async function openTrackChallenge(page: Page): Promise<void> {
  await page.getByRole('banner').getByText('Study Method — Tutor', { exact: false }).first().waitFor();
  // Home: cartão da trilha fixture → navega para a Trilha (setPendingTrackSlug).
  await waitForUiOrRetry(page, page.getByText('Node.js do Zero', { exact: false }));
  await page.getByText('Node.js do Zero', { exact: false }).first().click();
  // Trilha: módulo com a aula → abre o chat da aula. A GUARDA VEM ANTES DO
  // CLIQUE: a lista da trilha é outra carga assíncrona (o clique num elemento
  // que ainda não existe estoura os 30s do auto-wait sem passar pela
  // recuperação de warm-up).
  await waitForUiOrRetry(page, page.getByText('Aula E2E sobre funções', { exact: false }));
  await page.getByText('Aula E2E sobre funções', { exact: false }).first().click();
  await waitForUiOrRetry(page, page.getByRole('heading', { name: 'Aula E2E sobre funções' }));
  // Aula (chat): inicia a teoria (texto determinístico do stub).
  await page.getByRole('button', { name: 'Começar aula' }).click();
  await waitForUiOrRetry(page, page.getByText('Tutor E2E:', { exact: false }));
  await page.getByRole('button', { name: 'Desafios' }).click();
  await page.getByRole('button', { name: /O dobro do número/ }).first().click();
  // Enunciado do desafio carregado (pré-"Começar"). O título aparece no
  // cabeçalho do painel E no markdown do enunciado — usa o primeiro.
  await waitForUiOrRetry(page, page.getByRole('heading', { name: 'O dobro do número' }));
}

test('e2e-desafio-retomar: sair da aba Desafio e voltar RETOMA a tentativa (código, relógio, estrelas e "Começar")', async () => {
  // Duas navegações completas + digitação no CodeMirror + espera de relógio: o
  // teto default de 90s é apertado sem significar problema. Generoso e FINITO.
  test.setTimeout(150_000);

  const launched = await launchApp({
    env: { E2E_GATE: 'ready', E2E_WORKSPACE_ROOT: wsRoot! },
  });
  app = launched.app;
  page = launched.page;

  // ─── 1) Caminho do aluno até o desafio da aula ──────────────────────────
  await openTrackChallenge(page);

  // ─── 2) ESTADO PRÉ-TENTATIVA (o "zero" que o dono NÃO quer rever) ───────
  // O editor só monta depois de "Começar" (o cronômetro não roda antes).
  await expect(page.locator('.cm-content')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Começar', exact: true })).toBeVisible();
  const clockInitial = await readTimerText(page);
  const secondsInitial = clockToSeconds(clockInitial);

  // ─── 3) "Começar" + o código do aluno (marcador único) ──────────────────
  await page.getByRole('button', { name: 'Começar', exact: true }).click();
  const starterText = normalizeCode(await readEditorText(page));
  // GUARDA ANTI-VACUIDADE: se o marcador já estivesse no starter, a asserção
  // de retomada passaria sem nada ter sido retomado.
  expect(
    starterText,
    'o MARCADOR já existe no starterCode da fixture — a asserção de retomada não provaria nada',
  ).not.toContain(RETOMADA_MARKER);

  const editor = page.locator('.cm-content').first();
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type(RETOMADA_MARKER);
  await expect(editor).toContainText(RETOMADA_MARKER);
  const codeBefore = normalizeCode(await editor.innerText());
  expect(codeBefore).toContain(RETOMADA_MARKER);

  // ─── 4) O CRONÔMETRO ANDA (medido, não presumido) ───────────────────────
  // Poll no relógio até o tempo restante CAIR — prova que a tentativa está em
  // curso antes de sair. Um `waitForTimeout` cego não provaria nada disso.
  await expect
    .poll(async () => clockToSeconds(await readTimerText(page)), {
      timeout: 15_000,
      message: 'o cronômetro não andou depois de "Começar" — a tentativa nem começou',
    })
    .toBeLessThan(secondsInitial);
  const clockBefore = await readTimerText(page);
  const secondsBefore = clockToSeconds(clockBefore);
  console.log(
    `[desafio-retomar] inicial=${clockInitial} antesDeSair=${clockBefore} (${String(secondsBefore)}s restantes) ` +
      `codigoComMarcador=${String(codeBefore.includes(RETOMADA_MARKER))}`,
  );

  // ─── 5) PERDE UMA ESTRELA (blur da janela) antes de sair ────────────────
  // GUARDA ANTI-VACUIDADE DO EIXO DAS ESTRELAS: "antes == depois" só prova algo
  // se o aluno tiver MENOS de 3 estrelas ao sair. O painel começa com 3 cheias
  // (ícones idênticos — é isso que a 1ª asserção mede) e o blur tira 1 pelo
  // caminho REAL do produto. Sem esta perda o eixo seria 3 cheias == 3 cheias.
  const starsFull = await readStars(page);
  expect(
    starsFull.count,
    `a linha de estrelas do cabeçalho não tem 3 ícones (tem ${starsFull.count}) — a leitura estaria no elemento errado`,
  ).toBe(3);
  expect(
    starsLikeReference(starsFull),
    'as 3 estrelas do cabeçalho NÃO estão iguais (cheias) na largada — a comparação de antes × depois mediria outra coisa',
  ).toBe(3);
  await loseOneStarByWindowBlur(page);
  await expect
    .poll(async () => starsLikeReference(await readStars(page)), {
      timeout: 5_000,
      message:
        'o blur da janela NÃO tirou estrela nenhuma — o eixo "estrelas preservadas" ficaria vacuoso ' +
        '(3 cheias antes e depois) e não provaria a retomada',
    })
    .toBe(2);
  const starsBefore = await readStars(page);
  expect(
    starsLikeReference(starsBefore),
    'a perda por blur não ficou na tela (2 cheias + 1 vazia) — o estado de partida do eixo das estrelas não é o esperado',
  ).toBe(2);
  console.log(
    `[desafio-retomar] estrelas antes de sair: cheias=${String(starsLikeReference(starsBefore))}/${String(starsBefore.count)} ` +
      `(3 cheias na largada → 1 perdida por blur)`,
  );

  // ─── 6) SAI para a aba Aula e VOLTA para a aba Desafio ──────────────────
  // É a troca de aba que desmonta o TrackChallengePanel (o shell monta só a
  // view ativa) — o unmount é quem salva o rascunho.
  await switchTab(page, 'Aula');
  // GUARDA CONTRA VERDE VACUOSO: com o painel FORA do DOM, o estado local dele
  // MORREU de verdade. Se o painel continuasse montado, o código/o relógio
  // sobreviveriam por si e a spec estaria medindo a AUSÊNCIA de navegação, não
  // a retomada pelo cache. `role="timer"` só existe no TrackChallengePanel
  // (grep no src inteiro) — a contagem 0 é prova dura da desmontagem.
  await expect(
    page.locator('[role="timer"]'),
    'o painel do desafio NÃO desmontou ao trocar de aba — sem desmontagem não há retomada a provar',
  ).toHaveCount(0);
  await expect(page.locator('.cm-content')).toHaveCount(0);
  await page.waitForTimeout(AWAY_MS);
  await switchTab(page, 'Desafio');

  // A volta é ASSÍNCRONA: o painel remonta e o `track:challenge` responde de
  // novo. O guarda de warm-up cobre SÓ a carga (o enunciado, que aparece
  // independentemente de o rascunho voltar); a RESTAURAÇÃO é medida logo
  // abaixo, sem rede de proteção.
  //
  // ORDEM DAS ASSERÇÕES — do sinal mais BARATO e mais direto para o mais caro:
  //   6b) o relógio (existe nos DOIS estados: retomado e recomeçado do zero);
  //   6c) o botão "Começar" (idem);
  //   6d) as estrelas (existem nos dois estados; a perdida tem de continuar
  //       perdida);
  //   6a) o editor (só MONTA com a tentativa retomada — é a asserção mais cara).
  // Com o save do unmount desligado, a spec morre num assert EXPLÍCITO (relógio
  // ou "Começar"), e não num timeout de locator — o diagnóstico sai legível.
  await waitForUiOrRetry(page, page.getByRole('heading', { name: 'O dobro do número' }));

  // ─── 6b) O RELÓGIO NÃO REINICIOU E NÃO CORREU NA AUSÊNCIA ───────────────
  const clockAfter = await readTimerText(page);
  const secondsAfter = clockToSeconds(clockAfter);
  // Regressivo: menos tempo restante = tentativa mais antiga. O valor inicial
  // cheio é exatamente o que aparece quando o painel recomeça do zero.
  expect(
    secondsAfter,
    `o relógio VOLTOU AO INÍCIO (inicial=${clockInitial}, antes de sair=${clockBefore}, ` +
      `depois de voltar=${clockAfter}) — a tentativa recomeçou do zero em vez de retomar`,
  ).toBeLessThan(secondsInitial);
  // E PAUSOU enquanto a aba esteve fora: o tempo restante não pode ter
  // DESPENCADO durante a ausência (o painel reancora o início em
  // `Date.now() - draft.elapsedMs`).
  //
  // A FOLGA DE 2s É DELIBERADAMENTE MENOR QUE A AUSÊNCIA (`AWAY_MS = 5_000`):
  // ela cobre só o que a implementação CORRETA consome (~1s do tick + a
  // montagem/restauração do painel). MEDIÇÃO DA REVISÃO ADVERSARIAL: com a
  // ausência antiga de 1,5s a folga era MAIOR que o tempo ausente e a asserção
  // não mordia — um mutante que persistia o instante inicial ABSOLUTO no
  // rascunho e o restaurava verbatim (relógio CORRENDO durante a ausência)
  // perdia 1-2 unidades e passava verde. Com 5s de ausência ele perde ~5s
  // (+ montagem) e morre AQUI.
  expect(
    secondsAfter,
    `o relógio CORREU durante a ausência (antes de sair=${clockBefore}, depois de voltar=` +
      `${clockAfter}) — o tempo da aba fora não pode contar`,
  ).toBeGreaterThanOrEqual(secondsBefore - 2);

  // ─── 6c) A TENTATIVA CONTINUA INICIADA (nada de "Começar" de novo) ──────
  await expect(
    page.getByRole('button', { name: 'Começar', exact: true }),
    'o botão "Começar" voltou — a tentativa foi reiniciada em vez de retomada',
  ).toHaveCount(0);
  // O resto da tentativa em curso está na tela (o aluno pode continuar dali).
  await expect(page.getByRole('button', { name: 'Testar resposta', exact: true })).toBeVisible();

  // ─── 6d) AS ESTRELAS CONTINUAM COMO O ALUNO DEIXOU ──────────────────────
  // O eixo "estrelas preservadas" do plano: a estrela perdida por blur ANTES de
  // sair NÃO volta (nem some uma segunda). A comparação é da assinatura
  // COMPLETA da linha (forma do `path` + cor computada de cada ícone) — não só
  // da contagem, que não distingue cheia de vazia.
  const starsAfter = await readStars(page);
  console.log(
    `[desafio-retomar] estrelas depois de voltar: cheias=${String(starsLikeReference(starsAfter))}/${String(starsAfter.count)} ` +
      `(antes de sair: ${String(starsLikeReference(starsBefore))}/${String(starsBefore.count)})`,
  );
  expect(
    starsAfter.count,
    `a linha de estrelas do cabeçalho não tem 3 ícones depois de voltar (tem ${starsAfter.count})`,
  ).toBe(3);
  expect(
    starsAfter.signature,
    'as estrelas voltaram DIFERENTES do que o aluno deixou: a perdida por blur VOLTOU (o tracker ' +
      'novo não repôs a perda explícita) ou outra estrela sumiu na retomada',
  ).toEqual(starsBefore.signature);
  expect(
    starsLikeReference(starsAfter),
    `a quantidade de estrelas CHEIAS mudou na retomada (antes=${String(starsLikeReference(starsBefore))}, ` +
      `depois=${String(starsLikeReference(starsAfter))})`,
  ).toBe(2);

  // ─── 6a) O CÓDIGO CONTINUA LÁ (o editor só monta com a tentativa viva) ──
  const codeAfter = normalizeCode(await readEditorText(page));
  console.log(
    `[desafio-retomar] depoisDeVoltar=${clockAfter} (${String(secondsAfter)}s restantes) ` +
      `codigoComMarcador=${String(codeAfter.includes(RETOMADA_MARKER))} codigoIdentico=${String(codeAfter === codeBefore)}`,
  );
  expect(
    codeAfter,
    'o código digitado NÃO voltou ao sair e voltar da aba Desafio (o editor voltou ao starter)',
  ).toContain(RETOMADA_MARKER);
  expect(codeAfter, 'o código voltou DIFERENTE do que o aluno deixou').toBe(codeBefore);
});
