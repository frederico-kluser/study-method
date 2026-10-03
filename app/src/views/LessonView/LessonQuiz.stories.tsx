/**
 * Componentes/Aula/LessonQuizCard — o card do quiz de múltipla escolha da
 * aula (`LessonQuiz.tsx`, view pura). Estados: por responder / respondido
 * certo / respondido errado — as opções NUNCA entregam a resposta antes do
 * clique (`optionVisualState`) e a ordem de exibição vem de `quizOptionOrder`.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { LessonQuizCard } from './LessonQuiz';
import {
  lessonAssertions,
  lessonQuizStateCorrect,
  lessonQuizStateWrong,
} from '../../storybook/fixtures.lesson';

const meta = {
  title: 'Componentes/Aula/LessonQuizCard',
  component: LessonQuizCard,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    assertion: lessonAssertions[0],
    quiz: undefined,
    onSelect: (answerIndex: number) => console.debug('[storybook] onSelect', answerIndex),
  },
} satisfies Meta<typeof LessonQuizCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PorResponder: Story = {};

export const RespondidaCerta: Story = {
  args: { quiz: lessonQuizStateCorrect },
};

export const RespondidaErrada: Story = {
  args: { quiz: lessonQuizStateWrong },
};

export const SegundaAfirmacao: Story = {
  args: { assertion: lessonAssertions[1] },
};
