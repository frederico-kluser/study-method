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
 * ONDA2 (error-flow): quando um desafio de AULA FALHA, o painel fecha e o
 * chat da aula REABRE em tela cheia com a bolha de erro (checklist + saída)
 * + a pergunta do tutor ("o que você acha que errou?"). A resposta do aluno
 * (texto OU voz — mic no input) vai ao tutor com `challengeError` no payload
 * ('answer'): a IA valida a hipótese ou analisa o erro sozinha ("não sei").
 * O seed da bolha é feito NA MONTAGEM (guard anti-StrictMode com ref) e o
 * "Gerar novo desafio" migrou para DENTRO da bolha (nunca-repetir intacto).
 *
 * ONDA2-IMESSAGE (chat estilo iMessage + streaming + gating): as bolhas
 * agora vivem em src/components/chat (ChatBubble com autor/nome/hora/avatar,
 * TypewriterText e TypingIndicator). O streaming é SÓ EXIBIÇÃO: o texto
 * COMPLETO fica no histórico (trackLessonState) e o corte é visual. O
 * "Concluir aula" é BLOQUEADO enquanto houver desafio pendente
 * (isLessonFinishBlocked — lê lastVerdict do payload track.lesson).
 *
 * Entrada: `pendingTrackLesson` (Trilha → Aula) drenado na MONTAGEM
 * (src/lib/pendingSubject.ts) OU `nav.challengeErrorReport` (Desafio → Aula,
 * erro). Sem nenhum dos dois, a view mostra o seletor de trilhas (estado
 * vazio) — nunca gera.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
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
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';

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
import { useMicSTT } from '../../hooks/useMicSTT';
import {
  applyTutorReply,
  chatDaySeparator,
  chatHistory,
  clearChallengeError,
  createTrackLessonState,
  isLessonFinishBlocked,
  pushUserMessage,
  seedChallengeError,
  type TrackLessonUiState,
} from '../../lib/trackLessonState';
import {
  createTrackLessonPendingHolder,
  drainPendingDomain,
  drainPendingLessonId,
  drainPendingSubject,
} from '../../lib/pendingSubject';
import {
  createLessonChatHolder,
  saveLessonChat,
} from '../../lib/lessonChatCache';
import { ChatBubble } from '../../components/chat/ChatBubble';
import { TypingIndicator } from '../../components/chat/TypingIndicator';
import type {
  TrackChallengeSummaryDto,
  TrackLessonPayload,
} from '../../../shared/ipc-contract';
import type { ViewProps } from '../placeholders';

export function LessonView(props: ViewProps): ReactElement {
  const { t, i18n } = useTranslation();
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

  // ─── ONDA2-IMESSAGE: streaming (efeito "digitação" ~100 tokens/s) ─────────
  // O streaming é SÓ EXIBIÇÃO: o histórico guarda o texto COMPLETO (o modelo
  // da Onda 1 é o contrato) e o TypewriterText corta visualmente. Só digitam
  // as mensagens NOVAS desta sessão — `newMessageIndicesRef` marca (por
  // índice no histórico) o que entrou DEPOIS da montagem/restauração: o par
  // do seed NOVO (review + pergunta — reconhecido pelo ts do seed, pois o
  // seedChallengeError recebe `now` injetado) e as respostas de 'next'/
  // 'answer'. Mensagens RESTAURADAS do cache (ou de seed antigo) NÃO são
  // marcadas → renderizam completas e instantâneas.
  const newMessageIndicesRef = useRef<Set<number>>(new Set());
  const markNew = useCallback((i: number): void => {
    newMessageIndicesRef.current.add(i);
  }, []);
  // Índices das mensagens ATUALMENTE digitando (estado — vira o indicador
  // "digitando" e o gating do "Gerar novo desafio" da review).
  const [streamingIds, setStreamingIds] = useState<ReadonlySet<number>>(() => new Set());
  const handleStreamStart = useCallback((i: number): void => {
    setStreamingIds((prev) => {
      if (prev.has(i)) return prev;
      const next = new Set(prev);
      next.add(i);
      return next;
    });
  }, []);
  const handleStreamDone = useCallback((i: number): void => {
    setStreamingIds((prev) => {
      if (!prev.has(i)) return prev;
      const next = new Set(prev);
      next.delete(i);
      return next;
    });
  }, []);
  // Região com scroll do chat (a Box com overflowY do render).
  const logScrollRef = useRef<HTMLDivElement | null>(null);
  // Auto-scroll DURANTE a digitação: a cada step do typewriter (onStreamTick)
  // o painel desce direto ao fim (scrollTop = scrollHeight). DECISÃO
  // (documentada no handoff — pedido explícito do dono): auto-scroll SEMPRE
  // durante a digitação ativa, mesmo se o usuário rolou para cima.
  const handleStreamTick = useCallback((): void => {
    const el = logScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);
  // Nudge de fim: quando o conjunto de mensagens digitando muda (início/fim)
  // ou o histórico cresce (mensagem nova entra), garante o fim à vista.
  useEffect(() => {
    const el = logScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.history.length, streamingIds]);

  // ONDA2-IMESSAGE (gating do "Concluir aula"): bloqueado quando há desafios
  // E algum NÃO passou (lastVerdict !== 'passed' — null = nunca tentado). O
  // payload track.lesson é RE-BUSCADO na abertura da aula — um desafio
  // passado na ChallengeView reflete aqui na volta. Sem desafios → liberado.
  // Guard de null ANTES do lesson carregar (os early returns de loading/erro
  // usam o estado abaixo sem renderizar o botão).
  const challengesPending = lesson ? isLessonFinishBlocked(lesson.challenges) : false;

  // ONDA2 (error-flow, A5): mic no input do chat — o aluno pode responder à
  // pergunta do erro por VOZ (ou tirar qualquer dúvida falando). DECISÃO:
  // useMicSTT DIRETO (hook NÃO modificado — ele já expõe transcribing/
  // partial/error/start/stop/cancel), montado num IconButton MUI no start
  // adornment do TextField (o end já tem o Send). A transcrição FINAL
  // preenche o draft — NUNCA envia automático. As strings de erro do hook
  // são as dele (pt-BR fixo — fora de escopo alterá-las).
  const mic = useMicSTT(i18n.language?.startsWith('en') ? 'en' : 'pt-BR');
  const handleMicToggle = useCallback(async (): Promise<void> => {
    if (mic.transcribing) {
      const text = await mic.stop();
      if (text.trim()) {
        setDraft((prev) => (prev.trim() ? `${prev} ${text}` : text));
      }
    } else {
      await mic.start();
    }
  }, [mic.transcribing, mic.start, mic.stop]);

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

  // ONDA2 (error-flow): a bolha de erro do desafio que FALHOU é seedada NA
  // MONTAGEM — UMA única vez (guard anti-StrictMode no ref: as passadas do
  // double-invoke do dev compartilham o MESMO fiber e refs sobrevivem, então
  // a 2ª passada NÃO re-semeia). O relatório é lido por REF (não entra nas
  // deps): a identidade do contexto muda quando o report é setado/limpo, e
  // depender dela re-executaria o efeito a cada mudança de navegação.
  const challengeErrorSeededRef = useRef(false);
  // Aula do erro em seed (StrictMode: a 2ª passada encontra o report já
  // drenado — este ref RE-DISPARA o load da MESMA aula que o cleanup da 1ª
  // passada cancelou; o seed NÃO é repetido).
  const challengeErrorLessonRef = useRef<{ trackSlug: string; lessonId: string } | null>(null);
  const navReportRef = useRef(nav.challengeErrorReport);
  navReportRef.current = nav.challengeErrorReport;

  // ONDA3 (chat-cache): refs do estado MAIS RECENTE para o SAVE no unmount —
  // o cleanup do efeito de montagem precisa ler o ÚLTIMO chat/trackLesson sem
  // re-registrar o efeito (mesmo padrão do tIRef/activeRef já usados na view).
  const chatRef = useRef(chat);
  chatRef.current = chat;
  const trackLessonRef = useRef(trackLesson);
  trackLessonRef.current = trackLesson;

  // ONDA3 (chat-cache): holder do drain do cache de chat — criado LAZY no
  // efeito de montagem (a key depende do alvo, conhecido só lá) e RETIDO no
  // ref entre as passadas do double-invoke do dev (mesmo padrão do
  // pendingLessonHolderRef): o take do cache é one-shot e, sem o holder, a 2ª
  // passada veria null e sobrescreveria a restauração da 1ª com chat vazio.
  const cacheHolderRef = useRef<ReturnType<typeof createLessonChatHolder> | null>(null);

  // ONDA3 (chat-cache): SAVE no UNMOUNT — o shell monta SÓ a view ativa; sair
  // da aba Aula (Desafio, Trilha etc.) desmonta a LessonView e zera o estado
  // local. Este cleanup guarda o estado ATUAL do chat no cache de sessão
  // (chaveado trackSlug:lessonId) para a próxima montagem da MESMA aula
  // restaurar histórico/presentedSections (ex.: o chat do fluxo de erro da
  // Onda 2 volta com a teoria em curso, não vazio). Lê por REF o último
  // estado (sem re-registrar o efeito). Skip: sem aula carregada (trackLesson
  // null) ou chat nunca iniciado (nada a restaurar — um cache com estado
  // vazio faria a restauração devolver um chat vazio à toa).
  useEffect(() => {
    return () => {
      const key = trackLessonRef.current;
      if (!key) return;
      const c = chatRef.current;
      if (c.history.length === 0 && c.presentedSections.length === 0) return;
      saveLessonChat({ trackSlug: key.trackSlug, lessonId: key.lessonId }, c);
    };
  }, []);

  // Drena a pendência da trilha NA MONTAGEM (one-shot). Pendências legadas
  // (subject/domain/lessonId) são descartadas — rodada 8: não se gera aula.
  useEffect(() => {
    drainPendingSubject();
    drainPendingDomain();
    drainPendingLessonId();
    // get() retém a pendência entre as passadas do double-invoke — o drain
    // direto aqui veria null na 2ª passada e nenhum load novo seria disparado.
    const pending = pendingLessonHolder.get();
    const report = navReportRef.current;
    // ONDA3 (chat-cache, REPLAN 2): o alvo de restauração — o report do erro
    // DEFINE o alvo; o pending da trilha é o FALLBACK; nunca os dois juntos
    // (report presente → a aula do erro vence). Sem alvo → comportamento
    // atual (estado vazio; nada a restaurar).
    const alvo = report ?? pending ?? null;
    if (alvo) {
      // Drain do cache com holder retido em ref (padrão pendingLessonHolder):
      // o take é one-shot e, sem o holder, a 2ª passada do double-invoke do
      // dev veria null e sobrescreveria a restauração da 1ª passada.
      if (cacheHolderRef.current === null) {
        cacheHolderRef.current = createLessonChatHolder({
          trackSlug: alvo.trackSlug,
          lessonId: alvo.lessonId,
        });
      }
      const cached = cacheHolderRef.current.get();
      if (report) {
        if (!challengeErrorSeededRef.current) {
          // ONDA2 (error-flow): o desafio de AULA falhou e o painel fechou — o
          // chat da aula reabre com a bolha de erro + a pergunta do tutor. O
          // seed NÃO depende do lesson carregado (a bolha é UI
          // determinística); o report traz trackSlug/lessonId do próprio erro.
          // Ordem: setTrackLesson → loadLesson → seedChallengeError →
          // nav.clearChallengeError().
          challengeErrorSeededRef.current = true;
          challengeErrorLessonRef.current = { trackSlug: report.trackSlug, lessonId: report.lessonId };
          setTrackLesson({ trackSlug: report.trackSlug, lessonId: report.lessonId });
          publishSession({ subject: report.lessonId, status: 'idle' });
          // ONDA3 (chat-cache): o seed é APPEND-ONLY sobre o estado
          // RESTAURADO do cache — a teoria em curso permanece no histórico e
          // as bolhas do erro entram depois (dedupe por challengeId do seed:
          // falha repetida do MESMO desafio não re-semeia). Sem cache, cai no
          // comportamento atual (seed sobre o estado vazio).
          //
          // ONDA2-IMESSAGE (streaming): o seed é computado SINCRONAMENTE (a
          // lib é pura) para MARCAR o par NOVO como digitável — a review
          // seedada DIGITA (pedido explícito do dono) e a pergunta idem. O
          // histórico RESTAURADO do cache NÃO digita (não marcado). O `now`
          // do seed é INJETADO: as duas mensagens do par carregam o seedNow
          // (a review com errorFor + a pergunta 'message'), então são
          // reconhecidas pelo ts — inclusive quando o retry REPÕE o par no
          // MEIO do histórico (índice menor que o do fim do cache).
          const base = cached ?? createTrackLessonState();
          const seedNow = Date.now();
          const seeded = seedChallengeError(
            base,
            report,
            tIRef.current('lesson.errorQuestion'),
            {
              title: tIRef.current('lesson.errorBubbleTitle'),
              partialCount: tIRef.current('challenge.partialCount', {
                passed: report.passedCount,
                total: report.totalCount,
              }),
              checksTitle: tIRef.current('challenge.checksTitle'),
              outputTitle: tIRef.current('challenge.output'),
            },
            seedNow,
          );
          setChat(seeded);
          for (let i = 0; i < seeded.history.length; i++) {
            if (seeded.history[i].ts === seedNow) markNew(i);
          }
          nav.clearChallengeError();
          return loadLesson(report.trackSlug, report.lessonId);
        }
      } else if (pending) {
        setTrackLesson(pending);
        publishSession({ subject: pending.lessonId, status: 'idle' });
        // ONDA3 (chat-cache): o chat volta EXATAMENTE onde estava — o restore
        // devolve history/presentedSections completos (theoryDone incluso), e
        // o 'next' segue da seção seguinte sem código extra. Sem cache →
        // comportamento atual (chat novo, teoria da seção 1).
        setChat(cached ?? createTrackLessonState());
        return loadLesson(pending.trackSlug, pending.lessonId);
      }
    }
    // StrictMode (dev): a 2ª passada vê o report já drenado — re-dispara o
    // load da aula do erro (o cleanup da 1ª passada cancelou o IPC). Sem
    // isto, o spinner da aula ficaria eterno (bug da rodada 11, mesma forma).
    if (challengeErrorLessonRef.current) {
      const ctx = challengeErrorLessonRef.current;
      return loadLesson(ctx.trackSlug, ctx.lessonId);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadLesson, publishSession, markNew]);

  // FIX W1 (onda 4): canais de AÇÃO com withTimeout — se o IPC ficar MUDO
  // (main preso, resposta perdida), o `busy`/`pendingAction` SEMPRE limpam no
  // finally e o usuário vê mensagem clara, em vez de botões desabilitados para
  // sempre. Timeout por ação documentado em ACTION_TIMEOUTS (lib/ipcTimeout):
  // 'next' é determinístico (10s); 'answer' > abort de 45s da LLM no main (70s).
  const sendNext = useCallback(async (): Promise<void> => {
    if (!trackLesson || busy) return;
    setBusy(true);
    setPendingAction('next');
    // ONDA2-IMESSAGE: a resposta do 'next' entra no FIM do histórico — marca
    // o índice ANTES do append para o TypewriterText DIGITAR (se a resposta
    // for vazia — teoria concluída — o índice não existe e o mark é no-op).
    const nextIndex = chat.history.length;
    try {
      const res = await withTimeout(
        getApi().track.tutorChat({
          trackSlug: trackLesson.trackSlug,
          lessonId: trackLesson.lessonId,
          presentedSections: chat.presentedSections,
          history: chatHistory(chat),
          action: 'next',
        }),
        ACTION_TIMEOUTS.next,
        'track.tutorChat:next',
      );
      // ONDA2 (error-flow): 'next' LIMPA o contexto de erro — a teoria
      // retoma e a discussão do erro encerra (as bolhas continuam na
      // conversa; só o challengeError deixa de acompanhar os turnos).
      setChat((s) => clearChallengeError(applyTutorReply(s, res)));
      markNew(nextIndex);
    } catch (err) {
      setChat((s) => ({
        ...s,
        lastError: isTimeoutError(err) ? tI('lesson.nextTimeout') : String(err),
      }));
    } finally {
      setBusy(false);
      setPendingAction(null);
    }
  }, [trackLesson, busy, chat.presentedSections, chat.history, tI, markNew]);

  const sendAnswer = useCallback(async (): Promise<void> => {
    const text = draft.trim();
    if (!trackLesson || !text || busy) return;
    // ONDA2 (error-flow, A5): gravação em andamento + envio → CANCELA o mic
    // (o turno em voo desabilita o botão; sem o cancel, a gravação ficaria
    // presa sem como parar — a transcrição parcial não vira segundo envio).
    if (mic.transcribing) void mic.cancel();
    // ONDA2-IMESSAGE: a pergunta entra no índice `nextIndex` e a resposta do
    // tutor logo em seguida (`nextIndex + 1`) — marca a RESPOSTA para
    // DIGITAR (a pergunta do aluno é instantânea — ele mesmo digitou).
    const nextIndex = chat.history.length;
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
          // chatHistory STRIPA o kind das bolhas (texto puro ao main); o
          // challengeError (se em discussão) acompanha o turno — o main o usa
          // na análise da hipótese do aluno em 'answer'.
          history: [...chatHistory(chat), { role: 'user', content: text }],
          action: 'answer',
          ...(chat.challengeError ? { challengeError: chat.challengeError } : {}),
        }),
        ACTION_TIMEOUTS.answer,
        'track.tutorChat:answer',
      );
      setChat((s) => applyTutorReply(s, res));
      markNew(nextIndex + 1);
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
  }, [trackLesson, draft, busy, chat.presentedSections, chat.history, chat.challengeError, mic.transcribing, mic.cancel, tI, markNew]);

  /** Conclui a aula (destrava a próxima) e publica a sessão. */
  const finishLesson = useCallback(async (): Promise<void> => {
    // ONDA2-IMESSAGE (gating): a aula SÓ termina com todos os desafios
    // concluídos — defensivo (o botão já vem desabilitado, mas o guard
    // também protege um possível disparo por atalho/estado antigo).
    if (!trackLesson || busy || !chat.theoryDone || doneMarked || challengesPending) return;
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
  }, [trackLesson, busy, chat.theoryDone, doneMarked, challengesPending, lesson?.title, publishSession, tI]);

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

  /** ONDA2 (error-flow, A4): "Gerar novo desafio" NA BOLHA de erro — a LLM vê
   *  os desafios que o aluno errou nesta aula (nunca-repetir da rodada 8
   *  preservado). Sucesso → abre o desafio NOVO na ChallengeView; falha/
   *  timeout → chat.lastError (o Alert fixo abaixo da região — NÃO é movido).
   *  `busy` da view reusa o estado de turno em voo para desabilitar o botão. */
  const handleRegenerateFromBubble = useCallback(async (): Promise<void> => {
    if (!trackLesson || busy) return;
    setBusy(true);
    try {
      const res = await withTimeout(
        getApi().track.challengeRegenerate({
          trackSlug: trackLesson.trackSlug,
          lessonId: trackLesson.lessonId,
        }),
        ACTION_TIMEOUTS.challengeRegenerate,
        'track.challengeRegenerate',
      );
      if (res.ok && res.challenge) {
        nav.selectTrackChallenge({
          trackSlug: trackLesson.trackSlug,
          target: 'lesson',
          lessonId: trackLesson.lessonId,
          challengeId: res.challenge.slug,
          title: res.challenge.title,
        });
        nav.navigateToChallenge();
      } else {
        setChat((s) => ({
          ...s,
          lastError: res.error?.message ?? tI('lesson.regenerateFailed'),
        }));
      }
    } catch (err) {
      setChat((s) => ({
        ...s,
        lastError: isTimeoutError(err) ? tI('challenge.regenerateTimeout') : String(err),
      }));
    } finally {
      setBusy(false);
    }
  }, [trackLesson, busy, nav, tI]);

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
          ref={logScrollRef}
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
            <>
              {chat.history.map((m, i) => {
                // Separador de dia centralizado quando a data MUDOU em
                // relação à bolha anterior ("Hoje"/"Ontem"/data completa —
                // decisões documentadas em chatDaySeparator).
                const prev = i > 0 ? chat.history[i - 1] : undefined;
                const daySep = chatDaySeparator(m.ts, prev?.ts, i18n.language ?? 'pt-BR');
                return (
                  <Fragment key={i}>
                    {daySep ? (
                      <Box sx={{ textAlign: 'center', mt: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">
                          {daySep.kind === 'today'
                            ? t('translation:lesson.dayToday')
                            : daySep.kind === 'yesterday'
                              ? t('translation:lesson.dayYesterday')
                              : daySep.label}
                        </Typography>
                      </Box>
                    ) : null}
                    <ChatBubble
                      message={m}
                      // Só mensagens NOVAS da sessão digitam (cache/seed
                      // antigo → completas e instantâneas).
                      isNew={newMessageIndicesRef.current.has(i)}
                      streaming={streamingIds.has(i)}
                      onRegenerate={m.kind === 'review' ? handleRegenerateFromBubble : undefined}
                      regenerateDisabled={busy}
                      onStreamStart={() => handleStreamStart(i)}
                      onStreamDone={() => handleStreamDone(i)}
                      onStreamTick={handleStreamTick}
                    />
                  </Fragment>
                );
              })}
              {/* ONDA2-IMESSAGE: indicador "digitando" ANIMADO — montado SÓ
                  enquanto a digitação está ativa (turno 'answer' aguardando a
                  LLM OU alguma bolha digitando); sai do DOM ao terminar
                  (mount condicional — os e2e nunca casam texto oculto). */}
              {busy && pendingAction === 'answer' || streamingIds.size > 0 ? (
                <TypingIndicator />
              ) : null}
            </>
          )}
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

        {/* ONDA2 (error-flow, A5): mic — o indicador de transcrição é
            acessível (aria-live) e o erro do engine (hook, sem dismiss)
            aparece como Alert pequeno; o botão permanece reabilitado. */}
        {mic.transcribing ? (
          <Typography variant="caption" color="text.secondary" aria-live="polite" sx={{ fontStyle: 'italic' }}>
            {tI('lesson.micRecording')} — {mic.partial || '…'}
          </Typography>
        ) : null}
        {mic.error ? (
          <Alert severity="error" sx={{ py: 0.5 }}>{mic.error}</Alert>
        ) : null}

        {/* Entrada: dúvida do aluno (texto OU voz) + avanço da teoria. */}
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
                startAdornment: (
                  <InputAdornment position="start">
                    <Tooltip title={mic.transcribing ? t('translation:lesson.micStop') : t('translation:lesson.micStart')}>
                      <span>
                        <IconButton
                          onClick={() => void handleMicToggle()}
                          disabled={busy}
                          size="small"
                          aria-label={mic.transcribing ? tI('lesson.micStop') : tI('lesson.micStart')}
                        >
                          {mic.transcribing ? <MicOffIcon fontSize="small" /> : <MicIcon fontSize="small" />}
                        </IconButton>
                      </span>
                    </Tooltip>
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title={t('translation:lesson.askSend')}>
                      <span>
                        {/* ONDA3 (2.3, débito de a11y): o Send ganha nome
                            acessível (o mic já tinha na Onda 2). O Tooltip é
                            dica visual — o aria-label é o NOME acessível
                            (nada duplicado na tela). */}
                        <IconButton
                          onClick={() => void sendAnswer()}
                          disabled={busy || !draft.trim()}
                          size="small"
                          aria-label={tI('lesson.sendMessage')}
                        >
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
            <Tooltip
              title={
                doneMarked
                  ? t('translation:lesson.doneMarked')
                  : challengesPending
                    ? t('translation:lesson.finishBlockedTooltip')
                    : ''
              }
            >
              <span>
                <Button
                  variant="contained"
                  onClick={() => void finishLesson()}
                  // ONDA2-IMESSAGE (gating): DESABILITADO com desafios
                  // pendentes (tooltip i18n só quando bloqueado); liberado com
                  // todos passed ou sem desafios.
                  disabled={busy || doneMarked || challengesPending}
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
