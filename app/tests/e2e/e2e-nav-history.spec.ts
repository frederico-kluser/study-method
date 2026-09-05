/**
 * e2e-nav-history.spec.ts — HISTÓRICO DE NAVEGAÇÃO DA TRILHA + RESET (onda1-nav-ui).
 *
 * Pedidos do dono cobertos:
 *   (a) "quando clico em trilha e avanço e vou pra outro botão como settings e
 *       volto pra trilha, eu perco meu histórico de navegação, quero que ele se
 *       mantenha com um botão de voltar" — abrir Trilha → detalhe → Settings →
 *       voltar à Trilha mantém o DETALHE aberto (roadmapNav), e o botão VOLTAR
 *       leva de volta à LISTA (e zera o store — a próxima montagem abre a lista);
 *   (b) "quero um botão pra limpar todos os dados de avanço" — botão na Settings
 *       com DIÁLOGO de confirmação e feedback honesto depois.
 *
 * LIMITAÇÃO DO HARNESS E2E (registrada — mesmo padrão das rodadas anteriores):
 * o stub do main (registerE2EStubs) registra buildStudyHandlers SEM repo —
 * o banco SQL real não existe no modo E2E — então study:clear-progress responde
 * { ok:false, error: 'persistência indisponível (repo ausente)' }. O sucesso do
 * RESET não é observável em e2e: a spec cobre o diálogo de confirmação + o
 * feedback de ERRO honesto; o caminho ok:true é coberto pelos unit tests
 * (tests/db/repo.test.ts clearAllProgress + tests/study-handlers.test.ts
 * study:clear-progress).
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

test('e2e-nav-history: trilha → detalhe → settings → voltar mantém o detalhe; VOLTAR vai para a lista', async () => {
  const launched = await launchApp({
    env: { E2E_GATE: 'ready', E2E_WORKSPACE_ROOT: wsRoot! },
  });
  app = launched.app;
  page = launched.page;

  await expect(page.getByRole('banner').getByText('Study Method — Tutor', { exact: false })).toBeVisible();

  // Home → cartão da trilha → DETALHE (módulos + aulas + proficiência).
  await page.getByText('Node.js do Zero', { exact: false }).first().click();
  await expect(page.getByRole('heading', { name: 'Node.js do Zero' })).toBeVisible();
  await expect(page.getByText('Aula E2E sobre funções', { exact: false })).toBeVisible();

  // Troca de aba: Settings desmonta a RoadmapView (o shell monta SÓ a view ativa).
  await page.getByRole('tab', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  // VOLTA à Trilha: o DETALHE é RESTAURADO sem clicar no cartão (roadmapNav —
  // o histórico de navegação sobreviveu à desmontagem). A LISTA não aparece.
  await page.getByRole('tab', { name: 'Trilha' }).click();
  await expect(page.getByRole('heading', { name: 'Node.js do Zero' })).toBeVisible();
  await expect(page.getByText('Aula E2E sobre funções', { exact: false })).toBeVisible();
  await expect(page.getByText('Escolha uma trilha', { exact: false })).toHaveCount(0);

  // Botão VOLTAR (cabeçalho do detalhe) → LISTA de trilhas (o card com o
  // título da trilha; o DETALHE desmontou — nada de aula nem botão Voltar).
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page.getByText('Escolha uma trilha', { exact: false })).toBeVisible();
  await expect(page.getByText('Node.js do Zero', { exact: false })).toBeVisible();
  await expect(page.getByText('Aula E2E sobre funções', { exact: false })).toHaveCount(0);

  // Após voltar, abrir OUTRA aba e retornar → a LISTA permanece (o store foi
  // zerado pelo VOLTAR — a próxima montagem não re-abre o detalhe antigo).
  // NOTA: o TÍTULO do CARD da lista também é um heading (h6 do MUI), então a
  // ausência do DETALHE é verificada pelo conteúdo exclusivo dele (a aula do
  // módulo e o botão VOLTAR — que só existem no detalhe).
  await page.getByRole('tab', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'Trilha' }).click();
  await expect(page.getByText('Escolha uma trilha', { exact: false })).toBeVisible();
  await expect(page.getByText('Aula E2E sobre funções', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Voltar' })).toHaveCount(0);
});

test('e2e-nav-history: reset de progresso — botão na Settings pede CONFIRMAÇÃO e informa o resultado', async () => {
  const launched = await launchApp({
    env: { E2E_GATE: 'ready', E2E_WORKSPACE_ROOT: wsRoot! },
  });
  app = launched.app;
  page = launched.page;

  await expect(page.getByRole('banner').getByText('Study Method — Tutor', { exact: false })).toBeVisible();
  await page.getByRole('tab', { name: 'Settings' }).click();

  // Botão destrutivo — um clique NÃO limpa direto: abre o diálogo de confirmação.
  const clearBtn = page.getByRole('button', { name: 'Limpar todos os dados de avanço' });
  await expect(clearBtn).toBeVisible();
  await clearBtn.click();
  await expect(page.getByRole('heading', { name: 'Limpar todos os dados de avanço?' })).toBeVisible();

  // ONDA4-E2E-FENCE (fix da corrida/falso-positivo): os alerts DESTE teste
  // (o de "nenhum resultado ainda" e o de erro do reset) vivem DENTRO da
  // `<section aria-labelledby="settings-progress-title">` do ProgressPanel
  // — mas a Settings TAMBÉM tem o OrphanTracksPanel (onda9-cache-reconcilia),
  // que dispara `track:orphans` na montagem e, ao resolver "nada órfão"
  // (o caso comum), renderiza um `<Alert severity="success"
  // data-testid="settings-orphans-empty" role="alert">` PRÓPRIO — sem
  // relação nenhuma com o reset de progresso. Medido: `getByRole('alert')`
  // SEM escopo contava esse alert alheio (a corrida entre o IPC
  // `track:orphans` resolver e o clique em "Cancelar" decidia se 1 ou 0
  // apareciam ao checar — o mesmo teste falhava ora na linha do "Cancelar"
  // ora nunca, dependendo de QUANDO o orphans-empty entrava no DOM: a
  // flakiness que este fix elimina). Escopar ao painel certo torna a
  // asserção determinística nos dois sentidos, sem afrouxar nada: ela
  // continua provando "nenhum alert do RESET apareceu" / "o alert do RESET
  // apareceu com o texto certo".
  const progressSection = page.locator('section[aria-labelledby="settings-progress-title"]');

  // Cancelar fecha sem nada (nenhum Alert de resultado do reset aparece).
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Limpar todos os dados de avanço?' })).toHaveCount(0);
  await expect(progressSection.getByRole('alert')).toHaveCount(0);

  // Confirma → feedback honesto. LIMITAÇÃO DO HARNESS (documentada no
  // cabeçalho): o stub do main não tem o repo SQL → { ok:false } com a
  // mensagem do handler; o caminho ok:true é coberto por unit tests.
  await clearBtn.click();
  await page.getByRole('button', { name: 'Limpar', exact: true }).click();
  await expect(progressSection.getByRole('alert').first()).toBeVisible();
  await expect(progressSection.getByRole('alert').first()).toContainText(
    /persistência indisponível|Não foi possível limpar/i,
  );
});
