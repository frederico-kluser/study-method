/**
 * blocks/LessonChatLog.tsx — o LOG DA CONVERSA da aula: as bolhas do chat
 * (AnimatePresence + fadeInUp, só as NOVAS da sessão animam) e os cards de
 * quiz que cada bolha apresentou.
 *
 * Bloco de VIEW PURO extraído de LessonView.tsx (contrato STORY-SPEC §5): só
 * props, sem IPC nem estado próprio. A máquina (trackLessonState) e a fase do
 * overlay (quizOverlayState) continuam nos seus módulos; este bloco só
 * DESENHA o que o container lhe passa:
 *
 *   - separador de dia quando a data muda (chatDaySeparator, puro);
 *   - ChatBubble com o tps da bolha (`chatBubbleTps`, puro) e o skip da
 *     varredura de ~1 s (ONDA-SKIP-1S);
 *   - ações da bolha de erro ("Ver a aula" / "Gerar novo desafio" / "Refazer
 *     desafio") decididas pela regra PURA `lessonChallengeBubbleAction`;
 *   - por bolha, os QUIZZES que ela apresentou (bloco LessonChatQuizCards).
 */
import { Box, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'motion/react';
import { fadeInUp, springs } from '../../../lib/animationTokens';
import type { ReactElement } from 'react';
import { ChatBubble } from '../../../components/chat/ChatBubble';
import type { QuizOverlayStatus } from '../../../components/quiz/quizOverlayContent';
import {
  chatBubbleTps,
  chatDaySeparator,
  type TrackLessonUiState,
  type VisibleQuiz,
} from '../../../lib/trackLessonState';
import { lessonChallengeBubbleAction } from '../../../lib/lessonChallengeCard';
import type { TrackAssertionDto } from '../../../../shared/ipc-contract';
import { LessonChatQuizCards } from './LessonChatQuizCards';

/** Um quiz RENDERIZÁVEL: assertion autoral + o que `visibleQuizFor` devolve. */
export interface LessonChatQuizEntry {
  original: TrackAssertionDto;
  visible: VisibleQuiz;
  anchorIndex: number;
}

export interface LessonChatLogProps {
  /** Estado do chat (histórico + quizzes) — a fonte das bolhas e dos cards. */
  chat: TrackLessonUiState;
  /** Só mensagens NOVAS da sessão digitam/animam (as restauradas saem prontas). */
  isMessageNew: (index: number) => boolean;
  /** Índices ATUALMENTE digitando (a bolha escrita não mostra quiz). */
  isMessageStreaming: (index: number) => boolean;
  /** Varredura de pulo de digitação em curso (~1 s — ONDA-SKIP-1S). */
  skipTyping: boolean;
  /** Turno/geração em voo: trava o "Gerar novo desafio" da bolha de erro. */
  regenerateDisabled: boolean;
  /** `failedCount` do payload por slug (a bolha carrega só o challengeId). */
  challengeFailedCounts: ReadonlyMap<string, number>;
  /** Quizzes por índice da bolha que os apresentou. */
  quizzesByIndex: ReadonlyMap<number, ReadonlyArray<TrackAssertionDto>>;
  /** A pergunta EM CENA (head da fila) — null = nenhuma pendente visível. */
  questionInSceneKey: string | null;
  /** A chave do quiz em cena no overlay (null = nenhum). */
  activeQuizKey: string | null;
  /** Status do quiz em cena (só o card em cena o recebe). */
  activeQuizStatus: QuizOverlayStatus;
  /** Aviso de canal da volta em cena (null = nenhum). */
  activeNoticeText: string | null;
  /** O overlay do quiz está SOBRE a tela (sobre-a-tela vs minimizado). */
  quizOverlayOnScreen: boolean;
  /** Callback-ref do card em cena (o container o traz à vista). */
  activeCardRef: (el: HTMLDivElement | null) => void;
  onStreamStart: (index: number) => void;
  onStreamDone: (index: number) => void;
  onStreamTick: () => void;
  /** "Ver a aula" da bolha de erro (1ª falha antes da aula). */
  onViewLesson: () => void;
  /** "Gerar novo desafio" da bolha de erro. */
  onRegenerate: () => void;
  /** "Refazer desafio" da bolha de erro (o MESMO challengeId). */
  onRetryChallenge: (alvo: { challengeId: string; beforeLesson: boolean }) => void;
  onQuizAnswer: (entry: LessonChatQuizEntry, answerIndex: number) => void;
  onQuizReopen: (quizKey: string) => void;
  onQuizRetry: () => void;
  onQuizReopenGeneration: () => void;
}

export function LessonChatLog(props: LessonChatLogProps): ReactElement {
  const { t, i18n } = useTranslation();
  const { chat } = props;
  return (
    /* ONDA2-CHAT-NINTENDO: balões ENTRAM animados — AnimatePresence + fadeInUp
       (opacity 0, y 10 → 0, spring gentle). Só os balões NOVOS da sessão
       animam (`initial={false}` nas restauradas do cache/seed antigo — elas
       montam completas e estáticas); o exit é o mesmo fadeInUp. O separador de
       dia anima JUNTO com a bolha (mesmo wrapper). */
    <AnimatePresence initial={false}>
      {chat.history.map((m, i) => {
        // Separador de dia centralizado quando a data MUDOU em relação à bolha
        // anterior ("Hoje"/"Ontem"/data completa — chatDaySeparator).
        const prev = i > 0 ? chat.history[i - 1] : undefined;
        const daySep = chatDaySeparator(m.ts, prev?.ts, i18n.language ?? 'pt-BR');
        // Só mensagens NOVAS da sessão digitam E animam.
        const isNew = props.isMessageNew(i);
        // ONDA2 (falha-ver-aula): a ação da bolha de erro — regra PURA
        // `lessonChallengeBubbleAction`, com o flag da própria bolha + o
        // `failedCount` do payload. true = "Ver a aula"; false = "Gerar novo".
        const bubbleViewLesson =
          m.kind === 'review' &&
          m.errorBeforeLesson === true &&
          lessonChallengeBubbleAction({
            attemptedBeforeLesson: true,
            failedCount: props.challengeFailedCounts.get(m.errorFor ?? '') ?? 0,
          }) === 'viewLesson';
        // ONDA-REFAZER: o alvo do "Refazer desafio" — o MESMO desafio que
        // reprovou (`errorFor` da 'review'), com o flag "antes da aula" ecoado.
        const retryAlvo =
          m.kind === 'review' && m.errorFor !== undefined
            ? { challengeId: m.errorFor, beforeLesson: m.errorBeforeLesson === true }
            : null;
        return (
          <motion.div
            key={i}
            variants={fadeInUp}
            initial={isNew ? 'hidden' : false}
            animate="visible"
            exit="hidden"
            // FIX de tipagem motion 13: a transição NUNCA vai dentro do
            // alvo/variante — o spring entra pelo PROP (animationTokens.ts).
            transition={springs.gentle}
          >
            {daySep ? (
              <Box sx={{ textAlign: 'center', mt: 0.5 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
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
              // A bolha anterior alimenta o agrupamento (groupsWithPrevious) e
              // o separador de dia.
              previous={prev}
              // ONDA10 (bug 3): a escolha do tps é PURA (`chatBubbleTps`):
              // teoria → 7 tps (velocidade de LEITURA); review → 10; demais
              // bolhas → 100. O default global do TypewriterText segue 100.
              tps={chatBubbleTps(chat.history, i)}
              // ONDA-SKIP-1S: o pulo varre o restante em ~1 s (não estoura).
              skip={props.skipTyping}
              onViewLesson={bubbleViewLesson ? props.onViewLesson : undefined}
              onRegenerate={
                bubbleViewLesson
                  ? undefined
                  : m.kind === 'review'
                    ? props.onRegenerate
                    : undefined
              }
              // ONDA-REFAZER: toda bolha de erro COM desafio identificado
              // oferece refazer o MESMO — convive com as outras duas ações.
              onRetryChallenge={
                retryAlvo ? () => props.onRetryChallenge(retryAlvo) : undefined
              }
              regenerateDisabled={props.regenerateDisabled}
              onStreamStart={() => props.onStreamStart(i)}
              onStreamDone={() => props.onStreamDone(i)}
              onStreamTick={props.onStreamTick}
            />
            {/* Os QUIZZES que esta bolha apresentou — só quando a digitação
                terminou (a bolha "apresentada" = texto completo). */}
            <LessonChatQuizCards
              chat={chat}
              index={i}
              assertions={props.quizzesByIndex.get(i) ?? []}
              isStreaming={props.isMessageStreaming(i)}
              questionInSceneKey={props.questionInSceneKey}
              activeQuizKey={props.activeQuizKey}
              activeQuizStatus={props.activeQuizStatus}
              activeNoticeText={props.activeNoticeText}
              quizOverlayOnScreen={props.quizOverlayOnScreen}
              activeCardRef={props.activeCardRef}
              onQuizAnswer={props.onQuizAnswer}
              onQuizReopen={props.onQuizReopen}
              onQuizRetry={props.onQuizRetry}
              onQuizReopenGeneration={props.onQuizReopenGeneration}
            />
          </motion.div>
        );
      })}
    </AnimatePresence>
  );
}
