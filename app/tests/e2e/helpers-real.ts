/**
 * tests/e2e/helpers-real.ts — helpers do harness E2E REAL (sem stubs).
 *
 * Diferente do `helpers.ts` (modo stub `STUDY_METHOD_E2E=1`), aqui o app é
 * lançado SEM o modo E2E: a fiação REAL da onda 3 (pesquisa Brave + autoria
 * DeepSeek + runner de verdade) flui de ponta a ponta. As CHAVES REAIS entram
 * por envars do processo de teste (`DEEPSEEK_API_KEY`/`BRAVE_API_KEY`) — NUNCA
 * por arquivo versionado — e são injetadas no app via o próprio IPC de chaves
 * (`keys:set-key`), gravadas no settingsStore do perfil ISOLADO.
 *
 * ISOLAMENTO DE SEGURANÇA:
 *  - o perfil do usuário (`userData`) é redirecionado a um diretório TMP
 *    (`--user-data-dir`), então o teste NÃO toca as settings reais do dev;
 *  - ao final, o diretório tmp (que pode conter as chaves em claro quando o
 *    safeStorage carece de keyring) é REMOVIDO — as chaves não persistem no
 *    disco após o teste.
 *
 * As specs reais devem chamar `test.skip(..., reason)` quando as envs não estão
 * presentes (a suíte mock `npm run test:e2e` continua verde sem chaves).
 */
import { _electron, expect, type ElectronApplication, type Page } from '@playwright/test';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { APP_ROOT, MAIN_ENTRY } from './helpers';

/** Chaves reais resolvidas de envars de teste (nunca de arquivo). */
export function realEnvKeys(): { deepseek: string; brave: string } {
  return {
    deepseek: (process.env.DEEPSEEK_API_KEY ?? '').trim(),
    brave: (process.env.BRAVE_API_KEY ?? '').trim(),
  };
}

/** True quando BOTH chaves reais estão disponíveis no ambiente. */
export function hasRealKeys(): boolean {
  const k = realEnvKeys();
  return k.deepseek !== '' && k.brave !== '';
}

/** Reason usado no `test.skip` das specs reais quando faltam as envs. */
export const REAL_KEYS_SKIP_REASON =
  'DEEPSEEK_API_KEY/BRAVE_API_KEY não definidas no ambiente do teste. ' +
  'Rode com `npm run test:e2e:real` (exporte as chaves no shell) para exercitar a didática real.';

/** Chama `test.skip` da spec real quando faltam as envs reais. */
export function skipIfNoRealKeys(): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { test } = require('@playwright/test') as typeof import('@playwright/test');
  test.skip(!hasRealKeys(), REAL_KEYS_SKIP_REASON);
}

/** Chave de localStorage da oferta de 1ª execução do tutorial (igual helper.ts). */
const ONBOARDING_OFFERED_KEY = 'study-method-onboarding-offered-v1';

interface LaunchRealOpts {
  /** Envars ADICIONAIS (ex.: STUDY_METHOD_SETUPS_DIR aponta o tmp de setups). */
  extraEnv?: Record<string, string>;
  /** Diretório de setups do aluno (default: descoberto pelo main). */
  setupsDir?: string;
  /**
   * Pré-marca a oferta de onboarding como já mostrada (default: true) — as
   * specs reais interagem com o shell e não querem o TutorialSelectionModal
   * bloqueando. Passe false para exercitar o 1º run do tutorial.
   */
  onboardingOffered?: boolean;
}

export interface RealApp {
  app: ElectronApplication;
  page: Page;
  userDataDir: string;
  deepseekApiKey: string;
  braveApiKey: string;
}

/**
 * Lança o app em MODO REAL (sem `STUDY_METHOD_E2E`), com perfil isolado em tmp,
 * e injeta as chaves reais SEQUENCIALMENTE via `keys:set-key`. Depois recarrega
 * a janela para o AppGate reler as chaves configuradas e VALIDAR de verdade
 * (rede real DeepSeek+Brave) até `phase: 'ready'` (shell do app visível).
 *
 * REQUER `hasRealKeys()` — chame `skipIfNoRealKeys()` antes (ou neste helper
 * é um erro se chamado sem chaves).
 */
export async function launchRealApp(opts: LaunchRealOpts = {}): Promise<RealApp> {
  const keys = realEnvKeys();
  if (!keys.deepseek || !keys.brave) {
    throw new Error(
      'launchRealApp sem DEEPSEEK_API_KEY/BRAVE_API_KEY. Exporte-as no shell do teste.',
    );
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-real-user-'));

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    STUDY_METHOD_WINDOW_VISIBLE: '0', // janela oculta (nada sobre o desktop)
    ...(opts.setupsDir ? { STUDY_METHOD_SETUPS_DIR: opts.setupsDir } : {}),
    ...opts.extraEnv,
  };
  // NUNCA seta STUDY_METHOD_E2E → fiação real.

  const app = await _electron.launch({
    args: [MAIN_ENTRY, '--disable-gpu', `--user-data-dir=${userDataDir}`],
    env,
    cwd: APP_ROOT,
  });

  const page = await app.firstWindow();
  await page.waitForSelector('#root, [data-testid]', { timeout: 60_000 });

  // Suprime o modal de tutorial de 1ª execução (a menos que `onboardingOffered:false`),
  // idêntico ao comportamento do helper stub — o OnboardingHost bloquearia a UI.
  if (opts.onboardingOffered !== false) {
    await page.addInitScript((key: string) => {
      try {
        (globalThis as { localStorage?: Storage }).localStorage?.setItem(key, 'true');
      } catch {
        /* no-op defensivo */
      }
    }, ONBOARDING_OFFERED_KEY);
    await page.reload();
    await page.waitForSelector('#root, [data-testid]', { timeout: 60_000 });
  }

  // SetupView (sem chaves) — injeta as chaves reais SEQUENCIALMENTE (o setKey
  // concorrente perde uma das chaves por race de leitura/escrita do store).
  await expect(page.getByRole('heading', { name: 'Antes de começar' })).toBeVisible();
  await page.evaluate((d) => (globalThis as any).api.keys.setKey('deepseek', d), keys.deepseek);
  await page.evaluate((b) => (globalThis as any).api.keys.setKey('brave', b), keys.brave);

  // Reload → AppGate relê o store e valida AMBAS de verdade (rede real).
  await page.reload();
  await page.waitForSelector('#root, [data-testid]', { timeout: 60_000 });

  // Shell do app (gate 'ready'). Timeout generoso: validação real de rede.
  const shell = page.getByRole('banner').getByText('Study Method — Tutor', { exact: false });
  await expect(shell).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole('tab', { name: 'Aula' })).toBeVisible({ timeout: 30_000 });

  return { app, page, userDataDir, deepseekApiKey: keys.deepseek, braveApiKey: keys.brave };
}

/** Fecha o app e remove o perfil tmp (que pode conter as chaves em claro). */
export async function closeRealApp(real: RealApp | undefined): Promise<void> {
  if (!real) return;
  try {
    await real.app.close();
  } catch {
    /* já fechada */
  }
  try {
    fs.rmSync(real.userDataDir, { recursive: true, force: true });
  } catch {
    /* tmp já removido — no-op */
  }
}

/**
 * Dispara a geração real de uma aula e aguarda por um estado TERMINAL
 * (`done` OU `error`), retornando o sinal de status observado.
 *
 * A geração real usa DeepSeek + Brave + runner: pode demorar minutos E as vezes
 * falhar transitoriamente (ex.: o modelo devolveu `reasoning_content` sem
 * `content`, rate limit, rede). Em vez de NÃO observar o erro (esperar só pelo
 * `done` e travar até o timeout), esta função espera o botão "Gerar aula"
 * re-habilitar (estado terminal) e, se o sinal for `lesson-status:error`,
 * retorna a mensagem da UI — o caller decide repetir.
 */
export async function generateRealLesson(
  page: Page,
  subject: string,
  opts: { attempts?: number; perAttemptMs?: number } = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  const attempts = opts.attempts ?? 2;
  const perAttemptMs = opts.perAttemptMs ?? 420_000;
  await page.getByRole('tab', { name: 'Aula' }).click();
  for (let attempt = 1; attempt <= attempts; attempt++) {
    await page.getByLabel('Assunto').fill(subject);
    const generateBtn = page.getByRole('button', { name: 'Gerar aula' });
    await generateBtn.click();
    try {
      // Estado terminal = geração terminou ⇒ botão re-habilitado.
      await expect(generateBtn).toBeEnabled({ timeout: perAttemptMs });
    } catch {
      // botão ainda desabilitado após o perAttemptMs — transiente lento.
    }
    await page.waitForTimeout(500);
    const done = await page
      .locator('[data-onboarding-signal="lesson-status:done"]')
      .isVisible()
      .catch(() => false);
    if (done) return { ok: true };
    const errorMsg = await page.locator('[role="alert"]').first().textContent().catch(() => '');
    if (attempt < attempts) {
      await page.waitForTimeout(2000); // pausa antes de repetir (transiente).
      continue;
    }
    return {
      ok: false,
      error: errorMsg?.trim() || `geração real não terminou em ${perAttemptMs}ms`,
    };
  }
  return { ok: false, error: 'geração real não concluiu' };
}