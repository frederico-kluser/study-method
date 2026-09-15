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
 * ONDA3 (veredito terminal): OS DOIS CASOS QUE ESTA SPEC GANHOU DEPOIS
 * ══════════════════════════════════════════════════════════════════════════
 * A revisão adversarial do diff INTEGRADO mediu dois defeitos que só aparecem
 * quando as peças se encontram (o rascunho da onda 1 + o destrave no MAIN da
 * onda 2 + o guard de montagem do submit). Cada um virou um caso desta spec,
 * no app BUILDADO:
 *
 *   2. VEREDITO TERMINAL SALVO VIRA BECO SEM SAÍDA (Achado 2). O `concluded`
 *      CRU ia para o rascunho e voltava restaurado — editor `readOnly` e
 *      "Testar resposta" desabilitado — e para o desafio de MÓDULO não há
 *      regeneração nenhuma ("Gerar novo desafio" exige `target !== 'module'`):
 *      o aluno ficava travado pelo resto da sessão. O caso usa o desafio do
 *      MÓDULO (é o alvo onde o defeito é BECO DE VERDADE, e o próprio revisor
 *      o mediu nele): submeter errado (veredito vermelho) → sair para a aba
 *      Aula → voltar → o CÓDIGO com o marcador continua lá, a saída do erro
 *      continua VISÍVEL, o editor volta EDITÁVEL (digita de verdade) e o
 *      "Testar resposta" volta HABILITADO — e o retry COMPLETA (segunda
 *      submissão, agora aprovada). O desafio de AULA não serviria: um submit
 *      reprovado nele FECHA o painel e navega para o chat (ONDA2 error-flow),
 *      então não existe "voltar e encontrar o vermelho" nesse alvo.
 *
 *   3. O VEREDITO DO SUBMIT SOBREVIVE AO DESMONTE NO MEIO (Achado 1). O
 *      registro da tentativa estava DEPOIS do guard de cancelamento: trocar de
 *      aba durante o submit (o rail segue clicável — o submit roda
 *      `node --test`, segundos) fazia o renderer DESCARTAR o veredito, e o
 *      unmount ainda gravava 'abandoned' por cima — com a aula JÁ marcada como
 *      concluída pelo MAIN (o submit aprovou). O caso usa o desafio da AULA
 *      (é o alvo com destrave automático): submeter a resposta CERTA e trocar
 *      de aba EM VOO (o spinner do botão prova que o submit não tinha
 *      resolvido) → o `track:lesson` lido pelo IPC REAL tem de terminar em
 *      `lastVerdict === 'passed'` (com o defeito fica 'abandoned'), coerente
 *      com a aula `done=true` e a próxima destravada na Trilha.
 *
 * ══════════════════════════════════════════════════════════════════════
 * ONDA2 (FALHA-VER-AULA): O DESAFIO TENTADO ANTES DA AULA
 * ══════════════════════════════════════════════════════════════════════
 * Pedido do dono, verbatim: "quando clico em tentar desafio e falho, posso
 * clicar para VER A AULA e não em próximo ou continuar, porque tentei o
 * desafio antes da aula — clicar nisso limpa tudo e começa a aula do início.
 * Nesse caso o aluno REFAZ O MESMO teste; somente se falhar de novo é que se
 * gera um novo desafio". O 4º caso desta spec prova o ciclo INTEIRO na GUI:
 *
 *   4. CARD DE INÍCIO DA AULA (sem "Começar aula") → "Tentar o desafio
 *      agora" → desafio da aula → submissão errada → o painel fecha e a aula
 *      reabre com a bolha de erro oferencendo "VER A AULA" — e NUNCA "Gerar
 *      novo desafio" (a 1ª falha é antes da aula). Clicar "Ver a aula" LIMPA
 *      TUDO (as bolhas do erro somem, o chat volta à bolha inicial) e o CARD
 *      reaparece com o CTA "Tentar o mesmo desafio de novo" — o MESMO
 *      challengeId. Clicá-lo reabre o desafio com o RASCUNHO retomável (o
 *      código do aluno volta, o submit volta habilitado): o retry do MESMO
 *      teste, e só uma NOVA falha geraria desafio novo.
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
 *   - ACHADO 2 — PERSISTIR O `concluded` CRU (remover `normalizeDraftForResume`
 *     do save): o caso do desafio do MÓDULO falha no editor read-only — o
 *     marcador digitado depois de voltar NÃO entra no `.cm-content` e o
 *     "Testar resposta" continua desabilitado. Medido.
 *   - ACHADO 1 — DEVOLVER o `markAttempt` para DEPOIS do guard de cancelamento:
 *     o caso do submit interrompido falha no poll do `lastVerdict`, que fica
 *     'abandoned' para sempre. Medido.
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
 * MARCADOR DO ACHADO 2: um comentário que NÃO existe no `starterCode` da
 * fixture do desafio do MÓDULO (`e2eStubs.ts` — `lib/soma.mjs` tem só
 * `// TODO: implemente`). A spec CONFERE essa ausência antes de digitar, e ele
 * é o que prova que o CÓDIGO do aluno voltou do rascunho (e não o starter).
 */
const RETOMADA_APOS_ERRO_MARKER = 'RETOMADA_APOS_ERRO_E2E';

/**
 * MARCADOR DO RETRY: digitado DEPOIS de voltar ao desafio reprovado — a prova
 * de que o editor voltou EDITÁVEL de verdade (um `readOnly` do CodeMirror não
 * deixa o texto entrar; conferir só atributo não provaria).
 */
const EDICAO_APOS_ERRO_MARKER = 'EDICAO_APOS_ERRO_E2E';

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
 *
 * ONDA-SEM-DESAFIO-NO-RAIL: só aceita destinos que AINDA têm tab no rail
 * (Início/Settings/Aula/Trilha) — a volta ao painel Desafio é pelo caminho do
 * ALUNO (popover "Desafios" da aula / card do módulo na Trilha), não pelo rail.
 */
async function switchTab(page: Page, name: 'Aula' | 'Trilha'): Promise<void> {
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

/**
 * Caminho do ALUNO até o desafio do MÓDULO (target 'module') — o MESMO de
 * `helpers.openModuleChallenge` (usado por e2e-module-challenge.spec.ts, que
 * segue sendo a referência), reproduzido aqui pelo mesmo motivo do anterior: as
 * duas cargas assíncronas (Home → Trilha) precisam do guarda de warm-up.
 * Este é o alvo do Achado 2: é o desafio que NÃO tem regeneração.
 */
async function openModuleChallenge(page: Page): Promise<void> {
  await page.getByRole('banner').getByText('Study Method — Tutor', { exact: false }).first().waitFor();
  await waitForUiOrRetry(page, page.getByText('Node.js do Zero', { exact: false }));
  await page.getByText('Node.js do Zero', { exact: false }).first().click();
  await waitForUiOrRetry(page, page.getByRole('button', { name: /Desafio do módulo/ }));
  await page.getByRole('button', { name: /Desafio do módulo/ }).first().click();
  // Enunciado do desafio do módulo carregado (pré-"Começar"). O título aparece
  // no cabeçalho do painel E no markdown do enunciado — usa o primeiro.
  await waitForUiOrRetry(page, page.getByRole('heading', { name: 'Desafio do módulo' }));
}

/**
 * ONDA2 (falha-ver-aula): caminho do ALUNO pelo CARD DE INÍCIO DA AULA — sem
 * "Começar aula", o chat está na bolha inicial e o card do desafio está logo
 * abaixo dela (a exceção do dono ao gate: quem clica aqui está pulando a
 * teoria). O clique marca a tentativa como "antes da aula"
 * (`attemptedBeforeLesson`) — é o que decide a bolha de erro depois.
 */
async function openTrackChallengeFromCard(page: Page): Promise<void> {
  await page.getByRole('banner').getByText('Study Method — Tutor', { exact: false }).first().waitFor();
  await waitForUiOrRetry(page, page.getByText('Node.js do Zero', { exact: false }));
  await page.getByText('Node.js do Zero', { exact: false }).first().click();
  await waitForUiOrRetry(page, page.getByText('Aula E2E sobre funções', { exact: false }));
  await page.getByText('Aula E2E sobre funções', { exact: false }).first().click();
  await waitForUiOrRetry(page, page.getByRole('heading', { name: 'Aula E2E sobre funções' }));
  // O nome acessível do CTA do card é a aria-label (o dono do i18n da onda 1
  // deixou a chave, esta onda a ligou): "Tentar o desafio agora: O dobro do
  // número". O título do desafio no card vem do payload.
  await waitForUiOrRetry(
    page,
    page.getByRole('button', { name: /Tentar o desafio agora: O dobro do número/ }),
  );
  await page.getByRole('button', { name: /Tentar o desafio agora/ }).first().click();
  await waitForUiOrRetry(page, page.getByRole('heading', { name: 'O dobro do número' }));
}

/**
 * Fatia da API do preload usada pelos `evaluate` desta spec. O corpo do
 * `evaluate` roda no RENDERER — que tem `window.api` exposto pelo contextBridge
 * — enquanto o tsconfig destes testes é o de NODE (`lib: ["ES2022"]`, SEM DOM);
 * a técnica é a mesma do `RendererStarDom`.
 */
interface RendererLessonView {
  challenges: { slug: string; lastVerdict: string | null }[];
}
interface RendererTrackView {
  modules: { lessons: { slug: string; done: boolean; locked: boolean }[] }[];
}
interface RendererApi {
  track: {
    lesson(input: {
      trackSlug: string;
      lessonId: string;
    }): Promise<{ ok: boolean; lesson: RendererLessonView | null }>;
    get(input: {
      trackSlug: string;
    }): Promise<{ ok: boolean; track: RendererTrackView | null }>;
  };
}
interface RendererGlobalWithApi {
  api: RendererApi;
}

/**
 * O VEREDITO GRAVADO, lido pelo CANAL REAL (`window.api.track.lesson` — o
 * MESMO IPC que a tela usa), nunca por cópia da fixture: é este `lastVerdict`
 * que o gate da aula ("Concluir aula"/`lessonFinishBlock`) lê.
 */
async function readRecordedVerdict(page: Page, challengeId: string): Promise<string | null> {
  return await page.evaluate(async (id: string): Promise<string | null> => {
    const dom = globalThis as unknown as RendererGlobalWithApi;
    const res = await dom.api.track.lesson({ trackSlug: 'nodejs-do-zero', lessonId: 'aula-1' });
    const found = res.lesson?.challenges.find((c) => c.slug === id) ?? null;
    return found === null ? null : found.lastVerdict;
  }, challengeId);
}

/**
 * O ESTADO DA AULA (e da PRÓXIMA) no detalhe da trilha (`track:get`), pelo
 * mesmo IPC. É o outro lado do Achado 1: o MAIN marca a aula como concluída no
 * submit aprovado, então `done=true` sozinho NÃO prova coerência — o que prova
 * é ele VIR ACOMPANHADO de `lastVerdict === 'passed'` na própria aula.
 */
async function readTrackLessonState(page: Page): Promise<{ done: boolean; nextLocked: boolean }> {
  return await page.evaluate(async (): Promise<{ done: boolean; nextLocked: boolean }> => {
    const dom = globalThis as unknown as RendererGlobalWithApi;
    const res = await dom.api.track.get({ trackSlug: 'nodejs-do-zero' });
    const lessons = (res.track?.modules ?? []).flatMap((m) => m.lessons);
    const aula = lessons.find((l) => l.slug === 'aula-1');
    const proxima = lessons.find((l) => l.slug === 'aula-2');
    return { done: aula?.done === true, nextLocked: proxima?.locked !== false };
  });
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
  // ONDA-SEM-DESAFIO-NO-RAIL: sem aba "Desafio" no rail, a volta é pelo MESMO
  // caminho do aluno — o popover "Desafios" do cabeçalho da aula (o card
  // reabre o painel do desafio).
  await page.getByRole('button', { name: 'Desafios' }).click();
  await page.getByRole('button', { name: /O dobro do número/ }).first().click();

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

/**
 * ACHADO 2 (revisão do diff integrado) — O VEREDITO TERMINAL SALVO NÃO PODE
 * VIRAR BECO SEM SAÍDA.
 *
 * Antes da correção, o rascunho guardava o `concluded` CRU: ao voltar, o painel
 * restaurava 'failed' e o editor ficava `readOnly`, o "Testar resposta"
 * desabilitado — e para `target === 'module'` NÃO existe regeneração ("Gerar
 * novo desafio" exige `!== 'module'`), então era beco sem saída até reiniciar o
 * app. O ALVO É O DESAFIO DO MÓDULO por isso: é onde o defeito é beco de
 * verdade (no desafio de aula, um submit reprovado fecha o painel e navega para
 * o chat — não há "vermelho na tela" para retomar).
 */
test('e2e-desafio-retomar: desafio de MÓDULO reprovado volta RETOMÁVEL (código + erro na tela, editor e submit liberados)', async () => {
  test.setTimeout(180_000);

  const launched = await launchApp({
    env: { E2E_GATE: 'ready', E2E_WORKSPACE_ROOT: wsRoot! },
  });
  app = launched.app;
  page = launched.page;

  // ─── 1) Caminho do aluno até o desafio do MÓDULO (multi-arquivo) ─────────
  await openModuleChallenge(page);
  await expect(page.locator('.cm-content')).toHaveCount(0);
  await page.getByRole('button', { name: 'Começar', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'lib/soma.mjs' })).toBeVisible();

  // ─── 2) O aluno edita o 1º arquivo (marcador) e deixa o 2º no starter ────
  // O starter dos DOIS arquivos lança 'não implementado', então a submissão
  // falha: `multiplica` (e o teste "juntos", que a chama) reprovam — 1 de 3.
  const editor = page.locator('.cm-content').first();
  const starterText = normalizeCode(await readEditorText(page));
  expect(
    starterText,
    'o MARCADOR já existe no starterCode da fixture — a asserção de retomada não provaria nada',
  ).not.toContain(RETOMADA_APOS_ERRO_MARKER);
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(`// ${RETOMADA_APOS_ERRO_MARKER}\nexport function soma(a, b) { return a + b; }`);
  await expect(editor).toContainText(RETOMADA_APOS_ERRO_MARKER);

  // ─── 3) SUBMISSÃO ERRADA → veredito VERMELHO na tela ────────────────────
  const testar = page.getByRole('button', { name: 'Testar resposta', exact: true });
  await testar.click();
  await expect(
    page.getByText('1 de 3 testes passaram', { exact: false }),
    'a submissão errada não produziu o veredito vermelho — o caso não tem o que retomar',
  ).toBeVisible({ timeout: 30_000 });

  // ─── 4) O ESTADO DO BECO SEM SAÍDA (a largada do defeito) ───────────────
  // Com o veredito terminal na tela o retry está MORTO: é este estado que a
  // retomada tem de desfazer. Guarda anti-vacuidade do caso inteiro: sem ele,
  // "o editor voltou editável" poderia estar medindo um painel que nunca
  // travou.
  await expect(
    testar,
    'o "Testar resposta" NÃO ficou desabilitado com o veredito na tela — o caso não parte do beco sem saída',
  ).toBeDisabled();

  // ─── 5) SAI para a aba Aula e VOLTA para a aba Desafio ──────────────────
  await switchTab(page, 'Aula');
  await expect(
    page.locator('[role="timer"]'),
    'o painel do desafio NÃO desmontou ao trocar de aba — sem desmontagem não há rascunho a retomar',
  ).toHaveCount(0);
  await expect(page.locator('.cm-content')).toHaveCount(0);
  // ONDA-SEM-DESAFIO-NO-RAIL: a volta ao desafio do MÓDULO é pelo MESMO
  // caminho do aluno — a Trilha (tab que continua no rail) e o card do módulo.
  await switchTab(page, 'Trilha');
  await page.getByRole('button', { name: /Desafio do módulo/ }).first().click();
  await waitForUiOrRetry(page, page.getByRole('heading', { name: 'Desafio do módulo' }));

  // ─── 6) (b) A SAÍDA DO ERRO CONTINUA VISÍVEL ────────────────────────────
  // O `result` do submit volta com o rascunho: o aluno REVÊ o que errou (a
  // razão parcial e a saída dos testes) — sem isso o retry seria às cegas.
  await expect(
    page.getByText('1 de 3 testes passaram', { exact: false }),
    'a saída/veredito do erro NÃO voltou com o rascunho — o aluno perderia a evidência do que errou',
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByText('Resultado por teste', { exact: false }),
    'o checklist por teste do erro não voltou na retomada',
  ).toBeVisible();

  // ─── 7) (a) O CÓDIGO DO ALUNO CONTINUA LÁ ───────────────────────────────
  const codeAfter = normalizeCode(await readEditorText(page));
  expect(
    codeAfter,
    'o código do aluno NÃO voltou (o editor está no starter) — o marcador digitado antes de sair sumiu',
  ).toContain(RETOMADA_APOS_ERRO_MARKER);

  // ─── 8) (c) O EDITOR VOLTOU EDITÁVEL E O SUBMIT, HABILITADO ────────────
  // O editor é medido por DIGITAÇÃO REAL (não por atributo): um `readOnly` do
  // CodeMirror mantém o `contenteditable` do DOM e mesmo assim recusa o texto —
  // é esta asserção que falha quando o `concluded` cru volta do rascunho.
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  // COMENTÁRIO (e não um identificador solto): o texto digitado entra no módulo
  // que o `node --test` vai CARREGAR no retry do passo 9 — um identificador
  // solto viraria `ReferenceError` na importação e derrubaria a submissão por
  // um motivo que não é o desta spec (medido na primeira execução).
  await page.keyboard.type(`// ${EDICAO_APOS_ERRO_MARKER}`);
  await expect(
    editor,
    'o editor voltou READ-ONLY: o texto digitado depois de voltar não entrou (é o beco sem saída do Achado 2)',
  ).toContainText(EDICAO_APOS_ERRO_MARKER);
  await expect(
    testar,
    'o "Testar resposta" continuou DESABILITADO depois de voltar — é o beco sem saída do Achado 2',
  ).toBeEnabled();
  await expect(testar, 'o botão desabilitou depois de o aluno voltar a editar').toBeEnabled();

  // ─── 9) O RETRY COMPLETA: corrigir o 2º arquivo e passar ───────────────
  // A prova final de que o caminho está ABERTO (era o retry que o beco tinha
  // matado): a submissão seguinte passa, com o `marked` restaurado dizendo a
  // verdade (o dedupe só barra o MESMO veredito).
  await page.getByRole('tab', { name: 'lib/multiplica.mjs' }).click();
  const editorMultiplica = page.locator('.cm-content').first();
  await editorMultiplica.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('export function multiplica(a, b) { return a * b; }');
  await testar.click();
  await expect(
    page.getByText('Passou com', { exact: false }),
    'o retry depois de voltar NÃO completou — o desafio de módulo reprovado continua sem saída',
  ).toBeVisible({ timeout: 30_000 });
  console.log('[desafio-retomar] Achado 2: retomada após erro → editor editável, submit liberado e retry aprovado');
});

/**
 * ACHADO 1 (revisão do diff integrado) — O VEREDITO DO SUBMIT SOBREVIVE AO
 * DESMONTE NO MEIO.
 *
 * O registro da tentativa estava DEPOIS do guard de cancelamento do submit e o
 * rail de abas segue clicável enquanto ele roda (`node --test`, segundos):
 * trocar de aba no meio fazia o renderer descartar o veredito, e o unmount
 * gravava 'abandoned' por cima — com a aula JÁ marcada como concluída pelo MAIN
 * (o submit aprovado chama `completeLessonOnChallengePass`). O estado final era
 * incoerente e determinístico: Trilha com a aula `done=true` e a aula com
 * `lastVerdict` nulo → "Concluir aula" bloqueado + badge "1 pendente".
 *
 * A medição é pelo CANAL REAL (`window.api.track.lesson`), não por pixel: é o
 * `lastVerdict` que o gate lê. Este caso é a prova de COMPORTAMENTO da correção
 * (a cerca de ordem no unitário é `tests/challengeDraftCache.test.ts`, BLOCO 3e).
 */
test('e2e-desafio-retomar: o veredito do submit SOBREVIVE à troca de aba no meio (Achado 1)', async () => {
  test.setTimeout(180_000);

  const launched = await launchApp({
    env: { E2E_GATE: 'ready', E2E_WORKSPACE_ROOT: wsRoot! },
  });
  app = launched.app;
  page = launched.page;

  // ─── 1) Desafio da AULA (o alvo com destrave automático no MAIN) ────────
  await openTrackChallenge(page);
  await page.getByRole('button', { name: 'Começar', exact: true }).click();
  const editor = page.locator('.cm-content').first();
  await expect(editor).toBeVisible();

  // Resposta CERTA + ATRASO DETERMINÍSTICO na carga do módulo: o submit vai
  // APROVAR (o MAIN conclui a aula) e vai demorar ~4s — é o análogo do cenário
  // real do defeito ("o submit roda `node --test`, segundos"). Sem o atraso a
  // corrida é decidida pela VELOCIDADE DA MÁQUINA: medido na 2ª execução do
  // gate, o submit resolveu ANTES do clique na aba e o caso mediu o caminho
  // montado (a guarda anti-vacuidade abaixo pegou, e é por isso que ela existe).
  // O `await` de topo é legal no ESM que o runner importa; o teto do exec é 30s
  // (`challengeExec.ts`) e o do canal, 45s.
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(
    'export function dobroDoNumero(n) { return n * 2; }\nawait new Promise((r) => setTimeout(r, 4000));',
  );
  // Guarda anti-vacuidade do atraso: o CodeMirror fecha parênteses sozinho ao
  // digitar — se o texto saísse mangled, o submit viraria um `SyntaxError` e o
  // caso morreria por um motivo que não é o dele.
  await expect(editor).toContainText('setTimeout(r, 4000)');

  // ─── 2) SUBMETE e troca de aba EM VOO ──────────────────────────────────
  const testar = page.getByRole('button', { name: 'Testar resposta', exact: true });
  await testar.click();
  // GUARDA DE CORRIDA: o spinner dentro do botão é o `running` do painel — é a
  // prova de que o submit NÃO tinha resolvido quando saímos. Sem ele, um submit
  // que resolvesse antes da troca de aba faria este caso medir o caminho
  // montado (e passar mesmo com o Achado 1 de volta).
  await expect(
    testar.locator('.MuiCircularProgress-root'),
    'o submit já tinha resolvido antes de sairmos da aba — a corrida foi perdida e o caso não mediria o desmonte no meio',
  ).toBeVisible({ timeout: 10_000 });
  await switchTab(page, 'Aula');
  await expect(
    page.locator('[role="timer"]'),
    'o painel do desafio NÃO desmontou no meio do submit — sem desmonte não há veredito a perder',
  ).toHaveCount(0);

  // GUARDA ANTI-VACUIDADE DA CORRIDA, no INSTANTE seguinte ao desmonte: se o
  // veredito já estivesse gravado aqui, o painel teria sido desmontado DEPOIS
  // de registrar (caminho montado) e o caso não provaria nada.
  const vereditoAoDesmontar = await readRecordedVerdict(page, 'dobro-do-numero');
  expect(
    vereditoAoDesmontar,
    'o veredito já estava gravado quando o painel desmontou — a corrida foi perdida e o caso não mede o desmonte no meio',
  ).not.toBe('passed');

  // ─── 3) O SUBMIT TERMINA COM O PAINEL FORA DA TELA ─────────────────────
  // O registro é um FATO sobre o que aconteceu: ele tem de chegar ao banco
  // mesmo com o painel desmontado. Com o Achado 1 de volta, o que fica gravado
  // é o 'abandoned' do unmount e este poll NUNCA vê 'passed'.
  await expect
    .poll(async () => await readRecordedVerdict(page, 'dobro-do-numero'), {
      timeout: 30_000,
      message:
        'o veredito do submit foi PERDIDO no desmonte (lastVerdict ficou abandoned/null) — é o Achado 1: ' +
        'a aula fica done=true na Trilha e "Concluir aula" bloqueado na própria aula',
    })
    .toBe('passed');
  console.log(
    `[desafio-retomar] Achado 1: veredito ao desmontar=${String(vereditoAoDesmontar)} → gravado=${String(await readRecordedVerdict(page, 'dobro-do-numero'))}`,
  );

  // ─── 4) O ESTADO FICA COERENTE ─────────────────────────────────────────
  // O outro lado do defeito: o MAIN concluiu a aula no submit aprovado. O que
  // a correção garante é que os DOIS lados contam a MESMA história (aula
  // concluída E desafio aprovado) — com o defeito, `done=true` vinha sozinho.
  const { done, nextLocked } = await readTrackLessonState(page);
  expect(done, 'a aula não foi concluída pelo submit aprovado (destrave automático do MAIN)').toBe(true);
  expect(nextLocked, 'a próxima aula não destravou depois do submit aprovado').toBe(false);
  expect(
    await readRecordedVerdict(page, 'dobro-do-numero'),
    'estado INCOERENTE: aula concluída na Trilha com o desafio sem veredito aprovado na aula',
  ).toBe('passed');
});

/**
 * ONDA2 (falha-ver-aula) — O CICLO INTEIRO do desafio tentado ANTES da aula.
 *
 * Fluxo do dono: card de início da aula → "Tentar o desafio agora" → falha →
 * a bolha de erro oferece "VER A AULA" (NUNCA "Gerar novo desafio" na 1ª
 * falha) → o clique LIMPA TUDO (as bolhas do erro somem; o chat volta à bolha
 * inicial) → o card reaparece com "Tentar o mesmo desafio de novo" (o MESMO
 * challengeId) → o retry reabre o desafio com o RASCUNHO retomável (o código
 * do aluno voltou, o "Testar resposta" voltou habilitado). A mutação que este
 * caso mata: oferecer "Gerar novo desafio" na bolha da 1ª falha (ou um botão
 * de avanço no lugar de "Ver a aula") — a bolha mudaria de rótulo e a
 * asserção do nome acessível morde.
 */
test('e2e-desafio-retomar: desafio tentado ANTES da aula — falha oferece "Ver a aula", que limpa o chat e reabre O MESMO desafio pelo card', async () => {
  test.setTimeout(180_000);

  const launched = await launchApp({
    env: { E2E_GATE: 'ready', E2E_WORKSPACE_ROOT: wsRoot! },
  });
  app = launched.app;
  page = launched.page;

  // ─── 1) CARD de início da aula (sem "Começar aula") → desafio ───────────
  await openTrackChallengeFromCard(page);
  await page.getByRole('button', { name: 'Começar', exact: true }).click();
  const editor = page.locator('.cm-content').first();
  await expect(editor).toBeVisible();

  // Código do aluno com marcador único (o starter é só "// TODO" — o submit
  // falha por si; o marcador prova depois que o RASCUNHO voltou no retry).
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type(RETOMADA_MARKER);
  await expect(editor).toContainText(RETOMADA_MARKER);

  // ─── 2) SUBMISSÃO ERRADA → o painel fecha e a aula reabre ───────────────
  // ONDA2 error-flow: markAttempt → reportChallengeError → navigateToLesson —
  // é o mecanismo de "Ver a aula": o aluno VOLTAR à aula, nunca a um avanço.
  await page.getByRole('button', { name: 'Testar resposta', exact: true }).click();
  await expect(
    page.getByText('Seu código falhou nos testes', { exact: false }),
    'a bolha de erro não semeou no chat da aula depois da falha',
  ).toBeVisible({ timeout: 45_000 });

  // ─── 3) A BOLHA OFERECE "Ver a aula" — e NUNCA "Gerar novo desafio" ─────
  // 1ª falha do desafio tentado antes da aula (regra do dono: só se falhar DE
  // NOVO, já depois da aula, é que se gera um novo desafio).
  const verAula = page.getByRole('button', { name: 'Ver a aula', exact: true });
  await expect(
    verAula,
    'a bolha de erro da 1ª falha (desafio tentado antes da aula) não ofereceu "Ver a aula"',
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Gerar novo desafio' }),
    'a bolha de erro ofereceu "Gerar novo desafio" na 1ª falha ANTES da aula — viola a regra do dono',
  ).toHaveCount(0);

  // ─── 4) "Ver a aula" LIMPA TUDO e a aula recomeça do início ────────────
  await verAula.click();
  // As bolhas do erro SUMIRAM (o cache de sessão do chat foi limpo junto).
  await expect(
    page.getByText('Seu código falhou nos testes', { exact: false }),
    '"Ver a aula" não limpou a conversa — as bolhas do erro continuam lá',
  ).toHaveCount(0);
  // O chat voltou à bolha inicial (a aula recomeça do início).
  await expect(page.getByRole('button', { name: 'Começar aula', exact: true })).toBeVisible();

  // ─── 5) O CARD volta com o CTA do retry do MESMO desafio ────────────────
  // O payload recarregado depois da falha traz lastVerdict 'failed' (e
  // failedCount 1) — o CTA do card muda para o retry do MESMO challengeId.
  const retryCard = page.getByRole('button', { name: 'Tentar o mesmo desafio de novo: O dobro do número' });
  await expect(
    retryCard,
    'o card não voltou com o CTA "Tentar o mesmo desafio de novo" (ou o payload chegou sem o veredito da falha)',
  ).toBeVisible({ timeout: 20_000 });

  // ─── 6) O RETRY reabre O MESMO desafio, com o rascunho retomável ────────
  await retryCard.click();
  await waitForUiOrRetry(page, page.getByRole('heading', { name: 'O dobro do número' }));
  const codeRetry = normalizeCode(await readEditorText(page));
  expect(
    codeRetry,
    'o retry pelo card NÃO preservou o código do aluno (o rascunho da tentativa falhada não voltou retomável)',
  ).toContain(RETOMADA_MARKER);
  await expect(
    page.getByRole('button', { name: 'Testar resposta', exact: true }),
    'o "Testar resposta" não voltou habilitado no retry — o rascunho voltou travado',
  ).toBeEnabled();
  console.log('[desafio-retomar] falha-ver-aula: bolha ofereceu "Ver a aula", limpou o chat e o card reabriu O MESMO desafio retomável');
});
