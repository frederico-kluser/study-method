/**
 * tests/e2e/helpers.ts — utilitários compartilhados do harness E2E.
 *
 * Lança o app Electron BUILDADO (out/main/index.js) com o modo E2E ativo
 * (STUDY_METHOD_E2E=1) e envars de controle do gate/stubs. O renderer é o de
 * produção — nada de mocks no front.
 */
import { _electron, type ElectronApplication, type Page } from '@playwright/test';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';

/** Raiz do app (onde está package.json / playwright.config.ts). */
export const APP_ROOT = path.resolve(__dirname, '..', '..');

/** Rota do bundle principal do Electron (release build). */
export const MAIN_ENTRY = path.join(APP_ROOT, 'out', 'main', 'index.js');

export interface LaunchOpts {
  /** Envars de controle do stub/gate (ex.: E2E_GATE, E2E_KEYS, E2E_NETWORK). */
  env?: Record<string, string>;
  /** Diretório de trabalho (default: APP_ROOT). */
  cwd?: string;
}

/**
 * Chave de localStorage da oferta de primeira execução do tutorial (mesma do
 * `onboardingStorage.service`). Pré-marcá-la evita o TutorialSelectionModal /
 * overlay bloquear a UI nas specs que interagem com o shell.
 */
const ONBOARDING_OFFERED_KEY = 'study-method-onboarding-offered-v1';

/** Cria um diretório temporário para workspaces do teste. */
export function makeWorkspaceRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'study-method-e2e-ws-'));
}

/**
 * Lança o app em modo E2E com as envars dadas. Retorna a aplicação e a primeira
 * janela (renderer pronto). A janela espera o DOM do pequeno splash/gate, já
 * que o renderer inicia com o bundle de produção.
 */
export async function launchApp(opts: LaunchOpts = {}): Promise<{
  app: ElectronApplication;
  page: Page;
}> {
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    STUDY_METHOD_E2E: '1',
    // JANELA SEM SOBREPOR (onda 13): o main cria a janela oculta e não-focável
    // com este valor — os testes rodam sem abrir janela sobre o desktop e sem
    // roubar foco do usuário (o defaults ausente mantém o comportamento normal).
    STUDY_METHOD_WINDOW_VISIBLE: '0',
    // LOCALE PINADO (determinismo do harness): as specs assumem UI em pt-BR. Sem
    // isto, o app detecta o idioma do HOST via navigator.language (ex.: 'en-US'
    // num macOS em inglês) e renderiza 'en', quebrando TODAS as asserções de
    // texto pt-BR. O `--lang=pt-BR` (switch Chromium, abaixo) fixa o locale do
    // app; o LANG é fallback defensivo para runtimes/CI que leem a env antes do
    // switch. O idioma NÃO é objeto de teste aqui (a DETECÇÃO real é coberta por
    // unit tests — tests/i18n-resources.test.ts — com navigator mockado).
    LANG: 'pt_BR.UTF-8',
    ...opts.env,
  };

  const app = await _electron.launch({
    // `--lang=pt-BR` garante navigator.language='pt-BR' independente do host.
    args: [MAIN_ENTRY, '--disable-gpu', '--lang=pt-BR'],
    env,
    cwd: opts.cwd ?? APP_ROOT,
  });

  const page = await app.firstWindow();
  // Renderer iniciou: aguarda o elemento-raiz do app (AppGate montado).
  await page.waitForSelector('#root, [data-testid]', { timeout: 60_000 });

  // ONBOARDING E2E (onda 13): o OnboardingHost está montado e, em 'ready' com
  // userData fresco, abre o TutorialSelectionModal no boot — o backdrop do modal
  // BLOQUEIA a interação com o shell. Por padrão pré-marcamos a oferta como já
  // mostrada (via addInitScript) e recarregamos, então o modal não aparece nas
  // specs que interagem com a UI. Só a spec de onboarding (E2E_ONBOARDING='1')
  // deixa a primeira execução acontecer (modal visível, tutorial testável).
  if (opts.env?.E2E_ONBOARDING === '1') {
    // Fresh: nada a suprimir — a oferta de 1ª execução dispara normalmente.
  } else {
    await page.addInitScript((key: string) => {
      try {
        // localStorage (global do renderer) é o mesmo padrão de tests/e2e/e2e-i18n.ts.
        localStorage.setItem(key, 'true');
      } catch {
        /* localStorage indisponível — no-op defensivo. */
      }
    }, ONBOARDING_OFFERED_KEY);
    await page.reload();
    await page.waitForSelector('#root, [data-testid]', { timeout: 60_000 });
  }
  return { app, page };
}

/** Fecha a aplicação de forma robusta (desvia app.quit via evaluate). */
export async function closeApp(app: ElectronApplication): Promise<void> {
  try {
    await app.close();
  } catch {
    // Já fechada — ignora.
  }
}

/**
 * Varre um diretório recursivamente e devolve os paths de arquivos cujo
 * conteúdo contém `needle`. Usado para aferir persistência real em disco
 * (o workspace do stub mora sob o E2E_WORKSPACE_ROOT passado ao app).
 */
export function findFilesContaining(dir: string, needle: string): string[] {
  const hits: string[] = [];
  const walk = (cur: string): void => {
    if (!fs.existsSync(cur)) return;
    for (const ent of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, ent.name);
      if (ent.isDirectory()) {
        walk(full);
      } else if (ent.isFile()) {
        try {
          if (fs.readFileSync(full, 'utf8').includes(needle)) hits.push(full);
        } catch {
          // arquivo ilegível — ignora.
        }
      }
    }
  };
  walk(dir);
  return hits;
}