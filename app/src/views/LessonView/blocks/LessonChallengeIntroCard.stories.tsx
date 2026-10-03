/**
 * Componentes/Aula/LessonChallengeIntroCard — o card do desafio de abertura
 * (abaixo da bolha inicial; oferece pular direto para o desafio). Bloco puro
 * de `views/LessonView/blocks/LessonChallengeIntroCard`.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { LessonChallengeIntroCard } from './LessonChallengeIntroCard';
import { lessonChallengePassed, lessonChallengeUntried } from '../../../storybook/fixtures.lesson';

const meta = {
  title: 'Componentes/Aula/LessonChallengeIntroCard',
  component: LessonChallengeIntroCard,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    challenge: lessonChallengeUntried,
    onTryChallenge: () => console.debug('[storybook] onTryChallenge'),
  },
} satisfies Meta<typeof LessonChallengeIntroCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NuncaTentado: Story = {};

export const JáFalhou: Story = {
  args: {
    challenge: { ...lessonChallengeUntried, lastVerdict: 'failed', failedCount: 1 },
  },
};

export const VáriasFalhas: Story = {
  args: {
    challenge: { ...lessonChallengeUntried, lastVerdict: 'timeout', failedCount: 3 },
  },
};

export const VereditoSemFalhaContada: Story = {
  // 'abandoned' sem failedCount — o ramo "não passou" da linha de chips.
  args: {
    challenge: { ...lessonChallengeUntried, lastVerdict: 'abandoned' },
  },
};

export const TítuloLongo: Story = {
  args: {
    challenge: {
      ...lessonChallengePassed,
      title: 'Mostre o seu nome e a sua idade na tela, um em cada linha, sem usar mais de dois prints',
    },
  },
};
