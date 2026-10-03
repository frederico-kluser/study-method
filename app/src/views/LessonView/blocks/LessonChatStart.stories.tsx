/**
 * Componentes/Aula/LessonChatStart — o convite de abertura do chat da aula
 * (bolha inicial + "Começar aula" + card do desafio). Bloco puro de
 * `views/LessonView/blocks/LessonChatStart`.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { LessonChatStart } from './LessonChatStart';
import { lessonChallengeUntried } from '../../../storybook/fixtures.lesson';

const meta = {
  title: 'Componentes/Aula/LessonChatStart',
  component: LessonChatStart,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    busy: false,
    onStart: () => console.debug('[storybook] onStart'),
    challenge: lessonChallengeUntried,
    onTryChallenge: () => console.debug('[storybook] onTryChallenge'),
  },
  argTypes: {
    busy: { control: 'boolean' },
    challenge: { control: 'object' },
  },
} satisfies Meta<typeof LessonChatStart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ComDesafio: Story = {};

export const SemDesafio: Story = {
  args: { challenge: null },
};

export const Ocupado: Story = {
  args: { busy: true },
};

export const DesafioJáTentado: Story = {
  args: {
    challenge: { ...lessonChallengeUntried, lastVerdict: 'failed', failedCount: 1 },
  },
};
