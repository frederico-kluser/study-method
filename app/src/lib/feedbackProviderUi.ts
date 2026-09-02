/**
 * src/lib/feedbackProviderUi.ts — mapeamento PURO do provedor de feedback do
 * Desafio para o rótulo (via i18n key) exibido num Chip na tela.
 *
 * Função pura (sem React/i18n): recebe o provedor decidido por
 * `resolveFeedbackProvider` ('local' | 'deepseek' — o valor 'deepseek' é
 * histórico e nomeia hoje o provedor de nuvem OpenRouter) e devolve a CHAVE de tradução
 * que o componente usa com `t()`. `null` → sem chip (nenhum provedor decidido).
 *
 * As chaves são literais tipados para passar o strictKeyChecks (typed resources
 * do i18next.d.ts).
 */

import type { FeedbackProvider } from './feedbackProvider';

/** Chaves de tradução válidas para o rótulo de provedor do Desafio. */
export type ProviderChipKey = 'challenge.providerLocal' | 'challenge.providerDeepseek';

/**
 * Devolve a i18n-key do Chip de provedor, ou `null` quando não há provedor
 * (estado inicial / ainda não rodou o feedback).
 */
export function feedbackProviderChipKey(provider: FeedbackProvider | null): ProviderChipKey | null {
  if (provider === 'local') return 'challenge.providerLocal';
  if (provider === 'deepseek') return 'challenge.providerDeepseek';
  return null;
}