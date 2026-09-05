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
 * ONDA2-CHAT-NINTENDO (pedidos do dono): coluna em min(1920px, 100%) com o
 * painel de mensagens capado em 1000px centrado; balões entram com
 * AnimatePresence + fadeInUp (só os NOVOS da sessão); auto-scroll SÓ quando o
 * usuário está no fim (ou acabou de abrir) e SMOOTH nos nudges (o tick do
 * typewriter segue INSTANTÂNEO — smooth a cada ~2.5ms pularia o streaming);
 * press feedback (scale 0.98) nos botões do chat; o reply do tutor ficou à
 * ESQUERDA com avatar (detalhes na ChatBubble) e o erro de execução é
 * INSTANTÂNEO (TypewriterText `instant` — a review de APROVAÇÃO continua a
 * 10 tps).
 *
 * ONDA10 (três bugs do dono, todos na experiência de estudar):
 *   1. o quiz ENTREGAVA a resposta antes do clique — conserto no LessonQuiz
 *      (função PURA `optionVisualState`, ver o cabeçalho de lá);
 *   2. o quiz PODIA SER IGNORADO — agora é GATE: "Próximo" trava enquanto a
 *      seção ATUAL tiver quiz sem resposta, e "Concluir aula" trava enquanto
 *      QUALQUER quiz já visível estiver sem resposta. As duas travas leem
 *      `answered` e NUNCA `correct` (errar não trava o aluno) e a UI DIZ o
 *      motivo — texto visível role="status" ao lado do botão, além do
 *      tooltip (Button desabilitado não dispara hover);
 *   3. a teoria era DESPEJADA a ~400 chars/s — agora é escrita em velocidade
 *      de LEITURA (7 tps = 28 chars/s, `chatBubbleTps`), com saída: clique no
 *      painel, qualquer tecla ou "Mostrar tudo" completam a bolha na hora.
 *      A review (10 tps) e as respostas do tutor (100 tps) NÃO mudaram.
 *
 * ONDA2-QUIZ-OVERLAY (o dono, textualmente: "o layout do quiz deve ser sobre a
 * tela e respondendo ele minimiza para ficar no chat" + "só vamos para o
 * desafio depois que o aluno provar que entendeu"):
 *
 *   - o quiz da seção deixou de ser um card no meio da conversa e passou a
 *     SUBIR SOBRE A TELA num overlay montado no SHELL (App.tsx, o molde do
 *     ChallengeGenerateModal). Responder MINIMIZA: o card desce e vira o
 *     `QuizChatCard`, ancorado na bolha da seção que o demonstra;
 *   - ERRAR abre o ciclo de remediação, e é esta view que o executa contra o
 *     main: `track.quizExplain` → `registerQuizExplanation` (a explicação vira
 *     BOLHA da conversa) → `track.quizRemedial` → `injectRemediationQuiz` (o
 *     quiz novo sobe de volta). Repete até o ACERTO, que é o único fim;
 *   - toda resposta é registrada com `track.quizAttempt` — uma vez, porque ele
 *     já devolve a maestria recalculada;
 *   - FAIL-CLOSED em toda a linha: `{ok:false}` (ou canal mudo) NUNCA vira
 *     conteúdo inventado. Sem explicação o ciclo SEGUE mesmo assim (caminho de
 *     degradação de `injectRemediationQuiz`); sem quiz novo o ciclo PARA e a
 *     tela oferece pedir de novo. O aluno nunca fica preso sem saber por quê;
 *   - LARGURAS: painel de mensagens e linha de entrada passam a dividir a
 *     MESMA coluna (`CHAT_COLUMN_MAX_PX`) — o eixo de leitura e o de escrita
 *     não batiam —, e o painel saiu de `action.hover` (overlay alfa, a única
 *     superfície do app fora da rampa `surface.level0..4`) para o nível 2.
 *
 * ONDA3-PERSISTENCIA (o buraco que a onda do overlay deixou declarado): o
 * ciclo inteiro era GRAVADO no banco e NUNCA lido de volta — `track:quiz-
 * history` não tinha chamador. A maestria sobrevivia à troca de aba (o
 * `lessonChatCache` é um Map em memória de módulo) e MORRIA no fechamento do
 * app: o aluno que dominou três quizzes voltava e encontrava tudo por
 * responder, travado de novo em algo que já tinha provado. Agora `loadLesson`
 * faz DUAS leituras — o conteúdo e o HISTÓRICO — e o histórico entra no estado
 * pelo redutor PURO `hydrateQuizFromHistory`. A PRECEDÊNCIA é: o estado desta
 * SESSÃO vence chave a chave, e o banco só PREENCHE as chaves que a sessão não
 * tem (toda resposta é escrita primeiro no estado e só depois no banco, cuja
 * gravação é best-effort — para uma chave já tocada o banco só pode estar
 * atrasado). FAIL-CLOSED como o resto: `{ok:false}` ou canal mudo abrem a aula
 * SEM histórico, com aviso `info` — nunca travando o aluno, nunca inventando
 * maestria que ele não conquistou.
 *
 * Entrada (precedência na MONTAGEM — onda1-nav-ui):
 *   1. `nav.challengeErrorReport` (Desafio → Aula, erro) — define o alvo;
 *   2. `pendingTrackLesson` (Trilha → Aula) drenado na MONTAGEM
 *      (src/lib/pendingSubject.ts);
 *   3. `peekLastLesson()` (src/lib/lastLesson.ts) — a ÚLTIMA aula aberta na
 *      sessão (pedido do dono: "quando eu clico em aula eu veja a última aula
 *      aberta ou nenhum"), com o chat RESTAURADO do cache de sessão;
 *   4. sem nenhum dos três, a view mostra o seletor de trilhas (estado
 *      vazio) — nunca gera.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Badge,
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
  Popover,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import SendIcon from '@mui/icons-material/Send';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
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
  chatBubbleTps,
  chatDaySeparator,
  chatHistory,
  clearChallengeError,
  createTrackLessonState,
  hydrateQuizFromHistory,
  injectRemediationQuiz,
  isQuizMastered,
  lessonFinishBlock,
  pendingQuizzes,
  pendingQuizzesForCurrentSection,
  pushUserMessage,
  quizzesByMessageIndex,
  registerQuizExplanation,
  seedChallengeError,
  submitQuizAnswer,
  visibleQuizFor,
  type TrackLessonUiState,
  type VisibleQuiz,
} from '../../lib/trackLessonState';
// ONDA2-QUIZ-OVERLAY: a FASE do overlay (sobre-a-tela / minimizado-no-chat /
// fechado) é de outra máquina, module-level, que sobrevive à desmontagem da
// view. Esta view CONSOME — nunca escreve `setState` cru de fase.
import {
  applyQuizOverlayStep,
  closeQuizOverlay,
  minimizeQuizOverlay,
  openQuizOverlay,
  peekQuizOverlay,
  reopenQuizOverlay,
  subscribeQuizOverlay,
} from '../../lib/quizOverlayState';
import { overlayContextFor, overlayStatusFor, quizCycleTag } from '../../components/quiz/quizOverlayBridge';
import {
  publishQuizOverlayContent,
  type QuizOverlayStatus,
} from '../../components/quiz/quizOverlayContent';
import { QuizChatCard } from '../../components/quiz/QuizChatCard';
import {
  createTrackLessonPendingHolder,
  drainPendingDomain,
  drainPendingLessonId,
  drainPendingSubject,
  setPendingTrackLesson,
} from '../../lib/pendingSubject';
import {
  createLessonChatHolder,
  saveLessonChat,
} from '../../lib/lessonChatCache';
import { peekLastLesson, saveLastLesson } from '../../lib/lastLesson';
// ONDA3 (generate-flow): o processo de "Gerar novo desafio" é GLOBAL (store
// module-level + modal no shell) — a view dispara e o modal mostra as etapas.
import {
  failChallengeGenerate,
  finishChallengeGenerate,
  peekChallengeGenerate,
  startChallengeGenerate,
  subscribeChallengeGenerate,
} from '../../lib/challengeGenerateStore';
import { AnimatePresence, motion } from 'motion/react';
import { fadeInUp, springs } from '../../lib/animationTokens';
import { ChatBubble } from '../../components/chat/ChatBubble';
import { TypingIndicator } from '../../components/chat/TypingIndicator';
// ONDA4 (quiz): confete + anúncio acessível ao CONCLUIR a aula (brilho/celebração).
import { announceStatus, fireConfetti } from '../../lib/confetti';
import { LessonQuizCard } from './LessonQuiz';
import type {
  TrackAssertionDto,
  TrackChallengeSummaryDto,
  TrackLessonPayload,
} from '../../../shared/ipc-contract';
import type { ViewProps } from '../placeholders';

/**
 * ONDA4 (quiz, contrato com a sub-tarefa irmã onda4-next-glow): a irmã
 * entrega `nextLesson` (próxima aula da trilha) no TrackLessonPayload — o
 * merge dela vem ANTES desta onda no main. ENQUANTO o campo não existir no
 * contrato (ipc-contract.ts é da irmã — NÃO edito), este tipo local +
 * cast defensivo mantém o app compilando; após o merge, o campo passa a
 * existir no payload e o cast vira redundância inofensiva.
 */
type LessonPayloadWithNext = TrackLessonPayload & {
  nextLesson?: { slug: string; title: string } | null;
};

/**
 * ONDA2-QUIZ-OVERLAY (larguras alinhadas): a COLUNA DE LEITURA do chat.
 *
 * O defeito que isto conserta: a coluna da aula vai a `min(1920px, 100%)`, o
 * painel de mensagens estava capado em 1000 e o INPUT ficava solto na largura
 * inteira — o eixo de LEITURA e o eixo de ESCRITA não batiam, e em janela
 * fullhd o campo de pergunta terminava quase um palmo à direita do último
 * balão. O número passa a ser UM só, com nome, e vale para o painel de
 * mensagens, para os avisos e para a linha de entrada.
 */
export const CHAT_COLUMN_MAX_PX = 1000;

/** O eixo de leitura E de escrita: painel de mensagens, avisos e entrada. */
const CHAT_COLUMN_SX = { maxWidth: CHAT_COLUMN_MAX_PX, width: '100%', mx: 'auto' } as const;

/**
 * ONDA2-QUIZ-OVERLAY: um quiz RENDERIZÁVEL — a assertion AUTORAL (a que ancora
 * a chave e a seção), o que `visibleQuizFor` devolve para ela (chave canônica,
 * assertion da geração corrente, estado e passo do ciclo) e o índice da bolha
 * do histórico onde ele mora. É o objeto que circula entre a lista, o overlay
 * e o card da conversa — para que nenhum dos três recalcule nada.
 */
interface QuizCardEntry {
  original: TrackAssertionDto;
  visible: VisibleQuiz;
  anchorIndex: number;
}

/** Chave i18n do aviso de canal (fail-closed) por tipo de falha. */
const QUIZ_NOTICE_KEY = {
  'explicacao-indisponivel': 'lesson.quizExplainUnavailable',
  'quiz-indisponivel': 'lesson.quizRemedialUnavailable',
  'registro-nao-gravado': 'lesson.quizAttemptNotSaved',
  // ONDA3-PERSISTENCIA: o histórico do banco não pôde ser lido. A aula ABRE
  // assim mesmo, sem histórico (o comportamento anterior a esta onda) — o que
  // NUNCA acontece é inventar maestria que o aluno não conquistou.
  'historico-indisponivel': 'lesson.quizHistoryUnavailable',
} as const;

type QuizNoticeKind = keyof typeof QUIZ_NOTICE_KEY;

/**
 * ONDA3-PERSISTENCIA: etiqueta do aviso do HISTÓRICO. Ele não pertence a
 * nenhuma volta do ciclo — `quizCycleTag` sempre produz `<chave>#<geração>`,
 * então esta etiqueta jamais casa com a do card em cena e o aviso aparece na
 * faixa própria do chat, que é o certo: a falha é da AULA inteira, não de um
 * quiz.
 */
const QUIZ_HISTORY_NOTICE_TAG = 'historico-da-aula';

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

  // ONDA3 (generate-flow): estado GLOBAL do processo de regeneração — a view
  // lê para GATEAR o botão da bolha (uma geração em voo desabilita o disparo
  // mesmo após remontar a view no meio do processo).
  const theme = useTheme();
  const generateState = useSyncExternalStore(subscribeChallengeGenerate, peekChallengeGenerate);
  // ONDA2-QUIZ-OVERLAY: a FASE do overlay do quiz. Módulo (não useState): o
  // shell monta só a view ativa, e um quiz minimizado precisa sobreviver à
  // troca de aba. A view LÊ para decidir o que desenhar na conversa; quem
  // TRANSICIONA são as funções nomeadas do store.
  const quizOverlay = useSyncExternalStore(subscribeQuizOverlay, peekQuizOverlay);
  const generateRunning = generateState.status === 'running';
  // ONDA3 (revisão MÉDIO-2): token de invalidação da LISTA — incrementa quando
  // uma geração conclui (done no store); a view re-busca a aula (a lista traz
  // o novo no TOPO — pedido C) mesmo se o usuário fechar o modal com X sem
  // navegar. O ref do último token visto evita re-busca no mount (o token
  // inicial é o baseline); o refetch é BEST-EFFORT: falha mantém a lista atual
  // (não derruba o chat em andamento — sem spinner, o payload só é trocado
  // quando chega).
  const listVersion = generateState.listVersion;
  const seenListVersionRef = useRef(listVersion);
  useEffect(() => {
    if (listVersion === seenListVersionRef.current) return;
    seenListVersionRef.current = listVersion;
    const key = trackLessonRef.current;
    if (!key || mountedRef.current === false) return;
    withTimeout(
      getApi().track.lesson({ trackSlug: key.trackSlug, lessonId: key.lessonId }),
      IPC_TIMEOUT_MS,
      'track.lesson',
    )
      .then((res) => {
        if (mountedRef.current === false) return;
        if (res.ok === true && res.lesson) setLesson(res.lesson);
      })
      .catch(() => {
        // refetch silencioso: a lista atual continua válida
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listVersion]);

  // ONDA3 (generate-flow, D): guard de montagem — o processo pode TERMINAR
  // depois que a view desmontou (troca de aba durante a geração): nenhum
  // setState/navegação pós-await com a view desmontada (o desfecho do modal
  // global vem dos eventos do main — o store é quem conclui).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
  // ONDA1-UX (pedido do dono — "não quero aqueles desafios ali"): a lista de
  // desafios saiu do fluxo do chat; o botão "Desafios" do cabeçalho abre um
  // POPOVER ancorado no próprio botão (`challengesAnchorEl`). Fecha ao clicar
  // fora/Esc (padrão MUI).
  const [challengesAnchorEl, setChallengesAnchorEl] = useState<HTMLButtonElement | null>(null);
  const challengesOpen = Boolean(challengesAnchorEl);
  const [doneMarked, setDoneMarked] = useState(false);
  /**
   * ONDA2-QUIZ-OVERLAY — o aviso de CANAL do ciclo do quiz (fail-closed).
   *
   * Ele é do CANAL, nunca do ciclo: a máquina pura (`trackLessonState`) não
   * pode ficar sabendo de rede, então quando `track.quizExplain`/
   * `track.quizRemedial`/`track.quizAttempt` devolvem `{ok:false}` — ou nem
   * chegam a responder — o estágio do ciclo continua exatamente onde estava e
   * é AQUI que a tela guarda o que dizer. A `tag` (`quizCycleTag`) amarra o
   * aviso à volta do ciclo que o produziu: uma geração nova o torna obsoleto
   * sozinha, sem limpeza manual.
   */
  const [quizNotice, setQuizNotice] = useState<{ tag: string; kind: QuizNoticeKind } | null>(null);

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
  // FIX (HIGH, revisor adversarial): PODA de streamingIds contra o histórico —
  // um id ÓRFÃO nasce quando uma bolha digitando é DESMONTADA sem onDone:
  // o cleanup do TypewriterText limpa o timer SEM chamar onDone, e o
  // openPrerequisite (chip de pré-requisito — sempre habilitado, o busy não
  // trava) SUBSTITUI o histórico no MEIO da digitação (createTrackLessonState
  // → chat novo). Sem esta poda, o id morto ficaria no Set e `streamingIds.size
  // > 0` renderizaria "tutor digitando…" PARA SEMPRE após a 1ª mensagem da
  // nova aula. Os ids SÃO índices do histórico: histórico trocado/encolhido →
  // ids fora de alcance → podados aqui. Fluxo normal intacto: o append só
  // CRESCE o length — ids < length continuam válidos (e o efeito devolve
  // `prev` sem re-render quando nada mudou).
  useEffect(() => {
    setStreamingIds((prev) => {
      const valid = new Set([...prev].filter((id) => id < chat.history.length));
      return valid.size === prev.size ? prev : valid;
    });
  }, [chat.history.length]);

  // ─── ONDA10 (bug 3, parte 2): PULAR a digitação ───────────────────────────
  // Com a teoria em velocidade de LEITURA (7 tps), quem lê rápido não pode
  // ficar esperando: um CLIQUE no painel, QUALQUER tecla ou o botão "Mostrar
  // tudo" completam as bolhas que estão digitando AGORA.
  //
  // O pedido é guardado como o TAMANHO do histórico no momento do pedido, e
  // não como um booleano: assim ele EXPIRA sozinho, no RENDER, quando uma
  // mensagem nova entra (`skipAtLen !== history.length`). Um booleano com
  // reset por efeito não serviria — os efeitos do FILHO (TypewriterText)
  // rodam ANTES dos do pai, então a bolha nova nasceria já pulada.
  const [skipAtLen, setSkipAtLen] = useState<number | null>(null);
  const skipTyping = skipAtLen !== null && skipAtLen === chat.history.length;
  const requestSkipTyping = useCallback((): void => {
    setSkipAtLen(chat.history.length);
  }, [chat.history.length]);
  // Tecla: só escuta ENQUANTO alguma bolha digita (nenhum listener global
  // pendurado no resto do tempo) e em CAPTURE, para valer mesmo com o foco no
  // campo de pergunta — quem já está fazendo outra coisa não deve esperar a
  // animação. `keydown` cobre teclado; o clique vem do onClick do painel.
  const typingNow = streamingIds.size > 0;
  useEffect(() => {
    if (!typingNow) return;
    const onKey = (): void => requestSkipTyping();
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [typingNow, requestSkipTyping]);

  // Região com scroll do chat (a Box com overflowY do render).
  const logScrollRef = useRef<HTMLDivElement | null>(null);
  // ONDA2-CHAT-NINTENDO (auto-scroll suave — pedido do dono: "suavize com
  // scrollTo({behavior:'smooth'}) apenas quando o usuário está no fim"):
  // o painel só é PUXADO para o fim quando o usuário ESTÁ no fim (ou acabou
  // de abrir a aula — scrollTop 0 sem scroll manual). Se ele rolou para cima
  // para reler, NADA o puxa de volta (mudança em relação à Onda 2, que
  // puxava SEMPRE durante a digitação — decisão documentada: o novo
  // comportamento respeita a leitura; o fim à vista no fluxo normal é
  // preservado porque o usuário ativo está no fim).
  const NEAR_BOTTOM_PX = 120;
  const isNearBottom = useCallback((): boolean => {
    const el = logScrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;
  }, []);
  // Auto-scroll DURANTE a digitação: a cada step do typewriter (onStreamTick)
  // o painel acompanha o fim — mas só se o usuário está no fim. DECISÃO:
  // o tick usa scroll INSTANTÂNEO (scrollTop = scrollHeight), NUNCA smooth —
  // a ~2.5ms por step a 100 tps o smooth não completaria e o streaming
  // "pularia" (o tick é o que mantém a digitação visível).
  const handleStreamTick = useCallback((): void => {
    const el = logScrollRef.current;
    if (el && isNearBottom()) el.scrollTop = el.scrollHeight;
  }, [isNearBottom]);
  // Nudge de fim: quando o conjunto de mensagens digitando muda (início/fim)
  // ou o histórico cresce (mensagem nova entra), leva o fim à vista com
  // SMOOTH — mas só se o usuário está no fim OU o painel acabou de montar
  // (scrollTop 0 e histórico presente: abrir a aula — inclusive o fluxo de
  // erro — deve cair no FIM, não ficar no topo).
  useEffect(() => {
    const el = logScrollRef.current;
    if (!el) return;
    const fresh = el.scrollTop === 0 && chat.history.length > 0;
    if (isNearBottom() || fresh) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [chat.history.length, streamingIds, isNearBottom]);

  // ONDA2-IMESSAGE (gating do "Concluir aula"): bloqueado quando há desafios
  // E algum NÃO passou (lastVerdict !== 'passed' — null = nunca tentado). O
  // payload track.lesson é RE-BUSCADO na abertura da aula — um desafio
  // passado na ChallengeView reflete aqui na volta. Sem desafios → liberado.
  // Guard de null ANTES do lesson carregar (os early returns de loading/erro
  // usam o estado abaixo sem renderizar o botão).
  //
  // ONDA10 (bug 2 — "o quiz pode ser ignorado; quero que o usuario tenha que
  // responder"): o QUIZ entrou no gate. Duas travas, ambas por `answered`
  // (NUNCA por `correct` — errar não trava o aluno):
  //   - `quizPendingAll`  → "Concluir aula": todo quiz já VISÍVEL respondido;
  //   - `quizPendingHere` → "Próximo": o quiz da seção ATUAL respondido.
  // A decisão de travar TAMBÉM o "Próximo" (mais intrusivo) é deliberada: sem
  // ela o aluno atropela o "Próximo" até o fim e encontra uma PILHA de quizzes
  // na linha de chegada — o quiz deixaria de ser formativo (respondido fora do
  // contexto da seção) e viraria pedágio. Travando por seção, o desbloqueio
  // está SEMPRE a um clique de distância, com a teoria fresca na tela.
  const lessonAssertions = useMemo(() => lesson?.assertions ?? [], [lesson]);
  const quizPendingAll = useMemo(
    () => pendingQuizzes(chat, lessonAssertions),
    [chat, lessonAssertions],
  );
  const quizPendingHere = useMemo(
    () => pendingQuizzesForCurrentSection(chat, lessonAssertions),
    [chat, lessonAssertions],
  );
  const nextBlockedByQuiz = quizPendingHere.length > 0;
  // Motivo do bloqueio do "Concluir aula" ('quiz' | 'challenges' | null) — a
  // UI DIZ qual é (nada de botão morto e mudo).
  const finishBlock = lesson ? lessonFinishBlock(lesson.challenges, quizPendingAll.length) : null;
  const finishBlocked = finishBlock !== null;

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

  /**
   * ONDA3-PERSISTENCIA: a aula que o ÚLTIMO `loadLesson` pediu. Escrito de
   * forma SÍNCRONA no começo de cada carregamento e lido quando o histórico
   * volta, ele responde a uma pergunta só: "o histórico que chegou ainda é o
   * da aula que está sendo carregada?". O caminho que torna a pergunta real é
   * o chip de PRÉ-REQUISITO — ele troca de aula sem cancelar o carregamento
   * anterior (`openPrerequisite` descarta o cancelador), e sem esta guarda o
   * histórico da aula ANTIGA poderia hidratar o chat da aula NOVA. Um ref, e
   * não estado, porque nada nesta comparação re-renderiza.
   */
  const loadTargetRef = useRef<{ trackSlug: string; lessonId: string } | null>(null);

  /** Carrega uma aula da trilha via IPC — SEMPRE com timeout: se o canal não
   * responder em `IPC_TIMEOUT_MS`, cai no loadError com mensagem própria
   * (nenhum spinner eterno) e o usuário tem o botão de tentar de novo.
   *
   * ONDA3-PERSISTENCIA: carregar a aula passou a ser DUAS leituras — o
   * conteúdo (`track.lesson`) e o HISTÓRICO do quiz (`track.quizHistory`), que
   * é o que faz a maestria sobreviver ao FECHAMENTO do app. O cache de sessão
   * já a fazia sobreviver à troca de aba; ele morre com o processo, e o aluno
   * que dominou três quizzes voltava e encontrava tudo por responder. As duas
   * leituras são independentes e falham independentemente: sem histórico a
   * aula ABRE (com aviso), porque travar o aluno seria pior que perder a
   * memória de uma sessão.
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
      loadTargetRef.current = { trackSlug, lessonId };
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
      // ONDA3-PERSISTENCIA: o HISTÓRICO do quiz desta aula, lido AQUI e só
      // aqui. Pedido INDEPENDENTE (não encadeado no track.lesson): o conteúdo
      // da aula e o que o aluno já respondeu não dependem um do outro, e
      // serializá-los só somaria latência ao spinner. A hidratação usa a forma
      // FUNCIONAL do setChat de propósito — ela precisa enxergar o estado
      // MAIS RECENTE, que pode ter acabado de ser restaurado do cache de
      // sessão (o efeito de montagem faz setChat(cached) e chama loadLesson na
      // sequência); é `hydrateQuizFromHistory` quem decide a precedência, e
      // ela é: a sessão vence, o banco só preenche o que falta.
      withTimeout(
        getApi().track.quizHistory({ trackSlug, lessonId }),
        IPC_TIMEOUT_MS,
        'track.quizHistory',
      )
        .then((res) => {
          if (cancelled || mountedRef.current === false) return;
          // Outra aula já entrou (chip de pré-requisito): este histórico é de
          // uma aula que não está mais na tela — nem hidrata, nem avisa.
          const alvo = loadTargetRef.current;
          if (alvo === null || alvo.trackSlug !== trackSlug || alvo.lessonId !== lessonId) return;
          if (res.ok === false) {
            setQuizNotice({ tag: QUIZ_HISTORY_NOTICE_TAG, kind: 'historico-indisponivel' });
            return;
          }
          setChat((st) => hydrateQuizFromHistory(st, res.attempts, res.remediations));
          // O aviso de histórico é do CARREGAMENTO: uma leitura que deu certo
          // aposenta o dele (inclusive o de OUTRA aula, no caminho do chip de
          // pré-requisito), e nunca o do ciclo do quiz, que é de outra falha.
          setQuizNotice((prev) => (prev !== null && prev.kind === 'historico-indisponivel' ? null : prev));
        })
        .catch(() => {
          // FAIL-CLOSED: canal mudo ou estourado é a MESMA coisa que {ok:false}
          // — a aula abre SEM histórico (o comportamento anterior a esta onda).
          // O aluno responde de novo o que já tinha dominado; ele nunca fica
          // preso, e maestria nenhuma é inventada.
          if (cancelled || mountedRef.current === false) return;
          const alvo = loadTargetRef.current;
          if (alvo === null || alvo.trackSlug !== trackSlug || alvo.lessonId !== lessonId) return;
          setQuizNotice({ tag: QUIZ_HISTORY_NOTICE_TAG, kind: 'historico-indisponivel' });
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
          // ONDA1-NAV-UI: a aula do erro também vira a "última aula aberta" —
          // voltar à aba Aula depois (sem report/pendência) a restaura.
          saveLastLesson(report.trackSlug, report.lessonId);
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
              // FIX (REPLAN, débito Onda 1): filesTitle faltava — sem ele o
              // default pt-BR ('Código submetido') vazava para o locale en.
              filesTitle: tIRef.current('lesson.errorBubbleFilesTitle'),
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
        // ONDA1-NAV-UI: abre uma aula → grava como "última aberta" (a próxima
        // montagem sem alvo a restaura — pedido do dono).
        saveLastLesson(pending.trackSlug, pending.lessonId);
        publishSession({ subject: pending.lessonId, status: 'idle' });
        // ONDA3 (chat-cache): o chat volta EXATAMENTE onde estava — o restore
        // devolve history/presentedSections completos (theoryDone incluso), e
        // o 'next' segue da seção seguinte sem código extra. Sem cache →
        // comportamento atual (chat novo, teoria da seção 1).
        setChat(cached ?? createTrackLessonState());
        return loadLesson(pending.trackSlug, pending.lessonId);
      }
    } else {
      // ONDA1-NAV-UI (3ª precedência): sem report e sem pendência → restaura
      // a ÚLTIMA aula aberta na sessão (peek NÃO é one-shot: no double-invoke
      // do StrictMode cada passada re-restaura a MESMA aula — setTrackLesson
      // idempotente + loadLesson re-disparado, exatamente como o galho do
      // report; o chat vem do cacheHolder retido (padrão anti-StrictMode da
      // casa — o take one-shot não é repetido na 2ª passada)). Nunca abriu
      // aula → estado vazio (comportamento atual).
      const last = peekLastLesson();
      if (last) {
        if (cacheHolderRef.current === null) {
          cacheHolderRef.current = createLessonChatHolder({
            trackSlug: last.trackSlug,
            lessonId: last.lessonId,
          });
        }
        const cached = cacheHolderRef.current.get();
        setTrackLesson({ trackSlug: last.trackSlug, lessonId: last.lessonId });
        // Re-save idempotente: mantém o store consistente (a restauração É
        // uma "abertura" — a próxima montagem restaura a mesma aula).
        saveLastLesson(last.trackSlug, last.lessonId);
        publishSession({ subject: last.lessonId, status: 'idle' });
        setChat(cached ?? createTrackLessonState());
        return loadLesson(last.trackSlug, last.lessonId);
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
    // ONDA10 (bug 2): a seção ATUAL tem quiz sem resposta → o avanço da teoria
    // não sai daqui. Defensivo: o botão já vem desabilitado (com a explicação
    // VISÍVEL ao lado), mas um atalho/estado antigo também esbarra no guard.
    if (nextBlockedByQuiz) return;
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
  }, [trackLesson, busy, nextBlockedByQuiz, chat.presentedSections, chat.history, tI, markNew]);

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
    // ONDA10: `finishBlocked` cobre desafios pendentes E quiz sem resposta.
    if (!trackLesson || busy || !chat.theoryDone || doneMarked || finishBlocked) return;
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
      // ONDA4 (brilho ao concluir — pedido do dono): rajada de confete +
      // anúncio acessível role="status" (a LessonView reusa confetti.ts; o
      // anúncio acontece MESMO com prefers-reduced-motion — o movimento é
      // que é suprimido, nunca a informação).
      fireConfetti();
      announceStatus(tI('lesson.lessonCompleted'));
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
  }, [trackLesson, busy, chat.theoryDone, doneMarked, finishBlocked, lesson?.title, publishSession, tI]);

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
   *  preservado).
   *
   *  ONDA3 (generate-flow): o processo agora é GLOBAL — dispara via
   *  challengeGenerateStore + o IPC; o modal de etapas (no shell) mostra o
   *  progresso real (eventos do main) e a CONCLUSÃO navega pelo botão "Ver
   *  desafio" do próprio modal (decisão documentada: a navegação automática
   *  da view caiu — o modal cobre os dois fluxos e o caso "navegou durante a
   *  geração"; o chat.lastError permanece por compat, mas o modal é quem
   *  mostra o erro). `busy` + `generateRunning` gateiam o botão. */
  const handleRegenerateFromBubble = useCallback(async (): Promise<void> => {
    if (!trackLesson || busy || generateRunning) return;
    const generationId = startChallengeGenerate({
      trackSlug: trackLesson.trackSlug,
      lessonId: trackLesson.lessonId,
      // BAIXO-3: a bolha da aula navega com target 'lesson'.
      target: 'lesson',
    });
    if (generationId === null) {
      // Já existe um processo em voo (ex.: disparado por outra view) — o modal
      // global é o único processo; nada a fazer aqui.
      return;
    }
    setBusy(true);
    try {
      const res = await withTimeout(
        getApi().track.challengeRegenerate({
          trackSlug: trackLesson.trackSlug,
          lessonId: trackLesson.lessonId,
          // ALTO-2: o main ecoa o id nos eventos de progresso — o modal
          // descarta eventos de processos anteriores.
          generationId,
        }),
        ACTION_TIMEOUTS.challengeRegenerate,
        'track.challengeRegenerate',
      );
      if (mountedRef.current === false) return;
      if (res.ok && res.challenge) {
        // O modal global (sempre montado) já recebeu o 'done' do main — este
        // finish é idempotente (estado terminal sticky + correlação no store).
        finishChallengeGenerate({ slug: res.challenge.slug, title: res.challenge.title }, generationId);
      } else {
        const msg = res.error?.message ?? tI('lesson.regenerateFailed');
        failChallengeGenerate(msg, generationId);
        setChat((s) => ({ ...s, lastError: msg }));
      }
    } catch (err) {
      if (mountedRef.current === false) return;
      const msg = isTimeoutError(err) ? tI('challenge.regenerateTimeout') : String(err);
      failChallengeGenerate(msg, generationId);
      setChat((s) => ({ ...s, lastError: msg }));
    } finally {
      if (mountedRef.current !== false) setBusy(false);
    }
  }, [trackLesson, busy, generateRunning, tI]);

  /** Revisão de uma aula ANTERIOR da trilha (aluno não entendeu). */
  const openPrerequisite = useCallback(
    (slug: string): void => {
      if (!trackLesson) return;
      setTrackLesson({ trackSlug: trackLesson.trackSlug, lessonId: slug });
      // ONDA1-NAV-UI: abrir uma aula anterior (pré-requisito) também atualiza
      // a "última aula aberta" — voltar à aba Aula restaura ESTA aula.
      saveLastLesson(trackLesson.trackSlug, slug);
      // ONDA2-QUIZ-OVERLAY: trocar de AULA é o único caminho que abandona um
      // quiz sem dominá-lo. O overlay fecha explicitamente aqui — o efeito de
      // fase só fecha por maestria, e sem isto o card da aula anterior ficaria
      // sobre a tela da aula nova.
      closeQuizOverlay();
      setChat(createTrackLessonState);
      setDoneMarked(false);
      setLoadError(null);
      publishSession({ subject: slug, status: 'idle' });
      loadLesson(trackLesson.trackSlug, slug);
    },
    [trackLesson, loadLesson, publishSession],
  );

  // ─── ONDA4 (quiz): múltipla escolha por afirmação DURANTE a aula ──────────
  // Quizzes por índice da bolha do histórico (REPLAN A1): assertion com
  // sectionId → bolha da seção que a demonstra ('next'); assertion SEM
  // sectionId (trilhas antigas) → bolha da ÚLTIMA seção apresentada (fallback
  // determinístico).
  //
  // A CHAVE do estado do quiz (quizBySection) é assunto de trackLessonState,
  // NÃO desta view: quem a produz é `quizKeyFor` (`sectionId::assertionId`),
  // e a view a recebe pronta em `visibleQuizFor(...).key` no render do card.
  // ONDA1-MAESTRIA: a view calculava a chave INLINE pela fórmula ANTIGA (a
  // sectionId sozinha, com a id como fallback) e escrevia numa chave que o gate
  // (`pendingQuizzes`, que chama `quizKeyFor`) nunca lia. Nenhum cálculo de
  // chave sobrevive aqui; `handleQuizSelect` só repassa a chave recebida.
  const quizzesByIndex = useMemo(
    () => quizzesByMessageIndex(chat, lessonAssertions),
    [chat, lessonAssertions],
  );

  /** Payload da aula lido por REF pelos callbacks do ciclo do quiz (o pedido é
   *  disparado por efeito e não pode re-registrar a cada re-render). */
  const lessonRef = useRef(lesson);
  lessonRef.current = lesson;

  // ─── ONDA2-QUIZ-OVERLAY: o quiz sobe SOBRE A TELA e desce PARA O CHAT ─────
  // O dono, textualmente: "o layout do quiz deve ser sobre a tela e respondendo
  // ele minimiza para ficar no chat" e "só vamos para o desafio depois que o
  // aluno provar que entendeu".
  //
  // Esta view NÃO implementa o ciclo — ele já existe, puro e testado, em
  // `trackLessonState` (submitQuizAnswer → registerQuizExplanation →
  // injectRemediationQuiz → dominado) e em `quizOverlayState` (a fase do
  // overlay). O que mora aqui são as TRÊS ligações que só a tela pode fazer:
  //
  //   (1) QUAL quiz está em cena  — `activeQuizCard`;
  //   (2) QUANDO cada passo vira pedido IPC — o efeito "motor" abaixo;
  //   (3) O QUE o overlay do shell desenha — `publishQuizOverlayContent`.
  //
  // A lista completa dos quizzes RENDERIZÁVEIS, na ordem das bolhas (a mesma
  // ordem determinística de `pendingQuizzes`): a chave, a assertion da geração
  // corrente e o passo do ciclo saem TODOS de `visibleQuizFor` — nenhuma conta
  // de chave sobrevive nesta view.
  const quizCards = useMemo((): QuizCardEntry[] => {
    const out: QuizCardEntry[] = [];
    for (const idx of [...quizzesByIndex.keys()].sort((a, b) => a - b)) {
      for (const original of quizzesByIndex.get(idx) ?? []) {
        out.push({ original, visible: visibleQuizFor(chat, original), anchorIndex: idx });
      }
    }
    return out;
  }, [chat, quizzesByIndex]);

  // Os que ainda pedem alguma coisa do aluno (não dominados) e cuja bolha JÁ
  // terminou de ser escrita — um quiz nunca interrompe a leitura da seção que
  // o demonstra.
  const pendingQuizCards = useMemo(
    () => quizCards.filter((c) => c.visible.step.kind !== 'dominado' && !streamingIds.has(c.anchorIndex)),
    [quizCards, streamingIds],
  );

  /**
   * O quiz EM CENA. Precedência deliberada: se o store já está aberto numa
   * chave que continua pendente, é ELA — assim um quiz que o aluno abriu (ou
   * minimizou) na mão não é trocado por baixo dele no próximo render. Só
   * quando o store não aponta para nada pendente é que entra o PRIMEIRO da
   * ordem determinística.
   */
  const activeQuizCard = useMemo((): QuizCardEntry | null => {
    const openKey = quizOverlay.quizKey;
    const held = openKey === null ? undefined : pendingQuizCards.find((c) => c.visible.key === openKey);
    return held ?? pendingQuizCards[0] ?? null;
  }, [pendingQuizCards, quizOverlay.quizKey]);

  const activeQuizCardRef = useRef(activeQuizCard);
  activeQuizCardRef.current = activeQuizCard;
  const quizCardsRef = useRef(quizCards);
  quizCardsRef.current = quizCards;

  /** Etiqueta da volta do ciclo em cena (null = nenhum quiz em cena). */
  const activeQuizTag = activeQuizCard
    ? quizCycleTag(activeQuizCard.visible.key, activeQuizCard.visible.generation)
    : null;
  /** O aviso pertence à volta em cena? (uma geração nova o aposenta sozinha) */
  const activeNotice = quizNotice !== null && quizNotice.tag === activeQuizTag ? quizNotice.kind : null;
  const quizNoticeText = quizNotice === null ? null : tI(QUIZ_NOTICE_KEY[quizNotice.kind]);
  const activeNoticeText = activeNotice === null ? null : tI(QUIZ_NOTICE_KEY[activeNotice]);

  /**
   * O que a tela DIZ sobre o quiz em cena. A tradução do passo é da função
   * pura `overlayStatusFor`; os dois ajustes abaixo são do CANAL:
   *   - 'quiz-indisponivel' → o ciclo PAROU e espera o "tentar de novo";
   *   - 'explicacao-indisponivel' → a explicação não pôde ser escrita, mas o
   *     ciclo SEGUE (`injectRemediationQuiz` aceita o estágio 'explicando' —
   *     caminho de degradação documentado lá). O card já diz "preparando um
   *     quiz novo", porque é isso que está acontecendo.
   */
  const activeQuizStatus = useMemo((): QuizOverlayStatus => {
    if (activeQuizCard === null) return 'aguardando';
    const step = activeQuizCard.visible.step;
    if (activeNotice === 'explicacao-indisponivel' && step.kind === 'explicar-erro') return 'gerando';
    return overlayStatusFor(step, activeNotice === 'quiz-indisponivel');
  }, [activeQuizCard, activeNotice]);

  /**
   * RESPOSTA do aluno — o gesto que o dono pediu: registrar e MINIMIZAR.
   *
   * Ordem: a máquina pura primeiro (`submitQuizAnswer` — idempotente, a
   * primeira resposta da geração vence), a fase depois. O canal
   * `track.quizAttempt` é disparado aqui e SÓ AQUI: ele devolve a maestria já
   * recalculada, então não existe um segundo invoke (nada de `quizHistory`
   * atrás dele) — e falhar a gravação NÃO desfaz a resposta, só acende o aviso
   * de que ela vale nesta sessão.
   *
   * Deps [] de propósito: todo insumo mutável entra por ref, para que a
   * identidade do callback fique estável — é ela que o registro de conteúdo do
   * overlay compara para não notificar o shell a cada render.
   */
  const handleQuizAnswer = useCallback((card: QuizCardEntry, answerIndex: number): void => {
    const { visible } = card;
    // Dominado ou já respondido nesta geração: `submitQuizAnswer` seria no-op,
    // e o canal não pode gravar uma tentativa que o estado recusa.
    if (visible.step.kind === 'dominado' || visible.quiz?.answered === true) return;
    const correctIndex = visible.assertion.answerIndex;
    const correct = answerIndex === correctIndex;
    setChat((st) => submitQuizAnswer(st, visible.key, answerIndex, correctIndex));
    // O CARD DESCE PARA A CONVERSA no mesmo gesto (o pedido literal do dono).
    minimizeQuizOverlay(visible.key);
    setQuizNotice(null);
    const ctx = trackLessonRef.current;
    if (!ctx) return;
    const tag = quizCycleTag(visible.key, visible.generation);
    withTimeout(
      getApi().track.quizAttempt({
        trackSlug: ctx.trackSlug,
        lessonId: ctx.lessonId,
        // A unidade do gate DESTA base é a afirmação, não a seção — e o
        // contrato declara `sectionKey` como string livre justamente por isso.
        // Gravar a chave canônica mantém a maestria do banco alinhada com a
        // maestria que o "Próximo"/"Concluir aula" lê em memória.
        sectionKey: visible.key,
        assertionId: visible.assertion.id,
        selectedIndex: answerIndex,
        correct,
        quizOrigin: visible.generation === 0 ? 'authored' : 'remedial',
      }),
      IPC_TIMEOUT_MS,
      'track.quizAttempt',
    )
      .then((res) => {
        if (mountedRef.current === false) return;
        if (res.ok === false) setQuizNotice({ tag, kind: 'registro-nao-gravado' });
      })
      .catch(() => {
        if (mountedRef.current !== false) setQuizNotice({ tag, kind: 'registro-nao-gravado' });
      });
  }, []);

  /** O overlay do shell responde por aqui (identidade estável — lê o ref). */
  const handleOverlaySelect = useCallback((answerIndex: number): void => {
    const card = activeQuizCardRef.current;
    if (card) handleQuizAnswer(card, answerIndex);
  }, [handleQuizAnswer]);

  /** Minimizar (Esc, backdrop, botão do cabeçalho do overlay). */
  const handleQuizMinimize = useCallback((): void => {
    minimizeQuizOverlay();
  }, []);

  /** Trazer um quiz de volta para cima da tela (botão do card da conversa). */
  const handleQuizReopen = useCallback((quizKey: string): void => {
    const snapshot = peekQuizOverlay();
    if (snapshot.quizKey === quizKey && snapshot.phase === 'minimizado-no-chat') {
      reopenQuizOverlay(quizKey);
      return;
    }
    const card = quizCardsRef.current.find((c) => c.visible.key === quizKey);
    if (card) openQuizOverlay(overlayContextFor(card.original, card.visible, card.anchorIndex));
  }, []);

  /** "Tentar de novo" depois de um canal fora do ar — limpa o aviso e o efeito
   *  motor abaixo volta a disparar o passo que estava parado. */
  const handleQuizRetry = useCallback((): void => {
    setQuizNotice(null);
  }, []);

  // ─── (2) O MOTOR: cada passo do ciclo vira um pedido ao main ──────────────
  // Um pedido por vez e por volta do ciclo (`inFlightRef`, chaveado por
  // etiqueta + passo): o efeito re-executa a cada mudança do chat, e sem o
  // guarda o StrictMode do dev dispararia a explicação duas vezes.
  const quizInFlightRef = useRef<Set<string>>(new Set());

  const driveQuizCycle = useCallback(async (card: QuizCardEntry): Promise<void> => {
    const ctx = trackLessonRef.current;
    const payload = lessonRef.current;
    if (!ctx || !payload) return;
    const { original, visible } = card;
    const step = visible.step;
    const tag = quizCycleTag(visible.key, visible.generation);
    const found = payload.theory.find((sec) => sec.id === original.sectionId);
    const theorySection = found === undefined ? null : found;
    // O material da aula ANCORA a explicação e o quiz novo (o main decide o
    // orçamento de contexto; a view não inventa corte).
    const lessonExcerpt = [payload.title, payload.summary, ...payload.theory.map((sec) => sec.markdown)].join('\n\n');
    const quizOrigin = visible.generation === 0 ? 'authored' : 'remedial';

    if (step.kind === 'explicar-erro') {
      const gate = `${tag}#explicar`;
      if (quizInFlightRef.current.has(gate)) return;
      quizInFlightRef.current.add(gate);
      try {
        const res = await withTimeout(
          getApi().track.quizExplain({
            trackSlug: ctx.trackSlug,
            lessonId: ctx.lessonId,
            sectionKey: visible.key,
            assertion: visible.assertion,
            selectedIndex: step.selected,
            quizOrigin,
            theorySection,
            lessonExcerpt,
          }),
          // Mesmo orçamento do turno 'answer': os dois são chamada de LLM, e
          // 70s já é o teto calibrado acima do abort de 45s do main.
          ACTION_TIMEOUTS.answer,
          'track.quizExplain',
        );
        if (mountedRef.current === false) return;
        if (res.ok === true && res.explanation.trim() !== '') {
          // A explicação vira BOLHA da conversa (kind 'quiz-explanation') e o
          // ciclo avança para 'novo-quiz-pendente'. O índice é marcado ANTES
          // do append (mesmo padrão do 'next'/'answer'): a bolha da explicação
          // é mensagem NOVA da sessão e por isso DIGITA, em vez de aparecer
          // pronta como as restauradas do cache.
          const explanationIndex = chatRef.current.history.length;
          setChat((st) =>
            registerQuizExplanation(
              st,
              visible.key,
              {
                question: visible.assertion.question,
                chosenOption: visible.assertion.options[step.selected] ?? '',
                explanation: res.explanation,
              },
              {
                title: tIRef.current('lesson.quizExplanationTitle'),
                chosen: tIRef.current('lesson.quizExplanationChosen'),
              },
            ),
          );
          markNew(explanationIndex);
          setQuizNotice(null);
        } else {
          // FAIL-CLOSED: nada de explicação inventada. O aluno NÃO trava — o
          // ciclo segue para o quiz novo pelo caminho de degradação que
          // `injectRemediationQuiz` documenta (ele aceita 'explicando').
          setQuizNotice({ tag, kind: 'explicacao-indisponivel' });
        }
      } catch {
        if (mountedRef.current !== false) setQuizNotice({ tag, kind: 'explicacao-indisponivel' });
      } finally {
        quizInFlightRef.current.delete(gate);
      }
      return;
    }

    // 'gerar-novo-quiz' — o quiz REMEDIADOR sobre o mesmo conteúdo.
    const gate = `${tag}#remediar`;
    if (quizInFlightRef.current.has(gate)) return;
    quizInFlightRef.current.add(gate);
    try {
      // Nunca-repetir: as perguntas que este aluno já viu nesta afirmação.
      const asked = [...new Set([original.question, visible.assertion.question])];
      const explanation = visible.quiz?.explanation;
      const res = await withTimeout(
        getApi().track.quizRemedial({
          trackSlug: ctx.trackSlug,
          lessonId: ctx.lessonId,
          sectionKey: visible.key,
          originAssertionId: original.id,
          generation: visible.generation + 1,
          assertion: original,
          ...(typeof explanation === 'string' && explanation !== '' ? { explanation } : {}),
          askedQuestions: asked,
          theorySection,
          lessonExcerpt,
        }),
        ACTION_TIMEOUTS.answer,
        'track.quizRemedial',
      );
      if (mountedRef.current === false) return;
      if (res.ok === true) {
        // Geração N+1, card zerado, ciclo de volta a 'aguardar-resposta' — e o
        // efeito de fase abaixo o traz SOBRE A TELA de novo.
        setChat((st) => injectRemediationQuiz(st, visible.key, res.quiz));
        setQuizNotice(null);
      } else {
        // FAIL-CLOSED: nenhum quiz inventado. O ciclo PARA e a tela oferece
        // repetir — travar em silêncio seria pior que falhar.
        setQuizNotice({ tag, kind: 'quiz-indisponivel' });
      }
    } catch {
      if (mountedRef.current !== false) setQuizNotice({ tag, kind: 'quiz-indisponivel' });
    } finally {
      quizInFlightRef.current.delete(gate);
    }
  }, [markNew]);

  useEffect(() => {
    if (activeQuizCard === null) return;
    const step = activeQuizCard.visible.step;
    if (step.kind !== 'explicar-erro' && step.kind !== 'gerar-novo-quiz') return;
    // O canal caiu nesta volta: espera o "tentar de novo" do aluno (nada de
    // laço de retentativa contra uma IA que está fora).
    if (activeNotice === 'quiz-indisponivel') return;
    // A explicação não pôde ser escrita: o passo continua 'explicar-erro' na
    // máquina pura, mas o pedido que falta é o do QUIZ NOVO.
    if (activeNotice === 'explicacao-indisponivel' && step.kind === 'explicar-erro') {
      void driveQuizCycle({
        ...activeQuizCard,
        visible: { ...activeQuizCard.visible, step: { kind: 'gerar-novo-quiz', generation: step.generation } },
      });
      return;
    }
    void driveQuizCycle(activeQuizCard);
  }, [activeQuizCard, activeNotice, driveQuizCycle]);

  // ─── (1) A FASE do overlay acompanha o passo do ciclo ─────────────────────
  // `applyQuizOverlayStep` é o atalho declarado do store: 'aguardar-resposta'
  // sobe o card SOBRE A TELA, 'explicar-erro'/'gerar-novo-quiz' o mantêm
  // MINIMIZADO na conversa (é lá que a explicação e o quiz novo chegam) e
  // 'dominado' FECHA. Ele é idempotente por referência, então re-executar não
  // ressuscita um card que o aluno minimizou na mão.
  useEffect(() => {
    if (activeQuizCard !== null) {
      applyQuizOverlayStep(
        overlayContextFor(activeQuizCard.original, activeQuizCard.visible, activeQuizCard.anchorIndex),
        activeQuizCard.visible.step,
      );
      return;
    }
    // Sem quiz em cena o overlay só FECHA quando a chave aberta foi mesmo
    // DOMINADA. O guard não é zelo: a view remonta a cada volta para a aba
    // Aula, e no primeiro render `lesson` ainda é null — fechar aqui apagaria,
    // toda vez, exatamente a fase que o store existe para preservar.
    const openKey = quizOverlay.quizKey;
    if (lesson !== null && openKey !== null && isQuizMastered(chat, openKey)) {
      closeQuizOverlay(openKey);
    }
  }, [activeQuizCard, quizOverlay.quizKey, lesson, chat]);

  // ─── (3) O que o overlay do SHELL desenha ─────────────────────────────────
  // O overlay é montado em App.tsx (o molde do ChallengeGenerateModal) e o
  // conteúdo do quiz vive aqui: esta é a publicação. Sair da aba Aula desmonta
  // a view e o cleanup publica null — o overlay sai da tela, mas a FASE segue
  // no store e as respostas seguem no cache do chat: voltar reabre no mesmo
  // ponto, na mesma geração.
  useEffect(() => {
    if (activeQuizCard === null) {
      publishQuizOverlayContent(null);
      return;
    }
    publishQuizOverlayContent({
      quizKey: activeQuizCard.visible.key,
      assertion: activeQuizCard.visible.assertion,
      quiz: activeQuizCard.visible.quiz,
      generation: activeQuizCard.visible.generation,
      status: activeQuizStatus,
      notice: activeNoticeText,
      onSelect: handleOverlaySelect,
      onMinimize: handleQuizMinimize,
      onRetry: activeQuizStatus === 'indisponivel' ? handleQuizRetry : null,
    });
  }, [
    activeQuizCard,
    activeQuizStatus,
    activeNoticeText,
    handleOverlaySelect,
    handleQuizMinimize,
    handleQuizRetry,
  ]);

  useEffect(() => {
    return () => {
      publishQuizOverlayContent(null);
    };
  }, []);

  // ─── ONDA4 (pós-conclusão): próxima aula da trilha ────────────────────────
  // `nextLesson` é entrega da sub-tarefa irmã (onda4-next-glow) — merge dela
  // vem ANTES no main (ver LessonPayloadWithNext no topo: cast defensivo
  // enquanto o campo não existe no contrato). Sem nextLesson → o botão cai no
  // roadmap (a trilha reflete a aula recém-concluída).
  const nextLesson = useMemo(
    () => (lesson as LessonPayloadWithNext | null)?.nextLesson ?? null,
    [lesson],
  );
  const handleGoToNextLesson = useCallback((): void => {
    if (!trackLesson) return;
    if (nextLesson?.slug) {
      setPendingTrackLesson(trackLesson.trackSlug, nextLesson.slug);
      navigate('lesson');
    } else {
      navigate('roadmap');
    }
  }, [trackLesson, nextLesson, navigate]);

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

  // ONDA1-UX (pedido do dono): contagem de desafios PENDENTES para o badge do
  // botão "Desafios" — MESMO critério do gating (isLessonFinishBlocked):
  // lastVerdict !== 'passed' (null = nunca tentado, failed/timeout/abandoned
  // = não passou). 0 pendentes → badge oculto (showZero default false do MUI).
  const pendingChallengeCount = lesson.challenges.filter((ch) => ch.lastVerdict !== 'passed').length;

  // ONDA 1 (layout+a11y): a aula ATIVA ocupa TODA a altura do painel main —
  // cabeçalho fixo no topo, região do chat com scroll INTERNO (flexGrow) e
  // entrada fixa embaixo. `flexGrow: 1, minHeight: 0, height: '100%'` resolvem
  // porque o `main` do shell virou flex column com altura definida (stretch).
  // Os estados vazio/erro/loading acima seguem com altura de conteúdo.
  //
  // ONDA2-CHAT-NINTENDO (área de escrita MAIOR, limite fullhd — pedido do
  // dono): a coluna subiu de 760 → min(1920px, 100%) — o conteúdo usa até
  // uma tela fullhd de largura e NÃO estica além (monitores maiores mantêm
  // 1920 centrado). O PAINEL de mensagens (role="log") fica CAPADO em 1000px
  // centrado (linhas de leitura confortável — decisão visual documentada);
  // o INPUT ocupa a largura MAIOR da coluna (pedido do dono: "o input fica
  // na largura da coluna"). ONDA1-UX: a lista de desafios NÃO vive mais no
  // fluxo — botão "Desafios" no cabeçalho com a lista em popover.
  return (
    <Box
      sx={{
        flexGrow: 1,
        minHeight: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        p: 2,
        maxWidth: 'min(1920px, 100%)',
        width: '100%',
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
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              {/* ONDA1-UX (pedido do dono — "não quero aqueles desafios ali"):
                  os desafios saíram do fluxo (nada entre a última bolha e o
                  input); o botão "Desafios" abre o POPOVER com a lista e o
                  BADGE mostra os PENDENTES (mesmo critério do gating:
                  lastVerdict !== 'passed'). Sem pendentes → badge oculto. */}
              {lesson.challenges.length > 0 ? (
                <Badge badgeContent={pendingChallengeCount} color="error">
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={(e) => setChallengesAnchorEl(e.currentTarget)}
                    aria-haspopup="true"
                    aria-expanded={challengesOpen}
                    aria-label={tI('lesson.challengesButtonAria', { pending: pendingChallengeCount })}
                    startIcon={<EmojiEventsIcon />}
                  >
                    {t('translation:lesson.challengesButton')}
                  </Button>
                </Badge>
              ) : null}
              <Button size="small" variant="outlined" onClick={() => setSourcesOpen(true)} startIcon={<AutoStoriesIcon />}>
                {t('translation:lesson.sourcesButton')}
              </Button>
            </Stack>
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
          {/* Painel das mensagens (rola junto com a região). ONDA2-CHAT-
              NINTENDO: CAPADO em 1000px e CENTRALIZADO (mx auto) — os balões
              (maxWidth 78% do painel) mantêm linhas de leitura confortável
              mesmo com a coluna em fullhd; o input segue na largura MAIOR da
              coluna (decisão documentada no render). ONDA1-UX: a lista de
              desafios não vive mais aqui (popover no cabeçalho). */}
          <Box
            sx={{
              flexGrow: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              // ONDA2-QUIZ-OVERLAY: o painel era `action.hover` — um overlay
              // ALFA do MUI, a ÚNICA superfície do app fora da rampa
              // `surface.level0..4` de designTokens. Agora é o NÍVEL 2, que é
              // o que a rampa chama de "painel afundado/well": a cor é
              // explícita por esquema (nada de matemática de cor em runtime,
              // guarda-corpo #5) e o balão continua no nível 1, a superfície
              // de LEITURA, por cima dele.
              bgcolor: theme.vars.palette.surface.level2,
              borderRadius: 2,
              p: 1.5,
              maxWidth: CHAT_COLUMN_MAX_PX,
              width: '100%',
              mx: 'auto',
            }}
            role="log"
            aria-live="polite"
            // ONDA10 (bug 3): clicar em QUALQUER lugar do painel completa a
            // digitação em curso. É atalho REDUNDANTE (há o botão "Mostrar
            // tudo", acessível, e qualquer tecla) — por isso o div não vira
            // widget nem ganha foco; sem digitação em curso, é no-op.
            onClick={typingNow ? requestSkipTyping : undefined}
          >
          {chat.history.length === 0 ? (
            <Box sx={{ m: 'auto', textAlign: 'center', color: 'text.secondary' }}>
              <Typography variant="body2">{t('translation:lesson.chatStart')}</Typography>
              {/* ONDA2-CHAT-NINTENDO: press feedback (scale 0.98, spring
                  snappy) nos botões do chat — pedido do dono. */}
              <motion.span
                whileTap={{ scale: 0.98 }}
                transition={springs.snappy}
                style={{ display: 'inline-block' }}
              >
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
              </motion.span>
            </Box>
          ) : (
            <>
              {/* ONDA2-CHAT-NINTENDO: balões ENTRAM animados — AnimatePresence
                  + fadeInUp (opacity 0, y 10 → 0, spring gentle). Só os
                  balões NOVOS da sessão animam (`initial={false}` nas
                  restauradas do cache/seed antigo — elas montam completas e
                  estáticas); o exit é o mesmo fadeInUp (remontagem por
                  pré-requisito / re-place do seed). O separador de dia anima
                  JUNTO com a bolha (mesmo wrapper — decisão visual: o dia
                  novo "entra" com a primeira mensagem dele). */}
              <AnimatePresence initial={false}>
                {chat.history.map((m, i) => {
                  // Separador de dia centralizado quando a data MUDOU em
                  // relação à bolha anterior ("Hoje"/"Ontem"/data completa —
                  // decisões documentadas em chatDaySeparator).
                  const prev = i > 0 ? chat.history[i - 1] : undefined;
                  const daySep = chatDaySeparator(m.ts, prev?.ts, i18n.language ?? 'pt-BR');
                  // Só mensagens NOVAS da sessão digitam E animam (cache/seed
                  // antigo → completas e instantâneas).
                  const isNew = newMessageIndicesRef.current.has(i);
                  return (
                    <motion.div
                      key={i}
                      variants={fadeInUp}
                      initial={isNew ? 'hidden' : false}
                      animate="visible"
                      exit="hidden"
                      // FIX de tipagem motion 13: a transição NUNCA vai dentro
                      // do alvo/variante (quebra o tipo sob TS strict) — o
                      // spring entra pelo PROP (ver animationTokens.ts).
                      transition={springs.gentle}
                    >
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
                        isNew={isNew}
                        // ONDA2-QUIZ-OVERLAY: a bolha anterior. Sem ela o
                        // agrupamento de mensagens consecutivas que a onda do
                        // chat entregou fica INERTE (o prop é opcional e, sem
                        // ele, `groupsWithPrevious` devolve false sempre) — e
                        // a mesma variável já alimenta o separador de dia.
                        previous={prev}
                        // ONDA1-NAV-UI (tps): a REVIEW do desafio DIGITA a 10
                        // tokens/s (~40 chars/s — pedido do dono: "velocidade
                        // de tokens por segundo seja de 10 ao escrever em IA
                        // online (os desafios que já fizemos)"). ONDA2-CHAT-
                        // NINTENDO: a review de ERRO (com errorFor) é
                        // INSTANTÂNEA na ChatBubble (prop `instant` do
                        // TypewriterText) — o tps nem chega a ser usado; a de
                        // APROVAÇÃO (sem errorFor) continua a 10 tps.
                        //
                        // ONDA10 (bug 3): a escolha do tps saiu do JSX para
                        // `chatBubbleTps` (PURA, testada): TEORIA da aula →
                        // 7 tps = 28 chars/s (velocidade de LEITURA — a conta
                        // está em TYPEWRITER_TPS); review → 10; resposta do
                        // tutor a uma dúvida ('reply') e demais bolhas → 100,
                        // o "livre" de sempre. Nada mudou em bloco: o default
                        // GLOBAL do TypewriterText continua 100.
                        tps={chatBubbleTps(chat.history, i)}
                        // ONDA10: clique/tecla/"Mostrar tudo" completam a
                        // bolha que está digitando AGORA.
                        skip={skipTyping}
                        onRegenerate={m.kind === 'review' ? handleRegenerateFromBubble : undefined}
                        // ONDA3 (generate-flow): o gating agora também cobre o
                        // processo GLOBAL em voo (o modal pode estar rodando
                        // mesmo se esta view montou depois do disparo).
                        regenerateDisabled={busy || generateRunning}
                        onStreamStart={() => handleStreamStart(i)}
                        onStreamDone={() => handleStreamDone(i)}
                        onStreamTick={handleStreamTick}
                      />
                      {/* ONDA4 (quiz): o card do quiz da(s) assertion(s) que
                          esta bolha APRESENTOU (sectionId == seção da bolha) —
                          aparece DEPOIS da bolha e só quando a digitação
                          terminou (a bolha "apresentada" = texto completo).
                          Respondido → o card FICA preenchido (feedback
                          verde/vermelho, opções travadas — reforço, não
                          gate).

                          ONDA1-MAESTRIA (fix): a chave do estado NÃO é mais
                          calculada aqui. Ela vem de `visibleQuizFor` (que a
                          deriva por `quizKeyFor`) — a MESMA fonte que
                          `pendingQuizzes`/`pendingQuizzesForCurrentSection`
                          usam no gate. Quando a view calculava a chave inline
                          (`sectionId` sozinha) ela ESCREVIA numa chave e o
                          gate LIA de outra: responder certo não liberava nada
                          e o "Próximo" travava para sempre. Além da chave,
                          `visibleQuizFor` devolve a assertion da GERAÇÃO
                          corrente (a remediadora, quando existe) e o estado
                          do quiz — o card renderiza e submete sempre o mesmo
                          par (chave, assertion). */}
                      {streamingIds.has(i)
                        ? null
                        : (quizzesByIndex.get(i) ?? []).map((assertion) => {
                            const visible = visibleQuizFor(chat, assertion);
                            const inScene =
                              activeQuizCard !== null && activeQuizCard.visible.key === visible.key;
                            // DOMINADO: o card CHEIO fica na conversa, com o
                            // veredito e as opções travadas — é o registro do
                            // que o aluno demonstrou, e o único card inline
                            // que ainda desenha alternativas.
                            if (visible.step.kind === 'dominado') {
                              return (
                                <LessonQuizCard
                                  key={visible.assertion.id}
                                  assertion={visible.assertion}
                                  quiz={visible.quiz}
                                  onSelect={(answerIndex) =>
                                    handleQuizAnswer(
                                      { original: assertion, visible, anchorIndex: i },
                                      answerIndex,
                                    )
                                  }
                                />
                              );
                            }
                            // PENDENTE: o lugar do quiz na conversa. Ele é o
                            // destino do "minimizar" e a porta de volta para o
                            // overlay — responder acontece SOBRE A TELA, num
                            // card só, nunca em dois ao mesmo tempo.
                            return (
                              <QuizChatCard
                                key={visible.assertion.id}
                                status={inScene ? activeQuizStatus : 'aguardando'}
                                onScreen={inScene && quizOverlay.phase === 'sobre-a-tela'}
                                question={visible.assertion.question}
                                generation={visible.generation}
                                notice={inScene ? activeNoticeText : null}
                                onOpen={() => handleQuizReopen(visible.key)}
                                onRetry={
                                  inScene && activeQuizStatus === 'indisponivel' ? handleQuizRetry : null
                                }
                              />
                            );
                          })}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              {/* ONDA2-IMESSAGE: indicador "digitando" ANIMADO — montado SÓ
                  enquanto a digitação está ativa (turno 'answer' aguardando a
                  LLM OU alguma bolha digitando); sai do DOM ao terminar
                  (mount condicional — os e2e nunca casam texto oculto). */}
              {busy && pendingAction === 'answer' || streamingIds.size > 0 ? (
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <TypingIndicator />
                  {/* ONDA10 (bug 3): saída EXPLÍCITA e acessível da animação
                      — o clique no painel e qualquer tecla fazem o mesmo, mas
                      só um botão de verdade aparece para leitor de tela e
                      navegação por teclado. Some junto com o indicador. */}
                  {typingNow ? (
                    <Button size="small" variant="text" onClick={requestSkipTyping}>
                      {t('translation:lesson.skipTypingButton')}
                    </Button>
                  ) : null}
                </Stack>
              ) : null}
            </>
          )}
          </Box>

          {/* ONDA1-UX (pedido do dono — "não quero aqueles desafios ali"): a
              lista de desafios SAIU da região de scroll (ficava entre a
              última bolha e o input, empurrando o fluxo e ficando recortada
              com conteúdo alto). Agora vive no POPOVER do botão "Desafios"
              do cabeçalho; entre o chat e o input NÃO há nenhum elemento de
              lista de desafios. */}
        </Box>

        {chat.lastError ? (
          <Alert
            severity="warning"
            sx={CHAT_COLUMN_SX}
            onClose={() => setChat((s) => ({ ...s, lastError: null }))}
          >
            {chat.lastError}
          </Alert>
        ) : null}

        {/* ONDA2-QUIZ-OVERLAY: o aviso de CANAL do quiz quando não há mais card
            em cena para carregá-lo (o caso típico é a resposta CERTA que fechou
            a afirmação e o registro que não chegou ao banco). `info`, não
            `warning`: §8 item 3 — falhar é estado de DIAGNÓSTICO, com redação
            informativa, nunca repreensão. */}
        {quizNoticeText !== null && activeNotice === null ? (
          <Alert severity="info" sx={CHAT_COLUMN_SX} onClose={() => setQuizNotice(null)}>
            {quizNoticeText}
          </Alert>
        ) : null}

        {/* ONDA2 (error-flow, A5): mic — o indicador de transcrição é
            acessível (aria-live) e o erro do engine (hook, sem dismiss)
            aparece como Alert pequeno; o botão permanece reabilitado. */}
        {mic.transcribing ? (
          <Typography
            variant="caption"
            color="text.secondary"
            aria-live="polite"
            sx={{ ...CHAT_COLUMN_SX, fontStyle: 'italic' }}
          >
            {tI('lesson.micRecording')} — {mic.partial || '…'}
          </Typography>
        ) : null}
        {mic.error ? (
          <Alert severity="error" sx={{ ...CHAT_COLUMN_SX, py: 0.5 }}>{mic.error}</Alert>
        ) : null}

        {/* ONDA10 (bug 2): o botão travado DIZ por quê — nunca só desabilita
            em silêncio (um botão morto e mudo é pior que o bug). A linha é
            role="status" + aria-live: quem usa leitor de tela também recebe.
            O tooltip continua existindo, mas ele é hover-only e um Button
            desabilitado nem dispara hover — a explicação PRECISA estar aqui,
            visível, ao lado do botão. */}
        {!chat.theoryDone && nextBlockedByQuiz ? (
          <Typography
            role="status"
            aria-live="polite"
            variant="caption"
            color="text.secondary"
            sx={{ ...CHAT_COLUMN_SX, display: 'block' }}
          >
            {t('translation:lesson.quizGateNext')}
          </Typography>
        ) : null}
        {chat.theoryDone && !doneMarked && finishBlock === 'quiz' ? (
          <Typography
            role="status"
            aria-live="polite"
            variant="caption"
            color="text.secondary"
            sx={{ ...CHAT_COLUMN_SX, display: 'block' }}
          >
            {tI('lesson.quizGateFinish', { n: quizPendingAll.length })}
          </Typography>
        ) : null}

        {/* Entrada: dúvida do aluno (texto OU voz) + avanço da teoria.

            ONDA2-QUIZ-OVERLAY (larguras alinhadas): a linha de entrada passa a
            respeitar a MESMA coluna do painel de mensagens
            (CHAT_COLUMN_MAX_PX). Antes ela herdava a coluna inteira da aula
            (min(1920px, 100%)) e, em janela fullhd, o campo de pergunta
            terminava quase um palmo à direita do último balão: o eixo de
            LEITURA e o de ESCRITA não batiam. */}
 <Stack direction="row" spacing={1} sx={CHAT_COLUMN_SX}>
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
                      {/* ONDA2-CHAT-NINTENDO: press feedback (scale 0.98)
                          no Send — pedido do dono. */}
                      <motion.span
                        whileTap={{ scale: 0.98 }}
                        transition={springs.snappy}
                        style={{ display: 'inline-block' }}
                      >
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
                      </motion.span>
                    </Tooltip>
                  </InputAdornment>
                ),
              },
            }}
          />
          {!chat.theoryDone ? (
            /* ONDA2-CHAT-NINTENDO: press feedback (scale 0.98) no "Próximo"
               — pedido do dono. ONDA10 (bug 2): o avanço da teoria trava
               enquanto o quiz da seção ATUAL estiver sem resposta. O
               <span> é obrigatório: Button DESABILITADO não dispara os
               eventos que o Tooltip escuta. Errar não trava — o gate lê
               `answered`, nunca `correct`. */
            <Tooltip title={nextBlockedByQuiz ? t('translation:lesson.quizGateNext') : ''}>
              <span>
                <motion.span
                  whileTap={{ scale: 0.98 }}
                  transition={springs.snappy}
                  style={{ display: 'inline-block' }}
                >
                  <Button
                    variant="contained"
                    onClick={() => void sendNext()}
                    disabled={busy || nextBlockedByQuiz}
                    startIcon={nextBlockedByQuiz ? <LockIcon /> : undefined}
                    sx={{ whiteSpace: 'nowrap' }}
                  >
                    {t('translation:lesson.nextButton')}
                  </Button>
                </motion.span>
              </span>
            </Tooltip>
          ) : doneMarked ? (
            /* ONDA4 (pós-conclusão — pedido do dono: "ao terminar o usuário
               pode avançar para a próxima aula ou gerar um novo desafio"):
               no lugar do "Concluída ✓" desabilitado, DOIS botões — avançar
               (nextLesson do payload; sem nextLesson → roadmap, a trilha
               reflete a conclusão) e gerar novo desafio (fluxo GLOBAL
               challengeGenerateStore + IPC — o MESMO da bolha de erro,
               handleRegenerateFromBubble; o modal global mostra as etapas). */
            <>
              <motion.span
                whileTap={{ scale: 0.98 }}
                transition={springs.snappy}
                style={{ display: 'inline-block' }}
              >
                <Button
                  variant="contained"
                  onClick={() => void handleGoToNextLesson()}
                  startIcon={<ArrowForwardIcon />}
                  sx={{ whiteSpace: 'nowrap' }}
                >
                  {t('translation:lesson.nextLessonButton')}
                </Button>
              </motion.span>
              <motion.span
                whileTap={{ scale: 0.98 }}
                transition={springs.snappy}
                style={{ display: 'inline-block' }}
              >
                <Button
                  variant="outlined"
                  onClick={() => void handleRegenerateFromBubble()}
                  disabled={busy || generateRunning}
                  sx={{ whiteSpace: 'nowrap' }}
                >
                  {t('translation:lesson.generateNewChallenge')}
                </Button>
              </motion.span>
            </>
          ) : (
            <Tooltip
              /* ONDA10: o motivo do bloqueio vem de `lessonFinishBlock` —
                 'quiz' (responda os quizzes) tem PRECEDÊNCIA sobre
                 'challenges' porque o desbloqueio é mais barato: o card está
                 na tela, a um clique. */
              title={
                finishBlock === 'quiz'
                  ? tI('lesson.quizGateFinish', { n: quizPendingAll.length })
                  : finishBlock === 'challenges'
                    ? t('translation:lesson.finishBlockedTooltip')
                    : ''
              }
            >
              <span>
                {/* ONDA2-CHAT-NINTENDO: mesmo press feedback no "Concluir
                    aula" (mesma linha de ações). */}
                <motion.span
                  whileTap={{ scale: 0.98 }}
                  transition={springs.snappy}
                  style={{ display: 'inline-block' }}
                >
                  <Button
                    variant="contained"
                    onClick={() => void finishLesson()}
                    // ONDA2-IMESSAGE (gating): DESABILITADO com desafios
                    // pendentes (tooltip i18n só quando bloqueado); liberado com
                    // todos passed ou sem desafios. ONDA10: quiz sem resposta
                    // bloqueia igual — a explicação visível está acima.
                    disabled={busy || doneMarked || finishBlocked}
                    startIcon={doneMarked ? <CheckCircleIcon /> : <LockIcon />}
                    sx={{ whiteSpace: 'nowrap' }}
                  >
                    {doneMarked ? t('translation:lesson.doneMarked') : t('translation:lesson.finishButton')}
                  </Button>
                </motion.span>
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

      {/* ONDA1-UX (pedido do dono): DESAFIOS fora do fluxo — o botão
          "Desafios" do cabeçalho abre este POPOVER com a lista completa
          (anchor no botão; fecha ao clicar fora/Esc — padrão MUI). Item
          clicável → MESMO openChallenge do fluxo track (nav intacta). */}
      <Popover
        open={challengesOpen}
        anchorEl={challengesAnchorEl}
        onClose={() => setChallengesAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            // ONDA3-UX-FIX (revisor): o papel CLIPA no raio do tema (14px) —
            // sem `overflow: hidden` aqui, o scroll do Box interno pintaria o
            // conteúdo por cima da curva da borda (o Paper não clipa por
            // padrão). O scroll em si vive no Box (maxHeight + overflowY).
            sx: { overflow: 'hidden' },
          },
        }}
      >
        {/* maxHeight/overflowY: a lista cresce sem limite (novos desafios
            no topo) — em janela baixa o conteúdo rolável impede cards
            inacessíveis fora da viewport. min(60vh, 420px) evita cobrir a
            tela toda em monitores pequenos. */}
        <Box sx={{ p: 1.5, minWidth: 300, maxWidth: 420, maxHeight: 'min(60vh, 420px)', overflowY: 'auto' }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            {t('translation:lesson.challengesTitle')}
          </Typography>
          <List dense role="list" aria-label={tI('lesson.challengesListAria')}>
            {lesson.challenges.map((ch) => (
              <ListItem
                key={ch.slug}
                component="button"
                onClick={() => {
                  setChallengesAnchorEl(null);
                  openChallenge(ch);
                }}
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
      </Popover>
    </Box>
  );
}
