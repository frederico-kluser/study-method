/**
 * src/views/RoadmapView/useRoadmapView.ts — ESTADO da trilha (RoadmapView):
 * navegação lista↔detalhe, seleção/restauração de trilha e carga IPC
 * (state/view split — STORY-SPEC §5).
 *
 * A VIEW (`RoadmapView.tsx`) é só props; aqui vive:
 *  - a montagem: drena a trilha pendente (Home → Trilha) OU restaura a última
 *    aberta (roadmapNav) — pendência nova > última aberta;
 *  - `loadTrack`/`loadTracks` com `withTimeout` (canal mudo vira loadError com
 *    retry, nunca spinner eterno) e `resolveChannelError` (W3 falsy-proof);
 *  - ONDA9: "nenhuma trilha instalada" é estado LEGÍTIMO (`noTracks`), não erro;
 *  - ONDA11-CADEADO: o diff do que ABRIU desde a última visita (holder
 *    anti-StrictMode) → `justUnlocked` + `unlockedTitles` (anúncio role="status");
 *  - `openLesson` só abre aulas destravadas (guarda do tile).
 *
 * Testável por node:test sem jsdom (as decisões puras vivem em
 * src/lib/roadmapNav.ts + as guardas exportadas aqui).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getApi } from '../../lib/apiBridge';
import {
  IPC_TIMEOUT_MS,
  isTimeoutError,
  resolveChannelError,
  withTimeout,
} from '../../lib/ipcTimeout';
import { useChallengeNav } from '../../lib/challengeNav';
import { drainPendingTrackSlug, setPendingTrackLesson } from '../../lib/pendingSubject';
import { createUnlockDiffHolder, peekLastTrackSlug, setLastTrackSlug } from '../../lib/roadmapNav';
import type {
  TrackDetailPayload,
  TrackLessonEntry,
  TrackModuleEntry,
} from '../../../shared/ipc-contract';
import type { NavKey } from '../../lib/shellNav';

/**
 * Entrada do hook (o subset de `ViewProps` que a trilha usa) — declarada aqui
 * em vez de importar `../placeholders` (.tsx) para o módulo continuar PURO e
 * listável no projeto composite de tests/ (tsconfig.node.json, sem JSX).
 */
export interface RoadmapViewInput {
  onNavigate?: (key: NavKey) => void;
}

/** Uma trilha na lista/seletor (o que a view desenha). */
export interface RoadmapTrackSummary {
  slug: string;
  title: string;
  doneCount: number;
  lessonCount: number;
}

/** Props da view pura (o hook devolve exatamente isto). */
export interface RoadmapViewViewProps {
  track: TrackDetailPayload | null;
  loading: boolean;
  loadError: string | null;
  selected: string | null;
  tracks: RoadmapTrackSummary[] | null;
  /** ONDA9: pasta de trilhas vazia — estado legítimo e legível, não erro. */
  noTracks: boolean;
  /** ONDA11: aulas que ABRIRAM desde a última visita (selo + moldura). */
  justUnlocked: ReadonlySet<string>;
  /** Títulos das aulas recém-abertas (anúncio role="status"). */
  unlockedTitles: string[];
  openLesson(lesson: TrackLessonEntry): void;
  openTrack(trackSlug: string): void;
  goBackToList(): void;
  openProficiency(): void;
  openModuleChallenge(mod: TrackModuleEntry): void;
  loadTrack(trackSlug: string): void;
  loadTracks(): void;
}

export function useRoadmapView(props: RoadmapViewInput): RoadmapViewViewProps {
  const { t } = useTranslation();
  const navigate = props.onNavigate ?? (() => {});
  const nav = useChallengeNav();

  const [track, setTrack] = useState<TrackDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [tracks, setTracks] = useState<Array<{ slug: string; title: string; doneCount: number; lessonCount: number }> | null>(null);
  // ONDA9 (cache-reconcilia): "nenhuma trilha instalada" é um estado LEGÍTIMO,
  // não um erro. Antes ele era enfiado no `loadError` e saía como <Alert
  // severity="warning"> com botão de "Tentar de novo" — o app se acusando de
  // quebrado por uma pasta vazia, que é exatamente o estado normal depois de
  // "apaga e regera". Agora tem estado próprio e sai como informação.
  const [noTracks, setNoTracks] = useState(false);
  // ─── ONDA11-CADEADO: o que ABRIU desde a última visita a esta trilha ──────
  // O dono pediu o destravamento "com efeito". O efeito é só da aula que MUDOU
  // de estado nesta volta — o porquê da escolha (e por que não veio do main)
  // está no cabeçalho de `diffUnlockedSinceLastVisit`, em src/lib/roadmapNav.
  // O HOLDER é o padrão anti-StrictMode da casa: em dev a view monta duas
  // vezes e o diff é one-shot, então sem ele a 2ª passada — a que fica na
  // tela — veria "nada mudou" e o efeito sumiria justamente no ambiente onde
  // ele é olhado.
  const [justUnlocked, setJustUnlocked] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [unlockedTitles, setUnlockedTitles] = useState<string[]>([]);
  const unlockDiffRef = useRef<ReturnType<typeof createUnlockDiffHolder> | null>(null);
  if (unlockDiffRef.current === null) unlockDiffRef.current = createUnlockDiffHolder();

  const loadTrack = useCallback((trackSlug: string): void => {
    setLoading(true);
    setLoadError(null);
    let cancelled = false;
    // Timeout: canal mudo (IPC nunca resolve) vira loadError com retry —
    // nenhum spinner eterno no detalhe da trilha.
    withTimeout(getApi().track.get({ trackSlug }), IPC_TIMEOUT_MS, 'track.get')
      .then((res) => {
        if (cancelled) return;
        if (res.ok === false) {
          // W3 (falsy-proof): '' é erro VÁLIDO — só null significa "sem erro".
          setLoadError(resolveChannelError(res, t('translation:roadmap.loadFailed')));
          return;
        }
        if (!res.track) {
          setLoadError(t('translation:roadmap.notFound'));
          return;
        }
        setTrack(res.track);
        // O diff roda com o payload RECÉM-CHEGADO (nunca com o estado antigo
        // da tela): a lista achatada na ordem em que a trilha é lida.
        const aulas = res.track.modules.flatMap((m) => m.lessons);
        const abriram = unlockDiffRef.current!.get(trackSlug, aulas);
        setJustUnlocked(new Set(abriram));
        setUnlockedTitles(
          abriram
            .map((slug) => aulas.find((l) => l.slug === slug)?.title)
            .filter((t): t is string => typeof t === 'string'),
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(
          isTimeoutError(err)
            ? t('translation:roadmap.loadTimeout')
            : t('translation:roadmap.loadFailed'),
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Lista as trilhas instaladas (seletor) — com timeout (mesmo princípio). */
  const loadTracks = useCallback((): void => {
    // FIX W2 (onda 4): setLoading(true) NO INÍCIO — o retry da lista mostra o
    // spinner (feedback imediato) em vez de área em branco até o timeout; o
    // finally limpa nos DOIS caminhos (ok e erro).
    setLoading(true);
    setLoadError(null);
    setNoTracks(false);
    let cancelled = false;
    withTimeout(getApi().track.list(), IPC_TIMEOUT_MS, 'track.list')
      .then((res) => {
        if (cancelled) return;
        if (res.ok === false) {
          // ok:false = falha REAL (repo indisponível etc.) → erro com o DETALHE
          // do canal; "Nenhuma trilha instalada" fica só para ok:true com []
          // (vazio legítimo) — nunca uma mensagem enganosa para falha real.
          setLoadError(resolveChannelError(res, t('translation:roadmap.listFailed')));
          return;
        }
        if (res.tracks.length > 0) {
          setTracks(res.tracks.map((x) => ({ slug: x.slug, title: x.title, doneCount: x.doneCount, lessonCount: x.lessonCount })));
        } else {
          // ONDA9: vazio LEGÍTIMO — informação, não erro (ver `noTracks`).
          setTracks([]);
          setNoTracks(true);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(
          isTimeoutError(err)
            ? t('translation:roadmap.loadTimeout')
            : t('translation:roadmap.listFailed'),
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Montagem: drena a trilha pendente (Home → Trilha) OU restaura a última
  // trilha aberta (onda1-nav-ui — o histórico de navegação sobrevive à troca
  // de aba via src/lib/roadmapNav.ts). Ordem: pendência nova > última aberta.
  // O `setLastTrackSlug(pending)` no branch da pendência grava a trilha que
  // ACABOU de ser aberta — a próxima montagem (voltar de Settings/Desafio)
  // a restaura sem pendência. O peek NÃO é one-shot: no double-invoke do
  // StrictMode (dev) cada passada re-restaura a MESMA trilha (idempotente —
  // setSelected com o mesmo valor + loadTrack repetido convergem).
  useEffect(() => {
    const pending = drainPendingTrackSlug();
    if (pending) {
      setSelected(pending);
      setLastTrackSlug(pending);
      loadTrack(pending);
    } else {
      const last = peekLastTrackSlug();
      if (last) {
        setSelected(last);
        loadTrack(last);
      }
    }
    loadTracks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openLesson = useCallback(
    (lesson: TrackLessonEntry): void => {
      if (!track || lesson.locked) return;
      setPendingTrackLesson(track.slug, lesson.slug);
      navigate('lesson');
    },
    [track, navigate],
  );

  /** VOLTAR para a LISTA (onda1-nav-ui): zera o detalhe (selected + track),
   *  o erro do carregamento e o roadmapNav — a próxima montagem volta a
   *  abrir a lista, não este detalhe. Sem o setTrack(null), a lista E o
   *  detalhe antigo renderizariam JUNTOS (o `track` persistia no estado). */
  const goBackToList = useCallback((): void => {
    setSelected(null);
    setTrack(null);
    setLoadError(null);
    setLastTrackSlug(null);
    // ONDA11-CADEADO: o anúncio é do detalhe que está saindo de cena.
    setJustUnlocked(new Set<string>());
    setUnlockedTitles([]);
  }, []);

  /** Teste de proficiência → ChallengeView (fluxo track). */
  const openProficiency = useCallback((): void => {
    if (!track || !track.proficiencyAvailable) return;
    nav.selectTrackChallenge({
      trackSlug: track.slug,
      target: 'proficiency',
      challengeId: 'proficiencia',
      title: t('translation:roadmap.proficiencyTitle'),
    });
    nav.navigateToChallenge();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track, nav]);

  /** ADITIVO (rodada 9): DESAFIO DO MÓDULO → ChallengeView (fluxo track, target 'module'). */
  const openModuleChallenge = useCallback(
    (mod: TrackModuleEntry): void => {
      if (!track || !mod.challenge) return;
      nav.selectTrackChallenge({
        trackSlug: track.slug,
        target: 'module',
        moduleSlug: mod.slug,
        challengeId: mod.challenge.slug,
        title: mod.challenge.title,
      });
      nav.navigateToChallenge();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [track, nav],
  );

  /** Abre uma trilha da lista: seleção + gravação no roadmapNav + carga. */
  const openTrack = useCallback(
    (trackSlug: string): void => {
      setSelected(trackSlug);
      setLastTrackSlug(trackSlug);
      loadTrack(trackSlug);
    },
    [loadTrack],
  );

  return {
    track,
    loading,
    loadError,
    selected,
    tracks,
    noTracks,
    justUnlocked,
    unlockedTitles,
    openLesson,
    openTrack,
    goBackToList,
    openProficiency,
    openModuleChallenge,
    loadTrack,
    loadTracks,
  };
}
