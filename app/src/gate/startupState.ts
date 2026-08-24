/**
 * src/gate/startupState.ts — lógica PURA do gate de início (sem React/electron).
 *
 * Centraliza a DECISÃO de fase a partir do `StartupStatus` vindo do main, e o
 * desdobramento de flags online/local para o STARTUP context. Mantido isolado
 * para ser testável sem DOM (tsconfig.node.json via tests/startupState.test.ts).
 *
 * REGRA DA DECISÃO (documentada): o main já converge o resultado em uma fase
 * (`blocked`/`offline`/`ready`) conforme as chaves lidas e validadas; este
 * módulo apenas NORMALIZA/deriva:
 *  - `applyOfflineFlags(result)` → quando `result.offline` é true, as features
 *    online ficam gateadas (`canUseOnline=false`) e o LLM local continua
 *    utilizável (`canUseLocal=true`).
 *  - `isBlockedForSetup` → se alguma chave está sem configurar OU é inválida,
 *    o SetupView é obrigatório.
 */

import type { StartupStatus } from '@shared/ipc-contract';

/** Fase exibida pelo AppGate (espelha `StartupStatus.phase`). */
export type StartupGatePhase = StartupStatus['phase'];

/** Flags de capacidade consumidos pelas features (via useStartup hook). */
export interface StartupFlags {
  /** Features ONLINE disponíveis (chaves válidas e rede ok). */
  canUseOnline: boolean;
  /** LLM local utilizável (sempre true — independe de rede/chaves online). */
  canUseLocal: boolean;
}

export interface StartupFlagsSource {
  offline: boolean;
  phase: StartupStatus['phase'];
  deepseek: StartupStatus['deepseek'];
  brave: StartupStatus['brave'];
}

/**
 * Aplica os flags online/local a partir de um StartupStatus (ou de um subset
 * com as mesmas chaves). Regra: OFFLINE quando `offline===true` (ambas as
 * chaves configuradas falharam por rede); nesse caso online fica desligado e o
 * local ligado. Em QUALQUER outra fase (ready/blocked/checking) a rede é
 * considerada disponível a nível de flags — o 'blocked' é resolvido pelos
 * gate's de chave, não pelos flags de capacidade.
 */
export function applyOfflineFlags(source: StartupFlagsSource): StartupFlags {
  if (source.offline === true) {
    return { canUseOnline: false, canUseLocal: true };
  }
  return { canUseOnline: true, canUseLocal: true };
}

/**
 * True quando o usuário precisa ver o SetupView. A FASE é a fonte autoritativa:
 * o main (classifyStartup em startup-handlers.ts) já decide 'blocked' apenas
 * quando alguma chave falta configurar OU é inválida — e NUNCA para o modo
 * offline (ambas as chaves configuradas só falharam por rede → o app inicia
 * com aviso, não com setup). Portanto:
 *   phase === 'blocked'  → SetupView obrigatório;
 *   phase ready/offline  → não bloqueia (offline inicia com aviso).
 */
export function isBlockedForSetup(source: Pick<StartupStatus, 'phase'>): boolean {
  return source.phase === 'blocked';
}