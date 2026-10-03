/**
 * blocks/ChallengeListStates.stories.tsx — `Componentes/Desafio/
 * ChallengeListStates` (STORY-SPEC): os estados da listagem de desafios sem
 * desafio ativo (erro com retry, vazio legítimo com CTA, convite a escolher).
 */
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { ChallengeListStates } from './ChallengeListStates';

const meta = {
  title: 'Componentes/Desafio/ChallengeListStates',
  component: ChallengeListStates,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    listing: 'error',
    listError: 'Não consegui listar os desafios: Error: ipc: canal mudo — ECONNRESET',
    hasActive: false,
    onRetry: fn(),
    onGoToLesson: fn(),
  },
  argTypes: {
    listing: {
      control: 'radio',
      options: ['idle', 'loading', 'error', 'empty'],
    },
    hasActive: { control: 'boolean' },
  },
} satisfies Meta<typeof ChallengeListStates>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ErroComRetry: Story = {};

export const VazioLegitimo: Story = {
  args: { listing: 'empty' },
  parameters: {
    docs: {
      description: {
        story:
          'ONDA-UX-VAZIO: a lista vazia NÃO é erro — é informativa e o CTA leva à aba "Aula" ' +
          '(quem quer desafio gera uma aula primeiro).',
      },
    },
  },
};

export const ConviteAEscolher: Story = {
  args: { listing: 'idle', listError: '' },
};

export const ACarregar: Story = {
  args: { listing: 'loading', listError: '' },
};

export const ComDesafioAtivo: Story = {
  args: { hasActive: true },
  parameters: {
    docs: {
      description: { story: 'Com desafio em cena nenhum destes estados renderiza.' },
    },
  },
};
