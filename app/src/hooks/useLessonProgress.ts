/**
 * src/hooks/useLessonProgress.ts — hook que assina `study.onLessonProgress`.
 *
 * O main empurra eventos de progresso da geração de aula por
 * `study:lesson-progress`. Este hook liga o unsubscribe ao desmonte do
 * componente, evitando vazamento de listeners. É opcional/auxiliar: a view usa
 * o callback `onEvent` para transformar cada evento em estado local.
 */
import { useEffect } from 'react';
import { getApi } from '../lib/apiBridge';

export type LessonProgressEvent = unknown;

/**
 * Assina o canal de progresso da aula. `onEvent` é chamado para cada
 * payload pushado; o listener é removido no unmount.
 */
export function useLessonProgress(onEvent: (ev: LessonProgressEvent) => void): void {
  useEffect(() => {
    const unsubscribe = getApi().study.onLessonProgress((ev) => onEvent(ev));
    return () => unsubscribe();
  }, [onEvent]);
}