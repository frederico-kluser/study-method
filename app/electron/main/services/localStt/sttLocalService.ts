/**
 * DONO do runtime STT LOCAL no main — o holder dos singletons (onda 8, voz).
 * O canal de modelo (`ipc/stt-model-handlers.ts`) IMPORTA DAQUI: este arquivo
 * é o dono do `sttModelStore` criado com o `userDataPath` do app.
 *
 * O `app` é importado por ESM, mas o ACESSO a `app.getPath` é lazy: a criação
 * do store só acontece no primeiro `getLocalSttStore()`, sempre depois de o
 * app emitir `ready`.
 *
 * O store é criado com o `embeddedModelsPath` — em dev,
 * `<app.getAppPath()>/resources` (os arquivos que estão em
 * `resources/stt-models/`); empacotado, `process.resourcesPath`. O único
 * modelo (Nemotron) viaja EMBUTIDO nesta onda.
 *
 * @module electron/main/services/localStt/sttLocalService
 */

import { app } from 'electron';
import * as path from 'path';
import { createSttModelStore, type SttModelStore } from './sttModelStore';
import { asrProxy } from './AsrProxyService';

/** O store singleton — `null` até o primeiro `getLocalSttStore()`. */
let store: SttModelStore | null = null;

/**
 * Onde o modelo EMBUTIDO mora no disco, ou `undefined` quando não há onde
 * procurar. Em dev os arquivos ficam no REPOSITÓRIO (`resources/stt-models/`);
 * empacotado, no diretório de resources do app (`process.resourcesPath`).
 */
function embeddedModelsPath(): string | undefined {
  if (app.isPackaged) return process.resourcesPath;
  return path.join(app.getAppPath(), 'resources');
}

/**
 * O store de modelos do STT local — SINGLETON, criado lazily com o
 * `userDataPath` do app e o `embeddedModelsPath`.
 */
export function getLocalSttStore(): SttModelStore {
  if (!store) {
    store = createSttModelStore({
      userDataPath: app.getPath('userData'),
      embeddedModelsPath: embeddedModelsPath(),
    });
  }
  return store;
}

/**
 * Shutdown do runtime local no before-quit — `asrProxy.stop()`: STOP com grace
 * de 3 s e kill, para nenhum processo utility órfão sobreviver ao quit.
 * Idempotente e terminal.
 */
export async function shutdownLocalStt(): Promise<void> {
  await asrProxy.stop();
}

/** Test seam: esquece o singleton (o próximo `getLocalSttStore()` recria). */
export function resetLocalSttStoreForTests(): void {
  store = null;
}

// Reexport do catálogo — quem importa daqui não precisa conhecer o caminho.
export {
  DEFAULT_STT_MODEL,
  getSttModelById,
  STT_MODEL_CATALOG,
  STT_SUPPORTED_LOCALES,
  sttLanguageHint,
  type SttModelEntry,
  type SttModelFile,
  type SttModelMode,
} from './sttModels.constants';