/**
 * src/lib/testAnswerEvents.ts — mapeia o payload do evento `test-answer-event`
 * (main push) para a fase de status da fase determinística.
 *
 * O main emite o evento como `{ phase: 'started'|'done', challengeDir, result?|error? }`
 * (contrato documentado em docs/app-gui.md §2.3). Esta função é a ÚNICA fonte de
 * verdade para derivar a fase a partir do payload cru que chega no renderer —
 * defensivamente também tolera o antigo campo `type` (compatibilidade), para o
 * caso de um main antigo/outro produtor ainda emitir `type` em vez de `phase`.
 *
 * Função pura (sem React, sem DOM, sem API) — testável isoladamente.
 *
 * @returns 'started' se a fase é started, 'done' se é done, null caso contrário
 *          (qualquer outro valor/campo/forma — o chamador então não muda o status).
 */
export function mapTestAnswerPhase(raw: unknown): 'started' | 'done' | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as Record<string, unknown>;
  // Contrato canônico: `phase` (main atual). Fallback compat: `type` (main antigo).
  const phase = typeof value.phase === 'string' ? value.phase : typeof value.type === 'string' ? value.type : null;
  if (phase === 'started' || phase === 'done') return phase;
  return null;
}