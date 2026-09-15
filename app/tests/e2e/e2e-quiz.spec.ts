/**
 * e2e-quiz.spec.ts — O CICLO DO QUIZ ADAPTATIVO NA TELA (onda3-e2e-quiz).
 *
 * A peça central do produto ("só vamos para o desafio depois que o aluno provar
 * que entendeu") tinha cobertura e2e ZERO: `grep -rn "quiz" tests/e2e/*.spec.ts`
 * voltava vazio depois de DUAS ondas de trabalho sobre o quiz. A suíte de
 * unidade é pura e não vê a tela — e já passou por ela um bug em que
 * "Avançar"/"Concluir aula" travariam PARA SEMPRE em toda aula com quiz. Esta
 * spec é a rede que faltava: ela roda o Electron de release, com o renderer de
 * produção, e olha o que o aluno olha.
 *
 * ─── O QUE É PRODUÇÃO AQUI (e o que é fixture) ────────────────────────────
 * ─── ONDA11: O MODAL É GESTO, NÃO CONSEQUÊNCIA ────────────────────────────
 * O dono, literal: *"tinha o texto sendo escrito, eu cliquei, e depois
 * renderizou o texto e já abriu o modal com o quiz, quero um botão de abrir
 * quiz pro usuário acionar o modal manualmente"*. Esta spec media o
 * comportamento ANTIGO: o modal subindo sozinho no fim da digitação da seção.
 * Hoje o quiz ESTACIONA na conversa (o `QuizChatCard` com o CTA "Responder") e
 * só o CLIQUE o leva para cima da tela — `openQuizByGesture`, o helper por
 * onde todo teste daqui passa. Ele espera o CTA ficar visível, o que é também
 * a espera pela digitação: o card só entra em cena quando a bolha da seção
 * terminou de ser escrita.
 *
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
 *   1. `assertions` removido da aula fixture ⇒ falha na espera do CTA
 *      "Responder" do card da conversa ("element(s) not found"), e portanto
 *      antes mesmo do diálogo — a spec não passa com a tela sem quiz;
 *   2. vazamento reintroduzido em `optionVisualState` (a certa nascendo
 *      `success`/`contained`) ⇒ falha em `expect(new Set(looks).size).toBe(1)`
 *      MESMO sem ícone (2 aparências entre as 4), e em
 *      `toHaveCount(0)` do `.MuiButton-startIcon` quando o ✓ volta junto.
 *
 * ─── LIMITAÇÕES DECLARADAS (CONTRIBUTING.md: "limitação conhecida é melhor
 *     que escondida") ────────────────────────────────────────────────────────
 *  1. [RESOLVIDA na ONDA4-SAÍDA-DO-CICLO — mantida aqui porque a história
 *     explica o teste 5.] Esta spec DESCOBRIU que o ciclo com a IA fora não
 *     tinha saída: com `E2E_QUIZ_AI=off`, o aluno que ERRAVA ficava com a
 *     afirmação em 'explicando'/'novo-quiz-pendente' PARA SEMPRE — sem quiz
 *     remediador não há o que responder, e o gate só abre com ACERTO. O teste
 *     5 terminava afirmando `Avançar` (o botão de avanço) desabilitado como comportamento
 *     OBSERVADO (nunca como aprovação), e o handoff pedia o caminho ao
 *     produto. O produto respondeu com `reopenStalledQuiz`: travado o ciclo,
 *     o aluno REABRE a mesma pergunta numa geração nova e responde de novo.
 *     O teste 5 agora percorre essa saída INTEIRA e prova as duas metades que
 *     importam — ela existe, e ela NÃO dispensa o gate (reabrir sozinho não
 *     destrava; só o ACERTO destrava). O que a spec continua NÃO cobrindo é
 *     errar a geração reaberta com a IA fora e reabrir de novo em laço: é o
 *     mesmo caminho, e a suíte pura o percorre três voltas em
 *     `tests/quizStalledExit.test.ts`.
 *  2. A MAESTRIA PERSISTIDA NÃO É OBSERVÁVEL. `track:quiz-attempt` grava num
 *     store EM MEMÓRIA do processo do main e nenhuma tela lê
 *     `track:quiz-history`, então "a maestria sobreviveu ao restart" não tem
 *     como ser afirmado por esta spec. O que ELA prova é o gate em memória (a
 *     mesma condição que o botão lê) e que a gravação não interfere na tela.
 *  3. [RESOLVIDA na ONDA11.] O INSTANTE "MINIMIZADO AO RESPONDER" só era
 *     estável com a IA fora: com a IA fixture (que responde sem rede, em
 *     milissegundos), a explicação e o quiz novo voltavam antes de a animação
 *     de saída do overlay terminar e o overlay mergulhava e subia. Agora
 *     NENHUM passo do ciclo sobe o modal — o quiz remediador chega na conversa
 *     e espera o botão —, então responder tira o quiz da tela e ele FICA fora
 *     até o próximo gesto, em todos os três testes que respondem.
 *  4. PREFERS-REDUCED-MOTION não é exercitado (o overlay tem um caminho de
 *     entrada sem overshoot); é decisão de CSS/motion, coberta por leitura.
 */
import { test, expect, type ElectronApplication, type Page, type Locator } from '@playwright/test';
import { launchApp, closeApp, makeWorkspaceRoot } from './helpers';
// A MESMA função pura que o card usa para decidir a ordem das pílulas. O spec
// não reimplementa a permutação (isso só provaria que sei copiar um algoritmo):
// ele exige que a ordem que o MÓDULO calcula seja a ordem que a TELA mostra.
import { quizOptionOrder } from '../../src/lib/quizOptionOrder';
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
 *
 * ONDA12 — POR QUE O NÚMERO SAIU DAQUI. As pílulas passaram a ser desenhadas
 * numa ORDEM DE EXIBIÇÃO permutada (`src/lib/quizOptionOrder.ts`): a resposta
 * certa era SEMPRE a primeira pílula (44 de 44 afirmações do curso com
 * `answerIndex: 0`, e nada embaralhando), e clicar sempre na primeira dominava
 * o curso sem ler. O `aria-label` acompanha a TELA — se o número continuasse
 * preso ao índice do JSON, quem navega por leitor de tela ouviria "Opção 1" na
 * certa em 44 de 44, o mesmo atalho mudado de canal.
 *
 * Consequência para este arquivo: o `index` do fixture NÃO é mais a posição
 * anunciada. O casamento passa a ser pelo TEXTO da alternativa (a identidade
 * que não muda), com o número deixado livre — assim o locator sobrevive tanto
 * à permutação de TELA quanto à normalização de posição que
 * `parseRemedialQuiz` faz no quiz remedial. O texto é escapado porque as
 * alternativas reais trazem parênteses ("dobro(4) devolve 8").
 */
function optionName(options: readonly string[], index: number): RegExp {
  const texto = options[index].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^Opção \\d+ de ${options.length}: ${texto}$`);
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
 * ONDA11 — O CTA "Responder" do card da conversa: o ÚNICO caminho que leva o
 * quiz para cima da tela.
 *
 * O pedido do dono, literal: *"tinha o texto sendo escrito, eu cliquei, e
 * depois renderizou o texto e já abriu o modal com o quiz, quero um botão de
 * abrir quiz pro usuário acionar o modal manualmente"*. Antes desta onda o
 * modal SUBIA sozinho no fim da digitação da seção — era o que esta spec
 * esperava, e é o defeito. Agora o quiz ESTACIONA na conversa e o modal é
 * gesto.
 *
 * O nome acessível é `"Responder: <pergunta>"` (o `aria-label` do QuizChatCard
 * carrega a pergunta, porque três cards com "Responder" seriam indistinguíveis
 * no leitor de tela), então o locator casa pelo PREFIXO ancorado — assim ele
 * não confunde este botão com o "Responder esta pergunta de novo" da saída do
 * ciclo travado, nem com o CTA gêmeo que a linha de ação da view desenha FORA
 * do painel da conversa.
 */
function answerCta(page: Page): Locator {
  return chatLog(page).getByRole('button', { name: /^Responder: / });
}

/**
 * Leva o quiz que espera na conversa para cima da tela — o gesto do aluno.
 * A espera pelo CTA é também a espera pela DIGITAÇÃO: o card só entra em cena
 * quando a bolha da seção terminou de ser escrita (a LessonView filtra os
 * quizzes cuja âncora ainda está em `streamingIds`).
 */
async function openQuizByGesture(page: Page): Promise<Locator> {
  const cta = answerCta(page);
  await expect(cta).toBeVisible({ timeout: 45_000 });
  await cta.click();
  const dialog = quizDialog(page);
  await expect(dialog).toBeVisible({ timeout: 45_000 });
  return dialog;
}

/**
 * Home → cartão da trilha do quiz → item da aula → "Começar aula". Termina com
 * a PRIMEIRA seção apresentada — e com o quiz dela ESPERANDO na conversa,
 * porque nada nesta base sobe o modal sem um gesto.
 */
async function startQuizLesson(page: Page): Promise<void> {
  await expect(page.getByRole('banner').getByText('Study Method — Tutor', { exact: false })).toBeVisible();
  await page.getByText(QUIZ_TRACK_TITLE, { exact: false }).first().click();
  await expect(page.getByRole('heading', { name: QUIZ_TRACK_TITLE })).toBeVisible();
  await page.getByText(QUIZ_LESSON_TITLE, { exact: false }).first().click();
  await expect(page.getByRole('heading', { name: QUIZ_LESSON_TITLE })).toBeVisible();
  await page.getByRole('button', { name: 'Começar aula' }).click();

  // ÂNCORA CONTRA A TELA EM BRANCO: o texto REAL da seção 1 da aula fixture
  // (o stub do tutor devolve "Tutor E2E: <título> — <markdown>").
  await expect(page.getByText(SECTION_ONE.markdown, { exact: false }).first()).toBeVisible({
    timeout: 45_000,
  });
}

/** `startQuizLesson` + o gesto — o começo comum de quase todo teste daqui. */
async function openQuizLessonAndStart(page: Page): Promise<Locator> {
  await startQuizLesson(page);
  return openQuizByGesture(page);
}

// ─────────────────────────────────────────────────────────────────────────────

test('e2e-quiz: o quiz ESPERA na conversa, sobe pelo BOTÃO, e NÃO entrega a resposta', async () => {
  const launched = await launchApp({ env: { E2E_GATE: 'ready', E2E_WORKSPACE_ROOT: wsRoot } });
  app = launched.app;
  const page = launched.page;

  // ONDA11 — A METADE NOVA DESTE TESTE, e o defeito que ela mata. Antes desta
  // onda o modal subia SOZINHO quando a seção terminava de ser digitada, e era
  // isso que este teste media. O dono descreveu o resultado: *"tinha o texto
  // sendo escrito, eu cliquei, e depois renderizou o texto e já abriu o modal
  // com o quiz"* — o clique para pular a digitação caía dentro do modal que
  // acabara de nascer. Agora o quiz espera na conversa, e o e2e prova as duas
  // metades: que ele NÃO está na tela antes do gesto, e que o gesto o traz.
  await startQuizLesson(page);
  await expect(answerCta(page)).toBeVisible({ timeout: 45_000 });
  await expect(quizDialog(page)).toBeHidden();

  const dialog = await openQuizByGesture(page);

  // (1) SOBRE A TELA: diálogo modal, com o título e a afirmação da aula.
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog.getByRole('heading', { name: 'Prove que entendeu' })).toBeVisible();
  await expect(dialog.getByText(ASSERTION_ONE.statement)).toBeVisible();
  await expect(dialog.getByText(ASSERTION_ONE.question)).toBeVisible();

  // O BACKDROP existe e cobre a tela (é ele que faz do quiz um "sobre a tela",
  // e é ele que o teste 2 clica). O card é o filho do wrapper de animação.
  const backdrop = dialog.locator('xpath=../..');
  await expect(backdrop).toHaveCSS('position', 'fixed');
  // O SCRIM. Esta linha PINAVA `rgba(8, 10, 20, 0.66)` — o literal cru e
  // AZULADO que a onda 12 tirou do código: ela dava carimbo de e2e a uma cor
  // que o contrato de designTokens.ts proíbe. Agora o scrim é o token
  // `palette.scrim` (preto puro a 55%), o MESMO que o MuiBackdrop, o Dialog e
  // o modal de desafio aplicam.
  //
  // A asserção mede a PROPRIEDADE, não o literal, de propósito: o valor
  // computado de um `color-mix` depende de como o Chromium serializa, e pinar
  // uma string nova só trocaria uma âncora frágil por outra. O que importa —
  // e o que o defeito violava — é que o scrim seja ACROMÁTICO (R = G = B, sem
  // tingir de azul a rampa cinza) e TRANSLÚCIDO (senão não é scrim, é uma
  // parede). Os dois são lidos do CSS computado de verdade.
  // `globalThis` com cast: tsconfig.node.json (que cobre tests/) NÃO tem lib
  // DOM — mesmo padrão de `optionLooks`, acima.
  const scrim = await backdrop.evaluate(
    (el) =>
      (
        globalThis as unknown as {
          getComputedStyle: (e: unknown) => Record<string, string>;
        }
      ).getComputedStyle(el).backgroundColor,
  );
  const canais = scrim.match(/[\d.]+/g)?.map(Number) ?? [];
  expect(canais.length, `background-color ilegível: ${scrim}`).toBeGreaterThanOrEqual(4);
  const [r, g, b, alfa] = canais;
  expect(r, `scrim com viés de matiz (${scrim}) — a rampa é cinza neutro`).toBe(g);
  expect(g, `scrim com viés de matiz (${scrim})`).toBe(b);
  expect(alfa, `scrim opaco demais ou ausente (${scrim})`).toBeGreaterThan(0.3);
  expect(alfa, `scrim precisa deixar a tela transparecer (${scrim})`).toBeLessThan(0.9);

  // (2) O CARD COMPACTO CONTINUA RESERVANDO O LUGAR NA CONVERSA enquanto o
  // modal está em cena (é o que impede a conversa de "pular" quando o overlay
  // sai) — e agora ele é também o lugar de onde o aluno o trouxe.
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

  // ─── (3b) A POSIÇÃO TAMBÉM NÃO VAZA — ponta a ponta ──────────────────────
  // O bloco acima prova que as quatro pílulas nascem IGUAIS. Elas eram, e
  // mesmo assim a resposta vazava: nas 44 afirmações do curso real o
  // `answerIndex` é 0 e nada reordenava as opções, então a certa era SEMPRE a
  // primeira pílula da tela — indistinguíveis por pixel, perfeitamente
  // distinguíveis por LUGAR. Um aluno clicando sempre na primeira dominava o
  // curso inteiro sem ler nada, e o gate de maestria virava decoração.
  //
  // Aqui se mede o que só o e2e pode medir: que a permutação calculada pelo
  // módulo puro é a que o ELECTRON REAL desenha, com o card real, o overlay
  // real e a trilha real vinda do disco. Os testes de unidade provam que a
  // função é uniforme; este prova que ela CHEGA À TELA.
  const naTela = await options.evaluateAll((els) =>
    els.map((el) => ((el as unknown as { textContent: string | null }).textContent ?? '').trim()),
  );
  const esperada = quizOptionOrder(quizKeyOf(ASSERTION_ONE), 0, ASSERTION_ONE.options.length);
  expect(naTela).toEqual(esperada.map((i) => ASSERTION_ONE.options[i]));
  // E a permutação não é a identidade disfarçada: para ESTA chave a ordem da
  // tela difere da ordem do JSON. (A verificação é dinâmica — se a semente
  // mudar e a identidade sair sorteada para esta chave, o teste diz isso em vez
  // de mentir; o piso estatístico é medido em tests/quizOptionOrder.test.ts.)
  expect(naTela, 'a tela repetiu a ordem do JSON: a permutação não chegou ao DOM').not.toEqual([
    ...ASSERTION_ONE.options,
  ]);
  // O nome ACESSÍVEL acompanha a tela: "Opção 1 de 4" é a primeira PÍLULA, não
  // o índice 0 do JSON. Sem isto o vazamento continuaria pelo leitor de tela.
  await expect(
    options.first(),
  ).toHaveAccessibleName(new RegExp(`^Opção 1 de 4: `));
  const primeira = await options.first().textContent();
  expect(primeira?.trim()).toBe(ASSERTION_ONE.options[esperada[0]]);

  // (4) O GATE está de pé desde já: a seção atual tem quiz sem acerto.
  const next = page.getByRole('button', { name: 'Avançar', exact: true });
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
  const next = page.getByRole('button', { name: 'Avançar', exact: true });
  const reopen = answerCta(page);

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

test('e2e-quiz: ao sair do modal o FOCO VOLTA para o card — nunca para o <body>', async () => {
  // ═════════════════════════════════════════════════════════════════════════
  // POR QUE ESTA PROVA É e2e, E NÃO PODE SER OUTRA COISA
  // ═════════════════════════════════════════════════════════════════════════
  // A devolução de foco (SC 2.4.3) já foi declarada pronta DUAS vezes nesta
  // base, com um arquivo de teste próprio de 138 linhas, e estava MORTA nas
  // duas. O teste que a cobria exercitava só a função pura `focusReturnTarget`
  // com nós de mentira, e o único elo com a produção era
  // `HOST.includes('focusReturnTarget(')` — uma busca de substring no fonte.
  // Duas revisões adversariais mediram, no Electron rodando, o foco caindo no
  // `<body>` enquanto aquele teste estava verde.
  //
  // A causa raiz que a substring não podia ver: o host resolvia a âncora na
  // ABERTURA, com `document.activeElement.closest(...)`. Só que o CTA que abre
  // o modal é desmontado pelo MESMO commit que liga o modal, então naquele
  // instante `activeElement` já era o `<body>`; `closest` devolvia null. E o
  // `<body>` é `instanceof HTMLElement` e está SEMPRE `isConnected`, então ele
  // passava adiante como "abridor válido" e o código chamava `body.focus()` —
  // um no-op que deixa o foco onde estava e não acusa nada.
  //
  // Este teste é a única forma honesta de provar o conserto nesta base: não há
  // jsdom, e foi exatamente fingir que havia DOM que deixou o defeito passar.
  const launched = await launchApp({ env: { E2E_GATE: 'ready', E2E_WORKSPACE_ROOT: wsRoot } });
  app = launched.app;
  const page = launched.page;
  const dialog = await openQuizLessonAndStart(page);

  // Sai pelo Esc — o caminho de teclado, que é o que a norma cobre.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  // O card renasce; é para dentro dele que o foco tem de voltar.
  await expect(answerCta(page)).toBeVisible();

  // O `tsconfig.node.json` que cobre tests/ NÃO tem a lib DOM (é a prova
  // mecânica de que os módulos puros da base não dependem de DOM), então o
  // acesso vai por `globalThis` com cast — mesmo padrão de e2e-lesson.spec.ts.
  const foco = await page.evaluate(() => {
    const doc = (globalThis as unknown as {
      document: {
        activeElement: {
          tagName: string;
          textContent: string | null;
          closest: (s: string) => unknown;
        } | null;
      };
    }).document;
    const el = doc.activeElement;
    if (el === null) return { tag: 'null', dentroDoCard: false, nome: '' };
    return {
      tag: el.tagName.toLowerCase(),
      dentroDoCard: el.closest('[data-quiz-chat-card]') !== null,
      nome: (el.textContent ?? '').trim().slice(0, 40),
    };
  });

  // A asserção que mata o defeito exato: o `<body>` não é destino.
  expect(foco.tag, `o foco caiu em <${foco.tag}> — era o defeito do body.focus()`).not.toBe('body');
  expect(
    foco.dentroDoCard,
    `o foco parou em <${foco.tag}> ("${foco.nome}"), fora do card do quiz`,
  ).toBe(true);

  // E o teclado continua de onde parou: um Enter no elemento focado reabre o
  // modal, sem o aluno ter de retravessar a tela (que é o custo real do
  // SC 2.4.3 quando ele é violado).
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
});

test('e2e-quiz: errar → explicação na conversa → quiz NOVO → acertar fecha o ciclo e destrava', async () => {
  test.setTimeout(120_000);
  const launched = await launchApp({ env: { E2E_GATE: 'ready', E2E_WORKSPACE_ROOT: wsRoot } });
  app = launched.app;
  const page = launched.page;
  const dialog = await openQuizLessonAndStart(page);
  const log = chatLog(page);
  const next = page.getByRole('button', { name: 'Avançar', exact: true });

  // ERRA de propósito (a alternativa marcada é a que a explicação vai nomear).
  const erradaIdx = wrongOptionIndex(ASSERTION_ONE);
  const errada = ASSERTION_ONE.options[erradaIdx];
  await dialog.getByRole('button', { name: optionName(ASSERTION_ONE.options, erradaIdx) }).click();

  // ONDA16-VEREDITO (o dono: "quando respondo um quiz quero antes dele sumir
  // ver se acertei ou errei e efeito"): o overlay FICA sobre a tela por uma
  // janela perceptível (QUIZ_VERDICT_MS) mostrando o veredito do card
  // respondido — o vermelho + o feedback aparecem ANTES de o card descer.
  // O `toBeHidden` logo abaixo continua valendo: Playwright espera a janela
  // acabar e o minimize acontecer.
  await expect(
    dialog.getByText('Essa alternativa se separa do que a seção mostra.', { exact: true }),
  ).toBeVisible();

  // ONDA11 — A NOTA DE HONESTIDADE ANTERIOR CADUCOU, e para melhor. Ela dizia
  // que o instante MINIMIZADO não era observável aqui: a IA fixture responde
  // sem rede, o quiz novo voltava em milissegundos e o overlay "mergulhava e
  // subia" antes de a animação de saída terminar. Agora NENHUM passo do ciclo
  // sobe o modal — nem um quiz remediador chegando por cima da explicação que
  // o aluno está lendo —, então responder tira o quiz da tela e ele FICA fora
  // até o próximo gesto. A minimização passa a ser observável neste teste
  // também, e é o que a linha abaixo mede.

  await expect(dialog).toBeHidden();

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

  // UM QUIZ NOVO CHEGA — geração 1, pergunta inédita, e o enunciado derivado da
  // afirmação original (o serviço real montou o pedido; `parseRemedialQuiz`
  // validou o formato). ONDA11: ele chega NA CONVERSA, com o CTA — a
  // explicação que o aluno está lendo não é coberta por um modal — e sobe pelo
  // MESMO gesto do quiz autoral.
  await expect(dialog).toBeHidden();
  await openQuizByGesture(page);
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

  // ACERTA o quiz remediador. O stub deriva a certa da GERAÇÃO (1 % 4 = 1),
  // então a alternativa certa é a de TEXTO "…alternativa 2 da geração 1".
  // ONDA12: o ÍNDICE dela no dado já não é 1 (`parseRemedialQuiz` rotaciona
  // para a posição que o produto exige) e a POSIÇÃO na tela também não
  // (`quizOptionOrder` permuta a exibição) — por isso o clique é pelo TEXTO,
  // que é a única coisa que as duas transformações preservam.
  await dialog.getByRole('button', { name: optionName(remedialOptions, 1) }).click();

  // O ACERTO É O ÚNICO FIM DO CICLO: o overlay FECHA, o card cheio fica na
  // conversa com o veredito, e o "Avançar" destrava.
  // ONDA16-VEREDITO: o ACERTO também é mostrado na janela antes do overlay
  // sair — o verde com o CheckCircle aparece antes do minimize/fechamento.
  await expect(dialog.getByText('É isso que a seção mostra.', { exact: true })).toBeVisible();
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
  const next = page.getByRole('button', { name: 'Avançar', exact: true });

  // Domina a afirmação da seção 1 de primeira → "Avançar" abre.
  await dialog
    .getByRole('button', { name: optionName(ASSERTION_ONE.options, ASSERTION_ONE.answerIndex) })
    .click();
  await expect(dialog).toBeHidden();
  await expect(next).toBeEnabled();

  // Última seção da teoria → o quiz DELA espera na conversa, sobe pelo gesto, e
  // a aula fica pronta para concluir… se não fosse o quiz.
  await next.click();
  await expect(page.getByText(SECTION_TWO.markdown, { exact: false }).first()).toBeVisible({
    timeout: 45_000,
  });
  await openQuizByGesture(page);
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
  // ONDA16-VEREDITO: mesmo com a IA fora, o veredito aparece PRIMEIRO (a
  // janela não depende da IA — o veredito é desenhado pelo estado local).
  await expect(
    dialog.getByText('Essa alternativa se separa do que a seção mostra.', { exact: true }),
  ).toBeVisible();
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

  // ─── ONDA4-SAÍDA-DO-CICLO: o ciclo travado TEM saída, e ela não é o gate ──
  // O QUE ESTE BLOCO SUBSTITUI: até esta onda o teste terminava aqui, com um
  // `await expect(next).toBeDisabled()` solitário — o registro de que, com a
  // IA fora, NENHUM clique da tela mudava a situação do aluno. Era um fato
  // observado, não uma aprovação, e o handoff da spec pedia o caminho ao
  // produto. O caminho existe agora, e o teste percorre os dois lados dele.
  const next = page.getByRole('button', { name: 'Avançar', exact: true });
  await expect(next).toBeDisabled();

  // (a) A SAÍDA EXISTE, e ela NÃO depende da IA que está fora. O botão vive no
  // card compacto da conversa, ao lado do "Pedir de novo" que acabou de falhar.
  const reabrir = log.getByRole('button', { name: 'Responder esta pergunta de novo' });
  await expect(reabrir).toBeEnabled();
  await reabrir.click();

  // A MESMA pergunta volta SOBRE A TELA, numa geração nova (o rótulo "Quiz 2"
  // é a geração; a pergunta é a da aula, não uma inventada — a IA continua
  // fora e nada foi fabricado).
  //
  // ONDA11 — E ELA VOLTA **NO CLIQUE**, sem um segundo gesto. Este é o ponto
  // que a integração das quatro entregas paralelas quase perdeu: "só o gesto
  // abre" foi implementado com um guard que compara quiz E GERAÇÃO, e a saída
  // do ciclo travado cria uma geração NOVA — o efeito do ciclo tratava o card
  // recém-nascido como "quiz chegando" e o estacionava na conversa, fazendo o
  // modal SUMIR no clique de um botão escrito "Responder". O conserto está em
  // `handleQuizReopenGeneration` (LessonView), que agora termina em
  // `openQuizOverlay` com o contexto da geração nova.
  await expect(dialog).toBeVisible({ timeout: 45_000 });
  await expect(dialog.getByText('Quiz 2 desta afirmação')).toBeVisible();
  await expect(dialog.getByText(ASSERTION_ONE.question)).toBeVisible();

  // (b) O GATE **NÃO** FOI DISPENSADO. Reabrir devolve a chance de responder,
  // nunca a aprovação: enquanto não houver ACERTO, "Avançar" segue fechado.
  await expect(next).toBeDisabled();

  // E a geração REABERTA também não entrega a resposta — o invariante da
  // ONDA10 vale para ela igual: as quatro alternativas nascem indistinguíveis,
  // em classe do MUI e em CSS computado. (O invariante NA MÁQUINA PURA — que
  // `optionVisualStateForGeneration` não acharia a tentativa da geração antiga
  // e não pintaria a certa — é medido com getter-espião em
  // tests/quizStalledExit.test.ts, seção 4; aqui se mede o PIXEL.)
  const looksReaberto = await optionLooks(dialog);
  expect(looksReaberto).toHaveLength(4);
  expect(new Set(looksReaberto).size).toBe(1);
  expect(looksReaberto[0]).toContain('svg=0');
  expect(looksReaberto[0]).toContain('disabled=false');
  await expect(dialog.locator('.MuiButton-startIcon')).toHaveCount(0);

  // (c) O ACERTO — o único fim do ciclo — destrava, com a IA AINDA fora do ar.
  await dialog
    .getByRole('button', { name: optionName(ASSERTION_ONE.options, ASSERTION_ONE.answerIndex) })
    .click();
  await expect(dialog).toBeHidden();
  await expect(next).toBeEnabled();
  await expect(
    page.getByText('O quiz desta seção ainda espera a resposta certa', { exact: false }),
  ).toHaveCount(0);
});
