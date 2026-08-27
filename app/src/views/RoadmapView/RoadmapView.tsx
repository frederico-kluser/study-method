/**
 * src/views/RoadmapView/RoadmapView.tsx — TRILHA (rodada 8).
 *
 * A trilha JÁ VEM com os itens (módulos e aulas pré-definidos pelo CLI de
 * autoria) — o aluno escolhe a aula, nunca gera. Esta view mostra o detalhe da
 * trilha selecionada (Home → trilha ou seletor local):
 *
 *   - módulos em ordem, com as aulas (título, resumo, dificuldade) e os
 *     estados done/current/pending + TRAVAMENTO sequencial (locked);
 *   - o TESTE DE PROFICIÊNCIA no topo: desafio que cobre TUDO — destrava a
 *     trilha inteira quando passado. Só começa quando o aluno lê o enunciado
 *     e clica em "Começar" (na ChallengeView);
 *   - clicar numa aula → pendingTrackLesson + navega para a aba Aula (chat);
 *   - clicar na proficiência → seleção track (ChallengeView, fluxo track).
 *
 * Entrada: pendingTrackSlug (Home → Trilha) drenado na MONTAGEM.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Collapse,
  Divider,
  IconButton,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LockIcon from '@mui/icons-material/Lock';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';

import { getApi } from '../../lib/apiBridge';
import { useChallengeNav } from '../../lib/challengeNav';
import { drainPendingTrackSlug, setPendingTrackLesson } from '../../lib/pendingSubject';
import type { TrackDetailPayload, TrackLessonEntry, TrackModuleEntry } from '../../../shared/ipc-contract';
import type { ViewProps } from '../placeholders';

/** Estado visual de uma aula (ícone + cor). */
function lessonStateMeta(state: { locked: boolean; done: boolean; current: boolean }): {
  icon: ReactElement;
  labelKey: string;
} {
  if (state.done) return { icon: <CheckCircleIcon fontSize="small" color="success" />, labelKey: 'roadmap.done' };
  if (state.current) return { icon: <PlayCircleIcon fontSize="small" color="primary" />, labelKey: 'roadmap.current' };
  if (state.locked) return { icon: <LockIcon fontSize="small" color="disabled" />, labelKey: 'roadmap.locked' };
  return { icon: <PlayCircleIcon fontSize="small" color="disabled" />, labelKey: 'roadmap.pending' };
}

/** Uma aula da trilha (clique abre o chat da aula). */
function LessonRow({
  lesson,
  onOpen,
  tI,
}: {
  lesson: TrackLessonEntry;
  onOpen: (lesson: TrackLessonEntry) => void;
  tI: (key: string, options?: Record<string, string | number>) => string;
}): ReactElement {
  const meta = lessonStateMeta(lesson);
  return (
    <Box
      component="button"
      onClick={() => onOpen(lesson)}
      disabled={lesson.locked}
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1,
        width: '100%',
        textAlign: 'left',
        border: 'none',
        background: 'none',
        cursor: lesson.locked ? 'not-allowed' : 'pointer',
        p: 0.75,
        borderRadius: 1,
        opacity: lesson.locked ? 0.55 : 1,
        '&:hover:not(:disabled)': { bgcolor: 'action.hover' },
        color: 'inherit',
      }}
    >
      <Box sx={{ mt: 0.25 }}>{meta.icon}</Box>
      <Box sx={{ flexGrow: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: lesson.current ? 700 : 500 }}>
          {lesson.title}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {lesson.summary}
        </Typography>
      </Box>
      <Chip size="small" variant="outlined" label={tI('roadmap.difficulty', { n: lesson.difficulty })} sx={{ ml: 1 }} />
    </Box>
  );
}

/** Um módulo da trilha (card colapsável). */
function ModuleCard({
  mod,
  onOpenLesson,
  defaultOpen,
  tI,
}: {
  mod: TrackModuleEntry;
  onOpenLesson: (l: TrackLessonEntry) => void;
  defaultOpen: boolean;
  tI: (key: string, options?: Record<string, string | number>) => string;
}): ReactElement {
  const [open, setOpen] = useState(defaultOpen);
  const doneCount = mod.lessons.filter((l) => l.done).length;
  return (
    <Card variant="outlined">
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
 <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {mod.title}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {tI('roadmap.moduleCount', { done: doneCount, total: mod.lessons.length })}
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => setOpen((v) => !v)} aria-label={tI('roadmap.toggleModule', { module: mod.title })}>
            <ExpandMoreIcon sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
          </IconButton>
        </Stack>
        <Collapse in={open}>
          <Divider sx={{ my: 1 }} />
 <Stack spacing={0.25}>
            {mod.lessons.map((l) => (
              <LessonRow key={l.slug} lesson={l} onOpen={onOpenLesson} tI={tI} />
            ))}
          </Stack>
        </Collapse>
      </CardContent>
    </Card>
  );
}

export function RoadmapView(props: ViewProps): ReactElement {
  const { t } = useTranslation();
  const tI = useMemo(
    () => t as unknown as (key: string, options?: Record<string, string | number>) => string,
    [t],
  );
  const navigate = props.onNavigate ?? (() => {});
  const nav = useChallengeNav();

  const [track, setTrack] = useState<TrackDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [tracks, setTracks] = useState<Array<{ slug: string; title: string; doneCount: number; lessonCount: number }> | null>(null);

  const loadTrack = useCallback((trackSlug: string): void => {
    setLoading(true);
    setLoadError(null);
    let cancelled = false;
    getApi()
      .track.get({ trackSlug })
      .then((res) => {
        if (cancelled) return;
        if (res.ok === false) {
          setLoadError(res.error);
          return;
        }
        if (!res.track) {
          setLoadError(t('translation:roadmap.notFound'));
          return;
        }
        setTrack(res.track);
      })
      .catch(() => {
        if (!cancelled) setLoadError(t('translation:roadmap.loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Montagem: drena a trilha pendente (Home → Trilha) ou lista as disponíveis.
  useEffect(() => {
    const pending = drainPendingTrackSlug();
    if (pending) {
      setSelected(pending);
      loadTrack(pending);
    }
    let cancelled = false;
    getApi()
      .track.list()
      .then((res) => {
        if (cancelled) return;
        if (res.ok && res.tracks.length > 0) {
          setTracks(res.tracks.map((x) => ({ slug: x.slug, title: x.title, doneCount: x.doneCount, lessonCount: x.lessonCount })));
        } else {
          setLoadError(t('translation:roadmap.noTracks'));
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError(t('translation:roadmap.noTracks'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
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

  // Seletor de trilha (quando nenhuma veio pendente).
  if (selected === null && !loading && tracks && tracks.length > 0) {
    return (
      <Box sx={{ p: 2, maxWidth: 640, mx: 'auto' }}>
        <Typography variant="h5" component="h1" gutterBottom>
          {t('translation:roadmap.pickTitle')}
        </Typography>
 <Stack spacing={1}>
          {tracks.map((tr) => (
            <Card key={tr.slug} variant="outlined" sx={{ cursor: 'pointer' }} onClick={() => {
              setSelected(tr.slug);
              loadTrack(tr.slug);
            }}>
              <CardContent>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {tr.title}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {tI('roadmap.trackCount', { done: tr.doneCount, total: tr.lessonCount })}
                </Typography>
              </CardContent>
            </Card>
          ))}
        </Stack>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, maxWidth: 760, mx: 'auto' }}>
      {loading && !track ? <LinearProgress /> : null}
      {loadError ? <Alert severity="warning">{loadError}</Alert> : null}

      {track ? (
 <Stack spacing={2}>
          {/* Cabeçalho da trilha. */}
          <Box>
            <Typography variant="h4" component="h1" gutterBottom>
              {track.title}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 640 }}>
              {track.description}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {tI('roadmap.trackCount', { done: track.doneCount, total: track.lessonCount })}
              {track.proficient ? ` · ${t('translation:roadmap.proficientBadge')}` : ''}
            </Typography>
          </Box>

          {/* Teste de proficiência: desafio que cobre TUDO. */}
          {track.proficiencyAvailable ? (
            <Card variant="outlined" sx={{ bgcolor: 'action.hover' }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 1.5, '&:last-child': { pb: 1.5 } }}>
                <WorkspacePremiumIcon color="primary" sx={{ fontSize: 40 }} />
                <Box sx={{ flexGrow: 1 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    {t('translation:roadmap.proficiencyTitle')}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t('translation:roadmap.proficiencyDescription')}
                  </Typography>
                </Box>
                <Button
                  variant="contained"
                  onClick={openProficiency}
                  startIcon={<WorkspacePremiumIcon />}
                  sx={{ whiteSpace: 'nowrap' }}
                >
                  {track.proficient
                    ? t('translation:roadmap.proficiencyRetake')
                    : t('translation:roadmap.proficiencyStart')}
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {/* Módulos com as aulas (itens JÁ PRONTOS da trilha). */}
          {track.modules.map((mod, i) => (
            <ModuleCard key={mod.slug} mod={mod} onOpenLesson={openLesson} defaultOpen={i === 0} tI={tI} />
          ))}

          <Tooltip title={t('translation:roadmap.sequentialHint')}>
            <Typography variant="caption" color="text.secondary" align="center">
              {t('translation:roadmap.sequentialHint')}
            </Typography>
          </Tooltip>
        </Stack>
      ) : null}
    </Box>
  );
}
