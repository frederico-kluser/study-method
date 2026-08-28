/**
 * probe-ui-dump.spec.ts — DIAGNÓSTICO: o que o usuário VÊ em cada modo de
 * lançamento com userData novo e gate 'ready' (override). Dumps de tela em
 * sequência: Home → aba Trilha → aba Aula.
 *
 * Uso:
 *   CLEAN_CLONE_ENTRY=<out do repo> npx playwright test tests/e2e/probe-ui-dump.spec.ts   (modo entry)
 *   CLEAN_CLONE_LAUNCH_MODE=dot      npx playwright test tests/e2e/probe-ui-dump.spec.ts   (modo dev)
 */
import { test, _electron, type ElectronApplication, type Page } from '@playwright/test';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';

const APP_ROOT = path.resolve(__dirname, '..', '..');
const MAIN_ENTRY = process.env.CLEAN_CLONE_ENTRY ?? path.join(APP_ROOT, 'out', 'main', 'index.js');
const LAUNCH_MODE = process.env.CLEAN_CLONE_LAUNCH_MODE ?? 'entry';

function launchArgs(userData: string): string[] {
  const common = ['--disable-gpu', '--lang=pt-BR', '--enable-logging=stderr', `--user-data-dir=${userData}`];
  return LAUNCH_MODE === 'dot' ? ['.', ...common] : [MAIN_ENTRY, ...common];
}

async function dump(page: Page, label: string): Promise<void> {
  const text = await page.evaluate(() => document.body?.innerText?.slice(0, 1200) ?? '(sem body)');
  console.log(`\n────── ${label} ──────\n${text}\n──────────────────────`);
}

test('probe-ui: o que o usuário vê (userData novo, gate ready)', async () => {
  test.setTimeout(180_000);
  test.skip(LAUNCH_MODE !== 'dot' && !fs.existsSync(MAIN_ENTRY), `sem build: ${MAIN_ENTRY}`);
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'study-method-ui-'));
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    STUDY_METHOD_WINDOW_VISIBLE: '0',
    LANG: 'pt_BR.UTF-8',
  };
  delete env.STUDY_METHOD_E2E;
  delete env.E2E_GATE;
  delete env.E2E_KEYS;
  delete env.E2E_NETWORK;

  const app: ElectronApplication = await _electron.launch({
    args: launchArgs(userData),
    env,
    cwd: APP_ROOT,
  });
  const page: Page = await app.firstWindow();
  await page.waitForSelector('#root, [data-testid]', { timeout: 60_000 });

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
        /* no-op */
      }
    };
    hook();
    (globalThis as unknown as { __gateHook?: NodeJS.Timeout }).__gateHook = setInterval(hook, 100);
  });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('study-method-onboarding-offered-v1', 'true');
    } catch {
      /* no-op */
    }
  });
  await page.reload();
  await page.waitForSelector('#root, [data-testid]', { timeout: 60_000 });

  await dump(page, `HOME (modo ${LAUNCH_MODE})`);

  // Aba Trilha.
  const trilhaTab = page.getByRole('tab', { name: 'Trilha' });
  if (await trilhaTab.isVisible().catch(() => false)) {
    await trilhaTab.click();
    await page.waitForTimeout(1500);
    await dump(page, `ABA TRILHA (modo ${LAUNCH_MODE})`);
  }

  // Aba Aula.
  const aulaTab = page.getByRole('tab', { name: 'Aula' });
  if (await aulaTab.isVisible().catch(() => false)) {
    await aulaTab.click();
    await page.waitForTimeout(1500);
    await dump(page, `ABA AULA (modo ${LAUNCH_MODE})`);
  }

  try {
    await app.close();
  } catch {
    /* já fechada */
  }
});
