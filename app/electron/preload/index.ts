/**
 * electron/preload/index.ts — entry do preload.
 *
 * A construção da API vive em api-schema.ts (função pura, sem electron); aqui
 * só ligamos o transporte real (electron's ipcRenderer) e expomos `window.api`
 * via contextBridge. contextIsolation está LIGADO no BrowserWindow; nada além
 * de `window.api` é exposto ao renderer.
 */
import { contextBridge, ipcRenderer } from 'electron';
import { createExposedApi, type IpcBridgeLike } from './api-schema';

const bridge: IpcBridgeLike = {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  on: (channel, listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void =>
      listener(...args);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
};

contextBridge.exposeInMainWorld('api', createExposedApi(bridge));