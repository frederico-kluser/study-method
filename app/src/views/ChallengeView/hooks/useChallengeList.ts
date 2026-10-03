/**
 * src/views/ChallengeView/hooks/useChallengeList.ts — a LISTA de desafios do
 * setup e a marcação de tentativa (nunca-repetir) da ChallengeView.
 *
 * Separação STATE/VIEW (docs/storybook/STORY-SPEC.md §5): tudo o que era
 * estado + IPC de listagem/marcação vive aqui; a view só recebe o resultado.
 * Semântica preservada byte a byte do corpo da ChallengeView:
 *
 *  - `loadChallenges` com teto de tempo (C4: canal mudo vira 'error' com
 *    retry) e `setupRoot` explícito quando o contexto o traz (Fix15);
 *  - lista vazia é estado `empty` (ONDA-UX-VAZIO) — nunca erro;
 *  - `markAttempt` (ONDA5) é idempotente POR DESAFIO (`markedForKeyRef` guarda
 *    a key `${challengeId}:${workspaceDir}` do ÚLTIMO mark) e re-busca a lista
 *    após `ok:true` — o filtro nunca-repetir esconde o desafio tentado.
 */
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  ChallengeInfo,
  MarkChallengeAttemptRequest,
  MarkChallengeAttemptResult,
} from '../../../../shared/ipc-contract';
import { getApi } from '../../../lib/apiBridge';
import { IPC_TIMEOUT_MS, isTimeoutError, withTimeout } from '../../../lib/ipcTimeout';
import { resolveChallengeSlug, type MarkAttemptVerdict } from '../../../lib/answerFlow';
import { challengeAttemptKey } from '../challengeUi';

/** Faz o cast para o payload de runtime (ver nota sobre ApiSchema). */
type ListChallengesArgs = { setupRoot?: string } | Record<string, never>;

/** Marca UMA tentativa terminal do desafio (passed/timeout/abandoned). */
export type MarkAttemptFn = (
  ch: ChallengeInfo,
  verdict: MarkAttemptVerdict,
  stars: number,
  durationMs: number,
) => void;

export interface UseChallengeListInput {
  /** `lastSetupRoot` do contexto de navegação (vindo do generateLesson). */
  lastSetupRoot: string | undefined;
}

export interface UseChallengeList {
  challenges: ChallengeInfo[];
  listing: 'idle' | 'loading' | 'error' | 'empty';
  listError: string;
  loadChallenges: () => Promise<void>;
  /**
   * Key do ÚLTIMO desafio com tentativa já marcada — idempotência por desafio
   * (as guardas `shouldMarkAttempt` dos outros fluxos leem-no).
   */
  markedForKeyRef: { current: string | null };
  markAttempt: MarkAttemptFn;
}

export function useChallengeList(input: UseChallengeListInput): UseChallengeList {
  const { t } = useTranslation();
  const [challenges, setChallenges] = useState<ChallengeInfo[]>([]);
  const [listing, setListing] = useState<'idle' | 'loading' | 'error' | 'empty'>('idle');
  const [listError, setListError] = useState('');

  // ONDA5 (mark terminal — nunca-repetir): o id do ÚLTIMO desafio com tentativa
  // JÁ marcada (key `${challengeId}:${workspaceDir}`). Idempotência POR
  // DESAFIO: guardas baseadas em key (não em boolean) sobrevivem à troca A→B —
  // marcar 'abandoned' de A não impede o 'timeout' de B.
  const markedForKeyRef = useRef<string | null>(null);

  // Carrega a lista quando não há desafio selecionado.
  const loadChallenges = useCallback(async (): Promise<void> => {
    setListing('loading');
    setListError('');
    try {
      const api = getApi();
      // Fix15-list-challenges: passa setupRoot explícito (do contexto, vindo do
      // generateLesson na LessonView) quando disponível; senão deixa o main usar
      // o fallback memory.lastSetupRoot. O `{}` preserva o contrato sem args.
      const args: ListChallengesArgs = input.lastSetupRoot
        ? { setupRoot: input.lastSetupRoot }
        : {};
      // C4: canal mudo (invoke que nunca resolve nem rejeita) não pode prender
      // o spinner — withTimeout rejeita e o estado 'error' ganha retry (W11).
      // 10s (IPC_TIMEOUT_MS): listChallenges é leitura local rápida, mesmo
      // teto dos canais de leitura do TrackChallengePanel.
      const list = await withTimeout(
        (api.study.listChallenges as (
          args?: ListChallengesArgs,
        ) => Promise<ChallengeInfo[]>)(args),
        IPC_TIMEOUT_MS,
        'study.listChallenges',
      );
      setChallenges(list);
      if (list.length === 0) {
        // ONDA-UX-VAZIO: lista vazia NÃO é erro — o app se acusava de quebrado
        // por uma pasta vazia (o anti-padrão que a ONDA9 removeu do
        // Roadmap/Home). Estado `empty` próprio, renderizado como aviso
        // informativo com CTA (ver o render).
        setListing('empty');
      } else {
        setListing('idle');
      }
    } catch (err) {
      setListing('error');
      setListError(
        isTimeoutError(err)
          ? t('translation:challenge.listTimeout')
          : `${t('translation:challenge.listError')}: ${String(err)}`,
      );
    }
  }, [input.lastSetupRoot]);

  /**
   * ONDA5 — marca UMA tentativa terminal do desafio (nunca-repetir). Só
   * eventos TERMINAIS chamam (verificado por `shouldMarkAttempt`): passou nos
   * testes → 'passed'; tempo esgotado → 'timeout'; troca sem concluir →
   * 'abandoned'. NUNCA no primeiro teste falho. Idempotente por desafio
   * (markedForKeyRef). Após ok:true, RE-BUSCA a lista de desafios — o filtro
   * nunca-repetir deve sumir com o desafio tentado da seleção.
   */
  const markAttempt = useCallback<MarkAttemptFn>(
    (ch, verdict, stars, durationMs): void => {
      const key = challengeAttemptKey(ch);
      markedForKeyRef.current = key; // registra ANTES do invoke (idempotência)
      const api = getApi();
      void (api.study.markChallengeAttempt as (
        input: MarkChallengeAttemptRequest,
      ) => Promise<MarkChallengeAttemptResult>)({
        // subjectId quando o desafio o expõe (onda 4 — fluxo normal com repo);
        // sem ele o handler responde ok:false — a UI segue (defensivo).
        ...(ch.subjectId ? { subjectId: ch.subjectId } : {}),
        challengeId: resolveChallengeSlug(ch),
        verdict,
        stars,
        durationMs,
      })
        .then((res) => {
          if (res.ok) void loadChallenges();
        })
        .catch(() => {
          // Defensivo: falha de persistência nunca quebra o fluxo do desafio.
        });
    },
    [loadChallenges],
  );

  return { challenges, listing, listError, loadChallenges, markedForKeyRef, markAttempt };
}
