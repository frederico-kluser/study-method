/**
 * Componentes/Aula/LessonLoadErrorState — erro de carregamento da aula com
 * "Tentar de novo". Bloco puro de `views/LessonView/blocks/LessonLoadErrorState`.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { LessonLoadErrorState } from './LessonLoadErrorState';

const meta = {
  title: 'Componentes/Aula/LessonLoadErrorState',
  component: LessonLoadErrorState,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    message: 'Não foi possível carregar a aula.',
    onRetry: () => console.debug('[storybook] onRetry'),
  },
} satisfies Meta<typeof LessonLoadErrorState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Padrão: Story = {};

export const MensagemLonga: Story = {
  args: {
    message:
      'Não foi possível carregar a aula — o canal da trilha não respondeu a tempo. Verifique a ligação e tente de novo; a aula continua guardada onde parou.',
  },
};
