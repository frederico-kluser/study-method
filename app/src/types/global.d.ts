/**
 * src/types/global.d.ts — declaração global de `window.api`.
 *
 * O preload expõe `window.api` via contextBridge com um objeto cuja forma é
 * definida em electron/preload/index.ts (função pura createExposedApi).
 * Aqui reexportamos os tipos de payload do contrato para o renderer.
 */
import type { ApiSchema } from '../../electron/preload/api-schema';

declare global {
  interface Window {
    /** API exposta pelo preload (contextBridge), tipada com o contrato. */
    api: ApiSchema;
  }
}

export {};