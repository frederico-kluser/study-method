/**
 * blocks/ChallengeStarsTimer.stories.tsx — `Componentes/Desafio/
 * ChallengeStarsTimer` (STORY-SPEC): as estrelas do desafio + o cronômetro
 * (máquina pura em `src/lib/challengeStars.ts`).
 */
import type { Meta, StoryObj } from '@storybook/react';
import { ChallengeStarsTimer } from './ChallengeStarsTimer';

const meta = {
  title: 'Componentes/Desafio/ChallengeStarsTimer',
  component: ChallengeStarsTimer,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    starsLeft: 3,
    totalStars: 3,
    timedOut: false,
    clockText: '03:30',
  },
  argTypes: {
    starsLeft: { control: { type: 'range', min: 0, max: 3, step: 1 } },
    timedOut: { control: 'boolean' },
    clockText: { control: 'text' },
  },
} satisfies Meta<typeof ChallengeStarsTimer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Estrelas3: Story = {};

export const Estrelas2: Story = {
  args: { starsLeft: 2, clockText: '02:14' },
};

export const Estrelas1: Story = {
  args: { starsLeft: 1, clockText: '00:58' },
};

export const Estrelas0: Story = {
  args: { starsLeft: 0, clockText: '00:12' },
};

export const TempoEsgotado: Story = {
  args: { starsLeft: 0, timedOut: true, clockText: '00:00' },
  parameters: {
    docs: {
      description: {
        story:
          'O chip vira "Tempo esgotado" (severidade error, sem ícone de relógio) — o nome ' +
          'acessível acompanha (`challenge.timedOut`).',
      },
    },
  },
};
