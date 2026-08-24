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
 * Mantido puro (sem DOM): `setPendingSubject`/`drainPendingSubject` são
 * testáveis via node:test (tsconfig.node.json inclui `src/lib`); o hook React
 * usa as funções puras e só existe para o consumo futuro na view.
 */
import { useSyncExternalStore } from 'react';

let pendingSubject: string | null = null;
const listeners = new Set<() => void>();

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

/** Reseta o estado do módulo (para testes). */
export function __resetPendingSubjectForTests(): void {
  pendingSubject = null;
  listeners.clear();
}