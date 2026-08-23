/**
 * src/components/challengeNav/ChallengeNavProvider.tsx — provider do contexto
 * ChallengeNav (navegação Desafio ↔ Aula).
 *
 * Fica fora de `src/lib` porque usa JSX: o tsconfig.node.json (que inclui
 * `src/lib` para testes) não define `jsx`. Este arquivo é compilado apenas
 * pelo tsconfig.json (renderer).
 */
import { useMemo, type ReactElement, type ReactNode } from 'react';
import {
  ChallengeNavCtx,
  useNavChallengeState,
} from '../../lib/challengeNav';

/** Props do provider. */
export interface ChallengeNavProviderProps {
  children: ReactNode;
  /** Chamado para o shell navegar para a aba Desafio. */
  onNavigateChallenge?: () => void;
}

/** Provider do contexto ChallengeNav. */
export function ChallengeNavProvider({
  children,
  onNavigateChallenge,
}: ChallengeNavProviderProps): ReactElement {
  const value = useNavChallengeState();
  const navigate = useMemo(
    () => onNavigateChallenge ?? (() => {}),
    [onNavigateChallenge],
  );
  const memo = useMemo(
    () => ({
      selectedChallenge: value.selectedChallenge,
      selectChallenge: value.selectChallenge,
      version: value.version,
      navigateToChallenge: navigate,
    }),
    [value.selectedChallenge, value.selectChallenge, value.version, navigate],
  );
  return <ChallengeNavCtx.Provider value={memo}>{children}</ChallengeNavCtx.Provider>;
}