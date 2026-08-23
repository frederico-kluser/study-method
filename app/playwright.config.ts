import { defineConfig, devices } from '@playwright/test';

/**
 * playwright.config.ts — harness E2E da GUI do Study Method.
 *
 * Roda o app Electron REAL (release build em out/main) e interage com o
 * renderer de produção exatamente como um usuário. Em modo E2E o main responde
 * com stubs determinísticos (STUDY_METHOD_E2E=1 — ver
 * electron/main/services/e2eStubs.ts): sem GPU relevante para inferência, sem
 * rede real (deepseek/brave), sem LLM/GGUF, sem STT/TTS.
 *
 * Execução (ver tests/e2e/README.md):
 *   npm run build && npm run test:e2e
 *
 * Sem GPU para inferência: o Electron abre com --disable-gpu (seguro em CI sem
 * display; em desktop a GPU de vídeo continua disponível, nada relevante à
 * inferência é tocado).
 */
export default defineConfig({
  testDir: './tests/e2e',
  /* One worker: Electron não paraleliza (uma instância única por run). */
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  retries: 0,
  reporter: 'list',
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'electron-e2e',
      // _electron (ElectronApplication) — não usa browsers do registry normal.
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});