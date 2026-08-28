/**
 * src/components/challengeNav/ChallengeNavProvider.tsx — provider do contexto
 * ChallengeNav (navegação Desafio ↔ Aula).
 *
 * Fica fora de `src/lib` porque usa JSX: o tsconfig.node.json (que inclui
 * `src/lib` para testes) não define `jsx`. Este arquivo é compilado apenas
 * pelo tsconfig.json (renderer).
 */
import { useCallback, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import {
  ChallengeNavCtx,
  useNavChallengeState,
} from '../../lib/challengeNav';
import type { TrackChallengeErrorReport } from '../../../shared/ipc-contract';

/** Props do provider. */
export interface ChallengeNavProviderProps {
  children: ReactNode;
  /** Chamado para o shell navegar para a aba Desafio. */
  onNavigateChallenge?: () => void;
  /**
   * ADITIVO (onda2-error-flow): chamado para o shell navegar para a aba Aula
   * (o painel do desafio que falhou fecha e a discussão do erro acontece no
   * chat da aula). Default no-op.
   */
  onNavigateLesson?: () => void;
}

/** Provider do contexto ChallengeNav. */
export function ChallengeNavProvider({
  children,
  onNavigateChallenge,
  onNavigateLesson,
}: ChallengeNavProviderProps): ReactElement {
  const value = useNavChallengeState();
  // ADITIVO (fix15-list-challenges): setupRoot do último generateLesson — fora
  // do reducer (não incrementa version; apenas é compartilhado Lesson→Challenge).
  const [lastSetupRoot, setLastSetupRootState] = useState<string | null>(null);
  const setLastSetupRoot = useCallback((setupRoot: string | null): void => {
    setLastSetupRootState(setupRoot);
  }, []);
  // ADITIVO (onda2-error-flow): relatório do erro de desafio que FALHOU —
  // FORA do reducer (mesmo padrão do lastSetupRoot): o reducer define as
  // transições (testáveis), mas o valor VIVO mora aqui — o TrackChallengePanel
  // grava antes de navegar para a Aula; a LessonView semeia a bolha e limpa.
  const [challengeErrorReport, setChallengeErrorReportState] = useState<TrackChallengeErrorReport | null>(null);
  const reportChallengeError = useCallback((report: TrackChallengeErrorReport): void => {
    setChallengeErrorReportState(report);
  }, []);
  const clearChallengeError = useCallback((): void => {
    setChallengeErrorReportState(null);
  }, []);
  const navigate = useMemo(
    () => onNavigateChallenge ?? (() => {}),
    [onNavigateChallenge],
  );
  const navigateToLesson = useMemo(
    () => onNavigateLesson ?? (() => {}),
    [onNavigateLesson],
  );
  const memo = useMemo(
    () => ({
      selectedChallenge: value.selectedChallenge,
      selectChallenge: value.selectChallenge,
      // ADITIVO (rodada 8): desafio de trilha (fluxo track da ChallengeView).
      trackChallenge: value.trackChallenge,
      selectTrackChallenge: value.selectTrackChallenge,
      version: value.version,
      navigateToChallenge: navigate,
      lastSetupRoot,
      setLastSetupRoot,
      challengeErrorReport,
      reportChallengeError,
      clearChallengeError,
      navigateToLesson,
    }),
    [
      value.selectedChallenge,
      value.selectChallenge,
      value.trackChallenge,
      value.selectTrackChallenge,
      value.version,
      navigate,
      lastSetupRoot,
      setLastSetupRoot,
      challengeErrorReport,
      reportChallengeError,
      clearChallengeError,
      navigateToLesson,
    ],
  );
  return <ChallengeNavCtx.Provider value={memo}>{children}</ChallengeNavCtx.Provider>;
}