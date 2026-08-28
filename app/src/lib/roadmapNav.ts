/**
 * src/lib/roadmapNav.ts — NAVEGAÇÃO DA TRILHA (onda1-nav-ui).
 *
 * O shell monta SÓ a view ativa (App.tsx — `const View = VIEWS[active]`):
 * trocar de aba DESMONTA a RoadmapView e zera o `useState` local dela
 * (`selected`). Antes desta onda, abrir Trilha → detalhe → ir a Settings →
 * voltar à Trilha mostrava a LISTA de trilhas de novo — o histórico de
 * navegação se perdia. Este store resolve o pedido do dono ("quero que o
 * histórico se mantenha com um botão de voltar"):
 *
 *   - `setLastTrackSlug(slug)` grava a trilha ABERTA no momento;
 *   - `setLastTrackSlug(null)` grava "na lista" (botão VOLTAR / seletor);
 *   - `peekLastTrackSlug()` lê sem consumir — a RoadmapView restaura o
 *     detalhe na MONTAGEM quando não há pendência nova (Home → Trilha);
 *   - `__resetRoadmapNavForTests()` esvazia (beforeEach dos testes).
 *
 * Store EM MEMÓRIA (variável de módulo, sem React, sem listeners — nada
 * re-renderiza): sobrevive à desmontagem da view porque o módulo vive no
 * processo do renderer, não no componente. Módulo PURO (sem DOM): testável
 * via node:test, mesmo padrão de pendingSubject.ts/lessonChatCache.ts.
 *
 * SEMÂNTICA: o último a escrever vence. A RoadmapView salva ao abrir uma
 * trilha (setSelected + loadTrack) e ao voltar à lista (botão VOLTAR /
 * novo mount sem trilha aberta).
 */
let lastTrackSlug: string | null = null;

/** Grava a trilha aberta no momento (null = de volta à lista de trilhas). */
export function setLastTrackSlug(slug: string | null): void {
  lastTrackSlug = slug !== null && slug.trim().length > 0 ? slug.trim() : null;
}

/** Lê a última trilha aberta SEM consumir (peek — a view restaura no mount). */
export function peekLastTrackSlug(): string | null {
  return lastTrackSlug;
}

/** Reseta o estado do módulo (só para testes — chamado no beforeEach). */
export function __resetRoadmapNavForTests(): void {
  lastTrackSlug = null;
}
