/**
 * src/components/sessionState/SessionStateProvider.tsx — provider do estado de
 * SESSÃO (assunto atual, fase da aula, carimbo de última atividade).
 *
 * Fica FORA de `src/lib` pelo mesmo motivo que o `ChallengeNavProvider`: usa
 * JSX, e o `tsconfig.node.json` (que inclui `src/lib` para os testes node:test)
 * não define `jsx`. Toda a lógica — reducer, normalizadores, derivação do
 * rótulo de fase — mora em `src/lib/sessionState.ts` e é testada sem jsdom em
 * `tests/sessionState.test.ts`. Aqui só existe a montagem do contexto.
 *
 * ONDE ELE ENTRA NA ÁRVORE: ACIMA do shell inteiro (ver `src/App.tsx`), porque
 * o shell monta SÓ a view ativa — se este estado vivesse dentro da LessonView,
 * trocar de aba o desmontaria e o quadro superior nasceria vazio. Esse é o
 * achado que motivou este módulo.
 */
import { type ReactElement, type ReactNode } from 'react';
import {
  SessionStateCtx,
  useSessionStateMachine,
  type SessionClock,
  type SessionSnapshot,
} from '../../lib/sessionState';

export interface SessionStateProviderProps {
  children: ReactNode;
  /**
   * Relógio injetável do carimbo de "última atividade". Existe para teste e
   * para cenários determinísticos (E2E); em produção o default é `Date.now`.
   */
  clock?: SessionClock;
  /** Snapshot inicial (usado por testes/E2E; em produção a sessão nasce vazia). */
  initial?: SessionSnapshot;
}

/** Provider do contexto de estado de sessão. */
export function SessionStateProvider({
  children,
  clock,
  initial,
}: SessionStateProviderProps): ReactElement {
  // `useSessionStateMachine` já devolve um valor MEMOIZADO e mantém
  // `publishSession` / `resetSession` estáveis (o relógio vive numa ref, não
  // nas deps) — não há nada a memoizar de novo aqui.
  const value = useSessionStateMachine(clock, initial);
  return <SessionStateCtx.Provider value={value}>{children}</SessionStateCtx.Provider>;
}

export default SessionStateProvider;
