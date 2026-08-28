/**
 * src/lib/lastLesson.ts — ÚLTIMA AULA ABERTA (onda1-nav-ui).
 *
 * Pedido do dono: "quando eu clico em aula eu veja a última aula aberta ou
 * nenhum". O shell monta SÓ a view ativa — sair da aba Aula desmonta a
 * LessonView e zera o `trackLesson` local. Este store em memória (variável
 * de módulo, sem React) lembra a ÚLTIMA aula carregada para a LessonView
 * restaurá-la na MONTAGEM quando não há alvo mais específico (report de erro
 * do desafio > pendência da Trilha > última aula > estado vazio).
 *
 *   - `saveLastLesson(trackSlug, lessonId)` — chamado SEMPRE que uma aula é
 *     aberta/carregada (report, pendência, pré-requisito e restauração);
 *   - `peekLastLesson()` — lê SEM consumir (peek): a restauração na montagem
 *     é idempotente entre as passadas do double-invoke do StrictMode (dev) —
 *     ao contrário dos drains one-shot (pendingLessonHolder/cacheHolder), um
 *     peek não precisa de holder retido em ref;
 *   - `__resetLastLessonForTests()` — esvazia (beforeEach dos testes).
 *
 * Módulo PURO (sem React/DOM): testável via node:test, mesmo padrão de
 * pendingSubject.ts/lessonChatCache.ts.
 */
let lastLesson: { trackSlug: string; lessonId: string } | null = null;

/** Grava a última aula aberta (normaliza com trim — vazio vira no-op). */
export function saveLastLesson(trackSlug: string, lessonId: string): void {
  const ts = trackSlug.trim();
  const li = lessonId.trim();
  lastLesson = ts.length > 0 && li.length > 0 ? { trackSlug: ts, lessonId: li } : null;
}

/** Lê a última aula aberta SEM consumir (null = nunca abriu aula nesta sessão). */
export function peekLastLesson(): { trackSlug: string; lessonId: string } | null {
  return lastLesson;
}

/** Reseta o estado do módulo (só para testes — chamado no beforeEach). */
export function __resetLastLessonForTests(): void {
  lastLesson = null;
}
