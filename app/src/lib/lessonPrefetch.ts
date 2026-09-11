/**
 * src/lib/lessonPrefetch.ts — pré-carga de AULA a partir do renderer
 * (onda2-load; pedido do dono: "quando clico em Aula dá delay pra carregar").
 *
 * O QUE FAZ: `prefetchLesson(trackSlug, lessonId)` chama `track.lesson` em
 * BAIXA prioridade (fire-and-forget puro) para AQUECER o cache do processo
 * main (services/trackCache.ts): quando o clique real em "Avançar" chegar, o
 * payload já está pronto e o clique vira cache hit.
 *
 * CONTRATO (para quem consumir — o painel de layout da onda chama da
 * LessonView, ex.: quando a aula N é aberta ou o `nextLesson` é conhecido):
 *   - `prefetchLesson(trackSlug, lessonId): void` — NUNCA lança, NUNCA dispara
 *     estado de loading em lugar nenhum (nem aqui nem no main);
 *   - `useLessonPrefetch(trackSlug, lessonId): void` — hook React que invoca
 *     a função quando os argumentos mudam;
 *   - é INÓCUO quando a aula já está em cache (hit instantâneo no main) e
 *     quando a aula não existe (o main responde `{ok:true, lesson:null}`);
 *   - guarda anti-burst por TRILHA: no máximo UMA pré-carga em voo por slug e
 *     no mínimo `PREFETCH_MIN_INTERVAL_MS` (1 s) entre lançamentos — quem
 *     chamar demais é ignorado, nunca o app.
 *
 * Não depende de jsdom: o teste injeta uma API fake via
 * `__setApiForTests` (apiBridge) e resetta o estado via
 * `__resetLessonPrefetchForTests`.
 */
import { useEffect } from 'react';

import { getApi } from './apiBridge';

/** Intervalo mínimo entre lançamentos de pré-carga por trilha (anti-burst). */
export const PREFETCH_MIN_INTERVAL_MS = 1_000;

interface PrefetchSlugState {
  /** Timestamp do último lançamento (gate de intervalo). */
  lastLaunch: number;
  /** Há uma pré-carga em voo para esta trilha (gate de concorrência). */
  inFlight: boolean;
}

const prefetchStates = new Map<string, PrefetchSlugState>();

/**
 * Pré-carrega a aula `lessonId` da trilha `trackSlug` no cache do main.
 * Fire-and-forget: erros (rede, trilha removida, preload ausente) são
 * engolidos — a pré-carga é um WARM-UP, e o clique real do aluno é quem tem
 * o direito de falhar com mensagem.
 */
export function prefetchLesson(trackSlug: string, lessonId: string): void {
  if (typeof trackSlug !== 'string' || trackSlug === '' || typeof lessonId !== 'string' || lessonId === '') {
    return;
  }
  const now = Date.now();
  let st = prefetchStates.get(trackSlug);
  if (!st) {
    st = { lastLaunch: 0, inFlight: false };
    prefetchStates.set(trackSlug, st);
  }
  if (st.inFlight) return; // no máx. UMA pré-carga em voo por trilha
  if (now - st.lastLaunch < PREFETCH_MIN_INTERVAL_MS) return; // anti-burst
  st.lastLaunch = now;
  st.inFlight = true;
  // `Promise.resolve().then` adia o `getApi()` para o catch engolir também a
  // ausência do preload (testes sem API) — a função só retorna depois de
  // instalar os handlers.
  void Promise.resolve()
    .then(() => getApi().track.lesson({ trackSlug, lessonId }))
    .catch(() => {
      /* pré-carga falhou → no-op deliberado (o clique real não depende dela) */
    })
    .finally(() => {
      st.inFlight = false;
    });
}

/**
 * Hook React: pré-carrega a aula quando `(trackSlug, lessonId)` mudam.
 * O consumidor típico é a vista da aula: obteve o payload de N (que carrega
 * `nextLesson`) e chama `useLessonPrefetch(trackSlug, nextLesson.slug)` para
 * a próxima aula já nascer pronta no cache do main.
 */
export function useLessonPrefetch(trackSlug: string, lessonId: string): void {
  useEffect(() => {
    prefetchLesson(trackSlug, lessonId);
  }, [trackSlug, lessonId]);
}

/** Zera o estado anti-burst (testes) — o estado é módulo-nível, como apiBridge. */
export function __resetLessonPrefetchForTests(): void {
  prefetchStates.clear();
}