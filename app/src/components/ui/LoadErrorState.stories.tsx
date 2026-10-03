/**
 * src/components/ui/LoadErrorState.stories.tsx — Componentes/UI/LoadErrorState.
 *
 * O bloco "erro de carregamento + Tentar de novo" (auditoria de layout §3,
 * forma (a)) — 16 cópias em 12 ficheiros aposentadas. As histórias mostram o
 * estado de ERRO (é o componente inteiro), o retry em curso, o fallback de
 * copy i18n quando o chamador não tem mensagem e o conteúdo longo (a mensagem
 * quebra, nunca recorta).
 */
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';

import { LoadErrorState } from './LoadErrorState';

const meta = {
  title: 'Componentes/UI/LoadErrorState',
  component: LoadErrorState,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    message: 'Não foi possível carregar a aula.',
    loading: false,
    onRetry: fn(),
  },
  argTypes: {
    message: { control: 'text', description: 'a copy do erro — vive no chamador (traduzida)' },
    loading: { control: 'boolean', description: 'retry em curso' },
    onRetry: { action: 'retry' },
  },
} satisfies Meta<typeof LoadErrorState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Erro: Story = {};

export const Carregando: Story = {
  args: { loading: true },
  parameters: {
    docs: {
      description: {
        story: 'O botão de retry delega no `ActionButton` ocupado: desligado, `aria-busy`, spinner.',
      },
    },
  },
};

export const SemMensagem: Story = {
  args: { message: undefined },
  parameters: {
    docs: {
      description: {
        story:
          'Fallback traduzido do primitivo (`translation:ui.loadError.message`) — pt-BR/en nos dois locales.',
      },
    },
  },
};

export const ConteúdoLongo: Story = {
  args: {
    message:
      'Não foi possível carregar a aula "Fundamentos de C: ponteiros, alocação e aritmética de endereços" porque o serviço de geração não respondeu dentro do tempo limite.',
  },
};

export const ColunaEstreita: Story = {
  args: {
    width: 440,
    message: 'Não foi possível carregar o desafio.',
    retryLabel: 'Refazer desafio',
  },
};
