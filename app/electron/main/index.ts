/**
 * electron/main/index.ts — bootstrap do processo main.
 *
 * Abre a janela única (tema escuro, 1280x800, min 900x600), registra os
 * handlers IPC (após whenReady), força instância única e lida com o ciclo de
 * vida padrão do Electron. Em dev carrega a URL do dev server
 * (process.env['ELECTRON_RENDERER_URL']); em prod carrega o bundle do
 * renderer (out/renderer/index.html).
 *
 * Fiação da onda 3 (ui-wiring): no whenReady constrói os serviços REAIS
 * (settingsStore, PiAgentService, runner/lesson/orchestrator com autor+juiz
 * DeepSeek, brave + research) e entrega registerPi/registerStudy/registerLocalAi
 * ao buildMainSetup, que então registra na ordem (ipc→keys→localAi→pi→study) com
 * safeHandle (placeholders → reais). Motor LLM local e shim local do Pi ficam
 * para ondas futuras (ver handoff).
 */
import { join } from 'node:path';
import { app, BrowserWindow, shell } from 'electron';

import { registerIpcHandlers } from './ipc';
import { registerKeysHandlers } from './ipc/keys-handlers';
import { registerPiHandlers } from './ipc/pi-handlers';
import { registerStudyHandlers, type RunnerLike, type LessonServiceLike } from './ipc/study-handlers';
import { registerLocalAiHandlers } from './ipc/localAi-handlers';
import { buildMainSetup, emitToAll } from './main-setup';
import { getSettingsStore } from './services/settingsStore';
import { createPiAgentService } from './services/PiAgentService';
import { createStudyMethodRunner } from './services/studyMethodRunner';
import { createDeepSeekLlmJudge } from './services/deepseekLlmJudge';
import { createDeepSeekLessonAuthor } from './services/deepseekLessonAuthor';
import { createLessonOrchestrator } from './services/lessonOrchestrator';
import { createBraveSearchService } from './services/braveSearchService';
import { createResearchPlanner } from './services/researchPlanner';

const isDev = !!process.env['ELECTRON_RENDERER_URL'];

// Instância única — um segundo launch foca a janela já aberta.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  void app.whenReady().then(async () => {
    // Registro dos handlers IPC — fiação real da onda 3-ui-wiring.
    try {
      const settingsStore = await getSettingsStore();

      const judge = createDeepSeekLlmJudge({
        getApiKey: () => settingsStore.getApiKey('deepseek'),
      });

      const runner = createStudyMethodRunner({
        skillDir: undefined, // resolve pelo default (env/app path)
        llmJudge: judge,
      }) as unknown as RunnerLike;

      const author = createDeepSeekLessonAuthor({
        getApiKey: () => settingsStore.getApiKey('deepseek'),
      });

      const brave = createBraveSearchService({
        resolveApiKey: () => settingsStore.getApiKey('brave'),
      });
      const research = createResearchPlanner({ search: brave });

      const lesson = createLessonOrchestrator({
        research,
        runner: runner as Parameters<typeof createLessonOrchestrator>[0]['runner'],
        author,
        judge,
      }) as unknown as LessonServiceLike;

      const piService = createPiAgentService();
      const getPiService = async () => piService;

      /** Emite para a janela principal (a única hoje). */
      const emitWindow = (channel: string, ev: unknown): void => {
        const win = BrowserWindow.getAllWindows()[0];
        emitToAll(win?.webContents, channel, ev);
      };

      await buildMainSetup({
        registerIpc: registerIpcHandlers,
        registerKeys: registerKeysHandlers,
        registerLocalAi: () => registerLocalAiHandlers(),
        registerPi: () => registerPiHandlers({ getService: getPiService, emit: emitWindow }),
        registerStudy: () =>
          registerStudyHandlers({ runner, lesson, emit: emitWindow }),
      });
    } catch (err) {
      console.error('[main] falha ao registrar handlers IPC:', err);
    }

    createWindow();

    // macOS: reabre uma janela quando o ícone do dock é clicado e nenhuma existe.
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

/** Cria a janela principal da GUI Study Method. */
function createWindow(): void {
  const win = new BrowserWindow({
    title: 'Study Method — Tutor',
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // sandbox: true — o preload é um bundle CJS enxuto que só `require('electron')`
      // (contextBridge/ipcRenderer; a lógica de api-schema.ts é embutida no bundle).
      // Isso é compatível com o sandbox de preload do Electron (a API polyfill de
      // preload expõe exatamente contextBridge+ipcRenderer+afins). webSecurity
      // permanece true (default) e o HTML carrega o CSP meta (app/index.html).
      sandbox: true,
    },
  });

  win.on('ready-to-show', () => win.show());

  // Links externos (http/https) abrem no navegador do sistema, nunca na janela.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (isDev) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'] as string);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}