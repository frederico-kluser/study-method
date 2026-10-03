/**
 * views/ChallengeView/challenge.stories.helpers.ts — apoio das histórias da
 * área do Desafio (NÃO é história: o glob do Storybook só apanha
 * `*.stories.tsx`).
 *
 * Três utilidades de story (zero lógica de produto):
 *
 *  - `ChallengeNavSeed` — fornece o `ChallengeNavCtx` com a seleção já FEITA
 *    no primeiro render (o `ChallengeNavProvider` partilhado não aceita
 *    inicial; semear por efeito re-renderizaria a ChallengeView do fluxo
 *    legado para o painel de trilha com contagens de hooks diferentes — o
 *    early return do `nav.trackChallenge` tem de valer desde o 1.º render);
 *  - `advanceWallClock` — desloca o `Date.now` (offset constante: os relógios
 *    lidos DEPOIS do offset cancelam-no) para os estados de "Tempo esgotado"
 *    do relógio de estrelas, sem esperar os minutos reais;
 *  - `clickTestAnswer` — o clique no "Testar resposta" (pt-BR) das histórias
 *    de fluxo.
 */
import { createElement, useMemo, type ReactElement, type ReactNode } from 'react';
import { userEvent, within } from 'storybook/test';
import type { ChallengeInfo } from '@shared/ipc-contract';
import {
  ChallengeNavCtx,
  useChallengeNav,
  type ChallengeNavValue,
  type TrackChallengeNavSelection,
} from '../../lib/challengeNav';

export interface ChallengeNavSeedProps {
  /** Desafio legado já selecionado (fluxo workspace da geração). */
  selectedChallenge?: ChallengeInfo | null;
  /** Desafio de TRILHA já selecionado (mostra o TrackChallengePanel). */
  trackChallenge?: TrackChallengeNavSelection | null;
  children?: ReactNode;
}

/**
 * O contexto de navegação do desafio com a seleção já feita — envolve a view
 * para que o 1.º render já nasça no modo certo (legado × trilha).
 */
export function ChallengeNavSeed({
  selectedChallenge,
  trackChallenge,
  children,
}: ChallengeNavSeedProps): ReactElement {
  const nav = useChallengeNav();
  const value = useMemo<ChallengeNavValue>(
    () => ({
      ...nav,
      selectedChallenge: selectedChallenge ?? null,
      trackChallenge: trackChallenge ?? null,
    }),
    [nav, selectedChallenge, trackChallenge],
  );
  return createElement(ChallengeNavCtx.Provider, { value }, children ?? null);
}

/**
 * Desloca o relógio do sistema `msAhead` para a frente (offset CONSTANTE — os
 * que registam o `Date.now` depois do deslocamento ficam coerentes entre si).
 * É o que leva o relógio de estrelas ao "Tempo esgotado" sem esperar os
 * minutos reais; o offset fica instalado (inofensivo para as histórias
 * seguintes, cujo instante inicial já o inclui).
 */
export function advanceWallClock(msAhead: number): void {
  const realNow = Date.now.bind(Date);
  const base = realNow();
  Date.now = (): number => realNow() + (realNow() - base) + msAhead;
}

/** Clica no "Testar resposta" (rótulo pt-BR — o preview inicia em pt-BR). */
export async function clickTestAnswer(canvasElement: HTMLElement): Promise<void> {
  const botao = within(canvasElement).getByRole('button', { name: 'Testar resposta' });
  await userEvent.click(botao);
}
