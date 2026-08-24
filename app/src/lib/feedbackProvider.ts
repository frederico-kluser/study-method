/**
 * src/lib/feedbackProvider.ts — decide o provedor da fase de feedback do desafio.
 *
 * FUNÇÃO PURA (sem React/DOM/API): recebe o estado salvo de `settings` (qual
 * provedor o usuário escolheu) e o modelo local ativo, e devolve quem roda o
 * feedback pedagógico:
 *
 *   - 'local'    → o modelo local é usado como avaliador do desafio.
 *   - 'deepseek' → o coding agent `pi` (DeepSeek remoto) avalia como antes.
 *
 * Regra de decisão (o modelo local SÓ avalia quando BOTH):
 *   1. o usuário selecionou `defaultModelProvider === 'local'` nas Configurações; E
 *   2. existe um modelo local ativo (`activeLocalModelId` não vazio).
 *
 * Em qualquer outro caso — provedor `'local'` sem modelo ativo, provedor
 * `'deepseek'` explícito, ou `defaultModelProvider` ausente (nunca salvo;
 * default é o comportamento histórico do DeepSeek) — cai para `'deepseek'`.
 *
 * A UI NÃO tenta fallback automático após um erro de chat local: se o chat
 * local falhar no runtime, ela mostra o erro e sugere voltar ao DeepSeek (ver
 * o ponto de uso em ChallengeView). Esta função decide APENAS o roteamento da
 * chamada, não lida com falhas.
 */

export type FeedbackProvider = 'local' | 'deepseek';

export interface FeedbackProviderInput {
  /** Valor salvo de `settings.defaultModelProvider` (pode nunca ter sido definido). */
  defaultModelProvider?: string;
  /** id do modelo local ativo (vazio/null quando nenhum está ativo). */
  activeLocalModelId: string | null;
}

export function resolveFeedbackProvider(input: FeedbackProviderInput): FeedbackProvider {
  const selectedLocal = input.defaultModelProvider === 'local';
  const hasActive = Boolean(input.activeLocalModelId && input.activeLocalModelId.trim());
  if (selectedLocal && hasActive) return 'local';
  return 'deepseek';
}