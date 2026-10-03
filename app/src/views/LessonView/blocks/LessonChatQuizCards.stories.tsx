/**
 * Componentes/Aula/LessonChatQuizCards — os cards de quiz que UMA bolha
 * apresentou (dominado fica cheio; pendente só nasce quando é a pergunta em
 * cena). Bloco puro de `views/LessonView/blocks/LessonChatQuizCards`.
 */
import type { Meta, StoryObj } from '@storybook/react';
import type { ReactElement } from 'react';
import { LessonChatQuizCards, type LessonChatQuizCardsProps } from './LessonChatQuizCards';
import { quizKeyFor, type TrackLessonUiState } from '../../../lib/trackLessonState';
import {
  lessonAssertions,
  lessonMessageTheory,
  lessonQuizStateCorrect,
  lessonQuizStateWrong,
} from '../../../storybook/fixtures.lesson';

const KEY_1 = quizKeyFor(lessonAssertions[0]);

function chatCom(quizBySection: TrackLessonUiState['quizBySection']): TrackLessonUiState {
  return {
    presentedSections: ['uma-linha-e-so'],
    history: [lessonMessageTheory],
    theoryDone: false,
    lastError: null,
    challengeError: null,
    quizBySection,
  };
}

const meta = {
  title: 'Componentes/Aula/LessonChatQuizCards',
  component: LessonChatQuizCards,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    chat: chatCom({}),
    index: 0,
    assertions: [lessonAssertions[0]],
    isStreaming: false,
    questionInSceneKey: KEY_1,
    activeQuizKey: KEY_1,
    activeQuizStatus: 'aguardando',
    activeNoticeText: null,
    quizOverlayOnScreen: false,
    activeCardRef: () => {},
    onQuizAnswer: (entry, answerIndex) => console.debug('[storybook] onQuizAnswer', entry, answerIndex),
    onQuizReopen: (quizKey) => console.debug('[storybook] onQuizReopen', quizKey),
    onQuizRetry: () => console.debug('[storybook] onQuizRetry'),
    onQuizReopenGeneration: () => console.debug('[storybook] onQuizReopenGeneration'),
  },
  argTypes: {
    isStreaming: { control: 'boolean' },
    activeQuizStatus: {
      control: 'select',
      options: ['aguardando', 'aguardando-vez', 'explicando', 'gerando', 'indisponivel', 'dominado'],
    },
    quizOverlayOnScreen: { control: 'boolean' },
  },
} satisfies Meta<typeof LessonChatQuizCards>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Pendente, em cena: o card compacto convida a responder (porta do overlay). */
export const PendenteEmCena: Story = {};

/** Fora de cena (outra pergunta manda): nada é renderizado para esta bolha. */
export const ForaDeCena: Story = {
  args: { questionInSceneKey: 'outra-chave', activeQuizKey: 'outra-chave' },
};

/** Dominado: o card CHEIO fica na conversa, com o veredito e opções travadas. */
export const Dominado: Story = {
  args: {
    chat: chatCom({ [KEY_1]: lessonQuizStateCorrect }),
    questionInSceneKey: null,
    activeQuizKey: null,
    activeQuizStatus: 'dominado',
  },
};

/** Errou e o ciclo travou: o card oferece "tentar de novo" e reabrir. */
export const CicloTravado: Story = {
  args: {
    chat: chatCom({ [KEY_1]: lessonQuizStateWrong }),
    activeQuizStatus: 'indisponivel',
    activeNoticeText: 'O quiz novo não pôde ser gerado agora. Tente de novo.',
    quizOverlayOnScreen: true,
  },
};

/** Bolha ainda a ser escrita: nenhum quiz interrompe a leitura. */
export const BolhaDigitando: Story = {
  args: { isStreaming: true },
};

/** Duas assertions na mesma bolha — a segunda espera a vez (uma por vez). */
export const DuasPerguntasNaBolha: Story = {
  args: {
    assertions: [lessonAssertions[0], lessonAssertions[1]],
    questionInSceneKey: KEY_1,
    activeQuizKey: KEY_1,
  },
};

/** Renderização de composição: os quatro estados principais, um por linha. */
export const Vocabulário: Story = {
  render: (args): ReactElement => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <LessonChatQuizCards {...args} />
      <LessonChatQuizCards
        {...args}
        chat={chatCom({ [KEY_1]: lessonQuizStateCorrect })}
        questionInSceneKey={null}
        activeQuizKey={null}
        activeQuizStatus="dominado"
      />
      <LessonChatQuizCards
        {...args}
        chat={chatCom({ [KEY_1]: lessonQuizStateWrong })}
        activeQuizStatus="indisponivel"
        activeNoticeText="O quiz novo não pôde ser gerado agora."
      />
      <LessonChatQuizCards {...args} isStreaming />
    </div>
  ),
};
