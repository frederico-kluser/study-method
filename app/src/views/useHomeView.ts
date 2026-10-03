/**
 * src/views/useHomeView.ts — ESTADO da Home (Início): chaves, matérias,
 * resquícios e trilhas (state/view split — STORY-SPEC §5).
 *
 * A VIEW (`views/placeholders.tsx` → `HomeViewView`) é só props; aqui vive
 * tudo o que fala com o canal (`keys.getStatus`, `study.listTopics`,
 * `track.orphans`, `track.list`) e as decisões do ecrã:
 *  - W2: falha de `keys.getStatus()` NUNCA é lida como "não configurado" —
 *    `keyStatusFailed` é o estado honesto ("não foi possível verificar");
 *  - ONDA9: o resquício some do caminho do aluno, mas nunca em silêncio
 *    (`orphanCount` → aviso com caminho para Configurações);
 *  - ONDA-UX-TRILHAS: o CTA é contextual de verdade (sem chaves →
 *    Configurações; com última aula → Continuar; senão → Escolher uma trilha);
 *  - o clique numa trilha grava `pendingSubject` e navega para a Trilha.
 *
 * Sem jsdom: as decisões puras (`homeSetupStatus`, `homeTracksState`,
 * `splitSubjectsByOrphanSlug`…) vivem em src/lib/homeSetup.ts e as guardas
 * exportadas aqui cobrem o resto nos testes node:test.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { KeysStatus, SubjectSummary } from '../../shared/ipc-contract';
import type { NavKey } from '../lib/shellNav';
import { getApi } from '../lib/apiBridge';
import {
  IPC_TIMEOUT_MS,
  isTimeoutError,
  resolveChannelError,
  withTimeout,
} from '../lib/ipcTimeout';
import {
  homeSetupStatus,
  splitSubjectsByOrphanSlug,
  type HomeDomain,
} from '../lib/homeSetup';
// ONDA-UX-TRILHAS: o CTA "Continuar" restaura a última aula aberta na sessão
// (peek — não consome; a LessonView tem a sua própria restauração).
import { peekLastLesson } from '../lib/lastLesson';
import { setPendingTrackSlug } from '../lib/pendingSubject';

/** O que o usuário escolheu clicar: matéria + domínio (para o rótulo/estado). */
export interface SubjectPick {
  subject: string;
  domain: HomeDomain;
}

/** Uma trilha na secção "Trilhas" da Home. */
export interface HomeTrackSummary {
  slug: string;
  title: string;
  description: string;
  doneCount: number;
  lessonCount: number;
}

/** Props da view pura (o hook devolve exatamente isto). */
export interface HomeViewViewProps {
  keyStatus: KeysStatus | null;
  /** O último getStatus falhou (timeout/canal) — distinto de "ainda a carregar". */
  keyStatusFailed: boolean;
  refreshKeys(): void;
  /** `homeSetupStatus(keyStatus) === 'ready'` — as chaves estão prontas. */
  ready: boolean;
  /** Última aula aberta na sessão (null = ainda nenhuma). */
  lastLesson: { trackSlug: string; lessonId: string } | null;
  primaryLabel: string;
  primaryAction(): void;
  /** Abre uma trilha: grava `pendingSubject` e navega para a Trilha. */
  openTrack(slug: string): void;
  orphanCount: number;
  navigate(key: NavKey): void;
  handlePick(pick: SubjectPick): void;
  visibleTopics: SubjectSummary[];
  hasSubjects: boolean;
  /** Secção "Trilhas": null = carregando; [] = nenhuma trilha instalada. */
  tracks: HomeTrackSummary[] | null;
  tracksError: string | null;
  loadTracks(): (() => void) | void;
}

export function useHomeView(props: {
  onNavigate?: (key: NavKey) => void;
}): HomeViewViewProps {
  const { t } = useTranslation();
  const navigate = props.onNavigate ?? ((): void => {});
  const [keyStatus, setKeyStatus] = useState<KeysStatus | null>(null);
  // ONDA-UX-TRILHAS (auditoria W2): falha de `keys.getStatus()` NÃO é
  // "não configurado" — é um estado próprio ("não foi possível verificar")
  // com retentativa. Nunca inferir "em falta" de uma falha de canal.
  const [keyStatusFailed, setKeyStatusFailed] = useState(false);
  // Matérias PERSISTIDAS (onda 4): null = carregando → sem cartões até a
  // resposta; [] = vazio/erro → sem cartões.
  const [topics, setTopics] = useState<SubjectSummary[] | null>(null);
  // ONDA9 (cache-reconcilia): slugs cujo estado persistido NÃO tem trilha no
  // disco nem aula própria no banco — o resquício de um curso apagado. `null`
  // enquanto a reconciliação não respondeu: nesse intervalo NADA é escondido
  // (esconder por falta de resposta trocaria fantasma por sumiço).
  const [orphanSlugList, setOrphanSlugList] = useState<string[] | null>(null);
  const [tracks, setTracks] = useState<HomeTrackSummary[] | null>(null);
  // ONDA 2c (blindagem): falha do track:list NÃO some em silêncio — mostra
  // erro claro com detalhe + botão de tentar de novo (e timeout no canal mudo).
  const [tracksError, setTracksError] = useState<string | null>(null);

  // O estado das chaves com timeout (S4 da auditoria: era a ÚNICA chamada sem
  // `withTimeout` — "Verificando a configuração…" podia pendurar para sempre).
  const refreshKeys = useCallback((): void => {
    setKeyStatusFailed(false);
    Promise.resolve()
      .then(() => withTimeout(getApi().keys.getStatus(), IPC_TIMEOUT_MS, 'keys.getStatus'))
      .then((status) => {
        setKeyStatus(status);
      })
      .catch(() => {
        setKeyStatusFailed(true);
      });
  }, []);

  useEffect(() => {
    refreshKeys();
  }, [refreshKeys]);

  // Onda 4: carrega as matérias persistidas. `listTopics` devolve [] sem repo
  // (main é gracioso) e o catch defende o caso do canal ausente — nos DOIS
  // casos caímos no onboarding atual, nunca numa tela quebrada.
  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => getApi().study.listTopics())
      .then((list) => {
        if (!cancelled) setTopics(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setTopics([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ONDA9 (cache-reconcilia): pergunta ao main o que está órfão. Falha, canal
  // mudo ou build sem o canal → `[]` (nada escondido) — a reconciliação NUNCA
  // pode ser a razão de a Home ficar vazia.
  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => withTimeout(getApi().track.orphans(), IPC_TIMEOUT_MS, 'track.orphans'))
      .then((res) => {
        if (cancelled) return;
        setOrphanSlugList(res.ok ? res.orphans.map((o) => o.slug) : []);
      })
      .catch(() => {
        if (!cancelled) setOrphanSlugList([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Lista as trilhas — com timeout: canal mudo ou falha viram erro VISÍVEL. */
  const loadTracks = useCallback((): (() => void) => {
    let cancelled = false;
    setTracksError(null);
    withTimeout(getApi().track.list(), IPC_TIMEOUT_MS, 'track.list')
      .then((res) => {
        if (cancelled) return;
        // ok:false = falha REAL (repo indisponível etc.) → erro visível;
        // ok:true com lista vazia = nenhuma trilha instalada (vazio legítimo).
        if (res.ok === false) {
          // W3 (falsy-proof): '' é erro VÁLIDO — só null significa "sem erro".
          setTracksError(resolveChannelError(res, t('translation:home.tracksLoadFailed')));
          return;
        }
        setTracks(
          res.tracks.length > 0
            ? res.tracks.map((x) => ({
                slug: x.slug,
                title: x.title,
                description: x.description,
                doneCount: x.doneCount,
                lessonCount: x.lessonCount,
              }))
            : [],
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setTracksError(
          isTimeoutError(err)
            ? t('translation:home.tracksTimeout')
            : t('translation:home.tracksLoadFailed'),
        );
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => loadTracks(), [loadTracks]);

  const ready = homeSetupStatus(keyStatus) === 'ready';

  // ONDA-UX-TRILHAS: o CTA é contextual de VERDADE (uma ação = um destino que
  // sempre funciona): sem chaves → Configurações; com última aula → Continuar
  // (a LessonView restaura via lastLesson); sem última aula → Escolher trilha.
  const lastLesson = peekLastLesson();

  const primaryAction = useCallback((): void => {
    if (!ready) {
      navigate('settings');
      return;
    }
    navigate(lastLesson ? 'lesson' : 'roadmap');
  }, [ready, lastLesson, navigate]);

  /** Porta ÚNICA de escolha de matéria (cartões) — vai para a TRILHA. */
  const handlePick = useCallback(
    (_pick: SubjectPick): void => {
      navigate('roadmap');
    },
    [navigate],
  );

  /** Abre uma trilha: grava a pendência (Home → Trilha) e navega. */
  const openTrack = useCallback(
    (slug: string): void => {
      setPendingTrackSlug(slug);
      navigate('roadmap');
    },
    [navigate],
  );

  // ONDA9: o veredito do main aplicado à lista. `visible` são as matérias
  // ALCANÇÁVEIS; `orphaned` é o resquício (não vira cartão — seria link morto).
  const { visible: visibleTopics } = splitSubjectsByOrphanSlug(topics, orphanSlugList);
  // Resquício SEM matéria persistida não aparece em `orphanedTopics` — por
  // isso o contador vem do main, não da subtração.
  const orphanCount = orphanSlugList?.length ?? 0;
  const hasSubjects = topics !== null && visibleTopics.length > 0;

  return {
    keyStatus,
    keyStatusFailed,
    refreshKeys,
    ready,
    lastLesson,
    primaryLabel: !ready
      ? t('translation:home.cta.setup')
      : lastLesson
        ? t('translation:home.cta.continue')
        : t('translation:home.cta.start'),
    primaryAction,
    openTrack,
    orphanCount,
    navigate,
    handlePick,
    visibleTopics,
    hasSubjects,
    tracks,
    tracksError,
    loadTracks,
  };
}
