/**
 * blocks/ChallengeViewHeader.stories.tsx — `Componentes/Desafio/
 * ChallengeViewHeader` (STORY-SPEC): o cabeçalho da tela de Desafio (título +
 * picker de desafios do setup).
 */
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { ChallengeViewHeader, type ChallengePickerState } from './ChallengeViewHeader';

const picker: ChallengePickerState = {
  value: '0001-funcoes-reutilizaveis',
  loading: false,
  disabled: false,
  options: [
    { challengeId: '0001-funcoes-reutilizaveis', title: 'Desafio: funções reutilizáveis', language: 'python' },
    { challengeId: '0002-recursao-simples', title: 'Desafio: contagem recursiva', language: 'python' },
  ],
  onSelect: fn(),
};

const meta = {
  title: 'Componentes/Desafio/ChallengeViewHeader',
  component: ChallengeViewHeader,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    showPicker: true,
    picker,
  },
  argTypes: {
    showPicker: { control: 'boolean', description: 'escondido quando a seleção veio do contexto' },
  },
} satisfies Meta<typeof ChallengeViewHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ComPicker: Story = {};

export const SemPickerSelecaoDoContexto: Story = {
  args: { showPicker: false },
  parameters: {
    docs: {
      description: {
        story: 'Desafio selecionado via ChallengeNav (vindo da Aula) — o picker some.',
      },
    },
  },
};

export const ACarregarLista: Story = {
  args: {
    picker: { ...picker, loading: true, value: '', options: [] },
  },
};

export const SemDesafios: Story = {
  args: {
    picker: { ...picker, value: '', options: [] },
  },
};

export const DesativadoEmCorrida: Story = {
  args: {
    picker: { ...picker, disabled: true },
  },
  parameters: {
    docs: {
      description: {
        story:
          'Desabilitado durante o teste em voo (fase determinística + pi): trocar de desafio ' +
          'no meio deixaria um resultado de A caindo na tela de B.',
      },
    },
  },
};
