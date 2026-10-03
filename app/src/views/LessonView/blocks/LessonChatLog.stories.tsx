/**
 * Componentes/Aula/LessonChatLog — o log da conversa da aula (bolhas
 * animadas, separador de dia, cards de quiz por bolha). Bloco puro de
 * `views/LessonView/blocks/LessonChatLog`.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { LessonChatLog, type LessonChatLogProps } from './LessonChatLog';
import { quizKeyFor, type TrackLessonUiState } from '../../../lib/trackLessonState';
import type { TrackAssertionDto } from '../../../../shared/ipc-contract';
import {
  lessonAssertions,
  lessonChatOngoing,
  lessonMessageQuizExplanation,
  lessonMessageReviewError,
  lessonQuizStateCorrect,
  lessonQuizStateWrong,
} from '../../../storybook/fixtures.lesson';

const KEY_1 = quizKeyFor(lessonAssertions[0]);

const ações = {
  onStreamStart: (index: number) => console.debug('[storybook] onStreamStart', index),
  onStreamDone: (index: number) => console.debug('[storybook] onStreamDone', index),
  onStreamTick: () => console.debug('[storybook] onStreamTick'),
  onViewLesson: () => console.debug('[storybook] onViewLesson'),
  onRegenerate: () => console.debug('[storybook] onRegenerate'),
  onRetryChallenge: (alvo: { challengeId: string; beforeLesson: boolean }) =>
    console.debug('[storybook] onRetryChallenge', alvo),
  onQuizAnswer: (entry, answerIndex) => console.debug('[storybook] onQuizAnswer', entry, answerIndex),
  onQuizReopen: (quizKey: string) => console.debug('[storybook] onQuizReopen', quizKey),
  onQuizRetry: () => console.debug('[storybook] onQuizRetry'),
  onQuizReopenGeneration: () => console.debug('[storybook] onQuizReopenGeneration'),
};

function chat(history: TrackLessonUiState['history'], quizBySection: TrackLessonUiState['quizBySection'] = {}): TrackLessonUiState {
  return { ...lessonChatOngoing, history, quizBySection };
}

const padrao: LessonChatLogProps = {
  chat: chat(lessonChatOngoing.history),
  isMessageNew: () => true,
  isMessageStreaming: () => false,
  skipTyping: false,
  regenerateDisabled: false,
  challengeFailedCounts: new Map<string, number>(),
  quizzesByIndex: new Map<number, ReadonlyArray<TrackAssertionDto>>(),
  questionInSceneKey: null,
  activeQuizKey: null,
  activeQuizStatus: 'aguardando',
  activeNoticeText: null,
  quizOverlayOnScreen: false,
  activeCardRef: () => {},
  ...ações,
};

const meta = {
  title: 'Componentes/Aula/LessonChatLog',
  component: LessonChatLog,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: padrao,
  argTypes: {
    skipTyping: { control: 'boolean' },
    regenerateDisabled: { control: 'boolean' },
  },
} satisfies Meta<typeof LessonChatLog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Conversa com prosa, código e fórmula KaTeX — o uso normal da aula. */
export const ConversaEmCurso: Story = {};

/** Com o quiz da seção pendente ancorado na primeira bolha. */
export const ComQuizPendente: Story = {
  args: {
    quizzesByIndex: new Map([[0, [lessonAssertions[0]]]]),
    questionInSceneKey: KEY_1,
    activeQuizKey: KEY_1,
  },
};

/** Quiz dominado: o card cheio fica na conversa como registro. */
export const ComQuizDominado: Story = {
  args: {
    chat: chat(lessonChatOngoing.history, { [KEY_1]: lessonQuizStateCorrect }),
    quizzesByIndex: new Map([[0, [lessonAssertions[0]]]]),
    questionInSceneKey: null,
    activeQuizKey: null,
    activeQuizStatus: 'dominado',
  },
};

/** Bolha de erro do desafio: "Ver a aula"/"Gerar novo"/"Refazer desafio". */
export const BolhaDeErroDoDesafio: Story = {
  args: {
    chat: chat([lessonMessageReviewError, lessonMessageQuizExplanation]),
    challengeFailedCounts: new Map([['mostre-seu-nome', 0]]),
  },
};

/** A mesma bolha na 2ª falha: a ação vira "Gerar novo desafio". */
export const BolhaDeErroSegundaFalha: Story = {
  args: {
    chat: chat([
      { ...lessonMessageReviewError, errorBeforeLesson: false },
      lessonMessageQuizExplanation,
    ]),
    challengeFailedCounts: new Map([['mostre-seu-nome', 2]]),
  },
};

/** Erro + quiz travado: o card explica o que aconteceu e oferece saída. */
export const QuizComAvisoDeCanal: Story = {
  args: {
    chat: chat(lessonChatOngoing.history, { [KEY_1]: lessonQuizStateWrong }),
    quizzesByIndex: new Map([[0, [lessonAssertions[0]]]]),
    questionInSceneKey: KEY_1,
    activeQuizKey: KEY_1,
    activeQuizStatus: 'indisponivel',
    activeNoticeText: 'A explicação não pôde ser escrita agora.',
    quizOverlayOnScreen: true,
  },
};

/** Mensagens restauradas (não digitam) e uma em digitação (skip disponível). */
export const ComMensagensAntigas: Story = {
  args: {
    isMessageNew: (index: number): boolean => index === 2,
    isMessageStreaming: (index: number): boolean => index === 2,
    skipTyping: true,
  },
};
