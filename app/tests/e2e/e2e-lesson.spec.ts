/**
 * e2e-lesson.spec.ts — TRILHA → AULA em modo CHAT (rodada 8 + ONDA2-imessage).
 *
 * O aluno NÃO gera mais aula: a Home mostra as TRILHAS (fixture do harness
 * E2E), a Trilha lista os itens já prontos e a aula é um chat com o tutor.
 * Asserts do fluxo novo:
 *   - Home mostra o cartão da trilha (com contagem de aulas);
 *   - a Trilha abre com módulos/aulas pré-carregados (item já existe, sem
 *     geração) e o teste de proficiência disponível;
 *   - a aula abre como CHAT: "Começar aula" → mensagem do tutor (stub
 *     determinístico) → "Próximo" → segunda seção → "Concluir aula";
 *   - as FONTES ficam atrás do botão "Fontes" (nunca no fluxo);
 *   - os DESAFIOS da aula ficam atrás do botão "Desafios" do cabeçalho
 *     (popover com a lista — card clicável → aba Desafio); nada entre o
 *     chat e o input.
 * No modo E2E o tutor é stub (sem LLM/rede).
 *
 * ONDA2-IMESSAGE (streaming + gating — ajuste REGISTRADO do REPLAN):
 *   - as DUAS asserções `toHaveCount(0)` de "tutor digitando" foram
 *     INVERTIDAS pelo streaming: 'next' agora DIGITA a resposta (~100 tps,
 *     ~400 chars/s — o stub devolve "Tutor E2E: <título> — <markdown
 *     truncado>"), então o indicador APARECE durante a digitação e SÓ some
 *     quando o texto COMPLETO foi digitado (mount condicional). A espera do
 *     texto completo virou: mensagem visível → indicador APARECE → indicador
 *     SOME (o unmount do indicador É a condição "typewriterIsDone" — o stub
 *     é determinístico e o texto final fica íntegro no histórico);
 *   - GATING do "Concluir aula" (REPLAN): com o desafio "O dobro do número"
 *     NUNCA tentado (lastVerdict null no payload track.lesson), "Concluir
 *     aula" fica DESABILITADO com tooltip "Conclua os desafios desta aula
 *     primeiro" (via hover). DEPOIS o desafio é PASSADO (fluxo padrão:
 *     Começar → resposta certa → Testar resposta → "Passou com") e a aula é
 *     REABERTA pela Trilha (o chat volta do CACHE — mensagens completas, sem
 *     redigitar).
 *   - LIMITAÇÃO DO HARNESS E2E (documentada no fim da spec — ajuste
 *     REGISTRADO do REPLAN): o stub do main NÃO persiste vereditos nem
 *     lessonDone (buildE2ETrackRepo é em memória por chamada — electron/main
 *     está FORA do escopo desta onda), então o galho "HABILITADO" do gating
 *     NÃO é observável em e2e: após passar o desafio, a re-busca de
 *     track.lesson devolve lastVerdict null (mesma aula segue desabilitada) e
 *     a única aula da fixture sem desafios ('Aula E2E seguinte') está LOCKED.
 *     Os dois galhos liberados ("sem desafios" e "todos passed") são cobertos
 *     pelos unit tests de isLessonFinishBlocked (tests/trackLessonState.test.ts).
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, closeApp, makeWorkspaceRoot } from './helpers';

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
 * ONDA2-IMESSAGE: espera o texto COMPLETO do stub ser digitado — o indicador
 * "tutor digitando…" é montado SÓ durante a digitação (mount condicional) e o
 * unmount dele É a condição "typewriterIsDone" (o texto completo está no
 * DOM). Sem fixture-knowledge: o stub é determinístico, mas o contrato forte
 * é o próprio indicador (nunca casamos texto oculto — ele não existe fora da
 * digitação).
 *
 * ONDA3-E2E-FENCE (fix do flake): `toBeVisible` do indicador era polado via
 * CDP a cada ~100ms — o indicador é TRANSIENTE (mensagens do stub com 62-95
 * chars a ~400 chars/s = janela de ~155-240ms) e UM poll perdido virava
 * falha dura. Trocamos por `waitForFunction` com `polling: 'raf'` (roda NO
 * RENDERER a ~16ms — ~12 amostras dentro da janela). O predicado casa o
 * TEXT CONTENT do `[role="status"]` com o texto i18n (pt/en) — NUNCA o role
 * sozinho (o app tem outros role=status SEMPRE montados: SessionFrame,
 * AppGate, OnboardingOverlay, ChallengeView). O predicado é auto-contido
 * (sem closure): o Playwright serializa a função e a avalia no escopo
 * global da página. O `undefined` explícito é o arg (senão o objeto de
 * options seria interpretado como arg).
 */
async function waitFullTypewriter(page: Page): Promise<void> {
  // APARECE: o indicador monta durante a digitação (janela transiente).
  await page.waitForFunction(
    () => {
      // tsconfig.node.json (que cobre tests/) NÃO tem lib DOM — o acesso ao
      // DOM usa globalThis com cast explícito (o Playwright transpila o spec
      // com esbuild: o `as any` some e o browser recebe `globalThis.document`).
      // querySelectorAll + varredura: o PRIMEIRO [role="status"] na ordem do
      // DOM é o do SessionFrame (SEMPRE montado, sem o texto do indicador) —
      // querySelector só no primeiro elemento nunca alcançaria o indicador.
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
  // SOME: o unmount do indicador É a condição "typewriterIsDone" (se a
  // digitação terminou entre as duas esperas, o predicado já nasce true).
  await page.waitForFunction(
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

test('e2e-lesson: trilha → aula em chat (teoria progressiva + fontes + desafios + gating)', async () => {
  const launched = await launchApp({
    env: { E2E_GATE: 'ready', E2E_WORKSPACE_ROOT: wsRoot! },
  });
  app = launched.app;
  page = launched.page;

  await expect(page.getByRole('banner').getByText('Study Method — Tutor', { exact: false })).toBeVisible();

  // Home: a TRILHA já aparece como cartão (conteúdo pronto, nada a gerar).
  await expect(page.getByText('Node.js do Zero', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Trilhas', { exact: true }).first()).toBeVisible();

  // Abre a trilha → a aba Trilha já vem com os ITENS prontos.
  await page.getByText('Node.js do Zero', { exact: false }).first().click();
  await expect(page.getByRole('heading', { name: 'Node.js do Zero' })).toBeVisible();
  await expect(page.getByText('Aula E2E sobre funções', { exact: false })).toBeVisible();
  await expect(page.getByText('Aula E2E seguinte', { exact: false })).toBeVisible();
  // Teste de proficiência disponível (cobre tudo).
  await expect(page.getByRole('heading', { name: 'Teste de proficiência' })).toBeVisible();

  // Abre a aula → CHAT com o tutor (nada de gerar).
  await page.getByText('Aula E2E sobre funções', { exact: false }).first().click();
  await expect(page.getByRole('heading', { name: 'Aula E2E sobre funções' })).toBeVisible();

  // O chat começa vazio: "Começar aula" apresenta a 1ª seção (stub).
  //
  // ONDA10-FENCE (fix da corrida): `waitFullTypewriter` PRECISA ser chamado
  // ANTES de qualquer assert que precise resolver/reter contra o backend (a
  // visibilidade do texto, a contagem de bolhas, o CSS computado) — cada um
  // desses pode levar bem mais que os ~2-4s que a TEORIA agora leva para
  // digitar inteira a 28 chars/s (ONDA10, chatBubbleTps.theory = 7 tps; era
  // ~400 chars/s). Medido: com os asserts de bolha/CSS ANTES do wait, o
  // indicador "tutor digitando" já tinha aparecido E sumido por completo
  // antes do 1º `waitForFunction` sequer começar a existir — o teste ficava
  // esperando um "aparece" que nunca mais aconteceria (estourava os 30s do
  // helper). Chamando o wait LOGO após o clique (antes de qualquer outro
  // assert), o polling em `raf` está de prontidão ANTES da digitação
  // começar — não existe corrida a perder, some ela dure 200ms (100 tps
  // antigo) ou 4s (7 tps de leitura). Os asserts de conteúdo/CSS abaixo
  // continuam os MESMOS, só depois de o texto já estar completo e estável.
  await page.getByRole('button', { name: 'Começar aula' }).click();
  await waitFullTypewriter(page);
  await expect(page.getByText('Tutor E2E:', { exact: false }).first()).toBeVisible();
  // ONDA1-COR-BALOES (fix 4c8eeb5): a bolha do tutor (kind 'message') aplica
  // backgroundColor REAL no style plain do motion.div — o fundo é o
  // background.paper do tema, NUNCA transparente (o bug que o fix matou: a
  // chave `bgcolor` — açúcar do sx do MUI — era SILENCIOSAMENTE descartada
  // num style object, deixando o balão transparente). A bolha é o div com
  // background-color inline dentro do role=log.
  const bubbles = page.locator('[role="log"] [style*="background-color"]');
  await expect(bubbles).toHaveCount(1);
  await expect(bubbles.first()).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

  // Próximo → segunda seção da teoria (progressiva, uma por vez). Mesma
  // ordem ONDA10-FENCE: o wait vem logo após o clique.
  await page.getByRole('button', { name: 'Próximo →' }).click();
  await waitFullTypewriter(page);
  await expect(page.getByText('Tutor E2E:', { exact: false }).nth(1)).toBeVisible();

  // FONTES: atrás do botão, nunca no fluxo (o diálogo lista a fonte fixture).
  await page.getByRole('button', { name: 'Fontes' }).click();
  await expect(page.getByRole('heading', { name: 'Fontes desta aula' })).toBeVisible();
  await expect(page.getByText('MDN', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Fechar' }).click().catch(() => page.keyboard.press('Escape'));

  // ─── ONDA2-IMESSAGE (gating): teoria concluída → "Concluir aula" fica
  // DESABILITADO porque o desafio da aula NUNCA foi passado (lastVerdict
  // null no payload track.lesson) — tooltip i18n via hover (o Tooltip MUI
  // escuta o mouse no <span> que envolve o botão desabilitado). ───────────
  const finishButton = page.getByRole('button', { name: 'Concluir aula' });
  await expect(finishButton).toBeDisabled();
  // Tooltip MUI escuta o mouse no <span> que envolve o botão DESABILITADO
  // (o MUI põe pointer-events: none no próprio botão — hover() do Playwright
  // falharia no hit-target check). mouse.move ao centro do botão passa pelo
  // span e abre o tooltip.
  const box = await finishButton.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  }
  await expect(page.getByText('Conclua os desafios desta aula primeiro')).toBeVisible();

  // DESAFIOS da aula (UX do dono — nada entre o chat e o input): o botão
  // "Desafios" no CABEÇALHO (com badge de pendentes) abre o POPOVER com a
  // lista — card clicável → aba Desafio (fluxo track) → PASSA o desafio com
  // a resposta certa (o stub roda node --test de verdade).
  // ONDA1-UX (a11y + badge): o nome acessível interpola a contagem de
  // pendentes ({{pending}} — mesmo critério do gating, lastVerdict !==
  // 'passed'; a fixture tem 1 desafio nunca tentado → 1) e o badge visual
  // mostra o mesmo número; aria-haspopup/expanded acompanham o popover.
  const desafiosBtn = page.getByRole('button', { name: 'Desafios da aula (1 pendentes)', exact: true });
  await expect(desafiosBtn).toHaveAttribute('aria-haspopup', 'true');
  await expect(desafiosBtn).toHaveAttribute('aria-expanded', 'false');
  await expect(desafiosBtn.locator('xpath=..').locator('.MuiBadge-badge')).toHaveText('1');
  await desafiosBtn.click();
  // O Popover MUI é um Modal: ao abrir, o fundo (inclusive o botão disparador)
  // sai da a11y tree (aria-hidden) — o getByRole não o vê mais. O ATRIBUTO
  // aria-expanded="true" continua no DOM — o locator CSS (que não filtra pela
  // a11y tree) lê o estado real.
  await expect(page.locator('button[aria-label="Desafios da aula (1 pendentes)"]')).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(page.getByRole('heading', { name: 'Desafios desta aula' })).toBeVisible();
  await page.getByRole('button', { name: /O dobro do número/ }).first().click();
  await expect(page.getByRole('heading', { name: 'O dobro do número' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Começar' }).click();
  await page.locator('.cm-content').first().click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('export function dobroDoNumero(n) { return n * 2; }');
  await page.getByRole('button', { name: 'Testar resposta' }).click();
  await expect(page.getByText('Passou com', { exact: false })).toBeVisible({ timeout: 20_000 });

  // Volta à aula pela Trilha (a aba abre a LISTA de trilhas — o cartão da
  // trilha primeiro, depois a aula; o item reabre a aula com
  // setPendingTrackLesson) — o chat RESTAURADO do cache aparece COMPLETO e
  // INSTANTÂNEO (nenhuma mensagem redigita — o indicador nunca monta para
  // histórico restaurado).
  await page.getByRole('tab', { name: 'Trilha' }).click();
  await page.getByText('Node.js do Zero', { exact: false }).first().click();
  await page.getByText('Aula E2E sobre funções', { exact: false }).first().click();
  await expect(page.getByRole('heading', { name: 'Aula E2E sobre funções' })).toBeVisible();
  await expect(page.getByText('Tutor E2E:', { exact: false })).toHaveCount(2);
  await expect(page.getByText(/tutor digitando|tutor typing/i)).toHaveCount(0);

  // OBSERVAÇÃO (ajuste REGISTRADO do REPLAN — limitação do harness E2E): o
  // galho "HABILITADO" do gating NÃO é observável em e2e. (1) O stub do main
  // NÃO persiste vereditos (buildE2ETrackRepo é em memória por chamada —
  // electron/main está FORA do escopo desta onda), então após passar o
  // desafio a re-busca de track.lesson devolve lastVerdict null e "Concluir
  // aula" segue desabilitado na MESMA aula; (2) a única aula da fixture SEM
  // desafios ('Aula E2E seguinte') está LOCKED (destrava em ordem — aula-1
  // nunca é marcada done, e markTrackLessonDone também é em memória). Os dois
  // galhos liberados ("sem desafios" e "todos passed") ficam cobertos pelos
  // unit tests de isLessonFinishBlocked (tests/trackLessonState.test.ts) — o
  // botão em si é o mesmo elemento, a condição é a função pura testada.
});
