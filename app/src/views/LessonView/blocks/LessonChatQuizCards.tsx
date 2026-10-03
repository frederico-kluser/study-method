/**
 * blocks/LessonChatQuizCards.tsx — os cards de QUIZ que UMA bolha apresentou
 * (os `TrackAssertionDto` ancorados nela por `sectionId`).
 *
 * Bloco de VIEW PURO extraído de LessonView.tsx (contrato STORY-SPEC §5): só
 * props. As regras que ele traduz são todas de módulos puros/máquinas:
 *   - a chave e a assertion da geração corrente vêm de `visibleQuizFor`
 *     (ONDA1-MAESTRIA: nenhuma conta de chave vive na view);
 *   - DOMINADO → o card CHEIO (`LessonQuizCard`) fica na conversa, com o
 *     veredito e as opções travadas — é o registro do que o aluno demonstrou;
 *   - PENDENTE → só A pergunta em cena nasce como card
 *     (ONDA-UMA-PERGUNTA-POR-VEZ: nunca duas perguntas na tela) e só depois
 *     da bolha âncora terminar de ser escrita; ele é o destino do "minimizar"
 *     e a porta de volta para o overlay (`QuizChatCard`).
 */
import type { ReactElement } from 'react';
import { QuizChatCard } from '../../../components/quiz/QuizChatCard';
import type { QuizOverlayStatus } from '../../../components/quiz/quizOverlayContent';
import { visibleQuizFor, type TrackLessonUiState } from '../../../lib/trackLessonState';
import type { TrackAssertionDto } from '../../../../shared/ipc-contract';
import { LessonQuizCard } from '../LessonQuiz';
import type { LessonChatQuizEntry } from './LessonChatLog';

export interface LessonChatQuizCardsProps {
  /** Estado do chat — a entrada de `visibleQuizFor`. */
  chat: TrackLessonUiState;
  /** Índice da bolha âncora no histórico (a âncora do entry do quiz). */
  index: number;
  /** As assertions que ESTA bolha apresentou (ordem determinística do módulo). */
  assertions: ReadonlyArray<TrackAssertionDto>;
  /** A bolha ainda está a ser escrita? (nenhum quiz interrompe a leitura). */
  isStreaming: boolean;
  /** A pergunta EM CENA (head da fila) — null = nenhuma pendente visível. */
  questionInSceneKey: string | null;
  /** A chave do quiz em cena no overlay (null = nenhum). */
  activeQuizKey: string | null;
  activeQuizStatus: QuizOverlayStatus;
  activeNoticeText: string | null;
  quizOverlayOnScreen: boolean;
  /** Callback-ref do card em cena (o container o traz à vista). */
  activeCardRef: (el: HTMLDivElement | null) => void;
  onQuizAnswer: (entry: LessonChatQuizEntry, answerIndex: number) => void;
  onQuizReopen: (quizKey: string) => void;
  onQuizRetry: () => void;
  onQuizReopenGeneration: () => void;
}

export function LessonChatQuizCards(props: LessonChatQuizCardsProps): ReactElement | null {
  const { chat } = props;
  if (props.isStreaming) return null;
  return (
    <>
      {props.assertions.map((assertion) => {
        const visible = visibleQuizFor(chat, assertion);
        const inScene = props.activeQuizKey === visible.key;
        // DOMINADO: o card CHEIO fica na conversa — o único inline que ainda
        // desenha alternativas (travadas, com o veredito).
        if (visible.step.kind === 'dominado') {
          return (
            <LessonQuizCard
              key={visible.assertion.id}
              assertion={visible.assertion}
              quiz={visible.quiz}
              onSelect={(answerIndex) =>
                props.onQuizAnswer(
                  { original: assertion, visible, anchorIndex: props.index },
                  answerIndex,
                )
              }
            />
          );
        }
        // PENDENTE: o lugar do quiz na conversa — só a pergunta em cena.
        if (props.questionInSceneKey !== visible.key) return null;
        return (
          // <div> cru (e não Box): não pinta nada, só carrega o ref do card EM
          // CENA para o efeito que o traz à vista.
          <div key={visible.assertion.id} ref={inScene ? props.activeCardRef : null}>
            <QuizChatCard
              quizKey={visible.key}
              status={inScene ? props.activeQuizStatus : 'aguardando'}
              onScreen={inScene && props.quizOverlayOnScreen}
              question={visible.assertion.question}
              generation={visible.generation}
              notice={inScene ? props.activeNoticeText : null}
              onOpen={() => props.onQuizReopen(visible.key)}
              onRetry={inScene && props.activeQuizStatus === 'indisponivel' ? props.onQuizRetry : null}
              onReopen={
                inScene && props.activeQuizStatus === 'indisponivel'
                  ? props.onQuizReopenGeneration
                  : null
              }
            />
          </div>
        );
      })}
    </>
  );
}
