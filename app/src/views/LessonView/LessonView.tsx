/**
 * src/views/LessonView/LessonView.tsx — tela de Aula: assunto → pesquisa → aula
 * curta (1-2 parágrafos) + input de resposta + avanço para a próxima aula.
 * CHROME MUI v9 (path imports, sx responsivo mobile-first, a11y).
 *
 * Fluxo (onda 3 — gerar nova aula):
 *  1. O usuário digita o assunto e clica no botão primário. O rótulo vem de
 *     `newLessonActionLabel(hasPendingLesson)`:
 *       - sem aula pendente → "Gerar nova aula" (gera via `study.generateLesson`);
 *       - com próxima aula pendente → "Continuar" (carrega a aula pendente local).
 *  2. A view assina `study.onLessonProgress` (fases pesquisando/autorando/…) só
 *     durante a geração. Ao resolver, normaliza por `parseLessonResult`, resume o
 *     markdown por `summarizeLessonToShort` (aula curta), extrai a pergunta
 *     (`extractQuestion`) e monta o prompt do input (`buildLessonLesson`).
 *  3. O aluno digita o que entendeu (ou responde a pergunta) e clica em enviar.
 *     Ao responder não-vazio (`canAdvance`), marca a aula como concluída
 *     (localmente), TENTA persistir via IPC de forma DEFENSIVA
 *     (`recordAnswer`/`markLessonCompleted` — ainda não expostos no ApiSchema;
 *     fallback = registro local), e `nextAfterAnswer` encadeia:
 *       - há próxima aula pendente → carrega esse body local;
 *       - senão → mantém o botão "Gerar nova aula".
 *
 * Os engines/parsers (lessonParse, lessonProgress, lessonPhaseLabels,
 * lessonMarkdown, lessonEngine) são REUTILIZADOS — não reescritos. A lógica pura
 * do encadeamento mora em src/lib/answerFlow.ts. Preserva o
 * `data-onboarding-target="lesson-subject"` e NÃO introduz gamificação (XP/streak).
 */
import ReactMarkdown from 'react-markdown';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
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
  applyResearchEvent,
  createResearchChecklist,
  markResearchErrored,
  markResearchResolved,
  researchPhaseErrorKey,
  type ResearchChecklistState,
} from '../../lib/researchProgress';
import ResearchChecklist from './ResearchChecklist';
import { lessonPhaseIndex, LESSON_PHASE_ORDER } from '../../lib/lessonPhaseLabels';
import { parseLessonResult, type ParsedLesson } from '../../lib/lessonParse';
import { validateSubject } from '../../lib/validate';
import { consumePendingSubject } from '../../lib/pendingSubject';
import { katexRemarkPlugins, katexRehypePlugins, escapeLoneDollarSigns } from '../../lib/lessonMarkdown';
import { canAdvance, nextAfterAnswer, newLessonActionLabel } from '../../lib/answerFlow';
import {
  summarizeLessonToShort,
  extractQuestion,
  buildLessonLesson,
  ensureSubjectSlug,
  type LessonCandidate,
} from '../../../electron/main/domain/lessonEngine';

type GenerateStatus = 'idle' | 'running' | 'done' | 'error';

/** Fonte (finding) da aula — item de List com Link. */
function SourceList({ findings }: { findings: StudyFinding[] }): ReactElement {
  const { t } = useTranslation();
  if (findings.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        {t('translation:lesson.sourcesEmpty')}
      </Typography>
    );
  }
  return (
    <List dense disablePadding>
      {findings.map((f, i) => (
        <ListItem key={`${f.url}-${i}`} disableGutters>
          <ListItemText
            primary={
              <Box>
                <Link href={f.url} target="_blank" rel="noreferrer noopener" underline="hover">
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
  const { t } = useTranslation();
  const { selectedChallenge, selectChallenge, navigateToChallenge } = useChallengeNav();
  const challenges = parsed.lesson?.challenges ?? [];

  const openChallenge = (c: ChallengeInfo): void => {
    selectChallenge(c);
    navigateToChallenge();
  };

  return (
    <Box component="section">
      <Typography variant="h6" component="h3" gutterBottom>
        {t('translation:lesson.challenges')}
      </Typography>
      {challenges.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t('translation:lesson.challengesEmpty')}
        </Typography>
      ) : (
        <Grid container spacing={1} sx={{ width: '100%' }}>
          {challenges.map((c) => {
            const selected = selectedChallenge?.challengeId === c.challengeId;
            return (
              <Grid key={c.challengeId} size={{ xs: 12, sm: 6, md: 4 }}>
                <Card variant={selected ? 'elevation' : 'outlined'} sx={{ height: '100%' }}>
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
                        {t('translation:lesson.open')}
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
          <strong>{t('translation:lesson.warning')}</strong>{' '}
          {rejected.length} desafio(s) rejeitado(s) na geração.
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

/** Sessão do corpo curto da aula + input de resposta (onda 3). */
function AnswerSection({
  body,
  prompt,
  onAnswer,
  disabled,
}: {
  body: string;
  prompt: string;
  onAnswer: (text: string) => void;
  disabled: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const valid = canAdvance(draft);
  const submit = (): void => {
    if (!valid || disabled) return;
    onAnswer(draft.trim());
    setDraft('');
  };
  return (
    <Box component="section" sx={{ mt: 2 }}>
      <Box
        sx={{
          p: { xs: 1.5, md: 2 },
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
        }}
        data-onboarding-target="lesson-short-body"
      >
        <ReactMarkdown
          remarkPlugins={katexRemarkPlugins()}
          rehypePlugins={katexRehypePlugins()}
          components={MarkdownComponents()}
        >
          {escapeLoneDollarSigns(body)}
        </ReactMarkdown>
      </Box>
      <TextField
        label={t('translation:lesson.answerLabel')}
        placeholder={prompt}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={disabled}
        fullWidth
        multiline
        minRows={2}
        variant="outlined"
        sx={{ mt: 1.5 }}
        slotProps={{ htmlInput: { 'data-onboarding-target': 'lesson-answer-input' } }}
      />
      <Button
        variant="contained"
        disabled={!valid || disabled}
        onClick={submit}
        sx={{ mt: 1 }}
        data-onboarding-target="lesson-answer-submit"
      >
        {t('translation:lesson.answerSubmit')}
      </Button>
    </Box>
  );
}

export default function LessonView(): ReactElement {
  const { t } = useTranslation();
  // Interpolação ({{var}}): mesmo escape aprovado do ChallengeView (cast tI).
  // Memoizado sobre `t` (estável entre renders) para onProgress não re-assinar
  // o canal a cada render.
  const tI = useMemo(
    () => t as unknown as (key: string, options?: Record<string, string | number>) => string,
    [t],
  );
  const { setLastSetupRoot } = useChallengeNav();
  // fix17c ACHADO-1/3: pré-preenche o assunto vindo da Home (chips).
  const pendingRef = useRef<string | null | undefined>(undefined);
  if (pendingRef.current === undefined) {
    pendingRef.current = consumePendingSubject();
  }
  const [subject, setSubject] = useState<string>(pendingRef.current ?? '');
  const [status, setStatus] = useState<GenerateStatus>('idle');
  const [phase, setPhase] = useState<LessonPhaseState>({
    phase: 'gerando',
    fraction: 0,
    message: '',
    done: false,
    failed: false,
  });
  const [parsed, setParsed] = useState<ParsedLesson | null>(null);
  const [error, setError] = useState('');
  // ── Checklist de pesquisa AO VIVO (onda3-pesquisa-checklist-ui) ─────────────
  // Máquina pura em src/lib/researchProgress.ts. No modo E2E nenhum evento
  // `research:*` chega (emit do stub é no-op): sem `research:plan` o checklist
  // fica invisível (retrocompat) e a barra de fases continua soberana; a máquina
  // fecha SEMPRE no resolve/rejeição da generateLesson (markResolved/Errored).
  const [research, setResearch] = useState<ResearchChecklistState>(createResearchChecklist);
  // Código do último erro de fase (lesson-progress phase:'error' com code?) —
  // lido na rejeição da generateLesson para a mensagem i18n clara de chave Brave.
  const phaseCodeRef = useRef<string | undefined>(undefined);

  // ── Fluxo encadeado (onda 3) ────────────────────────────────────────────────
  // Estado local DEFENSIVO: como recordAnswer/listLessons ainda não são expostos
  // no ApiSchema, mantemos por assunto uma lista local de LessonCandidate com id
  // sintetizado + um map de bodies.
  const [lessonList, setLessonList] = useState<LessonCandidate[]>([]);
  const [lessonBodies, setLessonBodies] = useState<Record<string, string>>({});
  const [currentLessonId, setCurrentLessonId] = useState<string | null>(null);
  const [currentBody, setCurrentBody] = useState('');
  const [currentPrompt, setCurrentPrompt] = useState('');

  /** Persistência defensiva via IPC (fallback = marca só localmente). */
  const tryPersist = useCallback(
    async (lessonId: string, answerText: string): Promise<void> => {
      const study = getApi().study as unknown as Record<string, unknown>;
      try {
        const record = study.recordAnswer;
        if (typeof record === 'function') {
          await (record as (id: string, text: string) => Promise<unknown>)(
            lessonId,
            answerText,
          );
        }
        const mark = study.markLessonCompleted;
        if (typeof mark === 'function') {
          await (mark as (id: string) => Promise<unknown>)(lessonId);
        }
      } catch {
        // IPC ainda não disponível/exposto — segue localmente. Nunca quebra a UI.
      }
    },
    [],
  );

  /** Registra UMA aula gerada/resumida na lista local + seleciona como atual. */
  const registerLesson = useCallback(
    (lesson: ParsedLesson['lesson'], sourceSubject: string): void => {
      if (!lesson) return;
      const short = summarizeLessonToShort(lesson.markdown);
      const question = extractQuestion(lesson);
      const presentation = buildLessonLesson(short.shortBody, question);
      const id = `local-${ensureSubjectSlug(lesson.subject || sourceSubject)}-${Date.now().toString(36)}`;
      const candidate: LessonCandidate = {
        id,
        title: lesson.title,
        difficulty: 1,
        completedAt: null,
      };
      setLessonList((prev) => [...prev, candidate]);
      setLessonBodies((prev) => ({ ...prev, [id]: presentation.body }));
      setCurrentLessonId(id);
      setCurrentBody(presentation.body);
      setCurrentPrompt(presentation.prompt);
      setParsed({ ok: true, lesson, rejected: [] });
    },
    [],
  );

  const onProgress = useCallback(
    (raw: unknown) => {
      const next = parseLessonProgressEvent(raw);
      if (next.failed) {
        // Erro de fase com code de chave Brave (BRAVE_KEY_MISSING/INVALID) →
        // mensagem i18n clara ("a chave Brave é obrigatória"); demais erros
        // mantêm a mensagem crua do main.
        const phaseKey = researchPhaseErrorKey(next.code);
        phaseCodeRef.current = next.code;
        setPhase((prev) => ({
          ...prev,
          failed: true,
          message: phaseKey ? tI(phaseKey) : next.message,
          code: next.code,
        }));
      } else {
        setPhase(next);
      }
      setStatus((s) => (s === 'idle' ? 'running' : s));
      const rec = raw as { setupRoot?: unknown };
      if (rec && typeof rec.setupRoot === 'string' && rec.setupRoot.trim()) {
        setLastSetupRoot(rec.setupRoot.trim());
      }
    },
    [setLastSetupRoot, tI],
  );

  useLessonProgress(onProgress);

  // Canal NOVO `study:research-progress` (aditivo ao contrato congelado):
  // alimenta a máquina do checklist ao vivo. Mesmo padrão do onTestAnswerEvent
  // da ChallengeView — unsubscribe no unmount, nunca quebra se a API faltar.
  useEffect(() => {
    const api = getApi();
    let stop: (() => void) | undefined;
    try {
      stop = api.study.onResearchProgress((ev) => {
        setResearch((s) => applyResearchEvent(s, ev));
      });
    } catch {
      stop = undefined;
    }
    return () => stop?.();
  }, []);

  /** Gera UMA aula nova a partir do assunto digitado. */
  const generateNew = async (): Promise<void> => {
    const check = validateSubject(subject);
    if (!check.ok) {
      setError(check.message ?? t('translation:lesson.invalidSubject'));
      setStatus('error');
      return;
    }
    setError('');
    setParsed(null);
    setStatus('running');
    setPhase({
      phase: 'gerando',
      fraction: 0,
      message: t('translation:lesson.starting'),
      done: false,
      failed: false,
    });
    // Reinicia o checklist da pesquisa ao vivo (e o código de erro de fase).
    setResearch(createResearchChecklist());
    phaseCodeRef.current = undefined;
    setLastSetupRoot(null);
    try {
      const typed = getApi().study.generateLesson as (s: string) => Promise<unknown>;
      const payload = await typed(subject.trim());
      const result = parseLessonResult(payload);
      if (!result.ok) {
        // Erro de fase com code de chave Brave → mensagem i18n clara.
        const phaseKey = researchPhaseErrorKey(phaseCodeRef.current);
        setResearch((s) => markResearchErrored(s));
        setError(phaseKey ? tI(phaseKey) : (result.error ?? t('translation:lesson.failGenerate')));
        setStatus('error');
        return;
      }
      registerLesson(result.lesson, subject);
      setPhase((prev) => ({ ...prev, phase: 'concluindo', done: true }));
      // Término OBRIGATÓRIO: no modo E2E nenhum `research:done` chega (emit do
      // stub é no-op) — sem isso o spinner do checklist travaria.
      setResearch((s) => markResearchResolved(s));
      setStatus('done');
    } catch (err) {
      const phaseKey = researchPhaseErrorKey(phaseCodeRef.current);
      setResearch((s) => markResearchErrored(s));
      setError(
        phaseKey
          ? tI(phaseKey)
          : `${t('translation:lesson.errorGenerate')}: ${String(err)}`,
      );
      setStatus('error');
    }
  };

  /** Carrega uma aula pendente existente (fluxo "Continuar"). */
  const continueTo = (lessonId: string): void => {
    const body = lessonBodies[lessonId] ?? '';
    const prompt = buildLessonLesson(body).prompt;
    setCurrentLessonId(lessonId);
    setCurrentBody(body);
    setCurrentPrompt(body ? prompt : '');
    setParsed(null);
    setStatus('done');
    setError('');
  };

  /** Resposta do aluno: marca concluída, persiste defensivo e encadeia. */
  const submitAnswer = async (answerText: string): Promise<void> => {
    if (!answerText || !currentLessonId) return;
    // 1) Marca localmente como concluída.
    setLessonList((prev) =>
      prev.map((c) =>
        c.id === currentLessonId ? { ...c, completedAt: new Date().toISOString() } : c,
      ),
    );
    // 2) Persiste via IPC de forma DEFENSIVA (fallback = só local).
    await tryPersist(currentLessonId, answerText);
    // 3) Encadeia: decide a próxima aula do mesmo assunto.
    const outcome = nextAfterAnswer({ lessons: lessonList, answerText });
    if (outcome.nextLessonId && lessonBodies[outcome.nextLessonId]) {
      continueTo(outcome.nextLessonId);
    } else {
      // Sem próxima (ou sem body local) → volta ao "Gerar nova aula".
      setCurrentLessonId(null);
      setCurrentBody('');
      setCurrentPrompt('');
      setParsed(null);
      setStatus('idle');
      setError('');
    }
  };

  const running = status === 'running';
  const activeStep = Math.max(0, lessonPhaseIndex(phase.phase));
  const phaseReached = phase.phase !== 'gerando' || phase.failed;
  // "Continuar" quando há aula pendente no assunto atual; caso contrário "Gerar nova aula".
  const hasPendingLesson = lessonList.some((c) => c.completedAt == null);
  const primaryLabelKey = newLessonActionLabel(hasPendingLesson);

  const onPrimary = (): void => {
    if (hasPendingLesson) {
      // "Continuar": carrega a próxima aula pendente do assunto.
      const pending = lessonList.find((c) => c.completedAt == null);
      if (pending) {
        continueTo(pending.id);
        return;
      }
    }
    // "Gerar nova aula": gera uma aula nova.
    void generateNew();
  };

  return (
    <Box
      component="section"
      sx={{ p: { xs: 1, md: 2 }, maxWidth: 960, mx: 'auto' }}
      data-onboarding-signal={`lesson-status:${status}`}
    >
      <Typography variant="h4" component="h1" gutterBottom>
        {t('translation:nav.lesson')}
      </Typography>

      {/* Entrada do assunto + ação primária (gerar nova / continuar) */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TextField
          label={t('translation:lesson.subjectLabel')}
          placeholder={t('translation:lesson.subjectPlaceholder')}
          helperText={t('translation:lesson.subjectHelper')}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          disabled={running}
          fullWidth
          variant="outlined"
          slotProps={{ htmlInput: { 'data-onboarding-target': 'lesson-subject' } }}
        />
        <Button
          variant="contained"
          disabled={running}
          loading={running}
          onClick={onPrimary}
          sx={{
            alignSelf: { xs: 'stretch', sm: 'flex-start' },
            minWidth: { xs: '100%', sm: 160 },
            height: { xs: 'auto', sm: 56 },
            whiteSpace: 'nowrap',
          }}
        >
          {t(`translation:${primaryLabelKey}`)}
        </Button>
      </Stack>

      {/* Progresso das fases (só durante a geração) */}
      {running || status === 'done' || (status === 'error' && phaseReached) ? (
        <Box sx={{ mt: 2 }} role="status" aria-live="polite">
          <Stepper activeStep={activeStep} alternativeLabel>
            {LESSON_PHASE_ORDER.map((labelKey, i) => (
              <Step key={labelKey}>
                <StepLabel error={phase.failed && i === activeStep}>
                  {t(`translation:${labelKey}`)}
                </StepLabel>
              </Step>
            ))}
          </Stepper>
          <LinearProgress
            variant={phase.fraction > 0 ? 'determinate' : 'indeterminate'}
            value={Math.round(phase.fraction * 100)}
            aria-label={t('translation:lesson.generate')}
            sx={{ mt: 1 }}
          />
          {(running || phase.failed) && phase.message ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {phase.message}
            </Typography>
          ) : null}
          {/* Checklist de pesquisa AO VIVO (aditivo na fase research — não toca
              no stepper de fases acima). Invisível sem research:plan (retrocompat
              / E2E); congela (terminal) no research:done ou no resolve/erro da
              generateLesson. */}
          <ResearchChecklist state={research} />
        </Box>
      ) : null}

      {error ? (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      ) : null}

      {/* Aula curta + input de resposta (onda 3) */}
      {currentBody && currentLessonId && status !== 'running' ? (
        <Paper variant="outlined" sx={{ mt: 2, p: { xs: 1.5, md: 2 } }}>
          <Typography variant="h5" component="h2">
            {lessonList.find((c) => c.id === currentLessonId)?.title ?? ''}
          </Typography>
          {subject ? (
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {`${t('translation:lesson.subjectLabel')}: ${subject}`}
            </Typography>
          ) : null}
          <AnswerSection
            body={currentBody}
            prompt={currentPrompt}
            onAnswer={(text) => void submitAnswer(text)}
            disabled={running}
          />
          {parsed?.lesson ? (
            <Box sx={{ mt: 2 }}>
              <ChallengesSection parsed={parsed} rejected={parsed.rejected} />
            </Box>
          ) : null}
          {parsed?.lesson && parsed.lesson.findings.length > 0 ? (
            <Box component="section" sx={{ mt: 2 }}>
              <Typography variant="h6" component="h3" gutterBottom>
                {t('translation:lesson.sources')}
              </Typography>
              <SourceList findings={parsed.lesson.findings} />
            </Box>
          ) : null}
        </Paper>
      ) : null}

      {!currentBody && parsed?.lesson && status === 'done' ? (
        <Paper variant="outlined" sx={{ mt: 2, p: { xs: 1.5, md: 2 } }}>
          <Typography variant="h5" component="h2">
            {parsed.lesson.title}
          </Typography>
          <Box sx={{ mt: 1 }}>
            <ReactMarkdown
              remarkPlugins={katexRemarkPlugins()}
              rehypePlugins={katexRehypePlugins()}
              components={MarkdownComponents()}
            >
              {escapeLoneDollarSigns(parsed.lesson.markdown)}
            </ReactMarkdown>
          </Box>
        </Paper>
      ) : null}
    </Box>
  );
}
