/**
 * src/views/RoadmapView/RoadmapView.tsx — aba TRILHA: roadmap por matéria.
 * (onda2-trilha)
 *
 * Mostra o progresso das aulas de cada matéria como um ROADMAP de seções por
 * nível — Iniciante → Intermediário → Avançado — em que cada aula é um nó no
 * estado 'done' (✓), 'current' (em andamento — a PRIMEIRA aula pendente, com
 * borda de acento e ponto preenchido) ou 'pending'.
 *
 * ─── DECISÃO DE ESCOPO: UMA MATÉRIA POR VEZ ─────────────────────────────────
 * A trilha exibe a matéria SELECIONADA (chips no topo). Um roadmap com todas
 * as matérias empilhadas ficaria longo e repetiria o seletor da aba Aula; o
 * seletor de matérias aqui é a superfície natural para a trilha de cada uma.
 * A matéria inicial é a do estado de sessão (SessionStateProvider — a matéria
 * da aula em curso, se existir), senão a primeira da lista.
 *
 * ─── DADOS E CACHE ──────────────────────────────────────────────────────────
 * `api.study.listTopics()` (SubjectSummary[]) lista as matérias; a seleção
 * carrega `api.study.listLessonsBySubject(slug)` (LessonSummary[]) e monta as
 * seções com `buildRoadmapSections` (src/lib/roadmap.ts — lógica pura testada).
 * Falha de rede/IPC é tratada como vazio (documentado no catch): a UI mostra
 * o estado vazio em vez de quebrar — padrão da HomeView.
 *
 * ─── SOMENTE-LEITURA ────────────────────────────────────────────────────────
 * A Trilha NÃO publica no SessionStateProvider e não altera o fluxo da aula.
 * Clicar num nó navega para a aba Aula gravando `pendingLessonId` (onda 5 — a
 * LessonView ABRE a lição persistida por id via getLessonById) + o TÍTULO da
 * lição via `pendingSubject` como fallback (se a abertura por id falhar, a
 * LessonView degrada para o comportamento atual — gerar a aula do assunto).
 */
import { useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { LessonSummary, SubjectSummary } from '../../../shared/ipc-contract';
import EvolutionTree, { type TreeStateLabels } from '../../components/tree/EvolutionTree';
import { getApi } from '../../lib/apiBridge';
import { levelI18nKey, type DifficultyLevel } from '../../lib/levels';
import { setPendingLessonId, setPendingSubject } from '../../lib/pendingSubject';
import {
  buildRoadmapSections,
  isRoadmapComplete,
  isRoadmapEmpty,
  type RoadmapLessonNode,
  type RoadmapResult,
  type RoadmapSection,
} from '../../lib/roadmap';
import { useSessionState } from '../../lib/sessionState';
import type { NavKey } from '../../lib/shellNav';
import type { TreeViewNode } from '../../lib/treeView';
import { effectsTransition, focusRingStyles, spatialTransition } from '../../theme';

/** Aula da trilha → nó de render da EvolutionTree (folha: sem filhos). */
function toTreeNode(node: RoadmapLessonNode): TreeViewNode {
  return {
    lessonId: node.lessonId,
    label: node.title,
    state: node.state,
    completedAt: node.completedAt,
    level: node.level,
    children: [],
  };
}

/** Bloco de nível: cabeçalho colapsável (aria-expanded) + a árvore da seção. */
function SectionBlock({
  section,
  levelLabel,
  stateLabels,
  onSelectLesson,
}: {
  section: RoadmapSection;
  levelLabel: (level: DifficultyLevel) => string;
  stateLabels: TreeStateLabels;
  onSelectLesson: (lessonId: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  // Interpolação ({{var}}): mesmo escape do ChallengeView.tsx:145 (`tI`).
  const tI = t as unknown as (key: string, options?: Record<string, string | number>) => string;
  // Roadmap legível de ponta a ponta: seções abrem por padrão; o usuário
  // recolhe o que não está olhando.
  const [open, setOpen] = useState(true);
  const sectionId = `trilha-section-${section.level}`;

  return (
    <Card variant="outlined" sx={(theme) => ({ backgroundColor: theme.vars.palette.surface.level1 })}>
      <Button
        fullWidth
        aria-expanded={open}
        aria-controls={sectionId}
        aria-label={tI('translation:trilha.aria.sectionToggle', {
          level: levelLabel(section.level),
        })}
        onClick={() => setOpen((o) => !o)}
        sx={(theme) => ({
          justifyContent: 'space-between',
          textAlign: 'left',
          textTransform: 'none',
          color: theme.vars.palette.text.primary,
          px: 2,
          py: 1.25,
          borderBottom: open ? `1px solid ${theme.vars.palette.divider}` : 'none',
          borderRadius: 0,
          '&.Mui-focusVisible': focusRingStyles(theme),
          '&:focus-visible': focusRingStyles(theme),
          transition: effectsTransition(theme, ['background-color', 'color'], 'fast'),
        })}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
          <ChevronRightRounded
            fontSize="small"
            sx={(theme) => ({
              transition: spatialTransition(theme, ['transform'], 'fast'),
              transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            })}
          />
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {levelLabel(section.level)}
          </Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {tI('translation:trilha.progress', { done: section.done, total: section.total })}
        </Typography>
      </Button>
      <Collapse in={open} unmountOnExit>
        <CardContent id={sectionId}>
          <EvolutionTree
            nodes={section.lessons.map(toTreeNode)}
            onSelectLesson={onSelectLesson}
            stateLabels={stateLabels}
          />
        </CardContent>
      </Collapse>
    </Card>
  );
}

/** Props herdadas do shell (ViewProps — aditivo `onNavigate`). */
export interface RoadmapViewProps {
  onNavigate?: (key: NavKey) => void;
}

export default function RoadmapView({ onNavigate }: RoadmapViewProps): ReactElement {
  const { t } = useTranslation();
  // Interpolação ({{var}}): o overload tipado do strictKeyChecks não resolve
  // options com o literal da chave — MESMO escape do ChallengeView.tsx:145
  // (`tI`), precedente já aprovado nesta base.
  const tI = t as unknown as (key: string, options?: Record<string, string | number>) => string;
  const navigate = onNavigate ?? (() => {});

  // Matérias do usuário (null = carregando).
  const [topics, setTopics] = useState<SubjectSummary[] | null>(null);
  // Matéria selecionada (slug).
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  // Aulas da matéria selecionada (null = carregando).
  const [lessons, setLessons] = useState<LessonSummary[] | null>(null);

  // Sessão da aula em curso (somente-leitura — a Trilha não publica nada).
  const session = useSessionState();

  // 1. Carrega as matérias; seleção inicial = matéria da sessão (se houver),
  //    senão a primeira.
  useEffect(() => {
    let cancelled = false;
    getApi()
      .study.listTopics()
      .then((list) => {
        if (cancelled) return;
        setTopics(list ?? []);
        if (list && list.length > 0) {
          const current = session.subject
            ? list.find((s) => s.name.trim().toLowerCase() === session.subject?.trim().toLowerCase())
            : undefined;
          setSelectedSlug((current ?? list[0])!.slug);
        } else {
          setSelectedSlug(null);
        }
      })
      .catch(() => {
        // Falha do IPC = vazio (padrão HomeView): a UI mostra o estado vazio.
        if (!cancelled) setTopics([]);
      });
    return () => {
      cancelled = true;
    };
    // `session.subject` entra de propósito: a matéria da aula em curso pode
    // nascer depois da montagem (sessão publicada pela LessonView).
  }, [session.subject]);

  // 2. Carrega as aulas da matéria selecionada e monta o roadmap.
  useEffect(() => {
    if (!selectedSlug) {
      setLessons(null);
      return;
    }
    let cancelled = false;
    setLessons(null);
    getApi()
      .study.listLessonsBySubject(selectedSlug)
      .then((list) => {
        if (!cancelled) setLessons(list ?? []);
      })
      .catch(() => {
        if (!cancelled) setLessons([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSlug]);

  const roadmap: RoadmapResult | null = lessons ? buildRoadmapSections(lessons) : null;

  const levelLabel = (level: DifficultyLevel): string => t(`translation:${levelI18nKey(level)}`);

  // Objeto pequeno re-criado a cada render: t() já é estável e os nós da
  // árvore são baratos — memoizar aqui seria otimização prematura.
  const stateLabels: TreeStateLabels = {
    done: t('translation:trilha.state.done'),
    current: t('translation:trilha.state.current'),
    pending: t('translation:trilha.state.pending'),
    level: levelLabel,
  };

  const selectedTopic = topics?.find((s) => s.slug === selectedSlug) ?? null;

  // Navegação: clique num nó → aba Aula ABRINDO A LIÇÃO POR ID (onda 5). A
  // LessonView drena `pendingLessonId` na montagem e carrega a lição persistida
  // via getLessonById (recordAnswer/judge-answer com id real). O assunto segue
  // gravado como FALLBACK: se a LessonView não conseguir abrir por id em algum
  // caminho (ex.: lição apagada), degrada para o comportamento atual — gera a
  // aula a partir do título.
  const openLesson = (lessonId: string): void => {
    const node = roadmap?.sections.flatMap((s) => s.lessons).find((n) => n.lessonId === lessonId);
    if (!node) return;
    setPendingLessonId(node.lessonId);
    setPendingSubject(node.title);
    navigate('lesson');
  };

  const goHome = (): void => navigate('home');

  const generateFirstLesson = (): void => {
    if (selectedTopic) setPendingSubject(selectedTopic.name);
    navigate('lesson');
  };

  // ─── Estados de carregamento e vazio ─────────────────────────────────────

  if (topics === null) {
    return (
      <Container maxWidth="md" sx={{ py: 2 }}>
        <Typography variant="body2" color="text.secondary">
          {t('translation:trilha.loading')}
        </Typography>
      </Container>
    );
  }

  if (topics.length === 0) {
    return (
      <Container maxWidth="md" sx={{ py: 2 }}>
        <Stack spacing={2}>
          <Typography variant="h4" component="h1" gutterBottom>
            {t('translation:trilha.title')}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {t('translation:trilha.empty.noTopics')}
          </Typography>
          <Box>
            <Button variant="contained" size="large" onClick={goHome}>
              {t('translation:trilha.empty.noTopicsCta')}
            </Button>
          </Box>
        </Stack>
      </Container>
    );
  }

  const complete = roadmap !== null && isRoadmapComplete(roadmap);

  return (
    <Container maxWidth="md" sx={{ py: 2 }}>
      <Stack spacing={2.5}>
        {/* Cabeçalho da trilha. */}
        <Box>
          <Typography variant="h4" component="h1" gutterBottom>
            {t('translation:trilha.title')}
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 640 }}>
            {t('translation:trilha.description')}
          </Typography>
        </Box>

        {/* Seletor de matéria. */}
        <Box role="group" aria-label={t('translation:trilha.aria.subjectSelector')}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }} gutterBottom>
            {t('translation:trilha.subjectLabel')}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }} useFlexGap>
            {topics.map((topic) => {
              const selected = topic.slug === selectedSlug;
              return (
                <Chip
                  key={topic.slug}
                  clickable
                  color={selected ? 'primary' : 'default'}
                  variant={selected ? 'filled' : 'outlined'}
                  label={topic.name}
                  aria-pressed={selected}
                  onClick={() => setSelectedSlug(topic.slug)}
                />
              );
            })}
          </Stack>
        </Box>

        {/* Progresso da matéria inteira (quando há aulas). */}
        {roadmap !== null && !isRoadmapEmpty(roadmap) ? (
          <Box>
            <Typography variant="body2" color="text.secondary">
              {tI('translation:trilha.progress', { done: roadmap.done, total: roadmap.total })}
            </Typography>
            {complete ? (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5 }}>
                <CheckCircleOutlined color="success" fontSize="small" />
                <Typography variant="body2" color="success.main">
                  {t('translation:trilha.completed')}
                </Typography>
              </Stack>
            ) : null}
          </Box>
        ) : null}

        {/* Seções por nível — ou o vazio de "matéria sem aulas". */}
        {roadmap === null ? (
          <Typography variant="body2" color="text.secondary">
            {t('translation:trilha.loading')}
          </Typography>
        ) : isRoadmapEmpty(roadmap) ? (
          <Card variant="outlined" sx={(theme) => ({ backgroundColor: theme.vars.palette.surface.level1 })}>
            <CardContent>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                {t('translation:trilha.empty.noLessons')}
              </Typography>
              <Button
                variant="contained"
                startIcon={<ChevronRightRounded />}
                onClick={generateFirstLesson}
                sx={(theme) => ({
                  transition: [
                    effectsTransition(theme, ['background-color', 'color'], 'fast'),
                    spatialTransition(theme, ['transform'], 'fast'),
                  ].join(', '),
                  '&:active': { transform: 'scale(0.98)' },
                  '&.Mui-focusVisible': focusRingStyles(theme),
                  '&:focus-visible': focusRingStyles(theme),
                  '@media (prefers-reduced-motion: reduce)': { '&:active': { transform: 'none' } },
                })}
              >
                {t('translation:trilha.empty.noLessonsCta')}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Stack spacing={1.5}>
            {roadmap.sections.map((section) => (
              <SectionBlock
                key={section.level}
                section={section}
                levelLabel={levelLabel}
                stateLabels={stateLabels}
                onSelectLesson={openLesson}
              />
            ))}
          </Stack>
        )}
      </Stack>
    </Container>
  );
}
