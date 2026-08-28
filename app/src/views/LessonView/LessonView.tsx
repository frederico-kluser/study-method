/**
 * src/views/LessonView/LessonView.tsx — AULA em modo CHAT (rodada 8).
 *
 * A partir da rodada 8 o aluno NÃO GERA mais aula: o conteúdo vem pronto das
 * TRILHAS (resources/tracks, criadas pelo CLI de autoria tools/track-cli.ts).
 * Esta view é um chat direto com o tutor:
 *
 *   - o tutor APRESENTA a base teórica em linguagem simples, uma SEÇÃO por
 *     vez (botão "Próximo" → track:tutor-chat action 'next');
 *   - o aluno pergunta qualquer dúvida no chat (action 'answer');
 *   - as FONTES nunca aparecem no fluxo: botão "Fontes" abre um diálogo;
 *   - PRÉ-REQUISITOS: chips de aulas anteriores da trilha para revisar quando
 *     o aluno não entender (abrem a aula como um novo chat);
 *   - terminada a teoria, "Concluir aula" destrava a próxima aula (track:
 *     lesson-done) e os DESAFIOS da aula ficam disponíveis (abrem na
 *     ChallengeView com o fluxo track).
 *
 * Entrada: `pendingTrackLesson` (Trilha → Aula) drenado na MONTAGEM
 * (src/lib/pendingSubject.ts). Sem pendência, a view mostra o seletor de
 * trilhas (estado vazio) — nunca gera.
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
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  LinearProgress,
  Link,
  List,
  ListItem,
  ListItemText,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LockIcon from '@mui/icons-material/Lock';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

import { getApi } from '../../lib/apiBridge';
import {
  ACTION_TIMEOUTS,
  IPC_TIMEOUT_MS,
  isTimeoutError,
  resolveChannelError,
  withTimeout,
} from '../../lib/ipcTimeout';
import { useSessionState } from '../../lib/sessionState';
import { useChallengeNav } from '../../lib/challengeNav';
import {
  applyTutorReply,
  createTrackLessonState,
  pushUserMessage,
  type TrackLessonUiState,
} from '../../lib/trackLessonState';
import {
  createTrackLessonPendingHolder,
  drainPendingDomain,
  drainPendingLessonId,
  drainPendingSubject,
} from '../../lib/pendingSubject';
import type {
  TrackChallengeSummaryDto,
  TrackLessonPayload,
} from '../../../shared/ipc-contract';
import type { ViewProps } from '../placeholders';

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
          m: 0,
        }}
      >
        {children}
      </Box>
    ),
    code: ({ children }: { children?: ReactNode }) => (
      <Box
        component="code"
        sx={{
          fontFamily: "'SFMono-Regular', 'JetBrains Mono', Menlo, Consolas, monospace",
          fontSize: '0.8125rem',
        }}
      >
        {children}
      </Box>
    ),
  };
}

/** Bolha de mensagem do chat (assistente à esquerda, aluno à direita). */
function ChatBubble({ role, content }: { role: 'assistant' | 'user'; content: string }): ReactElement {
  const isUser = role === 'user';
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      <Box
        sx={{
          maxWidth: '78%',
          bgcolor: isUser ? 'primary.main' : 'background.paper',
          color: isUser ? 'primary.contrastText' : 'text.primary',
          border: isUser ? 'none' : '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          px: 1.5,
          py: 1,
        }}
      >
        {isUser ? (
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
            {content}
          </Typography>
        ) : (
          <Box sx={{ '& p:first-of-type': { mt: 0 }, '& p:last-of-type': { mb: 0 } }}>
            <ReactMarkdown components={MarkdownComponents()}>{content}</ReactMarkdown>
          </Box>
        )}
      </Box>
    </Box>
  );
}

export function LessonView(props: ViewProps): ReactElement {
  const { t } = useTranslation();
  const tI = useMemo(
    () => t as unknown as (key: string, options?: Record<string, string | number>) => string,
    [t],
  );
  // Ref de tradução SEMPRE atualizado: `t` (e `tI`) muda de identidade em
  // `changeLanguage` (react-i18next v16) — um callback com deps [tI] seria
  // re-criado a cada troca de idioma e re-executaria o efeito de montagem.
  const tIRef = useRef(tI);
  tIRef.current = tI;
  const navigate = props.onNavigate ?? (() => {});
  const { publishSession } = useSessionState();
  const nav = useChallengeNav();

  // Aula de trilha selecionada (Trilha → Aula). null = nenhuma (estado vazio).
  const [trackLesson, setTrackLesson] = useState<{ trackSlug: string; lessonId: string } | null>(null);
  const [lesson, setLesson] = useState<TrackLessonPayload | null>(null);
  const [chat, setChat] = useState<TrackLessonUiState>(createTrackLessonState);
  const [busy, setBusy] = useState(false);
  // ONDA 1 (teoria-pronta): a ação em voo — 'next' é DETERMINÍSTICO (instantâneo,
  // sem LLM) e NUNCA mostra "digitando…"; o indicador só aparece em 'answer'
  // (dúvida do aluno, que chama a LLM e pode demorar).
  const [pendingAction, setPendingAction] = useState<'next' | 'answer' | null>(null);
  const [draft, setDraft] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [doneMarked, setDoneMarked] = useState(false);

  /** Carrega uma aula da trilha via IPC — SEMPRE com timeout: se o canal não
   * responder em `IPC_TIMEOUT_MS`, cai no loadError com mensagem própria
   * (nenhum spinner eterno) e o usuário tem o botão de tentar de novo.
   *
   * Deps [] de propósito (não [tI]): `loadLesson` entra nas deps do efeito de
   * montagem; se dependesse de `t`, a troca de idioma (changeLanguage → `t`
   * novo) re-criaria o callback e RE-EXECUTARIA o efeito — com o holder
   * retido, a aula JÁ CARREGADA voltaria a `null` (flash de <LinearProgress/>),
   * com refetch do IPC e reset do status de sessão. O `tIRef` lê a tradução
   * ATUAL sem re-criar o callback: identidade estável, texto sempre novo. */
  const loadLesson = useCallback(
    (trackSlug: string, lessonId: string): (() => void) => {
      let cancelled = false;
      setLesson(null);
      setLoadError(null);
      withTimeout(getApi().track.lesson({ trackSlug, lessonId }), IPC_TIMEOUT_MS, 'track.lesson')
        .then((res) => {
          if (cancelled) return;
          if (res.ok === false) {
            // W3 (falsy-proof): '' é erro VÁLIDO — só null significa "sem erro".
            setLoadError(resolveChannelError(res, tIRef.current('lesson.trackLoadFailed')));
            return;
          }
          if (!res.lesson) {
            setLoadError(tIRef.current('lesson.trackNotFound'));
            return;
          }
          setLesson(res.lesson);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setLoadError(
            isTimeoutError(err)
              ? tIRef.current('lesson.trackLoadTimeout')
              : tIRef.current('lesson.trackLoadFailed'),
          );
        });
      return () => {
        cancelled = true;
      };
    },
    [],
  );

  // FIX rodada 11 (anti-StrictMode — loading infinito no dev/run.sh): em dev o
  // React roda os efeitos em setup → cleanup → setup (double-invoke). Um drain
  // one-shot dentro do setup seria consumido na passada 1 e a passada 2 veria
  // null — e o cleanup da passada 1 já cancelou o IPC da passada 1 → nenhum
  // load novo, spinner eterno. O holder RETIDO num ref sobrevive entre as
  // passadas do MESMO fiber (refs não são resetados pelo StrictMode), então
  // cada setup re-dispara o load com a mesma pendência.
  const pendingLessonHolderRef = useRef<ReturnType<typeof createTrackLessonPendingHolder> | null>(null);
  if (pendingLessonHolderRef.current === null) {
    pendingLessonHolderRef.current = createTrackLessonPendingHolder();
  }
  const pendingLessonHolder = pendingLessonHolderRef.current;

  // Drena a pendência da trilha NA MONTAGEM (one-shot). Pendências legadas
  // (subject/domain/lessonId) são descartadas — rodada 8: não se gera aula.
  useEffect(() => {
    drainPendingSubject();
    drainPendingDomain();
    drainPendingLessonId();
    // get() retém a pendência entre as passadas do double-invoke — o drain
    // direto aqui veria null na 2ª passada e nenhum load novo seria disparado.
    const pending = pendingLessonHolder.get();
    if (!pending) return;
    setTrackLesson(pending);
    publishSession({ subject: pending.lessonId, status: 'idle' });
    return loadLesson(pending.trackSlug, pending.lessonId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadLesson, publishSession]);

  // FIX W1 (onda 4): canais de AÇÃO com withTimeout — se o IPC ficar MUDO
  // (main preso, resposta perdida), o `busy`/`pendingAction` SEMPRE limpam no
  // finally e o usuário vê mensagem clara, em vez de botões desabilitados para
  // sempre. Timeout por ação documentado em ACTION_TIMEOUTS (lib/ipcTimeout):
  // 'next' é determinístico (10s); 'answer' > abort de 45s da LLM no main (70s).
  const sendNext = useCallback(async (): Promise<void> => {
    if (!trackLesson || busy) return;
    setBusy(true);
    setPendingAction('next');
    try {
      const res = await withTimeout(
        getApi().track.tutorChat({
          trackSlug: trackLesson.trackSlug,
          lessonId: trackLesson.lessonId,
          presentedSections: chat.presentedSections,
          history: chat.history,
          action: 'next',
        }),
        ACTION_TIMEOUTS.next,
        'track.tutorChat:next',
      );
      setChat((s) => applyTutorReply(s, res));
    } catch (err) {
      setChat((s) => ({
        ...s,
        lastError: isTimeoutError(err) ? tI('lesson.nextTimeout') : String(err),
      }));
    } finally {
      setBusy(false);
      setPendingAction(null);
    }
  }, [trackLesson, busy, chat.presentedSections, chat.history, tI]);

  const sendAnswer = useCallback(async (): Promise<void> => {
    const text = draft.trim();
    if (!trackLesson || !text || busy) return;
    setDraft('');
    setChat((s) => pushUserMessage(s, text));
    setBusy(true);
    setPendingAction('answer');
    try {
      const res = await withTimeout(
        getApi().track.tutorChat({
          trackSlug: trackLesson.trackSlug,
          lessonId: trackLesson.lessonId,
          presentedSections: chat.presentedSections,
          history: [...chat.history, { role: 'user', content: text }],
          action: 'answer',
        }),
        ACTION_TIMEOUTS.answer,
        'track.tutorChat:answer',
      );
      setChat((s) => applyTutorReply(s, res));
    } catch (err) {
      // Timeout → mensagem clara; o "digitando…" (pendingAction) desliga no finally.
      setChat((s) => ({
        ...s,
        lastError: isTimeoutError(err) ? tI('lesson.answerTimeout') : String(err),
      }));
    } finally {
      setBusy(false);
      setPendingAction(null);
    }
  }, [trackLesson, draft, busy, chat.presentedSections, chat.history, tI]);

  /** Conclui a aula (destrava a próxima) e publica a sessão. */
  const finishLesson = useCallback(async (): Promise<void> => {
    if (!trackLesson || busy || !chat.theoryDone || doneMarked) return;
    setBusy(true);
    try {
      await withTimeout(
        getApi().track.lessonDone({
          trackSlug: trackLesson.trackSlug,
          lessonId: trackLesson.lessonId,
        }),
        ACTION_TIMEOUTS.lessonDone,
        'track.lessonDone',
      );
      setDoneMarked(true);
      publishSession({
        subject: lesson?.title ?? trackLesson.lessonId,
        status: 'done',
        phase: 'concluindo',
        fraction: 1,
      });
    } catch (err) {
      // Timeout do canal MUDO → aviso visível; falha de persistência comum
      // continua silenciosa (o botão permanece disponível — retry honesto).
      if (isTimeoutError(err)) {
        setChat((s) => ({ ...s, lastError: tI('lesson.doneTimeout') }));
      }
    } finally {
      setBusy(false);
    }
  }, [trackLesson, busy, chat.theoryDone, doneMarked, lesson?.title, publishSession, tI]);

  /** Abre UM desafio da aula na ChallengeView (fluxo track). */
  const openChallenge = useCallback(
    (ch: TrackChallengeSummaryDto): void => {
      if (!trackLesson) return;
      nav.selectTrackChallenge({
        trackSlug: trackLesson.trackSlug,
        target: 'lesson',
        lessonId: trackLesson.lessonId,
        challengeId: ch.slug,
        title: ch.title,
      });
      nav.navigateToChallenge();
    },
    [trackLesson, nav],
  );

  /** Revisão de uma aula ANTERIOR da trilha (aluno não entendeu). */
  const openPrerequisite = useCallback(
    (slug: string): void => {
      if (!trackLesson) return;
      setTrackLesson({ trackSlug: trackLesson.trackSlug, lessonId: slug });
      setChat(createTrackLessonState);
      setDoneMarked(false);
      setLoadError(null);
      publishSession({ subject: slug, status: 'idle' });
      loadLesson(trackLesson.trackSlug, slug);
    },
    [trackLesson, loadLesson, publishSession],
  );

  // ─── estado vazio: nenhuma aula de trilha selecionada ─────────────────────
  if (!trackLesson) {
    return (
 <Stack spacing={2} sx={{ p: 2, maxWidth: 640, mx: 'auto', pt: 6, alignItems: 'center' }} >
        <AutoStoriesIcon color="primary" sx={{ fontSize: 56 }} />
        <Typography variant="h6" align="center">
          {t('translation:lesson.emptyTitle')}
        </Typography>
        <Typography variant="body2" color="text.secondary" align="center" sx={{ maxWidth: 480 }}>
          {t('translation:lesson.emptyDescription')}
        </Typography>
        <Button variant="contained" onClick={() => navigate('roadmap')}>
          {t('translation:lesson.emptyCta')}
        </Button>
      </Stack>
    );
  }

  // W3 (falsy-proof): só `null` significa "sem erro" — '' é erro válido.
  if (loadError !== null) {
    return (
      <Box sx={{ p: 2, maxWidth: 640, mx: 'auto', pt: 4 }}>
        <Alert severity="error">{loadError}</Alert>
        <Button
          variant="outlined"
          onClick={() => loadLesson(trackLesson.trackSlug, trackLesson.lessonId)}
          sx={{ mt: 1 }}
        >
          {t('translation:common.tryAgain')}
        </Button>
      </Box>
    );
  }

  if (!lesson) {
    return (
      <Box sx={{ p: 2, maxWidth: 640, mx: 'auto', pt: 4 }}>
        <LinearProgress />
      </Box>
    );
  }

  const theoryProgress = Math.min(100, Math.round((chat.presentedSections.length / Math.max(1, lesson.theory.length)) * 100));

  // ONDA 1 (layout+a11y): a aula ATIVA ocupa TODA a altura do painel main —
  // cabeçalho fixo no topo, região do chat com scroll INTERNO (flexGrow) e
  // entrada fixa embaixo. `flexGrow: 1, minHeight: 0, height: '100%'` resolvem
  // porque o `main` do shell virou flex column com altura definida (stretch).
  // Os estados vazio/erro/loading acima seguem com altura de conteúdo.
  return (
    <Box
      sx={{
        flexGrow: 1,
        minHeight: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        p: 2,
        maxWidth: 760,
        mx: 'auto',
      }}
    >
      <Stack spacing={1.5} sx={{ flexGrow: 1, minHeight: 0 }}>
        {/* Cabeçalho: título + resumo + ações */}
        <Box>
 <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Box>
              <Typography variant="h5" component="h1">
                {lesson.title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {lesson.summary}
              </Typography>
            </Box>
            <Button size="small" variant="outlined" onClick={() => setSourcesOpen(true)} startIcon={<AutoStoriesIcon />}>
              {t('translation:lesson.sourcesButton')}
            </Button>
          </Stack>
          {/* Progresso da teoria (seções apresentadas). */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
            <LinearProgress
              variant="determinate"
              value={theoryProgress}
              sx={{ flexGrow: 1, height: 6, borderRadius: 3 }}
              aria-label={tI('lesson.theoryProgress', { percent: theoryProgress })}
            />
            <Typography variant="caption" color="text.secondary">
              {tI('lesson.theoryCount', { current: chat.presentedSections.length, total: lesson.theory.length })}
            </Typography>
          </Box>
          {/* Aulas anteriores da trilha (revisão quando não entender). */}
          {lesson.prerequisites.length > 0 ? (
 <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap',  }} >
              <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                {t('translation:lesson.prerequisitesLabel')}
              </Typography>
              {lesson.prerequisites.map((pre) => (
                <Chip
                  key={pre.slug}
                  size="small"
                  variant="outlined"
                  label={pre.title}
                  onClick={() => openPrerequisite(pre.slug)}
                  onDelete={undefined}
                />
              ))}
            </Stack>
          ) : null}
        </Box>

        <Divider />

        {/* Região do chat: ÚNICO scroll interno da aula ativa (janela pequena
            ou grande — o main do shell nunca rola). `flexGrow` faz o chat
            ocupar TODA a altura disponível do painel main; `minHeight: 0`
            permite encolher até caber a entrada fixa embaixo. */}
        <Box
          sx={{
            flexGrow: 1,
            minHeight: 0,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}
        >
          {/* Painel das mensagens (rola junto com a região). */}
          <Box
            sx={{
              flexGrow: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              bgcolor: 'action.hover',
              borderRadius: 2,
              p: 1.5,
            }}
            role="log"
            aria-live="polite"
          >
          {chat.history.length === 0 ? (
            <Box sx={{ m: 'auto', textAlign: 'center', color: 'text.secondary' }}>
              <Typography variant="body2">{t('translation:lesson.chatStart')}</Typography>
              <Button
                variant="contained"
                size="small"
                onClick={sendNext}
                disabled={busy}
                startIcon={<ArrowForwardIcon />}
                sx={{ mt: 1 }}
              >
                {t('translation:lesson.startButton')}
              </Button>
            </Box>
          ) : (
            chat.history.map((m, i) => <ChatBubble key={i} role={m.role} content={m.content} />)
          )}
          {/* ONDA 1 (teoria-pronta): "digitando…" SÓ em 'answer' (LLM). 'next' é
              instantâneo — o markdown da seção já está no arquivo da trilha. */}
          {busy && pendingAction === 'answer' ? (
            <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                {t('translation:lesson.typing')}
              </Typography>
            </Box>
          ) : null}
          </Box>

          {/* Desafios da aula (gerados na trilha; abertos na ChallengeView).
              Ficam DENTRO da região com scroll: em janela pequena o usuário
              alcança a lista rolando o chat — o main do shell nunca rola. */}
          {lesson.challenges.length > 0 ? (
            <Box>
              <Typography variant="h6" sx={{ mt: 1 }}>
                {t('translation:lesson.challengesTitle')}
              </Typography>
              <List dense>
                {lesson.challenges.map((ch) => (
                  <ListItem
                    key={ch.slug}
                    component="button"
                    onClick={() => openChallenge(ch)}
                    sx={{
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 1,
                      mb: 0.5,
                      cursor: 'pointer',
                      textAlign: 'left',
                      width: '100%',
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <ListItemText
                      primary={
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {ch.title}
                          </Typography>
                          <Chip size="small" variant="outlined" label={tI('lesson.difficulty', { n: ch.difficulty })} />
                          {ch.generated ? <Chip size="small" color="secondary" label={t('translation:lesson.generatedBadge')} /> : null}
                        </Stack>
                      }
                      secondary={
                        ch.lastVerdict === 'passed' ? (
                          tI('lesson.challengePassed', { stars: ch.stars })
                        ) : ch.failedCount > 0 ? (
                          tI('lesson.challengeFailedCount', { n: ch.failedCount })
                        ) : (
                          t('translation:lesson.challengeUntried')
                        )
                      }
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          ) : null}
        </Box>

        {chat.lastError ? (
          <Alert severity="warning" onClose={() => setChat((s) => ({ ...s, lastError: null }))}>
            {chat.lastError}
          </Alert>
        ) : null}

        {/* Entrada: dúvida do aluno + avanço da teoria. */}
 <Stack direction="row" spacing={1}>
          <TextField
            size="small"
            fullWidth
            data-onboarding-target="lesson-chat-input"
            label={t('translation:lesson.askInput')}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) void sendAnswer();
            }}
            disabled={busy}
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title={t('translation:lesson.askSend')}>
                      <span>
                        <IconButton onClick={() => void sendAnswer()} disabled={busy || !draft.trim()} size="small">
                          <SendIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </InputAdornment>
                ),
              },
            }}
          />
          {!chat.theoryDone ? (
            <Button variant="contained" onClick={() => void sendNext()} disabled={busy} sx={{ whiteSpace: 'nowrap' }}>
              {t('translation:lesson.nextButton')}
            </Button>
          ) : (
            <Tooltip title={doneMarked ? t('translation:lesson.doneMarked') : ''}>
              <span>
                <Button
                  variant="contained"
                  onClick={() => void finishLesson()}
                  disabled={busy || doneMarked}
                  startIcon={doneMarked ? <CheckCircleIcon /> : <LockIcon />}
                  sx={{ whiteSpace: 'nowrap' }}
                >
                  {doneMarked ? t('translation:lesson.doneMarked') : t('translation:lesson.finishButton')}
                </Button>
              </span>
            </Tooltip>
          )}
        </Stack>

      </Stack>

      {/* Fontes: NUNCA no fluxo — botão "Fontes" abre este diálogo. */}
      <Dialog open={sourcesOpen} onClose={() => setSourcesOpen(false)} aria-labelledby="lesson-sources-title" maxWidth="sm" fullWidth>
        <DialogTitle id="lesson-sources-title">{t('translation:lesson.sourcesTitle')}</DialogTitle>
        <DialogContent dividers>
          {lesson.sources.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {t('translation:lesson.sourcesEmpty')}
            </Typography>
          ) : (
            <List dense>
              {lesson.sources.map((s, i) => (
                <ListItem key={i} disableGutters>
                  <ListItemText
                    primary={
                      <Link href={s.url} target="_blank" rel="noreferrer">
                        {s.title}
                      </Link>
                    }
                    secondary={s.description}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
