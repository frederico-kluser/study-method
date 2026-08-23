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
 * Navigation: o shell passa `onNavigate: NavKey => void` (ViewProps aditivo) —
 * em App.tsx isso é `setActive`. Settings/Lesson/Challenge continuam como
 * funções exportadas (o registry views/index.ts as sobrescreve pelas reais).
 */
import { useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import Stepper from '@mui/material/Stepper';
import Typography from '@mui/material/Typography';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import ErrorOutline from '@mui/icons-material/ErrorOutlined';
import LockIcon from '@mui/icons-material/Lock';
import PsychologyIcon from '@mui/icons-material/Psychology';
import TerminalIcon from '@mui/icons-material/Terminal';
import type { KeysStatus } from '../../shared/ipc-contract';
import type { NavKey } from '../lib/shellNav';
import { getApi } from '../lib/apiBridge';
import {
  homeSetupStatus,
  homeSuggestedSubjects,
  type HomeDomain,
  type HomeSuggestionLabelKey,
} from '../lib/homeSetup';
import { setPendingSubject } from '../lib/pendingSubject';

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

function PlaceholderCard({ title }: { title: string }): ReactElement {
  return (
    <section className="placeholder" data-testid={`view-${title.toLowerCase()}`}>
      <span className="placeholder__badge">onda 1 — scaffold</span>
      <h2 className="placeholder__title">{title}</h2>
      <p className="placeholder__body">Em construção — chega na onda 3.</p>
    </section>
  );
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

/** Chips de sugestões (programação + matemática) → navega p/ Aula + pré-preenche. */
function SubjectSuggestions({ onNavigate }: { onNavigate: (key: NavKey) => void }): ReactElement {
  const { t } = useTranslation();
  const suggestions = homeSuggestedSubjects();
  const domainLabel: Record<HomeDomain, string> = {
    programming: t('translation:home.suggestions.domainProgramming'),
    math: t('translation:home.suggestions.domainMath'),
  };

  const openInLesson = (labelKey: HomeSuggestionLabelKey): void => {
    const subject = t(labelKey);
    // Pré-preenche o assunto da aba Aula (estado compartilhado p/ a 17B).
    setPendingSubject(subject);
    // Navegação imediata para a aba Aula.
    onNavigate('lesson');
  };

  return (
    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }} useFlexGap>
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

/** View inicial (Início) — tela inicial guiada do tutor. */
export function HomeView(props: ViewProps): ReactElement {
  const { t } = useTranslation();
  const [keyStatus, setKeyStatus] = useState<KeysStatus | null>(null);
  const navigate = props.onNavigate ?? (() => {});

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

  const ready = homeSetupStatus(keyStatus) === 'ready';

  const primaryAction = (): void => {
    if (ready) navigate('lesson');
    else navigate('settings');
  };

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

        {/* Sugestões de assunto. */}
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }} gutterBottom>
            {t('translation:home.suggestions.title')}
          </Typography>
          <SubjectSuggestions onNavigate={navigate} />
        </Box>
      </Stack>
    </Container>
  );
}

export function SettingsView(props: ViewProps): ReactElement {
  return <PlaceholderCard title="Settings" />;
}

export function LessonView(props: ViewProps): ReactElement {
  return <PlaceholderCard title="Aula" />;
}

export function ChallengeView(props: ViewProps): ReactElement {
  return <PlaceholderCard title="Desafio" />;
}