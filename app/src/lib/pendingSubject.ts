/**
 * src/lib/pendingSubject.ts — ESTADO COMPARTILHADO de assunto pré-selecionado
 * (onda 17A — Home guiada → aba Aula).
 *
 * Os chips de assunto da Home "preenchem" o campo da Aula SEM tocar na
 * LessonView (que é da onda 17B, rodando em paralelo). Mecanismo ADITIVO:
 *
 *  - `setPendingSubject(subject)` grava o assunto numa variável de módulo;
 *  - `drainPendingSubject()` lê E limpa (consome uma vez);
 *  - `usePendingSubject()` é o hook (sem provider) que uma view pode chamar na
 *    montagem para obter o valor pendente como estado inicial — a LessonView da
 *    17B consome isto quando assumir o assunto.
 *
 * A HomeView escreve aqui ao clicar numa sugestão e navega para 'lesson' via
 * `onNavigate`. Assim a navegação funciona desde já (mínimo do contrato) e o
 * pré-preenchimento fica pronto para a 17B, sem acoplar as duas ondas.
 *
 * ONDA 4 (matérias da Home): o módulo ganha o GÊMEO `pendingDomain`, o domínio
 * ('programming' | 'math') da matéria pré-selecionada. A onda 5 vai consumi-lo
 * com `drainPendingDomain()` na hora de montar o payload do generate-lesson,
 * para enviar `domain` explícito — a heurística do backend cobre a ausência,
 * mas o domínio explícito evita falso positivo tipo "Programação matemática".
 * Os DOIS pendentes são gravados juntos pela Home (setPendingSubject +
 * setPendingDomain) e consumidos como one-shot independentes.
 *
 * ONDA 5 (Trilha → Aula por id): o módulo ganha o TERCEIRO gêmeo
 * `pendingLessonId` — a Trilha grava o id da lição persistida ao clicar num nó
 * (RoadmapView.openLesson) e a LessonView drena na MONTAGEM para abrir a lição
 * por `study.getLessonById` (ids reais para recordAnswer/judge-answer). Sem id
 * pendente, o fluxo atual (assunto → generate) segue intacto.
 *
 * Mantido puro (sem DOM): `setPendingSubject`/`drainPendingSubject` e as
 * funções de `pendingDomain` são testáveis via node:test (tsconfig.node.json
 * inclui `src/lib`); o hook React usa as funções puras e só existe para o
 * consumo futuro na view.
 */
import { useSyncExternalStore } from 'react';

let pendingSubject: string | null = null;
let pendingDomain: PendingDomain | null = null;
let pendingLessonId: string | null = null;
const listeners = new Set<() => void>();

/** Domínio da matéria pré-selecionada ('programming' | 'math'). */
export type PendingDomain = 'programming' | 'math';

function emit(): void {
  for (const fn of listeners) fn();
}

/** Grava o assunto a ser pré-preenchido na aba Aula (Home→Lesson). */
export function setPendingSubject(subject: string): void {
  pendingSubject = subject.trim().length > 0 ? subject.trim() : null;
  emit();
}

/**
 * Lê e consome (limpa) o assunto pendente, devolvendo-o (ou null) — one-shot.
 * Usado pela LessonView (onda 17b) NO lazy initializer do `useState` do assunto
 * para pré-preencher o campo UMA vez e esvaziar o store (fix 17c ACHADO-1/3).
 * Função PURA (sem React/DOM): testável via node:test.
 */
export function consumePendingSubject(): string | null {
  return drainPendingSubject();
}

/**
 * Lê e consome (limpa) o assunto pendente, devolvendo-o (ou null).
 * `consumePendingSubject` delega a esta função — mesma semântica one-shot.
 */
export function drainPendingSubject(): string | null {
  const value = pendingSubject;
  pendingSubject = null;
  emit();
  return value;
}

/** Lê o valor pendente sem consumir (para assinatura externa / debug). */
export function peekPendingSubject(): string | null {
  return pendingSubject;
}

/** Limpa o valor pendente sem retornar. */
export function clearPendingSubject(): void {
  pendingSubject = null;
  emit();
}

/* ── pendingDomain (onda 4 — matérias da Home) ────────────────────────────── */

/** Grava o domínio da matéria pré-selecionada (Home→Lesson, junto do subject). */
export function setPendingDomain(domain: PendingDomain): void {
  pendingDomain = domain;
  emit();
}

/**
 * Lê e consome (limpa) o domínio pendente — one-shot. A onda 5 vai chamar na
 * montagem do payload do generate-lesson e, se o valor for null, deixar a
 * heurística do backend decidir o domínio.
 */
export function drainPendingDomain(): PendingDomain | null {
  const value = pendingDomain;
  pendingDomain = null;
  emit();
  return value;
}

/** Lê o domínio pendente sem consumir (assinatura externa / debug). */
export function peekPendingDomain(): PendingDomain | null {
  return pendingDomain;
}

/** Limpa o domínio pendente sem retornar. */
export function clearPendingDomain(): void {
  pendingDomain = null;
  emit();
}

/* ── pendingTrackLesson / pendingTrackSlug (rodada 8 — Trilha → Aula chat) ── */

let pendingTrackLesson: { trackSlug: string; lessonId: string } | null = null;
let pendingTrackSlug: string | null = null;

/**
 * Grava a aula de TRILHA pré-selecionada (Trilha → Aula em modo chat). Na
 * rodada 8 o aluno NÃO gera aula: ele abre a trilha, escolhe a aula e a
 * LessonView monta o chat com o tutor. O par (trackSlug, lessonId) é one-shot.
 */
export function setPendingTrackLesson(trackSlug: string, lessonId: string): void {
  pendingTrackLesson =
    trackSlug.trim().length > 0 && lessonId.trim().length > 0
      ? { trackSlug: trackSlug.trim(), lessonId: lessonId.trim() }
      : null;
  emit();
}

/** Lê e consome (limpa) a aula de trilha pendente — one-shot. */
export function drainPendingTrackLesson(): { trackSlug: string; lessonId: string } | null {
  const value = pendingTrackLesson;
  pendingTrackLesson = null;
  emit();
  return value;
}

/** Lê a aula pendente sem consumir. */
export function peekPendingTrackLesson(): { trackSlug: string; lessonId: string } | null {
  return pendingTrackLesson;
}

/** Limpa a aula pendente sem retornar. */
export function clearPendingTrackLesson(): void {
  pendingTrackLesson = null;
  emit();
}

/**
 * Grava a TRILHA pré-selecionada (Home → Trilha): a RoadmapView abre o detalhe
 * da trilha clicada na Home (rodada 8 — a trilha já vem com os itens prontos).
 */
export function setPendingTrackSlug(trackSlug: string): void {
  pendingTrackSlug = trackSlug.trim().length > 0 ? trackSlug.trim() : null;
  emit();
}

/** Lê e consome (limpa) a trilha pendente — one-shot. */
export function drainPendingTrackSlug(): string | null {
  const value = pendingTrackSlug;
  pendingTrackSlug = null;
  emit();
  return value;
}

/** Lê a trilha pendente sem consumir. */
export function peekPendingTrackSlug(): string | null {
  return pendingTrackSlug;
}

/** Limpa a trilha pendente sem retornar. */
export function clearPendingTrackSlug(): void {
  pendingTrackSlug = null;
  emit();
}

/* ── pendingLessonId (onda 5 — Trilha → Aula por id) ─────────────────────── */

/**
 * Grava o id de UMA lição persistida pré-selecionada (Trilha → Aula). O GÊMEO
 * one-shot de `pendingSubject`/`pendingDomain`: a LessonView drena na MONTAGEM
 * e, se houver id, tenta `study.getLessonById(id)` para abrir a lição
 * persistida de verdade (recordAnswer/judge-answer com id real). Sem id
 * pendente, o fluxo atual (assunto → generate) segue intacto.
 */
export function setPendingLessonId(lessonId: string): void {
  pendingLessonId = lessonId.trim().length > 0 ? lessonId.trim() : null;
  emit();
}

/** Lê e consome (limpa) o id pendente — one-shot (mesma semântica dos outros). */
export function drainPendingLessonId(): string | null {
  const value = pendingLessonId;
  pendingLessonId = null;
  emit();
  return value;
}

/** Lê o id pendente sem consumir (assinatura externa / debug). */
export function peekPendingLessonId(): string | null {
  return pendingLessonId;
}

/** Limpa o id pendente sem retornar. */
export function clearPendingLessonId(): void {
  pendingLessonId = null;
  emit();
}

/* ── Assinatura externa p/ o hook useSyncExternalStore ─────────────────── */

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function getSnapshot(): string | null {
  return pendingSubject;
}

/**
 * Hook sem provider: consome o assunto pendente UMA vez na montagem e devolve-o
 * como estado inicial. Pensado para a LessonView (17B) ler o pré-preenchimento
 * vindo da Home. Sem pendência, devolve null e é um no-op.
 */
export function usePendingSubjectInitial(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

/** Reseta o estado do módulo (para testes) — todos os pendentes. */
export function __resetPendingSubjectForTests(): void {
  pendingSubject = null;
  pendingDomain = null;
  pendingLessonId = null;
  pendingTrackLesson = null;
  pendingTrackSlug = null;
  listeners.clear();
}
