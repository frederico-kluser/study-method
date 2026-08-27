/**
 * src/views/placeholders.tsx — views do shell (onda 17A — Home REFEITA).
 *
 * HomeView deixa de ser um placeholder genérico e vira a tela inicial GUIDADA
 * (UX notes — "tela inicial pouco clara"):
 *   - copy explícito: o app dá AULAS DE PROGRAMAÇÃO E MATEMÁTICA com IA;
 *   - 3 passos visuais numerados (stepper): chaves → assunto → aprender/praticar;
 *   - CTA primário ÚNICO e contextual: sem chaves → "Configurar chaves" (settings);
 *     com chaves → "Começar aula" (lesson);
 *   - card de status do setup (chaves OK ✓ / faltando ⚠), lendo o estado REAL via
 *     `getApi().keys.getStatus()` (mesmo padrão do KeysPanel);
 *   - chips de assuntos sugeridos (programação + matemática): clicam → navegam p/
 *     a aba Aula E pré-preenchem o assunto via `pendingSubject` (estado
 *     compartilhado que a LessonView da onda 17B consome).
 *
 * ONDA 4 (matérias escolhidas): quando `study:list-topics` devolve matérias
 * PERSISTIDAS, a Home mostra duas seções por domínio (Programação/Matemática)
 * com um cartão por matéria (nome + progresso "x de y aulas" + ícone do
 * domínio). Clique no cartão grava `pendingSubject` + `pendingDomain` (a onda 5
 * lê o domínio no payload do generate-lesson) e navega para a aba Aula. Estado
 * VAZIO (nada persistido / erro) continua EXATAMENTE como hoje — os chips de
 * sugestão são o onboarding. Com sessão ativa de OUTRA matéria (SessionStateProvider),
 * o clique abre o diálogo de aviso ("não dá — a LLM avalia a aula atual") em
 * vez de trocar a sessão em silêncio.
 *
 * Navigation: o shell passa `onNavigate: NavKey => void` (ViewProps aditivo) —
 * em App.tsx isso é `setActive`. Settings/Lesson/Challenge continuam como
 * funções exportadas (o registry views/index.ts as sobrescreve pelas reais).
 */
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import Stepper from '@mui/material/Stepper';
import Typography from '@mui/material/Typography';
import CalculateIcon from '@mui/icons-material/Calculate';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import CodeIcon from '@mui/icons-material/Code';
import ErrorOutline from '@mui/icons-material/ErrorOutlined';
import LockIcon from '@mui/icons-material/Lock';
import PsychologyIcon from '@mui/icons-material/Psychology';
import TerminalIcon from '@mui/icons-material/Terminal';
import type { KeysStatus, SubjectSummary } from '../../shared/ipc-contract';
import type { NavKey } from '../lib/shellNav';
import { getApi } from '../lib/apiBridge';
import {
  groupSubjectsByDomain,
  homeDomainSections,
  homeSetupStatus,
  homeSuggestedSubjects,
  shouldWarnOnSubjectSwitch,
  subjectProgressCounts,
  type HomeDomain,
  type HomeSuggestionLabelKey,
} from '../lib/homeSetup';
import { setPendingDomain, setPendingSubject , setPendingTrackSlug } from '../lib/pendingSubject';
import { useSessionState } from '../lib/sessionState';

export interface ViewProps {
  /** Caminho do setup de estudo ativo (quando houver), vazio caso contrário. */
  setupsDir?: string;
  /**
   * ADITIVO (onda 17A): navega entre as abas do shell. A Home usa para o CTA
   * ("Configurar chaves" → settings, "Começar aula" → lesson) e para os chips de
   * sugestão (→ lesson). No-op quando ausente (compatibilidade c/ usos antigos).
   */
  onNavigate?: (key: NavKey) => void;
}

/* ─── Passos numerados do fluxo recém-instalado (UX notes item 3) ─────────── */

type HomeStepKey = 'configureKeys' | 'subject' | 'learn';

const HOME_STEPS: ReadonlyArray<{
  key: HomeStepKey;
  titleKey: `translation:home.steps.${HomeStepKey}.title`;
  descriptionKey: `translation:home.steps.${HomeStepKey}.description`;
  icon: ReactElement;
}> = [
  { key: 'configureKeys', titleKey: 'translation:home.steps.configureKeys.title', descriptionKey: 'translation:home.steps.configureKeys.description', icon: <LockIcon fontSize="small" /> },
  { key: 'subject', titleKey: 'translation:home.steps.subject.title', descriptionKey: 'translation:home.steps.subject.description', icon: <TerminalIcon fontSize="small" /> },
  { key: 'learn', titleKey: 'translation:home.steps.learn.title', descriptionKey: 'translation:home.steps.learn.description', icon: <PsychologyIcon fontSize="small" /> },
];

function HomeSteps(): ReactElement {
  const { t } = useTranslation();
  return (
    <Stepper activeStep={-1} nonLinear orientation="vertical">
      {HOME_STEPS.map((s) => (
        <Step key={s.titleKey}>
          <StepLabel
            optional={
              <Typography variant="body2" color="text.secondary">
                {t(s.descriptionKey)}
              </Typography>
            }
          >
            <Typography variant="subtitle2" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              {s.icon}
              {t(s.titleKey)}
            </Typography>
          </StepLabel>
        </Step>
      ))}
    </Stepper>
  );
}

/** Card de status do setup: chaves OK (verde ✓) ou faltando (aviso ⚠). */
function SetupStatusCard({ status }: { status: KeysStatus | null }): ReactElement {
  const { t } = useTranslation();
  const aggregate = homeSetupStatus(status);

  if (status == null) {
    return (
      <Card variant="outlined" sx={{ bgcolor: 'background.paper' }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {t('translation:home.setup.checking')}
          </Typography>
        </CardContent>
      </Card>
    );
  }

  const ready = aggregate === 'ready';
  const rows: Array<{ label: string; configured: boolean }> = [
    { label: t('translation:home.setup.deepseek'), configured: status.deepseekConfigured },
    { label: t('translation:home.setup.brave'), configured: status.braveConfigured },
  ];

  return (
    <Card
      variant="outlined"
      sx={{ bgcolor: 'background.paper', borderColor: ready ? 'divider' : 'warning.main' }}
    >
      <CardContent>
 <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: 'center' }}>
          {ready ? (
            <CheckCircleOutlined color="success" fontSize="small" />
          ) : (
            <ErrorOutline color="warning" fontSize="small" />
          )}
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {ready
              ? t('translation:home.setup.ready')
              : t('translation:home.setup.missing')}
          </Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {ready
            ? t('translation:home.setup.readyDescription')
            : t('translation:home.setup.missingDescription')}
        </Typography>
 <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap' }}>
          {rows.map((r) => (
            <Chip
              key={r.label}
              size="small"
              variant="outlined"
              label={`${r.label}: ${r.configured ? t('translation:home.setup.configured') : t('translation:home.setup.pending')}`}
              color={r.configured ? 'success' : 'default'}
            />
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

/** O que o usuário escolheu clicar: matéria + domínio (para o diálogo/commit). */
export interface SubjectPick {
  subject: string;
  domain: HomeDomain;
}

/**
 * Chips de sugestões (programação + matemática) — onboarding do estado VAZIO.
 * Clicar roteia pelo MESMO fluxo dos cartões (`onPick`): aviso de troca de
 * matéria se houver sessão ativa, senão grava pendingSubject/pendingDomain e
 * navega p/ Aula.
 */
function SubjectSuggestions({
  onPick,
}: {
  onPick: (pick: SubjectPick) => void;
}): ReactElement {
  const { t } = useTranslation();
  const suggestions = homeSuggestedSubjects();
  const domainLabel: Record<HomeDomain, string> = {
    programming: t('translation:home.suggestions.domainProgramming'),
    math: t('translation:home.suggestions.domainMath'),
  };

  const openInLesson = (labelKey: HomeSuggestionLabelKey): void => {
    const suggestion = suggestions.find((s) => s.labelKey === labelKey);
    if (!suggestion) return;
    onPick({ subject: t(labelKey), domain: suggestion.domain });
  };

  return (
 <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap',  }} >
      {suggestions.map((s) => (
        <Chip
          key={s.labelKey}
          clickable
          variant="outlined"
          label={`${domainLabel[s.domain]}: ${t(s.labelKey)}`}
          onClick={() => openInLesson(s.labelKey)}
        />
      ))}
    </Stack>
  );
}

/** Cartão de uma matéria persistida: nome + progresso + ícone do domínio. */
function SubjectCard({
  subject,
  onPick,
  tI,
}: {
  subject: SubjectSummary;
  onPick: (pick: SubjectPick) => void;
  tI: (key: string, options?: Record<string, string | number>) => string;
}): ReactElement {
  const { t } = useTranslation();
  const { answered, total } = subjectProgressCounts(subject);
  // Progresso "x de y aulas respondidas"; sem aulas ainda → convite à 1ª aula.
  const progressLabel =
    total > 0
      ? tI('translation:home.subjects.answeredOfTotal', { answered, total })
      : t('translation:home.subjects.noLessonsYet');

  return (
    <Card
      variant="outlined"
      sx={(theme) => ({
        backgroundColor: theme.vars.palette.surface.level1,
      })}
    >
      <CardActionArea
        onClick={() => onPick({ subject: subject.name, domain: subject.domain })}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: 1.5,
          px: 2,
          py: 1.5,
          textAlign: 'left',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', color: 'text.secondary' }}>
          {subject.domain === 'programming' ? (
            <CodeIcon fontSize="small" />
          ) : (
            <CalculateIcon fontSize="small" />
          )}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" noWrap>
            {subject.name}
          </Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            {progressLabel}
          </Typography>
        </Box>
      </CardActionArea>
    </Card>
  );
}

/**
 * Seções por domínio (Programação/Matemática, ordem canônica) com um cartão por
 * matéria ESCOLHIDA. Só renderiza domínios que têm matérias (lógica pura
 * `homeDomainSections`).
 */
function SubjectSections({
  topics,
  onPick,
  tI,
}: {
  topics: SubjectSummary[];
  onPick: (pick: SubjectPick) => void;
  tI: (key: string, options?: Record<string, string | number>) => string;
}): ReactElement {
  const { t } = useTranslation();
  const sections = homeDomainSections(groupSubjectsByDomain(topics));
  const sectionTitle: Record<HomeDomain, string> = {
    programming: t('translation:home.suggestions.domainProgramming'),
    math: t('translation:home.suggestions.domainMath'),
  };

  return (
 <Stack spacing={2}>
      {sections.map((section) => (
        <Box key={section.domain}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }} gutterBottom>
            {sectionTitle[section.domain]}
          </Typography>
 <Stack spacing={1}>
            {section.subjects.map((subject) => (
              <SubjectCard key={subject.id} subject={subject} onPick={onPick} tI={tI} />
            ))}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

/** View inicial (Início) — tela inicial guiada do tutor (onda 17A + onda 4). */
/* ─── Trilhas (rodada 8) — cursos prontos, criados pelo CLI de autoria ────── */

function TracksSection({
  onOpen,
  tI,
}: {
  onOpen: (slug: string) => void;
  tI: (key: string, options?: Record<string, string | number>) => string;
}): ReactElement | null {
  const { t } = useTranslation();
  const [tracks, setTracks] = useState<Array<{
    slug: string;
    title: string;
    description: string;
    doneCount: number;
    lessonCount: number;
  }> | null>(null);

  useEffect(() => {
    let cancelled = false;
    getApi()
      .track.list()
      .then((res) => {
        if (cancelled) return;
        setTracks(
          res.ok && res.tracks.length > 0
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
      .catch(() => {
        if (!cancelled) setTracks([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // null = ainda carregando (nada mostra); [] = sem trilhas instaladas.
  if (tracks === null || tracks.length === 0) return null;

  return (
    <Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }} gutterBottom>
        {t('translation:home.tracksTitle')}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        {t('translation:home.tracksDescription')}
      </Typography>
 <Stack spacing={1}>
        {tracks.map((tr) => (
          <Card
            key={tr.slug}
            variant="outlined"
            sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
            onClick={() => onOpen(tr.slug)}
          >
            <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
 <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    {tr.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {tr.description}
                  </Typography>
                </Box>
                <Chip
                  size="small"
                  variant="outlined"
                  label={tI('home.trackProgress', { done: tr.doneCount, total: tr.lessonCount })}
                />
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Box>
  );
}

export function HomeView(props: ViewProps): ReactElement {
  const { t } = useTranslation();
  // Interpolação ({{var}}): mesmo cast aprovado do ChallengeView (tI).
  const tI = useMemo(
    () => t as unknown as (key: string, options?: Record<string, string | number>) => string,
    [t],
  );
  const [keyStatus, setKeyStatus] = useState<KeysStatus | null>(null);
  // Matérias PERSISTIDAS (onda 4): null = carregando → onboarding (chips) até a
  // resposta; [] = vazio/erro → onboarding EXATAMENTE como hoje.
  const [topics, setTopics] = useState<SubjectSummary[] | null>(null);
  // Escolha aguardando confirmação do diálogo de troca de matéria (null = fechado).
  const [pendingPick, setPendingPick] = useState<SubjectPick | null>(null);
  const navigate = props.onNavigate ?? (() => {});
  // Sessão ativa publicada pela LessonView (subject da aula em andamento).
  const { subject: activeSubject } = useSessionState();

  useEffect(() => {
    let cancelled = false;
    getApi()
      .keys.getStatus()
      .then((status) => {
        if (!cancelled) setKeyStatus(status);
      })
      .catch(() => {
        if (!cancelled) {
          setKeyStatus({
            deepseekConfigured: false,
            braveConfigured: false,
            deepseekValidated: false,
            braveValidated: false,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Onda 4: carrega as matérias persistidas. `listTopics` devolve [] sem repo
  // (main é gracioso) e o catch defende o caso do canal ausente — nos DOIS
  // casos caímos no onboarding atual (chips), nunca numa tela quebrada.
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

  const ready = homeSetupStatus(keyStatus) === 'ready';

  const primaryAction = (): void => {
    if (ready) navigate('lesson');
    else navigate('settings');
  };

  /** Grava subject + domain pendentes e navega para a aba Aula. */
  const commitPick = (pick: SubjectPick): void => {
    setPendingSubject(pick.subject);
    setPendingDomain(pick.domain);
    navigate('lesson');
  };

  /**
   * Porta ÚNICA de escolha de matéria (cartões E chips). Com sessão ativa de
   * OUTRA matéria → abre o diálogo em vez de trocar em silêncio (a LLM avalia a
   * aula atual); mesma matéria ou sem sessão → continua direto.
   */
  const handlePick = (pick: SubjectPick): void => {
    if (shouldWarnOnSubjectSwitch(activeSubject, pick.subject)) {
      setPendingPick(pick);
      return;
    }
    commitPick(pick);
  };

  const hasSubjects = topics !== null && topics.length > 0;

  return (
    <Container maxWidth="md" sx={{ py: 2 }}>
 <Stack spacing={3}>
        {/* Copy: o que o app faz (não é pressuposto). */}
        <Box>
          <Typography variant="h4" component="h1" gutterBottom>
            {t('translation:home.title')}
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 640 }}>
            {t('translation:home.description')}
          </Typography>
        </Box>

        {/* Passos do fluxo recém-instalado. */}
        <HomeSteps />

        {/* Card de status do setup. */}
        <SetupStatusCard status={keyStatus} />

        {/* CTA primário único e contextual. */}
        <Box>
          <Button
            variant="contained"
            size="large"
            onClick={primaryAction}
            sx={{ height: 48, minWidth: { xs: '100%', sm: 220 } }}
          >
            {ready ? t('translation:home.cta.start') : t('translation:home.cta.setup')}
          </Button>
        </Box>

        {/* Rodada 8: TRILHAS — cursos prontos (criados pelo CLI de autoria).
            O aluno escolhe a trilha; os itens já vêm definidos. */}
        <TracksSection onOpen={(slug) => {
          setPendingTrackSlug(slug);
          navigate('roadmap');
        }} tI={tI} />

        {/* Onda 4: matérias escolhidas por domínio OU onboarding (chips). */}
        {hasSubjects ? (
          <Box>
            <SubjectSections topics={topics} onPick={handlePick} tI={tI} />
          </Box>
        ) : (
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }} gutterBottom>
              {t('translation:home.suggestions.title')}
            </Typography>
            <SubjectSuggestions onPick={handlePick} />
          </Box>
        )}
      </Stack>

      {/* Aviso de troca de matéria no meio da aula (onda 4). */}
      <Dialog
        open={pendingPick !== null}
        onClose={() => setPendingPick(null)}
        aria-labelledby="home-switch-dialog-title"
      >
        <DialogTitle id="home-switch-dialog-title">
          {t('translation:home.switchDialog.title')}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {t('translation:home.switchDialog.description')}
          </Typography>
        </DialogContent>
        <DialogActions>
          {/* Sem NENHUM pendingSubject: ir para a aula mantém a sessão atual. */}
          <Button
            onClick={() => {
              setPendingPick(null);
              navigate('lesson');
            }}
          >
            {t('translation:home.switchDialog.goToLesson')}
          </Button>
          <Button variant="contained" onClick={() => setPendingPick(null)}>
            {t('translation:home.switchDialog.continueCurrent')}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}