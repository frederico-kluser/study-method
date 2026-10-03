/**
 * src/views/ChallengeView/hooks/useTestAnswerStream.ts — a SUBSCRIÇÃO do
 * stream de eventos dos testes (`study.onTestAnswerEvent`, main push).
 *
 * Separação STATE/VIEW (docs/storybook/STORY-SPEC.md §5): a assinatura do
 * canal e o mapeamento do payload vivem aqui; o chamador só recebe a fase
 * ('started' | 'done'). Semântica preservada byte a byte do efeito da
 * ChallengeView:
 *
 *  - a ChallengeView usa o RETORNO direto de `testAnswer` para o resultado e o
 *    evento started/done apenas para refletir progresso no status;
 *  - C4: eventos de uma corrida que JÁ terminou (abortada/errada) não
 *    reescrevem o status — a guarda é o `isInFlight` do chamador;
 *  - qualquer falha de assinatura (API sem canal) vira subscrição ausente,
 *    nunca exceção em render.
 */
import { useEffect, useRef } from 'react';
import { getApi } from '../../../lib/apiBridge';
import { mapTestAnswerPhase } from '../../../lib/testAnswerEvents';

export interface UseTestAnswerStreamInput {
  /** "Há uma fase determinística em voo?" (só aí os eventos contam). */
  isInFlight: () => boolean;
  /** Fase refletida no status (null = evento desconhecido/irrelevante). */
  onPhase: (phase: 'started' | 'done') => void;
}

export function useTestAnswerStream(input: UseTestAnswerStreamInput): void {
  // Callbacks por ref: o efeito de subscrição é de MONTAGEM (deps vazias, como
  // no original) e nunca deve re-assinar por mudança de identidade.
  const liveRef = useRef(input);
  liveRef.current = input;

  useEffect(() => {
    const api = getApi();
    let stop: (() => void) | undefined;
    try {
      stop = api.study.onTestAnswerEvent((raw: unknown) => {
        if (!liveRef.current.isInFlight()) return;
        const phase = mapTestAnswerPhase(raw);
        if (phase === 'started' || phase === 'done') liveRef.current.onPhase(phase);
        // null → não muda o status (evento desconhecido/irrelevante).
      });
    } catch {
      stop = undefined;
    }
    return () => stop?.();
  }, []);
}
