/**
 * blocks/TrackChallengeHeader.stories.tsx — `Componentes/Desafio/
 * TrackChallengeHeader` (STORY-SPEC): o cabeçalho do desafio de trilha
 * (voltar + título + chips + estrelas + cronômetro).
 */
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { TrackChallengeHeader } from './TrackChallengeHeader';

const meta = {
  title: 'Componentes/Desafio/TrackChallengeHeader',
  component: TrackChallengeHeader,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    title: 'Desafio: converter temperatura',
    difficultyLabel: 'dificuldade 2',
    testsLabel: '3 teste(s)',
    generated: false,
    starsLeft: 3,
    timerText: '03:30',
    onBack: fn(),
  },
  argTypes: {
    starsLeft: { control: { type: 'range', min: 0, max: 3, step: 1 } },
    generated: { control: 'boolean' },
    timerText: { control: 'text' },
  },
} satisfies Meta<typeof TrackChallengeHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Estrelas3: Story = {};

export const Estrelas0RelogioQuase: Story = {
  args: { starsLeft: 0, timerText: '00:14' },
};

export const DesafioGerado: Story = {
  args: { generated: true, title: 'Desafio: arredondar temperatura' },
  parameters: {
    docs: {
      description: {
        story: 'A badge "novo desafio" aparece em `source: \'generated\'` (regenerado para o aluno).',
      },
    },
  },
};

export const TituloLongo: Story = {
  args: {
    title:
      'Desafio: converter temperaturas extremamente altas e baixas com precisão de float ' +
      'sem perder o sinal em casos negativos',
  },
  parameters: {
    docs: {
      description: { story: 'Teste de overflow: o título quebra, nunca recorta.' },
    },
  },
};
