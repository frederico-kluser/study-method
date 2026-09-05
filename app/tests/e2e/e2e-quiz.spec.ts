/**
 * e2e-quiz.spec.ts — O CICLO DO QUIZ ADAPTATIVO NA TELA (onda3-e2e-quiz).
 *
 * A peça central do produto ("só vamos para o desafio depois que o aluno provar
 * que entendeu") tinha cobertura e2e ZERO: `grep -rn "quiz" tests/e2e/*.spec.ts`
 * voltava vazio depois de DUAS ondas de trabalho sobre o quiz. A suíte de
 * unidade é pura e não vê a tela — e já passou por ela um bug em que
 * "Próximo"/"Concluir aula" travariam PARA SEMPRE em toda aula com quiz. Esta
 * spec é a rede que faltava: ela roda o Electron de release, com o renderer de
 * produção, e olha o que o aluno olha.
 *
 * ─── O QUE É PRODUÇÃO AQUI (e o que é fixture) ────────────────────────────
 * PRODUÇÃO: o bundle do renderer inteiro (overlay, card do chat, gates), o
 * loader de trilhas do main, `buildTrackLesson`, e — nos 4 canais de quiz — o
 * SERVIÇO REAL de remediação (`createQuizRemediation`), com o prompt, a
 * validação de shape (`parseRemedialQuiz`) e o fail-closed de produção.
 * FIXTURE: só o texto que o modelo devolveria (um `chat` fake injetado no
 * serviço real — `electron/main/services/e2eStubs.ts`) e a AULA COM
 * AFIRMAÇÕES, escrita pelo teste no formato real do produto
 * (`tests/e2e/quizFixture.ts` explica por quê: a trilha que o stub materializa
 * sozinho não declara `assertions`, então sem esta aula não existe quiz na
 * tela para observar).
 *
 * ─── COMO ESTA SPEC EVITA MENTIR ──────────────────────────────────────────
 * `tools/t.sh` tem uma EMPTY-GLOB GUARD porque "um suíte inexistente nunca
 * passa verde". O mesmo espírito vale aqui:
 *   - nenhuma asserção passaria com a tela em branco: TODA verificação está
 *     ancorada em texto que só existe se a aula fixture carregou (o markdown
 *     da seção, o enunciado da afirmação, as 4 alternativas nominais);
 *   - a prova de que a resposta NÃO VAZA compara as quatro alternativas ENTRE
 *     SI, em classe do MUI e em CSS COMPUTADO (cor, fundo, borda, ícone,
 *     disabled). Um teste que só contasse ícones passaria com a certa pintada
 *     de verde;
 *   - se o app não subir, o teste FALHA (não há skip, não há degradação).
 *
 * ─── FALSIFICAÇÃO MEDIDA (o teste foi visto FALHANDO de propósito) ─────────
 * Um e2e verde que não exercita nada é pior que nenhum e2e, então estas duas
 * quebras foram INJETADAS e o teste reprovou nas duas — depois tudo foi
 * revertido (nenhum arquivo de produção ficou alterado):
 *   1. `assertions` removido da aula fixture ⇒ falha em
 *      `expect(dialog).toBeVisible()` ("element(s) not found") — a spec não
 *      passa com a tela sem quiz;
 *   2. vazamento reintroduzido em `optionVisualState` (a certa nascendo
 *      `success`/`contained`) ⇒ falha em `expect(new Set(looks).size).toBe(1)`
 *      MESMO sem ícone (2 aparências entre as 4), e em
 *      `toHaveCount(0)` do `.MuiButton-startIcon` quando o ✓ volta junto.
 *
 * ─── LIMITAÇÕES DECLARADAS (CONTRIBUTING.md: "limitação conhecida é melhor
 *     que escondida") ────────────────────────────────────────────────────────
 *  1. O CICLO COM IA FORA NÃO TEM SAÍDA PELO QUIZ. Com `E2E_QUIZ_AI=off`, o
 *     aluno que ERRA fica com a afirmação em 'explicando'/'novo-quiz-pendente'
 *     para sempre: sem quiz remediador não há o que responder, e o gate só
 *     abre com ACERTO. O teste 5 documenta o que a tela realmente faz nesse
 *     estado (diz o que faltou, oferece "Pedir de novo", não inventa
 *     explicação nem quiz, não pinta punição, não deixa spinner eterno) — e
 *     afirma explicitamente que o gate CONTINUA fechado, porque é isso que
 *     acontece. Não existe, hoje, caminho de tela que libere a aula com a IA
 *     fora depois de um erro; quem quiser esse caminho precisa criá-lo no
 *     produto (ver o handoff).
 *  2. A MAESTRIA PERSISTIDA NÃO É OBSERVÁVEL. `track:quiz-attempt` grava num
 *     store EM MEMÓRIA do processo do main e nenhuma tela lê
 *     `track:quiz-history`, então "a maestria sobreviveu ao restart" não tem
 *     como ser afirmado por esta spec. O que ELA prova é o gate em memória (a
 *     mesma condição que o botão lê) e que a gravação não interfere na tela.
 *  3. O INSTANTE "MINIMIZADO AO RESPONDER" só é estável com a IA fora. Com a IA
 *     fixture (que responde sem rede, em milissegundos), a explicação e o quiz
 *     novo voltam antes de a animação de saída do overlay terminar: o overlay
 *     mergulha e sobe. Quem prova a minimização é o teste do Esc/backdrop
 *     (estado estável + reabertura pelo card) e o do fail-closed (o ciclo para,
 *     e aí o quiz FICA fora da tela com o card da conversa assumindo o estado).
 *  4. PREFERS-REDUCED-MOTION não é exercitado (o overlay tem um caminho de
 *     entrada sem overshoot); é decisão de CSS/motion, coberta por leitura.
 */
import { test, expect, type ElectronApplication, type Page, type Locator } from '@playwright/test';
import { launchApp, closeApp, makeWorkspaceRoot } from './helpers';
import {
  ASSERTION_ONE,
  ASSERTION_TWO,
  QUIZ_LESSON_TITLE,
  QUIZ_TRACK_TITLE,
  SECTION_ONE,
  SECTION_TWO,
  quizKeyOf,
  wrongOptionIndex,
  writeQuizTrack,
} from './quizFixture';

let app: ElectronApplication | undefined;
let wsRoot: string;

test.beforeEach(() => {
  wsRoot = makeWorkspaceRoot();
  // A aula COM afirmações precisa existir no disco ANTES do app subir: o
  // `track:list` do primeiro render já a encontra.
  writeQuizTrack(wsRoot);
});

test.afterEach(async () => {
  if (app) await closeApp(app);
  app = undefined;
});

/** O overlay do quiz — pelo PAPEL e pelo nome acessível i18n, nunca por CSS. */
function quizDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Quiz da seção, sobre a tela' });
}

/** O painel da conversa (o card compacto do quiz mora nele). */
function chatLog(page: Page): Locator {
  return page.getByRole('log');
}

/**
 * O nome ACESSÍVEL de uma alternativa (`lesson.quizOptionAria` — "Opção 2 de
 * 4: …"). Clicar por ele é clicar no que o leitor de tela anuncia.
 */
function optionName(options: readonly string[], index: number): string {
  return `Opção ${index + 1} de ${options.length}: ${options[index]}`;
}

/** As 4 alternativas do card que está SOBRE A TELA. */
function optionButtons(dialog: Locator): Locator {
  return dialog.getByRole('button', { name: /^Opção \d+ de \d+: / });
}

/**
 * A "aparência" de cada alternativa, do jeito que o olho a recebe: classe do
 * MUI (variant/color viram classe), cor do texto, fundo, borda, peso, opacidade,
 * estado desabilitado e QUANTOS ícones ela carrega. Duas alternativas com a
 * mesma string aqui são indistinguíveis na tela.
 */
async function optionLooks(dialog: Locator): Promise<string[]> {
  return optionButtons(dialog).evaluateAll((els) =>
    els.map((el) => {
      // tsconfig.node.json (que cobre tests/) NÃO tem lib DOM — o acesso ao DOM
      // vai por globalThis com cast, mesmo padrão de e2e-lesson.spec.ts.
      const cs = (globalThis as unknown as { getComputedStyle: (e: unknown) => Record<string, string> }).getComputedStyle(el);
      const node = el as unknown as {
        className: string;
        disabled?: boolean;
        querySelectorAll: (s: string) => { length: number };
      };
      return [
        node.className,
        cs.color,
        cs.backgroundColor,
        cs.borderColor,
        cs.borderWidth,
        cs.fontWeight,
        cs.opacity,
        `disabled=${node.disabled === true}`,
        `svg=${node.querySelectorAll('svg').length}`,
      ].join(' | ');
    }),
  );
}

/**
 * Home → cartão da trilha do quiz → item da aula → "Começar aula". Termina com
 * a PRIMEIRA seção apresentada (o texto real dela na conversa) e o quiz da
 * afirmação ancorada nela SOBRE A TELA.
 *
 * A espera pelo diálogo é também a espera pela digitação: o card só entra em
 * cena quando a bolha da seção terminou de ser escrita (a LessonView filtra os
 * quizzes cuja âncora ainda está em `streamingIds`).
 */
async function openQuizLessonAndStart(page: Page): Promise<Locator> {
  await expect(page.getByRole('banner').getByText('Study Method — Tutor', { exact: false })).toBeVisible();
  await page.getByText(QUIZ_TRACK_TITLE, { exact: false }).first().click();
  await expect(page.getByRole('heading', { name: QUIZ_TRACK_TITLE })).toBeVisible();
  await page.getByText(QUIZ_LESSON_TITLE, { exact: false }).first().click();
  await expect(page.getByRole('heading', { name: QUIZ_LESSON_TITLE })).toBeVisible();
  await page.getByRole('button', { name: 'Começar aula' }).click();

  const dialog = quizDialog(page);
  await expect(dialog).toBeVisible({ timeout: 45_000 });
  // ÂNCORA CONTRA A TELA EM BRANCO: o texto REAL da seção 1 da aula fixture
  // (o stub do tutor devolve "Tutor E2E: <título> — <markdown>").
  await expect(page.getByText(SECTION_ONE.markdown, { exact: false }).first()).toBeVisible();
  return dialog;
}

// ─────────────────────────────────────────────────────────────────────────────

test('e2e-quiz: o quiz sobe SOBRE A TELA, reserva o lugar no chat e NÃO entrega a resposta', async () => {
  const launched = await launchApp({ env: { E2E_GATE: 'ready', E2E_WORKSPACE_ROOT: wsRoot } });
  app = launched.app;
  const page = launched.page;
  const dialog = await openQuizLessonAndStart(page);

  // (1) SOBRE A TELA: diálogo modal, com o título e a afirmação da aula.
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog.getByRole('heading', { name: 'Prove que entendeu' })).toBeVisible();
  await expect(dialog.getByText(ASSERTION_ONE.statement)).toBeVisible();
  await expect(dialog.getByText(ASSERTION_ONE.question)).toBeVisible();

  // O BACKDROP existe e cobre a tela (é ele que faz do quiz um "sobre a tela",
  // e é ele que o teste 2 clica). O card é o filho do wrapper de animação.
  const backdrop = dialog.locator('xpath=../..');
  await expect(backdrop).toHaveCSS('position', 'fixed');
  await expect(backdrop).toHaveCSS('background-color', 'rgba(8, 10, 20, 0.66)');

  // (2) O CARD COMPACTO JÁ RESERVA O LUGAR NA CONVERSA — desde a abertura, não
  // só ao minimizar (é o que impede a conversa de "pular" quando o overlay sai).
  const log = chatLog(page);
  await expect(log.getByText('Quiz rápido').first()).toBeVisible();
  await expect(log.getByText(ASSERTION_ONE.question)).toBeVisible();
  await expect(log.getByText('Este quiz está aberto sobre a tela.')).toBeVisible();

  // (3) A RESPOSTA NÃO VAZA — o defeito mais caro possível. As quatro
  // alternativas existem, estão TODAS clicáveis, e são INDISTINGUÍVEIS entre si
  // em classe + CSS computado + contagem de ícones.
  const options = optionButtons(dialog);
  await expect(options).toHaveCount(4);
  for (let i = 0; i < ASSERTION_ONE.options.length; i += 1) {
    await expect(dialog.getByRole('button', { name: optionName(ASSERTION_ONE.options, i) })).toBeEnabled();
  }
  // Nenhum ícone de veredito nasce no card (o ✓ da certa era metade do bug).
  await expect(dialog.locator('.MuiButton-startIcon')).toHaveCount(0);

  const looks = await optionLooks(dialog);
  expect(looks).toHaveLength(4);
  // A prova: UM único jeito de parecer entre as quatro. Se a certa (índice 2)
  // nascesse `contained`/`success`/com ícone, este Set teria 2 entradas.
  expect(new Set(looks).size).toBe(1);
  // E o jeito é o NEUTRO: outlined, sem svg nenhum, habilitada.
  expect(looks[0]).toContain('MuiButton-outlined');
  expect(looks[0]).toContain('svg=0');
  expect(looks[0]).toContain('disabled=false');

  // (4) O GATE está de pé desde já: a seção atual tem quiz sem acerto.
  const next = page.getByRole('button', { name: 'Próximo →' });
  await expect(next).toBeDisabled();
  await expect(
    page.getByText('O quiz desta seção ainda espera a resposta certa', { exact: false }).first(),
  ).toBeVisible();
});

test('e2e-quiz: Esc e clique no backdrop MINIMIZAM (nunca fecham) — e o card do chat reabre', async () => {
  const launched = await launchApp({ env: { E2E_GATE: 'ready', E2E_WORKSPACE_ROOT: wsRoot } });
  app = launched.app;
  const page = launched.page;
  const dialog = await openQuizLessonAndStart(page);
  const log = chatLog(page);
  const next = page.getByRole('button', { name: 'Próximo →' });
  const reopen = log.getByRole('button', { name: 'Responder' });

  // ─── Esc ───────────────────────────────────────────────────────────────
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  // MINIMIZOU, não fechou: o gate continua de pé (se o Esc FECHASSE o ciclo, o
  // aluno dispensaria a prova de entendimento com UMA TECLA) e o card compacto
  // volta a dizer que espera resposta, com o botão de reabrir.
  await expect(next).toBeDisabled();
  await expect(log.getByText('Esperando a sua resposta.')).toBeVisible();
  await expect(reopen).toBeVisible();

  await reopen.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(ASSERTION_ONE.question)).toBeVisible();

  // ─── clique no BACKDROP (canto superior esquerdo, longe do card) ────────
  await dialog.locator('xpath=../..').click({ position: { x: 8, y: 8 } });
  await expect(dialog).toBeHidden();
  await expect(next).toBeDisabled();
  await expect(log.getByText('Esperando a sua resposta.')).toBeVisible();

  // E reabre de novo — a saída é sempre reversível.
  await reopen.click();
  await expect(dialog).toBeVisible();
});

test('e2e-quiz: errar → explicação na conversa → quiz NOVO → acertar fecha o ciclo e destrava', async () => {
  test.setTimeout(120_000);
  const launched = await launchApp({ env: { E2E_GATE: 'ready', E2E_WORKSPACE_ROOT: wsRoot } });
  app = launched.app;
  const page = launched.page;
  const dialog = await openQuizLessonAndStart(page);
  const log = chatLog(page);
  const next = page.getByRole('button', { name: 'Próximo →' });

  // ERRA de propósito (a alternativa marcada é a que a explicação vai nomear).
  const erradaIdx = wrongOptionIndex(ASSERTION_ONE);
  const errada = ASSERTION_ONE.options[erradaIdx];
  await dialog.getByRole('button', { name: optionName(ASSERTION_ONE.options, erradaIdx) }).click();

  // NOTA DE HONESTIDADE (medida, não suposta): o instante MINIMIZADO não é
  // observável NESTE teste. Responder de fato minimiza (`minimizeQuizOverlay`
  // no mesmo gesto), mas a IA fixture do stub responde SEM rede — explicação e
  // quiz novo voltam em milissegundos e o overlay sobe de novo antes de a
  // animação de saída terminar. Uma asserção de "sumiu" aqui seria flaky por
  // construção. Quem prova a minimização é o teste do Esc/backdrop (estado
  // estável, com reabertura pelo card) e o teste do fail-closed (responder tira
  // o quiz da tela e o card da conversa assume o estado, porque lá o ciclo
  // para). O que ESTE teste prova da minimização é o efeito visível dela: o
  // quiz autoral SAI da tela e a geração seguinte toma o lugar.

  // ERRAR NÃO DESTRAVA (a regra que inverteu a antiga: responder já bastava).
  await expect(next).toBeDisabled();

  // A EXPLICAÇÃO ENTRA NA CONVERSA — bolha própria, com a alternativa marcada
  // nomeada e o texto que veio pelo canal (serviço REAL + chat fixture).
  await expect(
    page.getByRole('heading', { name: 'Onde essa alternativa se separa do que a seção mostra' }),
  ).toBeVisible({ timeout: 45_000 });
  await expect(log.getByText(`Alternativa marcada: ${errada}`, { exact: false })).toBeVisible({ timeout: 45_000 });
  await expect(log.getByText('não se sustenta na afirmação', { exact: false }).first()).toBeVisible({
    timeout: 45_000,
  });

  // UM QUIZ NOVO SOBE — geração 1, pergunta inédita, e o enunciado derivado da
  // afirmação original (o serviço real montou o pedido; `parseRemedialQuiz`
  // validou o formato).
  await expect(dialog).toBeVisible({ timeout: 45_000 });
  await expect(dialog.getByText('Quiz 2 desta afirmação')).toBeVisible({ timeout: 45_000 });
  // O QUIZ AUTORAL SAIU DA TELA (o efeito visível da minimização): a pergunta
  // da aula não está mais no card sobre a tela — ela ficou na conversa, dentro
  // da bolha da explicação.
  await expect(dialog.getByText(ASSERTION_ONE.question)).toHaveCount(0);
  await expect(dialog.getByText(`${ASSERTION_ONE.statement} (verificação E2E)`)).toBeVisible();
  // A pergunta do quiz novo carrega a CHAVE CANÔNICA do estado (sectionId::
  // assertionId) — prova de que o canal recebeu a chave que o gate lê.
  await expect(dialog.getByText(quizKeyOf(ASSERTION_ONE), { exact: false })).toBeVisible();

  // O quiz NOVO também não entrega a resposta.
  const remedialOptions = [0, 1, 2, 3].map((i) => `E2E alternativa ${i + 1} da geração 1`);
  await expect(optionButtons(dialog)).toHaveCount(4);
  const looksRemedial = await optionLooks(dialog);
  expect(looksRemedial).toHaveLength(4);
  expect(new Set(looksRemedial).size).toBe(1);
  expect(looksRemedial[0]).toContain('svg=0');

  // ACERTA o quiz remediador (o stub deriva a certa da geração: 1 % 4 = 1).
  await dialog.getByRole('button', { name: optionName(remedialOptions, 1) }).click();

  // O ACERTO É O ÚNICO FIM DO CICLO: o overlay FECHA, o card cheio fica na
  // conversa com o veredito, e o "Próximo" destrava.
  await expect(dialog).toBeHidden();
  await expect(log.getByText('É isso que a seção mostra.')).toBeVisible();
  await expect(next).toBeEnabled();
  await expect(
    page.getByText('O quiz desta seção ainda espera a resposta certa', { exact: false }),
  ).toHaveCount(0);
});

test('e2e-quiz: "Concluir aula" trava com quiz pendente e destrava ao dominar (aula SEM desafios)', async () => {
  test.setTimeout(120_000);
  const launched = await launchApp({ env: { E2E_GATE: 'ready', E2E_WORKSPACE_ROOT: wsRoot } });
  app = launched.app;
  const page = launched.page;
  const dialog = await openQuizLessonAndStart(page);
  const next = page.getByRole('button', { name: 'Próximo →' });

  // Domina a afirmação da seção 1 de primeira → "Próximo" abre.
  await dialog
    .getByRole('button', { name: optionName(ASSERTION_ONE.options, ASSERTION_ONE.answerIndex) })
    .click();
  await expect(dialog).toBeHidden();
  await expect(next).toBeEnabled();

  // Última seção da teoria → o quiz DELA sobe e a aula fica pronta para
  // concluir… se não fosse o quiz.
  await next.click();
  await expect(dialog).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(SECTION_TWO.markdown, { exact: false }).first()).toBeVisible();
  await expect(dialog.getByText(ASSERTION_TWO.question)).toBeVisible();

  // O GATE DE CONCLUSÃO. A aula fixture NÃO tem desafios, então o único motivo
  // possível de bloqueio é o quiz — e a tela DIZ o motivo (nada de botão morto
  // e mudo).
  const finish = page.getByRole('button', { name: 'Concluir aula' });
  await expect(finish).toBeDisabled();
  await expect(
    page.getByText('A aula conclui quando os quizzes tiverem a resposta certa', { exact: false }).first(),
  ).toBeVisible();

  // Dominar a última afirmação DESTRAVA a conclusão.
  await dialog
    .getByRole('button', { name: optionName(ASSERTION_TWO.options, ASSERTION_TWO.answerIndex) })
    .click();
  await expect(dialog).toBeHidden();
  await expect(finish).toBeEnabled();
  await expect(
    page.getByText('A aula conclui quando os quizzes tiverem a resposta certa', { exact: false }),
  ).toHaveCount(0);
});

test('e2e-quiz: FAIL-CLOSED com E2E_QUIZ_AI=off — a tela diz o que faltou, sem inventar e sem punir', async () => {
  test.setTimeout(120_000);
  const launched = await launchApp({
    // A ÚNICA diferença para os testes acima: a IA do ciclo do quiz sai do ar.
    env: { E2E_GATE: 'ready', E2E_WORKSPACE_ROOT: wsRoot, E2E_QUIZ_AI: 'off' },
  });
  app = launched.app;
  const page = launched.page;
  const dialog = await openQuizLessonAndStart(page);
  const log = chatLog(page);

  const erradaIdx = wrongOptionIndex(ASSERTION_ONE);
  await dialog.getByRole('button', { name: optionName(ASSERTION_ONE.options, erradaIdx) }).click();

  // RESPONDER MINIMIZA PARA O CHAT (o pedido literal do dono). É AQUI que a
  // minimização é observável de forma estável: com a IA fora, o ciclo para em
  // vez de subir um quiz novo em milissegundos, então o quiz fica MESMO fora da
  // tela e quem passa a contar o estado é o card compacto da conversa (abaixo).
  await expect(dialog).toBeHidden();

  // A TELA DIZ O QUE FALTOU — o aviso do canal, com o "Pedir de novo" ativo.
  const aviso = log.getByText('O quiz novo não pôde ser gerado agora', { exact: false });
  await expect(aviso).toBeVisible({ timeout: 45_000 });
  await expect(log.getByText('O ciclo parou aqui. Você pode pedir de novo.')).toBeVisible();
  const retry = log.getByRole('button', { name: 'Pedir de novo' });
  await expect(retry).toBeEnabled();

  // NÃO INVENTA CONTEÚDO: nem explicação, nem quiz novo. O fail-closed do
  // serviço real chega inteiro à tela.
  await expect(
    page.getByRole('heading', { name: 'Onde essa alternativa se separa do que a seção mostra' }),
  ).toHaveCount(0);
  await expect(page.getByText('Quiz 2 desta afirmação')).toHaveCount(0);
  await expect(dialog).toBeHidden();

  // SEM PUNIÇÃO (docs/ux-redesign.md §8 item 3: "Teste falhou → sem punição").
  // Nenhum Alert de severidade `error` na tela, e o aviso é escrito com a MESMA
  // cor do texto de estado (ambos `text.secondary`) — se ele fosse `error.main`
  // vermelho, as duas cores divergiriam.
  await expect(page.locator('.MuiAlert-colorError, .MuiAlert-standardError, .MuiAlert-filledError')).toHaveCount(0);
  const readColor = (l: Locator): Promise<string> =>
    l.evaluate(
      (el) =>
        (globalThis as unknown as { getComputedStyle: (e: unknown) => Record<string, string> }).getComputedStyle(el)
          .color,
    );
  expect(await readColor(aviso)).toBe(
    await readColor(log.getByText('O ciclo parou aqui. Você pode pedir de novo.')),
  );

  // NÃO CONGELA A TELA: nenhum "tutor digitando…" pendurado e o campo de
  // dúvida continua utilizável (o aluno segue conversando com o tutor).
  await expect(page.getByText(/tutor digitando|tutor typing/i)).toHaveCount(0);
  await expect(page.getByLabel('Sua dúvida…')).toBeEditable();

  // "Pedir de novo" repete o pedido e volta a falhar FECHADO — sem quiz
  // fabricado, sem laço de retentativa, sem travar a UI.
  await retry.click();
  await expect(aviso).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText('Quiz 2 desta afirmação')).toHaveCount(0);

  // O QUE ESTE TESTE **NÃO** PROVA (limitação 1 do cabeçalho): com a IA fora, o
  // gate CONTINUA fechado — o acerto é o único fim do ciclo e não há quiz novo
  // para acertar. A asserção abaixo registra esse fato como comportamento
  // observado, não como aprovação: é o caminho que o produto precisa decidir.
  await expect(page.getByRole('button', { name: 'Próximo →' })).toBeDisabled();
});
