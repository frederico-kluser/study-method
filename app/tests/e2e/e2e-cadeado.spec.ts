/**
 * e2e-cadeado.spec.ts — O CADEADO DA PRÓXIMA AULA (onda11-cadeado).
 *
 * ─── O PEDIDO DO DONO, LITERAL ────────────────────────────────────────────
 * *"por fim um bug grave, quando clico em proxima aula NAO LIBERA o cadeado da
 * proxima aula, quero isso e quero com efeito"*.
 *
 * Esta spec percorre o caminho DELE, na tela de produção:
 *   Trilha → a aula 2 está com CADEADO → faz a aula 1 → conclui → a aula 2
 *   DESTRAVA (e a tela diz que acabou de destravar) → e o botão "Avançar para
 *   a próxima aula" leva até ela.
 *
 * ─── POR QUE ELA NÃO EXISTIA ANTES ────────────────────────────────────────
 * O harness E2E era CEGO para progresso: `buildE2ETrackRepo()` era chamado de
 * novo em CADA handler e criava um `Set` local, então `markTrackLessonDone`
 * escrevia num objeto descartado no mesmo tick — em modo E2E o cadeado NUNCA
 * poderia abrir. O e2e-lesson.spec.ts DOCUMENTAVA essa cegueira como
 * "limitação do harness". A onda 11 consertou o stub (store de MÓDULO, como o
 * quiz já fazia); o contrato do stub está travado, sem build, em
 * tests/e2eTrackProgress.test.ts.
 *
 * ─── POR QUE A TRILHA É OUTRA (e não a `nodejs-do-zero`) ──────────────────
 * Ver o cabeçalho de `tests/e2e/cadeadoFixture.ts`: concluir a aula 1 da trilha
 * do stub exige PASSAR o desafio dela. Esta spec mede o CADEADO, e uma trilha
 * de duas aulas sem desafio o isola do gate do desafio — que tem a sua própria
 * medida, em tests/e2e/e2e-lesson.spec.ts ("Concluir aula" HABILITADO depois de
 * passar o desafio pela UI).
 *
 * ─── O QUE É PRODUÇÃO AQUI ────────────────────────────────────────────────
 * Tudo o que decide o cadeado: `computeUnlockStates`/`buildTrackDetail`, o
 * payload `nextLesson`, a navegação do renderer e a RoadmapView. FIXTURE: só o
 * conteúdo da trilha e a borda de persistência do main.
 *
 * ─── OS DOIS TESTES: AS DUAS METADES DO CAMINHO DO DONO ───────────────────
 *   1. concluir a aula 1 → voltar para a Trilha → a aula 2 abriu, com efeito.
 *      Estava invisível porque o harness enxergava zero progresso
 *      (`buildE2ETrackRepo` criava os mapas por chamada); consertado na onda 11.
 *   2. concluir a aula 1 → clicar em "Avançar para a próxima aula" → a aula 2
 *      ABRE. Este era o defeito LITERAL do dono e ficou um tempo como
 *      `test.fail()`: o botão chamava `navigate('lesson')` estando JÁ na aba
 *      Aula, e o shell monta só a view ativa (`App.tsx`: `const View =
 *      VIEWS[active]`) — `setActive('lesson')` com 'lesson' já ativo é no-op do
 *      React, a LessonView não remontava e a pendência gravada por
 *      `setPendingTrackLesson` nunca era drenada: a tela FICAVA na aula 1.
 *      Consertado na onda de integração — `handleGoToNextLesson` troca de aula
 *      NO LUGAR, como `openPrerequisite` sempre fez —, e a anotação
 *      `test.fail()` saiu junto (mantê-la faria o Playwright acusar
 *      'expected to fail, but passed').
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, closeApp, makeWorkspaceRoot } from './helpers';
import {
  LESSON_ONE_TITLE,
  LESSON_TWO_TITLE,
  LOCK_TRACK_TITLE,
  writeLockTrack,
} from './cadeadoFixture';

let app: ElectronApplication | undefined;
let page: Page;
let wsRoot: string;

test.beforeEach(() => {
  wsRoot = makeWorkspaceRoot();
  // A trilha de duas portas precisa existir ANTES de o app subir: o
  // `track:list` do primeiro render já a encontra.
  writeLockTrack(wsRoot);
});

test.afterEach(async () => {
  if (app) await closeApp(app);
});

/**
 * Espera o texto COMPLETO do tutor stub ser digitado (mesma técnica do
 * e2e-lesson.spec.ts): o indicador "tutor digitando…" só é montado DURANTE a
 * digitação, e o unmount dele É a condição "acabou". `polling: 'raf'` roda no
 * renderer (~16ms) — o poll por CDP perdia a janela transiente.
 */
async function waitFullTypewriter(p: Page): Promise<void> {
  const temIndicador = (): boolean => {
    // tsconfig.node.json (que cobre tests/) não tem lib DOM — o acesso ao DOM
    // vai por globalThis com cast (o Playwright serializa a função e a avalia
    // no renderer).
    const doc = (globalThis as any).document;
    const statuses = doc?.querySelectorAll('[role="status"]') ?? [];
    for (const el of statuses) {
      if (/tutor digitando|tutor typing/i.test(el.textContent ?? '')) return true;
    }
    return false;
  };
  await p.waitForFunction(temIndicador, undefined, { polling: 'raf' });
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

/** Abre a aba Trilha com o DETALHE da trilha do cadeado na tela. */
async function abrirTrilha(p: Page): Promise<void> {
  await p.getByRole('tab', { name: 'Trilha' }).click();
  await p.getByText(LOCK_TRACK_TITLE, { exact: false }).first().click();
  await expect(p.getByRole('heading', { name: LOCK_TRACK_TITLE })).toBeVisible();
}

/** O botão-tile de uma aula na Trilha (o `disabled` dele É o cadeado). */
function tileDaAula(p: Page, titulo: string) {
  return p.getByRole('button', { name: new RegExp(titulo.replace(/[()]/g, '\\$&')) });
}

test('e2e-cadeado: concluir a aula 1 destrava a aula 2 na Trilha — e a tela diz que abriu AGORA', async () => {
  test.setTimeout(120_000);
  const launched = await launchApp({ env: { E2E_GATE: 'ready', E2E_WORKSPACE_ROOT: wsRoot } });
  app = launched.app;
  page = launched.page;

  await expect(page.getByRole('banner').getByText('Study Method — Tutor', { exact: false })).toBeVisible();

  // ── 1. O ESTADO INICIAL: a aula 2 tem CADEADO ───────────────────────────
  await page.getByText(LOCK_TRACK_TITLE, { exact: false }).first().click();
  await expect(page.getByRole('heading', { name: LOCK_TRACK_TITLE })).toBeVisible();
  await expect(tileDaAula(page, LESSON_TWO_TITLE)).toBeDisabled();
  // Nesta primeira visita nada "acabou de destravar" (a trilha podia estar
  // assim há semanas): o efeito NUNCA acende sem uma mudança medida.
  await expect(page.getByText('Destravou agora', { exact: false })).toHaveCount(0);

  // ── 2. A AULA 1 INTEIRA (só teoria: sem desafio, sem quiz) ──────────────
  await tileDaAula(page, LESSON_ONE_TITLE).click();
  await expect(page.getByRole('heading', { name: LESSON_ONE_TITLE })).toBeVisible();
  await page.getByRole('button', { name: 'Começar aula' }).click();
  await waitFullTypewriter(page);
  await page.getByRole('button', { name: 'Avançar', exact: true }).click();
  await waitFullTypewriter(page);

  // ── 3. CONCLUIR ────────────────────────────────────────────────────────
  const concluir = page.getByRole('button', { name: 'Concluir aula' });
  await expect(concluir).toBeEnabled();
  await concluir.click();
  await expect(page.getByRole('button', { name: 'Avançar para a próxima aula' })).toBeVisible();

  // ── 4. A TRILHA: o cadeado da aula 2 ABRIU ─────────────────────────────
  await abrirTrilha(page);
  await expect(tileDaAula(page, LESSON_TWO_TITLE)).toBeEnabled();

  // ── 5. COM EFEITO: a tela DIZ que a aula acabou de destravar ────────────
  // A informação NUNCA depende da animação (quem tem movimento desligado, ou
  // quem usa leitor de tela, recebe a mesma coisa): o selo textual no tile e o
  // anúncio em role="status" da view.
  await expect(page.getByText('Destravou agora', { exact: false }).first()).toBeVisible();
  await expect(
    page.getByText(`Aula destravada: ${LESSON_TWO_TITLE}`, { exact: false }).first(),
  ).toBeVisible();
  // …e SÓ na aula que mudou de estado: a aula 1 (concluída) não ganha selo.
  await expect(page.getByText('Destravou agora', { exact: false })).toHaveCount(1);

  // ── 6. O EFEITO NÃO VIRA RUÍDO: na visita seguinte ele não se repete ────
  await page.getByRole('tab', { name: 'Aula' }).click();
  await abrirTrilha(page);
  await expect(tileDaAula(page, LESSON_TWO_TITLE)).toBeEnabled();
  await expect(page.getByText('Destravou agora', { exact: false })).toHaveCount(0);
});

/**
 * O CLIQUE LITERAL DO DONO — "quando clico em proxima aula".
 *
 * ONDA-INTEGRAÇÃO: era `test.fail()` (a correção morava na LessonView, de
 * outro agente). A correção CHEGOU — `handleGoToNextLesson` troca de aula NO
 * LUGAR, como `openPrerequisite` já fazia — e a anotação saiu junto: mantê-la
 * faria o Playwright acusar 'expected to fail, but passed'.
 */
test('e2e-cadeado: "Avançar para a próxima aula" abre MESMO a aula seguinte', async () => {
  test.setTimeout(120_000);
  const launched = await launchApp({ env: { E2E_GATE: 'ready', E2E_WORKSPACE_ROOT: wsRoot } });
  app = launched.app;
  page = launched.page;

  await expect(page.getByRole('banner').getByText('Study Method — Tutor', { exact: false })).toBeVisible();
  await page.getByText(LOCK_TRACK_TITLE, { exact: false }).first().click();
  await tileDaAula(page, LESSON_ONE_TITLE).click();
  await page.getByRole('button', { name: 'Começar aula' }).click();
  await waitFullTypewriter(page);
  await page.getByRole('button', { name: 'Avançar', exact: true }).click();
  await waitFullTypewriter(page);
  await page.getByRole('button', { name: 'Concluir aula' }).click();

  const avancar = page.getByRole('button', { name: 'Avançar para a próxima aula' });
  await expect(avancar).toBeVisible();
  await avancar.click();

  // A AULA 2 ESTÁ NA TELA. Antes do conserto, o que ficava aqui era o heading
  // da aula 1 — o clique era literalmente no-op.
  await expect(page.getByRole('heading', { name: LESSON_TWO_TITLE })).toBeVisible();

  // …e ela abre INTEIRA E LIMPA, não pela metade. Trocar de aula NO LUGAR
  // significa refazer o que a montagem faria, e cada asserção abaixo cobra uma
  // peça dessa troca — sem elas o "abriu" seria só o título mudando:
  //   · "Começar aula" de volta   → o chat é NOVO (setChat(createTrackLessonState))
  //     e a conclusão foi zerada (setDoneMarked(false)); se `doneMarked` tivesse
  //     vazado da aula 1, a linha de ação já nasceria em "Avançar para a próxima
  //     aula" numa aula que o aluno nem começou.
  //   · nenhuma bolha da aula 1   → o histórico anterior não vaza para a nova.
  await expect(page.getByRole('button', { name: 'Começar aula' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Avançar para a próxima aula' })).toHaveCount(0);
  await expect(page.getByText('Você chegou à segunda aula', { exact: false })).toHaveCount(0);

  // E a aula nova FUNCIONA (o load foi disparado de verdade, não só o título
  // trocado): a teoria dela é escrita quando o aluno começa.
  await page.getByRole('button', { name: 'Começar aula' }).click();
  await waitFullTypewriter(page);
  await expect(page.getByText('Você chegou à segunda aula', { exact: false }).first()).toBeVisible();
});
