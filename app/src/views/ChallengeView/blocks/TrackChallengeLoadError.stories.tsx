/**
 * blocks/TrackChallengeLoadError.stories.tsx — `Componentes/Desafio/
 * TrackChallengeLoadError` (STORY-SPEC): o erro de carga da spec do desafio
 * de trilha (primitivo `LoadErrorState` na coluna larga — auditoria §3).
 */
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { TrackChallengeLoadError } from './TrackChallengeLoadError';

const meta = {
  title: 'Componentes/Desafio/TrackChallengeLoadError',
  component: TrackChallengeLoadError,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    loadError: 'Não foi possível carregar o desafio: Error: ipc: canal mudo — ECONNRESET',
    onRetry: fn(),
  },
} satisfies Meta<typeof TrackChallengeLoadError>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ComMensagem: Story = {};

export const SemMensagemFallback: Story = {
  args: { loadError: null },
  parameters: {
    docs: {
      description: {
        story:
          'W3 (falsy-proof): só `null` cai no fallback "Desafio não encontrado na trilha." — ' +
          'uma string vazia é erro VÁLIDO e aparece como está.',
      },
    },
  },
};

export const ErroVazioValido: Story = {
  args: { loadError: '' },
};
