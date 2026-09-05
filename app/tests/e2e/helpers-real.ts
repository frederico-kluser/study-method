/**
 * tests/e2e/helpers-real.ts — helpers do harness E2E REAL (sem stubs).
 *
 * Diferente do `helpers.ts` (modo stub `STUDY_METHOD_E2E=1`), aqui o app é
 * lançado SEM o modo E2E: a fiação REAL da onda 3 (pesquisa Brave + autoria
 * via OpenRouter + runner de verdade) flui de ponta a ponta. As CHAVES REAIS
 * entram por envars do teste (`OPENROUTER_API_KEY`/`BRAVE_API_KEY`) — NUNCA
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
export function realEnvKeys(): { openrouter: string; brave: string } {
  return {
    openrouter: (process.env.OPENROUTER_API_KEY ?? '').trim(),
    brave: (process.env.BRAVE_API_KEY ?? '').trim(),
  };
}

/** True quando BOTH chaves reais estão disponíveis no ambiente. */
export function hasRealKeys(): boolean {
  const k = realEnvKeys();
  return k.openrouter !== '' && k.brave !== '';
}

/** Reason usado no `test.skip` das specs reais quando faltam as envs. */
export const REAL_KEYS_SKIP_REASON =
  'OPENROUTER_API_KEY/BRAVE_API_KEY não definidas no ambiente do teste. ' +
  'Rode com `npm run test:e2e:real` (exporte as chaves no shell) para exercitar a didática real.';

/** Chama `test.skip` da spec real quando faltam as envs reais. */
export function skipIfNoRealKeys(): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { test } = require('@playwright/test') as typeof import('@playwright/test');
  test.skip(!hasRealKeys(), REAL_KEYS_SKIP_REASON);
}

/**
 * ONDA4-E2E-FENCE (achado, não pedido originalmente): `real-lesson.spec.ts` e
 * `real-didactics.spec.ts` dependem de `generateRealLesson` — um fluxo AD-HOC
 * ("Assunto" → botão "Gerar nova aula" → LESSON-ORCHESTRATOR pesquisa+autoria
 * em tempo real) que a UI **não tem mais**. Isto não é uma flakiness nem um
 * detalhe de seletor: é uma mudança de produto, documentada no próprio código
 * — `shared/ipc-contract.ts` (bloco "TRILHAS — rodada 8 — conteúdo
 * pré-definido por CLI"): "A partir da rodada 8 o aluno NÃO GERA mais aula:
 * as trilhas chegam prontas (...); os canais antigos de geração (...)
 * continuam existindo e são usados apenas pelos fluxos legados." E
 * `LessonView.tsx` (cabeçalho): "A partir da rodada 8 (...) esta view é um
 * chat direto com o tutor" — sem campo de assunto, sem botão de gerar. `grep
 * -rn "generateLesson(" src/` não acha NENHUM call-site no renderer: o canal
 * IPC `study:generate-lesson` sobrevive no main só para uso legado, sem porta
 * de entrada na GUI.
 *
 * Sem chaves reais, isto nunca aparecia (as specs já paravam em
 * `skipIfNoRealKeys`). COM chaves reais no shell (ambiente desta correção),
 * as specs chegavam a `getByLabel('Assunto').fill(...)` e estouravam
 * `Timeout 30000ms exceeded` — um timeout confuso que parece rede lenta mas
 * na verdade é campo inexistente. Este guard troca o timeout obscuro por um
 * SKIP explícito e verificado (não é "skip de conveniência": é uma checagem
 * de FATO sobre a topologia da tela, feita uma vez por run, com timeout curto
 * porque não há nada transiente a esperar — ou o campo está lá, ou a tela é
 * outra).
 */
export const LEGACY_GENERATION_UI_SKIP_REASON =
  'O fluxo legado "Assunto → Gerar nova aula" não existe mais na UI (retirado ' +
  'na rodada 8 — LessonView.tsx virou chat de trilha; shared/ipc-contract.ts ' +
  'declara os canais de geração "usados apenas pelos fluxos legados"; zero ' +
  'call-sites de generateLesson( no renderer). A autoria real hoje roda só ' +
  'via CLI (tools/track-cli.ts) — fora do alcance de um harness Electron E2E ' +
  'que dirige a GUI. Este spec precisaria ser reescrito contra um fluxo REAL ' +
  'que ainda exista na tela (decisão do dono do produto/da suíte, fora do ' +
  'escopo desta correção).';

/**
 * Detecta se o fluxo legado de geração ainda existe: abre a aba "Aula" e
 * checa o campo "Assunto". Timeout CURTO e deliberado — não é um estado
 * transiente que vale a pena esperar (a tela não chama rede nenhuma para
 * decidir o que renderizar aqui); é a topologia da tela: ou está lá em
 * poucos segundos, ou não vai aparecer.
 */
export async function hasLegacyGenerationUi(page: Page): Promise<boolean> {
  await page.getByRole('tab', { name: 'Aula' }).click();
  return page
    .getByLabel('Assunto')
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
}

/**
 * Chama `test.skip` quando o fluxo legado de geração (ver
 * `LEGACY_GENERATION_UI_SKIP_REASON`) não existe mais na tela — chamar DEPOIS
 * do gate 'ready' (o app precisa estar destravado para a aba "Aula" existir).
 */
export async function skipIfNoLegacyGenerationUi(page: Page): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { test } = require('@playwright/test') as typeof import('@playwright/test');
  const has = await hasLegacyGenerationUi(page);
  test.skip(!has, LEGACY_GENERATION_UI_SKIP_REASON);
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
  openrouterApiKey: string;
  braveApiKey: string;
}

/**
 * Lança o app em MODO REAL (sem `STUDY_METHOD_E2E`), com perfil isolado em tmp,
 * e injeta as chaves reais SEQUENCIALMENTE via `keys:set-key`. Depois recarrega
 * a janela para o AppGate reler as chaves configuradas e VALIDAR de verdade
 * (rede real OpenRouter+Brave) até `phase: 'ready'` (shell do app visível).
 *
 * REQUER `hasRealKeys()` — chame `skipIfNoRealKeys()` antes (ou neste helper
 * é um erro se chamado sem chaves).
 */
export async function launchRealApp(opts: LaunchRealOpts = {}): Promise<RealApp> {
  const keys = realEnvKeys();
  if (!keys.openrouter || !keys.brave) {
    throw new Error(
      'launchRealApp sem OPENROUTER_API_KEY/BRAVE_API_KEY. Exporte-as no shell do teste.',
    );
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-real-user-'));

  // Se QUALQUER passo abaixo falhar (launch, janela, set de chaves, gate), o
  // possível userDataDir com chaves em claro NÃO pode ficar órfão em /tmp —
  // remove-o antes de propagar, para não vazar chaves no disco nem acumular lixo.
  try {
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      STUDY_METHOD_WINDOW_VISIBLE: '0', // janela oculta (nada sobre o desktop)
      // LOCALE PINADO (determinismo): as specs reais assumem UI pt-BR (tabs
      // "Aula", headings "Antes de começar", botão "Gerar nova aula"). O
      // `--lang=pt-BR` fixa o locale do app; o LANG é fallback defensivo (CI).
      LANG: 'pt_BR.UTF-8',
      ...(opts.setupsDir ? { STUDY_METHOD_SETUPS_DIR: opts.setupsDir } : {}),
      ...opts.extraEnv,
    };
    // NUNCA seta STUDY_METHOD_E2E → fiação real.

    const app = await _electron.launch({
      args: [MAIN_ENTRY, '--disable-gpu', '--lang=pt-BR', `--user-data-dir=${userDataDir}`],
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
    await page.evaluate((d) => (globalThis as any).api.keys.setKey('openrouter', d), keys.openrouter);
    await page.evaluate((b) => (globalThis as any).api.keys.setKey('brave', b), keys.brave);

    // Reload → AppGate relê o store e valida AMBAS de verdade (rede real).
    await page.reload();
    await page.waitForSelector('#root, [data-testid]', { timeout: 60_000 });

    // Shell do app (gate 'ready'). Timeout generoso: validação real de rede.
    const shell = page.getByRole('banner').getByText('Study Method — Tutor', { exact: false });
    await expect(shell).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole('tab', { name: 'Aula' })).toBeVisible({ timeout: 30_000 });

    return {
      app,
      page,
      userDataDir,
      openrouterApiKey: keys.openrouter,
      braveApiKey: keys.brave,
    };
  } catch (err) {
    // Lanço falhou → limpa o perfil isolado (nada de chaves em claro no disco).
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      /* tmp já removido — no-op */
    }
    // Se um setupsDir tmp foi passado (as specs criam um com mkdtemp) e o launch
    // fracassou, o diretório fica órfão — remove-o também para não deixar lixo.
    // Só toca em dirs SOB os.tmpdir() (nunca um setups dir do usuário).
    const setupsDir = opts.setupsDir;
    if (setupsDir && path.dirname(setupsDir) === os.tmpdir()) {
      try {
        fs.rmSync(setupsDir, { recursive: true, force: true });
      } catch {
        /* tmp já removido — no-op */
      }
    }
    throw err;
  }
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
 * A geração real usa OpenRouter + Brave + runner: pode demorar minutos E as vezes
 * falhar transitoriamente (ex.: o modelo devolveu `reasoning_content` sem
 * `content`, rate limit, rede). Em vez de NÃO observar o erro (esperar só pelo
 * `done` e travar até o timeout), esta função espera o botão "Gerar nova aula"
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
    const generateBtn = page.getByRole('button', { name: 'Gerar nova aula' });
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