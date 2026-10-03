/**
 * blocks/TrackChallengeMastery.stories.tsx — `Componentes/Desafio/
 * TrackChallengeMastery` (STORY-SPEC): a análise de domínio do desafio do
 * MÓDULO (o que a tentativa demonstrou × o que resta refazer).
 */
import type { Meta, StoryObj } from '@storybook/react';
import { TrackChallengeMastery } from './TrackChallengeMastery';
import { fixtureTrackMastery } from '../../../storybook/fixtures.challenge';

const meta = {
  title: 'Componentes/Desafio/TrackChallengeMastery',
  component: TrackChallengeMastery,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: { mastery: fixtureTrackMastery },
} satisfies Meta<typeof TrackChallengeMastery>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DemonstradasEReazer: Story = {};

export const TudoDemonstrado: Story = {
  args: {
    mastery: {
      ...fixtureTrackMastery,
      lessons: fixtureTrackMastery.lessons.map((l) => ({ ...l, dominada: true, alreadyDone: false })),
      refazer: [],
    },
  },
};

export const NadaDemonstrado: Story = {
  args: {
    mastery: {
      ...fixtureTrackMastery,
      marcadas: [],
      lessons: fixtureTrackMastery.lessons.map((l) => ({ ...l, dominada: false, alreadyDone: false })),
      refazer: ['aula-1', 'aula-2', 'aula-3'],
    },
  },
};

export const SemRelatorio: Story = {
  args: { mastery: null },
  parameters: {
    docs: {
      description: {
        story:
          'Sem `mastery` (erro de análise, alvo não-module) o bloco não renderiza — o veredito ' +
          'continua sendo o do runner.',
      },
    },
  },
};
