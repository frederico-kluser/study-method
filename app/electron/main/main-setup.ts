/**
 * electron/main/main-setup.ts — orquestração pura do setup IPC do bootstrap.
 *
 * O problema real desta onda: registerKeysHandlers() (keys:* da onda 1) nunca
 * era chamado no runtime — o entry de main/index.ts só chamava
 * registerIpcHandlers() (settings:* + placeholders, keys:* de fora por contrato).
 * `buildMainSetup` centraliza essa ordem e é FUNÇÃO PURA (não importa electron),
 * então um teste de wiring consegue provar que registerKeys é invocado junto de
 * registerIpc sem bootar o Electron.
 */

/** Dependências injetadas por buildMainSetup (testável sem rodar Electron). */
export interface MainSetupDeps {
  /** Registra os handlers IPC settings:* (+ placeholders). */
  registerIpc: () => Promise<void>;
  /** Registra os handlers IPC keys:* (onda 1). */
  registerKeys: () => void;
}

/**
 * Registra todos os handlers IPC que o main precisa — primeiro os settings:*
 * (registerIpc, que também liga os placeholders das ondas futuras), depois os
 * keys:* (registerKeys, onda 1). O entry real injeta
 * registerIpcHandlers/registerKeysHandlers; os testes injetam fakes.
 */
export async function buildMainSetup(deps: MainSetupDeps): Promise<void> {
  await deps.registerIpc();
  deps.registerKeys();
}