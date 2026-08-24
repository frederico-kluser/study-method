/**
 * electron/main/ipc/safeHandle.ts — registro de handlers IPC idempotente e
 * danger-free.
 *
 * `ipcMain.handle(channel, handler)` LANÇA "Attempted to register a second
 * handler for '<channel>'" quando o canal já tem um handler. Durante a fiação
 * da onda 3 isto acontece de propósito: o `registerIpcHandlers()` do
 * ipc/index.ts registra PLACEHOLDERS para os grupos study, pi e localAi, e a
 * fiação específica (registerPiHandlers/registerStudyHandlers/…) SUBSTITUI
 * esses placeholders pelos handlers reais.
 *
 * `safeHandle` faz `removeHandler(channel)` (no-op se ausente) ANTES de
 * `handle(...)`, então:
 *   - é idempotente com os placeholders de ipc/index.ts;
 *   - é idempotente com registros repetidos (respostas a reconfigs/testes);
 *   - preserva o comportamento de `handle` (o evento + args chegam ao handler).
 *
 * O ipcMain NÃO é importado por DI direto aqui: `registerXHandlers()` do run-time
 * resolve o `electron`/`ipcMain` real lazy e chama `safeHandleMap(ipcMain, map)`;
 * os testes injetam um ipcMain fake (ver tests/study-wiring.test.ts).
 */

/** A superfície mínima de ipcMain que safeHandle usa (real ou fake). */
export interface IpcMainHandleLike {
  removeHandler(channel: string): void;
  handle(channel: string, fn: (...args: unknown[]) => unknown): void;
}

/** Handler IPC: recebe o evento + args e devolve o resultado (ou Promise). */
export type IpcHandlerFn = (...args: unknown[]) => unknown | Promise<unknown>;

/**
 * Remove o handler existente (se houver) e registra o novo. Idempotente e
 * seguro com placeholders e re-registros.
 */
export function safeHandle(
  ipc: IpcMainHandleLike,
  channel: string,
  handler: IpcHandlerFn,
): void {
  ipc.removeHandler(channel); // no-op quando não há handler registrado
  ipc.handle(channel, handler as (...args: unknown[]) => unknown);
}

/**
 * Liga todos os canais de um `Map<canal, handler>` via safeHandle num único
 * ipcMain (real ou fake). Idempotente: placeholder→real e re-registro.
 */
export function safeHandleMap(
  ipc: IpcMainHandleLike,
  handlers: Map<string, IpcHandlerFn>,
): void {
  for (const [channel, handler] of handlers) {
    safeHandle(ipc, channel, handler);
  }
}