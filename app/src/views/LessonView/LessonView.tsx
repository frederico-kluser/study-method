/**
 * src/views/LessonView/LessonView.tsx — tela de Aula: assunto → pesquisa → aula.
 * CHROME MUI v9 (path imports, sx responsivo mobile-first, a11y).
 *
 * Fluxo:
 *  1. O usuário digita o assunto e clica "Gerar aula".
 *  2. A view assina `study.onLessonProgress` (fases pesquisando/autorando/
 *     materializando/validando/concluindo) antes de chamar `study.generateLesson`.
 *  3. Ao resolver, o payload é normalizado por `parseLessonResult` (aceita
 *     `StudyLesson` direto ou `{ lesson, rejected }`) e renderizado via
 *     react-markdown v9 com blocos de código estilizados (monospace).
 *
 * Os parsers/src/lib (lessonParse, lessonProgress) são REUTILIZADOS — não
 * reescritos. O novo helper puro `lessonPhaseLabels.ts` mapeia a fase do parser
 * para a i18n-key do rótulo.
 *
 * Assinatura de generateLesson: no api-schema está `generateLesson(): Promise<unknown>`
 * (a implementação do main chega em outra onda), mas o runtime do preload encaminha
 * argumentos ao invoke; passamos o `subject` como primeiro argumento — conforme
 * documentado no contrato de requisição ("o renderer passa args").
 */
import ReactMarkdown from 'react-markdown';
import { useCallback, useState, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import LinearProgress from '@mui/material/LinearProgress';
import Link from '@mui/material/Link';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { ChallengeInfo, StudyFinding } from '../../../shared/ipc-contract';
import { getApi } from '../../lib/apiBridge';
import { useChallengeNav } from '../../lib/challengeNav';
import { useLessonProgress } from '../../hooks/useLessonProgress';
import { parseLessonProgressEvent, type LessonPhaseState } from '../../lib/lessonProgress';
import {
  lessonPhaseKey,
  lessonPhaseIndex,
  LESSON_PHASE_ORDER,
} from '../../lib/lessonPhaseLabels';
import { parseLessonResult, type ParsedLesson } from '../../lib/lessonParse';
import { validateSubject } from '../../lib/validate';

type GenerateStatus = 'idle' | 'running' | 'done' | 'error';

/** Fonte (finding) da aula — item de List com Link. */
function SourceList({ findings }: { findings: StudyFinding[] }): ReactElement {
  const { t: _t } = useTranslation();
  const t = _t as unknown as (key: string) => string;
  if (findings.length === 0) {
    return <Typography variant="body2" color="text.secondary">Nenhuma fonte registrada.</Typography>;
  }
  return (
    <List dense disablePadding>
      {findings.map((f, i) => (
        <ListItem key={`${f.url}-${i}`} disableGutters>
          <ListItemText
            primary={
              <Box>
                <Link
                  href={f.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  underline="hover"
                >
                  {f.title}
                </Link>
                {f.description ? (
                  <Typography variant="body2" color="text.secondary" component="div">
                    {f.description}
                  </Typography>
                ) : null}
              </Box>
            }
          />
        </ListItem>
      ))}
    </List>
  );
}

/** Cards dos desafios aprovados — clique seleciona e navega (MESMO contrato useChallengeNav). */
function ChallengesSection({
  parsed,
  rejected,
}: {
  parsed: ParsedLesson;
  rejected: ParsedLesson['rejected'];
}): ReactElement {
  const { t: _t } = useTranslation();
  const t = _t as unknown as (key: string) => string;
  const { selectedChallenge, selectChallenge, navigateToChallenge } = useChallengeNav();
  const challenges = parsed.lesson?.challenges ?? [];

  const openChallenge = (c: ChallengeInfo): void => {
    selectChallenge(c);
    navigateToChallenge();
  };

  return (
    <Box component="section">
      <Typography variant="h6" component="h3" gutterBottom>
        {t('lesson.challenges')}
      </Typography>
      {challenges.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t('lesson.challengesEmpty')}
        </Typography>
      ) : (
        <Grid container spacing={1} sx={{ width: '100%' }}>
          {challenges.map((c) => {
            const selected = selectedChallenge?.challengeId === c.challengeId;
            return (
              <Grid key={c.challengeId} size={{ xs: 12, sm: 6, md: 4 }}>
                <Card
                  variant={selected ? 'elevation' : 'outlined'}
                  sx={{ height: '100%' }}
                >
                  <CardActionArea onClick={() => openChallenge(c)}>
                    <CardContent>
                      <Typography variant="subtitle2" noWrap>
                        {c.title}
                      </Typography>
                      <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
                        <Chip label={c.language} size="small" variant="outlined" />
                        {c.verdict ? (
                          <Chip label={c.verdict} size="small" color="success" variant="outlined" />
                        ) : null}
                      </Stack>
                      <Typography variant="body2" color="primary" sx={{ mt: 0.5 }}>
                        {t('lesson.open')}
                      </Typography>
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}
      {rejected.length > 0 ? (
        <Alert severity="warning" sx={{ mt: 1 }}>
          <strong>Aviso:</strong> {rejected.length} desafio(s) rejeitado(s) na geração.
          <ul style={{ margin: 0 }}>
            {rejected.map((r, i) => (
              <li key={i}>
                {r.title}
                {r.reason ? ` — ${r.reason}` : ''}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}
    </Box>
  );
}

/** Placeholder dos componentes de código do react-markdown (monospace). */
function MarkdownComponents() {
  return {
    pre: ({ children }: { children?: ReactNode }) => (
      <Box
        component="pre"
        sx={{
          fontFamily: "'SFMono-Regular', 'JetBrains Mono', Menlo, Consolas, monospace",
          bgcolor: 'action.hover',
          borderRadius: 1,
          p: 1,
          overflowX: 'auto',
          fontSize: '0.8125rem',
        }}
      >
        {children}
      </Box>
    ),
    code: (props: { children?: ReactNode; className?: string }) => (
      <Box
        component="code"
        {...props}
        sx={{
          fontFamily: "'SFMono-Regular', 'JetBrains Mono', Menlo, Consolas, monospace",
          fontSize: '0.8125rem',
          bgcolor: 'action.hover',
          borderRadius: 0.5,
          px: 0.25,
        }}
      />
    ),
    a: ({ href, children }: { href?: string; children?: ReactNode }) => (
      <Link href={href} target="_blank" rel="noreferrer noopener" underline="hover">
        {children}
      </Link>
    ),
  };
}

export default function LessonView(): ReactElement {
  const { t: _t } = useTranslation();
  const t = _t as unknown as (key: string) => string;
  const [subject, setSubject] = useState('');
  const [status, setStatus] = useState<GenerateStatus>('idle');
  const [phase, setPhase] = useState<LessonPhaseState>({
    phase: 'gerando',
    fraction: 0,
    message: '',
    done: false,
  });
  const [parsed, setParsed] = useState<ParsedLesson | null>(null);
  const [error, setError] = useState('');

  const onProgress = useCallback((raw: unknown) => {
    const next = parseLessonProgressEvent(raw);
    setPhase(next);
    setStatus((s) => (s === 'idle' ? 'running' : s));
  }, []);

  useLessonProgress(onProgress);

  const generate = async (): Promise<void> => {
    const check = validateSubject(subject);
    if (!check.ok) {
      setError(check.message ?? 'Assunto inválido.');
      setStatus('error');
      return;
    }
    setError('');
    setParsed(null);
    setStatus('running');
    setPhase({ phase: 'gerando', fraction: 0, message: 'Iniciando…', done: false });
    try {
      // generateLesson é tipado como ()=>Promise<unknown>; o runtime encaminha
      // args ao invoke — passamos o subject como primeiro argumento.
      const typed = getApi().study.generateLesson as (s: string) => Promise<unknown>;
      const payload = await typed(subject.trim());
      const result = parseLessonResult(payload);
      if (!result.ok) {
        setError(result.error ?? 'Falha ao gerar aula.');
        setStatus('error');
        return;
      }
      setParsed(result);
      setPhase((prev) => ({ ...prev, phase: 'concluindo', done: true }));
      setStatus('done');
    } catch (err) {
      setError(`Erro ao gerar a aula: ${String(err)}`);
      setStatus('error');
    }
  };

  const running = status === 'running';
  const activeStep = Math.max(0, lessonPhaseIndex(phase.phase));

  return (
    <Box component="section" sx={{ p: { xs: 1, md: 2 }, maxWidth: 960, mx: 'auto' }}>
      <Typography variant="h4" component="h1" gutterBottom>
        {t('nav.lesson')}
      </Typography>

      {/* Entrada do assunto + gerar */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TextField
          label={t('lesson.subjectLabel')}
          placeholder={t('lesson.subjectPlaceholder')}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          disabled={running}
          fullWidth
          variant="outlined"
        />
        <Button
          variant="contained"
          disabled={running}
          loading={running}
          onClick={() => void generate()}
          sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' }, minWidth: { sm: 160 } }}
        >
          {t('lesson.generate')}
        </Button>
      </Stack>

      {/* Progresso das fases */}
      {status === 'running' || status === 'done' ? (
        <Box sx={{ mt: 2 }} role="status" aria-live="polite">
          <Stepper activeStep={activeStep} alternativeLabel>
            {LESSON_PHASE_ORDER.map((labelKey) => (
              <Step key={labelKey}>
                <StepLabel>{t(labelKey)}</StepLabel>
              </Step>
            ))}
          </Stepper>
          <LinearProgress
            variant={phase.fraction > 0 ? 'determinate' : 'indeterminate'}
            value={Math.round(phase.fraction * 100)}
            aria-label={t('lesson.generate')}
            sx={{ mt: 1 }}
          />
          {status === 'running' && phase.message ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {phase.message}
            </Typography>
          ) : null}
        </Box>
      ) : null}

      {error ? (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      ) : null}

      {/* Conteúdo da aula */}
      {parsed?.lesson && status === 'done' ? (
        <Paper variant="outlined" sx={{ mt: 2, p: { xs: 1.5, md: 2 } }}>
          <Typography variant="h5" component="h2">
            {parsed.lesson.title}
          </Typography>
          {parsed.lesson.subject ? (
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Assunto: {parsed.lesson.subject}
            </Typography>
          ) : null}
          <Box sx={{ mt: 1 }}>
            <ReactMarkdown components={MarkdownComponents()}>
              {parsed.lesson.markdown}
            </ReactMarkdown>
          </Box>

          <Box component="section" sx={{ mt: 2 }}>
            <Typography variant="h6" component="h3" gutterBottom>
              {t('lesson.sources')}
            </Typography>
            <SourceList findings={parsed.lesson.findings} />
          </Box>

          <Box sx={{ mt: 2 }}>
            <ChallengesSection parsed={parsed} rejected={parsed.rejected} />
          </Box>
        </Paper>
      ) : null}
    </Box>
  );
}