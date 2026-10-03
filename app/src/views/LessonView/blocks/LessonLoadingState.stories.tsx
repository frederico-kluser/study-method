/**
 * Componentes/Aula/LessonLoadingState — a espera do carregamento da aula
 * (texto visível + barra com nome acessível). Bloco puro de
 * `views/LessonView/blocks/LessonLoadingState`.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { LessonLoadingState } from './LessonLoadingState';

const meta = {
  title: 'Componentes/Aula/LessonLoadingState',
  component: LessonLoadingState,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof LessonLoadingState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Padrão: Story = {};
