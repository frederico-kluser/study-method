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
 * ONDA-UX-TRILHAS (correção de UX — decisão do dono: "alinhado às trilhas"):
 * a "rodada 8" removeu a geração de aula por assunto (o aluno abre uma TRILHA
 * e escolhe a aula — ver pendingSubject.ts), mas a Home continuava a prometer
 * o fluxo removido ("Digite um assunto…", chips de ideias): clicar levava ao
 * estado vazio "Escolha uma trilha" da LessonView — dead-end confirmado em
 * auditoria. Realignamento:
 *   · os chips de sugestão ("Ideias para começar") FORAM REMOVIDOS da UI —
 *     prometiam um fluxo que não existe; as chaves `home.suggestions.*` e o
 *     helper `homeSuggestedSubjects` ficam no lib (contrato de testes);
 *   · o clique num cartão de matéria passa a IR PARA A TRILHA (roadmap), onde
 *     o conteúdo real vive — nunca mais para uma aula vazia; o diálogo de
 *     "trocar de matéria" saiu junto (ir para a Trilha não abandona aula — o
 *     chat fica cacheado por trackSlug:lessonId);
 *   · o CTA primário é contextual de verdade: sem chaves → Configurações;
 *     com última aula aberta → Continuar (restaura via lastLesson); sem
 *     última aula → Escolher uma trilha;
 *   · o stepper de passos apresenta-se SÓ enquanto o setup está incompleto
 *     (deixa de ser ruído permanente para quem já está a estudar);
 *   · falha de `keys.getStatus()` deixa de ser lida como "não configurado":
 *     é um estado próprio ("não foi possível verificar") com retentativa —
 *     nunca inferir "em falta" de uma falha de canal.
 *
 * Navigation: o shell passa `onNavigate: NavKey => void` (ViewProps aditivo) —
 * em App.tsx isso é `setActive`. Settings/Lesson/Challenge continuam como
 * funções exportadas (o registry views/index.ts as sobrescreve pelas reais).
 */
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import LinearProgress from '@mui/material/LinearProgress';
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
  IPC_TIMEOUT_MS,
  isTimeoutError,
  resolveChannelError,
  withTimeout,
} from '../lib/ipcTimeout';
import {
  groupSubjectsByDomain,
  homeDomainSections,
  homeSetupStatus,
  homeTracksState,
  splitSubjectsByOrphanSlug,
  subjectProgressCounts,
  type HomeDomain,
} from '../lib/homeSetup';
// ONDA-UX-TRILHAS: o CTA "Continuar" restaura a última aula aberta na sessão
// (peek — não consome; a LessonView tem a sua própria restauração).
import { peekLastLesson } from '../lib/lastLesson';
import { setPendingTrackSlug } from '../lib/pendingSubject';
// ONDA-UX-TRILHAS-2 (auditoria 1-trilhas, finding-10): a escala de raios do
// design system (SHAPE.sm=8 / md=12 / base=12) — o distintivo de progresso
// deixa o raio "pill" do Chip (999) e entra na mesma família do cartão.
import { SHAPE } from '../lib/designTokens';

export interface ViewProps {
  /** Caminho do setup de estudo ativo (quando houver), vazio caso contrário. */
  setupsDir?: string;
  /**
   * ADITIVO (onda 17A): navega entre as abas do shell. A Home usa para o CTA
   * (Configurações → settings, Continuar → lesson, Escolher trilha → roadmap)
   * e para os cartões de matéria (→ roadmap). No-op quando ausente
   * (compatibilidade c/ usos antigos).
   */
  onNavigate?: (key: NavKey) => void;
}

/* ─── Passos numerados do fluxo recém-instalado (UX notes item 3) ─────────── */

/**
 * Alvo de toque mínimo (px) — o piso de 44 que o design system cobra para
 * qualquer controle apontável (mesma receita do LessonView/TrackChallengePanel).
 */
const TOUCH_TARGET_PX = 44;

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
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
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

/**
 * Card de status do setup: chaves OK (verde ✓), faltando (aviso ⚠) ou
 * INVERIFICÁVEL (canal falhou — estado próprio, com retentativa). ONDA-UX-
 * TRILHAS (auditoria W2): uma falha de `keys.getStatus()` nunca é lida como
 * "não configurado" — a Home não desvia o utilizador para Configurações com
 * base numa resposta que não chegou.
 */
function SetupStatusCard({
  status,
  failed,
  onRetry,
}: {
  status: KeysStatus | null;
  /** O último getStatus falhou (timeout/canal) — distinto de "ainda a carregar". */
  failed: boolean;
  /** Retenta a leitura do estado (açao do estado de erro). */
  onRetry: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const aggregate = homeSetupStatus(status);

  if (status == null && failed) {
    return (
      <Card variant="outlined" sx={{ bgcolor: 'background.paper' }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {t('translation:home.setup.checkFailed')}
          </Typography>
          <Button
            variant="outlined"
            size="small"
            onClick={onRetry}
            sx={{ mt: 1, minHeight: TOUCH_TARGET_PX }}
          >
            {t('translation:common.tryAgain')}
          </Button>
        </CardContent>
      </Card>
    );
  }

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
    { label: t('translation:home.setup.openrouter'), configured: status.llmConfigured },
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
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
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

/** O que o usuário escolheu clicar: matéria + domínio (para o rótulo/estado). */
export interface SubjectPick {
  subject: string;
  domain: HomeDomain;
}

// ONDA-UX-TRILHAS: o componente `SubjectSuggestions` ("Ideias para começar")
// foi REMOVIDO — os chips prometiam "digitar um assunto → aula gerada", fluxo
// que a rodada 8 retirou do app (o clique caía no estado vazio "Escolha uma
// trilha" da LessonView). O contrato puro (`homeSuggestedSubjects` em
// src/lib/homeSetup.ts + chaves `home.suggestions.*`) fica intacto.

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
          {/* SEM noWrap (a regra da base, SC 1.4.12): nome e progresso
              QUEBRAM em vez de truncar com reticências. `overflowWrap:
              'anywhere'` + `minWidth: 0` seguram o cartão mesmo com um nome
              longo sem espaços — o texto cresce em altura, nunca estoura. */}
          <Typography variant="subtitle1" sx={{ overflowWrap: 'anywhere' }}>
            {subject.name}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>
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
          {/* ONDA-UX-TRILHAS-2 (auditoria 1-trilhas, finding-5): hierarquia
              visual — o título de SEÇÃO sobe um degrau inteiro (h6, 20px/700;
              `component="h2"` para o outline do documento) e deixa de empatar
              em tamanho/peso com os títulos de CARTÃO (subtitle1, 16px/600,
              que ficam como estão). Mesmo tratamento nos 3 cabeçalhos de
              "Trilhas" — todos os títulos de seção da Home partilham estilo. */}
          <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }} gutterBottom>
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

/**
 * Distintivo de progresso da trilha — ONDA-UX-TRILHAS-2 (auditoria 1-trilhas,
 * findings 1/2/7/10). O que estava ERRADO (medido na auditoria): o Chip vivia
 * numa linha flex encolhível sem `flexShrink: 0` nem coluna reservada, com
 * `overflowWrap: 'anywhere'` no rótulo — o flexbox esmagava a caixa para
 * ~55px e o texto partia a meio do token ("conclu/ídas", "1 de/115"), o
 * stat primária do cartão ilegível nos 3 cartões visíveis. O contrato novo:
 *   · DUAS linhas fixas de conteúdo ("1 de 115" / "aulas concluídas") via as
 *     chaves separadas `home.trackProgressCount` / `home.trackProgressUnit`
 *     (contrato de largura i18n, finding-2: rótulo +30% e totais de 4
 *     dígitos sobrevivem sem overflow nem ellipsis);
 *   · a coluna do grid que o hospeda é `auto` (largura natural, não encolhe)
 *     e o texto do cartão é que se adapta — nunca o stat;
 *   · quebra SÓ em limites de palavra: `overflowWrap: 'break-word'` (regra da
 *     casa nº 2; min-content = a maior palavra). NUNCA `'anywhere'`, que
 *     reduz o min-content a ~1 glifo e convida o flexbox a esmagar a caixa.
 *     No piso de 180px (larga mínima suportada, sob stress SC 1.4.12) as
 *     linhas que não couberem QUEBRAM em limites de palavra — nunca recortam,
 *     nunca truncam;
 *   · OBRIGATÓRIO: reset do `overflow: hidden` + `text-overflow: ellipsis`
 *     herdados do `.MuiChip-label` do MUI — qualquer ellipsis computada
 *     reprova a régua F104 do `e2e-spacing.spec.ts`/`spacingScan.ts`
 *     (política "quebra, nunca recorta", SC 1.4.12);
 *   · semântica de STATUS (finding-7): raio `SHAPE.sm` (8px) em vez do pill
 *     999 do Chip — a mesma família de raios do cartão (`SHAPE.base` = 12),
 *     não parece uma tag clicável; alinhado ao topo da linha do título
 *     (`alignSelf: 'start'` / `alignItems: 'start'` no grid);
 *   · contraste (regra 3b: só TINTA em superfície de chrome): linha 1 em
 *     `text.primary`, linha 2 em `text.secondary` — este último já medido no
 *     designTokens ("medido: ~7,8:1" sobre branco, AAA; testemunhado por
 *     tests/theme.test.ts). Sem cor nova, sem acento como rótulo.
 */
function TrackProgressBadge({
  done,
  total,
  tI,
}: {
  done: number;
  total: number;
  tI: (key: string, options?: Record<string, string | number>) => string;
}): ReactElement {
  return (
    <Chip
      size="small"
      variant="outlined"
      sx={{
        height: 'auto',
        py: 0.5,
        px: 1,
        alignSelf: 'start',
        maxWidth: '100%',
        borderRadius: `${SHAPE.sm}px`,
        '& .MuiChip-label': {
          display: 'block',
          // Reset do default do Chip (hidden + ellipsis): o F104 do e2e-spacing
          // acusa qualquer `text-overflow: ellipsis` computado no frame da Home.
          overflow: 'visible',
          textOverflow: 'clip',
          whiteSpace: 'normal',
          overflowWrap: 'break-word',
          px: 0.5,
        },
      }}
      label={
        <Box component="span" sx={{ display: 'block', textAlign: 'center' }}>
          {/* Linha 1 (contagem) e linha 2 (unidade): blocos separados, cada
              um quebra em limites de palavra quando a coluna `auto` do grid
              não lhe dá a largura natural (piso de 180px + rótulo +30% /
              totais de 4 dígitos) — nunca a meio de um token. */}
          <Box
            component="span"
            sx={{ display: 'block', overflowWrap: 'break-word', fontWeight: 700, lineHeight: 1.35 }}
          >
            {tI('home.trackProgressCount', { done, total })}
          </Box>
          <Box
            component="span"
            sx={{
              display: 'block',
              overflowWrap: 'break-word',
              lineHeight: 1.35,
              color: 'text.secondary',
            }}
          >
            {tI('home.trackProgressUnit')}
          </Box>
        </Box>
      }
    />
  );
}

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
  // ONDA 2c (blindagem): falha do track:list NÃO some em silêncio — mostra
  // erro claro com detalhe + botão de tentar de novo (e timeout no canal mudo).
  const [tracksError, setTracksError] = useState<string | null>(null);

  /** Lista as trilhas — com timeout: canal mudo ou falha viram erro VISÍVEL
   * (com o detalhe do erro quando o canal devolve) + botão de tentar de novo. */
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

  // ONDA9 (cache-reconcilia): o estado da seção é NOMEADO por uma função pura
  // (homeTracksState) — 'loading' | 'error' | 'empty' | 'list'. O que mudou é
  // o 'empty': antes a seção inteira sumia (`return null`) quando não havia
  // trilha instalada, e sumir se parece com quebrado. Agora VAZIO é um estado
  // legítimo, escrito na tela, e distinto do erro.
  const state = homeTracksState(tracks, tracksError);

  // Falha/ausência de resposta → erro VISÍVEL com ação (nunca sumir em silêncio).
  if (state === 'error') {
    return (
      <Box>
        <Alert severity="error">{tracksError}</Alert>
        {/* minHeight = piso de alvo de toque (TOUCH_TARGET_PX) — o size="small"
            sozinho nasce ~30px de alto. */}
        <Button
          variant="outlined"
          size="small"
          onClick={loadTracks}
          sx={{ mt: 1, minHeight: TOUCH_TARGET_PX }}
        >
          {t('translation:common.tryAgain')}
        </Button>
      </Box>
    );
  }

  // Resposta ainda não chegou: o TÍTULO já aparece com um indicador — antes a
  // secção inteira sumia (`return null`) e o layout saltava quando a lista
  // chegava (S3 da auditoria: silêncio + layout shift). O `|| tracks === null`
  // é o ESTREITAMENTO para o tsc (o estado 'loading' já cobre esse caso em
  // runtime, mas o compilador não deriva isso da função).
  if (state === 'loading' || tracks === null) {
    return (
      <Box>
        <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }} gutterBottom>
          {t('translation:home.tracksTitle')}
        </Typography>
        <LinearProgress aria-label={t('translation:home.tracksLoading')} />
      </Box>
    );
  }

  // VAZIO LEGÍTIMO: nenhuma trilha instalada. Nem erro, nem lista fantasma —
  // uma explicação do que o app é (o conteúdo vem do CLI de autoria).
  if (state === 'empty' || tracks.length === 0) {
    return (
      <Box>
        <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }} gutterBottom>
          {t('translation:home.tracksTitle')}
        </Typography>
        <Card variant="outlined" data-testid="home-tracks-empty">
          <CardContent>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }} gutterBottom>
              {t('translation:home.tracksEmptyTitle')}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {t('translation:home.tracksEmptyDescription')}
            </Typography>
          </CardContent>
        </Card>
      </Box>
    );
  }

  return (
    <Box>
      {/* ONDA-UX-TRILHAS-2 (finding-5): "Trilhas" sobe para h6/700 — um degrau
          à frente dos títulos de cartão (subtitle1/600). A string visível fica
          ESTÁVEL ("Trilhas" — regra 5 da casa, specs e2e dependem dela). */}
      <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }} gutterBottom>
        {t('translation:home.tracksTitle')}
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
        {t('translation:home.tracksDescription')}
      </Typography>
 <Stack spacing={1}>
        {tracks.map((tr) => (
          // CardActionArea (o padrão do SubjectCard acima) em vez de `onClick`
          // no <Card>: div não alcança teclado — o cartão vira botão real
          // (Tab + Enter/Espaço), mesmo visual e mesmos handlers.
          <Card
            key={tr.slug}
            variant="outlined"
            sx={{ '&:hover': { bgcolor: 'action.hover' } }}
          >
            <CardActionArea onClick={() => onOpen(tr.slug)}>
              <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                {/* ONDA-UX-TRILHAS-2 (finding-1): a linha deixa de ser flex
                    encolhível por GRID `minmax(0, 1fr) auto` — a coluna do
                    distintivo é `auto` (largura natural, não encolhe; ver
                    TrackProgressBadge) e a coluna do texto é que se adapta
                    (`minWidth: 0` + quebra em limites de palavra). Antes o
                    flexbox esmagava o Chip para ~55px e partia palavras a meio
                    do token. `alignItems: 'start'` alinha o distintivo à linha
                    do título (finding-7); `columnGap: 1.5` (12px) é o gutter
                    real entre texto e stat — o gap de 8px era comido quando o
                    texto corria contra a borda do chip. */}
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) auto' },
                    columnGap: 1.5,
                    rowGap: 0.75,
                    alignItems: 'start',
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, overflowWrap: 'break-word' }}>
                      {tr.title}
                    </Typography>
                    {/* Finding-3/4: descrição em `body2` (14px — o `caption`
                        de 12px media mal numa frase de 300+ caracteres) com
                        medida tectada em `maxWidth: 640` (~72ch, SC 1.4.8 —
                        o mesmo padrão de RoadmapView para o mesmo campo).
                        `overflowWrap: 'break-word'` (NUNCA 'anywhere'): tokens
                        como "-std=c11." quebram em limites de palavra e só
                        partem quando não couberem de todo. WRAP TOTAL, sem
                        clamp/ellipsis (política da casa: quebra, nunca
                        recorta — o F104 do e2e-spacing reprova reticências). */}
                    <Typography
                      variant="body2"
                      sx={{ color: 'text.secondary', overflowWrap: 'break-word', mt: 0.5, maxWidth: 640 }}
                    >
                      {tr.description}
                    </Typography>
                  </Box>
                  <TrackProgressBadge done={tr.doneCount} total={tr.lessonCount} tI={tI} />
                </Box>
              </CardContent>
            </CardActionArea>
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
  const navigate = props.onNavigate ?? (() => {});

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

  const ready = homeSetupStatus(keyStatus) === 'ready';

  // ONDA-UX-TRILHAS: o CTA é contextual de VERDADE (uma ação = um destino que
  // sempre funciona):
  //   · sem chaves        → Configurações (fechar o setup);
  //   · com última aula   → Continuar (a LessonView restaura via lastLesson);
  //   · sem última aula   → Escolher uma trilha (roadmap — o conteúdo vive lá).
  // Antes, "Começar aula" mandava SEMPRE para a aba Aula, que sem aula aberta
  // mostra "Escolha uma trilha" — um salto para um estado vazio (auditoria).
  const lastLesson = peekLastLesson();

  const primaryAction = (): void => {
    if (!ready) {
      navigate('settings');
      return;
    }
    navigate(lastLesson ? 'lesson' : 'roadmap');
  };

  const primaryLabel = !ready
    ? t('translation:home.cta.setup')
    : lastLesson
      ? t('translation:home.cta.continue')
      : t('translation:home.cta.start');

  /**
   * Porta ÚNICA de escolha de matéria (cartões). ONDA-UX-TRILHAS: o clique vai
   * para a TRILHA (roadmap), onde o conteúdo real vive — a rodada 8 retirou a
   * geração de aula por assunto e o clique antigo caía no estado vazio da
   * aba Aula. O aviso de "trocar de matéria" saiu junto: ir para a Trilha não
   * abandona a aula em curso (o chat fica cacheado por trackSlug:lessonId).
   */
  const handlePick = (_pick: SubjectPick): void => {
    navigate('roadmap');
  };

  // ONDA9: o veredito do main aplicado à lista. `visible` são as matérias
  // ALCANÇÁVEIS (têm aula própria no banco ou trilha instalada); `orphaned` é
  // o resquício — ele NÃO vira cartão (seria link morto), mas também não some
  // calado: rende um aviso com caminho para as Configurações.
  const { visible: visibleTopics } = splitSubjectsByOrphanSlug(topics, orphanSlugList);
  // Resquício SEM matéria persistida (só progresso de trilha) não aparece em
  // `orphanedTopics` — por isso o contador vem do main, não da subtração.
  const orphanCount = orphanSlugList?.length ?? 0;
  const hasSubjects = topics !== null && visibleTopics.length > 0;

  return (
    <Container maxWidth="md" sx={{ py: 2 }}>
 <Stack spacing={3}>
        {/* Copy: o que o app faz (não é pressuposto). */}
        <Box>
          <Typography variant="h4" component="h1" gutterBottom>
            {t('translation:home.title')}
          </Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary', maxWidth: 640 }}>
            {t('translation:home.description')}
          </Typography>
        </Box>

        {/* ONDA-UX-TRILHAS: o stepper de passos apresenta-se SÓ enquanto o
            setup está incompleto — para quem já estuda, ele era ruído
            permanente (a mensagem "configure as chaves" repetida 3×). */}
        {!ready ? <HomeSteps /> : null}

        {/* Card de status do setup (retentativa quando o canal falha). */}
        <SetupStatusCard status={keyStatus} failed={keyStatusFailed} onRetry={refreshKeys} />

        {/* CTA primário único e contextual (destino sempre útil — ver acima). */}
        <Box>
          <Button
            variant="contained"
            size="large"
            onClick={primaryAction}
            sx={{ height: 48, minWidth: { xs: '100%', sm: 220 } }}
          >
            {primaryLabel}
          </Button>
        </Box>

        {/* Rodada 8: TRILHAS — cursos prontos (criados pelo CLI de autoria).
            O aluno escolhe a trilha; os itens já vêm definidos. */}
        <TracksSection onOpen={(slug) => {
          setPendingTrackSlug(slug);
          navigate('roadmap');
        }} tI={tI} />

        {/* ONDA9 (cache-reconcilia): o resquício some do caminho do aluno, mas
            NUNCA em silêncio — o aviso diz quantos são, garante que nada foi
            apagado e aponta para onde removê-los de propósito. */}
        {orphanCount > 0 ? (
          <Alert
            severity="info"
            data-testid="home-orphans-notice"
            action={
              <Button
                color="inherit"
                size="small"
                onClick={() => navigate('settings')}
                sx={{ minHeight: TOUCH_TARGET_PX }}
              >
                {t('translation:home.orphansAction')}
              </Button>
            }
          >
            {tI('home.orphansNotice', { n: orphanCount })}
          </Alert>
        ) : null}

        {/* Onda 4: matérias escolhidas por domínio (progresso por matéria).
            ONDA-UX-TRILHAS: sem matérias NÃO há mais chips de ideias — o
            caminho canónico são as TRILHAS (secção acima); os chips prometiam
            "digitar um assunto → aula gerada", fluxo removido na rodada 8. */}
        {hasSubjects ? (
          <Box>
            <SubjectSections topics={visibleTopics} onPick={handlePick} tI={tI} />
          </Box>
        ) : null}
      </Stack>
    </Container>
  );
}