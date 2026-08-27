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
 *     Ao responder não-vazio (`canAdvance`), a resposta é AVALIADA pelo ramo da
 *     aula (onda 5): exercício de matemática por execução (checkMathAnswer) ou
 *     interpretação com LLM (judge-answer). O veredito é o ponto terminal —
 *     'correct' marca a aula como concluída (localmente) e TENTA persistir via
 *     IPC de forma DEFENSIVA (`recordAnswer`/`markLessonCompleted`; fallback =
 *     registro local); 'partial'/'incorrect' deixam veredito + feedback visíveis
 *     com o escape "Avançar mesmo assim". O avanço para a próxima aula é do
 *     botão primário ("Continuar" / "Gerar nova aula").
 *
 * Os engines/parsers (lessonParse, lessonProgress, lessonPhaseLabels,
 * lessonMarkdown, lessonEngine) são REUTILIZADOS — não reescritos. A lógica pura
 * do encadeamento mora em src/lib/answerFlow.ts. Preserva o
 * `data-onboarding-target="lesson-subject"` e NÃO introduz gamificação (XP/streak).
 *
 * ONDA 5 (respostas digitadas + sessão global):
 *  - DRAIN EMPARELHADO na montagem: subject E domain (Home) + pendingLessonId
 *    (Trilha) são consumidos JUNTOS (refs); o domínio entra no payload do
 *    generate-lesson como {subject, domain} (o backend normaliza ambos);
 *  - ABRIR LIÇÃO POR ID: com pendingLessonId, a montagem chama getLessonById e
 *    abre a lição persistida (ids reais p/ recordAnswer/judge-answer); falha →
 *    degrade para o fluxo atual (assunto → gerar);
 *  - RAMO MATEMÁTICA (lesson.exercise kind 'math'): verificação POR EXECUÇÃO
 *    (checkMathAnswer, SEM LLM); o esperado só aparece após a 1ª tentativa
 *    errada; cada resposta grava UMA tentativa (mark-challenge-attempt);
 *  - RAMO INTERPRETAÇÃO (sem exercise): judge-answer (LLM) com veredito +
 *    feedback visíveis; ok:false → erro de serviço sem veredito inventado;
 *  - REGRA DE AVANÇO (decidida e documentada na onda 5): o veredito é o ponto
 *    TERMINAL da resposta — 'correct' marca a aula como CONCLUÍDA (local +
 *    persistência) e o veredito permanece VISÍVEL; 'partial'/'incorrect'
 *    deixam o veredito + feedback visíveis com o escape explícito "Avançar
 *    mesmo assim" (mesmo caminho do correto, persistindo a última resposta).
 *    O AVANÇO para a próxima aula é SEMPRE do botão primário ("Continuar" /
 *    "Gerar nova aula") — o usuário nunca fica travado nem perde o veredito
 *    num encadeamento automático;
 *  - SESSÃO GLOBAL: a LessonView é a ÚNICA publicadora do SessionStateProvider
 *    (ciclo GERANDO → PRONTA → RESPONDIDA) — o quadro do shell e a Home leem.
 *  - GUARDA DE IDENTIDADE (fix): cada generateNew recebe um token de geração
 *    ÚNICO POR PROCESSO (src/lib/lessonGenerationGuard.ts — contador de
 *    MÓDULO; um ref da view zeraria a cada montagem e a geração antiga
 *    "acertaria" o token da instância nova). TODO continuamento assíncrono —
 *    resolve/rejeição da geração, registerLesson, abertura da lição
 *    persistida, eventos de progresso, setError, publicações de sessão —
 *    verifica o token capturado no início: morto → descarta em silêncio
 *    (nunca publica estado de uma geração antiga na sessão VIVA).
 *    markLessonDoneAndPersist publica o subject da lição EM TELA (não omite);
 *    openPersistedLesson/continueTo fixam a fase terminal ('concluindo' +
 *    fraction 1) — o stepper nunca fica preso em "Pesquisando" com a aula
 *    aberta.
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
import type {
  ChallengeInfo,
  GetLessonByIdResult,
  LessonExercise,
  StudyFinding,
} from '../../../shared/ipc-contract';
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
import {
  consumePendingSubject,
  drainPendingDomain,
  drainPendingLessonId,
  type PendingDomain,
} from '../../lib/pendingSubject';
import {
  currentGenerationToken,
  invalidateGenerations,
  isStaleToken,
  nextGenerationToken,
} from '../../lib/lessonGenerationGuard';
import { useSessionState } from '../../lib/sessionState';
import { katexRemarkPlugins, katexRehypePlugins, escapeLoneDollarSigns } from '../../lib/lessonMarkdown';
import {
  canAdvance,
  canAdvanceAfterVerdict,
  interpretationVerdictI18nKey,
  newLessonActionLabel,
  presentMathCheckResult,
  type InterpretationVerdict,
  type MathCheckPresentation,
} from '../../lib/answerFlow';
import {
  summarizeLessonToShort,
  extractQuestion,
  buildLessonLesson,
  ensureSubjectSlug,
  type LessonCandidate,
} from '../../../electron/main/domain/lessonEngine';

type GenerateStatus = 'idle' | 'running' | 'done' | 'error';

/**
 * ONDA5-FIX: fase TERMINAL quando a aula está pronta/aberta — o MESMO valor
 * que o fim da geração publica (registerLesson/generateNew: 'concluindo' +
 * fraction 1). Usada pelo openPersistedLesson e pelo continueTo: sem ela o
 * stepper ficava preso em "Pesquisando" com barra INDETERMINADA abaixo da
 * aula aberta (bug reproduzido).
 */
const LESSON_READY_PHASE: LessonPhaseState = {
  phase: 'concluindo',
  fraction: 1,
  message: '',
  done: true,
  failed: false,
};

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

/** Sessão do corpo curto da aula + input de resposta (onda 3 + onda 5). */
function AnswerSection({
  body,
  prompt,
  onAnswer,
  disabled,
  exercisePrompt,
  feedback,
  advanceAnyway,
}: {
  body: string;
  prompt: string;
  onAnswer: (text: string) => void;
  disabled: boolean;
  /**
   * ONDA5 (ramo MATEMÁTICA): enunciado do exercício (`LessonExercise.prompt`).
   * Quando presente, o input passa a ser a resposta do exercício (verificação
   * por execução, SEM LLM). O corpo curto da aula continua renderizado acima.
   */
  exercisePrompt?: string;
  /**
   * ONDA5: veredito/erro do ramo respondido (Alert pronto para render) —
   * exibido ABAIXO do input, NUNCA no Box de progresso (o checklist/stepper
   * continua intacto; os data-onboarding-targets são preservados).
   */
  feedback?: ReactNode;
  /**
   * ONDA5: escape explícito pós-veredito parcial/incorreto ("Avançar mesmo
   * assim") — o fluxo nunca trava o usuário indefinidamente.
   */
  advanceAnyway?: ReactNode;
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
      {exercisePrompt ? (
        <Box
          sx={{
            p: { xs: 1.5, md: 2 },
            mt: 1,
            bgcolor: 'action.hover',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
          }}
          data-onboarding-target="lesson-exercise-prompt"
        >
          <Typography variant="subtitle2" gutterBottom>
            {t('translation:lesson.math.instruction')}
          </Typography>
          <Typography variant="body1">{exercisePrompt}</Typography>
        </Box>
      ) : null}
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
      {feedback}
      {advanceAnyway}
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
  // Sessão GLOBAL (quadro superior + Home): a LessonView é a ÚNICA publicadora
  // (ver src/lib/sessionState.ts — o wiring era "trabalho futuro" até a onda 5).
  const { publishSession } = useSessionState();
  // fix17c ACHADO-1/3: pré-preenche o assunto vindo da Home (chips).
  // ONDA5 DRAIN EMPARELHADO: subject E domain são consumidos JUNTOS na MONTAGEM
  // (não no generateNew) — assim o domain pendente da Home pertence ao assunto
  // da mesma navegação; drenar no generateNew colaria um domain stale num
  // subject digitado depois de uma falha. O valor drenado vive numa ref.
  // ONDA5 id: `pendingLessonId` (Trilha → Aula) é drenado aqui e aberto por
  // `study.getLessonById` no efeito de montagem (ver openPersistedLesson).
  const pendingRef = useRef<string | null | undefined>(undefined);
  const pendingDomainRef = useRef<PendingDomain | null | undefined>(undefined);
  const pendingLessonIdRef = useRef<string | null | undefined>(undefined);
  if (pendingRef.current === undefined) {
    pendingRef.current = consumePendingSubject();
    pendingDomainRef.current = drainPendingDomain();
    pendingLessonIdRef.current = drainPendingLessonId();
  }
  // Assunto no MOMENTO DA MONTAGEM (a abertura por id usa o preenchimento da
  // navegação — Trilha/Home — não o que o usuário digitar depois).
  const subjectAtMountRef = useRef(pendingRef.current ?? '');
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
  // ONDA5-FIX (guarda de identidade de geração): token da geração EM CURSO
  // DESTA instância (0 = nenhuma). O token em si vem do contador de MÓDULO
  // (lessonGenerationGuard) — nunca de um ref, que zeraria a cada montagem e
  // deixaria a geração antiga "acertar" o token da instância nova.
  const generationRef = useRef<number>(0);

  // ── Fluxo encadeado (onda 3 + onda 5) ───────────────────────────────────────
  // Estado local DEFENSIVO: como recordAnswer/listLessons ainda não são expostos
  // no ApiSchema, mantemos por assunto uma lista local de LessonCandidate com id
  // sintetizado + um map de bodies. ONDA5: o id do candidato passa a ser o id
  // REAL (lessonId) quando a geração persistiu — recordAnswer/markLessonCompleted
  // usam o id verdadeiro (fallback = o sintético de sempre).
  const [lessonList, setLessonList] = useState<LessonCandidate[]>([]);
  const [lessonBodies, setLessonBodies] = useState<Record<string, string>>({});
  // ONDA5: metadados da aula POR ID (exercício de math + assunto + subjectId) —
  // o encadeamento local (continueTo) precisa deles para renderizar o ramo
  // certo e marcar tentativas de math com os ids reais.
  const [lessonMeta, setLessonMeta] = useState<
    Record<string, { subject: string; subjectId: string | null; exercise: LessonExercise | null }>
  >({});
  const [currentLessonId, setCurrentLessonId] = useState<string | null>(null);
  const [currentBody, setCurrentBody] = useState('');
  const [currentPrompt, setCurrentPrompt] = useState('');
  // Metadados da aula ATUAL (derivados de lessonMeta na seleção).
  const [currentExercise, setCurrentExercise] = useState<LessonExercise | null>(null);
  const [currentSubject, setCurrentSubject] = useState<string>('');
  const [currentSubjectId, setCurrentSubjectId] = useState<string | null>(null);

  // ── Verdictos do ramo respondido (onda 5) ───────────────────────────────────
  // Interpretação: veredito do judge-answer (LLM) + feedback pt-BR + erro de
  // serviço estruturado (ok:false — NUNCA inventa veredito).
  const [interpretationVerdict, setInterpretationVerdict] = useState<InterpretationVerdict | null>(null);
  const [interpretationFeedback, setInterpretationFeedback] = useState('');
  const [judgeError, setJudgeError] = useState('');
  const [judging, setJudging] = useState(false);
  // Matemática: apresentação do checkMathAnswer (por execução, SEM LLM).
  const [mathFeedback, setMathFeedback] = useState<MathCheckPresentation | null>(null);
  const [checking, setChecking] = useState(false);
  // Última resposta enviada (para o "Avançar mesmo assim" persistir a mesma).
  const lastAnswerRef = useRef('');

  /** Zera os vereditos do ramo respondido ao trocar de aula. */
  const resetAnswerStates = useCallback((): void => {
    setInterpretationVerdict(null);
    setInterpretationFeedback('');
    setJudgeError('');
    setMathFeedback(null);
    setChecking(false);
    setJudging(false);
    lastAnswerRef.current = '';
  }, []);

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

  /**
   * Registra UMA aula gerada/resumida na lista local + seleciona como atual.
   * ONDA5-FIX: recebe o token de identidade da geração que a produziu e o
   * verifica — uma geração morta (supersedida por outra, ou de uma instância
   * anterior após a troca de aba) NUNCA registra aula nem publica sessão.
   */
  const registerLesson = useCallback(
    (lesson: ParsedLesson['lesson'], sourceSubject: string, generationToken?: number): void => {
      if (generationToken !== undefined && isStaleToken(currentGenerationToken(), generationToken)) {
        return;
      }
      if (!lesson) return;
      const short = summarizeLessonToShort(lesson.markdown);
      const question = extractQuestion(lesson);
      const presentation = buildLessonLesson(short.shortBody, question);
      // ONDA5: id REAL quando a geração persistiu (lessonId) — recordAnswer/
      // markLessonCompleted/judge-answer usam o id verdadeiro; sem repo, o id
      // sintético local de sempre (fallback defensivo).
      const id =
        lesson.lessonId ??
        `local-${ensureSubjectSlug(lesson.subject || sourceSubject)}-${Date.now().toString(36)}`;
      const lessonSubject = lesson.subject || sourceSubject;
      const candidate: LessonCandidate = {
        id,
        title: lesson.title,
        difficulty: 1,
        completedAt: null,
      };
      setLessonList((prev) => [...prev, candidate]);
      setLessonBodies((prev) => ({ ...prev, [id]: presentation.body }));
      setLessonMeta((prev) => ({
        ...prev,
        [id]: {
          subject: lessonSubject,
          subjectId: lesson.subjectId ?? null,
          exercise: lesson.exercise ?? null,
        },
      }));
      setCurrentLessonId(id);
      setCurrentBody(presentation.body);
      setCurrentPrompt(presentation.prompt);
      setCurrentSubject(lessonSubject);
      setCurrentSubjectId(lesson.subjectId ?? null);
      setCurrentExercise(lesson.exercise ?? null);
      resetAnswerStates();
      setParsed({ ok: true, lesson, rejected: [] });
      // Sessão: aula PRONTA (fase concluindo + done — o quadro da Home lê).
      publishSession({ subject: lessonSubject, status: 'done', phase: 'concluindo', fraction: 1 });
    },
    [publishSession, resetAnswerStates],
  );

  /**
   * ONDA5 — abre uma lição PERSISTIDA por id (Trilha → Aula). `GetLessonByIdResult`
   * carrega o body completo + exercise (parse de exercise_json) + domain. O
   * candidato entra na lista local (encadeamento "Continuar" segue funcionando)
   * e o id REAL passa a ser usado por recordAnswer/judge-answer.
   */
  const openPersistedLesson = useCallback(
    (res: GetLessonByIdResult): void => {
      const lesson = res.lesson;
      if (!lesson) return;
      const short = summarizeLessonToShort(lesson.body);
      const question = extractQuestion(lesson.body);
      const presentation = buildLessonLesson(short.shortBody, question);
      const id = lesson.id;
      // Subject da lição persistida: a LessonRow não traz o nome do assunto —
      // usamos o assunto pré-preenchido na montagem (Trilha grava o TÍTULO da
      // lição via setPendingSubject) com o título como fallback.
      const lessonSubject = subjectAtMountRef.current || lesson.title;
      const candidate: LessonCandidate = {
        id,
        title: lesson.title,
        difficulty: typeof lesson.difficulty === 'number' && lesson.difficulty >= 1
          ? lesson.difficulty
          : 1,
        completedAt: lesson.completed_at,
      };
      setLessonList((prev) => [...prev.filter((c) => c.id !== id), candidate]);
      setLessonBodies((prev) => ({ ...prev, [id]: presentation.body }));
      setLessonMeta((prev) => ({
        ...prev,
        [id]: { subject: lessonSubject, subjectId: lesson.subject_id, exercise: lesson.exercise ?? null },
      }));
      setCurrentLessonId(id);
      setCurrentBody(presentation.body);
      setCurrentPrompt(presentation.prompt);
      setCurrentSubject(lessonSubject);
      setCurrentSubjectId(lesson.subject_id);
      setCurrentExercise(lesson.exercise ?? null);
      resetAnswerStates();
      setParsed(null);
      setStatus('done');
      // ONDA5-FIX: fase TERMINAL junto com o status — sem ela o stepper ficava
      // preso em "Pesquisando" (default 'gerando'/fraction 0) com barra
      // indeterminada abaixo da aula aberta.
      setPhase(LESSON_READY_PHASE);
      setError('');
      // Sessão: aula PRONTA (a trilha abriu uma aula concluída → 'concluindo').
      publishSession({ subject: lessonSubject, status: 'done', phase: 'concluindo', fraction: 1 });
    },
    [publishSession, resetAnswerStates],
  );

  // ONDA5-FIX (guarda de identidade): a view (RE)MONTou — toda geração
  // pendente de uma instância anterior é MORTA. Contador de MÓDULO (não ref):
  // refs zerariam a cada montagem e a geração antiga "acertaria" o token da
  // instância nova (o bug da troca de aba). Roda ANTES do efeito de abertura
  // da lição persistida capturar o token.
  useEffect(() => {
    invalidateGenerations();
  }, []);

  // ONDA5: abre a lição pendente da Trilha (pendingLessonId) na montagem. Se a
  // abertura falhar ou a lição não existir (ex.: apagada), DEGRADA para o
  // comportamento atual: o assunto pré-preenchido fica no campo e o usuário
  // gera a aula normalmente (fluxo da onda 3).
  useEffect(() => {
    const lessonId = pendingLessonIdRef.current;
    if (!lessonId) return;
    let cancelled = false;
    // ONDA5-FIX: token capturado na montagem — se uma geração nova (ou outra
    // montagem) acontecer antes do getLessonById resolver, a lição persistida
    // antiga NÃO pode sobrepor a aula em tela (descartada em silêncio).
    const tokenAtMount = currentGenerationToken();
    getApi()
      .study.getLessonById(lessonId)
      .then((res) => {
        if (cancelled) return;
        if (isStaleToken(currentGenerationToken(), tokenAtMount)) return;
        if (res?.lesson) openPersistedLesson(res);
      })
      .catch(() => {
        // Degrade silencioso: sem lição → fluxo atual (assunto → gerar).
      });
    return () => {
      cancelled = true;
    };
  }, [openPersistedLesson]);

  const onProgress = useCallback(
    (raw: unknown) => {
      // ONDA5-FIX: eventos de progresso só são aceitos com uma geração DESTA
      // instância EM CURSO (generationRef é zerado no fim da geração e nasce 0
      // na montagem). Eventos tardios do canal GLOBAL — de uma geração de
      // outra instância (troca de aba) ou de uma geração já encerrada — são
      // descartados: nunca tocam fase/status/sessão da geração viva.
      if (generationRef.current === 0) return;
      const next = parseLessonProgressEvent(raw);
      // Sessão: fase/fração do progresso (o reducer é identidade-preservante —
      // repetir a mesma fase 20x não re-renderiza nem move o carimbo).
      publishSession({ phase: next.phase, fraction: next.fraction });
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
        publishSession({ status: 'error' });
      } else {
        setPhase(next);
      }
      setStatus((s) => (s === 'idle' ? 'running' : s));
      const rec = raw as { setupRoot?: unknown };
      if (rec && typeof rec.setupRoot === 'string' && rec.setupRoot.trim()) {
        setLastSetupRoot(rec.setupRoot.trim());
      }
    },
    [publishSession, setLastSetupRoot, tI],
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
      publishSession({ status: 'error' });
      return;
    }
    // ONDA5-FIX: token de identidade desta geração — ÚNICO POR PROCESSO (o
    // contador é de MÓDULO, lessonGenerationGuard: um ref zeraria a cada
    // montagem e a geração antiga "acertaria" o token da instância nova).
    // Todo continuamento assíncrono abaixo compara o token capturado com o
    // atual; geração morta → descarta em silêncio (nada de publishSession,
    // nada de estado, nada de error).
    const token = nextGenerationToken();
    generationRef.current = token;
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
    resetAnswerStates();
    // Reinicia o checklist da pesquisa ao vivo (e o código de erro de fase).
    setResearch(createResearchChecklist());
    phaseCodeRef.current = undefined;
    setLastSetupRoot(null);
    // Sessão: CICLO GERANDO → PRONTA → RESPONDIDA começa aqui (subject +
    // running; a fase vem pelos eventos de progresso).
    publishSession({ subject: subject.trim(), status: 'running' });
    try {
      const study = getApi().study;
      // ONDA5: domínio EXPLÍCITO quando a Home/Trilha o preencheu (drenado na
      // MONTAGEM — ver pendingDomainRef). O payload vira {subject, domain} —
      // o backend normaliza ambos; sem domínio, string avulsa (como sempre).
      const domain = pendingDomainRef.current;
      const payload = domain
        ? await (study.generateLesson as (s: { subject: string; domain: PendingDomain }) => Promise<unknown>)({
            subject: subject.trim(),
            domain,
          })
        : await (study.generateLesson as (s: string) => Promise<unknown>)(subject.trim());
      // ONDA5-FIX: geração morta (uma geração nova — ou uma nova montagem da
      // view — aconteceu enquanto o IPC rodava) → descarta TUDO: o resolve de
      // uma geração antiga NUNCA publica estado na sessão viva (o bug:
      // registerLesson publicava {subject: A, status:'done'} depois de B).
      if (isStaleToken(currentGenerationToken(), token)) return;
      const result = parseLessonResult(payload);
      if (!result.ok) {
        // Erro de fase com code de chave Brave → mensagem i18n clara.
        const phaseKey = researchPhaseErrorKey(phaseCodeRef.current);
        setResearch((s) => markResearchErrored(s));
        setError(phaseKey ? tI(phaseKey) : (result.error ?? t('translation:lesson.failGenerate')));
        setStatus('error');
        publishSession({ status: 'error' });
        generationRef.current = 0;
        return;
      }
      registerLesson(result.lesson, subject, token);
      setPhase((prev) => ({ ...prev, phase: 'concluindo', done: true }));
      // Término OBRIGATÓRIO: no modo E2E nenhum `research:done` chega (emit do
      // stub é no-op) — sem isso o spinner do checklist travaria.
      setResearch((s) => markResearchResolved(s));
      setStatus('done');
      // Fim da geração: eventos tardios do canal de progresso passam a ser
      // descartados (o guard do onProgress exige uma geração em curso).
      generationRef.current = 0;
    } catch (err) {
      // ONDA5-FIX: rejeição de uma geração morta NUNCA derruba a sessão da
      // geração viva (o bug: A rejeitar após B terminar levava B para 'error').
      if (isStaleToken(currentGenerationToken(), token)) return;
      const phaseKey = researchPhaseErrorKey(phaseCodeRef.current);
      setResearch((s) => markResearchErrored(s));
      setError(
        phaseKey
          ? tI(phaseKey)
          : `${t('translation:lesson.errorGenerate')}: ${String(err)}`,
      );
      setStatus('error');
      publishSession({ status: 'error' });
      generationRef.current = 0;
    }
  };

  /** Carrega uma aula pendente existente (fluxo "Continuar"). */
  const continueTo = (lessonId: string): void => {
    const body = lessonBodies[lessonId] ?? '';
    const prompt = buildLessonLesson(body).prompt;
    // ONDA5: restaura os metadados da aula (math exercise + assunto) para o
    // ramo certo renderizar — sem meta (aula antiga sem registro), cai no ramo
    // de interpretação (retrocompat).
    const meta = lessonMeta[lessonId];
    setCurrentLessonId(lessonId);
    setCurrentBody(body);
    setCurrentPrompt(body ? prompt : '');
    setCurrentExercise(meta?.exercise ?? null);
    setCurrentSubject(meta?.subject ?? subject);
    setCurrentSubjectId(meta?.subjectId ?? null);
    resetAnswerStates();
    setParsed(null);
    setStatus('done');
    // ONDA5-FIX: fase TERMINAL junto com o status (mesmo valor do fim da
    // geração) — sem ela o stepper ficava preso em "Pesquisando" com a aula
    // aberta (mesma família do bug do openPersistedLesson).
    setPhase(LESSON_READY_PHASE);
    setError('');
    // Sessão: aula PRONTA (continuação — o assunto permanece).
    publishSession({
      ...(subject.trim() ? { subject: subject.trim() } : {}),
      status: 'done',
      phase: 'concluindo',
      fraction: 1,
    });
  };

  /**
   * ONDA5 — REGISTRA a conclusão da aula atual (local + persistência defensiva
   * com id REAL quando a geração persistiu — currentLessonId já o carrega) e
   * publica a sessão como RESPONDIDA. NÃO encadeia automaticamente (a aula
   * permanece visível com o veredito; o avanço é do botão primário — "Continuar"
   * quando há aula pendente, senão "Gerar nova aula"). Veredito correto OU
   * "Avançar mesmo assim" chegam aqui; chamadas repetidas são idempotentes.
   */
  const markLessonDoneAndPersist = useCallback(
    async (answerText: string): Promise<void> => {
      if (!currentLessonId) return;
      // ONDA5-FIX: token da geração em curso no INÍCIO do fluxo — se uma
      // geração nova (ou outra montagem) acontecer durante o persist, a
      // publicação de "respondida" seria de uma aula já substituída → descarta
      // (nunca sobrepõe o status da geração viva).
      const tokenAtStart = generationRef.current;
      const completedAt = new Date().toISOString();
      setLessonList((prev) =>
        prev.map((c) =>
          c.id === currentLessonId ? { ...c, completedAt } : c,
        ),
      );
      await tryPersist(currentLessonId, answerText);
      if (isStaleToken(generationRef.current, tokenAtStart)) return;
      // ONDA5-FIX: publica o subject da lição EM TELA (não omite) — sem isso,
      // um subject errado (vazado por uma geração antiga) ficaria para sempre
      // no quadro da sessão de B (o bug reproduzido: markLessonDoneAndPersist
      // publicava {status:'done'} SEM subject e o subject de A persistia).
      publishSession({
        ...(currentSubject.trim() ? { subject: currentSubject } : {}),
        status: 'done',
      });
    },
    [currentLessonId, currentSubject, publishSession, tryPersist],
  );

  /**
   * ONDA5 — ramo MATEMÁTICA: verificação POR EXECUÇÃO (checkMathAnswer, SEM
   * LLM). Correto → veredito + avanço; errado → revela o esperado (pedagogia:
   * a solução aparece SÓ após a 1ª tentativa errada); malformado → mensagem de
   * formato. Cada resposta registra UMA tentativa (passed/failed).
   */
  const submitMathAnswer = async (answerText: string): Promise<void> => {
    const exercise = currentExercise;
    if (!exercise) return;
    lastAnswerRef.current = answerText;
    setChecking(true);
    setMathFeedback(null);
    try {
      const result = await getApi().study.checkMathAnswer({
        family: exercise.family,
        seed: exercise.seed,
        answerText,
      });
      const presentation = presentMathCheckResult(result);
      setMathFeedback(presentation);
      markMathAttempt(result.correct === true);
      if (presentation.kind === 'correct') {
        // Correto: aula CONCLUÍDA (local + persistência) — o veredito fica
        // visível e o avanço é do botão primário (ver markLessonDoneAndPersist).
        await markLessonDoneAndPersist(answerText);
      }
      // errado/malformado → veredito visível; usuário tenta de novo ou usa o
      // escape "Avançar mesmo assim" (ver advanceAnyway).
    } catch {
      setMathFeedback({ kind: 'error', messageKey: 'lesson.math.error' });
    } finally {
      setChecking(false);
    }
  };

  /** Marca a tentativa de exercício de matemática (nunca-repetir do backend). */
  const markMathAttempt = (correct: boolean): void => {
    const exercise = currentExercise;
    const subj = currentSubject || subject;
    if (!exercise || !subj.trim()) return;
    const slug = ensureSubjectSlug(subj);
    void getApi()
      .study.markChallengeAttempt({
        subjectId: currentSubjectId ?? undefined,
        subjectSlug: slug,
        challengeId: `math:${slug}:${exercise.family}:${exercise.seed}`,
        verdict: correct ? 'passed' : 'failed',
      })
      .catch(() => {
        // Defensivo: falha de persistência nunca quebra a resposta.
      });
  };

  /**
   * ONDA5 — ramo INTERPRETAÇÃO: juiz com LLM (judge-answer). ok:true → veredito
   * + feedback pt-BR; ok:false → erro de serviço SEM veredito inventado.
   * 'correct' avança (canAdvanceAfterVerdict); 'partial'/'incorrect' deixam o
   * veredito visível + escape explícito ("Avançar mesmo assim").
   */
  const submitInterpretationAnswer = async (answerText: string): Promise<void> => {
    lastAnswerRef.current = answerText;
    setJudging(true);
    setInterpretationVerdict(null);
    setInterpretationFeedback('');
    setJudgeError('');
    try {
      const outcome = await getApi().study.judgeAnswer({
        lessonId: currentLessonId ?? undefined,
        answerText,
        context: {
          subject: currentSubject || subject,
          lessonExcerpt: currentBody,
        },
      });
      // `outcome.ok === true` de propósito: o tsconfig do renderer NÃO liga
      // strict — sem strictNullChecks o narrow por truthiness (`if (outcome.ok)`)
      // não exclui o membro ok:false no else (medido em teste).
      if (outcome.ok === true) {
        setInterpretationVerdict(outcome.verdict);
        setInterpretationFeedback(outcome.feedback);
        if (canAdvanceAfterVerdict(outcome.verdict)) {
          // Correto: aula CONCLUÍDA (local + persistência) — o veredito fica
          // visível e o avanço é do botão primário (ver markLessonDoneAndPersist).
          await markLessonDoneAndPersist(answerText);
        }
        // parcial/incorreto → veredito visível; o fluxo continua com feedback.
      } else {
        setJudgeError(outcome.error.message || tI('translation:lesson.answer.serviceError'));
      }
    } catch (err) {
      setJudgeError(`${t('translation:lesson.answer.serviceError')}: ${String(err)}`);
    } finally {
      setJudging(false);
    }
  };

  /** Resposta do aluno: roteia para o ramo da aula atual (math × interpretação). */
  const submitAnswer = async (answerText: string): Promise<void> => {
    if (!answerText || !currentLessonId) return;
    if (currentExercise) {
      await submitMathAnswer(answerText);
    } else {
      await submitInterpretationAnswer(answerText);
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

  // ── ONDA5 — nós de veredito do ramo respondido (vão no AnswerSection, NUNCA
  // no Box de progresso; os data-onboarding-targets são preservados) ─────────
  // Interpretação: veredito + feedback pt-BR (ou erro de serviço sem veredito).
  const interpretationFeedbackNode: ReactNode = judgeError ? (
    <Alert severity="error" sx={{ mt: 1 }}>
      {judgeError}
    </Alert>
  ) : interpretationVerdict ? (
    <Alert
      severity={
        interpretationVerdict === 'correct'
          ? 'success'
          : interpretationVerdict === 'partial'
            ? 'warning'
            : 'error'
      }
      sx={{ mt: 1 }}
    >
      <strong>{tI(`translation:${interpretationVerdictI18nKey(interpretationVerdict)}`)}</strong>
      {interpretationFeedback ? ` ${interpretationFeedback}` : ''}
    </Alert>
  ) : null;
  // Matemática: apresentação do checkMathAnswer (por execução). Chaves
  // dinâmicas via tI (o t() strict-typed não aceita `translation:${string}`).
  const mathFeedbackNode: ReactNode = mathFeedback ? (
    mathFeedback.kind === 'correct' ? (
      <Alert severity="success" sx={{ mt: 1 }}>
        {tI(`translation:${mathFeedback.messageKey}`)}
      </Alert>
    ) : mathFeedback.kind === 'wrong' ? (
      <Alert severity="error" sx={{ mt: 1 }}>
        {tI(`translation:${mathFeedback.messageKey}`, {
          expected: mathFeedback.expectedNormalized ?? '',
        })}
      </Alert>
    ) : mathFeedback.kind === 'malformed' ? (
      <Alert severity="warning" sx={{ mt: 1 }}>
        {tI(`translation:${mathFeedback.messageKey}`)}
      </Alert>
    ) : (
      <Alert severity="error" sx={{ mt: 1 }}>
        {tI(`translation:${mathFeedback.messageKey}`)}
      </Alert>
    )
  ) : null;
  // Escape explícito pós-veredito parcial/incorreto (nunca trava o usuário):
  // avança pelo MESMO caminho do veredito correto (markLessonDoneAndPersist),
  // persistindo a ÚLTIMA resposta enviada.
  const advanceAnyway: ReactNode =
    currentExercise && mathFeedback && mathFeedback.kind !== 'correct' ? (
      <Button
        variant="text"
        sx={{ mt: 1 }}
        onClick={() => void markLessonDoneAndPersist(lastAnswerRef.current)}
      >
        {t('translation:lesson.answer.continueAnyway')}
      </Button>
    ) : !currentExercise && interpretationVerdict && !canAdvanceAfterVerdict(interpretationVerdict) ? (
      <Button
        variant="text"
        sx={{ mt: 1 }}
        onClick={() => void markLessonDoneAndPersist(lastAnswerRef.current)}
      >
        {t('translation:lesson.answer.continueAnyway')}
      </Button>
    ) : null;

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
            disabled={running || checking || judging}
            exercisePrompt={currentExercise ? currentExercise.prompt : undefined}
            feedback={currentExercise ? mathFeedbackNode : interpretationFeedbackNode}
            advanceAnyway={advanceAnyway}
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
