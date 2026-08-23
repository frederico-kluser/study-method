/**
 * electron/main/main-setup.ts — orquestração pura do setup IPC do bootstrap.
 *
 * `buildMainSetup` centraliza a ORDEM de registro dos handlers IPC e é FUNÇÃO
 * PURA (não importa electron): registra primeiro os registradores genéricos e os
 * que montam placeholders, e só então os específicos (que usam safeHandle para
 * REMOVER o placeholder antes de registrar o handler real).
 *
 * Ordem (deve ser preservada nos testes e no entry):
 *   registerIpc (settings:* reais + placeholders p/ study/pi/localAi)
 *     → registerKeys (keys:*)
 *     → registerLocalAi (localAi:* reais — via safeHandle, remove placeholder)
 *     → registerPi (pi:* reais — via safeHandle)
 *     → registerStudy (study:* reais — via safeHandle)
 */

/** Dependências injetadas por buildMainSetup (testável sem rodar Electron). */
export interface MainSetupDeps {
  /** Registra settings:* (+ placeholders de study/pi/localAi). */
  registerIpc: () => Promise<void>;
  /** Registra keys:* (onda 1). */
  registerKeys: () => void;
  /** Registra localAi:* (substitui placeholders; safeHandle). */
  registerLocalAi: () => Promise<void>;
  /** Registra pi:* (substitui placeholders; safeHandle). */
  registerPi: () => Promise<void>;
  /** Registra study:* (substitui placeholders; safeHandle). */
  registerStudy: () => Promise<void>;
}

/**
 * Registra todos os handlers IPC do main na ordem fixa. Genéricos/placeholders
 * primeiro, específicos depois — cada específico usa safeHandle e portanto
 * remove o placeholder antes de registrar o handler real.
 */
export async function buildMainSetup(deps: MainSetupDeps): Promise<void> {
  await deps.registerIpc();
  deps.registerKeys();
  await deps.registerLocalAi();
  await deps.registerPi();
  await deps.registerStudy();
}

/**
 * Emite um evento para TODAS as janelas abertas (e para o webContents passado,
 * se ainda estiver vivo). Usado pelas fiações que precisam mandar eventos da
 * UI (progresso de aula, stream do Pi). `webContents` é injetado pelo entry —
 * este módulo não importa electron.
 */
export function emitToAll(
  webContents: { isDestroyed(): boolean; send(channel: string, ...args: unknown[]): void } | undefined,
  channel: string,
  ev: unknown,
): void {
  if (!webContents || webContents.isDestroyed()) return;
  webContents.send(channel, ev);
}