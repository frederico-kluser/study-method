/**
 * blocks/LessonLoadErrorState.tsx — o estado de ERRO de carregamento da aula
 * (`track.lesson` devolveu {ok:false}, canal mudo ou timeout).
 *
 * Bloco de VIEW PURO (contrato STORY-SPEC §5): só props. O desenho é o
 * primitivo `components/ui/LoadErrorState` (audit LAYOUT-DRY-AUDIT §3, forma
 * (a) — coluna centrada + Alert de erro + "Tentar de novo"); aqui só a copy
 * da AULA. W3 (falsy-proof): '' é erro VÁLIDO — o container é quem decide que
 * só `null` significa "sem erro"; aqui a mensagem é sempre renderizada. O
 * retry volta ao container (que repete o `loadLesson` da aula corrente — o
 * handler nunca fica congelado no momento da falha).
 */
import type { ReactElement } from 'react';
import { LoadErrorState } from '../../../components/ui/LoadErrorState';

export interface LessonLoadErrorStateProps {
  /** Mensagem de erro já resolvida (i18n/timeout) — nunca String(err) crua. */
  message: string;
  /** Repete o carregamento da aula atual. */
  onRetry: () => void;
}

export function LessonLoadErrorState({ message, onRetry }: LessonLoadErrorStateProps): ReactElement {
  return <LoadErrorState message={message} onRetry={onRetry} />;
}
