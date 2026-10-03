/**
 * blocks/TrackChallengeTimeoutNotices.stories.tsx — `Componentes/Desafio/
 * TrackChallengeTimeoutNotices` (STORY-SPEC): os avisos de tempo esgotado do
 * desafio de trilha (S9 — o veredito do relógio NUNCA é sobrescrito em
 * silêncio).
 */
import type { Meta, StoryObj } from '@storybook/react';
import { TrackChallengeTimeoutNotices } from './TrackChallengeTimeoutNotices';

const meta = {
  title: 'Componentes/Desafio/TrackChallengeTimeoutNotices',
  component: TrackChallengeTimeoutNotices,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    timedOut: true,
    resultArrived: false,
  },
  argTypes: {
    timedOut: { control: 'boolean' },
    resultArrived: {
      control: 'boolean',
      description: 'o submit em voo resolveu DEPOIS do estouro — a tentativa continuou',
    },
  },
} satisfies Meta<typeof TrackChallengeTimeoutNotices>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TempoEsgotado: Story = {};

export const ResultadoChegouDepois: Story = {
  args: { timedOut: true, resultArrived: true },
  parameters: {
    docs: {
      description: {
        story:
          'S9: o relógio estourou com o submit em voo e o resultado chegou depois — o resultado ' +
          'da tentativa segue visível (aviso dedicado), sem o ecrã mudar de veredito em silêncio.',
      },
    },
  },
};

export const SemAvisos: Story = {
  args: { timedOut: false, resultArrived: false },
};
