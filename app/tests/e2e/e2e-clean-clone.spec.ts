/**
 * e2e-clean-clone.spec.ts — REPRO do "loader infinito ao abrir uma aula" (onda 1
 * de diagnóstico, rodada 10).
 *
 * Cenário do usuário: clonar o projeto em OUTRO computador (userData do
 * Electron NOVO, sem settingsStore, sem .env.local, primeiro boot) e clicar em
 * uma aula → loader que nunca resolve.
 *
 * DIFERENÇA CRÍTICA vs. os specs do harness: estes testes NÃO usam
 * STUDY_METHOD_E2E=1 (stubs). Lançam o app REAL (out/main/index.js) com
 * `--user-data-dir` NOVO — o main roda a fiação real (gate real, settingsStore
 * real, SQLite real, track-handlers reais). Assim o repro cobre exatamente o
 * que o modo E2E stub MASKCARA (ver docs/relatorio-rodada10-diag.md).
 *
 * Rodar (a partir do repo principal, com out/ buildado):
 *   npm run build && npx playwright test tests/e2e/e2e-clean-clone.spec.ts
 *
 * Rodar a partir da worktree (aponta para o out/ do repo principal):
 *   CLEAN_CLONE_ENTRY=/Volumes/Ext2TB/Projects/study-method/app/out/main/index.js \
 *     npx playwright test tests/e2e/e2e-clean-clone.spec.ts
 *
 * Rodar no modo 'dot' (electron . — igual ao npm run dev do usuário):
 *   CLEAN_CLONE_LAUNCH_MODE=dot npx playwright test tests/e2e/e2e-clean-clone.spec.ts
 *
 * Os testes 2+3 são FALSIFICÁVEIS: hoje (rodada 9/10) espera-se que o teste 3
 * FALHE com o loader infinito — é o registro do bug. Após o fix da Onda 2, o
 * mesmo teste deve passar sem alteração.
 */
import { test, expect, _electron, type ElectronApplication, type Page } from '@playwright/test';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';

/** Raiz do app (onde está package.json / playwright.config.ts). */
export const APP_ROOT = path.resolve(__dirname, '..', '..');

/**
 * Entry do main: default out/main/index.js do próprio app; override via env
 * (CLEAN_CLONE_ENTRY) para rodar a partir da worktree apontando para o out/
 * do repo principal.
 *
 * MODO DE LANÇAMENTO (LAUNCH_MODE):
 *   - 'entry' (default): `electron out/main/index.js` — MESMO modo do harness
 *     E2E (helpers.ts). NESTE modo o `app.getAppPath()` do Electron resolve
 *     para o DIRETÓRIO DO ENTRY (out/main) e o tracksDir vira
 *     out/main/resources/tracks (que NÃO existe) → track:* responde erro ENOENT
 *     (ver relatório — bug 1).
 *   - 'dot': `electron .` (cwd=app/) — mesmo modo do `electron-vite dev`
 *     (ELECTRON_ENTRY='.') e do `electron .` com o app buildado. NESTE modo
 *     app.getAppPath() = app/ → tracksDir = app/resources/tracks → correto.
 *     É o modo do usuário real (./run.sh → npm run dev).
 */
export const MAIN_ENTRY = process.env.CLEAN_CLONE_ENTRY ?? path.join(APP_ROOT, 'out', 'main', 'index.js');
export const LAUNCH_MODE = process.env.CLEAN_CLONE_LAUNCH_MODE ?? 'entry';

/** Args do Electron conforme o modo (entry vs dot). */
export function launchArgs(userData: string): string[] {
  const common = ['--disable-gpu', '--lang=pt-BR', '--enable-logging=stderr', `--user-data-dir=${userData}`];
  return LAUNCH_MODE === 'dot' ? ['.', ...common] : [MAIN_ENTRY, ...common];
}

/** Cria um userData NOVO (clone limpo: sem settingsStore, sem banco). */
function freshUserData(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'study-method-clean-clone-'));
}

export interface RealLaunchOpts {
  userData: string;
  env?: Record<string, string>;
}

/**
 * Lança o app REAL (sem STUDY_METHOD_E2E) com userData NOVO. A janela nasce
 * oculta (STUDY_METHOD_WINDOW_VISIBLE=0, convenção do harness) e os logs do
 * main são teed para um arquivo sob o userData (diagnóstico do repro).
 */
export async function launchRealApp(opts: RealLaunchOpts): Promise<{
  app: ElectronApplication;
  page: Page;
  logFile: string;
}> {
  const logFile = path.join(opts.userData, 'main.log');
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    STUDY_METHOD_WINDOW_VISIBLE: '0',
    LANG: 'pt_BR.UTF-8',
    ...opts.env,
  };
  delete env.STUDY_METHOD_E2E; // MODO REAL — nada de stubs.
  delete env.E2E_GATE;
  delete env.E2E_KEYS;
  delete env.E2E_NETWORK;

  const app = await _electron.launch({
    args: launchArgs(opts.userData),
    env,
    cwd: APP_ROOT,
  });

  // Tee dos logs do processo main (stderr tem o console.log do main com
  // --enable-logging; stdout captura o resto).
  for (const stream of [app.process().stdout, app.process().stderr]) {
    stream?.on('data', (d: Buffer) => {
      try {
        fs.appendFileSync(logFile, d.toString());
      } catch {
        /* log indisponível — no-op */
      }
    });
  }

  const page = await app.firstWindow();
  await page.waitForSelector('#root, [data-testid]', { timeout: 60_000 });

  // Registra o console do renderer (erros React/JS ficam aqui).
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      fs.appendFileSync(logFile, `[renderer:${msg.type()}] ${msg.text()}\n`);
    }
  });
  page.on('pageerror', (err) => {
    fs.appendFileSync(logFile, `[renderer:pageerror] ${String(err)}\n`);
  });

  return { app, page, logFile };
}

/**
 * Contorna o GATE real substituindo `keys:startup-status` por um fake phase
 * 'ready' — simula o usuário com as DUAS chaves válidas SEM tocar rede. O hook
 * re-registra num intervalo curto (vencer qualquer re-registro). Depois
 * RECARREGA o renderer: na 1ª montagem o AppGate pode ter chamado o handler
 * REAL antes deste override (corrida de boot); o reload garante que a chamada
 * do AppGate encontre o fake — determinístico. Também pré-marca a oferta de
 * onboarding de 1ª execução (mesma chave do harness) para o modal não bloquear.
 */
export async function forceGateReady(app: ElectronApplication, page: Page): Promise<void> {
  await app.evaluate(({ ipcMain }) => {
    const fake = (): unknown => ({
      phase: 'ready',
      deepseek: { configured: true, valid: true },
      brave: { configured: true, valid: true },
      offline: false,
      checkedAt: new Date().toISOString(),
    });
    const hook = (): void => {
      try {
        ipcMain.removeHandler('keys:startup-status');
        ipcMain.handle('keys:startup-status', fake);
      } catch {
        /* canal pode não estar registrado ainda — no-op */
      }
    };
    hook();
    const iv = setInterval(hook, 100);
    (globalThis as unknown as { __gateHook?: NodeJS.Timeout }).__gateHook = iv;
  });
  await page.addInitScript((key: string) => {
    try {
      localStorage.setItem(key, 'true');
    } catch {
      /* localStorage indisponível — no-op */
    }
  }, 'study-method-onboarding-offered-v1');
  await page.reload();
  await page.waitForSelector('#root, [data-testid]', { timeout: 60_000 });
}

/** Confirma que o --user-data-dir foi honrado pelo Electron (realpath — o
 * macOS resolve /var → /private/var nos dois lados). */
export async function assertUserData(app: ElectronApplication, expected: string): Promise<void> {
  const actual = await app.evaluate(({ app: eApp }) => eApp.getPath('userData'));
  const norm = (p: string): string => {
    try {
      return fs.realpathSync(p);
    } catch {
      return p;
    }
  };
  expect(
    norm(actual),
    `userData deveria ser ${expected} (recebido ${actual})`,
  ).toBe(norm(expected));
}

/** Dump do estado da UI (loader? erro? aula?) — anexo de diagnóstico. */
async function dumpUi(page: Page, testInfo: import('@playwright/test').TestInfo, tag: string): Promise<void> {
  const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 2000) ?? '(sem body)');
  await testInfo.attach(`ui-${tag}.txt`, { body: bodyText });
  const progress = await page.locator('.MuiLinearProgress-root, .MuiCircularProgress-root').count();
  await testInfo.attach(`ui-${tag}-spinners`, { body: `spinners na tela: ${progress}` });
}

let app: ElectronApplication | undefined;

test.afterEach(async () => {
  if (app) {
    try {
      await app.close();
    } catch {
      /* já fechada */
    }
    app = undefined;
  }
});

test('clean-clone 1: primeiro boot SEM chaves → SetupView (gate blocked rápido, sem splash infinito)', async () => {
  test.skip(LAUNCH_MODE !== 'dot' && !fs.existsSync(MAIN_ENTRY), `sem build: ${MAIN_ENTRY} — rode npm run build`);
  const userData = freshUserData();
  const launched = await launchRealApp({ userData });
  app = launched.app;
  const { page } = launched;

  await assertUserData(app, userData);

  // SEM chaves o gate decide 'blocked' SEM rede (rápido) → formulário de keys.
  await expect(page.getByRole('heading', { name: 'Antes de começar' }).first()).toBeVisible({
    timeout: 20_000,
  });
  // O formulário tem campos de senha p/ as duas chaves.
  await expect(page.locator('input[type="password"]').first()).toBeVisible();
  await dumpUi(page, test.info(), 'gate-blocked');
});

test('clean-clone 2: abrir aula com chaves válidas (gate ready) → a aula CARREGA', async () => {
  test.setTimeout(180_000);
  test.skip(LAUNCH_MODE !== 'dot' && !fs.existsSync(MAIN_ENTRY), `sem build: ${MAIN_ENTRY} — rode npm run build`);
  const userData = freshUserData();
  const launched = await launchRealApp({ userData });
  app = launched.app;
  const { page } = launched;

  await assertUserData(app, userData);
  await forceGateReady(app, page);

  // Home: a TRILHA real (resources/tracks) aparece como cartão.
  await expect(page.getByText('Node.js do Zero', { exact: false }).first()).toBeVisible({ timeout: 30_000 });

  // Abre a trilha → aba Trilha com os módulos/aulas reais.
  await page.getByText('Node.js do Zero', { exact: false }).first().click();
  await expect(page.getByRole('heading', { name: 'Node.js do Zero' })).toBeVisible({ timeout: 30_000 });

  // PRIMEIRA AULA da trilha real (módulo 1, aula 1).
  await page.getByText('O que é programação', { exact: false }).first().click();

  // A aula deve ABRIR (heading do título da aula). Se o bug do loader infinito
  // estiver presente, este expect estoura em 30s e o teste FALHA — repro.
  try {
    await expect(page.getByRole('heading', { name: 'O que é programação' })).toBeVisible({ timeout: 30_000 });
  } catch (err) {
    await dumpUi(page, test.info(), 'lesson-open');
    throw err;
  }
});

test('clean-clone 3: abrir aula SEM chaves (gate override ready, sem rede de validação) — diagnóstico do loader', async () => {
  test.setTimeout(180_000);
  test.skip(LAUNCH_MODE !== 'dot' && !fs.existsSync(MAIN_ENTRY), `sem build: ${MAIN_ENTRY} — rode npm run build`);
  const userData = freshUserData();
  const launched = await launchRealApp({ userData });
  app = launched.app;
  const { page } = launched;

  await assertUserData(app, userData);
  await forceGateReady(app, page);

  // Home → Trilha → aula (mesmo fluxo do teste 2, com log do main anexado).
  await expect(page.getByText('Node.js do Zero', { exact: false }).first()).toBeVisible({ timeout: 30_000 });
  await page.getByText('Node.js do Zero', { exact: false }).first().click();
  await expect(page.getByRole('heading', { name: 'Node.js do Zero' })).toBeVisible({ timeout: 30_000 });
  await page.getByText('O que é programação', { exact: false }).first().click();

  try {
    await expect(page.getByRole('heading', { name: 'O que é programação' })).toBeVisible({ timeout: 30_000 });
  } catch (err) {
    await dumpUi(page, test.info(), 'lesson-open-3');
    const logFile = path.join(userData, 'main.log');
    if (fs.existsSync(logFile)) {
      await test.info().attach('main.log', {
        body: fs.readFileSync(logFile, 'utf8').slice(-8000),
      });
    }
    throw err;
  }
});
