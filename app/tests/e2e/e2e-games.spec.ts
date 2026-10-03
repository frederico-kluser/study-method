/**
 * e2e-games.spec.ts — a SECÇÃO GAMES de ponta a ponta (ONDA-GAMES).
 *
 * Vertical slice em teste: motor (`electron/main/engine/games/*`), conteúdo
 * (`resources/games/mundo-1/*` — "O robô do depósito") e UI
 * (`src/views/GamesView/*`). O app roda BUILDADO (out/main) com o renderer de
 * produção — o motor de games NÃO é stub: `games:run` corre python3/gcc de
 * verdade e o progresso grava em `userData/games-progress.json` (por
 * lançamento, graças ao perfil temporário do `launchApp`).
 *
 * ─── CENÁRIOS (pedido do orquestrador) ─────────────────────────────────────
 *  1. FLUXO FELIZ: rail "Jogos" → mapa com 5 nós → linguagem Python → "Jogar
 *     nível 1" → editor com o starter → a referência python do nivel-1 →
 *     "Testar resposta" → casos passam → painel de OTIMIZAÇÃO (métricas +
 *     histograma) → "Avançar ›" → nível 2 abre → voltar ao mapa com o nível 1
 *     concluído. Prints 01-04.
 *  2. CHEFE BLOQUEADO/DESBLOQUEADO: o nó do chefe está `locked` enquanto
 *     1-4 não estão concluídos; concluindo-os (submissão das referências pela
 *     MESMA API do renderer — `games.run` por evaluate, o caminho rápido do
 *     pedido) o chefe passa a `current` e abre ("O relatório final"). Prints
 *     05-06.
 *  3. CONTRATO MULTI-LINGUAGEM: o nível 1 em C — o starter em C aparece no
 *     editor, a submissão do PRÓPRIO starter falha nos casos com
 *     esperado/obtido visíveis (e sem painel de otimização: ele é só de `ok`).
 *  4. PRINTS mobile 360×740 (07-08) + a RÉGUA F104 (SC 1.4.12) sobre as telas
 *     de Games (separado, ver o teste de régua no fim).
 *
 * ─── PRINTS (.recon/games-shots/, viewport 1280×800 salvo indicação) ──────
 *   01-mapa.png                    mapa inicial (5 nós, nível 1 atual)
 *   02-nivel-editor.png            nível 1 aberto (starter python no editor)
 *   03-apos-testar.png             após a referência passar (casos ✓)
 *   04-otimizacao-histograma.png   painel de otimização (métricas + histograma)
 *   05-chefe.png                   chefe "O relatório final" aberto
 *   06-mapa-progresso.png          mapa com 1-4 concluídos (chefe desbloqueado)
 *   07-mobile-360.png              mapa a 360×740
 *   08-mobile-360-nivel.png        nível 1 a 360×740 (extra: o editor mobile)
 * A captura é de `gamesShots.ts` (espera estável sem skeletons antes de cada
 * print — ver o cabeçalhe desse ficheiro).
 *
 * ─── SELETORES (todos existem de facto na UI) ─────────────────────────────
 *   · rail: `getByRole('tab', { name: 'Jogos' })` — `nav.games` = "Jogos"
 *     (o nome acessível vem do `aria-label` do Tab; ver NavigationRail).
 *   · nós do mapa: `[data-game-node="i"]` + `data-game-node-state`
 *     (`done|current|locked`) e `data-game-node-boss` — atributos de
 *     testabilidade publicados pela própria GamesView (o nó é aria-hidden e
 *     mostra só o número).
 *   · editor: `.cm-content` (CodeMirror) — mesmo padrão do e2e-lesson.
 *   · histograma: `[data-game-bar]` / `[data-game-bar-me="true"]` /
 *     `[data-game-par-marker="true"]` (também publicados pela view).
 *
 * ─── NOTA DE LINGUAGEM ────────────────────────────────────────────────────
 * O pedido do orquestrador diz `getByRole('tab', { name: 'Games' })`, mas a
 * etiqueta VISÍVEL/ACESSÍVEL desta instalação é "Jogos" (`nav.games` em
 * pt-BR, o locale pinado pelo `launchApp`) — a spec usa o texto real da UI
 * (regra 5 da casa: rótulos visíveis estáveis).
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { APP_ROOT, launchApp, closeApp, makeWorkspaceRoot } from './helpers';
import { captureShot, setViewport } from './gamesShots';
import {
  SPACING_OVERRIDES,
  scanSpacing,
  type SpacingReport,
  type SpacingScanOptions,
} from './spacingScan';

/**
 * Fatia mínima do DOM do renderer usada pelos evaluate da varredura (o
 * tsconfig destes testes é o de NODE, sem lib DOM — mesmo padrão de
 * `spacingScan.ts`: `globalThis` com cast explícito).
 */
interface ScanDom {
  getComputedStyle(element: { getBoundingClientRect(): { width: number; height: number } }): {
    clip: string;
  };
  document: {
    querySelector(selector: string): {
      scrollTop: number;
      scrollHeight: number;
      getBoundingClientRect(): { width: number; height: number };
      remove(): void;
    } | null;
    querySelectorAll(selector: string): ArrayLike<{
      getBoundingClientRect(): { width: number; height: number };
      remove(): void;
    }>;
  };
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

/* ═══════════════════════════════════════════════════════════════════════════
 * Helpers de cenário
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Mundo único do vertical slice. */
const WORLD_ID = 'mundo-1';
const GAMES_DIR = path.join(APP_ROOT, 'resources', 'games', WORLD_ID);

/**
 * O nível em JSON lido DO DISCO — a referência python de cada nível é a
 * solução oficial e a spec nunca a duplica (se o conteúdo mudar, o teste
 * submete o que o motor julga — o contrato é o ficheiro).
 */
function levelJson(levelId: string): {
  langs: Record<string, { starter: string; reference: string }>;
} {
  return JSON.parse(fs.readFileSync(path.join(GAMES_DIR, `${levelId}.json`), 'utf8')) as {
    langs: Record<string, { starter: string; reference: string }>;
  };
}

/** A referência python do nível (a solução a submeter no fluxo feliz). */
function pythonReference(levelId: string): string {
  const ref = levelJson(levelId).langs['python']?.reference;
  if (typeof ref !== 'string' || ref.length === 0) {
    throw new Error(`referência python em falta em ${levelId}.json`);
  }
  return ref;
}

/** Navega ao painel Games pelo rail (o shell só monta a view ativa). */
async function openGames(p: Page): Promise<void> {
  await p.getByRole('tab', { name: 'Jogos' }).click();
  await expect(p.getByRole('heading', { level: 1, name: 'Jogos' })).toBeVisible();
  await expect(p.getByRole('heading', { name: 'O robô do depósito' })).toBeVisible();
}

/** O nó do mapa por índice (0-based, inclui o chefe no fim). */
function node(p: Page, index: number) {
  return p.locator(`[data-game-node="${index}"]`);
}

/** O texto do editor CodeMirror (o `.cm-content` é o papel editável). */
async function editorText(p: Page): Promise<string> {
  return await p
    .locator('.cm-content')
    .first()
    .evaluate((el: { textContent: string | null }) => el.textContent ?? '');
}

/**
 * Substitui TODO o conteúdo do editor por `code`. `insertText` (e não
 * `keyboard.type`) de propósito: o basicSetup do CodeMirror mantém o
 * auto-fecho de parênteses/chavetas/aspas, e um keystroke-a-keystroke seria
 * corrompido pelo overtype do auto-fecho em código multi-linha (f-strings,
 * `scanf("%63s", …)` do C). `insertText` insere como IME/colar — sem teclas,
 * sem auto-fecho — e o texto final é conferido pelo canário do chamador.
 */
async function fillEditor(p: Page, code: string): Promise<void> {
  const editor = p.locator('.cm-content').first();
  await editor.click();
  await p.keyboard.press('ControlOrMeta+a');
  await p.keyboard.insertText(code);
}

/** Lança o app E2E com workspace próprio (padrão das specs do harness). */
async function launch(): Promise<void> {
  const launched = await launchApp({
    env: { E2E_GATE: 'ready', E2E_WORKSPACE_ROOT: wsRoot! },
  });
  app = launched.app;
  page = launched.page;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 1) FLUXO FELIZ
 * ═══════════════════════════════════════════════════════════════════════════ */

test('e2e-games: fluxo feliz — mapa → nível 1 (Python) → referência passa → otimização → avançar → mapa com o nível 1 concluído', async () => {
  test.setTimeout(180_000);
  await launch();
  await openGames(page);

  // ─── MAPA: 5 nós, o nível 1 é o atual, os restantes (chefe incluído)
  // bloqueados. Os estados vêm dos atributos de testabilidade da view. ────
  await expect(page.locator('[data-game-node]')).toHaveCount(5);
  await expect(node(page, 0)).toHaveAttribute('data-game-node-state', 'current');
  await expect(node(page, 1)).toHaveAttribute('data-game-node-state', 'locked');
  await expect(node(page, 2)).toHaveAttribute('data-game-node-state', 'locked');
  await expect(node(page, 3)).toHaveAttribute('data-game-node-state', 'locked');
  await expect(node(page, 4)).toHaveAttribute('data-game-node-state', 'locked');
  await expect(node(page, 4)).toHaveAttribute('data-game-node-boss', 'true');
  // Cabeçalho do mundo + contagem (i18n: "4 níveis + 1 chefe").
  await expect(page.getByText('4 níveis + 1 chefe').first()).toBeVisible();
  await expect(page.getByText('recorde de linhas', { exact: false })).toHaveCount(0);

  // ─── LINGUAGEM: Python (a escolha vive em estado e vale para as duas telas).
  const pythonToggle = page.getByRole('button', { name: 'Python', exact: true });
  await pythonToggle.click();
  await expect(pythonToggle).toHaveAttribute('aria-pressed', 'true');

  // ─── CARTÃO DO NÍVEL ATUAL + PRINT 01. ─────────────────────────────────
  await expect(page.getByRole('heading', { name: 'Nível 1 · Saudar o depósito' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Jogar nível 1' })).toBeVisible();
  await captureShot(page, '01-mapa.png');

  // ─── NÍVEL 1 ABRE COM O STARTER (título estável, enunciado, casos vazios).
  await page.getByRole('button', { name: 'Jogar nível 1' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Saudar o depósito' })).toBeVisible();
  await expect(page.getByText('Mundo O robô do depósito · Nível 1').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Enunciado' })).toBeVisible();
  await expect(page.getByText('Ainda sem resultados', { exact: false }).first()).toBeVisible();
  // Starter PYTHON no editor (o seletor escolheu python antes de jogar).
  expect(await editorText(page)).toContain('print("Bem-vindo!")');
  await captureShot(page, '02-nivel-editor.png');

  // ─── SUBMETER A REFERÊNCIA PYTHON DO NIVEL-1 (a solução oficial). ──────
  await fillEditor(page, pythonReference('nivel-1'));
  expect(
    await editorText(page),
    'o editor tem de receber a referência inteira (auto-fecho não pode corromper o colar)',
  ).toContain('print(f"Bem-vindo, {nome}!")');
  await page.getByRole('button', { name: 'Testar resposta' }).click();

  // ─── CASOS PASSAM (4 casos: 2 visíveis + 2 escondidos). ────────────────
  await expect(page.getByText('4 de 4 testes passaram').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Nível concluído ✓').first()).toBeVisible();
  await expect(page.getByRole('img', { name: 'passou', exact: true })).toHaveCount(4);
  // Caso escondido: SÓ "caso escondido" + ✓ — nunca valores (sem spoilers).
  await expect(page.getByText('caso escondido', { exact: true })).toHaveCount(2);
  await page.getByRole('heading', { name: 'Casos de teste' }).scrollIntoViewIfNeeded();
  await captureShot(page, '03-apos-testar.png');

  // ─── PAINEL DE OTIMIZAÇÃO: métricas + histograma + legenda. ────────────
  await expect(page.getByRole('heading', { name: 'Otimização' })).toBeVisible();
  await expect(page.getByText('Resolver = nível completo. Otimizar é opcional.').first()).toBeVisible();
  await expect(page.getByText('par: 4 linhas').first()).toBeVisible();
  await expect(page.getByText(/^recorde: \d+ linhas/).first()).toBeVisible();
  await expect(page.getByText(/^recorde: [\d.,]+ (ms|s)$/).first()).toBeVisible();
  // Histograma CSS (aria-hidden, localizável pelos atributos de teste).
  // Bins VAZIOS desenham barras de altura 0 (por desenho — `histogramBarHeights`
  // devolve 0): a asserção é de CONTAGEM + a barra "tu" (sempre não vazia —
  // o bin da tentativa atual tem ao menos o piso de 8% de altura).
  await expect(page.locator('[data-game-bar]')).not.toHaveCount(0);
  await expect(page.locator('[data-game-bar-me="true"]')).toHaveCount(1);
  await expect(page.locator('[data-game-bar-me="true"]')).toBeVisible();
  await expect(page.locator('[data-game-par-marker="true"]')).toHaveCount(1);
  await expect(page.getByText(/^a tua solução: melhor que \d+%$/)).toBeVisible();
  // Print 04: o painel de otimização INTEIRO com as suas ações a limpo. O
  // scroll CENTRA a linha de ações ("Otimizar"/"Avançar ›"): a barra pegajosa
  // (W13) cobre a última faixa do viewport enquanto pinned e era ela que
  // cortava os botões no print anterior (achado do orquestrador sobre o 04).
  await page
    .getByRole('button', { name: 'Otimizar' })
    .evaluate((el: { scrollIntoView(arg: { block: string }): void }) => {
      el.scrollIntoView({ block: 'center' });
    });
  await captureShot(page, '04-otimizacao-histograma.png');

  // ─── "AVANÇAR ›" ABRE O NÍVEL 2 (troca interna de tela, mesmo painel). ──
  await page.getByRole('button', { name: /^Avançar/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Contar caixas' })).toBeVisible();
  await expect(page.getByText('Mundo O robô do depósito · Nível 2').first()).toBeVisible();

  // ─── VOLTAR AO MAPA: o nível 1 está CONCLUÍDO e o 2 é o atual. ─────────
  await page.getByRole('button', { name: 'Voltar ao mapa' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Jogos' })).toBeVisible();
  await expect(node(page, 0)).toHaveAttribute('data-game-node-state', 'done');
  await expect(node(page, 1)).toHaveAttribute('data-game-node-state', 'current');
  await expect(page.getByRole('heading', { name: 'Nível 2 · Contar caixas' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Jogar nível 2' })).toBeVisible();
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 2) CHEFE BLOQUEADO → DESBLOQUEADO
 * ═══════════════════════════════════════════════════════════════════════════ */

test('e2e-games: chefe bloqueado até 1-4 concluídos → desbloqueado e acessível', async () => {
  test.setTimeout(180_000);
  await launch();
  await openGames(page);

  // ─── BLOQUEADO: o chefe é o nó 5 e está `locked` com 1-4 por concluir. ──
  await expect(node(page, 4)).toHaveAttribute('data-game-node-boss', 'true');
  await expect(node(page, 4)).toHaveAttribute('data-game-node-state', 'locked');
  await expect(page.getByRole('heading', { name: 'Nível 1 · Saudar o depósito' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Jogar nível 5' })).toHaveCount(0);

  // ─── CONCLUIR 1-4: submissão das referências python pela MESMA API do
  // renderer (`games.run`) — o caminho rápido do pedido ("se moroso, usa
  // games.run via evaluate"). O motor corre de verdade e o progresso grava
  // em userData: é o MESMO caminho de produção, sem passar pelo editor. ──
  const codes = ['nivel-1', 'nivel-2', 'nivel-3', 'nivel-4'].map(pythonReference);
  const verdicts = await page.evaluate(
    async (args: { worldId: string; codes: string[] }): Promise<boolean[]> => {
      const g = globalThis as unknown as {
        api: {
          games: {
            run(
              worldId: string,
              levelId: string,
              lang: string,
              code: string,
            ): Promise<{ ok: boolean; completed: boolean }>;
          };
        };
      };
      const out: boolean[] = [];
      for (let i = 0; i < args.codes.length; i += 1) {
        const result = await g.api.games.run(
          args.worldId,
          `nivel-${i + 1}`,
          'python',
          args.codes[i] as string,
        );
        out.push(result.ok);
      }
      return out;
    },
    { worldId: WORLD_ID, codes },
  );
  expect(
    verdicts,
    'as referências python dos níveis 1-4 têm de passar no motor (senão o cenário mede outra coisa)',
  ).toEqual([true, true, true, true]);

  // ─── O MAPA REFLETE O PROGRESSO: o shell só monta a view ativa, logo
  // voltar ao painel remonta a GamesView e re-busca `games:listWorlds` (com
  // o progresso já em disco). ───────────────────────────────────────────
  await page.getByRole('tab', { name: 'Início' }).click();
  await openGames(page);
  await expect(node(page, 0)).toHaveAttribute('data-game-node-state', 'done');
  await expect(node(page, 1)).toHaveAttribute('data-game-node-state', 'done');
  await expect(node(page, 2)).toHaveAttribute('data-game-node-state', 'done');
  await expect(node(page, 3)).toHaveAttribute('data-game-node-state', 'done');
  // DESBLOQUEADO: o chefe passa a `current` (o primeiro não concluído).
  await expect(node(page, 4)).toHaveAttribute('data-game-node-state', 'current');
  await expect(page.getByRole('heading', { name: 'Nível 5 · O relatório final' })).toBeVisible();
  await captureShot(page, '06-mapa-progresso.png');

  // ─── E ABRE MESMO: o chefe é jogável a partir do cartão. ───────────────
  await page.getByRole('button', { name: 'Jogar nível 5' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'O relatório final' })).toBeVisible();
  await expect(page.getByText('Mundo O robô do depósito · Nível 5').first()).toBeVisible();
  // Badge "chefe" (chip) no cabeçalho do nível — o glifo `B` do nó não chega.
  await expect(page.getByText('chefe', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Enunciado' })).toBeVisible();
  await captureShot(page, '05-chefe.png');
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 3) CONTRATO MULTI-LINGUAGEM (C)
 * ═══════════════════════════════════════════════════════════════════════════ */

test('e2e-games: contrato multi-linguagem — nível 1 em C, starter submetido falha com esperado/obtido visíveis', async () => {
  test.setTimeout(180_000);
  await launch();
  await openGames(page);

  // ─── LINGUAGEM C no seletor do MAPA (a escolha alimenta o starter). ────
  const cToggle = page.getByRole('button', { name: 'C', exact: true });
  await cToggle.click();
  await expect(cToggle).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Jogar nível 1' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Saudar o depósito' })).toBeVisible();

  // ─── O STARTER EM C aparece no editor (gramática por extensão do arquivo
  // fantasia `solution.c` — o contrato é o texto, não o realce). ─────────
  const starter = await editorText(page);
  expect(starter, 'o starter de C (e não o de Python) tem de carregar').toContain('#include <stdio.h>');
  expect(starter).toContain('scanf');

  // ─── SUBMETER O PRÓPRIO STARTER: o contrato de I/O falha nos casos. ────
  // O starter imprime "Bem-vindo!" sem o nome — os casos VISÍVEIS falham e
  // trazem esperado/obtido (o contrato: caso visível falhado tem sempre os
  // dois campos; hidden nunca traz valores).
  await page.getByRole('button', { name: 'Testar resposta' }).click();
  await expect(page.getByText('0 de 4 testes passaram').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('img', { name: 'falhou', exact: true })).toHaveCount(4);
  await expect(page.getByText('esperado', { exact: true })).toHaveCount(2);
  await expect(page.getByText('obtido', { exact: true })).toHaveCount(2);
  // Os VALORES esperado/obtido estão na tela (é isto que o aluno corrige).
  // O starter imprime SEM o nome nos dois casos visíveis → o obtido "Bem-vindo!"
  // aparece 2× (uma por caso); o esperado "Bem-vindo, Ana!" é o do caso Ana.
  await expect(page.getByText('Bem-vindo, Ana!', { exact: true })).toHaveCount(1);
  await expect(page.getByText('Bem-vindo!', { exact: true })).toHaveCount(2);
  // Os escondidos continuam sem valores (mesmo falhando).
  await expect(page.getByText('caso escondido', { exact: true })).toHaveCount(2);
  // Sem painel de otimização: ele nasce só de um `ok` (e sem banner de
  // conclusão — o nível não passou).
  await expect(page.getByRole('heading', { name: 'Otimização' })).toHaveCount(0);
  await expect(page.getByText('Nível concluído ✓')).toHaveCount(0);
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 4) PRINTS MOBILE (360×740)
 * ═══════════════════════════════════════════════════════════════════════════ */

test('e2e-games: prints mobile — mapa e nível 1 a 360×740', async () => {
  test.setTimeout(180_000);
  await launch();
  await openGames(page);
  await expect(page.locator('[data-game-node]').first()).toBeVisible();

  // O viewport mobile é REAL (tamanho de conteúdo da janela, mínimos do
  // main derrubados antes) — ver `setViewport` em gamesShots.ts.
  await setViewport(app!, page, { width: 360, height: 740 });
  await captureShot(page, '07-mobile-360.png');

  // …e o nível aberto no mesmo viewport (o editor + casos em coluna única).
  await page.getByRole('button', { name: 'Jogar nível 1' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Saudar o depósito' })).toBeVisible();
  await captureShot(page, '08-mobile-360-nivel.png');
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 5) RÉGUA F104 (SC 1.4.12) — a mesma varredura do e2e-spacing
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O `e2e-spacing.spec.ts` mede o QUADRO DE SESSÃO (o banner) — as telas de
 * Games não entram lá. Esta varredura aplica a MESMA régua
 * (`spacingScan.ts`: os quatro overrides verbatim do §4.3 + as quatro
 * medidas) às telas de Games, a 1280×800. A 360px a varredura RODE e é
 * REPORTADA (console), mas não decide: a 360 o shell (rail 80px + coluna da
 * sessão com piso de 180px) esmaga o `main` — geometria do shell, não das
 * views novas — e o que interessa ao dono é a lista para corrigir layout.
 *
 * ESCOPO DE MEDIDA (duas decisões documentadas, ambas de desenho):
 *   · nós sr-only (clip `rect(0 0 0 0)`, caixa 1×1) são REMOVIDOS antes de
 *     medir: não pintam glifo nenhum, então não há texto a perder — e pela
 *     régua crua acusariam "recorte" por `overflow: hidden` de propósito
 *     (o mesmo se aplica às etiquetas dos nós do mapa).
 *   · a varredura do nível rola o `main` até ao FIM: a barra de ação
 *     pegajosa (W13, padrão do ChallengeView) fica no seu lugar de FLUXO e
 *     não caminha sobre o conteúdo como camada — o overlap dela é chrome
 *     sobre conteúdo por desenho, não texto sobre texto.
 */
async function scanGamesScreen(p: Page, label: string): Promise<SpacingReport> {
  // Os quatro overrides do SC 1.4.12 — verbatim, nada mais (contrato §4.3).
  await p.addStyleTag({ content: SPACING_OVERRIDES });
  await p.waitForTimeout(150);
  // Remove os nós que NÃO PINTAM (ver o cabeçalho deste bloco): caixas 1×1/2×2
  // e clip `rect(0 …)` (a técnica sr-only). O `clip` esconde a PINTURA
  // independentemente do tamanho da caixa — não há glifo a perder, e pela
  // régua crua acusariam "recorte" por `overflow: hidden` de propósito.
  await p.evaluate(() => {
    const g = globalThis as unknown as ScanDom;
    const all = g.document.querySelectorAll('main *');
    for (const el of Array.from(all)) {
      const r = el.getBoundingClientRect();
      const clip = g.getComputedStyle(el).clip;
      const clippedToNothing = /^rect\(0/.test(clip);
      if ((r.width <= 2 && r.height <= 2) || clippedToNothing) el.remove();
    }
  });
  // Barra de ação pegajosa (W13) no lugar de FLUXO: rolar o `main` até ao FIM
  // DEPOIS dos overrides (eles mudam a altura do conteúdo — rolar antes deixava
  // a barra re-pinada por cima do texto e a régua acusava "texto sobre texto"
  // do chrome, que é camada por desenho e não sobreposição de F104).
  await p.evaluate(() => {
    const g = globalThis as unknown as ScanDom;
    const main = g.document.querySelector('main');
    if (main != null) main.scrollTop = main.scrollHeight;
  });
  await p.waitForTimeout(150);
  // `blockAxis: 'scroll'` — o `main` rola no eixo de bloco por desenho
  // (mesma geometria do sidebar da e2e-sidebar-aula-spacing): o que está
  // abaixo da dobra não se perdeu.
  const opts: SpacingScanOptions = {
    root: 'main',
    rootMissing: 'a área principal (main) não encontrada',
    bandPhrase: 'da área principal',
    bandName: 'a área principal',
    blockAxis: 'scroll',
    checkBand: true,
  };
  const report = await p.evaluate(scanSpacing, opts);
  console.log(
    `[games-spacing] ${label}: sampled=${report.sampled} ` +
      `clipped=${report.clipped.length} outside=${report.outside.length} overlaps=${report.overlaps.length}`,
  );
  for (const line of [...report.clipped, ...report.outside, ...report.overlaps]) {
    console.log(`[games-spacing] ${label}: ${line}`);
  }
  return report;
}

test('e2e-games: régua F104 (SC 1.4.12) — as telas de Games não truncam, recortam nem sobrepõem', async () => {
  test.setTimeout(180_000);
  await launch();
  await openGames(page);

  // MAPA a 1280×800.
  const mapa = await scanGamesScreen(page, 'mapa@1280');

  // NÍVEL 1 a 1280×800 (com o `main` no fim do scroll — ver o bloco acima).
  await page.getByRole('button', { name: 'Jogar nível 1' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Saudar o depósito' })).toBeVisible();
  const nivel = await scanGamesScreen(page, 'nivel@1280');

  // A 360×740: varredura + relatório (não decide — ver o cabeçalho).
  await setViewport(app!, page, { width: 360, height: 740 });
  await scanGamesScreen(page, 'nivel@360');
  await page.getByRole('button', { name: 'Voltar ao mapa' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Jogos' })).toBeVisible();
  await scanGamesScreen(page, 'mapa@360');

  // A DECISÃO é a 1280×800 (a mesma janela do e2e-spacing).
  const verdict = JSON.stringify({ mapa, nivel }, null, 2);
  expect(mapa.clipped, `recorte/ellipsis no mapa@1280:\n${verdict}`).toEqual([]);
  expect(mapa.outside, `fora da faixa no mapa@1280:\n${verdict}`).toEqual([]);
  expect(mapa.overlaps, `sobreposição no mapa@1280:\n${verdict}`).toEqual([]);
  expect(nivel.clipped, `recorte/ellipsis no nível@1280:\n${verdict}`).toEqual([]);
  expect(nivel.outside, `fora da faixa no nível@1280:\n${verdict}`).toEqual([]);
  expect(nivel.overlaps, `sobreposição no nível@1280:\n${verdict}`).toEqual([]);
});
