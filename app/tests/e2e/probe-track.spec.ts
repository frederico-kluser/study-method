/**
 * probe-track.spec.ts — sonda DIAGNÓSTICA (não é spec de regressão).
 *
 * Lança o app REAL (sem stubs) com userData novo e, com o gate forçado 'ready',
 * chama os canais track:* DIRETAMENTE no renderer via page.evaluate, medindo o
 * tempo de cada um. Objetivo: nomear qual IPC/promessa não resolve no cenário
 * "clone limpo". Excluída de regressão (não roda em CI por padrão; use -g).
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

test('probe: track:list / track:get / track:lesson no app REAL com userData novo', async () => {
  test.setTimeout(180_000);
  test.skip(LAUNCH_MODE !== 'dot' && !fs.existsSync(MAIN_ENTRY), `sem build: ${MAIN_ENTRY}`);
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'study-method-probe-'));
  const logFile = path.join(userData, 'main.log');
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    STUDY_METHOD_WINDOW_VISIBLE: '0',
    LANG: 'pt_BR.UTF-8',
  };
  delete env.STUDY_METHOD_E2E;
  delete env.E2E_GATE;
  delete env.E2E_KEYS;
  delete env.E2E_NETWORK;

  const app = await _electron.launch({
    args: launchArgs(userData),
    env,
    cwd: APP_ROOT,
  });
  const page = await app.firstWindow();
  await page.waitForSelector('#root, [data-testid]', { timeout: 60_000 });

  // Gate fake 'ready' + reload (mesmo padrão do e2e-clean-clone).
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
    const iv = setInterval(hook, 100);
    (globalThis as unknown as { __gateHook?: NodeJS.Timeout }).__gateHook = iv;
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

  const results: string[] = [];
  const probe = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
    const t0 = Date.now();
    try {
      const res = await Promise.race([
        fn(),
        new Promise((_r, rej) => setTimeout(() => rej(new Error('TIMEOUT 25s')), 25_000)),
      ]);
      const body = JSON.stringify(res)?.slice(0, 300);
      results.push(`${label}: OK em ${Date.now() - t0}ms → ${body}`);
    } catch (err) {
      results.push(`${label}: FALHOU em ${Date.now() - t0}ms → ${String(err)}`);
    }
  };

  await probe('track.list', () => (page.evaluate(() => window.api.track.list() as unknown as Promise<unknown>)));
  await probe('track.get', () => (page.evaluate(() => window.api.track.get({ trackSlug: 'nodejs-do-zero' }) as unknown as Promise<unknown>)));
  await probe('track.lesson', () => (page.evaluate(() => window.api.track.lesson({ trackSlug: 'nodejs-do-zero', lessonId: 'o-que-e-programacao' }) as unknown as Promise<unknown>)));
  await probe('keys.startupStatus', () => (page.evaluate(() => window.api.keys.startupStatus() as unknown as Promise<unknown>)));

  console.log('\n=== PROBE RESULTS ===');
  for (const r of results) console.log(r);
  console.log('=====================');
  // Anexa também o log do main.
  const log = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '(sem log)';
  console.log('\n=== MAIN LOG (tail) ===');
  console.log(log.slice(-3000));

  try {
    await app.close();
  } catch {
    /* já fechada */
  }
});
