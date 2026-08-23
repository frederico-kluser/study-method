/**
 * electron/main/index.ts — bootstrap do processo main.
 *
 * Abre a janela única (tema escuro, 1280x800, min 900x600), registra os
 * handlers IPC (após whenReady), força instância única e lida com o ciclo de
 * vida padrão do Electron. Em dev carrega a URL do dev server
 * (process.env['ELECTRON_RENDERER_URL']); em prod carrega o bundle do
 * renderer (out/renderer/index.html). Motor LLM, terminal, pesquisa e editor
 * são ligados em ondas seguintes — este bootstrap não importa nada disso.
 */
import { join } from 'node:path';
import { app, BrowserWindow, shell } from 'electron';

import { registerIpcHandlers } from './ipc';
import { registerKeysHandlers } from './ipc/keys-handlers';
import { buildMainSetup } from './main-setup';

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
    // Registro dos handlers IPC (settings:* reais; keys:* reais da onda 1; placeholders para as ondas futuras).
    try {
      await buildMainSetup({
        registerIpc: registerIpcHandlers,
        registerKeys: registerKeysHandlers,
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
      sandbox: false,
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