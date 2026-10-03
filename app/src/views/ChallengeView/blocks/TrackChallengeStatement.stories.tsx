/**
 * blocks/TrackChallengeStatement.stories.tsx — `Componentes/Desafio/
 * TrackChallengeStatement` (STORY-SPEC): o ATO 1 do desafio de trilha
 * (enunciado + "Começar" — o cronômetro só começa no clique).
 */
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { TrackChallengeStatement } from './TrackChallengeStatement';

const enunciado =
  '# Converter temperatura\n\n' +
  'Escreva `para_celsius(f)` que recebe a temperatura em Fahrenheit e devolve em Celsius.\n\n' +
  'A fórmula é $c = \\frac{5}{9}(f - 32)$.\n\n' +
  '- `para_celsius(32)` deve devolver `0.0`;\n' +
  '- `para_celsius(212)` deve devolver `100.0`.\n';

const meta = {
  title: 'Componentes/Desafio/TrackChallengeStatement',
  component: TrackChallengeStatement,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    statement: enunciado,
    started: false,
    onStart: fn(),
  },
  argTypes: {
    started: { control: 'boolean', description: 'esconde o "Começar" depois do clique' },
  },
} satisfies Meta<typeof TrackChallengeStatement>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PorComecar: Story = {};

export const JaComecado: Story = {
  args: { started: true },
  parameters: {
    docs: {
      description: {
        story: 'Ato 2 em curso: o "Começar" some e o cronômetro já está a andar (fora do bloco).',
      },
    },
  },
};
