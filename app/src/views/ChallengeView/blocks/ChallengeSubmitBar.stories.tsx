/**
 * blocks/ChallengeSubmitBar.stories.tsx — `Componentes/Desafio/
 * ChallengeSubmitBar` (STORY-SPEC): a barra de ação pegajosa (W13) — "Testar
 * resposta" sempre alcançável + "Abortar" durante a corrida.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { ChallengeSubmitBar } from './ChallengeSubmitBar';

const meta = {
  title: 'Componentes/Desafio/ChallengeSubmitBar',
  component: ChallengeSubmitBar,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    canTest: true,
    busy: false,
    testSignal: 'idle',
    onTest: fn(),
    onAbort: fn(),
  },
  argTypes: {
    canTest: { control: 'boolean' },
    busy: { control: 'boolean', description: 'fase em voo (spinner + Abortar ligado)' },
  },
} satisfies Meta<typeof ChallengeSubmitBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pronto: Story = {};

export const EmCorrida: Story = {
  args: { canTest: false, busy: true, testSignal: 'running' },
  parameters: {
    docs: {
      description: {
        story:
          '`loading` + `loadingPosition="start"`: o spinner entra em LINHA e o label "Testar ' +
          'resposta" fica visível o tempo todo (nunca o botão vazio do loading central).',
      },
    },
  },
};

export const SemDesafio: Story = {
  args: { canTest: false, busy: false },
  parameters: {
    docs: {
      description: {
        story: 'Sem desafio ativo, os dois botões estão desligados (o Abortar só vale em corrida).',
      },
    },
  },
};
