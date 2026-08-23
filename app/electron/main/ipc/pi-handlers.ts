/**
 * electron/main/ipc/pi-handlers.ts — handlers IPC do Pi Coding Agent.
 *
 * Canais (contrato congelado em shared/ipc-contract.ts, PI_CHANNELS):
 *   pi:execute      → valida o shape de PiExecuteRequest e delega a
 *                     `svc.execute(request, onEvent)`; os PiStreamEvent apurados
 *                     EMITEM via `emit(PI_CHANNELS.STREAM_EVENT, ev)`. Devolve
 *                     PiExecuteResult.
 *   pi:abort        → (event, sessionId) → svc.abort(sessionId).
 *   pi:get-status   → { available, message? } checando a disponibilidade do SDK.
 *
 * `buildPiHandlers(deps)` é PURA (devolve Map<canal, handler> sem tocar electron
 * nem o SDK); `registerPiHandlers(deps)` liga esse map ao ipcMain real via
 * safeHandle — idempotente com os placeholders de ipc/index.ts (removeHandler
 * antes de handle) e com re-registros.
 *
 * O serviço é injetado LAZY via `getService()` para que o SDK Pi só seja carregado
 * quando o primeiro invoke pedir (o PiAgentService faz os dynamic imports dentro
 * de execute/abort). O handler em si nunca importa @mariozechner/pi-*.
 */
import type { PiExecuteResult, PiExecuteRequest, PiStreamEvent } from '@shared/ipc-contract';
import { PI_CHANNELS } from '@shared/ipc-contract';
import { safeHandleMap, type IpcMainHandleLike, type IpcHandlerFn } from './safeHandle';

/** Superfície do serviço que os handlers usam (o PiAgentService real satisfaz). */
export interface PiAgentServiceLike {
  execute(
    request: PiExecuteRequest,
    onEvent?: (event: PiStreamEvent) => void
  ): Promise<PiExecuteResult>;
  abort(sessionId: string): void;
}

export interface PiHandlerDeps {
  /** Getter LAZY da instância do serviço (SDK carregado só no 1º uso). */
  getService: () => Promise<PiAgentServiceLike>;
  /** Emite um evento para a UI (ex.: webContents.send). */
  emit: (channel: string, ev: unknown) => void;
  /**
   * Verifica se o SDK Pi está disponível (default: dynamic import dos módulos
   * @mariozechner/pi-ai e @mariozechner/pi-coding-agent). Anti-acoplamento:
   * o `ensurePiSdk` real é privado do PiAgentService, então replicamos a checagem
   * mínima aqui para `pi:get-status` (mesma fonte de verdade que o execute usa).
   */
  checkPiSdk?: () => Promise<boolean>;
}

/** Valida o shape de um PiExecuteRequest; devolve a mensagem de erro ou null. */
export function validatePiExecuteRequest(request: unknown): string | null {
  if (!request || typeof request !== 'object') {
    return 'PiExecuteRequest inválido: esperava um objeto.';
  }
  const r = request as Record<string, unknown>;
  if (typeof r.prompt !== 'string' || r.prompt.trim() === '') {
    return 'PiExecuteRequest inválido: campo `prompt` deve ser uma string não vazia.';
  }
  const mc = r.modelConfig;
  if (!mc || typeof mc !== 'object') {
    return 'PiExecuteRequest inválido: campo `modelConfig` ({provider, model}) é obrigatório.';
  }
  const model = mc as Record<string, unknown>;
  if (typeof model.provider !== 'string' || model.provider.trim() === '') {
    return 'PiExecuteRequest inválido: `modelConfig.provider` deve ser uma string não vazia.';
  }
  if (typeof model.model !== 'string' || model.model.trim() === '') {
    return 'PiExecuteRequest inválido: `modelConfig.model` deve ser uma string não vazia.';
  }
  return null;
}

/** Check do SDK default (paralelo ao ensurePiSdk privado do PiAgentService). */
async function defaultCheckPiSdk(): Promise<boolean> {
  try {
    await import('@mariozechner/pi-coding-agent');
    await import('@mariozechner/pi-ai');
    return true;
  } catch {
    return false;
  }
}

/**
 * Monta o mapa canal→handler (PURA). `emit` recebe o canal do contrato
 * (ex.: PI_CHANNELS.STREAM_EVENT) e o evento serializável.
 */
export function buildPiHandlers(deps: PiHandlerDeps): Map<string, IpcHandlerFn> {
  const getService = deps.getService;
  const emit = deps.emit;
  const checkSdk = deps.checkPiSdk ?? defaultCheckPiSdk;

  const map: Map<string, IpcHandlerFn> = new Map();

  map.set(PI_CHANNELS.EXECUTE, async (_event, request: unknown): Promise<PiExecuteResult> => {
    const shapeError = validatePiExecuteRequest(request);
    if (shapeError) throw new Error(shapeError);

    const svc = await getService();
    const result = await svc.execute(request as PiExecuteRequest, (ev: PiStreamEvent) => {
      emit(PI_CHANNELS.STREAM_EVENT, ev);
    });
    return result;
  });

  map.set(PI_CHANNELS.ABORT, async (_event, sessionId: unknown): Promise<{ ok: boolean }> => {
    if (typeof sessionId !== 'string' || sessionId.trim() === '') {
      throw new Error('pi:abort requer um sessionId (string) no invoke.');
    }
    const svc = await getService();
    svc.abort(sessionId);
    return { ok: true };
  });

  map.set(PI_CHANNELS.GET_STATUS, async (): Promise<{ available: boolean; message?: string }> => {
    const available = await checkSdk();
    return {
      available,
      message: available
        ? undefined
        : 'Pi SDK não disponível. Instale @mariozechner/pi-coding-agent e @mariozechner/pi-ai.',
    };
  });

  return map;
}

/**
 * Entry real: liga o mapa de handlers do Pi ao ipcMain REAL via safeHandle
 * (remove o placeholder/registro anterior antes de handle). O ipcMain é
 * resolvido lazy para os testes não tocarem o runtime do Electron.
 */
export async function registerPiHandlers(deps: PiHandlerDeps, ipc?: IpcMainHandleLike): Promise<void> {
  const map = buildPiHandlers(deps);
  if (ipc) {
    safeHandleMap(ipc, map);
    return;
  }
  const { ipcMain } = await import('electron');
  safeHandleMap(ipcMain as IpcMainHandleLike, map);
}